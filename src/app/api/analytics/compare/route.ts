import { NextRequest, NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';

export const runtime = 'nodejs';

export async function POST(req: NextRequest) {
  const payload = await req.json();
  const { contracts, measures, years } = payload;

  if (!Array.isArray(contracts) || contracts.length === 0) {
    return NextResponse.json({ error: 'Contracts are required' }, { status: 400 });
  }

  if (!Array.isArray(measures) || measures.length === 0) {
    return NextResponse.json({ error: 'Measures are required' }, { status: 400 });
  }

  if (!Array.isArray(years) || years.length === 0) {
    return NextResponse.json({ error: 'Years are required' }, { status: 400 });
  }

  const openRouterApiKey = process.env.OPENROUTER_API_KEY;
  if (!openRouterApiKey) {
    return NextResponse.json({ error: 'Missing OPENROUTER_API_KEY' }, { status: 500 });
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

  // Fetch metrics data
  try {
    const { data: metricsData, error: metricsError } = await supabase
      .from('ma_metrics')
      .select('year, contract_id, metric_code, metric_label, rate_percent, star_rating')
      .in('year', years.map(Number))
      .in('contract_id', contracts)
      .in('metric_code', measures)
      .order('year', { ascending: true })
      .order('contract_id', { ascending: true });

    if (metricsError) {
      console.error('Supabase query failed', metricsError);
      return NextResponse.json({ 
        error: 'Failed to fetch metrics data',
        details: metricsError.message 
      }, { status: 500 });
    }

    // Fetch measure names for better context
    const { data: measuresData } = await supabase
      .from('ma_measures')
      .select('code, name')
      .in('code', measures);

    const measureNames = new Map(
      (measuresData || []).map((m: { code: string; name: string }) => [m.code, m.name])
    );

    const aiPrompt = `You are analyzing Medicare Advantage performance data. The user wants to compare:
- Contracts: ${contracts.join(', ')}
- Measures: ${measures.map((code: string) => measureNames.get(code) || code).join(', ')}
- Years: ${years.join(', ')}

Here is the data (${metricsData?.length || 0} rows):
${JSON.stringify(metricsData, null, 2)}

IMPORTANT DATA NOTES:
- Each row has both "rate_percent" (numeric performance value) and "star_rating" (1-5 stars)
- Use rate_percent for detailed numeric comparisons
- Include star_rating information in your analysis and summary
- Star ratings are categorical (1, 2, 3, 4, 5 stars) and represent overall performance tiers

Your task:
1. Create 1-2 BAR CHARTS that visualize BOTH the numeric rates AND star ratings
   - ALWAYS use "bar" type charts for contract comparisons
   - First chart: Grouped bar chart showing rate_percent by contract and year
   - Optional second chart: Star rating distribution if relevant
   - Use contract_id as the xKey, with year as different series
2. Write a concise summary (3-5 sentences) that mentions:
   - Numeric performance trends (rate_percent)
   - Star rating achievements
   - Key differences between contracts
   - Notable improvements or declines

Return your response as JSON with this structure:
{
  "charts": [
    {
      "type": "bar",
      "title": "Performance Rates by Contract (2024-2025)",
      "xKey": "contract",
      "series": [{"key": "2024", "name": "2024"}, {"key": "2025", "name": "2025"}],
      "data": [{"contract": "H0028", "2024": 85.5, "2025": 87.2}, {"contract": "H0029", "2024": 82.1, "2025": 83.4}, ...]
    }
  ],
  "summary": "Your markdown-formatted summary mentioning both rates and star ratings..."
}

IMPORTANT:
- Always mention star ratings in your summary
- Use rate_percent values for chart data (they're more precise)
- Format numeric values properly
- Keep chart titles descriptive`;

    const completionResp = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openRouterApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a data analyst specializing in Medicare Advantage metrics. Always respond with valid JSON.',
          },
          {
            role: 'user',
            content: aiPrompt,
          },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
    });

    if (!completionResp.ok) {
      const text = await completionResp.text();
      console.error('OpenRouter API failed', text);
      return NextResponse.json({ 
        error: 'AI analysis failed',
        details: text 
      }, { status: 500 });
    }

    const completionData = await completionResp.json();
    const aiMessage = completionData?.choices?.[0]?.message?.content;

    if (!aiMessage) {
      return NextResponse.json({ error: 'No response from AI' }, { status: 500 });
    }

    let result;
    try {
      result = JSON.parse(aiMessage);
    } catch {
      return NextResponse.json({ 
        error: 'Invalid AI response format',
        details: aiMessage 
      }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Comparison generation failed', error);
    return NextResponse.json({ 
      error: 'Failed to generate comparison',
      details: error instanceof Error ? error.message : 'Unknown error' 
    }, { status: 500 });
  }
}
