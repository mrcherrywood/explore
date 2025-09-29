export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      ma_contracts: {
        Row: {
          contract_id: string
          created_at: string | null
          organization_marketing_name: string | null
          organization_type: string | null
          parent_organization: string | null
          snp_indicator: string | null
          contract_name: string | null
          year: number
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          organization_marketing_name?: string | null
          organization_type?: string | null
          parent_organization?: string | null
          snp_indicator?: string | null
          contract_name?: string | null
          year: number
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          organization_marketing_name?: string | null
          organization_type?: string | null
          parent_organization?: string | null
          snp_indicator?: string | null
          contract_name?: string | null
          year?: number
        }
      }
      ma_measures: {
        Row: {
          alias: string | null
          code: string
          created_at: string | null
          name: string | null
          year: number
        }
        Insert: {
          alias?: string | null
          code: string
          created_at?: string | null
          name?: string | null
          year: number
        }
        Update: {
          alias?: string | null
          code?: string
          created_at?: string | null
          name?: string | null
          year?: number
        }
      }
      ma_metrics: {
        Row: {
          contract_id: string
          created_at: string | null
          id: string
          metric_category: string
          metric_code: string
          metric_label: string | null
          rate_percent: number | null
          source_file: string | null
          star_rating: string | null
          value_numeric: number | null
          value_text: string | null
          value_unit: string | null
          year: number
        }
        Insert: {
          contract_id: string
          created_at?: string | null
          id?: string
          metric_category: string
          metric_code: string
          metric_label?: string | null
          rate_percent?: number | null
          source_file?: string | null
          star_rating?: string | null
          value_numeric?: number | null
          value_text?: string | null
          value_unit?: string | null
          year: number
        }
        Update: {
          contract_id?: string
          created_at?: string | null
          id?: string
          metric_category?: string
          metric_code?: string
          metric_label?: string | null
          rate_percent?: number | null
          source_file?: string | null
          star_rating?: string | null
          value_numeric?: number | null
          value_text?: string | null
          value_unit?: string | null
          year?: number
        }
      }
      ma_plan_landscape: {
        Row: {
          annual_part_d_deductible_amount: string | null
          contract_category_type: string | null
          contract_id: string
          county_name: string | null
          created_at: string | null
          c_snp_condition_type: string | null
          d_snp_aip_identifier: string | null
          d_snp_integration_status: string | null
          drug_benefit_category: string | null
          drug_benefit_type: string | null
          id: string
          in_network_moop_amount: string | null
          low_income_premium_subsidy_amount: string | null
          low_income_subsidy_auto_enrollment: string | null
          ma_region: string | null
          ma_region_code: string | null
          medicare_zero_dollar_cost_sharing: string | null
          monthly_consolidated_premium: string | null
          national_pdp: string | null
          offers_drug_tier_no_deductible: string | null
          organization_marketing_name: string | null
          organization_type: string | null
          overall_star_rating: string | null
          parent_organization_name: string | null
          part_c_premium: string | null
          part_c_summary_star_rating: string | null
          part_d_basic_premium: string | null
          part_d_basic_premium_at_or_below_benchmark: string | null
          part_d_coverage_indicator: string | null
          part_d_lips_cms_pays: string | null
          part_d_low_income_beneficiary_premium_amount: string | null
          part_d_out_of_pocket_threshold: string | null
          part_d_supplemental_premium: string | null
          part_d_summary_star_rating: string | null
          part_d_total_premium: string | null
          plan_id: string
          plan_name: string | null
          plan_type: string | null
          sanctioned_plan: string | null
          segment_id: string | null
          snp_institutional_type: string | null
          snp_type: string | null
          special_needs_plan_indicator: string | null
          source_file: string | null
          state_abbreviation: string | null
          state_name: string | null
          unique_key: string | null
          voluntary_de_minimis_participant: string | null
          year: number
          pdp_region_code: string | null
          pdp_region: string | null
        }
        Insert: {
          annual_part_d_deductible_amount?: string | null
          contract_category_type?: string | null
          contract_id: string
          county_name?: string | null
          created_at?: string | null
          c_snp_condition_type?: string | null
          d_snp_aip_identifier?: string | null
          d_snp_integration_status?: string | null
          drug_benefit_category?: string | null
          drug_benefit_type?: string | null
          id?: string
          in_network_moop_amount?: string | null
          low_income_premium_subsidy_amount?: string | null
          low_income_subsidy_auto_enrollment?: string | null
          ma_region?: string | null
          ma_region_code?: string | null
          medicare_zero_dollar_cost_sharing?: string | null
          monthly_consolidated_premium?: string | null
          national_pdp?: string | null
          offers_drug_tier_no_deductible?: string | null
          organization_marketing_name?: string | null
          organization_type?: string | null
          overall_star_rating?: string | null
          parent_organization_name?: string | null
          part_c_premium?: string | null
          part_c_summary_star_rating?: string | null
          part_d_basic_premium?: string | null
          part_d_basic_premium_at_or_below_benchmark?: string | null
          part_d_coverage_indicator?: string | null
          part_d_lips_cms_pays?: string | null
          part_d_low_income_beneficiary_premium_amount?: string | null
          part_d_out_of_pocket_threshold?: string | null
          part_d_supplemental_premium?: string | null
          part_d_summary_star_rating?: string | null
          part_d_total_premium?: string | null
          plan_id: string
          plan_name?: string | null
          plan_type?: string | null
          sanctioned_plan?: string | null
          segment_id?: string | null
          snp_institutional_type?: string | null
          snp_type?: string | null
          special_needs_plan_indicator?: string | null
          source_file?: string | null
          state_abbreviation?: string | null
          state_name?: string | null
          unique_key?: string | null
          voluntary_de_minimis_participant?: string | null
          year: number
          pdp_region_code?: string | null
          pdp_region?: string | null
        }
        Update: {
          annual_part_d_deductible_amount?: string | null
          contract_category_type?: string | null
          contract_id?: string
          county_name?: string | null
          created_at?: string | null
          c_snp_condition_type?: string | null
          d_snp_aip_identifier?: string | null
          d_snp_integration_status?: string | null
          drug_benefit_category?: string | null
          drug_benefit_type?: string | null
          id?: string
          in_network_moop_amount?: string | null
          low_income_premium_subsidy_amount?: string | null
          low_income_subsidy_auto_enrollment?: string | null
          ma_region?: string | null
          ma_region_code?: string | null
          medicare_zero_dollar_cost_sharing?: string | null
          monthly_consolidated_premium?: string | null
          national_pdp?: string | null
          offers_drug_tier_no_deductible?: string | null
          organization_marketing_name?: string | null
          organization_type?: string | null
          overall_star_rating?: string | null
          parent_organization_name?: string | null
          part_c_premium?: string | null
          part_c_summary_star_rating?: string | null
          part_d_basic_premium?: string | null
          part_d_basic_premium_at_or_below_benchmark?: string | null
          part_d_coverage_indicator?: string | null
          part_d_lips_cms_pays?: string | null
          part_d_low_income_beneficiary_premium_amount?: string | null
          part_d_out_of_pocket_threshold?: string | null
          part_d_supplemental_premium?: string | null
          part_d_summary_star_rating?: string | null
          part_d_total_premium?: string | null
          plan_id?: string
          plan_name?: string | null
          plan_type?: string | null
          sanctioned_plan?: string | null
          segment_id?: string | null
          snp_institutional_type?: string | null
          snp_type?: string | null
          special_needs_plan_indicator?: string | null
          source_file?: string | null
          state_abbreviation?: string | null
          state_name?: string | null
          unique_key?: string | null
          voluntary_de_minimis_participant?: string | null
          year?: number
          pdp_region_code?: string | null
          pdp_region?: string | null
        }
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
    }
  }
}
