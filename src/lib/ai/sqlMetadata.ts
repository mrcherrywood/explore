export const schemaMetadata = {
  dialect: "postgres",
  defaultSchema: "public",
  tables: [
    {
      name: "ma_contracts",
      description: "Medicare Advantage contract metadata",
      columns: [
        { name: "contract_id", type: "text" },
        { name: "year", type: "integer" },
        { name: "contract_name", type: "text" },
        { name: "organization_marketing_name", type: "text" },
        { name: "parent_organization", type: "text" },
        { name: "organization_type", type: "text" },
        { name: "snp_indicator", type: "text" }
      ]
    },
    {
      name: "ma_metrics",
      description: "Performance metrics including star ratings, complaints, and other measures",
      columns: [
        { name: "contract_id", type: "text" },
        { name: "plan_id", type: "text" },
        { name: "year", type: "integer" },
        { name: "metric_category", type: "text" },
        { name: "metric_code", type: "text" },
        { name: "metric_label", type: "text" },
        { name: "star_rating", type: "text" },
        { name: "rate_percent", type: "numeric" },
        { name: "value_text", type: "text" },
        { name: "value_numeric", type: "numeric" },
        { name: "value_unit", type: "text" }
      ]
    },
    {
      name: "ma_plan_landscape",
      description: "Plan-level details including plan type, rating, geography, and premiums",
      columns: [
        { name: "contract_id", type: "text" },
        { name: "plan_id", type: "text" },
        { name: "plan_name", type: "text" },
        { name: "plan_type", type: "text" },
        { name: "segment_id", type: "text" },
        { name: "overall_star_rating", type: "text" },
        { name: "county_name", type: "text" },
        { name: "state_abbreviation", type: "text" },
        { name: "state_name", type: "text" },
        { name: "part_c_premium", type: "numeric" },
        { name: "part_d_total_premium", type: "numeric" },
        { name: "special_needs_plan_indicator", type: "text" }
      ]
    },
    {
      name: "summary_ratings",
      description: "Contract-level summary ratings for Part C and Part D",
      columns: [
        { name: "contract_id", type: "text" },
        { name: "year", type: "integer" },
        { name: "overall_rating", type: "text" },
        { name: "overall_rating_numeric", type: "numeric" },
        { name: "part_c_summary", type: "text" },
        { name: "part_c_summary_numeric", type: "numeric" },
        { name: "part_d_summary", type: "text" },
        { name: "part_d_summary_numeric", type: "numeric" },
        { name: "organization_marketing_name", type: "text" },
        { name: "parent_organization", type: "text" }
      ]
    },
    {
      name: "ma_plan_enrollment",
      description: "Enrollment data by contract, plan, year, and geography",
      columns: [
        { name: "contract_id", type: "text" },
        { name: "plan_id", type: "text" },
        { name: "year", type: "integer" },
        { name: "month", type: "integer" },
        { name: "enrollment_count", type: "integer" },
        { name: "state_code", type: "text" },
        { name: "county_name", type: "text" }
      ]
    }
  ]
} as const;
