import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useTheme } from "@/context/ThemeContext";
import { canViewAdminUsage, canViewAudit } from "@/utils/rbac";

const LINKS = [
  { to: "/chat", label: "Chat" },
  { to: "/documents", label: "Documents" },
  { to: "/usage", label: "My Usage" },
];

const ADMIN_LINKS = [
  { to: "/admin/audit", label: "Audit Trail" },
  { to: "/admin/usage", label: "Usage Analytics" },
];

export function MobileNav(): JSX.Element | null {
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const [open, setOpen] = useState(false);

  if (!user) return null;

  const showAdminSection = canViewAudit(user.role) || canViewAdminUsage(user.role);
  const links = showAdminSection ? [...LINKS, ...ADMIN_LINKS] : LINKS;

  return (
    <div className="no-print sticky top-0 z-40 flex items-center justify-between border-b border-slate-200 bg-white px-4 py-3 md:hidden">
      <div className="flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-md bg-brand-600 text-xs font-bold text-white">
          AQ
        </div>
        <span className="text-sm font-semibold text-slate-900">Cortex</span>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Toggle navigation menu"
        className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700"
      >
        Menu
      </button>

      {open && (
        <div className="absolute left-0 top-full flex w-full flex-col border-b border-slate-200 bg-white p-2 shadow-lg">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              onClick={() => setOpen(false)}
              className={({ isActive }) =>
                `rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive ? "bg-brand-600 text-white" : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {link.label}
            </NavLink>
          ))}
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              toggleTheme();
            }}
            className="mt-1 rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            <span aria-hidden="true">{theme === "dark" ? "☀️" : "🌙"}</span>{" "}
            {theme === "dark" ? "Light mode" : "Dark mode"}
          </button>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              logout();
            }}
            className="rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-600 hover:bg-slate-100"
          >
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
