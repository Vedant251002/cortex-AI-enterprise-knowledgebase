import { useMemo, useState } from "react";
import { EmptyState } from "@/components/EmptyState";
import { formatDateTime } from "@/utils/format";
import type { AuditLogItem } from "@/types/api";

type SortDirection = "asc" | "desc";

interface AuditTableProps {
  items: AuditLogItem[];
}

export function AuditTable({ items }: AuditTableProps): JSX.Element {
  const [sortDirection, setSortDirection] = useState<SortDirection>("desc");

  const sorted = useMemo(() => {
    const copy = [...items];
    copy.sort((a, b) => {
      const aTime = new Date(a.timestamp).getTime();
      const bTime = new Date(b.timestamp).getTime();
      return sortDirection === "asc" ? aTime - bTime : bTime - aTime;
    });
    return copy;
  }, [items, sortDirection]);

  if (items.length === 0) {
    return (
      <EmptyState
        title="No audit events found"
        description="Try widening your filters or date range."
      />
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
      <table className="w-full min-w-[960px] text-left text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
            <th className="px-3 py-3">
              <button
                type="button"
                onClick={() => setSortDirection((d) => (d === "asc" ? "desc" : "asc"))}
                className="flex items-center gap-1 hover:text-slate-700"
              >
                Timestamp
                <span aria-hidden="true">{sortDirection === "asc" ? "↑" : "↓"}</span>
              </button>
            </th>
            <th className="px-3 py-3">User</th>
            <th className="px-3 py-3">Role</th>
            <th className="px-3 py-3">Event</th>
            <th className="px-3 py-3">Action</th>
            <th className="px-3 py-3">Resource</th>
            <th className="px-3 py-3">IP</th>
            <th className="px-3 py-3">Tokens</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map((item) => (
            <tr key={item.id} className="border-b border-slate-100 last:border-b-0">
              <td className="whitespace-nowrap px-3 py-3 text-slate-500">{formatDateTime(item.timestamp)}</td>
              <td className="px-3 py-3 text-slate-700">
                <div className="flex flex-col">
                  <span className="font-medium">{item.user_id}</span>
                  <span className="text-xs text-slate-400">{item.user_email}</span>
                </div>
              </td>
              <td className="px-3 py-3 capitalize text-slate-600">{item.user_role}</td>
              <td className="px-3 py-3 text-slate-600">{item.event_type.replace(/_/g, " ")}</td>
              <td className="px-3 py-3 text-slate-600">{item.action}</td>
              <td className="max-w-[220px] truncate px-3 py-3 text-slate-600">{item.resource}</td>
              <td className="px-3 py-3 text-slate-500">{item.ip_address}</td>
              <td className="px-3 py-3 text-slate-600">
                {item.token_usage ? item.token_usage.total_tokens : "—"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
