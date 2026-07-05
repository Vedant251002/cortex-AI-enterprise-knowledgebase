import { useQuery } from "@tanstack/react-query";
import { fetchDocumentStatus } from "@/api/endpoints";
import { TERMINAL_DOCUMENT_STATUSES } from "@/types/api";
import type { DocumentRecord } from "@/types/api";

/**
 * Polls GET /documents/{id}/status every 2s while the document is in a
 * non-terminal state (uploaded/extracting/chunking/indexing), stopping once
 * it reaches ready/failed.
 */
export function useDocumentStatusPoll(document: DocumentRecord) {
  return useQuery<DocumentRecord>({
    queryKey: ["document-status", document.id],
    queryFn: () => fetchDocumentStatus(document.id),
    initialData: document,
    refetchInterval: (query) => {
      const latest = query.state.data;
      if (!latest || TERMINAL_DOCUMENT_STATUSES.includes(latest.status)) {
        return false;
      }
      return 2000;
    },
  });
}
