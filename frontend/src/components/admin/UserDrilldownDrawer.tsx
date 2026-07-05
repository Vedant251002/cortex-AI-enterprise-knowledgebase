import { useQuery } from "@tanstack/react-query";
import { fetchUserUsageDetail } from "@/api/endpoints";
import { DailyTrendChart } from "@/components/admin/DailyTrendChart";
import { EmptyState } from "@/components/EmptyState";
import { QueryErrorState } from "@/components/QueryErrorState";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import { StatCard } from "@/components/StatCard";
import { formatDateTime, formatNumber } from "@/utils/format";

export function UserDrilldownDrawer({
  userId,
  onClose,
}: {
  userId: string;
  onClose: () => void;
}): JSX.Element {
  const detailQuery = useQuery({
    queryKey: ["usage", "all", userId],
    queryFn: () => fetchUserUsageDetail(userId),
    staleTime: 15_000,
  });

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-900/30" onClick={onClose}>
      <div
        className="flex h-full w-full max-w-lg flex-col overflow-y-auto bg-white p-6 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Usage drill-down</p>
            <h2 className="text-lg font-semibold text-slate-900">{userId}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close drill-down"
            className="rounded-lg border border-slate-200 px-2 py-1 text-sm text-slate-500 hover:bg-slate-100"
          >
            Close
          </button>
        </div>

        {detailQuery.isLoading && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
              <SkeletonCard />
            </div>
            <SkeletonTable rows={4} cols={3} />
          </div>
        )}

        {detailQuery.isError && (
          <QueryErrorState
            message={detailQuery.error instanceof Error ? detailQuery.error.message : undefined}
            onRetry={() => detailQuery.refetch()}
          />
        )}

        {detailQuery.isSuccess && (
          <div className="flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-3">
              <StatCard label="Today" value={formatNumber(detailQuery.data.today.total_tokens)} sublabel="tokens" />
              <StatCard label="This week" value={formatNumber(detailQuery.data.week.total_tokens)} sublabel="tokens" />
              <StatCard
                label="This month"
                value={formatNumber(detailQuery.data.month.total_tokens)}
                sublabel="tokens"
              />
              <StatCard
                label="All time"
                value={formatNumber(detailQuery.data.all_time.total_tokens)}
                sublabel="tokens"
              />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">30-day trend</h3>
              <DailyTrendChart data={detailQuery.data.daily_history} />
            </div>

            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-800">Recent queries</h3>
              {detailQuery.data.recent_queries.length === 0 ? (
                <EmptyState title="No queries yet" description="This user hasn't asked anything yet." />
              ) : (
                <div className="overflow-x-auto rounded-lg border border-slate-200">
                  <table className="w-full min-w-[360px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="px-3 py-2">Time</th>
                        <th className="px-3 py-2">Query</th>
                        <th className="px-3 py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detailQuery.data.recent_queries.map((q) => (
                        <tr key={q.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="px-3 py-2 text-slate-500">{formatDateTime(q.timestamp)}</td>
                          <td className="max-w-[160px] truncate px-3 py-2 text-slate-700">{q.message_preview}</td>
                          <td className="px-3 py-2 text-right font-medium text-slate-800">
                            {formatNumber(q.total_tokens)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
