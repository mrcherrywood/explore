import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { fetchContractLandscape, fetchLatestEnrollmentPeriod } from "@/lib/leaderboard/data";
import { US_STATE_NAMES } from "@/lib/leaderboard/states";
import { formatEnrollment } from "@/lib/peer/enrollment-levels";

export const runtime = "nodejs";

const DOMINANT_SHARE_THRESHOLD = 0.4;

type StateAggregate = {
  code: string;
  count: number;
  totalEnrollment: number;
};

type StateResponse = {
  code: string;
  name: string;
  totalEnrollment: number | null;
  formattedEnrollment: string;
  contractCount: number;
};

export async function GET() {
  try {
    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Leaderboard states API configuration error", clientError);
      return NextResponse.json(
        { error: "Supabase credentials not configured", code: "SUPABASE_CONFIG_MISSING" },
        { status: 503 }
      );
    }

    const period = await fetchLatestEnrollmentPeriod(supabase);
    if (!period) {
      return NextResponse.json({ states: [] });
    }

    const contracts = await fetchContractLandscape(supabase, period);

    const aggregates = new Map<string, StateAggregate>();

    for (const contract of contracts) {
      if (!contract.dominant_state) continue;
      if (contract.dominant_share === null || contract.dominant_share < DOMINANT_SHARE_THRESHOLD) {
        continue;
      }

      const code = contract.dominant_state.toUpperCase();
      const total = contract.total_enrollment ?? 0;
      if (!aggregates.has(code)) {
        aggregates.set(code, { code, count: 0, totalEnrollment: 0 });
      }
      const stateData = aggregates.get(code)!;
      stateData.count += 1;
      stateData.totalEnrollment += total;
    }

    const states: StateResponse[] = Array.from(aggregates.values())
      .map((state) => {
        const name = US_STATE_NAMES[state.code] ?? state.code;
        const totalEnrollment = state.totalEnrollment > 0 ? state.totalEnrollment : null;
        return {
          code: state.code,
          name,
          totalEnrollment,
          formattedEnrollment: formatEnrollment(totalEnrollment),
          contractCount: state.count,
        };
      })
      .sort((a, b) => {
        const aEnroll = a.totalEnrollment ?? -1;
        const bEnroll = b.totalEnrollment ?? -1;
        if (aEnroll === bEnroll) {
          return a.code.localeCompare(b.code);
        }
        return bEnroll - aEnroll;
      });

    return NextResponse.json({ states });
  } catch (error) {
    console.error("Leaderboard states API error", error);
    return NextResponse.json(
      {
        error: "Failed to fetch leaderboard states",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
