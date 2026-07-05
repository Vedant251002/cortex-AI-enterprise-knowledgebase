import type { DocumentCategory, UserRole } from "@/types/api";

// Client-side mirror of the RBAC role -> category mapping. This is only used
// for nav/UI conditionals; the server is the source of truth and enforces
// the real access control on every request.
export const ROLE_CATEGORIES: Record<UserRole, DocumentCategory[]> = {
  admin: ["general", "finance", "hr", "legal", "engineering"],
  analyst: ["general", "finance"],
  viewer: ["general"],
};

export function canUpload(role: UserRole): boolean {
  return role === "admin" || role === "analyst";
}

export function canRecategorize(role: UserRole): boolean {
  return role === "admin";
}

// Mirrors the backend rule: admin can delete any document, analyst only their own uploads.
export function canDeleteDocument(role: UserRole, userId: string, uploadedBy: string): boolean {
  if (role === "admin") return true;
  return role === "analyst" && uploadedBy === userId;
}

// Whether the Actions column should render at all for this role.
export function canManageDocuments(role: UserRole): boolean {
  return role === "admin" || role === "analyst";
}

export function canViewAudit(role: UserRole): boolean {
  return role === "admin";
}

export function canViewAdminUsage(role: UserRole): boolean {
  return role === "admin";
}
