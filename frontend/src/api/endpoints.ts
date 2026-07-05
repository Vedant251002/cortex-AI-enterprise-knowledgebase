import { apiClient, uploadFormWithProgress } from "@/api/client";
import type {
  AllUsageResponse,
  AuditQueryParams,
  AuditResponse,
  AuthUser,
  DocumentCategory,
  DocumentRecord,
  LoginRequest,
  LoginResponse,
  MyUsageResponse,
  UpdateDocumentCategoryRequest,
  UserUsageDetail,
} from "@/types/api";

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

export function login(payload: LoginRequest): Promise<LoginResponse> {
  return apiClient.post<LoginResponse>("/auth/login", payload);
}

export function fetchMe(signal?: AbortSignal): Promise<AuthUser> {
  return apiClient.get<AuthUser>("/auth/me", signal);
}

export function logout(): Promise<{ status: string }> {
  return apiClient.post<{ status: string }>("/auth/logout");
}

// ---------------------------------------------------------------------------
// Documents
// ---------------------------------------------------------------------------

export function fetchDocuments(): Promise<DocumentRecord[]> {
  return apiClient.get<DocumentRecord[]>("/documents");
}

export function fetchDocumentStatus(id: string): Promise<DocumentRecord> {
  return apiClient.get<DocumentRecord>(`/documents/${id}/status`);
}

export function uploadDocument(
  file: File,
  category: DocumentCategory,
  onProgress?: (percent: number) => void,
): Promise<DocumentRecord> {
  const form = new FormData();
  form.append("file", file);
  form.append("category", category);
  return uploadFormWithProgress<DocumentRecord>("/documents", form, onProgress);
}

export function deleteDocument(id: string): Promise<void> {
  return apiClient.delete<void>(`/documents/${id}`);
}

export function updateDocumentCategory(
  id: string,
  payload: UpdateDocumentCategoryRequest,
): Promise<DocumentRecord> {
  return apiClient.patch<DocumentRecord>(`/documents/${id}/category`, payload);
}

// ---------------------------------------------------------------------------
// Usage
// ---------------------------------------------------------------------------

export function fetchMyUsage(): Promise<MyUsageResponse> {
  return apiClient.get<MyUsageResponse>("/usage/me");
}

export function fetchAllUsage(): Promise<AllUsageResponse> {
  return apiClient.get<AllUsageResponse>("/usage/all");
}

export function fetchUserUsageDetail(userId: string): Promise<UserUsageDetail> {
  return apiClient.get<UserUsageDetail>(`/usage/all/${encodeURIComponent(userId)}`);
}

export function usageExportPath(format: "csv" | "json"): string {
  return `/usage/export?format=${format}`;
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

function buildAuditQueryString(params: AuditQueryParams): string {
  const search = new URLSearchParams();
  if (params.user_id) search.set("user_id", params.user_id);
  if (params.event_type) search.set("event_type", params.event_type);
  if (params.date_from) search.set("date_from", params.date_from);
  if (params.date_to) search.set("date_to", params.date_to);
  if (params.document) search.set("document", params.document);
  if (params.page_size) search.set("page_size", String(params.page_size));
  if (params.continuation_token) search.set("continuation_token", params.continuation_token);
  return search.toString();
}

export function fetchAuditLog(params: AuditQueryParams): Promise<AuditResponse> {
  const qs = buildAuditQueryString(params);
  return apiClient.get<AuditResponse>(`/audit${qs ? `?${qs}` : ""}`);
}

export function auditExportPath(
  format: "csv" | "json",
  filters: Omit<AuditQueryParams, "page_size" | "continuation_token">,
): string {
  const qs = buildAuditQueryString({ ...filters, page_size: undefined });
  return `/audit/export?format=${format}${qs ? `&${qs}` : ""}`;
}
