import { Calculator, FileCode2, Files, TableProperties } from "lucide-react";

const scriptCards = [
  {
    name: "contract_percentiles.py",
    description: "Calculates a percentile rank for every H and R contract on every measure in each CMS measure-data file.",
    details: [
      "Filters to H + R contracts only.",
      "Outputs raw score and percentile rank per measure.",
      "Supports Excel and JSON output formats.",
    ],
  },
  {
    name: "cutpoint_percentiles.py",
    description: "Translates CMS cut points into the percentile they actually represent inside the observed H-contract distribution.",
    details: [
      "Filters to H contracts only to match the CMS clustering population.",
      "Matches cut point names to measure columns across file-year naming differences.",
      "Adds distribution context like median, IQR, skew, and range.",
    ],
  },
] as const;

const methodRows = [
  {
    method: "percentrank_inc",
    formula: "(count below) / (n - 1) x 100",
    note: "Default. Closest to the industry-standard CMS workflow.",
  },
  {
    method: "percentileofscore",
    formula: "(count at or below) / n x 100",
    note: "Scipy-style alternative that includes ties in the denominator.",
  },
] as const;

const expectedFiles = [
  "2022 Star Ratings Data Table - Measure Data (Oct 06 2021).csv",
  "2023 Star Ratings Data Table - Measure Data (Oct 04 2022).csv",
  "2024 Star Ratings Data Table - Measure Data (Oct 12 2023).csv",
  "2025 Star Ratings Data Table - Measure Data (Oct 11 2024).csv",
  "2026 Star Ratings Data Table - Measure Data (Oct 8 2025).csv",
  'Stars 2016-2028 Cut Points 12.2025 (1).xlsx',
] as const;

const designNotes = [
  "Inverted measures like Complaints, Members Choosing to Leave, and Readmissions have percentiles flipped so higher percentile always means better performance.",
  "CSV files are read as latin-1 to handle mixed CMS encodings across years.",
  "Measure names are normalized and non-ASCII characters are stripped to make matching more reliable across inconsistent source files.",
  "The 2025 CSV has a different header structure than the other years, so the scripts handle that year separately in shared config.",
] as const;

const contractCommand = `python contract_percentiles.py \\
  --data-dir ../../data \\
  --output contract_percentiles.xlsx \\
  --method percentrank_inc`;

const cutpointCommand = `python cutpoint_percentiles.py \\
  --data-dir ../../data \\
  --cut-points "../../data/Stars 2016-2028 Cut Points 12.2025 (1).xlsx" \\
  --output cutpoint_percentiles.xlsx \\
  --method percentrank_inc`;

export function PercentileAnalysisOverview() {
  return (
    <div className="flex flex-col gap-6">
      <section className="rounded-3xl border border-border bg-card p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Python Toolkit</p>
            <h2 className="mt-2 text-3xl font-semibold text-foreground">Percentile analysis for CMS Stars measure data</h2>
            <p className="mt-4 text-sm leading-6 text-muted-foreground">
              This page summarizes the workflow in `scripts/percentile-analysis`: one script scores every contract against the
              full market distribution, and the other shows where each CMS cut point sits inside that distribution.
            </p>
          </div>
          <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-foreground">
                <FileCode2 className="h-4 w-4" />
                <span className="font-medium">2 scripts</span>
              </div>
              <p className="mt-2 text-xs leading-5">Contract-level ranking plus cut point percentile translation.</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-foreground">
                <Calculator className="h-4 w-4" />
                <span className="font-medium">2 methods</span>
              </div>
              <p className="mt-2 text-xs leading-5">Excel-style `PERCENTRANK.INC` and scipy `percentileofscore`.</p>
            </div>
            <div className="rounded-2xl border border-border bg-background/60 p-4">
              <div className="flex items-center gap-2 text-foreground">
                <TableProperties className="h-4 w-4" />
                <span className="font-medium">2022-2026</span>
              </div>
              <p className="mt-2 text-xs leading-5">Shared config maps each year to its source file and header layout.</p>
            </div>
          </div>
        </div>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        {scriptCards.map((card) => (
          <article key={card.name} className="rounded-3xl border border-border bg-card p-8">
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Script</p>
            <h3 className="mt-2 text-xl font-semibold text-foreground">{card.name}</h3>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">{card.description}</p>
            <ul className="mt-5 space-y-3 text-sm text-muted-foreground">
              {card.details.map((detail) => (
                <li key={detail} className="rounded-2xl border border-border bg-background/50 px-4 py-3 leading-6">
                  {detail}
                </li>
              ))}
            </ul>
          </article>
        ))}
      </section>

      <section className="grid gap-6 xl:grid-cols-[1.2fr_0.8fr]">
        <article className="rounded-3xl border border-border bg-card p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Percentile Methods</p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Choose the rank convention explicitly</h3>
          <div className="mt-6 overflow-hidden rounded-2xl border border-border">
            <table className="min-w-full divide-y divide-border text-sm">
              <thead className="bg-background/70 text-left text-xs uppercase tracking-[0.25em] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Method</th>
                  <th className="px-4 py-3 font-medium">Formula</th>
                  <th className="px-4 py-3 font-medium">When to use</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {methodRows.map((row) => (
                  <tr key={row.method} className="align-top">
                    <td className="px-4 py-4 font-mono text-foreground">{row.method}</td>
                    <td className="px-4 py-4 font-mono text-muted-foreground">{row.formula}</td>
                    <td className="px-4 py-4 text-muted-foreground">{row.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="rounded-3xl border border-border bg-card p-8">
          <div className="flex items-center gap-2 text-foreground">
            <Files className="h-4 w-4" />
            <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Expected Inputs</p>
          </div>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Files the scripts look for</h3>
          <ul className="mt-5 space-y-2 text-sm text-muted-foreground">
            {expectedFiles.map((file) => (
              <li key={file} className="rounded-2xl border border-border bg-background/50 px-4 py-3 font-mono text-xs leading-5">
                {file}
              </li>
            ))}
          </ul>
        </article>
      </section>

      <section className="grid gap-6 xl:grid-cols-2">
        <article className="rounded-3xl border border-border bg-card p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Run It</p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Contract percentile example</h3>
          <div className="mt-5 rounded-2xl border border-border bg-background/80 p-4">
            <pre className="overflow-x-auto text-xs leading-6 text-foreground">
              <code>{contractCommand}</code>
            </pre>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Produces either Excel or JSON output with one record per contract and score/percentile pairs for each measure.
          </p>
        </article>

        <article className="rounded-3xl border border-border bg-card p-8">
          <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Run It</p>
          <h3 className="mt-2 text-xl font-semibold text-foreground">Cut point percentile example</h3>
          <div className="mt-5 rounded-2xl border border-border bg-background/80 p-4">
            <pre className="overflow-x-auto text-xs leading-6 text-foreground">
              <code>{cutpointCommand}</code>
            </pre>
          </div>
          <p className="mt-4 text-sm leading-6 text-muted-foreground">
            Adds percentile equivalents plus distribution notes so the cut points can be interpreted against the real plan spread.
          </p>
        </article>
      </section>

      <section className="rounded-3xl border border-border bg-card p-8">
        <p className="text-xs uppercase tracking-[0.35em] text-muted-foreground">Design Decisions</p>
        <h3 className="mt-2 text-xl font-semibold text-foreground">Important behavior baked into shared config</h3>
        <div className="mt-6 grid gap-4 lg:grid-cols-2">
          {designNotes.map((note) => (
            <div key={note} className="rounded-2xl border border-border bg-background/50 px-5 py-4 text-sm leading-6 text-muted-foreground">
              {note}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
