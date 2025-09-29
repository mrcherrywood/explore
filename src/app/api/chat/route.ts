import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export const runtime = 'nodejs';

type ChatMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_call_id?: string;
};

type ToolCall = {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
};

type ChartSpecCandidate = {
  type: unknown;
  xKey: unknown;
  series: unknown;
  data: unknown;
};

function hasValidChartSpec(markdown: string | null): boolean {
  if (!markdown) return false;

  const fence = /```(chart|json)[\r\n]+([\s\S]*?)```/m;
  const match = markdown.match(fence);
  if (!match) return false;

  try {
    const parsed = JSON.parse(match[2]) as ChartSpecCandidate;
    const { type, xKey, series, data } = parsed ?? {};

    const hasRequiredFields =
      (type === 'line' || type === 'bar' || type === 'area' || type === 'pie') &&
      typeof xKey === 'string' &&
      Array.isArray(series) &&
      Array.isArray(data);

    if (!hasRequiredFields) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  const system = `You are a helpful assistant for a Medicare Advantage analytics workspace.\n\n` +
    `Call the \`get_contract_overview\` tool to retrieve contract metadata, metrics, and plan landscape rows from Supabase. ` +
    `Never fabricate database content—only summarize what the tool returns.\n\n` +
    `When you want to include a chart, return a fenced code block containing JSON with this shape:\n` +
    "```json\n" +
    JSON.stringify({ title: "optional", type: "line", xKey: "date", series: [{ key: "value", name: "Series" }], data: [{ date: "2024-01-01", value: 10 }] }, null, 2) +
    "\n```\n" +
    `Always also provide a short explanation above or below the chart.`;

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 });
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    return NextResponse.json({ error: 'Missing Supabase configuration' }, { status: 500 });
  }

  let supabase;
  try {
    supabase = createServiceRoleClient();
  } catch (error) {
    console.error('Failed to initialise Supabase client', error);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Failed to initialise Supabase client' }, { status: 500 });
  }

  const tools = [
    {
      type: 'function',
      function: {
        name: 'get_contract_overview',
        description: 'Fetch Medicare Advantage contract details, metrics, and plan landscape rows for a given contract ID and year.',
        parameters: {
          type: 'object',
          properties: {
            contract_id: {
              type: 'string',
              description: 'MA contract ID (e.g., H0028).',
            },
            year: {
              type: 'integer',
              description: 'Optional contract year to filter on. Defaults to the latest available year.',
            },
            metric_category: {
              type: 'string',
              description: 'Optional metric category filter (e.g., Star Ratings, Enrollment).',
            },
            plan_limit: {
              type: 'integer',
              description: 'Optional limit for plan landscape rows (default 20, max 100).',
              minimum: 1,
              maximum: 100,
            },
          },
          required: ['contract_id'],
        },
      },
    },
  ];

  const conversation: ChatMessage[] = [
    { role: 'system', content: system },
    ...(messages as ChatMessage[]),
  ];

  const maxToolIterations = 4;
  const chartRequirementReminder =
    'Reminder: every response must include a fenced code block ( ```json ... ``` ) containing a valid chart spec with keys { type, xKey, series, data } and a short explanation. Regenerate your last response with the required chart.';

  for (let iteration = 0; iteration < maxToolIterations; iteration += 1) {
    const completionResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: conversation,
        temperature: 0.2,
        tools,
      }),
    });

    if (!completionResp.ok) {
      const text = await completionResp.text();
      if (completionResp.status === 401) {
        console.error('OpenRouter authentication failed. Check API key configuration.', text);
        return NextResponse.json(
          {
            error: 'OpenRouter authentication failed. Please verify OPENROUTER_API_KEY is set and valid.',
          },
          { status: 500 }
        );
      }
      return NextResponse.json({ error: text }, { status: 500 });
    }

    const completionData = await completionResp.json();
    const aiMessage = completionData?.choices?.[0]?.message as
      | (ChatMessage & { tool_calls?: ToolCall[] })
      | undefined;

    if (!aiMessage) {
      return NextResponse.json({ error: 'No message received from model' }, { status: 500 });
    }

    conversation.push(aiMessage);

    const toolCalls = aiMessage.tool_calls ?? [];
    if (!toolCalls.length) {
      const content = aiMessage.content ?? '';
      if (!hasValidChartSpec(content)) {
        conversation.push({ role: 'system', content: chartRequirementReminder });
        continue;
      }
      return NextResponse.json({
        message: {
          role: 'assistant',
          content: aiMessage.content ?? '',
        },
      });
    }

    for (const call of toolCalls) {
      const toolResult = await handleToolCall({ call, supabase });
      conversation.push({
        role: 'tool',
        tool_call_id: call.id,
        content: JSON.stringify(toolResult),
      });
    }
  }

  return NextResponse.json({
    message: {
      role: 'assistant',
      content: 'Unable to complete request after multiple tool attempts.',
    },
  });
}

