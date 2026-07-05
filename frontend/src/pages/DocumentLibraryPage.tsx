import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  deleteDocument,
  fetchDocuments,
  updateDocumentCategory,
  uploadDocument,
} from "@/api/endpoints";
import { ApiError } from "@/api/client";
import { UploadZone } from "@/components/documents/UploadZone";
import { DocumentRow } from "@/components/documents/DocumentRow";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonTable } from "@/components/Skeleton";
import { QueryErrorState } from "@/components/QueryErrorState";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import { canDeleteDocument, canManageDocuments, canRecategorize, canUpload } from "@/utils/rbac";
import type { DocumentCategory } from "@/types/api";

const DOCUMENTS_QUERY_KEY = ["documents"] as const;

export function DocumentLibraryPage(): JSX.Element {
  const { user } = useAuth();
  const { showToast } = useToast();
  const queryClient = useQueryClient();

  const documentsQuery = useQuery({
    queryKey: DOCUMENTS_QUERY_KEY,
    queryFn: () => fetchDocuments(),
    staleTime: 30_000,
  });

  const [uploadProgress, setUploadProgress] = useState<number | null>(null);

  const uploadMutation = useMutation({
    mutationFn: ({ file, category }: { file: File; category: DocumentCategory }) =>
      uploadDocument(file, category, setUploadProgress),
    onSuccess: () => {
      showToast("Document uploaded — processing started.", "success");
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Upload failed";
      showToast(message, "error");
    },
    onSettled: () => setUploadProgress(null),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteDocument(id),
    onSuccess: () => {
      showToast("Document deleted.", "success");
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Delete failed";
      showToast(message, "error");
    },
  });

  const recategorizeMutation = useMutation({
    mutationFn: ({ id, category }: { id: string; category: DocumentCategory }) =>
      updateDocumentCategory(id, { category }),
    onSuccess: () => {
      showToast("Category updated.", "success");
      queryClient.invalidateQueries({ queryKey: DOCUMENTS_QUERY_KEY });
    },
    onError: (err) => {
      const message = err instanceof ApiError ? err.message : "Category update failed";
      showToast(message, "error");
    },
  });

  if (!user) return <></>;

  const showUpload = canUpload(user.role);
  const canManage = canManageDocuments(user.role);
  const recategorizeAllowed = canRecategorize(user.role);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Document Library</h1>
        <p className="text-sm text-slate-500">
          Browse ingested documents{showUpload ? " and upload new ones" : ""}.
        </p>
      </div>

      {showUpload && (
        <UploadZone
          isUploading={uploadMutation.isPending}
          uploadProgress={uploadMutation.isPending ? uploadProgress : null}
          onUpload={(file, category) => uploadMutation.mutate({ file, category })}
        />
      )}

      {documentsQuery.isLoading && <SkeletonTable rows={5} cols={canManage ? 8 : 7} />}

      {documentsQuery.isError && (
        <QueryErrorState
          message={documentsQuery.error instanceof Error ? documentsQuery.error.message : undefined}
          onRetry={() => documentsQuery.refetch()}
        />
      )}

      {documentsQuery.isSuccess && documentsQuery.data.length === 0 && (
        <EmptyState
          title="No documents yet"
          description={
            showUpload
              ? "Upload your first document to get started."
              : "No documents are available for your access level yet."
          }
        />
      )}

      {documentsQuery.isSuccess && documentsQuery.data.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full min-w-[720px] text-left">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <th className="px-3 py-3">Name</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Owner</th>
                <th className="px-3 py-3">Uploaded</th>
                <th className="px-3 py-3">Pages</th>
                <th className="px-3 py-3">Chunks</th>
                <th className="px-3 py-3">Status</th>
                {canManage && <th className="px-3 py-3 text-right">Actions</th>}
              </tr>
            </thead>
            <tbody>
              {documentsQuery.data.map((doc) => (
                <DocumentRow
                  key={doc.id}
                  document={doc}
                  canManageColumn={canManage}
                  canRecategorize={recategorizeAllowed}
                  canDelete={canDeleteDocument(user.role, user.id, doc.uploaded_by)}
                  isDeleting={deleteMutation.isPending && deleteMutation.variables === doc.id}
                  isRecategorizing={
                    recategorizeMutation.isPending && recategorizeMutation.variables?.id === doc.id
                  }
                  onDelete={(id) => deleteMutation.mutate(id)}
                  onRecategorize={(id, category) => recategorizeMutation.mutate({ id, category })}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
