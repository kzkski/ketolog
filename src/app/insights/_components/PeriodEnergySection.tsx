import type { PeriodEnergySummary, RedsBand } from "@ketolog/domain/energy-availability";

const BAND_LABEL: Record<Exclude<RedsBand, null>, string> = {
  red: "LEA リスク帯（参考）",
  yellow: "注意",
  green: "当面の余裕",
};

const BAND_DOT: Record<Exclude<RedsBand, null>, string> = {
  red: "bg-red-500",
  yellow: "bg-yellow-400",
  green: "bg-emerald-400",
};

function fmtNum(v: number): string {
  return v.toFixed(1);
}

function fmtSigned(v: number): string {
  const sign = v > 0 ? "+" : "";
  return `${sign}${fmtNum(v)}`;
}

export function PeriodEnergySection({
  summary,
  mealFilterActive,
}: {
  summary: PeriodEnergySummary;
  mealFilterActive: boolean;
}) {
  const band = summary.redsBand;

  return (
    <div className="rounded-xl border border-gray-800 bg-gray-900/70 p-3">
      <h2 className="mb-2 text-sm font-medium text-white">期間カロリー収支・EA</h2>
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-2 py-2">
          <p className="text-[11px] text-gray-400">期間平均収支</p>
          {summary.avgBalanceKcal == null ? (
            <p className="mt-1 text-sm text-gray-500">計算不可</p>
          ) : (
            <p className="mt-1 text-sm font-semibold text-white">
              {fmtSigned(summary.avgBalanceKcal)}{" "}
              <span className="text-xs font-normal text-gray-400">kcal/日</span>
            </p>
          )}
          <p className="mt-1 text-[10px] text-gray-500">
            有効 {summary.balanceValidDayCount} 日 · 除外{" "}
            {summary.balanceExcludedDayCount} 日
          </p>
        </div>
        <div className="rounded-lg border border-gray-800 bg-gray-900/60 px-2 py-2">
          <p className="text-[11px] text-gray-400">期間平均 EA</p>
          {summary.periodEa == null ? (
            <p className="mt-1 text-sm text-gray-500">計算不可</p>
          ) : (
            <p className="mt-1 flex items-center gap-1.5 text-sm font-semibold text-white">
              {band ? (
                <span
                  className={`inline-block h-2.5 w-2.5 shrink-0 rounded-full ${BAND_DOT[band]}`}
                  aria-hidden
                />
              ) : null}
              {fmtNum(summary.periodEa)}{" "}
              <span className="text-xs font-normal text-gray-400">kcal/kgFFM/日</span>
            </p>
          )}
          {band ? (
            <p className="mt-1 text-[10px] text-gray-400">{BAND_LABEL[band]}</p>
          ) : null}
          <p className="mt-1 text-[10px] text-gray-500">
            有効 {summary.eaValidDayCount} 日 · 除外 {summary.eaExcludedDayCount} 日
          </p>
        </div>
      </div>
      <div className="mt-2 space-y-1 text-[10px] leading-relaxed text-gray-500">
        <p>医療診断ではありません。閾値（20 / 30）は参考の目安です。</p>
        <p>本日は活動量の確定待ち・日未完了のため集計対象外です。</p>
        <p>
          食事未記録日は摂取 0 kcal として EA に含めます（記録漏れでも低く出ることがあります）。
        </p>
        {mealFilterActive ? (
          <p className="text-amber-300/90">収支・EA は全日の食事で計算しています。</p>
        ) : null}
        {summary.balanceValidDayCount === 0 && summary.eaValidDayCount === 0 ? (
          <p className="text-amber-300/90">
            活動量・体組成データがない場合は HealthKit 連携（MyVitalRelay）が必要です。
          </p>
        ) : null}
      </div>
    </div>
  );
}
