"use client";

import type { CSSProperties } from "react";

import { formatEnrollment } from "@/lib/peer/enrollment-levels";
import { FOUR_STAR_CUTOFF } from "@/lib/plan-preview/clover-removal-constants";
import type {
  ExclusionModelContract,
  ExclusionModelReport,
  ExclusionModelScoreValue,
} from "@/lib/plan-preview/exclusion-model-report";

import {
  REPORT_COLORS,
  ReportPageFrame,
  ReportSection,
  formatScore,
  formatStars,
} from "../plan-preview-report/report-shared";

const PRODUCT_LABEL = "Exclusion models";
const CELL = { paddingTop: 3, paddingBottom: 3 } as const;

function ScoreCell({ score }: { score: ExclusionModelScoreValue | null }) {
  const atFour = (score?.finalScoreRaw ?? 0) >= FOUR_STAR_CUTOFF;
  return (
    <td
      style={{
        ...CELL,
        fontWeight: 700,
        color: score && atFour ? REPORT_COLORS.positive : score ? REPORT_COLORS.negative : undefined,
      }}
    >
      {formatScore(score?.finalScoreRaw, 3)}
      {score ? ` · ${formatStars(score.finalRating, 1)}` : ""}
    </td>
  );
}

export function ExclusionModelsDefinitionsPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: ExclusionModelReport;
  pageNumber: number;
  totalPages: number;
}) {
  return (
    <ReportPageFrame
      eyebrow={`${report.parentOrganization} · Stars ${report.starsYear}`}
      title="Exclusion models"
      subtitle="Official measure stars, scored after each exclusion list."
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <ReportSection
        title="How these scores are built"
        note="Each model drops its measures from every contract, then recalculates the reward factor from the measures that remain. Overall is the weighted mean of those stars, plus that reward factor and CAI. Part C Quality Improvement stays in every model. Polypharmacy stays in every model. Part D Complaints and Members Choosing to Leave are already left out of Overall, because they repeat the Part C measures."
        style={{ marginTop: 8 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 9.5 }}>
          <thead>
            <tr>
              <th className="l">Category</th>
              <th className="l">Measures</th>
              <th>Count</th>
            </tr>
          </thead>
          <tbody>
            {report.crosswalk.map((row) => (
              <tr key={row.category}>
                <td className="l" style={CELL}>
                  {row.category}
                </td>
                <td className="l" style={{ ...CELL, fontSize: 8.5 }}>
                  {row.category.startsWith("Total") || row.codes.length > 20 ? "—" : row.codes.join(", ")}
                </td>
                <td style={{ ...CELL, fontWeight: 700 }}>{row.codes.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>

    </ReportPageFrame>
  );
}

export function ExclusionModelsListsPage({
  report,
  pageNumber,
  totalPages,
}: {
  report: ExclusionModelReport;
  pageNumber: number;
  totalPages: number;
}) {
  const groups = report.models.filter((model) => model.id !== "clover" && model.id !== "combined");
  const cms = groups.find((group) => group.id === "cms");
  const cloverGroups = groups.filter((group) => group.id !== "cms");
  return (
    <ReportPageFrame
      eyebrow={`${report.parentOrganization} · Stars ${report.starsYear}`}
      title="Measures in each model"
      subtitle="All Clover is the statutory list and the notice-and-comment list together. CMS + Clover drops both the CMS list and the Clover list."
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <div style={{ display: "grid", gridTemplateColumns: "1.05fr 1fr", gap: 18, marginTop: 8 }}>
        {cms ? <MeasureList title={cms.label} measures={cms.measures} /> : null}
        <div>
          {cloverGroups.map((group, index) => (
            <MeasureList
              key={group.id}
              title={group.label}
              measures={group.measures}
              style={index === 0 ? undefined : { marginTop: 16 }}
            />
          ))}
        </div>
      </div>
    </ReportPageFrame>
  );
}

function MeasureList({
  title,
  measures,
  style,
}: {
  title: string;
  measures: ExclusionModelReport["models"][number]["measures"];
  style?: CSSProperties;
}) {
  return (
    <ReportSection title={title} style={{ marginTop: 0, ...style }}>
      <table className="fep-report-table compact">
        <tbody>
          {measures.map((measure) => (
            <tr key={`${title}-${measure.code}`}>
              <td style={{ ...CELL, fontWeight: 700, width: 36 }}>{measure.code}</td>
              <td className="l" style={CELL}>
                {measure.name}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </ReportSection>
  );
}

export function ExclusionModelsScoresPage({
  report,
  contracts,
  pageNumber,
  totalPages,
  continued,
}: {
  report: ExclusionModelReport;
  contracts: ExclusionModelContract[];
  pageNumber: number;
  totalPages: number;
  continued: boolean;
}) {
  return (
    <ReportPageFrame
      eyebrow={`${report.parentOrganization} · Stars ${report.starsYear}`}
      title={continued ? "Contract scores, continued" : "Contract scores"}
      subtitle="Green is an unrounded Overall of 3.75 or higher. The rating beside each score is that Overall rounded to the nearest half star."
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={report.parentOrganization}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PRODUCT_LABEL}
    >
      <ReportSection
        title="Overall after exclusions"
        note="No exclusions keeps every measure and still recalculates the reward factor for this year’s market. CMS recalc, Statutory, and Notice drop that group. All Clover drops both Clover lists. CMS + Clover drops every measure on either list."
        style={{ marginTop: 8 }}
      >
        <table className="fep-report-table compact" style={{ fontSize: 8.5 }}>
          <thead>
            <tr>
              <th className="l">Contract</th>
              <th>Published</th>
              <th>No exclusions</th>
              {report.models.map((model) => (
                <th key={model.id}>{model.shortLabel}</th>
              ))}
              <th>Enrollment</th>
            </tr>
          </thead>
          <tbody>
            {contracts.map((row) => (
              <tr key={row.contractId}>
                <td className="l" style={CELL}>
                  <span style={{ fontWeight: 700 }}>{row.contractId}</span>
                </td>
                <td style={CELL}>{formatStars(row.publishedRating, 1)}</td>
                <ScoreCell score={row.baseline} />
                {row.models.map((model) => (
                  <ScoreCell key={model.id} score={model.score} />
                ))}
                <td style={CELL}>{row.enrollment == null ? "—" : formatEnrollment(row.enrollment)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </ReportSection>
      {!continued && report.excluded.length > 0 ? (
        <p className="fep-report-section-note" style={{ marginTop: 10 }}>
          Left out:{" "}
          {report.excluded.map((row) => `${row.contractId} (${row.reason})`).join("; ")}.
        </p>
      ) : null}
    </ReportPageFrame>
  );
}
