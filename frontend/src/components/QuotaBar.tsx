import { formatNumber } from "@/utils/format";
import type { QuotaStatus } from "@/types/api";

const WARNING_THRESHOLD = 0.8;

export function QuotaBar({ quota }: { quota: QuotaStatus }): JSX.Element {
  if (quota.limit === null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold text-slate-800">Daily token quota</h2>
        <p className="mt-2 text-sm text-slate-500">
          Unlimited for your role — {formatNumber(quota.used)} tokens used today.
        </p>
      </div>
    );
  }

  const percent = Math.min(100, Math.round((quota.percent_used ?? 0) * 100));
  const isWarning = !quota.exceeded && (quota.percent_used ?? 0) >= WARNING_THRESHOLD;
  const barColor = quota.exceeded ? "bg-red-600" : isWarning ? "bg-amber-500" : "bg-brand-600";
  const trackColor = quota.exceeded ? "bg-red-100" : isWarning ? "bg-amber-100" : "bg-slate-200";

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-800">Daily token quota</h2>
        <span className="text-xs font-medium text-slate-500">
          {formatNumber(quota.used)} / {formatNumber(quota.limit)}
        </span>
      </div>
      <div className={`mt-3 h-2 w-full overflow-hidden rounded-full ${trackColor}`}>
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${barColor}`}
          style={{ width: `${percent}%` }}
        />
      </div>
      {quota.exceeded ? (
        <p className="mt-2 text-xs font-medium text-red-600">
          Daily quota reached — chat is paused until it resets tomorrow.
        </p>
      ) : isWarning ? (
        <p className="mt-2 text-xs font-medium text-amber-600">
          You've used {percent}% of today's quota. Contact an admin to raise your limit if needed.
        </p>
      ) : (
        <p className="mt-2 text-xs text-slate-400">{formatNumber(quota.remaining ?? 0)} tokens remaining today.</p>
      )}
    </div>
  );
}
