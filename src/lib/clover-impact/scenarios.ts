export const QI_MEASURE_CODES = new Set(["C30", "D04"]);

export type CloverComputedScenarioId =
  | "s26NoQI"
  | "s29Removal"
  | "model1"
  | "model2";

export type CloverChartScoreId =
  | "stars2025"
  | "s26WithQI"
  | "s26NoQI"
  | "stars2026"
  | "s29Removal"
  | "model1"
  | "model2";

export type CloverComputedScenario = {
  id: CloverComputedScenarioId;
  label: string;
  shortLabel: string;
  description: string;
  removedCodes: Set<string>;
  holdQiConstant: boolean;
};

export type CloverChartScore = {
  id: CloverChartScoreId;
  label: string;
  color: string;
  source: "official" | "computed";
};

export const CLOVER_RULING_SUMMARY =
  "A federal court ruled that CMS improperly included 20 measures in Clover's 2026 Star Rating calculation. This screen compares official 2025/2026 results with several what-if recalculations that remove the affected measure groups while holding Quality Improvement ratings constant where applicable.";

export const CLOVER_CHART_SCORES: CloverChartScore[] = [
  { id: "stars2025", label: "Stars 2025", color: "#213a8f", source: "official" },
  { id: "s26WithQI", label: "S26 With QI", color: "#6d5a9e", source: "computed" },
  { id: "s26NoQI", label: "S26 No QI", color: "#9b529c", source: "computed" },
  { id: "stars2026", label: "Stars 2026", color: "#8ea5ee", source: "official" },
  { id: "s29Removal", label: "S26 - S29 Removal", color: "#b9c9f6", source: "computed" },
  { id: "model1", label: "Model 1 Score", color: "#c45583", source: "computed" },
  { id: "model2", label: "Model 2 Score", color: "#f4c1a5", source: "computed" },
];

export const CLOVER_COMPUTED_SCENARIOS: CloverComputedScenario[] = [
  {
    id: "s26NoQI",
    label: "Stars 2026 - No QI",
    shortLabel: "No QI",
    description:
      "Removes the Part C and Part D Quality Improvement measures to show the direct QI effect.",
    removedCodes: QI_MEASURE_CODES,
    holdQiConstant: false,
  },
  {
    id: "s29Removal",
    label: "Stars 2026 - S29 Removal",
    shortLabel: "S29 Removal",
    description:
      "Removes the CMS-announced 2027, 2028, and 2029 Stars removals: Care for Older Adults - Pain Assessment, Medication Reconciliation Post-Discharge, MTM, both Call Center measures, Statin Therapy, appeals, SNP Care Management, complaints, MPF Price Accuracy, disenrollment, Customer Service, and Rating of Health Care Quality.",
    removedCodes: new Set(["C07", "C09", "C17", "C19", "C24", "C25", "C28", "C29", "C31", "C32", "C33", "D01", "D02", "D03", "D07", "D11"]),
    holdQiConstant: true,
  },
  {
    id: "model1",
    label: "Model 1",
    shortLabel: "Model 1",
    description:
      "Removes the ten measures most directly tied to the 1395w-22(e) data-source issue cited in the Clover decision. This creates a narrower remedy-style view: if CMS recalculated around the clearest disputed statutory/data-source problem, the affected measures would be medication adherence, SUPD, both call centers, Reviewing Appeals Decisions, Rating of Drug Plan, Getting Needed Drugs, and MTM.",
    removedCodes: new Set(["C32", "C33", "D01", "D05", "D06", "D08", "D09", "D10", "D11", "D12"]),
    holdQiConstant: true,
  },
  {
    id: "model2",
    label: "Model 2",
    shortLabel: "Model 2",
    description:
      "Removes the broader 20-measure Clover ruling set. This creates an upper-bound sensitivity case for a wider interpretation of the decision, adding patient-experience, CAHPS/HOS, and administrative measures that could also be treated as affected: Getting Needed Care, Getting Care Quickly, Customer Service, Rating of Health Care Quality, Care Coordination, Flu, Improving Mental/Physical Health, Reducing Falls, and Improving Bladder Control.",
    removedCodes: new Set([
      "C03",
      "C04",
      "C05",
      "C15",
      "C16",
      "C22",
      "C23",
      "C24",
      "C25",
      "C27",
      "C32",
      "C33",
      "D01",
      "D05",
      "D06",
      "D08",
      "D09",
      "D10",
      "D11",
      "D12",
    ]),
    holdQiConstant: true,
  },
];

export const CLOVER_SCENARIO_MEASURE_NOTES = [
  {
    label: "Stars 2025",
    description: "Official CMS overall Stars rating for Stars 2025.",
  },
  {
    label: "Stars 2026",
    description:
      "Stars 2026 uses the official CMS overall rating. S26 With QI and No QI use the recalculation engine to show the unrounded weighted score impact of Quality Improvement measures.",
  },
  {
    label: "Reward Factor",
    description:
      "For each calculated bar, reward factor thresholds are recomputed from the full H+R MA-PD scenario population using PERCENTILE.INC: weighted mean 65th/85th percentiles define relatively high/high performance, and weighted variance 30th/70th percentiles define low/medium/high consistency. Contracts receive +0.1 to +0.4 when they pair high enough mean performance with low or medium variance. With-QI and without-QI thresholds are calculated separately, and the QI hold-harmless rule determines which side is used before CAI is added.",
  },
  {
    label: "Quality Bonus Payment Estimate",
    description:
      "QBP impact is a ballpark annual eligibility estimate, not a full CMS payment model. Contracts are treated as QBP eligible when their rounded overall Star rating is 4.0 or higher. For contracts that gain or lose eligibility under Model 1 or Model 2, estimated annual swing equals enrollment x $1,200 benchmark PMPM x 12 months x 5% QBP, or about $720 per member per year. The estimate does not adjust for county benchmarks, bids, rebates, double-bonus counties, or contract-specific payment mechanics.",
  },
  {
    label: "Stars 2026 - S29 Removal",
    description:
      "Evaluates removing the CMS-announced 2027, 2028, and 2029 Stars removals while keeping QI measure ratings constant.",
  },
  {
    label: "Stars 2026 - Model 1",
    description:
      "Evaluates a narrower remedy-style interpretation of the Clover decision by removing the ten measures most directly tied to the 1395w-22(e) data-source issue.",
  },
  {
    label: "Stars 2026 - Model 2",
    description:
      "Evaluates a broader sensitivity case for the decision by removing the full 20-measure set, including the additional patient-experience, CAHPS/HOS, and administrative measures beyond Model 1.",
  },
];
