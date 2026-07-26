import { StyleSheet, Text, View } from "react-native";
import type { PeriodEnergySummary, RedsBand } from "@ketolog/domain/energy-availability";

const BAND_LABEL: Record<Exclude<RedsBand, null>, string> = {
  red: "LEA リスク帯（参考）",
  yellow: "注意",
  green: "当面の余裕",
};

const BAND_DOT: Record<Exclude<RedsBand, null>, string> = {
  red: "#ef4444",
  yellow: "#eab308",
  green: "#34d399",
};

function fmtNum(v: number): string {
  return v.toFixed(1);
}

function fmtSigned(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmtNum(v)}`;
}

export function InsightsPeriodEnergySection({
  summary,
  mealFilterActive,
}: {
  summary: PeriodEnergySummary;
  mealFilterActive: boolean;
}) {
  const band = summary.redsBand;

  return (
    <View style={styles.card}>
      <Text style={styles.title}>期間カロリー収支・EA</Text>
      <View style={styles.row}>
        <View style={styles.cell}>
          <Text style={styles.label}>期間平均収支</Text>
          {summary.avgBalanceKcal == null ? (
            <Text style={styles.na}>計算不可</Text>
          ) : (
            <Text style={styles.value}>
              {fmtSigned(summary.avgBalanceKcal)}{" "}
              <Text style={styles.unit}>kcal/日</Text>
            </Text>
          )}
          <Text style={styles.meta}>
            有効 {summary.balanceValidDayCount} 日 · 除外 {summary.balanceExcludedDayCount} 日
          </Text>
        </View>
        <View style={styles.cell}>
          <Text style={styles.label}>期間平均 EA</Text>
          {summary.periodEa == null ? (
            <Text style={styles.na}>計算不可</Text>
          ) : (
            <View style={styles.eaValueRow}>
              {band ? (
                <View style={[styles.dot, { backgroundColor: BAND_DOT[band] }]} />
              ) : null}
              <Text style={styles.value}>
                {fmtNum(summary.periodEa)} <Text style={styles.unit}>kcal/kgFFM/日</Text>
              </Text>
            </View>
          )}
          {band ? <Text style={styles.bandLabel}>{BAND_LABEL[band]}</Text> : null}
          <Text style={styles.meta}>
            有効 {summary.eaValidDayCount} 日 · 除外 {summary.eaExcludedDayCount} 日
          </Text>
        </View>
      </View>
      <Text style={styles.note}>医療診断ではありません。閾値（20 / 30）は参考の目安です。</Text>
      <Text style={styles.note}>
        本日は活動量の確定待ち・日未完了のため集計対象外です。
      </Text>
      <Text style={styles.note}>
        食事未記録日は摂取 0 kcal として EA に含めます（記録漏れでも低く出ることがあります）。
      </Text>
      {mealFilterActive ? (
        <Text style={styles.warn}>収支・EA は全日の食事で計算しています。</Text>
      ) : null}
      {summary.balanceValidDayCount === 0 && summary.eaValidDayCount === 0 ? (
        <Text style={styles.warn}>
          活動量・体組成データがない場合は HealthKit 連携（MyVitalRelay）が必要です。
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "rgba(17, 24, 39, 0.7)",
    padding: 12,
    gap: 6,
  },
  title: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  row: {
    flexDirection: "row",
    gap: 8,
  },
  cell: {
    flex: 1,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#1f2937",
    backgroundColor: "rgba(17, 24, 39, 0.6)",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  label: {
    color: "#9ca3af",
    fontSize: 11,
  },
  value: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "600",
    marginTop: 4,
  },
  unit: {
    color: "#9ca3af",
    fontSize: 11,
    fontWeight: "400",
  },
  na: {
    color: "#6b7280",
    fontSize: 14,
    marginTop: 4,
  },
  meta: {
    color: "#6b7280",
    fontSize: 10,
    marginTop: 4,
  },
  eaValueRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  bandLabel: {
    color: "#9ca3af",
    fontSize: 10,
    marginTop: 4,
  },
  note: {
    color: "#6b7280",
    fontSize: 10,
    lineHeight: 14,
  },
  warn: {
    color: "#fcd34d",
    fontSize: 10,
    lineHeight: 14,
  },
});
