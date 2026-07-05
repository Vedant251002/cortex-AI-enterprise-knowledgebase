import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { EmptyState } from "@/components/EmptyState";
import { formatNumber } from "@/utils/format";
import type { DailyTrendPoint } from "@/types/api";

export function DailyTrendChart({ data }: { data: DailyTrendPoint[] }): JSX.Element {
  if (data.length === 0) {
    return <EmptyState title="No trend data yet" description="Daily token usage will appear here." />;
  }

  return (
    <div className="h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis dataKey="date" tick={{ fontSize: 12 }} />
          <YAxis tick={{ fontSize: 12 }} tickFormatter={(value: number) => formatNumber(value)} />
          <Tooltip formatter={(value: number) => formatNumber(value)} />
          <Line type="monotone" dataKey="total_tokens" stroke="#2563eb" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
