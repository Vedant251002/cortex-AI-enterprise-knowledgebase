import { useState } from "react";
import { StatusPill } from "@/components/StatusPill";
import { useDocumentStatusPoll } from "@/hooks/useDocumentStatusPoll";
import { formatDateTime } from "@/utils/format";
import {
  DOCUMENT_CATEGORIES,
  TERMINAL_DOCUMENT_STATUSES,
  type DocumentCategory,
  type DocumentRecord,
} from "@/types/api";

interface DocumentRowProps {
  document: DocumentRecord;
  canManageColumn: boolean;
  canRecategorize: boolean;
  canDelete: boolean;
  onDelete: (id: string) => void;
  onRecategorize: (id: string, category: DocumentCategory) => void;
  isDeleting: boolean;
  isRecategorizing: boolean;
}

export function DocumentRow({
  document,
  canManageColumn,
  canRecategorize,
  canDelete,
  onDelete,
  onRecategorize,
  isDeleting,
  isRecategorizing,
}: DocumentRowProps): JSX.Element {
  const { data: liveDocument } = useDocumentStatusPoll(document);
  // Once a document reaches a terminal status, its status-poll query stops
  // refetching and freezes on stale data — trust the parent's fresh prop
  // instead, so category/name edits show up without a full page reload.
  const current = TERMINAL_DOCUMENT_STATUSES.includes(document.status)
    ? document
    : liveDocument ?? document;
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  return (
    <tr className="border-b border-slate-100 last:border-b-0">
      <td className="px-3 py-3 text-sm font-medium text-slate-800">{current.document_name}</td>
      <td className="px-3 py-3 text-sm capitalize text-slate-600">
        {canRecategorize ? (
          <select
            value={current.document_category}
            disabled={isRecategorizing}
            onChange={(e) => onRecategorize(current.id, e.target.value as DocumentCategory)}
            className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm capitalize focus:border-brand-500 focus:outline-none"
          >
            {DOCUMENT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        ) : (
          current.document_category
        )}
      </td>
      <td className="px-3 py-3 text-sm text-slate-600">{current.uploaded_by}</td>
      <td className="px-3 py-3 text-sm text-slate-500">{formatDateTime(current.upload_timestamp)}</td>
      <td className="px-3 py-3 text-sm text-slate-600">{current.page_count ?? "—"}</td>
      <td className="px-3 py-3 text-sm text-slate-600">{current.chunk_count ?? "—"}</td>
      <td className="px-3 py-3">
        <StatusPill status={current.status} />
      </td>
      {canManageColumn && (
        <td className="px-3 py-3 text-right">
          {!canDelete ? (
            <span className="text-xs text-slate-400">—</span>
          ) : confirmingDelete ? (
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                disabled={isDeleting}
                onClick={() => onDelete(current.id)}
                className="rounded-lg bg-red-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-red-700 disabled:opacity-60"
              >
                {isDeleting ? "Deleting..." : "Confirm"}
              </button>
              <button
                type="button"
                onClick={() => setConfirmingDelete(false)}
                className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmingDelete(true)}
              className="rounded-lg border border-red-200 px-2.5 py-1 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              Delete
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
