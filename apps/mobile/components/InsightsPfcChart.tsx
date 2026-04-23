import { useMemo } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Line, Polyline, Text as SvgText } from "react-native-svg";

type Point = {
  date: string;
  protein: number;
  fat: number;
  carbs: number;
};

const CHART_LEFT = 44;
const CHART_RIGHT = 10;
const CHART_TOP = 10;
const CHART_BOTTOM = 30;
const SVG_H = 196;
const LEGEND_ROW_H = 26;

type Props = {
  data: Point[];
};

function dateTickLabel(date: string): string {
  return date.slice(5);
}

/** 上端を「きりの良い」最大値にそろえて Y 軸と折れ線のスケールを一致させる */
function niceYMax(raw: number): number {
  if (raw <= 0) return 1;
  const exp = Math.floor(Math.log10(raw));
  const base = 10 ** exp;
  const frac = raw / base;
  const niceFrac = frac <= 1 ? 1 : frac <= 2 ? 2 : frac <= 5 ? 5 : 10;
  return niceFrac * base;
}

function yTickValues(yMax: number): number[] {
  const n = 5;
  return Array.from({ length: n }, (_, i) => (yMax * i) / (n - 1));
}

function xTickIndices(len: number): number[] {
  if (len === 0) return [];
  const maxLabels = 7;
  if (len <= maxLabels) return Array.from({ length: len }, (_, i) => i);
  const inner = maxLabels - 1;
  const step = Math.max(1, Math.ceil((len - 1) / inner));
  const out: number[] = [];
  for (let i = 0; i < len; i += step) out.push(i);
  if (out[out.length - 1] !== len - 1) out.push(len - 1);
  return out;
}

export function InsightsPfcChart({ data }: Props) {
  const { width: winW } = useWindowDimensions();
  const chartW = Math.max(200, winW - 32);
  const innerW = chartW - CHART_LEFT - CHART_RIGHT;
  const innerH = SVG_H - CHART_TOP - CHART_BOTTOM;

  const layout = useMemo(() => {
    const n = data.length;
    if (n === 0) {
      return {
        proteinPts: "",
        fatPts: "",
        carbsPts: "",
        yMax: 1,
        yTicks: [0, 1],
        xTicks: [] as { i: number; label: string; x: number }[],
        gridYs: [] as number[],
      };
    }
    const rawMax = Math.max(...data.flatMap((d) => [d.protein, d.fat, d.carbs]));
    const yMax = niceYMax(rawMax);
    const yTicks = yTickValues(yMax);
    const xAt = (i: number) =>
      n <= 1 ? CHART_LEFT + innerW / 2 : CHART_LEFT + (innerW * i) / (n - 1);
    const yAt = (v: number) => CHART_TOP + innerH - (v / yMax) * innerH;
    const mk = (key: "protein" | "fat" | "carbs") =>
      data.map((d, i) => `${xAt(i)},${yAt(d[key])}`).join(" ");
    const gridYs = yTicks.map((tv) => yAt(tv));
    const xi = xTickIndices(n);
    const xTicks = xi.map((i) => ({
      i,
      label: dateTickLabel(data[i]!.date),
      x: xAt(i),
    }));
    return {
      proteinPts: mk("protein"),
      fatPts: mk("fat"),
      carbsPts: mk("carbs"),
      yMax,
      yTicks,
      xTicks,
      gridYs,
    };
  }, [data, innerH, innerW]);

  if (data.length === 0) {
    return <View style={{ minHeight: SVG_H + LEGEND_ROW_H }} />;
  }

  const baseY = CHART_TOP + innerH;

  return (
    <View style={styles.wrap}>
      <Svg width={chartW} height={SVG_H}>
        {layout.gridYs.map((gy, idx) => (
          <Line
            key={`h-${idx}`}
            x1={CHART_LEFT}
            y1={gy}
            x2={CHART_LEFT + innerW}
            y2={gy}
            stroke="#374151"
            strokeWidth={1}
            strokeDasharray="4 4"
          />
        ))}
        <Line
          x1={CHART_LEFT}
          y1={CHART_TOP}
          x2={CHART_LEFT}
          y2={baseY}
          stroke="#6b7280"
          strokeWidth={1}
        />
        <Line
          x1={CHART_LEFT}
          y1={baseY}
          x2={CHART_LEFT + innerW}
          y2={baseY}
          stroke="#6b7280"
          strokeWidth={1}
        />
        {layout.yTicks.map((tv, idx) => {
          const gy = layout.gridYs[idx] ?? CHART_TOP + innerH;
          const yLabel =
            Math.abs(tv - Math.round(tv)) < 1e-6 ? String(Math.round(tv)) : tv.toFixed(1);
          return (
            <SvgText
              key={`y-${idx}`}
              x={CHART_LEFT - 6}
              y={gy + 4}
              fontSize={10}
              fill="#9ca3af"
              textAnchor="end"
            >
              {yLabel}
            </SvgText>
          );
        })}
        {layout.xTicks.map((t, idx) => (
          <SvgText
            key={`x-${t.i}-${idx}`}
            x={t.x}
            y={baseY + 16}
            fontSize={10}
            fill="#9ca3af"
            textAnchor="middle"
          >
            {t.label}
          </SvgText>
        ))}
        <Polyline
          points={layout.proteinPts}
          fill="none"
          stroke="#60a5fa"
          strokeWidth={2}
        />
        <Polyline
          points={layout.fatPts}
          fill="none"
          stroke="#facc15"
          strokeWidth={2}
        />
        <Polyline
          points={layout.carbsPts}
          fill="none"
          stroke="#34d399"
          strokeWidth={2}
        />
      </Svg>
      <View style={styles.legendRow}>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#60a5fa" }]} />
          <Text style={styles.legendText}>P</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#facc15" }]} />
          <Text style={styles.legendText}>F</Text>
        </View>
        <View style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: "#34d399" }]} />
          <Text style={styles.legendText}>C</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignSelf: "stretch" },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 20,
    height: LEGEND_ROW_H,
    paddingTop: 4,
  },
  legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
  legendDot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { color: "#d1d5db", fontSize: 13, fontWeight: "600" },
});
