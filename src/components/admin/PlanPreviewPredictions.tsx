"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Sparkles } from "lucide-react";

import { PlanPreviewFinalScores } from "@/components/admin/PlanPreviewFinalScores";
import { ExportCsvButton } from "@/components/shared/ExportCsvButton";
import { ExportPdfButton } from "@/components/shared/ExportPdfButton";
import type { PlanPreviewFinalScoresResult } from "@/lib/plan-preview/final-scores";
import { buildPredictedCutPointsCsv } from "@/lib/plan-preview/predicted-cut-points-export";
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

const THRESHOLD_ORDER = [
  "fiveStar",
  "fourStar",
  "threeStar",
  "twoStar",
] as const;
const THRESHOLD_HEADERS: Record<(typeof THRESHOLD_ORDER)[number], string> = {
  fiveStar: "5★",
  fourStar: "4★",
  threeStar: "3★",
  twoStar: "2★",
};

async function fetchPredictions(
  starsYear: number,
  contractId?: string,
): Promise<PredictionsResponse> {
  const params = new URLSearchParams({ starsYear: String(starsYear) });
  if (contractId) params.set("contractId", contractId);
  const response = await fetch(
    `/api/admin/plan-preview/predictions?${params}`,
    {
      cache: "no-store",
    },
  );
  const payload = await response.json().catch(() => ({}));
  if (!response.ok)
    throw new Error(payload.error ?? "Failed to build predictions");
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
        if (contractId) setSelectedContractId(contractId);
        const result = await fetchPredictions(starsYear, contractId);
        setData(result);
        if (contractId) setSelectedContractId(contractId);
        else if (result.contracts.length > 0) {
          setSelectedContractId(result.contractDetail?.contractId ?? result.contracts[0].contractId);
        }
      } catch (runError) {
        setError(
          runError instanceof Error
            ? runError.message
            : "Failed to build predictions",
        );
      } finally {
        setRunning(false);
      }
    },
    [starsYear],
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
            Workbook cut points are applied by default — official for CAHPS,
            forecast for the rest — while the clustering / CAHPS percentile
            model re-predicts continuously as scores accrue and flags
            divergence.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {data ? (
            <>
              <span data-export-hide>
                <ExportCsvButton
                  fileName={`plan-preview-cut-points-stars-${starsYear}`}
                  label="Export CSV"
                  getData={() => buildPredictedCutPointsCsv(data.cutPoints)}
                  className="px-4 py-2"
                />
              </span>
              <ExportPdfButton
                targetRef={reportRef}
                fileName={`plan-preview-stars-${starsYear}`}
                orientation="portrait"
                label="Download PDF"
              />
            </>
          ) : null}
          <button
            type="button"
            className="fep-btn"
            onClick={() => void run()}
            disabled={running}
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
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
            <span className="fep-pill">
              Baseline SY{data.baselineYear ?? "—"}
            </span>
            <span className="fep-pill">{data.summary.readyCount} ready</span>
            <span className="fep-pill">
              {data.cutPoints.filter((c) => c.source === "official").length}{" "}
              official ·{" "}
              {
                data.cutPoints.filter((c) => c.source === "workbook_forecast")
                  .length
              }{" "}
              workbook ·{" "}
              {
                data.cutPoints.filter(
                  (c) => c.source === "model" && c.status === "ready",
                ).length
              }{" "}
              model
            </span>
            {data.summary.unavailableCount > 0 ? (
              <span className="fep-pill">
                {data.summary.unavailableCount} unavailable
              </span>
            ) : null}
            {data.summary.unsupportedCount > 0 ? (
              <span className="fep-pill">
                {data.summary.unsupportedCount} excluded (QI)
              </span>
            ) : null}
            {data.summary.warningCount > 0 ? (
              <span
                className="fep-pill"
                style={{ background: "#f7ecd2", color: "#9a7415" }}
              >
                {data.summary.warningCount} movement warnings
              </span>
            ) : null}
            {data.summary.cahpsPlanStarCount > 0 ? (
              <span className="fep-pill">
                {data.summary.cahpsPlanStarCount} CAHPS plan-file stars
              </span>
            ) : null}
          </div>

          <div className="overflow-x-auto">
            <table className="fep-table">
              <thead>
                <tr>
                  <th className="l">Measure</th>
                  <th className="l">Source</th>
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
                  <CutPointRow
                    key={cutPoint.measureNormalized}
                    cutPoint={cutPoint}
                  />
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
        <div
          className="px-5 pb-5 text-sm"
          style={{ color: "var(--fep-faint)" }}
        >
          {running
            ? "Clustering the anchored market for every accrued measure…"
            : "Run predictions once measure scores have accrued for this Star year."}
        </div>
      )}
    </section>
  );
}

