import type { Database } from "@/lib/supabase/database.types";

export type TableName = keyof Database["public"]["Tables"];

export type TableColumnConfig = {
  key: string;
  label: string;
  numeric?: boolean;
};

export type TableConfig = {
  name: TableName;
  label: string;
  description: string;
  columns: TableColumnConfig[];
  defaultSort?: { column: string; ascending: boolean };
  searchableColumns: string[];
};

export const TABLE_CONFIGS: TableConfig[] = [
  {
    name: "ma_contracts",
    label: "MA Contracts",
    description: "Contract metadata including parent organization and SNP indicators.",
    columns: [
      { key: "contract_id", label: "Contract ID" },
      { key: "contract_name", label: "Contract Name" },
      { key: "organization_marketing_name", label: "Marketing Name" },
      { key: "parent_organization", label: "Parent Org" },
      { key: "organization_type", label: "Type" },
      { key: "snp_indicator", label: "SNP" },
      { key: "year", label: "Year" },
    ],
    defaultSort: { column: "year", ascending: false },
    searchableColumns: ["contract_id", "contract_name", "organization_marketing_name", "parent_organization"],
  },
  {
    name: "ma_metrics",
    label: "MA Metrics",
    description: "Metric values by contract, including star ratings and benchmarks.",
    columns: [
      { key: "year", label: "Year" },
      { key: "contract_id", label: "Contract ID" },
      { key: "metric_label", label: "Measure Name" },
      { key: "star_rating", label: "Stars" },
      { key: "rate_percent", label: "Rate/Percent", numeric: true },
    ],
    defaultSort: { column: "year", ascending: false },
    searchableColumns: ["contract_id", "metric_category", "metric_code", "metric_label", "star_rating"],
  },
  {
    name: "ma_plan_landscape",
    label: "MA Plan Landscape",
    description: "Plan availability, premiums, ratings, and SNP characteristics by county.",
    columns: [
      { key: "contract_id", label: "Contract ID" },
      { key: "plan_id", label: "Plan ID" },
      { key: "plan_name", label: "Plan Name" },
      { key: "plan_type", label: "Type" },
      { key: "overall_star_rating", label: "Stars" },
      { key: "county_name", label: "County" },
      { key: "state_abbreviation", label: "State" },
      { key: "part_c_premium", label: "Part C Premium" },
      { key: "part_d_total_premium", label: "Part D Premium" },
      { key: "special_needs_plan_indicator", label: "SNP" },
      { key: "year", label: "Year" },
    ],
    defaultSort: { column: "year", ascending: false },
    searchableColumns: [
      "contract_id",
      "plan_id",
      "plan_name",
      "plan_type",
      "county_name",
      "state_abbreviation",
      "special_needs_plan_indicator",
    ],
  },
  {
    name: "ma_measures",
    label: "MA Measures",
    description: "Measure definitions and aliases for scoring methodologies.",
    columns: [
      { key: "code", label: "Code" },
      { key: "name", label: "Name" },
      { key: "alias", label: "Alias" },
      { key: "year", label: "Year" },
      { key: "created_at", label: "Created At" },
    ],
    defaultSort: { column: "year", ascending: false },
    searchableColumns: ["code", "name", "alias"],
  },
];

export const TABLE_CONFIG_BY_NAME = new Map(
  TABLE_CONFIGS.map((config) => [config.name, config])
);

export const DEFAULT_TABLE = TABLE_CONFIGS[0]?.name ?? "ma_contracts";
