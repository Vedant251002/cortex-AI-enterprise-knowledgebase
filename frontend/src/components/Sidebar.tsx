import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { canViewAdminUsage, canViewAudit } from "@/utils/rbac";
import { initialsFromName } from "@/utils/format";

interface NavItem {
  to: string;
  label: string;
  icon: string;
}

const PRIMARY_NAV: NavItem[] = [
  { to: "/chat", label: "Chat", icon: "\u{1F4AC}" },
  { to: "/documents", label: "Documents", icon: "\u{1F4C4}" },
  { to: "/usage", label: "My Usage", icon: "\u{1F4CA}" },
];

const ADMIN_NAV: NavItem[] = [
  { to: "/admin/audit", label: "Audit Trail", icon: "\u{1F50E}" },
  { to: "/admin/usage", label: "Usage Analytics", icon: "\u{1F4C8}" },
];

function navLinkClasses(isActive: boolean): string {
  return [
    "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
    isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-900",
  ].join(" ");
}

export function Sidebar(): JSX.Element | null {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  if (!user) return null;

  const showAdminSection = canViewAudit(user.role) || canViewAdminUsage(user.role);

  return (
    <aside className="flex h-full w-64 flex-col border-r border-slate-200 bg-white px-4 py-6">
      <div className="mb-8 flex items-center gap-2 px-2">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
          AQ
        </div>
        <div>
          <p className="text-sm font-semibold text-slate-900">Cortex</p>
          <p className="text-xs text-slate-500">Knowledge Assistant</p>
        </div>
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        <p className="mb-1 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Workspace
        </p>
        {/* Documents page is visible to all roles; upload controls are hidden inside for viewer. */}
        {PRIMARY_NAV.map((item) => (
          <NavLink key={item.to} to={item.to} className={({ isActive }) => navLinkClasses(isActive)}>
            <span aria-hidden="true">{item.icon}</span>
            {item.label}
          </NavLink>
        ))}

        {showAdminSection && (
          <>
            <p className="mb-1 mt-6 px-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
              Admin
            </p>
            {ADMIN_NAV.map((item) => (
              <NavLink key={item.to} to={item.to} className={({ isActive }) => navLinkClasses(isActive)}>
                <span aria-hidden="true">{item.icon}</span>
                {item.label}
              </NavLink>
            ))}
          </>
        )}
      </nav>

      <div className="mt-6 flex items-center gap-3 rounded-lg border border-slate-200 p-3">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-100 text-sm font-semibold text-brand-700">
          {initialsFromName(user.name)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium text-slate-900">{user.name}</p>
          <p className="truncate text-xs capitalize text-slate-500">{user.role}</p>
        </div>
      </div>
      <button
        type="button"
        onClick={toggleTheme}
        className="mt-3 flex items-center justify-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
        aria-label="Toggle dark mode"
      >
        <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>
        {theme === "dark" ? "Light mode" : "Dark mode"}
      </button>
      <button
        type="button"
        onClick={logout}
        className="mt-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
      >
        Log out
      </button>
    </aside>
  );
}
