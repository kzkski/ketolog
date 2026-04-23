import { useMemo } from "react";
import { useWindowDimensions, View } from "react-native";
import Svg, { Polyline } from "react-native-svg";

type Point = {
  date: string;
  protein: number;
  fat: number;
  carbs: number;
};

const PAD_L = 36;
const PAD_R = 8;
const PAD_T = 10;
const PAD_B = 22;

type Props = {
  data: Point[];
};

export function InsightsPfcChart({ data }: Props) {
  const { width: winW } = useWindowDimensions();
  const chartW = Math.max(200, winW - 32);
  const chartH = 200;
  const innerW = chartW - PAD_L - PAD_R;
  const innerH = chartH - PAD_T - PAD_B;

  const { proteinPts, fatPts, carbsPts } = useMemo(() => {
    const n = data.length;
    if (n === 0) {
      return { proteinPts: "", fatPts: "", carbsPts: "" };
    }
    const maxY = Math.max(
      1,
      ...data.flatMap((d) => [d.protein, d.fat, d.carbs])
    );
    const xAt = (i: number) =>
      n <= 1 ? PAD_L + innerW / 2 : PAD_L + (innerW * i) / (n - 1);
    const yAt = (v: number) => PAD_T + innerH - (v / maxY) * innerH;
    const mk = (key: "protein" | "fat" | "carbs") =>
      data.map((d, i) => `${xAt(i)},${yAt(d[key])}`).join(" ");
    return {
      proteinPts: mk("protein"),
      fatPts: mk("fat"),
      carbsPts: mk("carbs"),
    };
  }, [data, innerH, innerW]);

  if (data.length === 0) {
    return <View style={{ height: chartH }} />;
  }

  return (
    <Svg width={chartW} height={chartH}>
      <Polyline
        points={proteinPts}
        fill="none"
        stroke="#60a5fa"
        strokeWidth={2}
      />
      <Polyline
        points={fatPts}
        fill="none"
        stroke="#facc15"
        strokeWidth={2}
      />
      <Polyline
        points={carbsPts}
        fill="none"
        stroke="#34d399"
        strokeWidth={2}
      />
    </Svg>
  );
}
