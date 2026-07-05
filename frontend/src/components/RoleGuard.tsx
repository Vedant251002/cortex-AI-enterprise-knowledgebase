import { useEffect, type ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { UserRole } from "@/types/api";

interface RoleGuardProps {
  allowedRoles: UserRole[];
  children: ReactNode;
}

/**
 * Client-side route guard. Redirects to /chat with a toast when the current
 * user's role isn't in `allowedRoles`. This is a UX convenience only — the
 * backend independently enforces the real access control on every request.
 */
export function RoleGuard({ allowedRoles, children }: RoleGuardProps): ReactNode {
  const { user } = useAuth();
  const { showToast } = useToast();

  const isAllowed = !!user && allowedRoles.includes(user.role);

  useEffect(() => {
    if (user && !isAllowed) {
      showToast("You don't have permission to view that page.", "warning");
    }
  }, [user, isAllowed, showToast]);

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (!isAllowed) {
    return <Navigate to="/chat" replace />;
  }

  return children;
}