const SOURCE_LABELS: Record<PlanPreviewCutPointPrediction["source"], string> = {
  official: "Official",
  workbook_forecast: "Workbook forecast",
  model: "Model",
};

function CutPointRow({
  cutPoint,
}: {
  cutPoint: PlanPreviewCutPointPrediction;
}) {
  const thresholdByKey = new Map(
    (cutPoint.thresholds ?? []).map((item) => [item.key, item] as const),
  );
  const modelByKey = new Map(
    (cutPoint.modelThresholds ?? []).map((item) => [item.key, item] as const),
  );
  const showModelComparison = cutPoint.source === "workbook_forecast";

  return (
    <tr>
      <td
        className="l"
        style={{ maxWidth: 260, whiteSpace: "normal", lineHeight: 1.35 }}
      >
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
          <td className="l">
            <span
              className="fep-pill"
              style={
                cutPoint.source === "official"
                  ? undefined
                  : { background: "#f1ede2", color: "var(--fep-muted)" }
              }
            >
              {SOURCE_LABELS[cutPoint.source]}
            </span>
          </td>
          <td>{cutPoint.accruedContractCount.toLocaleString()}</td>
          <td>{cutPoint.baselineMarketCount.toLocaleString()}</td>
          {THRESHOLD_ORDER.map((key) => {
            const threshold = thresholdByKey.get(key);
            if (!threshold) return <td key={key}>—</td>;
            const delta = threshold.deltaVsComparison;
            const model = showModelComparison ? modelByKey.get(key) : undefined;
            const modelDiffers =
              model !== undefined &&
              Math.round(model.projected) !== Math.round(threshold.projected);
            return (
              <td key={key}>
                <span style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
                  {threshold.projected}
                </span>
                {delta !== null ? (
                  <span
                    style={{
                      marginLeft: 5,
                      fontSize: 10.5,
                      color:
                        delta === 0
                          ? "var(--fep-faint)"
                          : delta > 0
                            ? "var(--fep-accent)"
                            : "var(--fep-negative)",
                    }}
                  >
                    {delta > 0 ? "+" : ""}
                    {delta}
                  </span>
                ) : null}
                {modelDiffers ? (
                  <div style={{ fontSize: 9.5, color: "var(--fep-faint)" }}>
                    model {Math.round(model.projected)}
                  </div>
                ) : null}
              </td>
            );
          })}
          <td>
            {cutPoint.warningCount > 0 ? (
              <span
                className="fep-pill"
                style={{ background: "#f7ecd2", color: "#9a7415" }}
              >
                {cutPoint.warningCount}
              </span>
            ) : (
              "—"
            )}
          </td>
        </>
      ) : (
        <td
          className="l"
          colSpan={7}
          style={{ color: "var(--fep-faint)", whiteSpace: "normal" }}
        >
          {cutPoint.status === "unsupported" ? "Excluded — " : "Unavailable — "}
          {cutPoint.reason}
        </td>
      )}
    </tr>
  );
}

