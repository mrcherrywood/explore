"use client";

import React, { useState } from "react";
import { BookOpen, ChevronDown, ChevronRight } from "lucide-react";

export function RewardFactorMethodology() {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-violet-500/30 bg-violet-500/5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-4 text-left"
      >
        <BookOpen className="h-5 w-5 shrink-0 text-violet-500" />
        <div className="flex-1">
          <h2 className="text-sm font-semibold text-violet-400">Calculation Methodology</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            CMS reward factor formulas, population definitions, and data limitations
          </p>
        </div>
        {expanded
          ? <ChevronDown className="h-4 w-4 text-muted-foreground" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />}
      </button>

      {expanded && (
        <div className="border-t border-violet-500/20 px-5 pb-5 pt-4">
          <div className="grid grid-cols-2 gap-6 text-sm text-muted-foreground">
            <Section title="Reward Factor Overview">
              <p>
                CMS assigns a <Strong>reward factor (r-factor)</Strong> of 0.0 to 0.4 to each contract based on two
                dimensions of its measure star performance: the <Strong>weighted mean</Strong> (how high) and
                the <Strong>weighted variance</Strong> (how consistent).
              </p>
              <p>
                Contracts with both high average performance and low variance earn the largest bonus (0.4),
                which is added to their summary star rating before rounding.
              </p>
            </Section>

            <Section title="Weighted Mean">
              <Formula>mean = Σ(weight_i × star_i) / Σ(weight_i)</Formula>
              <p>
                Each measure&apos;s star rating (1–5) is multiplied by its CMS-assigned weight
                (1 for clinical, 2 for patient experience, 3 for key outcomes, 5 for quality improvement).
                The weighted average across all rated measures produces the contract&apos;s performance score.
              </p>
            </Section>

            <Section title="Weighted Variance">
              <Formula>var = [n/(n−1)] × Σ(weight_i × (star_i − mean)²) / Σ(weight_i)</Formula>
              <p>
                Measures how consistently a contract performs across its measures. The <Strong>n/(n−1)</Strong> term
                is Bessel&apos;s correction for sample bias. Lower variance means more uniform performance across
                measures — a contract earning 4 stars on every measure has zero variance.
              </p>
            </Section>

            <Section title="Percentile Thresholds">
              <p>
                CMS computes the <Strong>65th and 85th percentile</Strong> of weighted means and
                the <Strong>30th and 70th percentile</Strong> of weighted variances across all contracts
                in each rating type population. These define the classification boundaries:
              </p>
              <div className="mt-2 rounded-lg border border-border bg-background/50 p-3 text-xs">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border/50">
                      <th className="pb-1 text-left font-medium" />
                      <th className="pb-1 text-center font-medium">Low Var (&lt;P30)</th>
                      <th className="pb-1 text-center font-medium">Med Var (P30–P70)</th>
                      <th className="pb-1 text-center font-medium">High Var (≥P70)</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-border/30">
                      <td className="py-1 font-medium">High Mean (≥P85)</td>
                      <td className="py-1 text-center text-emerald-500">+0.4</td>
                      <td className="py-1 text-center text-emerald-500">+0.3</td>
                      <td className="py-1 text-center text-muted-foreground">0.0</td>
                    </tr>
                    <tr className="border-b border-border/30">
                      <td className="py-1 font-medium">Rel. High Mean (P65–P85)</td>
                      <td className="py-1 text-center text-blue-500">+0.2</td>
                      <td className="py-1 text-center text-blue-500">+0.1</td>
                      <td className="py-1 text-center text-muted-foreground">0.0</td>
                    </tr>
                    <tr>
                      <td className="py-1 font-medium">Below P65</td>
                      <td className="py-1 text-center text-muted-foreground">0.0</td>
                      <td className="py-1 text-center text-muted-foreground">0.0</td>
                      <td className="py-1 text-center text-muted-foreground">0.0</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </Section>

            <Section title="Rating Type Populations">
              <p>Thresholds are computed separately for four populations:</p>
              <ul className="mt-1.5 space-y-1">
                <Li><Strong>Part C</Strong> — H+R contracts, Part C measures only. Minimum 10 rated measures.</Li>
                <Li><Strong>Part D (MA-PD)</Strong> — H+R contracts with Part D coverage, Part D measures only. Minimum 4 rated measures.</Li>
                <Li><Strong>Part D (PDP)</Strong> — S-prefix (standalone PDP) contracts, Part D measures only. Minimum 4 rated measures.</Li>
                <Li><Strong>Overall (MA-PD)</Strong> — H+R contracts with both Part C and Part D, all measures combined. Minimum 15 rated measures. Shared measures (Members Choosing to Leave, Complaints) are counted once, not duplicated across parts.</Li>
              </ul>
            </Section>

            <Section title="Improvement Measures (QI)">
              <p>
                CMS computes thresholds in two scenarios: <Strong>with</Strong> and <Strong>without</Strong> the
                two Quality Improvement measures (C30 Health Plan QI, D04 Drug Plan QI). These carry
                weight 5 — the highest of any measure — and are based on year-over-year significance
                testing that is difficult to project forward.
              </p>
              <p>
                The &quot;without improvement&quot; scenario excludes C30/D04 from all contracts.
                The &quot;with improvement&quot; scenario includes them where reported.
              </p>
            </Section>

            <Section title="Data Limitations &amp; Accuracy">
              <p>
                <Strong>CMS uses decimal scores</Strong> for their threshold calculations, while this tool uses
                publicly available <Strong>integer star ratings (1–5)</Strong>. This discretization means our
                weighted means can only take on a finite set of rational values rather than the continuous
                distribution CMS works with.
              </p>
              <p>
                Despite this limitation, backtesting against CMS published thresholds shows strong accuracy:
                for 2026, all Part C and Part D thresholds are within <Strong>~0.5% or less</Strong> of
                official values, with several exact matches. Overall MA-PD thresholds are within ~0.4%.
              </p>
              <p>
                Measure weights are sourced from the CMS cut points workbook and matched to measure
                codes by name. The percentile calculation uses linear interpolation (PERCENTILE.INC method).
              </p>
            </Section>
          </div>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold text-foreground">{title}</h3>
      {children}
    </div>
  );
}

function Strong({ children }: { children: React.ReactNode }) {
  return <span className="font-medium text-foreground">{children}</span>;
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-md border border-border bg-background/50 px-3 py-1.5 font-mono text-xs text-foreground">
      {children}
    </div>
  );
}

function Li({ children }: { children: React.ReactNode }) {
  return <li className="flex gap-2"><span className="text-violet-500">•</span><span>{children}</span></li>;
}
