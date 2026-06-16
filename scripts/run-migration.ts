/**
 * Apply a SQL migration file against the Postgres database (Supabase) using the
 * DATABASE_URL connection string.
 *
 * Usage:
 *   npm run migrate -- migrations/014_add_forecast_dataset_type.sql
 */

import { readFileSync } from "node:fs";
import path from "node:path";

import * as dotenv from "dotenv";
import { Client } from "pg";

dotenv.config({ path: path.join(process.cwd(), ".env.local") });

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("Missing DATABASE_URL in .env.local.");
  process.exit(1);
}

const migrationArg = process.argv[2];
if (!migrationArg) {
  console.error("Usage: npm run migrate -- <path-to-migration.sql>");
  process.exit(1);
}

async function runMigration() {
  const migrationPath = path.isAbsolute(migrationArg)
    ? migrationArg
    : path.join(process.cwd(), migrationArg);
  const sql = readFileSync(migrationPath, "utf8");

  const client = new Client({
    connectionString: databaseUrl,
    ssl: { rejectUnauthorized: false },
  });

  console.log(`🚀 Applying ${migrationArg}...\n`);
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(sql);
    await client.query("COMMIT");
    console.log("✅ Migration applied successfully.");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

runMigration().catch((error) => {
  console.error("❌ Migration failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
