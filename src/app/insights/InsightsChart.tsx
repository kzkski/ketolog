"use client";

import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = {
  date: string;
  protein: number;
  fat: number;
  carbs: number;
};

function dateLabel(date: string): string {
  return date.slice(5);
}

type LegendItem = {
  value?: string | number;
  color?: string;
};

/** Recharts Tooltip の既定 itemSorter は name（アルファベット順）で、P/F/C が C→F→P と並ぶ。PFC の表示順に合わせる。 */
const PFC_TOOLTIP_ORDER: Record<string, number> = { P: 0, F: 1, C: 2 };

function LegendContent(props: { payload?: LegendItem[] }) {
  const payload = props.payload ?? [];
  const ordered = ["P", "F", "C"]
    .map((name) => payload.find((p) => p.value === name))
    .filter(Boolean);

  return (
    <div className="mt-1 flex items-center justify-center gap-4 text-sm">
      {ordered.map((item) => (
        <span key={item!.value as string} className="inline-flex items-center gap-1">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: item!.color ?? "#9ca3af" }}
          />
          <span>{item!.value as string}</span>
        </span>
      ))}
    </div>
  );
}

export default function InsightsChart({ data }: { data: Point[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
          <XAxis
            dataKey="date"
            tickFormatter={dateLabel}
            stroke="#9ca3af"
            tick={{ fontSize: 11 }}
          />
          <YAxis stroke="#9ca3af" tick={{ fontSize: 11 }} />
          <Tooltip
            formatter={(value) => (typeof value === "number" ? value.toFixed(1) : String(value ?? ""))}
            labelFormatter={(label) => `${label}`}
            contentStyle={{ backgroundColor: "#111827", border: "1px solid #374151" }}
            itemSorter={(item) => PFC_TOOLTIP_ORDER[String(item.name ?? "")] ?? 99}
          />
          <Legend content={<LegendContent />} />
          <Line type="monotone" dataKey="protein" name="P" stroke="#60a5fa" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="fat" name="F" stroke="#facc15" strokeWidth={2} dot={false} />
          <Line type="monotone" dataKey="carbs" name="C" stroke="#34d399" strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
