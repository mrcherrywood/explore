"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { PlanPreviewFinalScores } from "@/components/admin/PlanPreviewFinalScores";
import { ExportPdfButton } from "@/components/shared/ExportPdfButton";
import type { PlanPreviewFinalScoresResult } from "@/lib/plan-preview/final-scores";
import type {
  PlanPreviewContractPrediction,
  PlanPreviewCutPointPrediction,
  PlanPreviewPredictionsResult,
} from "@/lib/plan-preview/predictions";

type ContractSummary = Omit<PlanPreviewContractPrediction, "measures">;

type PredictionsResponse = Omit<PlanPreviewPredictionsResult, "contracts"> & {
  contracts: ContractSummary[];
  contractDetail: PlanPreviewContractPrediction | null;
  scenarios: PlanPreviewFinalScoresResult[];
};

const THRESHOLD_ORDER = ["fiveStar", "fourStar", "threeStar", "twoStar"] as const;
const THRESHOLD_HEADERS: Record<(typeof THRESHOLD_ORDER)[number], string> = {
  fiveStar: "5★",
  fourStar: "4★",
  threeStar: "3★",
  twoStar: "2★",
};

async function fetchPredictions(
  starsYear: number,
  contractId?: string
): Promise<PredictionsResponse> {
  const params = new URLSearchParams({ starsYear: String(starsYear) });
  if (contractId) params.set("contractId", contractId);
  const response = await fetch(`/api/admin/plan-preview/predictions?${params}`, {
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error ?? "Failed to build predictions");
  return payload;
}

export function PlanPreviewPredictions({ starsYear }: { starsYear: number }) {
  const [data, setData] = useState<PredictionsResponse | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedContractId, setSelectedContractId] = useState<string>("");
  const reportRef = useRef<HTMLElement | null>(null);

  const run = useCallback(
    async (contractId?: string) => {
      setRunning(true);
      setError(null);
      try {
        const result = await fetchPredictions(starsYear, contractId);
        setData(result);
        if (contractId) setSelectedContractId(contractId);
        else if (result.contracts.length > 0) {
          setSelectedContractId(result.contractDetail?.contractId ?? "");
        }
      } catch (runError) {
        setError(runError instanceof Error ? runError.message : "Failed to build predictions");
      } finally {
        setRunning(false);
      }
    },
    [starsYear]
  );

  useEffect(() => {
    setData(null);
    setSelectedContractId("");
    setError(null);
  }, [starsYear]);

  return (
    <section ref={reportRef} className="fep-card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pb-4 pt-5">
        <div>
          <p className="fep-label">Predicted cut points</p>
          <p className="fep-subtitle" style={{ marginTop: 4 }}>
            Accrued Stars {starsYear} scores are anchored onto the latest published market, then
            run through the validated clustering / CAHPS percentile methodology.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <ExportPdfButton
              targetRef={reportRef}
              fileName={`plan-preview-stars-${starsYear}`}
              orientation="portrait"
              label="Download PDF"
            />
          ) : null}
          <button type="button" className="fep-btn" onClick={() => void run()} disabled={running}>
            {running ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {data ? "Re-run predictions" : "Run predictions"}
          </button>
        </div>
      </div>

      {error ? (
        <div className="px-5 pb-5">
          <div className="fep-banner-error">{error}</div>
        </div>
      ) : null}

      {data ? (
        <>
          <div className="flex flex-wrap gap-2 px-5 pb-4 text-xs">
            <span className="fep-pill">Baseline SY{data.baselineYear ?? "—"}</span>
            <span className="fep-pill">{data.summary.readyCount} ready</span>
            {data.summary.unavailableCount > 0 ? (
              <span className="fep-pill">{data.summary.unavailableCount} unavailable</span>
            ) : null}
            {data.summary.unsupportedCount > 0 ? (
              <span className="fep-pill">{data.summary.unsupportedCount} excluded (QI)</span>
            ) : null}
            {data.summary.warningCount > 0 ? (
              <span className="fep-pill" style={{ background: "#f7ecd2", color: "#9a7415" }}>
                {data.summary.warningCount} movement warnings
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="fep-table">
              <thead>
                <tr>
                  <th className="l">Measure</th>
                  <th className="l">Method</th>
                  <th>Accrued</th>
                  <th>Market</th>
                  {THRESHOLD_ORDER.map((key) => (
                    <th key={key}>{THRESHOLD_HEADERS[key]}</th>
                  ))}
                  <th>Warnings</th>
                </tr>
              </thead>
              <tbody>
                {data.cutPoints.map((cutPoint) => (
                  <CutPointRow key={cutPoint.measureNormalized} cutPoint={cutPoint} />
                ))}
              </tbody>
            </table>
          </div>

          <PlanPreviewFinalScores scenarios={data.scenarios} />

          <ContractPanel
            data={data}
            selectedContractId={selectedContractId}
            onSelect={(contractId) => void run(contractId)}
            running={running}
          />
        </>
      ) : (
        <div className="px-5 pb-5 text-sm" style={{ color: "var(--fep-faint)" }}>
          {running
            ? "Clustering the anchored market for every accrued measure…"
            : "Run predictions once measure scores have accrued for this Star year."}
        </div>
      )}
    </section>
  );
}

function CutPointRow({ cutPoint }: { cutPoint: PlanPreviewCutPointPrediction }) {
  const thresholdByKey = new Map(
    (cutPoint.thresholds ?? []).map((item) => [item.key, item] as const)
  );

  return (
    <tr>
      <td className="l" style={{ maxWidth: 260, whiteSpace: "normal", lineHeight: 1.35 }}>
        <span style={{ fontWeight: 600, color: "var(--fep-ink)" }}>
          {cutPoint.measureCode ? `${cutPoint.measureCode} — ` : ""}
          {cutPoint.displayName}
        </span>
        {cutPoint.inverted ? (
          <span style={{ color: "var(--fep-faint)" }}> (lower is better)</span>
        ) : null}
      </td>
      {cutPoint.status === "ready" ? (
        <>
          <td className="l">{cutPoint.method === "cahps-percentile" ? "CAHPS percentile" : "Clustering"}</td>
          <td>{cutPoint.accruedContractCount.toLocaleString()}</td>
          <td>{cutPoint.baselineMarketCount.toLocaleString()}</td>
          {THRESHOLD_ORDER.map((key) => {
            const threshold = thresholdByKey.get(key);
            if (!threshold) return <td key={key}>—</td>;
            const delta = threshold.deltaVsComparison;
            return (
              <td key={key}>
                <span style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
                  {threshold.projected}
                </span>
                {delta !== null ? (
                  <span style={{ marginLeft: 5, fontSize: 10.5, color: delta === 0 ? "var(--fep-faint)" : delta > 0 ? "var(--fep-accent)" : "var(--fep-negative)" }}>
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                ) : null}
              </td>
            );
          })}
          <td>
            {cutPoint.warningCount > 0 ? (
              <span className="fep-pill" style={{ background: "#f7ecd2", color: "#9a7415" }}>
                {cutPoint.warningCount}
              </span>
            ) : (
              "—"
            )}
          </td>
        </>
      ) : (
        <td className="l" colSpan={7} style={{ color: "var(--fep-faint)", whiteSpace: "normal" }}>
          {cutPoint.status === "unsupported" ? "Excluded — " : "Unavailable — "}
          {cutPoint.reason}
        </td>
      )}
    </tr>
  );
}

function ContractPanel({
  data,
  selectedContractId,
  onSelect,
  running,
}: {
  data: PredictionsResponse;
  selectedContractId: string;
  onSelect: (contractId: string) => void;
  running: boolean;
}) {
  const detail =
    data.contractDetail && data.contractDetail.contractId === selectedContractId
      ? data.contractDetail
      : null;

  return (
    <div className="border-t px-5 py-5" style={{ borderColor: "var(--fep-row-border)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <p className="fep-label" style={{ marginRight: 6 }}>
          Contract predictions
        </p>
        <select
          className="fep-select"
          value={selectedContractId}
          onChange={(event) => onSelect(event.target.value)}
          disabled={running || data.contracts.length === 0}
        >
          <option value="" disabled>
            Select contract…
          </option>
          {data.contracts.map((contract) => (
            <option key={contract.contractId} value={contract.contractId}>
              {contract.contractId}
              {contract.contractName ? ` — ${contract.contractName}` : ""}
            </option>
          ))}
        </select>
        {detail ? (
          <>
            <span className="fep-pill">
              Base mean {detail.weightedMeanStar ?? "—"} · {detail.ratedMeasureCount}/
              {detail.scoredMeasureCount} measures rated
            </span>
            <a
              className="fep-link text-xs"
              href={`/admin/plan-preview/report?starsYear=${data.starsYear}&contractId=${detail.contractId}`}
              target="_blank"
              rel="noreferrer"
              data-export-hide
            >
              Open contract report →
            </a>
          </>
        ) : null}
      </div>

      {detail ? (
        <div className="mt-4 overflow-x-auto">
          <table className="fep-table">
            <thead>
              <tr>
                <th className="l">Measure</th>
                <th>Score</th>
                <th>Predicted ★ (SY{data.starsYear})</th>
                <th>At SY{data.baselineYear ?? "—"} official ★</th>
                <th>Weight</th>
              </tr>
            </thead>
            <tbody>
              {detail.measures.map((measure) => (
                <tr key={measure.measureNormalized}>
                  <td className="l" style={{ maxWidth: 280, whiteSpace: "normal", lineHeight: 1.35 }}>
                    <span style={{ fontWeight: 600, color: "var(--fep-ink)" }}>
                      {measure.measureCode} — {measure.displayName}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--fep-ink)" }}>{measure.score}</td>
                  <td>
                    {measure.predictedStar !== null ? (
                      <span className="fep-pill">{measure.predictedStar}★</span>
                    ) : (
                      <span style={{ color: "var(--fep-faint)" }}>
                        {measure.predictionStatus === "unsupported" ? "excluded" : "—"}
                      </span>
                    )}
                  </td>
                  <td>{measure.baselineOfficialStar !== null ? `${measure.baselineOfficialStar}★` : "—"}</td>
                  <td>{measure.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs" style={{ color: "var(--fep-faint)" }}>
            Base mean is the weighted measure-star mean before reward factor and CAI. The SY
            {data.baselineYear ?? "—"} column shows the star this score would earn at the latest
            published official cut points.
          </p>
        </div>
      ) : null}
    </div>
  );
}
