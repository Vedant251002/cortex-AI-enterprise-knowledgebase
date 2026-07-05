import type { DocumentStatus } from "@/types/api";

const STATUS_STYLES: Record<DocumentStatus, string> = {
  uploaded: "bg-slate-100 text-slate-700 ring-slate-300",
  extracting: "bg-amber-100 text-amber-800 ring-amber-300",
  chunking: "bg-amber-100 text-amber-800 ring-amber-300",
  indexing: "bg-blue-100 text-blue-800 ring-blue-300",
  ready: "bg-emerald-100 text-emerald-800 ring-emerald-300",
  failed: "bg-red-100 text-red-800 ring-red-300",
};

const STATUS_LABELS: Record<DocumentStatus, string> = {
  uploaded: "Uploaded",
  extracting: "Extracting",
  chunking: "Chunking",
  indexing: "Indexing",
  ready: "Ready",
  failed: "Failed",
};

const IN_PROGRESS: DocumentStatus[] = ["uploaded", "extracting", "chunking", "indexing"];

export function StatusPill({ status }: { status: DocumentStatus }): JSX.Element {
  const isSpinning = IN_PROGRESS.includes(status);
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${STATUS_STYLES[status]}`}
    >
      {isSpinning && (
        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-current" aria-hidden="true" />
      )}
      {STATUS_LABELS[status]}
    </span>
  );
}