const UNKNOWN_PARENT_ORG = "Unknown parent organization";

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
  const [selectedParentOrg, setSelectedParentOrg] = useState("");

  const parentOptions = useMemo(() => {
    const orgs = new Set<string>();
    for (const contract of data.contracts) {
      orgs.add(contract.parentOrganization?.trim() || UNKNOWN_PARENT_ORG);
    }
    return [...orgs].sort((left, right) => left.localeCompare(right));
  }, [data.contracts]);

  const filteredContracts = useMemo(() => {
    if (!selectedParentOrg) return data.contracts;
    return data.contracts.filter(
      (contract) =>
        (contract.parentOrganization?.trim() || UNKNOWN_PARENT_ORG) ===
        selectedParentOrg,
    );
  }, [data.contracts, selectedParentOrg]);

  // Drop a stale parent filter when the accrued set changes (e.g. re-run / year).
  useEffect(() => {
    if (
      selectedParentOrg &&
      !parentOptions.includes(selectedParentOrg)
    ) {
      setSelectedParentOrg("");
    }
  }, [parentOptions, selectedParentOrg]);

  // Keep the selected contract inside the filtered parent list.
  useEffect(() => {
    if (filteredContracts.length === 0) return;
    const stillVisible = filteredContracts.some(
      (contract) => contract.contractId === selectedContractId,
    );
    if (!stillVisible) onSelect(filteredContracts[0].contractId);
  }, [filteredContracts, onSelect, selectedContractId]);

  const detail =
    data.contractDetail && data.contractDetail.contractId === selectedContractId
      ? data.contractDetail
      : null;

  return (
    <div
      className="border-t px-5 py-5"
      style={{ borderColor: "var(--fep-row-border)" }}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="fep-label" style={{ marginRight: 6 }}>
          Contract predictions
        </p>
        <select
          className="fep-select"
          value={selectedParentOrg}
          onChange={(event) => setSelectedParentOrg(event.target.value)}
          disabled={running || data.contracts.length === 0}
          aria-label="Parent organization"
        >
          <option value="">All parent organizations</option>
          {parentOptions.map((parentOrg) => (
            <option key={parentOrg} value={parentOrg}>
              {parentOrg}
            </option>
          ))}
        </select>
        <select
          className="fep-select"
          value={selectedContractId}
          onChange={(event) => onSelect(event.target.value)}
          disabled={running || filteredContracts.length === 0}
          aria-label="Contract"
        >
          <option value="" disabled>
            {selectedParentOrg
              ? "Select contract in parent org…"
              : "Select contract…"}
          </option>
          {filteredContracts.map((contract) => (
            <option key={contract.contractId} value={contract.contractId}>
              {contract.contractId}
              {contract.contractName ? ` — ${contract.contractName}` : ""}
            </option>
          ))}
        </select>
        {detail ? (
          <span className="fep-pill">
            Base mean {detail.weightedMeanStar ?? "—"} ·{" "}
            {detail.ratedMeasureCount}/{detail.scoredMeasureCount} measures
            rated
          </span>
        ) : null}
        {selectedContractId ? (
          <a
            className="fep-link text-xs"
            href={`/admin/plan-preview/report?starsYear=${data.starsYear}&contractId=${encodeURIComponent(selectedContractId)}`}
            target="_blank"
            rel="noreferrer"
            data-export-hide
          >
            Open contract report →
          </a>
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
                <tr key={measure.measureCode}>
                  <td
                    className="l"
                    style={{
                      maxWidth: 280,
                      whiteSpace: "normal",
                      lineHeight: 1.35,
                    }}
                  >
                    <span style={{ fontWeight: 600, color: "var(--fep-ink)" }}>
                      {measure.measureCode} — {measure.displayName}
                    </span>
                  </td>
                  <td style={{ fontWeight: 700, color: "var(--fep-ink)" }}>
                    {measure.score === null ? "—" : Number(measure.score).toFixed(2)}
                  </td>
                  <td>
                    {measure.predictedStar !== null ? (
                      <span className="fep-pill">
                        {measure.predictedStar}★
                        {measure.starSource === "cms_data_issue"
                          ? " · CMS data issue"
                          : measure.starSource === "cahps_plan_file" &&
                              measure.baseGroupStar != null &&
                              measure.baseGroupStar !== measure.predictedStar
                            ? ` · Base ${measure.baseGroupStar}→${measure.predictedStar}`
                            : ""}
                      </span>
                    ) : (
                      <span style={{ color: "var(--fep-faint)" }}>
                        {measure.predictionStatus === "unsupported"
                          ? "excluded"
                          : "—"}
                      </span>
                    )}
                  </td>
                  <td>
                    {measure.baselineOfficialStar !== null
                      ? `${measure.baselineOfficialStar}★`
                      : "—"}
                  </td>
                  <td>{measure.weight}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs" style={{ color: "var(--fep-faint)" }}>
            Base mean is the weighted measure-star mean before reward factor and
            CAI. The SY
            {data.baselineYear ?? "—"} column shows the star this score would
            earn at the latest published official cut points. CAHPS use the
            plan&apos;s PP1 Star Rating when uploaded; Base → Star marks
            measures adjusted off their Base Group. CMS data issue means the
            file had no score and CMS assigned 1 star.
          </p>
        </div>
      ) : null}
    </div>
  );
}
