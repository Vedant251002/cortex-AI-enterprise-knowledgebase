import type { DocumentCategory, UserRole } from "@/types/api";

/**
 * Minimal JWT payload decoder. Deliberately does NOT verify the signature - the backend is
 * the only party that ever needs to trust a token's claims (every RBAC decision is re-checked
 * server-side). This exists purely so the UI's role-based rendering is sourced from the same
 * JWT claims the backend issues (sub/email/name/role/categories/session_id), rather than a
 * separate copy of those fields in the login response body.
 */
export interface JwtPayload {
  sub: string;
  email: string;
  name: string;
  role: UserRole;
  categories: DocumentCategory[];
  session_id: string;
  iat: number;
  exp: number;
}

function base64UrlDecode(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  return decodeURIComponent(
    atob(padded)
      .split("")
      .map((c) => `%${c.charCodeAt(0).toString(16).padStart(2, "0")}`)
      .join(""),
  );
}

export function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const [, payloadSegment] = token.split(".");
    if (!payloadSegment) return null;
    return JSON.parse(base64UrlDecode(payloadSegment)) as JwtPayload;
  } catch {
    return null;
  }
}
