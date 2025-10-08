import 'reflect-metadata';
import { NextRequest, NextResponse } from 'next/server';
import { ChatOpenAI } from '@langchain/openai';
import { SqlDatabase } from 'langchain/sql_db';
import { createSqlAgent, SqlToolkit } from 'langchain/agents/toolkits/sql';
import { DataSource } from 'typeorm';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: NextRequest) {
  try {
    const payload = await req.json();
    const messages = Array.isArray(payload?.messages) ? payload.messages : [];

    if (!Array.isArray(messages) || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided' }, { status: 400 });
    }

    // Use OPENAI_API_KEY from env (which contains OpenRouter key)
    const apiKey = process.env.OPENAI_API_KEY || process.env.OPENROUTER_API_KEY;
    const databaseUrl = process.env.DATABASE_URL;

    if (!apiKey || !databaseUrl) {
      return NextResponse.json({ error: 'Missing configuration' }, { status: 500 });
    }

    // Get the latest user message
    const userMessage = messages[messages.length - 1]?.content || '';
    
    // Build conversation history for context (excluding the latest message)
    // Limit to last 4 messages (2 exchanges) to prevent exceeding token limits
    const recentMessages = messages.slice(Math.max(0, messages.length - 5), -1);
    const chatHistory = recentMessages.map(msg => 
      `${msg.role === 'user' ? 'Human' : 'Assistant'}: ${msg.content}`
    ).join('\n\n');

    // Create database connection
    const datasource = new DataSource({
      type: 'postgres',
      url: databaseUrl,
    });

    await datasource.initialize();

    const db = await SqlDatabase.fromDataSourceParams({
      appDataSource: datasource,
      includesTables: ['ma_contracts', 'ma_metrics', 'ma_plan_landscape', 'summary_ratings', 'ma_plan_enrollment'],
    });

    // Create LLM - Using ChatOpenAI class but pointing to OpenRouter API
    // This works because OpenRouter is OpenAI-compatible
    const llm = new ChatOpenAI({
      modelName: 'openai/gpt-4o-mini', // OpenRouter model identifier
      temperature: 0,
      apiKey: apiKey, // Using OpenRouter API key from OPENAI_API_KEY env var
      configuration: {
        baseURL: 'https://openrouter.ai/api/v1', // Point to OpenRouter, not OpenAI
        defaultHeaders: {
          'HTTP-Referer': 'https://thrillsync.com',
          'X-Title': 'Medicare Advantage Analytics',
        },
      },
    });

    // Create SQL toolkit and agent with iteration limits
    const toolkit = new SqlToolkit(db, llm);
    const executor = createSqlAgent(llm, toolkit, {
      topK: 20,
      prefix: `You are a SQL expert analyzing Medicare Advantage data. Execute queries directly without explaining your reasoning.

Available tables:
- ma_contracts: Contract metadata (contract_id, contract_name, organization_marketing_name, year)
- ma_metrics: Performance metrics (contract_id, year, metric_code, metric_label, rate_percent, star_rating)
- ma_plan_landscape: Plan details (contract_id, plan_id, plan_name, overall_star_rating, year)
- summary_ratings: Contract-level star ratings (contract_id, year, overall_rating_numeric)
- ma_plan_enrollment: Enrollment data (contract_id, plan_id, year, month, enrollment_count)

Query guidelines:
- For year-over-year comparisons, use self-joins on contract_id and metric_code
- Use ILIKE for case-insensitive text searches
- Limit results to 10-20 rows unless requested otherwise
- Order results by relevance (e.g., largest changes, highest ratings)

Output format:
1. Brief summary (1-2 sentences)
2. Markdown table with results
3. Key insights (if applicable)

Example:
**Summary:** Found 15 contracts with breast cancer screening improvements.

| Contract ID | 2024 Rate | 2025 Rate | Change |
|-------------|-----------|-----------|--------|
| H7379       | 63%       | 77%       | +14%   |

**Key Insight:** Average improvement was 8.5%.

CRITICAL RULES:
- Write and execute SQL immediately - don't explain what you're going to do
- If query fails, fix it once and return results
- Present data in markdown tables
- Keep responses concise

Previous conversation:
${chatHistory || 'No previous messages'}`,
    });

    // Configure iteration limits to prevent infinite loops
    executor.maxIterations = 5;
    executor.earlyStoppingMethod = 'generate';

    // Execute the agent
    let result;
    try {
      result = await executor.invoke({ 
        input: userMessage,
        chat_history: chatHistory 
      });
    } catch (error: unknown) {
      // Handle max iterations error
      if (error instanceof Error && error.message.includes('Agent stopped due to max iterations')) {
        await datasource.destroy();
        return NextResponse.json({
          message: {
            role: 'assistant',
            content: 'I apologize, but I encountered difficulty processing your request efficiently. This usually happens with complex queries. Could you try:\n\n1. Breaking down your question into smaller parts\n2. Being more specific about what data you need\n3. Specifying exact column names or filters\n\nWhat would you like to know?',
          },
        });
      }
      
      // If there's a parsing error but we have output, use it anyway
      if (error instanceof Error && error.message.includes('Could not parse LLM output:')) {
        const outputMatch = error.message.match(/Could not parse LLM output: ([\s\S]*?)(?:\n\nTroubleshooting|$)/);
        if (outputMatch && outputMatch[1]) {
          await datasource.destroy();
          return NextResponse.json({
            message: {
              role: 'assistant',
              content: outputMatch[1].trim(),
            },
          });
        }
      }
      throw error;
    }

    await datasource.destroy();

    return NextResponse.json({
      message: {
        role: 'assistant',
        content: result.output || 'No response generated',
      },
    });
  } catch (error) {
    console.error('Chat SQL error:', error);
    return NextResponse.json(
      {
        error: 'Failed to process request',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
