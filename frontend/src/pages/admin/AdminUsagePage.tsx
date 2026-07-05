import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { fetchAllUsage, usageExportPath } from "@/api/endpoints";
import { downloadFile } from "@/api/client";
import { StatCard } from "@/components/StatCard";
import { LeaderboardTable } from "@/components/admin/LeaderboardTable";
import { DailyTrendChart } from "@/components/admin/DailyTrendChart";
import { UserDrilldownDrawer } from "@/components/admin/UserDrilldownDrawer";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { useToast } from "@/context/ToastContext";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { ExportFormat } from "@/types/api";

export function AdminUsagePage(): JSX.Element {
  const { showToast } = useToast();
  const [isExporting, setIsExporting] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);

  const usageQuery = useQuery({
    queryKey: ["usage", "all"],
    queryFn: () => fetchAllUsage(),
    staleTime: 15_000,
  });

  const totalTokens = usageQuery.data?.leaderboard.reduce((sum, e) => sum + e.total_tokens, 0) ?? 0;
  const totalQueries = usageQuery.data?.leaderboard.reduce((sum, e) => sum + e.query_count, 0) ?? 0;
  const totalCost = usageQuery.data?.leaderboard.reduce((sum, e) => sum + e.estimated_cost, 0) ?? 0;

  async function handleExport(format: ExportFormat): Promise<void> {
    setIsExporting(true);
    try {
      await downloadFile(usageExportPath(format), `usage-export.${format}`);
      showToast("Export downloaded.", "success");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Export failed";
      showToast(message, "error");
    } finally {
      setIsExporting(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">Usage Analytics</h1>
          <p className="text-sm text-slate-500">Org-wide token consumption and estimated cost.</p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("csv")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            Export CSV
          </button>
          <button
            type="button"
            disabled={isExporting}
            onClick={() => handleExport("json")}
            className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
          >
            Export JSON
          </button>
        </div>
      </div>

      {usageQuery.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <SkeletonCard />
          <SkeletonCard />
          <SkeletonCard />
        </div>
      )}

      {usageQuery.isError && (
        <QueryErrorState
          message={usageQuery.error instanceof Error ? usageQuery.error.message : undefined}
          onRetry={() => usageQuery.refetch()}
        />
      )}

      {usageQuery.isSuccess && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Total tokens" value={formatNumber(totalTokens)} sublabel="across all users" />
            <StatCard label="Total queries" value={formatNumber(totalQueries)} sublabel="across all users" />
            <StatCard label="Estimated cost" value={formatCurrency(totalCost)} sublabel="across all users" />
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Daily token trend</h2>
            <DailyTrendChart data={usageQuery.data.daily_trend} />
          </div>

          <div>
            <h2 className="mb-3 text-sm font-semibold text-slate-800">Leaderboard</h2>
            <p className="mb-2 text-xs text-slate-400">Click a user to see their detailed usage history.</p>
            <LeaderboardTable entries={usageQuery.data.leaderboard} onSelectUser={setSelectedUserId} />
          </div>
        </>
      )}

      {usageQuery.isLoading && <SkeletonTable rows={5} cols={5} />}

      {selectedUserId && (
        <UserDrilldownDrawer userId={selectedUserId} onClose={() => setSelectedUserId(null)} />
      )}
    </div>
  );
}
