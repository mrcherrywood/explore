import { NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export type MapMeasureOption = {
  code: string;
  name: string;
  domain: string | null;
  weight: number | null;
  latestYear: number | null;
};

export async function GET() {
  try {
    let supabase;
    try {
      supabase = createServiceRoleClient();
    } catch (clientError) {
      console.error("Maps measures API configuration error", clientError);
      return NextResponse.json(
        { error: "Supabase credentials not configured", code: "SUPABASE_CONFIG_MISSING" },
        { status: 503 }
      );
    }

    const { data, error } = await supabase
      .from("ma_measures")
      .select("code, name, alias, domain, weight, year")
      .order("code", { ascending: true })
      .order("year", { ascending: false })
      .limit(5000);

    if (error) {
      throw new Error(error.message);
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ measures: [] });
    }

    const latestByCode = new Map<string, MapMeasureOption>();
    for (const row of data as Array<{
      code: string;
      name: string | null;
      alias: string | null;
      domain: string | null;
      weight: number | null;
      year: number | null;
    }>) {
      const code = (row.code ?? "").trim().toUpperCase();
      if (!code) continue;
      if (latestByCode.has(code)) continue;
      latestByCode.set(code, {
        code,
        name: row.name ?? row.alias ?? code,
        domain: row.domain ?? null,
        weight: row.weight ?? null,
        latestYear: row.year ?? null,
      });
    }

    const measures = Array.from(latestByCode.values()).sort((a, b) => a.name.localeCompare(b.name));

    return NextResponse.json({ measures });
  } catch (error) {
    console.error("Maps measures API error", error);
    return NextResponse.json(
      {
        error: "Failed to fetch measure options",
        details: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
