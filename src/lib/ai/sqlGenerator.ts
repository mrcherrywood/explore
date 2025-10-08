import { createOpenAI } from "@ai-sdk/openai";
import { generateObject } from "ai";
import { z } from "zod";
import { schemaMetadata } from "@/lib/ai/sqlMetadata";

export type SqlGenerationMetadata = {
  rephrasedQuestion?: string;
  intentReasoning?: string;
  reasoning?: string;
  tables?: string[];
};

export type SqlGenerationSuccess = {
  status: "success";
  sql: string;
  metadata?: SqlGenerationMetadata;
};

export type SqlGenerationFallback = {
  status: "fallback";
  reason?: string;
  metadata?: SqlGenerationMetadata;
};

export type SqlGenerationResult = SqlGenerationSuccess | SqlGenerationFallback;

export class SqlGenerationError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message);
    this.name = "SqlGenerationError";
  }
}

const responseSchema = z.object({
  rephrasedQuestion: z.string().trim().optional(),
  intentReasoning: z.string().trim().optional(),
  sqlReasoning: z.string().trim().optional(),
  tables: z.array(z.string().trim()).optional(),
  sql: z.string().optional(),
  fallback: z.boolean().optional(),
  fallbackReason: z.string().trim().optional(),
});

function buildSchemaContext() {
  return schemaMetadata.tables
    .map((table) => {
      const columns = table.columns.map((column) => `${column.name} (${column.type})`).join(", ");
      return `Table ${table.name}: ${table.description}. Columns: ${columns}`;
    })
    .join("\n");
}

function getModel(modelName: string) {
  const apiKey = process.env.OPENROUTER_API_KEY ?? process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new SqlGenerationError("Missing OPENROUTER_API_KEY or OPENAI_API_KEY for SQL generation");
  }

  const baseURL = process.env.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1";
  const client = createOpenAI({ apiKey, baseURL });
  return client(modelName);
}

function toMetadata(payload: z.infer<typeof responseSchema>): SqlGenerationMetadata | undefined {
  const rephrasedQuestion = payload.rephrasedQuestion?.trim();
  const intentReasoning = payload.intentReasoning?.trim();
  const reasoning = payload.sqlReasoning?.trim();
  const tables = payload.tables?.map((name) => name.trim()).filter(Boolean);

  if (!rephrasedQuestion && !intentReasoning && !reasoning && (!tables || tables.length === 0)) {
    return undefined;
  }

  return {
    rephrasedQuestion,
    intentReasoning,
    reasoning,
    tables,
  } satisfies SqlGenerationMetadata;
}

export async function generateSqlFromPrompt(
  prompt: string,
  options?: { model?: string }
): Promise<SqlGenerationResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    throw new SqlGenerationError("Cannot generate SQL without a user prompt");
  }

  const schemaContext = buildSchemaContext();
  const model = getModel(options?.model ?? "gpt-4o-mini");

  try {
    const { object } = await generateObject({
      model,
      schema: responseSchema,
      prompt: [
        "You are an experienced Medicare Advantage data analyst.",
        "You write safe, efficient SQL SELECT queries for a PostgreSQL database.",
        "Return JSON that matches the expected schema.",
        "If the request cannot be fulfilled with the available tables, set fallback to true and explain why.",
        "Always produce SELECT statements only. Do not modify data.",
        "Prefer CTEs and clear column aliases when helpful. Include LIMIT 200 unless the query already limits rows.",
        "Database schema:",
        schemaContext,
        "User question:",
        trimmedPrompt,
      ].join("\n\n"),
    });

    const parsed = responseSchema.safeParse(object);
    if (!parsed.success) {
      throw new SqlGenerationError("Model returned an unexpected response shape", parsed.error);
    }

    const metadata = toMetadata(parsed.data);
    const sql = parsed.data.sql?.trim();

    if (parsed.data.fallback || !sql) {
      return {
        status: "fallback",
        reason: parsed.data.fallbackReason ?? (sql ? undefined : "Model did not provide SQL"),
        metadata,
      } satisfies SqlGenerationFallback;
    }

    return {
      status: "success",
      sql,
      metadata,
    } satisfies SqlGenerationSuccess;
  } catch (error) {
    if (error instanceof SqlGenerationError) {
      throw error;
    }
    throw new SqlGenerationError("Failed to generate SQL from prompt", error);
  }
}
