import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useToast } from "@/context/ToastContext";
import type { LoginUserId, UserRole } from "@/types/api";

interface DemoUser {
  userId: LoginUserId;
  name: string;
  role: UserRole;
  initials: string;
  description: string;
  accent: string;
}

const DEMO_USERS: DemoUser[] = [
  {
    userId: "admin",
    name: "Aisha",
    role: "admin",
    initials: "AA",
    description: "Full access: all categories, uploads, audit trail, usage analytics.",
    accent: "bg-violet-600",
  },
  {
    userId: "analyst",
    name: "Arjun",
    role: "analyst",
    initials: "AR",
    description: "General + Finance categories, can upload documents and chat.",
    accent: "bg-blue-600",
  },
  {
    userId: "viewer",
    name: "Vik",
    role: "viewer",
    initials: "VV",
    description: "Read-only chat access to General category documents.",
    accent: "bg-teal-600",
  },
];

export function LoginPage(): JSX.Element {
  const { user, loginAs, isLoggingIn } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();
  const [pendingUserId, setPendingUserId] = useState<LoginUserId | null>(null);

  if (user) {
    const redirectTo = (location.state as { from?: string } | null)?.from ?? "/chat";
    return <Navigate to={redirectTo} replace />;
  }

  async function handleLogin(demoUser: DemoUser): Promise<void> {
    setPendingUserId(demoUser.userId);
    try {
      await loginAs(demoUser.userId);
      showToast(`Signed in as ${demoUser.name} (${demoUser.role})`, "success");
      navigate("/chat", { replace: true });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Login failed";
      showToast(message, "error");
    } finally {
      setPendingUserId(null);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-slate-100 via-white to-brand-50 px-4 py-12">
      <div className="w-full max-w-3xl">
        <div className="mb-10 text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-lg font-bold text-white">
            AQ
          </div>
          <h1 className="text-2xl font-semibold text-slate-900">Cortex</h1>
          <p className="mt-1 text-sm text-slate-500">AI Enterprise Knowledge Assistant</p>
          <p className="mt-4 text-sm text-slate-600">Choose a demo identity to sign in</p>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {DEMO_USERS.map((demoUser) => (
            <button
              key={demoUser.userId}
              type="button"
              disabled={isLoggingIn}
              onClick={() => handleLogin(demoUser)}
              className="flex flex-col items-center gap-3 rounded-2xl border border-slate-200 bg-white p-6 text-center shadow-sm transition hover:-translate-y-0.5 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
            >
              <div
                className={`flex h-14 w-14 items-center justify-center rounded-full text-lg font-semibold text-white ${demoUser.accent}`}
              >
                {demoUser.initials}
              </div>
              <div>
                <p className="text-base font-semibold text-slate-900">
                  {demoUser.role === "admin" ? "Admin" : demoUser.role === "analyst" ? "Analyst" : "Viewer"}{" "}
                  {demoUser.name}
                </p>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{demoUser.role}</p>
              </div>
              <p className="text-xs text-slate-500">{demoUser.description}</p>
              <span className="mt-2 inline-flex items-center rounded-lg bg-slate-900 px-4 py-2 text-xs font-medium text-white">
                {isLoggingIn && pendingUserId === demoUser.userId ? "Signing in..." : "Sign in"}
              </span>
            </button>
          ))}
        </div>

        <p className="mt-8 text-center text-xs text-slate-400">
          Simulated JWT auth for demo purposes — no password required.
        </p>
      </div>
    </div>
  );
}
