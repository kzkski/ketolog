import { useCallback, useMemo, useState } from "react";
import type { LayoutChangeEvent } from "react-native";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import Svg, { Line, Polyline, Text as SvgText } from "react-native-svg";

type Point = {
  date: string;
  protein: number | null;
  fat: number | null;
  carbs: number | null;
};

const CHART_LEFT = 44;
const CHART_RIGHT = 12;
const CHART_TOP = 10;
const CHART_BOTTOM = 30;
/** 折れ線・X 目盛りの左右余白（ラベルが SVG 外にはみ出さないようにする） */
const PLOT_PAD_X = 14;
const SVG_H = 196;
const LEGEND_ROW_H = 26;

type Props = {
  data: Point[];
  /** 軸ラベル等用。現状は未表示だが Web と揃えて受け取る */
  unitLabel?: string;
};

function dateTickLabel(date: string): string {
  return date.slice(5);
}

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

function isFiniteNumber(v: number | null | undefined): v is number {
  return v != null && Number.isFinite(v);
}

/** null で途切れる折れ線セグメント（連続する有効点のみを結ぶ） */
function buildPolylineSegments(
  data: Point[],
  key: "protein" | "fat" | "carbs",
  xAt: (i: number) => number,
  yAt: (v: number) => number
): string[] {
  const segments: string[] = [];
  let current: string[] = [];
  for (let i = 0; i < data.length; i++) {
    const v = data[i]![key];
    if (!isFiniteNumber(v)) {
      if (current.length > 0) {
        segments.push(current.join(" "));
        current = [];
      }
      continue;
    }
    current.push(`${xAt(i)},${yAt(v)}`);
  }
  if (current.length > 0) segments.push(current.join(" "));
  return segments;
}

export function InsightsPfcChart({ data, unitLabel: _unitLabel = "g" }: Props) {
  const { width: winW } = useWindowDimensions();
  const [measuredW, setMeasuredW] = useState(0);

  const onWrapLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0) setMeasuredW((prev) => (prev === w ? prev : w));
  }, []);

  const fallbackW = Math.max(160, winW - 56);
  const chartW = measuredW > 0 ? measuredW : fallbackW;
  const innerW = chartW - CHART_LEFT - CHART_RIGHT;
  const plotW = Math.max(1, innerW - 2 * PLOT_PAD_X);
  const plotLeft = CHART_LEFT + PLOT_PAD_X;
  const innerH = SVG_H - CHART_TOP - CHART_BOTTOM;

  const layout = useMemo(() => {
    const n = data.length;
    if (n === 0) {
      return {
        proteinSegs: [] as string[],
        fatSegs: [] as string[],
        carbsSegs: [] as string[],
        yMax: 1,
        yTicks: [0, 1],
        xTicks: [] as { i: number; label: string; x: number }[],
        gridYs: [] as number[],
      };
    }
    const finiteVals = data
      .flatMap((d) => [d.protein, d.fat, d.carbs])
      .filter(isFiniteNumber);
    const rawMax = finiteVals.length > 0 ? Math.max(...finiteVals) : 0;
    const yMax = niceYMax(rawMax);
    const yTicks = yTickValues(yMax);
    const xAt = (i: number) =>
      n <= 1 ? plotLeft + plotW / 2 : plotLeft + (plotW * i) / (n - 1);
    const yAt = (v: number) => CHART_TOP + innerH - (v / yMax) * innerH;
    const gridYs = yTicks.map((tv) => yAt(tv));
    const xi = xTickIndices(n);
    const xTicks = xi.map((i) => ({
      i,
      label: dateTickLabel(data[i]!.date),
      x: xAt(i),
    }));
    return {
      proteinSegs: buildPolylineSegments(data, "protein", xAt, yAt),
      fatSegs: buildPolylineSegments(data, "fat", xAt, yAt),
      carbsSegs: buildPolylineSegments(data, "carbs", xAt, yAt),
      yMax,
      yTicks,
      xTicks,
      gridYs,
    };
  }, [data, innerH, plotLeft, plotW]);

  if (data.length === 0) {
    return <View style={{ minHeight: SVG_H + LEGEND_ROW_H }} />;
  }

  const baseY = CHART_TOP + innerH;
  const axisRight = CHART_LEFT + innerW;

  return (
    <View style={styles.wrap} onLayout={onWrapLayout}>
      <Svg width={chartW} height={SVG_H}>
        {layout.gridYs.map((gy, idx) => (
          <Line
            key={`h-${idx}`}
            x1={plotLeft}
            y1={gy}
            x2={plotLeft + plotW}
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
          x2={axisRight}
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
        {layout.proteinSegs.map((pts, i) => (
          <Polyline
            key={`p-${i}`}
            points={pts}
            fill="none"
            stroke="#60a5fa"
            strokeWidth={2}
          />
        ))}
        {layout.fatSegs.map((pts, i) => (
          <Polyline
            key={`f-${i}`}
            points={pts}
            fill="none"
            stroke="#facc15"
            strokeWidth={2}
          />
        ))}
        {layout.carbsSegs.map((pts, i) => (
          <Polyline
            key={`c-${i}`}
            points={pts}
            fill="none"
            stroke="#34d399"
            strokeWidth={2}
          />
        ))}
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
  wrap: { width: "100%", maxWidth: "100%", alignSelf: "stretch" },
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
