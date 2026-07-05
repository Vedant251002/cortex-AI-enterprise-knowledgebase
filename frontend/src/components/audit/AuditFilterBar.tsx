import type { ChangeEvent } from "react";
import { AUDIT_EVENT_TYPES, type AuditEventType } from "@/types/api";

export interface AuditFilters {
  userId: string;
  eventType: AuditEventType | "";
  dateFrom: string;
  dateTo: string;
  document: string;
}

interface AuditFilterBarProps {
  filters: AuditFilters;
  onChange: (filters: AuditFilters) => void;
  onExport: (format: "csv" | "json") => void;
  isExporting: boolean;
}

export function AuditFilterBar({
  filters,
  onChange,
  onExport,
  isExporting,
}: AuditFilterBarProps): JSX.Element {
  function update<K extends keyof AuditFilters>(key: K, value: AuditFilters[K]): void {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">User ID</label>
          <input
            type="text"
            value={filters.userId}
            onChange={(e: ChangeEvent<HTMLInputElement>) => update("userId", e.target.value)}
            placeholder="e.g. admin"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Event type</label>
          <select
            value={filters.eventType}
            onChange={(e) => update("eventType", e.target.value as AuditEventType | "")}
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          >
            <option value="">All events</option>
            {AUDIT_EVENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type.replace(/_/g, " ")}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">From</label>
          <input
            type="date"
            value={filters.dateFrom}
            onChange={(e) => update("dateFrom", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">To</label>
          <input
            type="date"
            value={filters.dateTo}
            onChange={(e) => update("dateTo", e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-slate-500">Document</label>
          <input
            type="text"
            value={filters.document}
            onChange={(e) => update("document", e.target.value)}
            placeholder="Document name"
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
          />
        </div>
      </div>

      <div className="flex items-center justify-end gap-2">
        <button
          type="button"
          disabled={isExporting}
          onClick={() => onExport("csv")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          Export CSV
        </button>
        <button
          type="button"
          disabled={isExporting}
          onClick={() => onExport("json")}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
        >
          Export JSON
        </button>
      </div>
    </div>
  );
}
