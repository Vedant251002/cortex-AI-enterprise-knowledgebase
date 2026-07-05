import { EmptyState } from "@/components/EmptyState";
import { formatCurrency, formatNumber } from "@/utils/format";
import type { LeaderboardEntry } from "@/types/api";

interface LeaderboardTableProps {
  entries: LeaderboardEntry[];
  onSelectUser?: (userId: string) => void;
}

export function LeaderboardTable({ entries, onSelectUser }: LeaderboardTableProps): JSX.Element {
  if (entries.length === 0) {
    return <EmptyState title="No usage data yet" description="Leaderboard will populate as users chat." />;
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[520px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-3">Rank</th>
            <th className="px-3 py-3">User</th>
            <th className="px-3 py-3 text-right">Total tokens</th>
            <th className="px-3 py-3 text-right">Queries</th>
            <th className="px-3 py-3 text-right">Estimated cost</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry, index) => (
            <tr
              key={entry.user_id}
              onClick={() => onSelectUser?.(entry.user_id)}
              className={`border-b border-slate-100 last:border-b-0 ${
                onSelectUser ? "cursor-pointer hover:bg-slate-50" : ""
              }`}
            >
              <td className="px-3 py-3 text-slate-500">#{index + 1}</td>
              <td className="px-3 py-3 font-medium text-brand-700 underline-offset-2 hover:underline">
                {entry.user_id}
              </td>
              <td className="px-3 py-3 text-right text-slate-600">{formatNumber(entry.total_tokens)}</td>
              <td className="px-3 py-3 text-right text-slate-600">{formatNumber(entry.query_count)}</td>
              <td className="px-3 py-3 text-right text-slate-600">{formatCurrency(entry.estimated_cost)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