async function handleToolCall({
  call,
  supabase,
}: {
  call: ToolCall;
  supabase: ReturnType<typeof createServiceRoleClient>;
}) {
  const { function: fn } = call;

  if (fn.name !== 'get_contract_overview') {
    return { error: `Unknown tool ${fn.name}` };
  }

  let args: {
    contract_id?: string;
    year?: number;
    metric_category?: string;
    plan_limit?: number;
  } = {};
  try {
    args = fn.arguments ? JSON.parse(fn.arguments) : {};
  } catch {
    return { error: 'Invalid arguments for get_contract_overview' };
  }

  const contractId = args.contract_id?.trim();

  if (!contractId) {
    return { error: 'contract_id is required' };
  }

  const yearFilter = typeof args.year === 'number' && Number.isFinite(args.year) ? args.year : undefined;

  const contractYearsResponse = await supabase
    .from('ma_contracts')
    .select('year')
    .eq('contract_id', contractId)
    .order('year', { ascending: false });

  const contractYears = contractYearsResponse.data as { year: number | null }[] | null;
  const contractYearsError = contractYearsResponse.error;

  if (contractYearsError) {
    console.error('Supabase contract year query failed', {
      contractId,
      error: {
        message: contractYearsError.message,
        code: 'code' in contractYearsError ? contractYearsError.code : undefined,
        details: 'details' in contractYearsError ? contractYearsError.details : undefined,
        hint: 'hint' in contractYearsError ? contractYearsError.hint : undefined,
      },
    });

    return {
      error: 'Supabase contract year query failed',
      details: {
        message: contractYearsError.message,
        code: 'code' in contractYearsError ? contractYearsError.code : undefined,
        details: 'details' in contractYearsError ? contractYearsError.details : undefined,
        hint: 'hint' in contractYearsError ? contractYearsError.hint : undefined,
      },
    };
  }

  const availableYears = (contractYears ?? [])
    .map((row) => row.year)
    .filter((year): year is number => typeof year === 'number')
    .sort((a, b) => b - a);

  let yearsToFetch: number[] = [];
  if (yearFilter !== undefined) {
    yearsToFetch = availableYears.includes(yearFilter) ? [yearFilter] : [];
  } else {
    yearsToFetch = availableYears.slice(0, 2);
  }

  if (yearsToFetch.length === 0) {
    return {
      contract: null,
      metrics: [],
      plan_landscape: [],
      available_years: availableYears,
      warning: `No contract rows found for ${contractId}${yearFilter ? ` in ${yearFilter}` : ''}.`,
    };
  }

  const contractResponse = await supabase
    .from('ma_contracts')
    .select(
      `contract_id, year, contract_name, organization_type, organization_marketing_name, parent_organization, snp_indicator`
    )
    .eq('contract_id', contractId)
    .in('year', yearsToFetch)
    .order('year', { ascending: false });

  const contracts = contractResponse.data as Database['public']['Tables']['ma_contracts']['Row'][] | null;
  const contractError = contractResponse.error;

  if (contractError) {
    console.error('Supabase contract query failed', {
      contractId,
      years: yearsToFetch,
      error: {
        message: contractError.message,
        code: 'code' in contractError ? contractError.code : undefined,
        details: 'details' in contractError ? contractError.details : undefined,
        hint: 'hint' in contractError ? contractError.hint : undefined,
      },
    });

    return {
      error: 'Supabase contract query failed',
      details: {
        message: contractError.message,
        code: 'code' in contractError ? contractError.code : undefined,
        details: 'details' in contractError ? contractError.details : undefined,
        hint: 'hint' in contractError ? contractError.hint : undefined,
      },
    };
  }

  if (!contracts || contracts.length === 0) {
    return {
      contract: null,
      contracts_by_year: [],
      metrics: [],
      plan_landscape: [],
      available_years: availableYears,
      warning: `No contract rows found for ${contractId}${yearFilter ? ` in ${yearFilter}` : ''}.`,
    };
  }

  const contract = contracts[0];
  const resolvedYears = yearsToFetch;

  let metricsQuery = supabase
    .from('ma_metrics')
    .select('year, metric_category, metric_code, metric_label, value_text, value_numeric, value_unit')
    .eq('contract_id', contractId)
    .order('year', { ascending: false })
    .order('metric_category', { ascending: true })
    .order('metric_code', { ascending: true });

  if (resolvedYears.length === 1) {
    metricsQuery = metricsQuery.eq('year', resolvedYears[0]);
  } else {
    metricsQuery = metricsQuery.in('year', resolvedYears);
  }

  if (args.metric_category) {
    metricsQuery = metricsQuery.eq('metric_category', args.metric_category);
  }

  const metricsResponse = await metricsQuery;
  const metrics = metricsResponse.data as Database['public']['Tables']['ma_metrics']['Row'][] | null;
  const metricsError = metricsResponse.error;

  if (metricsError) {
    console.error('Supabase metrics query failed', {
      contractId,
      years: resolvedYears,
      metricCategory: args.metric_category,
      error: {
        message: metricsError.message,
        code: 'code' in metricsError ? metricsError.code : undefined,
        details: 'details' in metricsError ? metricsError.details : undefined,
        hint: 'hint' in metricsError ? metricsError.hint : undefined,
      },
    });
  }

  const planLimit = Math.min(Math.max(args.plan_limit ?? 20, 1), 100);

  let planLandscapeQuery = supabase
    .from('ma_plan_landscape')
    .select('year, plan_id, plan_name, segment_id, county_name, state_abbreviation, state_name, plan_type, overall_star_rating, part_c_premium, part_d_total_premium, special_needs_plan_indicator, pdp_region_code, pdp_region')
    .eq('contract_id', contractId)
    .order('year', { ascending: false })
    .order('plan_name', { ascending: true })
    .limit(planLimit * resolvedYears.length);

  if (resolvedYears.length === 1) {
    planLandscapeQuery = planLandscapeQuery.eq('year', resolvedYears[0]);
  } else {
    planLandscapeQuery = planLandscapeQuery.in('year', resolvedYears);
  }

  const planLandscapeResponse = await planLandscapeQuery;

  const planLandscape = planLandscapeResponse.data as Database['public']['Tables']['ma_plan_landscape']['Row'][] | null;
  const planError = planLandscapeResponse.error;

  if (planError) {
    console.error('Supabase plan landscape query failed', {
      contractId,
      years: resolvedYears,
      error: {
        message: planError.message,
        code: 'code' in planError ? planError.code : undefined,
        details: 'details' in planError ? planError.details : undefined,
        hint: 'hint' in planError ? planError.hint : undefined,
      },
    });
  }

  return {
    contract,
    contracts_by_year: contracts,
    available_years: availableYears,
    years_returned: resolvedYears,
    metrics: metrics ?? [],
    plan_landscape: planLandscape ?? [],
    warnings: [metricsError?.message, planError?.message].filter(Boolean),
  };
}
