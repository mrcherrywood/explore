import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import * as path from "path";

// Align with existing import scripts by loading `.env.local` first
dotenv.config({ path: path.join(process.cwd(), ".env.local") });

type Period = {
  report_year: number;
  report_month: number;
};

type SummaryRow = {
  total_enrollment_rows: number;
  missing_state_rows: number;
  total_contracts: number;
  contracts_with_missing_states: number;
};

type ContractRow = {
  contract_id: string;
  missing_rows: number;
  total_rows: number;
  missing_pct: number;
  plan_types: string | null;
};

type SampleRow = {
  contract_id: string;
  enrollment_plan_id: string | null;
  landscape_plan_id: string | null;
  enrollment_plan_type: string | null;
  enrollment: number | null;
};

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("Missing Supabase environment variables");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

function parseCliArg(name: string): string | undefined {
  const prefix = `--${name}=`;
  const arg = process.argv.find((value) => value.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : undefined;
}

async function getLatestPeriod(): Promise<Period | null> {
  const { data, error } = await supabase
    .from("ma_plan_enrollment")
    .select("report_year, report_month")
    .order("report_year", { ascending: false })
    .order("report_month", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data ?? null;
}

async function fetchSummary(period: Period): Promise<SummaryRow | null> {
  const summaryQuery = `
    SELECT
      COUNT(*) FILTER (WHERE pe.enrollment IS NOT NULL) AS total_enrollment_rows,
      COUNT(*) FILTER (WHERE pe.enrollment IS NOT NULL AND pl.state_abbreviation IS NULL) AS missing_state_rows,
      COUNT(DISTINCT pe.contract_id) FILTER (WHERE pe.enrollment IS NOT NULL) AS total_contracts,
      COUNT(DISTINCT CASE WHEN pl.state_abbreviation IS NULL THEN pe.contract_id END) AS contracts_with_missing_states
    FROM ma_plan_enrollment pe
    LEFT JOIN ma_plan_landscape pl
      ON pl.contract_id = pe.contract_id
     AND pl.plan_id = pe.plan_id
    WHERE pe.report_year = ${period.report_year}
      AND pe.report_month = ${period.report_month}
      AND pe.contract_id LIKE 'H%'
      AND pe.enrollment IS NOT NULL
  `;

  const { data, error } = await supabase.rpc("exec_raw_sql", { query: summaryQuery });

  if (error) {
    throw error;
  }

  const row = Array.isArray(data) && data.length > 0 ? (data[0] as SummaryRow) : null;
  if (!row) {
    return null;
  }

  return {
    total_enrollment_rows: Number(row.total_enrollment_rows ?? 0),
    missing_state_rows: Number(row.missing_state_rows ?? 0),
    total_contracts: Number(row.total_contracts ?? 0),
    contracts_with_missing_states: Number(row.contracts_with_missing_states ?? 0),
  };
}

async function fetchTopContracts(period: Period): Promise<ContractRow[]> {
  const contractQuery = `
    SELECT
      pe.contract_id,
      SUM(CASE WHEN pl.state_abbreviation IS NULL THEN 1 ELSE 0 END) AS missing_rows,
      COUNT(*) AS total_rows,
      ROUND(
        CASE
          WHEN COUNT(*) = 0 THEN 0
          ELSE SUM(CASE WHEN pl.state_abbreviation IS NULL THEN 1 ELSE 0 END)::numeric * 100 / COUNT(*)
        END,
        2
      ) AS missing_pct,
      STRING_AGG(DISTINCT pe.plan_type, ', ' ORDER BY pe.plan_type) AS plan_types
    FROM ma_plan_enrollment pe
    LEFT JOIN ma_plan_landscape pl
      ON pl.contract_id = pe.contract_id
     AND pl.plan_id = pe.plan_id
    WHERE pe.report_year = ${period.report_year}
      AND pe.report_month = ${period.report_month}
      AND pe.contract_id LIKE 'H%'
      AND pe.enrollment IS NOT NULL
    GROUP BY pe.contract_id
    HAVING SUM(CASE WHEN pl.state_abbreviation IS NULL THEN 1 ELSE 0 END) > 0
    ORDER BY missing_rows DESC, pe.contract_id ASC
    LIMIT 25
  `;

  const { data, error } = await supabase.rpc("exec_raw_sql", { query: contractQuery });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => ({
    contract_id: String(row.contract_id ?? ""),
    missing_rows: Number(row.missing_rows ?? 0),
    total_rows: Number(row.total_rows ?? 0),
    missing_pct: Number(row.missing_pct ?? 0),
    plan_types: row.plan_types ?? null,
  }));
}

async function fetchSamples(period: Period): Promise<SampleRow[]> {
  const sampleQuery = `
    SELECT
      pe.contract_id,
      pe.plan_id AS enrollment_plan_id,
      pl.plan_id AS landscape_plan_id,
      pe.plan_type AS enrollment_plan_type,
      pe.enrollment
    FROM ma_plan_enrollment pe
    LEFT JOIN ma_plan_landscape pl
      ON pl.contract_id = pe.contract_id
     AND pl.plan_id = pe.plan_id
    WHERE pe.report_year = ${period.report_year}
      AND pe.report_month = ${period.report_month}
      AND pe.contract_id LIKE 'H%'
      AND pe.enrollment IS NOT NULL
      AND pl.state_abbreviation IS NULL
    ORDER BY pe.contract_id, pe.plan_id
    LIMIT 25
  `;

  const { data, error } = await supabase.rpc("exec_raw_sql", { query: sampleQuery });

  if (error) {
    throw error;
  }

  if (!Array.isArray(data)) {
    return [];
  }

  return data.map((row) => ({
    contract_id: String(row.contract_id ?? ""),
    enrollment_plan_id: row.enrollment_plan_id ?? null,
    landscape_plan_id: row.landscape_plan_id ?? null,
    enrollment_plan_type: row.enrollment_plan_type ?? null,
    enrollment: row.enrollment === null || row.enrollment === undefined ? null : Number(row.enrollment),
  }));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

async function main() {
  try {
    const yearArg = parseCliArg("year");
    const monthArg = parseCliArg("month");

    let period: Period | null = null;
    if (yearArg && monthArg) {
      const year = Number.parseInt(yearArg, 10);
      const month = Number.parseInt(monthArg, 10);
      if (Number.isFinite(year) && Number.isFinite(month)) {
        period = { report_year: year, report_month: month };
      }
    }

    if (!period) {
      period = await getLatestPeriod();
    }

    if (!period) {
      console.error("Could not determine enrollment period");
      process.exit(1);
    }

    console.log("🔎 Analyzing plan landscape matches for:", `${period.report_year}-${String(period.report_month).padStart(2, "0")}`);

    const summary = await fetchSummary(period);
    if (!summary) {
      console.log("No enrollment data found for the selected period.");
      return;
    }

    console.log("\n=== Summary ===");
    console.log("Total enrollment rows:", formatNumber(summary.total_enrollment_rows));
    console.log("Rows missing state match:", formatNumber(summary.missing_state_rows));
    console.log("Contracts represented:", formatNumber(summary.total_contracts));
    console.log("Contracts with missing states:", formatNumber(summary.contracts_with_missing_states));

    const topContracts = await fetchTopContracts(period);
    if (topContracts.length) {
      console.log("\n=== Contracts with missing landscape states ===");
      topContracts.forEach((contract) => {
        const pctLabel = `${contract.missing_pct.toFixed(2)}%`;
        console.log(
          `• ${contract.contract_id}: missing ${formatNumber(contract.missing_rows)} of ${formatNumber(contract.total_rows)} rows (${pctLabel})` +
            (contract.plan_types ? ` | Plan types: ${contract.plan_types}` : "")
        );
      });
    } else {
      console.log("\nNo contracts with missing landscape state matches found.");
    }

    const samples = await fetchSamples(period);
    if (samples.length) {
      console.log("\n=== Sample enrollment rows without state matches ===");
      samples.forEach((sample) => {
        console.log(
          `• ${sample.contract_id} | Enrollment plan ID: ${sample.enrollment_plan_id ?? "<null>"} | ` +
            `Landscape plan ID: ${sample.landscape_plan_id ?? "<null>"} | ` +
            `Plan type: ${sample.enrollment_plan_type ?? "<unknown>"} | ` +
            `Enrollment: ${sample.enrollment ?? "<null>"}`
        );
      });
    }
  } catch (error) {
    console.error("❌ Unexpected error while analyzing landscape data:", error);
    process.exit(1);
  }
}

main();
