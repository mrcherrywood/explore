"use client";

import { useEffect, useState } from "react";
import { Check, X, Clock, RefreshCw, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

import { AdminSubNav } from "@/components/admin/AdminSubNav";
import { AppShell } from "@/components/layout/AppShell";

type UserApproval = {
  id: string;
  user_id: string;
  email: string;
  status: "pending" | "approved" | "rejected";
  requested_at: string;
  reviewed_at: string | null;
  notes: string | null;
};

export default function AdminUsersPage() {
  const [users, setUsers] = useState<UserApproval[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const fetchUsers = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users");
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to fetch users");
      }
      const data = await response.json();
      setUsers(data.users || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to fetch users");
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleApproval = async (
    userId: string,
    status: "approved" | "rejected",
  ) => {
    setActionLoading(userId);
    try {
      const response = await fetch("/api/admin/users", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, status }),
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Failed to update user");
      }

      // Refresh the list
      await fetchUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update user");
    } finally {
      setActionLoading(null);
    }
  };

  const pendingUsers = users.filter((u) => u.status === "pending");
  const approvedUsers = users.filter((u) => u.status === "approved");
  const rejectedUsers = users.filter((u) => u.status === "rejected");

  const StatusBadge = ({ status }: { status: string }) => {
    const styles = {
      pending: "bg-[#f7ecd2] text-[#9a7415]",
      approved: "bg-[var(--fep-band-bg)] text-[var(--fep-accent)]",
      rejected: "bg-[#f9efe9] text-[var(--fep-negative)]",
    };
    return (
      <span
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[status as keyof typeof styles]}`}
      >
        {status}
      </span>
    );
  };

  return (
    <AppShell
      title="User Management"
      subtitle="Approve or reject user signups."
      actions={
        <div className="flex flex-wrap items-center gap-3">
          <AdminSubNav />
          <Button onClick={fetchUsers} variant="outline" disabled={isLoading}>
            <RefreshCw
              className={`mr-2 h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        </div>
      }
    >
      <div className="mx-auto w-full max-w-4xl">
        {error && <div className="fep-banner-error mb-6">{error}</div>}

        <div className="mb-8 grid grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#f7ecd2] p-2">
                  <Clock className="h-5 w-5 text-[#9a7415]" />
                </div>
                <div>
                  <p className="fep-stat-value !mt-0 text-2xl">
                    {pendingUsers.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Pending</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[var(--fep-band-bg)] p-2">
                  <Check className="h-5 w-5 text-[var(--fep-accent)]" />
                </div>
                <div>
                  <p className="fep-stat-value !mt-0 text-2xl">
                    {approvedUsers.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Approved</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="rounded-full bg-[#f9efe9] p-2">
                  <X className="h-5 w-5 text-[var(--fep-negative)]" />
                </div>
                <div>
                  <p className="fep-stat-value !mt-0 text-2xl">
                    {rejectedUsers.length}
                  </p>
                  <p className="text-sm text-muted-foreground">Rejected</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Pending Users */}
        {pendingUsers.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-5 w-5 text-amber-500" />
                Pending Approval ({pendingUsers.length})
              </CardTitle>
              <CardDescription>
                These users are waiting for your approval
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {pendingUsers.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-card p-4"
                  >
                    <div>
                      <p className="font-medium">{user.email}</p>
                      <p className="text-sm text-muted-foreground">
                        Requested{" "}
                        {new Date(user.requested_at).toLocaleDateString()} at{" "}
                        {new Date(user.requested_at).toLocaleTimeString()}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-[var(--fep-negative)] hover:bg-[#f9efe9] hover:text-[var(--fep-negative)]"
                        onClick={() => handleApproval(user.user_id, "rejected")}
                        disabled={actionLoading === user.user_id}
                      >
                        <X className="mr-1 h-4 w-4" />
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleApproval(user.user_id, "approved")}
                        disabled={actionLoading === user.user_id}
                      >
                        <Check className="mr-1 h-4 w-4" />
                        Approve
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              All Users ({users.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="py-8 text-center text-muted-foreground">
                Loading users...
              </div>
            ) : users.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground">
                No users found
              </div>
            ) : (
              <div className="space-y-2">
                {users.map((user) => (
                  <div
                    key={user.id}
                    className="flex items-center justify-between rounded-lg border border-border p-3 transition-colors hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-3">
                      <StatusBadge status={user.status} />
                      <span className="font-medium">{user.email}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        {new Date(user.requested_at).toLocaleDateString()}
                      </span>
                      {user.status !== "approved" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleApproval(user.user_id, "approved")
                          }
                          disabled={actionLoading === user.user_id}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {user.status !== "rejected" && (
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() =>
                            handleApproval(user.user_id, "rejected")
                          }
                          disabled={actionLoading === user.user_id}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
