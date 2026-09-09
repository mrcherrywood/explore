"use client";

import { splitBookCompareRows } from "@/lib/plan-preview/results-book-compare";

import {
  ReportPageFrame,
  ReportSection,
  ReportStat,
  reportEyebrowPp2,
} from "../plan-preview-report/report-shared";

import { ResultsBookCompareChart } from "./ResultsBookCompareChart";
import { PP2_PRODUCT_LABEL, type ResultsPageProps } from "./results-shared";

export function ResultsBookComparePage({
  report,
  pageNumber,
  totalPages,
}: ResultsPageProps) {
  const { bookCompare } = report;
  const contractId = report.contract.contractId;
  const { leads, trails, even } = splitBookCompareRows(bookCompare);
  const compared = bookCompare.rows.length;
  const hasBook = bookCompare.bookContractCount > 0 && compared > 0;

  return (
    <ReportPageFrame
      eyebrow={reportEyebrowPp2(report.starsYear)}
      title="Contract vs Book of Business"
      subtitle={`${contractId} · Where ${contractId} leads and where it trails the rest of the Press Ganey book, in points`}
      pageNumber={pageNumber}
      totalPages={totalPages}
      contractId={contractId}
      starsYear={report.starsYear}
      generatedAt={report.generatedAt}
      productLabel={PP2_PRODUCT_LABEL}
    >
      <ReportSection
        title="Scorecard"
        note={`Plan preview measure scores for ${contractId} versus the mean score of the other ${bookCompare.bookContractCount} contract${bookCompare.bookContractCount === 1 ? "" : "s"} in the Stars ${report.starsYear} book. Positive points mean ${contractId} is ahead on that measure.`}
        style={{ marginTop: 12 }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          <ReportStat
            label="Trails"
            value={hasBook ? trails.length : "—"}
            detail="Behind the book mean"
          />
          <ReportStat
            label="Even"
            value={hasBook ? even.length : "—"}
            detail="Within 1 point"
          />
          <ReportStat
            label="Leads"
            value={hasBook ? leads.length : "—"}
            detail="Ahead of the book mean"
          />
        </div>
      </ReportSection>

      <ReportSection
        title="Where the contract leads and where it trails, in points"
        style={{ marginTop: 12 }}
      >
        <div className="fep-report-panel" style={{ padding: "12px 12px 6px" }}>
          {hasBook ? (
            <ResultsBookCompareChart
              contractId={contractId}
              leads={leads}
              trails={trails}
            />
          ) : (
            <p className="fep-report-section-note" style={{ margin: 0 }}>
              No other book contracts have accrued plan preview scores for
              Stars {report.starsYear}, so there is nothing to compare against.
            </p>
          )}
        </div>
        <p className="fep-report-section-note" style={{ marginTop: 6 }}>
          Points are the contract&apos;s plan preview score minus the book mean
          on each measure&apos;s own scale. For inverted measures (Complaints,
          Members Choosing to Leave) a lower score is better, so the sign is
          flipped and leading is always positive. Quality Improvement and
          measures without an accrued score are not compared.
          {even.length > 0
            ? ` Even with the book: ${even.map((row) => row.measureDisplayName).join(", ")}.`
            : ""}
        </p>
      </ReportSection>
    </ReportPageFrame>
  );
}
