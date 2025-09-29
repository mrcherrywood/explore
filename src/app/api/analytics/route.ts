import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

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

function hasValidChartSpec(markdown: string | null): boolean {
  if (!markdown) return false;

  const fence = /```(chart|json)[\r\n]+([\s\S]*?)```/m;
  const match = markdown.match(fence);
  if (!match) return false;

  try {
    const parsed = JSON.parse(match[2]);
    const { type, xKey, series, data } = parsed ?? {};

    const hasRequiredFields =
      (type === 'line' || type === 'bar' || type === 'area' || type === 'pie') &&
      typeof xKey === 'string' &&
      Array.isArray(series) &&
      Array.isArray(data);

    return hasRequiredFields;
  } catch {
    return false;
  }
}

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];
  const selectedVariables = Array.isArray(payload?.selectedVariables) ? payload.selectedVariables : [];

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  // Parse selected variables into a readable format
  const variablesList = selectedVariables.map((v: string) => {
    const [table, column] = v.split('.');
    return { table, column };
  });

  const variablesContext = variablesList.length > 0
    ? `\n\nThe user has selected these variables to analyze:\n${variablesList.map((v: { table: string; column: string }) => `- ${v.table}.${v.column}`).join('\n')}`
    : '\n\nThe user has not selected any specific variables yet. Suggest they select variables from the selector above.';

  const system = `You are an AI analytics assistant for a Medicare Advantage data platform.\n\n` +
    `You have access to these database tables:\n` +
    `- ma_contracts: Contract metadata (contract_id, contract_name, organization_marketing_name, parent_organization, organization_type, snp_indicator, year)\n` +
    `- ma_metrics: Performance metrics (contract_id, year, metric_category, metric_code, metric_label, star_rating, rate_percent)\n` +
    `- ma_plan_landscape: Plan details (contract_id, plan_id, plan_name, plan_type, overall_star_rating, county_name, state_abbreviation, part_c_premium, part_d_total_premium, special_needs_plan_indicator, year)\n` +
    `- ma_measures: Measure definitions (code, name, alias, year)\n\n` +
    variablesContext + `\n\n` +
    `Use the \`query_data\` tool to fetch data from the database based on the user's request and selected variables.\n\n` +
    `IMPORTANT: You MUST include a chart in every response. When you want to include a chart, return a fenced code block containing JSON with this shape:\n` +
    "```json\n" +
    JSON.stringify({ 
      title: "Chart Title", 
      type: "line", 
      xKey: "year", 
      series: [{ key: "value", name: "Series Name" }], 
      data: [{ year: "2024", value: 100 }] 
    }, null, 2) +
    "\n```\n" +
    `Chart types: line, bar, area, pie. Always provide a brief explanation with the chart.`;

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
    return NextResponse.json({ 
      error: error instanceof Error ? error.message : 'Failed to initialise Supabase client' 
    }, { status: 500 });
  }

  const tools = [
    {
      type: 'function',
      function: {
        name: 'query_data',
        description: 'Query the Medicare Advantage database. Fetch data for analysis, charts, or comparisons.',
        parameters: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['ma_contracts', 'ma_metrics', 'ma_plan_landscape', 'ma_measures'],
              description: 'The table to query.',
            },
            columns: {
              type: 'array',
              items: { type: 'string' },
              description: 'Columns to select. Use ["*"] for all columns.',
            },
            filters: {
              type: 'object',
              description: 'Filters to apply (e.g., {"year": 2024, "contract_id": "H0028"})',
            },
            order_by: {
              type: 'string',
              description: 'Column to sort by (e.g., "year")',
            },
            ascending: {
              type: 'boolean',
              description: 'Sort order (default: true)',
            },
            limit: {
              type: 'integer',
              description: 'Maximum number of rows to return (default: 100, max: 1000)',
              minimum: 1,
              maximum: 1000,
            },
          },
          required: ['table', 'columns'],
        },
      },
    },
  ];

  const conversation: ChatMessage[] = [
    { role: 'system', content: system },
    ...(messages as ChatMessage[]),
  ];

  const maxToolIterations = 5;
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
        temperature: 0.3,
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

  if (fn.name !== 'query_data') {
    return { error: `Unknown tool ${fn.name}` };
  }

  let args: {
    table?: string;
    columns?: string[];
    filters?: Record<string, unknown>;
    order_by?: string;
    ascending?: boolean;
    limit?: number;
  } = {};

  try {
    args = fn.arguments ? JSON.parse(fn.arguments) : {};
  } catch {
    return { error: 'Invalid arguments for query_data' };
  }

  const { table, columns, filters, order_by, ascending = true, limit = 100 } = args;

  if (!table || !columns || !Array.isArray(columns)) {
    return { error: 'table and columns are required' };
  }

  const validTables = ['ma_contracts', 'ma_metrics', 'ma_plan_landscape', 'ma_measures'];
  if (!validTables.includes(table)) {
    return { error: `Invalid table: ${table}` };
  }

  try {
    let query = supabase.from(table).select(columns.join(', '));

    if (filters && typeof filters === 'object') {
      for (const [key, value] of Object.entries(filters)) {
        if (value !== null && value !== undefined) {
          query = query.eq(key, value);
        }
      }
    }

    if (order_by) {
      query = query.order(order_by, { ascending });
    }

    const finalLimit = Math.min(Math.max(limit, 1), 1000);
    query = query.limit(finalLimit);

    const response = await query;

    if (response.error) {
      console.error('Supabase query failed', {
        table,
        columns,
        filters,
        error: response.error,
      });
      return {
        error: 'Database query failed',
        details: response.error.message,
      };
    }

    return {
      success: true,
      table,
      row_count: response.data?.length ?? 0,
      data: response.data ?? [],
    };
  } catch (error) {
    console.error('Query execution error', error);
    return {
      error: 'Query execution failed',
      details: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
