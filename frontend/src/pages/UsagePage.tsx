import { useQuery } from "@tanstack/react-query";
import { Cell, Legend, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { fetchMyUsage } from "@/api/endpoints";
import { QuotaBar } from "@/components/QuotaBar";
import { StatCard } from "@/components/StatCard";
import { SkeletonCard, SkeletonTable } from "@/components/Skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime, formatNumber } from "@/utils/format";

const PIE_COLORS = ["#2563eb", "#60a5fa"];

export function UsagePage(): JSX.Element {
  const usageQuery = useQuery({
    queryKey: ["usage", "me"],
    queryFn: () => fetchMyUsage(),
    staleTime: 15_000,
  });

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">My Usage</h1>
        <p className="text-sm text-slate-500">Track your token consumption over time.</p>
      </div>

      {usageQuery.isLoading && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
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
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard label="Today" value={formatNumber(usageQuery.data.today.total_tokens)} sublabel="total tokens" />
            <StatCard label="This week" value={formatNumber(usageQuery.data.week.total_tokens)} sublabel="total tokens" />
            <StatCard label="This month" value={formatNumber(usageQuery.data.month.total_tokens)} sublabel="total tokens" />
            <StatCard
              label="All time"
              value={formatNumber(usageQuery.data.all_time.total_tokens)}
              sublabel="total tokens"
            />
          </div>

          <QuotaBar quota={usageQuery.data.quota} />

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-1">
              <h2 className="mb-2 text-sm font-semibold text-slate-800">Prompt vs completion (all time)</h2>
              {usageQuery.data.all_time.total_tokens === 0 ? (
                <EmptyState title="No usage yet" description="Start chatting to see your token breakdown." />
              ) : (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={[
                          { name: "Prompt tokens", value: usageQuery.data.all_time.prompt_tokens },
                          { name: "Completion tokens", value: usageQuery.data.all_time.completion_tokens },
                        ]}
                        dataKey="value"
                        nameKey="name"
                        innerRadius={50}
                        outerRadius={80}
                        paddingAngle={2}
                      >
                        {PIE_COLORS.map((color) => (
                          <Cell key={color} fill={color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatNumber(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              )}
            </div>

            <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm lg:col-span-2">
              <h2 className="mb-3 text-sm font-semibold text-slate-800">Recent queries</h2>
              {usageQuery.data.recent_queries.length === 0 ? (
                <EmptyState title="No queries yet" description="Your recent chat queries will appear here." />
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[520px] text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                        <th className="py-2 pr-3">Time</th>
                        <th className="py-2 pr-3">Query</th>
                        <th className="py-2 pr-3 text-right">Prompt</th>
                        <th className="py-2 pr-3 text-right">Completion</th>
                        <th className="py-2 text-right">Total</th>
                      </tr>
                    </thead>
                    <tbody>
                      {usageQuery.data.recent_queries.map((q) => (
                        <tr key={q.id} className="border-b border-slate-100 last:border-b-0">
                          <td className="py-2 pr-3 text-slate-500">{formatDateTime(q.timestamp)}</td>
                          <td className="max-w-xs truncate py-2 pr-3 text-slate-700">{q.message_preview}</td>
                          <td className="py-2 pr-3 text-right text-slate-600">{formatNumber(q.prompt_tokens)}</td>
                          <td className="py-2 pr-3 text-right text-slate-600">
                            {formatNumber(q.completion_tokens)}
                          </td>
                          <td className="py-2 text-right font-medium text-slate-800">
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
        </>
      )}

      {usageQuery.isLoading && <SkeletonTable rows={4} cols={5} />}
    </div>
  );
}
