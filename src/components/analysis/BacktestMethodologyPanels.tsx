"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, HelpCircle, Info } from "lucide-react";

type MethodologyInfo = {
  method: "clustering" | "cahps-percentile";
  foldCount: number;
  seed: number;
  tukeyStartsIn: number;
  exclusions: string[];
};

type BannerData = {
  inverted: boolean;
  methodology: MethodologyInfo;
};

export function BacktestBanner({ data, displayName }: { data: BannerData; displayName: string }) {
  const [showMethodology, setShowMethodology] = useState(false);
  const isCahps = data.methodology.method === "cahps-percentile";

  return (
    <div className="space-y-0 rounded-2xl border border-amber-500/30 bg-amber-500/5">
      <div className="flex gap-3 p-4">
        <Info className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" />
        <div className="flex-1 text-sm text-muted-foreground">
          <p className="font-medium text-foreground">Research backtest only</p>
          <p className="mt-1">
            {isCahps ? (
              <>
                This view approximates CMS-style CAHPS cut points for {displayName} using contract-level
                case-mix adjusted scores and the percentile-based relative distribution method (P15/P30/P60/P80).
                Standard errors and reliability adjustments are omitted because they are not available in public data.
              </>
            ) : (
              <>
                This view approximates CMS-style non-CAHPS cut points for {displayName} using contract-level
                measure scores, 10-fold mean resampling, Ward-style clustering, and year-appropriate Tukey handling.
                It is designed for validation against official cut points, not for predicting the exact CMS output.
              </>
            )}
          </p>
          <button
            type="button"
            onClick={() => setShowMethodology((current) => !current)}
            className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-amber-600 hover:underline dark:text-amber-400"
          >
            <HelpCircle className="h-3.5 w-3.5" />
            How is this calculated?
            {showMethodology ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      {showMethodology && (
        <div className="border-t border-amber-500/20 px-4 pb-5 pt-4 text-sm text-muted-foreground">
          {isCahps ? <CahpsMethodologySteps /> : <ClusteringMethodologySteps data={data} />}
        </div>
      )}
    </div>
  );
}

function CahpsMethodologySteps() {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 font-medium text-foreground">1. Data Collection</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>Loads all H+R (Medicare Advantage) contract-level case-mix adjusted CAHPS scores for the selected measure across available years (2023–2026).</li>
          <li>CAHPS scores are on a 0–100 scale and reflect patient experience survey responses, adjusted for enrollee demographics.</li>
          <li>Only contracts with valid numeric scores are included.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">2. Percentile Distribution (Base Groups)</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>CMS assigns CAHPS stars based on where a contract&apos;s score falls in the national distribution, not via clustering.</li>
          <li>The distribution is split into five base groups using fixed percentile boundaries:</li>
          <li className="ml-4">Base group 1: below 15th percentile (potential 1★)</li>
          <li className="ml-4">Base group 2: 15th–30th percentile (potential 2★)</li>
          <li className="ml-4">Base group 3: 30th–60th percentile (potential 3★)</li>
          <li className="ml-4">Base group 4: 60th–80th percentile (potential 4★)</li>
          <li className="ml-4">Base group 5: at or above 80th percentile (potential 5★)</li>
          <li>Percentile values are rounded to the nearest integer on the 0–100 scale.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">3. Significance Testing &amp; Reliability (not applied)</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>The full CMS methodology also tests whether each contract&apos;s score is statistically significantly different from the national average, and checks CAHPS reliability (sampling variance vs. between-contract variance).</li>
          <li>These adjustments can shift a contract&apos;s final star up or down from its base group assignment.</li>
          <li>This backtest <strong>omits</strong> significance testing and reliability because the required standard errors and reliability estimates are not available in public data.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">4. No Guardrails</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>CMS does not apply guardrails to CAHPS measures — percentile thresholds float freely each year based on the score distribution.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">5. Evaluation</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>The four percentile-based thresholds (2★–5★) are compared to the actual published CMS cut points.</li>
          <li>Mean Absolute Error (MAE) = average of the four |simulated − actual| differences.</li>
          <li>Largest Gap = the single threshold with the highest absolute error.</li>
        </ul>
      </div>
    </div>
  );
}

function ClusteringMethodologySteps({ data }: { data: BannerData }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 font-medium text-foreground">1. Data Collection</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>Loads all H+R (Medicare Advantage) contract-level scores for the selected measure across available years (2023–2026).</li>
          <li>Only contracts with valid numeric scores are included; contracts missing the measure are excluded.</li>
          <li>Excludes {data.methodology.exclusions.join(" and ")} — these use different CMS methodologies.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">2. Outlier Deletion (Tukey)</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>Starting in {data.methodology.tukeyStartsIn}, CMS adopted Tukey outer-fence deletion. Pre-{data.methodology.tukeyStartsIn} years skip this step.</li>
          <li>Computes Q1 and Q3 from all scores, then IQR = Q3 − Q1.</li>
          <li>Outer fences: lower = Q1 − 3 × IQR, upper = Q3 + 3 × IQR (capped to the 0–100 scale bounds).</li>
          <li>Any contract score outside the fences is removed before clustering.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">3. Mean Resampling ({data.methodology.foldCount}-Fold)</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>Contracts are deterministically shuffled (seed {data.methodology.seed}, Fisher–Yates) and assigned to {data.methodology.foldCount} equal-sized folds.</li>
          <li>For each fold, the held-out group is removed and clustering runs on the remaining ~90% of contracts.</li>
          <li>This leave-one-group-out resampling stabilizes thresholds by averaging across {data.methodology.foldCount} independent runs.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">4. Ward&apos;s Hierarchical Clustering</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>Each resample&apos;s training scores are sorted and initialized as individual clusters.</li>
          <li>Adjacent clusters are iteratively merged using Ward&apos;s minimum variance criterion, which minimizes the weighted squared distance between cluster means.</li>
          <li>Merging continues until exactly 5 clusters remain, corresponding to star levels 1–5.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">5. Threshold Derivation</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>For higher-is-better measures: thresholds are the minimum score of clusters 2–5 (the lower boundary of each higher star band).</li>
          {data.inverted && (
            <li>For this inverted measure (lower is better): thresholds are the maximum score of clusters in reverse order, so lower scores earn higher stars.</li>
          )}
          <li>The {data.methodology.foldCount} sets of thresholds are averaged to produce a single set of simulated cut points.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">6. Guardrails</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>When a prior-year official cut point is available, each threshold is capped within ±5 points (on the 0–100 scale) or ±5% of the restricted range for non-percentage scales.</li>
          <li>This prevents large year-over-year cut point swings, matching the CMS stabilization approach.</li>
          <li>If no prior-year benchmark exists (e.g. the first available year), guardrails are skipped.</li>
        </ul>
      </div>

      <div>
        <p className="mb-1.5 font-medium text-foreground">7. Evaluation</p>
        <ul className="space-y-1 pl-4 list-disc">
          <li>Final simulated thresholds are forced into monotonic order and clamped to scale bounds.</li>
          <li>Each of the four thresholds (2★–5★) is compared to the actual published CMS cut point.</li>
          <li>Mean Absolute Error (MAE) = average of the four |simulated − actual| differences.</li>
          <li>Largest Gap = the single threshold with the highest absolute error.</li>
        </ul>
      </div>
    </div>
  );
}
