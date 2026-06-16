import { NextRequest, NextResponse } from "next/server";

import { requireApprovedAdmin } from "@/lib/admin/require-approved-admin";
import { getLatestContractRecords } from "@/lib/band-movement/analysis";
import { getAllForecastProjectionsForRun } from "@/lib/cutpoint-forecast/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const admin = await requireApprovedAdmin();
    if (!admin.ok) return admin.response;

    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("runId") ?? "";

    if (!runId) {
      return NextResponse.json({ error: "runId is required." }, { status: 400 });
    }

    const projections = await getAllForecastProjectionsForRun(admin.serviceClient, runId);
    const contractIds = [...new Set(projections.map((projection) => projection.contractId))].sort();
    const measures = [...new Map(
      projections.map((projection) => [
        projection.measureNormalized,
        {
          normalized: projection.measureNormalized,
          displayName: projection.measureDisplayName,
        },
      ] as const)
    ).values()].sort((left, right) => left.displayName.localeCompare(right.displayName));

    const latestContracts = new Map(
      getLatestContractRecords().map((record) => [record.contractId, record] as const)
    );

    const contracts = contractIds.map((contractId) => {
      const metadata = latestContracts.get(contractId);
      return {
        contractId,
        contractName: metadata?.contractName ?? "",
        parentOrg: metadata?.parentOrg ?? "",
      };
    });

    const parentOrgs = [...new Set(contracts.map((contract) => contract.parentOrg).filter(Boolean))].sort();

    return NextResponse.json({
      parentOrgs,
      contracts,
      measures,
    });
  } catch (error) {
    console.error("Failed to load forecast filter options", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to load forecast filter options",
      },
      { status: 500 }
    );
  }
}
