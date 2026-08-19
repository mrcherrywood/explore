import { NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import {
  buildPlanPreviewContractReport,
  computeWeightedDomainMeans,
  type PublishedMeasureMeta,
} from "@/lib/plan-preview/report-data";
import { getPlanPreviewRun } from "@/lib/plan-preview/run-cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(request: Request) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const url = new URL(request.url);
    const starsYear = Math.round(Number(url.searchParams.get("starsYear")));
    const contractId = (url.searchParams.get("contractId") ?? "").trim().toUpperCase();

    if (!Number.isFinite(starsYear) || starsYear <= 0) {
      return NextResponse.json({ error: "A valid stars year is required." }, { status: 400 });
    }
    if (!contractId) {
      return NextResponse.json({ error: "A contract ID is required." }, { status: 400 });
    }

    const { result, scenarios, cai } = await getPlanPreviewRun(
      admin.serviceClient,
      starsYear
    );
    const contract = result.contracts.find((entry) => entry.contractId === contractId);
    if (!contract) {
      return NextResponse.json(
        { error: `Contract ${contractId} has no accrued plan preview scores for Stars ${starsYear}.` },
        { status: 404 }
      );
    }

    const domainByCode = new Map<string, string>();
    const measureMetaByCode = new Map<string, PublishedMeasureMeta>();
    let publishedDomainMeans: Map<string, number | null> | undefined;

    if (result.baselineYear !== null) {
      const [{ data: measureRows }, { data: metricRows }] = await Promise.all([
        admin.serviceClient
          .from("ma_measures")
          .select("code, domain, weight")
          .eq("year", result.baselineYear),
        admin.serviceClient
          .from("ma_metrics")
          .select("metric_code, star_rating")
          .eq("contract_id", contractId)
          .eq("year", result.baselineYear),
      ]);

      for (const row of (measureRows ?? []) as {
        code: string;
        domain: string | null;
        weight: number | null;
      }[]) {
        const code = row.code.toUpperCase();
        if (row.domain) domainByCode.set(code, row.domain);
        measureMetaByCode.set(code, { domain: row.domain, weight: row.weight });
      }

      // Same published domain means as Contract Summary for this year.
      const starredMeasures = ((metricRows ?? []) as {
        metric_code: string | null;
        star_rating: string | number | null;
      }[])
        .map((row) => {
          const code = String(row.metric_code ?? "")
            .trim()
            .toUpperCase();
          const star = Number(row.star_rating);
          return { code, star };
        })
        .filter((row) => row.code && Number.isFinite(row.star) && row.star > 0);

      if (starredMeasures.length > 0 && measureMetaByCode.size > 0) {
        publishedDomainMeans = computeWeightedDomainMeans(starredMeasures, measureMetaByCode);
      }
    }

    const report = buildPlanPreviewContractReport({
      predictions: result,
      scenarios,
      contract,
      domainByCode,
      publishedDomainMeans,
      cai,
    });

    return NextResponse.json(JSON.parse(JSON.stringify(report)));
  } catch (error) {
    console.error("Failed to build plan preview contract report", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to build plan preview contract report",
      },
      { status: 500 }
    );
  }
}
