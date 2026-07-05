import { Outlet } from "react-router-dom";
import { Sidebar } from "@/components/Sidebar";
import { MobileNav } from "@/components/MobileNav";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function AppLayout(): JSX.Element {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-slate-50">
      <div className="no-print hidden md:block">
        <Sidebar />
      </div>
      <div className="flex flex-1 flex-col overflow-hidden">
        <MobileNav />
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto h-full max-w-7xl px-4 py-6 md:px-8">
            <ErrorBoundary>
              <Outlet />
            </ErrorBoundary>
          </div>
        </main>
      </div>
    </div>
  );
}
