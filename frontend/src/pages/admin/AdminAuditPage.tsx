import { useState } from "react";
import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { auditExportPath, fetchAuditLog } from "@/api/endpoints";
import { downloadFile } from "@/api/client";
import { AuditFilterBar, type AuditFilters } from "@/components/audit/AuditFilterBar";
import { AuditTable } from "@/components/audit/AuditTable";
import { SkeletonTable } from "@/components/Skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { useToast } from "@/context/ToastContext";
import type { AuditQueryParams, AuditResponse, ExportFormat } from "@/types/api";

const PAGE_SIZE = 25;

const EMPTY_FILTERS: AuditFilters = {
  userId: "",
  eventType: "",
  dateFrom: "",
  dateTo: "",
  document: "",
};

function toQueryParams(filters: AuditFilters, continuationToken?: string): AuditQueryParams {
  return {
    user_id: filters.userId || undefined,
    event_type: filters.eventType || undefined,
    date_from: filters.dateFrom || undefined,
    date_to: filters.dateTo || undefined,
    document: filters.document || undefined,
    page_size: PAGE_SIZE,
    continuation_token: continuationToken,
  };
}

export function AdminAuditPage(): JSX.Element {
  const { showToast } = useToast();
  const queryClient = useQueryClient();
  const [filters, setFilters] = useState<AuditFilters>(EMPTY_FILTERS);
  const [isExporting, setIsExporting] = useState(false);

  const auditQueryKey = ["audit", filters] as const;

  const auditQuery = useInfiniteQuery<AuditResponse>({
    queryKey: auditQueryKey,
    queryFn: ({ pageParam }) =>
      fetchAuditLog(toQueryParams(filters, typeof pageParam === "string" ? pageParam : undefined)),
    initialPageParam: undefined,
    getNextPageParam: (lastPage) => lastPage.next_continuation_token ?? undefined,
    staleTime: 15_000,
  });

  const items = auditQuery.data?.pages.flatMap((page) => page.items) ?? [];

  async function handleExport(format: ExportFormat): Promise<void> {
    setIsExporting(true);
    try {
      const path = auditExportPath(format, {
        user_id: filters.userId || undefined,
        event_type: filters.eventType || undefined,
        date_from: filters.dateFrom || undefined,
        date_to: filters.dateTo || undefined,
        document: filters.document || undefined,
      });
      await downloadFile(path, `audit-export.${format}`);
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
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Audit Trail</h1>
        <p className="text-sm text-slate-500">Search and export the full activity log.</p>
      </div>

      <AuditFilterBar
        filters={filters}
        onChange={setFilters}
        onExport={handleExport}
        isExporting={isExporting}
      />

      {auditQuery.isLoading && <SkeletonTable rows={8} cols={8} />}

      {auditQuery.isError && !auditQuery.data && (
        <QueryErrorState
          message={auditQuery.error instanceof Error ? auditQuery.error.message : undefined}
          onRetry={() => auditQuery.refetch()}
        />
      )}

      {auditQuery.data && (
        <>
          <AuditTable items={items} />

          <div className="flex flex-col items-center gap-2">
            {auditQuery.isError && (
              <p className="text-sm text-red-700">
                {auditQuery.error instanceof Error ? auditQuery.error.message : "Couldn't load more results."}
              </p>
            )}
            {auditQuery.hasNextPage && (
              <button
                type="button"
                onClick={() =>
                  auditQuery.isError
                    ? queryClient.resetQueries({ queryKey: auditQueryKey })
                    : auditQuery.fetchNextPage()
                }
                disabled={auditQuery.isFetchingNextPage}
                className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 disabled:opacity-60"
              >
                {auditQuery.isFetchingNextPage ? "Loading..." : auditQuery.isError ? "Reload from start" : "Load more"}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
