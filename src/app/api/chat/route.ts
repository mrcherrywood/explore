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

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const messages = Array.isArray(payload?.messages) ? payload.messages : [];

  if (!Array.isArray(messages) || messages.length === 0) {
    return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
  }

  const system = `You are a helpful assistant for a Medicare Advantage analytics workspace.\n\n` +
    `You have access to these PostgreSQL database tables:\n` +
    `- ma_contracts: Contract metadata (contract_id TEXT, contract_name TEXT, organization_marketing_name TEXT, parent_organization TEXT, organization_type TEXT, snp_indicator TEXT, year INTEGER)\n` +
    `- ma_metrics: Performance metrics (contract_id TEXT, year INTEGER, metric_category TEXT, metric_code TEXT, metric_label TEXT, star_rating TEXT, rate_percent NUMERIC, value_text TEXT, value_numeric NUMERIC, value_unit TEXT)\n` +
    `- ma_plan_landscape: Plan details (contract_id TEXT, plan_id TEXT, plan_name TEXT, plan_type TEXT, overall_star_rating TEXT, county_name TEXT, state_abbreviation TEXT, state_name TEXT, part_c_premium NUMERIC, part_d_total_premium NUMERIC, special_needs_plan_indicator TEXT, year INTEGER)\n` +
    `- summary_ratings: Contract-level star ratings (contract_id TEXT, year INTEGER, overall_rating TEXT, overall_rating_numeric NUMERIC, part_c_summary TEXT, part_c_summary_numeric NUMERIC, part_d_summary TEXT, part_d_summary_numeric NUMERIC, organization_marketing_name TEXT, parent_organization TEXT)\n` +
    `- ma_plan_enrollment: Enrollment data (contract_id TEXT, plan_id TEXT, year INTEGER, month INTEGER, enrollment_count INTEGER, state_code TEXT, county_name TEXT)\n\n` +
    `TOOLS AVAILABLE:\n` +
    `1. \`execute_sql\` - Write custom SQL queries for complex analysis (JOINs, aggregations, year-over-year comparisons, etc.). Use this for most analytical questions.\n` +
    `2. \`query_data\` - Simple table queries with filters. Use only for basic single-table lookups.\n` +
    `3. \`get_contract_overview\` - Get comprehensive contract details. Use for specific contract deep-dives.\n\n` +
    `For year-over-year comparisons, use execute_sql with self-joins. Example:\n` +
    `SELECT a.contract_id, a.plan_id, a.metric_label, a.rate_percent as rate_2024, b.rate_percent as rate_2025, (b.rate_percent - a.rate_percent) as change FROM ma_metrics a JOIN ma_metrics b ON a.contract_id = b.contract_id AND a.plan_id = b.plan_id AND a.metric_code = b.metric_code WHERE a.year = 2024 AND b.year = 2025 AND a.metric_label ILIKE '%breast cancer%' ORDER BY ABS(b.rate_percent - a.rate_percent) DESC LIMIT 20;\n\n` +
    `Never fabricate database content—only summarize what the tools return.\n\n` +
    `CHARTS: Only create a chart if the user specifically requests one (e.g., "show me a chart", "visualize", "graph"). When creating a chart, return a fenced code block containing JSON with this shape:\n` +
    "```json\n" +
    JSON.stringify({ title: "Chart Title", type: "line", xKey: "year", series: [{ key: "value", name: "Series Name" }], data: [{ year: "2024", value: 100 }] }, null, 2) +
    "\n```\n" +
    `Chart types: line, bar, area, pie. Otherwise, provide clear text summaries with tables when appropriate.`;

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
        name: 'execute_sql',
        description: 'Execute a custom SQL query on the PostgreSQL database. Use this for complex analysis including JOINs, aggregations, year-over-year comparisons, rankings, and calculations. Returns up to 1000 rows.',
        parameters: {
          type: 'object',
          properties: {
            sql: {
              type: 'string',
              description: 'The SQL query to execute. Must be a SELECT statement only (no INSERT, UPDATE, DELETE, DROP, etc.).',
            },
            description: {
              type: 'string',
              description: 'Brief description of what this query does (for logging).',
            },
          },
          required: ['sql'],
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'query_data',
        description: 'Simple table query with equality filters. Use only for basic single-table lookups. For complex queries, use execute_sql instead.',

        parameters: {
          type: 'object',
          properties: {
            table: {
              type: 'string',
              enum: ['ma_contracts', 'ma_metrics', 'ma_plan_landscape', 'summary_ratings', 'ma_plan_enrollment'],
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
    {
      type: 'function',
      function: {
        name: 'get_contract_overview',
        description: 'Fetch comprehensive Medicare Advantage contract details, metrics, and plan landscape rows for a specific contract ID and year. Use this when you need detailed contract information.',
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

  const maxToolIterations = 6;

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
      // No more tool calls, return the response
      return NextResponse.json({
        message: {
          role: 'assistant',
          content: aiMessage.content ?? '',
        },
      });
    }

    for (const call of toolCalls) {
      let toolResult;
      console.log(`Executing tool: ${call.function.name}`);
      if (call.function.name === 'execute_sql') {
        toolResult = await handleExecuteSQL({ call, supabase });
      } else if (call.function.name === 'query_data') {
        toolResult = await handleQueryData({ call, supabase });
      } else {
        toolResult = await handleGetContractOverview({ call, supabase });
      }
      console.log(`Tool result:`, toolResult);
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

async function handleExecuteSQL({
  call,
  supabase,
}: {
  call: ToolCall;
  supabase: ReturnType<typeof createServiceRoleClient>;
}) {
  const { function: fn } = call;

  let args: {
    sql?: string;
    description?: string;
  } = {};

  try {
    args = fn.arguments ? JSON.parse(fn.arguments) : {};
  } catch {
    return { error: 'Invalid arguments for execute_sql' };
  }

  const { sql, description } = args;

  if (!sql || typeof sql !== 'string') {
    return { error: 'sql parameter is required and must be a string' };
  }

  // Security: Only allow SELECT statements
  const trimmedSQL = sql.trim().toLowerCase();
  if (!trimmedSQL.startsWith('select')) {
    return { error: 'Only SELECT queries are allowed' };
  }

  // Block dangerous keywords
  const dangerousKeywords = ['drop', 'delete', 'insert', 'update', 'alter', 'create', 'truncate', 'grant', 'revoke'];
  for (const keyword of dangerousKeywords) {
    if (trimmedSQL.includes(keyword)) {
      return { error: `Dangerous keyword detected: ${keyword}. Only SELECT queries are allowed.` };
    }
  }

  try {
    console.log('Executing SQL:', { description, sql });

    // Use Supabase client to call the RPC function
    // @ts-expect-error - Custom RPC function not in generated types
    const { data, error } = await supabase.rpc('exec_raw_sql', { query: sql });

    if (error) {
      console.error('SQL execution failed', { 
        sql, 
        error: error.message,
        code: error.code,
        details: error.details,
        hint: error.hint 
      });
      return {
        error: 'SQL execution failed',
        details: `${error.message}${error.hint ? ` (Hint: ${error.hint})` : ''}`,
        code: error.code,
        sql_query: sql,
      };
    }

    // The function returns JSON, parse it if it's a string
    const resultData = typeof data === 'string' ? JSON.parse(data) : data;

    return {
      success: true,
      description,
      row_count: Array.isArray(resultData) ? resultData.length : 0,
      data: resultData ?? [],
      sql_query: sql,
    };
  } catch (error) {
    console.error('SQL execution error', error);
    return {
      error: 'SQL execution failed',
      details: error instanceof Error ? error.message : 'Unknown error',
      sql_query: sql,
    };
  }
}

async function handleQueryData({
  call,
  supabase,
}: {
  call: ToolCall;
  supabase: ReturnType<typeof createServiceRoleClient>;
}) {
  const { function: fn } = call;

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

  const validTables = ['ma_contracts', 'ma_metrics', 'ma_plan_landscape', 'summary_ratings', 'ma_plan_enrollment'];
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

async function handleGetContractOverview({
  call,
  supabase,
}: {
  call: ToolCall;
  supabase: ReturnType<typeof createServiceRoleClient>;
}) {
  const { function: fn } = call;

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
