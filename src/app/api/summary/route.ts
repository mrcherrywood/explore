import { NextResponse } from 'next/server';
import { createServiceRoleClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/supabase/database.types';

export const dynamic = 'force-dynamic';

type MAMetric = Database['public']['Tables']['ma_metrics']['Row'];
type MAContract = Database['public']['Tables']['ma_contracts']['Row'];
type MAPlanLandscape = Database['public']['Tables']['ma_plan_landscape']['Row'];
type SummaryRating = Database['public']['Tables']['summary_ratings']['Row'];
type MAPlanEnrollment = Database['public']['Tables']['ma_plan_enrollment']['Row'];
type MAMeasure = Database['public']['Tables']['ma_measures']['Row'];
type MADisenrollment = Database['public']['Tables']['ma_disenrollment']['Row'];

type MACAI = {
  id: string;
  contract_id: string;
  year: number;
  organization_marketing_name: string | null;
  contract_name: string | null;
  parent_organization: string | null;
  puerto_rico_only: boolean | null;
  part_c_fac: number | null;
  part_d_ma_pd_fac: number | null;
  part_d_pdp_fac: number | null;
  overall_fac: number | null;
  cai_value: number | null;
  source_file: string | null;
  created_at: string;
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const yearParam = searchParams.get('year');
    const contractIdParam = searchParams.get('contractId');

    const supabase = createServiceRoleClient();

    // Resolve target year, defaulting to latest available in metrics if not provided
    let resolvedYear: number | undefined;
    if (yearParam) {
      const parsedYear = Number.parseInt(yearParam, 10);
      if (Number.isFinite(parsedYear)) {
        resolvedYear = parsedYear;
      }
    }

    if (resolvedYear === undefined) {
      const { data: latestYearData } = await supabase
        .from('ma_metrics')
        .select('year')
        .order('year', { ascending: false })
        .limit(1)
        .single();

      resolvedYear = (latestYearData as { year: number } | null)?.year ?? new Date().getFullYear();
    }

    const year = resolvedYear;

    // Resolve contract ID, defaulting to the first contract for the year if unspecified
    let resolvedContractId = contractIdParam?.trim();
    if (!resolvedContractId) {
      const { data: firstContract } = await supabase
        .from('ma_contracts')
        .select('contract_id')
        .eq('year', year)
        .order('contract_id', { ascending: true })
        .limit(1)
        .single();

      resolvedContractId = (firstContract as { contract_id: string } | null)?.contract_id?.trim();
    }

    if (!resolvedContractId) {
      return NextResponse.json({ error: 'No contracts found' }, { status: 404 });
    }

    const contractId = resolvedContractId;

    // Fetch contract details
    const { data: contractData, error: contractError } = await supabase
      .from('ma_contracts')
      .select('*')
      .eq('contract_id', contractId)
      .eq('year', year)
      .single();

    if (contractError) {
      throw new Error(contractError.message);
    }

    const contract = (contractData as MAContract | null);

    if (!contract) {
      return NextResponse.json({ error: 'Contract not found for specified year' }, { status: 404 });
    }

    // Fetch all metrics for this contract
    const { data: metrics } = await supabase
      .from('ma_metrics')
      .select('*')
      .eq('contract_id', contractId)
      .eq('year', year);

    // Calculate overall star rating statistics
    const typedMetrics = (metrics || []) as MAMetric[];
    const starMetrics = typedMetrics.filter(m => m.star_rating);
    const starValues = starMetrics
      .map(m => parseFloat(m.star_rating || '0'))
      .filter(v => !isNaN(v) && v > 0);
    
    const avgStarRating = starValues.length > 0
      ? starValues.reduce((a, b) => a + b, 0) / starValues.length
      : 0;

    const starDistribution = starValues.reduce((acc, val) => {
      const rounded = Math.round(val);
      acc[rounded] = (acc[rounded] || 0) + 1;
      return acc;
    }, {} as Record<number, number>);

    // Find highest and lowest performing measures (by star rating)
    const sortedByStars = [...starMetrics].sort((a, b) => {
      const aVal = parseFloat(a.star_rating || '0');
      const bVal = parseFloat(b.star_rating || '0');
      return bVal - aVal;
    });

    const highestPerforming = sortedByStars.slice(0, 5).map(m => ({
      metric_label: m.metric_label,
      metric_code: m.metric_code,
      star_rating: m.star_rating,
      rate_percent: m.rate_percent,
      metric_category: m.metric_category,
    }));

    const lowestPerforming = sortedByStars.slice(-5).reverse().map(m => ({
      metric_label: m.metric_label,
      metric_code: m.metric_code,
      star_rating: m.star_rating,
      rate_percent: m.rate_percent,
      metric_category: m.metric_category,
    }));

    // Fetch measure metadata to get domain and weight information
    const { data: measures } = await supabase
      .from('ma_measures')
      .select('code, domain, weight')
      .eq('year', year);

    const typedMeasures = (measures || []) as MAMeasure[];
    const measureMap = new Map(
      typedMeasures.map(m => [m.code, { domain: m.domain, weight: m.weight }])
    );

    // Calculate domain stars using weighted average
    const domainStarsMap = new Map<string, { totalWeightedStars: number; totalWeight: number; count: number }>();
    const ratingTotals: Record<'overall' | 'partC' | 'partD', { weighted: number; weight: number }> = {
      overall: { weighted: 0, weight: 0 },
      partC: { weighted: 0, weight: 0 },
      partD: { weighted: 0, weight: 0 },
    };
    const qualityImprovementCodes = new Set(['C27', 'D04']);
    const qualityImprovementMetrics: Array<{ code: string; weight: number; starValue: number; category: string | null }> = [];
    
    for (const metric of starMetrics) {
      const measureInfo = measureMap.get(metric.metric_code);
      if (!measureInfo?.domain) continue;

      const weight = measureInfo.weight;
      if (weight === null || weight === undefined || !Number.isFinite(weight) || weight <= 0) {
        continue;
      }
      
      const starValue = parseFloat(metric.star_rating || '0');
      if (isNaN(starValue) || starValue <= 0) continue;

      const domain = measureInfo.domain;

      if (!domainStarsMap.has(domain)) {
        domainStarsMap.set(domain, { totalWeightedStars: 0, totalWeight: 0, count: 0 });
      }

      const domainData = domainStarsMap.get(domain)!;
      domainData.totalWeightedStars += starValue * weight;
      domainData.totalWeight += weight;
      domainData.count += 1;

      ratingTotals.overall.weighted += starValue * weight;
      ratingTotals.overall.weight += weight;

      const category = metric.metric_category?.trim();
      if (category === 'Part C') {
        ratingTotals.partC.weighted += starValue * weight;
        ratingTotals.partC.weight += weight;
      } else if (category === 'Part D') {
        ratingTotals.partD.weighted += starValue * weight;
        ratingTotals.partD.weight += weight;
      }

      if (qualityImprovementCodes.has(metric.metric_code)) {
        qualityImprovementMetrics.push({
          code: metric.metric_code,
          weight,
          starValue,
          category: category ?? null,
        });
      }
    }

    const domainStars = Array.from(domainStarsMap.entries())
      .map(([domain, data]) => ({
        domain,
        averageStars: data.totalWeight > 0 ? data.totalWeightedStars / data.totalWeight : 0,
        measureCount: data.count,
      }))
      .sort((a, b) => a.domain.localeCompare(b.domain));

    const computeAverage = (total: { weighted: number; weight: number }) => (total.weight > 0 ? total.weighted / total.weight : null);

    const baselineAverages = {
      overall: computeAverage(ratingTotals.overall),
      partC: computeAverage(ratingTotals.partC),
      partD: computeAverage(ratingTotals.partD),
    };

    const finalTotals: Record<'overall' | 'partC' | 'partD', { weighted: number; weight: number }> = {
      overall: { ...ratingTotals.overall },
      partC: { ...ratingTotals.partC },
      partD: { ...ratingTotals.partD },
    };

    const excludedQualityImprovement: string[] = [];
    const EPSILON = 1e-6;
    let currentOverallAverage = baselineAverages.overall;

    const { data: summaryRatingData, error: summaryRatingError } = await supabase
      .from('summary_ratings')
      .select('*')
      .eq('contract_id', contractId)
      .eq('year', year)
      .maybeSingle();

    if (summaryRatingError && summaryRatingError.code !== 'PGRST116') {
      throw new Error(summaryRatingError.message);
    }

    const summaryRating = (summaryRatingData as SummaryRating | null) ?? null;

    const cmsOverallRating = (() => {
      if (!summaryRating) return null;
      const numeric = summaryRating.overall_rating_numeric;
      if (typeof numeric === 'number' && Number.isFinite(numeric)) {
        return numeric;
      }
      const text = summaryRating.overall_rating?.trim();
      if (!text) return null;
      const match = text.match(/(\d+(?:\.\d+)?)/);
      if (!match) return null;
      const parsed = Number.parseFloat(match[1]);
      return Number.isFinite(parsed) ? parsed : null;
    })();

    const qualityImprovementThresholdMet = cmsOverallRating !== null
      ? cmsOverallRating >= 3.75
      : currentOverallAverage !== null && currentOverallAverage >= 3.75;

    if (qualityImprovementThresholdMet && currentOverallAverage !== null) {
      for (const qi of qualityImprovementMetrics) {
        const contribution = qi.starValue * qi.weight;
        const candidateOverallWeight = finalTotals.overall.weight - qi.weight;
        const candidateOverallWeighted = finalTotals.overall.weighted - contribution;
        const candidateOverallAverage = candidateOverallWeight > 0 ? candidateOverallWeighted / candidateOverallWeight : null;

        if (
          currentOverallAverage !== null &&
          candidateOverallAverage !== null &&
          candidateOverallAverage > currentOverallAverage + EPSILON
        ) {
          finalTotals.overall.weight = candidateOverallWeight;
          finalTotals.overall.weighted = candidateOverallWeighted;
          currentOverallAverage = candidateOverallAverage;
          excludedQualityImprovement.push(qi.code);
        }
      }
    }

    // Fetch plan landscape data for this contract
    const { data: planLandscape, count: planCount } = await supabase
      .from('ma_plan_landscape')
      .select('*', { count: 'exact' })
      .eq('contract_id', contractId)
      .eq('year', year);

    // Calculate landscape statistics
    const typedPlans = (planLandscape || []) as MAPlanLandscape[];
    const avgPartCPremium = typedPlans.reduce((sum, plan) => {
      const premium = parseFloat(plan.part_c_premium || '0');
      return sum + (isNaN(premium) ? 0 : premium);
    }, 0) / (typedPlans.length || 1);

    const avgPartDPremium = typedPlans.reduce((sum, plan) => {
      const premium = parseFloat(plan.part_d_total_premium || '0');
      return sum + (isNaN(premium) ? 0 : premium);
    }, 0) / (typedPlans.length || 1);

    const uniqueStates = new Set(typedPlans.map(p => p.state_abbreviation).filter(Boolean));
    const uniqueCounties = new Set(typedPlans.map(p => p.county_name).filter(Boolean));

    // Count unique SNP plan IDs (not plan-county combinations)
    const uniqueSnpPlanIds = new Set(
      typedPlans
        .filter(p => p.special_needs_plan_indicator === 'Yes')
        .map(p => p.plan_id)
    );
    const snpPlans = uniqueSnpPlanIds.size;

    // Fetch latest enrollment snapshot if available
    const { data: latestEnrollmentPeriod, error: periodError } = await supabase
      .from('ma_plan_enrollment')
      .select('report_year, report_month')
      .eq('contract_id', contractId)
      .order('report_year', { ascending: false })
      .order('report_month', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (periodError && periodError.code !== 'PGRST116') {
      throw new Error(periodError.message);
    }

    let enrollmentSnapshot: {
      reportYear: number;
      reportMonth: number;
      totalEnrollment: number | null;
      reportedPlans: number;
      suppressedPlans: number;
      snpEnrollment: number | null;
      planTypeSummary: Array<{ planType: string; plans: number; enrollment: number }>;
      topPlans: Array<{
        plan_id: string;
        plan_type: string | null;
        enrollment: number | null;
        is_suppressed: boolean;
        is_snp: boolean;
        previous_enrollment: number | null;
        enrollment_change: number | null;
        enrollment_percent_change: number | null;
      }>;
      previousPeriod: {
        reportYear: number;
        reportMonth: number;
        totalEnrollment: number | null;
      } | null;
      yoyEnrollmentChange: number | null;
      yoyEnrollmentPercent: number | null;
    } | null = null;

    if (latestEnrollmentPeriod) {
      const period = latestEnrollmentPeriod as { report_year: number; report_month: number };
      const { data: enrollmentRows, error: enrollmentError } = await supabase
        .from('ma_plan_enrollment')
        .select('*')
        .eq('contract_id', contractId)
        .eq('report_year', period.report_year)
        .eq('report_month', period.report_month)
        .order('enrollment', { ascending: false });

      if (enrollmentError) {
        throw new Error(enrollmentError.message);
      }

      const typedEnrollment = (enrollmentRows || []) as MAPlanEnrollment[];
      const sortedEnrollment = [...typedEnrollment].sort((a, b) => {
        const aVal = a.enrollment ?? -1;
        const bVal = b.enrollment ?? -1;
        if (aVal === bVal) {
          return 0;
        }
        return bVal - aVal;
      });

      if (sortedEnrollment.length > 0) {
        const computeReportedTotals = (rows: MAPlanEnrollment[]) =>
          rows.reduce(
            (acc, row) => {
              acc.reportedPlans += row.enrollment !== null ? 1 : 0;
              acc.suppressedPlans += row.enrollment === null ? 1 : 0;
              acc.totalEnrollment += row.enrollment ?? 0;
              return acc;
            },
            { reportedPlans: 0, suppressedPlans: 0, totalEnrollment: 0 }
          );

        const reportedTotals = computeReportedTotals(sortedEnrollment);

        let previousPeriodSummary: {
          reportYear: number;
          reportMonth: number;
          totalEnrollment: number | null;
        } | null = null;

        let yoyEnrollmentChange: number | null = null;
        let yoyEnrollmentPercent: number | null = null;
        let previousEnrollmentByPlan: Map<string, number | null> | null = null;

        // Create a map of plan_id to plan_type from landscape data for accurate plan type lookup
        const planTypeFromLandscape = new Map<string, string>();
        const snpPlanIds = new Set<string>();
        
        for (const plan of typedPlans) {
          if (plan.plan_type) {
            planTypeFromLandscape.set(plan.plan_id, plan.plan_type);
          }
          if (plan.special_needs_plan_indicator === 'Yes') {
            snpPlanIds.add(plan.plan_id);
          }
        }

        // Build plan type summary using landscape data for plan types
        const planTypeMap = sortedEnrollment.reduce((acc, row) => {
          // Use plan type from landscape data, fall back to enrollment data, then 'Unspecified'
          const planType = planTypeFromLandscape.get(row.plan_id) || row.plan_type?.trim() || 'Unspecified';
          
          if (!acc.has(planType)) {
            acc.set(planType, { planType, plans: 0, enrollment: 0 });
          }
          const entry = acc.get(planType)!;
          entry.plans += 1;
          if (row.enrollment !== null) {
            entry.enrollment += row.enrollment;
          }
          return acc;
        }, new Map<string, { planType: string; plans: number; enrollment: number }>());

        const planTypeSummary = Array.from(planTypeMap.values()).sort((a, b) => b.enrollment - a.enrollment);

        // Sum enrollment for SNP plans
        const snpEnrollment = sortedEnrollment.reduce((sum, row) => {
          if (snpPlanIds.has(row.plan_id) && row.enrollment !== null) {
            return sum + row.enrollment;
          }
          return sum;
        }, 0);

        const currentTotalEnrollment = reportedTotals.reportedPlans > 0 ? reportedTotals.totalEnrollment : null;

        if (currentTotalEnrollment !== null) {
          const yearBefore = period.report_year - 1;
          let previousPeriod: { report_year: number; report_month: number } | null = null;

          if (yearBefore >= 0) {
            const { data: sameMonthPeriod, error: sameMonthError } = await supabase
              .from('ma_plan_enrollment')
              .select('report_year, report_month')
              .eq('contract_id', contractId)
              .eq('report_year', yearBefore)
              .eq('report_month', period.report_month)
              .limit(1)
              .maybeSingle();

            if (sameMonthError && sameMonthError.code !== 'PGRST116') {
              throw new Error(sameMonthError.message);
            }

            if (sameMonthPeriod) {
              previousPeriod = sameMonthPeriod as { report_year: number; report_month: number };
            }
          }

          if (!previousPeriod) {
            const { data: fallbackPeriod, error: fallbackError } = await supabase
              .from('ma_plan_enrollment')
              .select('report_year, report_month')
              .eq('contract_id', contractId)
              .lt('report_year', period.report_year)
              .order('report_year', { ascending: false })
              .order('report_month', { ascending: false })
              .limit(1)
              .maybeSingle();

            if (fallbackError && fallbackError.code !== 'PGRST116') {
              throw new Error(fallbackError.message);
            }

            if (fallbackPeriod) {
              previousPeriod = fallbackPeriod as { report_year: number; report_month: number };
            }
          }

          if (previousPeriod) {
            const { data: previousRows, error: previousError } = await supabase
              .from('ma_plan_enrollment')
              .select('*')
              .eq('contract_id', contractId)
              .eq('report_year', previousPeriod.report_year)
              .eq('report_month', previousPeriod.report_month);

            if (previousError) {
              throw new Error(previousError.message);
            }

            const previousTyped = (previousRows || []) as MAPlanEnrollment[];
            const previousTotalsRaw = computeReportedTotals(previousTyped);
            const priorTotalEnrollment = previousTotalsRaw.reportedPlans > 0 ? previousTotalsRaw.totalEnrollment : null;

            previousEnrollmentByPlan = previousTyped.reduce((acc, row) => {
              const planId = row.plan_id;
              if (!planId) {
                return acc;
              }

              const currentValue = acc.get(planId);

              if (row.enrollment === null) {
                acc.set(planId, null);
                return acc;
              }

              if (currentValue === null) {
                return acc;
              }

              const nextValue = (currentValue ?? 0) + row.enrollment;
              acc.set(planId, nextValue);
              return acc;
            }, new Map<string, number | null>());

            previousPeriodSummary = {
              reportYear: previousPeriod.report_year,
              reportMonth: previousPeriod.report_month,
              totalEnrollment: priorTotalEnrollment,
            };

            if (priorTotalEnrollment !== null) {
              yoyEnrollmentChange = currentTotalEnrollment - priorTotalEnrollment;
              if (priorTotalEnrollment !== 0) {
                yoyEnrollmentPercent = (yoyEnrollmentChange / priorTotalEnrollment) * 100;
              }
            }
          }
        }

        const topPlans = sortedEnrollment
          .slice(0, 10)
          .map((row) => {
            const currentEnrollment = row.enrollment;
            const previousEnrollment = previousEnrollmentByPlan?.get(row.plan_id ?? '') ?? null;

            let enrollmentChange: number | null = null;
            let enrollmentPercentChange: number | null = null;

            if (
              currentEnrollment !== null &&
              previousEnrollment !== null &&
              row.plan_id
            ) {
              enrollmentChange = currentEnrollment - previousEnrollment;
              if (previousEnrollment !== 0) {
                enrollmentPercentChange = (enrollmentChange / previousEnrollment) * 100;
              }
            }

            return {
              plan_id: row.plan_id,
              plan_type: planTypeFromLandscape.get(row.plan_id) || row.plan_type,
              enrollment: currentEnrollment,
              is_suppressed: row.is_suppressed,
              is_snp: snpPlanIds.has(row.plan_id),
              previous_enrollment: previousEnrollment,
              enrollment_change: enrollmentChange,
              enrollment_percent_change: enrollmentPercentChange,
            };
          });

        enrollmentSnapshot = {
          reportYear: period.report_year,
          reportMonth: period.report_month,
          totalEnrollment: reportedTotals.reportedPlans > 0 ? reportedTotals.totalEnrollment : null,
          reportedPlans: reportedTotals.reportedPlans,
          suppressedPlans: reportedTotals.suppressedPlans,
          snpEnrollment: snpEnrollment > 0 ? snpEnrollment : null,
          planTypeSummary,
          topPlans,
          previousPeriod: previousPeriodSummary,
          yoyEnrollmentChange,
          yoyEnrollmentPercent,
        };
      }
    }

    // Fetch CAI data (if available) for CAI adjustment to overall rating
    const { data: caiData, error: caiError } = await supabase
      .from('ma_cai')
      .select('*')
      .eq('contract_id', contractId)
      .eq('year', year)
      .maybeSingle();

    if (caiError && caiError.code !== 'PGRST116') {
      throw new Error(caiError.message);
    }

    const cai = (caiData as MACAI | null) ?? null;

    // Calculate final ratings with CAI adjustment
    const overallBeforeCAI = computeAverage(finalTotals.overall);
    let overallAfterCAI = overallBeforeCAI;

    if (overallBeforeCAI !== null && cai?.cai_value !== null && cai?.cai_value !== undefined) {
      overallAfterCAI = overallBeforeCAI + cai.cai_value;
    }

    const computedRatings = {
      overall: overallAfterCAI,
      partC: computeAverage(finalTotals.partC),
      partD: computeAverage(finalTotals.partD),
    };

    // Fetch disenrollment reasons (if available)
    const { data: disenrollmentRow, error: disenrollmentError } = await supabase
      .from('ma_disenrollment')
      .select('*')
      .eq('contract_id', contractId)
      .eq('year', year)
      .maybeSingle();

    if (disenrollmentError && disenrollmentError.code !== 'PGRST116') {
      throw new Error(disenrollmentError.message);
    }

    const typedDisenrollment = (disenrollmentRow as MADisenrollment | null) ?? null;

    const disenrollment = typedDisenrollment
      ? {
          year: typedDisenrollment.year,
          sourceFile: typedDisenrollment.source_file,
          categories: [
            {
              key: 'care',
              label: 'Problems getting needed care',
              percent: typedDisenrollment.problems_care_percent,
              note: typedDisenrollment.problems_care_note,
            },
            {
              key: 'doctors',
              label: 'Problems with doctors & hospitals',
              percent: typedDisenrollment.problems_doctors_percent,
              note: typedDisenrollment.problems_doctors_note,
            },
            {
              key: 'financial',
              label: 'Financial reasons for disenrollment',
              percent: typedDisenrollment.financial_reasons_percent,
              note: typedDisenrollment.financial_reasons_note,
            },
            {
              key: 'rx',
              label: 'Prescription drug benefits issues',
              percent: typedDisenrollment.problems_rx_percent,
              note: typedDisenrollment.problems_rx_note,
            },
            {
              key: 'help',
              label: 'Problems getting information & help',
              percent: typedDisenrollment.problems_help_percent,
              note: typedDisenrollment.problems_help_note,
            },
          ].filter((entry) => entry.percent !== null || (entry.note && entry.note.trim().length > 0)),
        }
      : null;

    // Get available years and contracts for filtering
    const { data: availableYears } = await supabase
      .from('ma_metrics')
      .select('year')
      .order('year', { ascending: false });

    const { data: availableContracts } = await supabase
      .from('ma_contracts')
      .select('contract_id, contract_name, organization_marketing_name')
      .eq('year', year)
      .order('contract_id');

    const typedYears = (availableYears || []) as { year: number }[];
    const uniqueYears = Array.from(new Set(typedYears.map(y => y.year)));

    type ContractFilterRow = {
      contract_id: string | null;
      contract_name: string | null;
      organization_marketing_name: string | null;
    };

    const contractsForFilters = ((availableContracts || []) as ContractFilterRow[])
      .map((entry) => ({
        contract_id: entry.contract_id?.trim() ?? '',
        contract_name: entry.contract_name,
        organization_marketing_name: entry.organization_marketing_name,
      }))
      .filter((entry) => entry.contract_id.length > 0);

    return NextResponse.json({
      year,
      contractId,
      contract,
      overallStars: {
        average: avgStarRating,
        distribution: starDistribution,
        totalMeasures: starMetrics.length,
      },
      domainStars,
      qualityImprovement: {
        thresholdMet: qualityImprovementThresholdMet,
        excludedMeasures: excludedQualityImprovement,
      },
      cai: cai ? {
        cai_value: cai.cai_value,
        overall_fac: cai.overall_fac,
        part_c_fac: cai.part_c_fac,
        part_d_ma_pd_fac: cai.part_d_ma_pd_fac,
        part_d_pdp_fac: cai.part_d_pdp_fac,
        overallBeforeCAI,
        overallAfterCAI,
      } : null,
      computedRatings,
      performance: {
        highest: highestPerforming,
        lowest: lowestPerforming,
      },
      planLandscape: {
        totalPlans: planCount || 0,
        avgPartCPremium,
        avgPartDPremium,
        statesServed: uniqueStates.size,
        countiesServed: uniqueCounties.size,
        snpPlans,
        plans: typedPlans.slice(0, 10), // First 10 plans for display
      },
      enrollmentSnapshot,
      summaryRating,
      disenrollment,
      filters: {
        availableYears: uniqueYears,
        availableContracts: contractsForFilters,
      },
    });
  } catch (error) {
    console.error('Summary API error:', error);
    return NextResponse.json(
      { error: 'Failed to fetch summary data' },
      { status: 500 }
    );
  }
}
