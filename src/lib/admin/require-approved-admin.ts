import { NextResponse } from "next/server";

import { createClient, createServiceRoleClient } from "@/lib/supabase/server";

type AdminRequirementSuccess = {
  ok: true;
  userId: string;
  serviceClient: ReturnType<typeof createServiceRoleClient>;
};

type AdminRequirementFailure = {
  ok: false;
  response: NextResponse;
};

export async function requireApprovedAdmin(): Promise<
  AdminRequirementSuccess | AdminRequirementFailure
> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const { data: approval, error } = await (supabase as unknown as {
    from: (table: string) => {
      select: (columns: string) => {
        eq: (column: string, value: string) => {
          single: () => Promise<{
            data: { status: string } | null;
            error: Error | null;
          }>;
        };
      };
    };
  })
    .from("user_approvals")
    .select("status")
    .eq("user_id", user.id)
    .single();

  if (error) {
    return {
      ok: false,
      response: NextResponse.json({ error: error.message }, { status: 500 }),
    };
  }

  if (!approval || approval.status !== "approved") {
    return {
      ok: false,
      response: NextResponse.json(
        { error: "Forbidden - admin access required" },
        { status: 403 }
      ),
    };
  }

  return {
    ok: true,
    userId: user.id,
    serviceClient: createServiceRoleClient(),
  };
}
