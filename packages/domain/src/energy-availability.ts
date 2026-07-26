import { addDaysJst, eachDate } from "./date";

/** DAS 1行（格納日のまま。シフトは domain 側） */
export type DasRow = {
  date: string;
  basal_calories_kcal: number | null;
  active_calories_kcal: number | null;
};

export type TrainingBurnRow = {
  date: string;
  calories_burned: number | null;
};

export type BodyCompRow = {
  date: string;
  measured_at: string;
  weight_kg: number | null;
  body_fat_pct: number | null;
};

export type DailyIntake = {
  date: string;
  intake_kcal: number;
  hasFood: boolean;
};

export type DailyBalance = {
  date: string;
  included: boolean;
  intake_kcal: number | null;
  basal_kcal: number | null;
  active_kcal: number | null;
  balance_kcal: number | null;
};

export type DailyEa = {
  date: string;
  included: boolean;
  intake_kcal: number;
  eee_kcal: number;
  ffm_kg: number | null;
  ea: number | null;
  hasFood: boolean;
};

export type RedsBand = "red" | "yellow" | "green" | null;

export type PeriodEnergySummary = {
  periodDayCount: number;
  balanceEligibleDayCount: number;
  eaEligibleDayCount: number;
  balanceValidDayCount: number;
  balanceExcludedDayCount: number;
  avgBalanceKcal: number | null;
  eaValidDayCount: number;
  eaExcludedDayCount: number;
  periodEa: number | null;
  redsBand: RedsBand;
};

export type PeriodEnergyResult = {
  summary: PeriodEnergySummary;
  dailyBalance: DailyBalance[];
  dailyEa: DailyEa[];
};

/** provisional（Issue #348）。IOC 目安に近い参考閾値。 */
export const EA_THRESHOLD_RED = 20;
export const EA_THRESHOLD_YELLOW = 30;

/** DAS 格納日 → 活動日 D */
export function dasStorageDateToActivityDate(storageDate: string): string {
  return addDaysJst(storageDate, -1);
}

/**
 * その暦日の JST 正午（日本は DST なし = UTC 同日 03:00）。
 * FFM 候補の measured_at 比較用アンカー。
 */
export function jstNoonUtcMs(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Date.UTC(y, (m ?? 1) - 1, d ?? 1, 3, 0, 0);
}

function pickClosestToNoon<T extends { measured_at: string }>(
  date: string,
  rows: T[]
): T | null {
  if (rows.length === 0) return null;
  if (rows.length === 1) return rows[0]!;
  const noon = jstNoonUtcMs(date);
  let best = rows[0]!;
  let bestDist = Math.abs(Date.parse(best.measured_at) - noon);
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i]!;
    const dist = Math.abs(Date.parse(row.measured_at) - noon);
    if (dist < bestDist) {
      best = row;
      bestDist = dist;
    }
  }
  return best;
}

/**
 * 同暦日の weight 行と body_fat 行を結合。
 * 同種複数は JST 正午に measured_at が最も近い行。
 * body_fat_pct は 0–100%。片欠けは null。
 */
export function resolveFfmKgForDate(date: string, samples: BodyCompRow[]): number | null {
  const daySamples = samples.filter((s) => s.date === date);
  const weightRows = daySamples.filter((s) => s.weight_kg != null && Number.isFinite(s.weight_kg));
  const bfRows = daySamples.filter(
    (s) => s.body_fat_pct != null && Number.isFinite(s.body_fat_pct)
  );
  const weightRow = pickClosestToNoon(date, weightRows);
  const bfRow = pickClosestToNoon(date, bfRows);
  if (!weightRow || !bfRow) return null;
  const weight = Number(weightRow.weight_kg);
  const bf = Number(bfRow.body_fat_pct);
  if (!(weight > 0) || !(bf >= 0) || bf >= 100) return null;
  return weight * (1 - bf / 100);
}

export function sumEeeByDate(rows: TrainingBurnRow[]): Map<string, number> {
  const map = new Map<string, number>();
  for (const row of rows) {
    const burn = row.calories_burned;
    const kcal = burn == null || !Number.isFinite(burn) ? 0 : Number(burn);
    map.set(row.date, (map.get(row.date) ?? 0) + kcal);
  }
  return map;
}

/**
 * DAS → 活動日キー。UNIQUE (user_id, date) 前提。
 * 同一活動日に複数行が来た場合は後から来た行で上書きせず、最初の行を保持（テストは一意）。
 */
export function indexDasByActivityDate(
  rows: DasRow[]
): Map<string, { basal: number | null; active: number | null }> {
  const map = new Map<string, { basal: number | null; active: number | null }>();
  for (const row of rows) {
    const activityDate = dasStorageDateToActivityDate(row.date);
    if (map.has(activityDate)) continue;
    map.set(activityDate, {
      basal: row.basal_calories_kcal,
      active: row.active_calories_kcal,
    });
  }
  return map;
}

export function classifyRedsBand(periodEa: number | null): RedsBand {
  if (periodEa == null || !Number.isFinite(periodEa)) return null;
  if (periodEa < EA_THRESHOLD_RED) return "red";
  if (periodEa < EA_THRESHOLD_YELLOW) return "yellow";
  return "green";
}

export function buildPeriodEnergyMetrics(input: {
  start: string;
  end: string;
  todayJst: string;
  /** Balance 用。DAS 未確定のため推奨 true */
  excludeToday: boolean;
  /** EA 用。日未完了のため推奨 true */
  excludeIncompleteToday: boolean;
  dailyIntake: DailyIntake[];
  dasRows: DasRow[];
  trainingRows: TrainingBurnRow[];
  bodyCompRows: BodyCompRow[];
}): PeriodEnergyResult {
  const days = eachDate(input.start, input.end);
  const intakeByDate = new Map(input.dailyIntake.map((d) => [d.date, d]));
  const dasByActivity = indexDasByActivityDate(input.dasRows);
  const eeeByDate = sumEeeByDate(input.trainingRows);

  const dailyBalance: DailyBalance[] = [];
  const dailyEa: DailyEa[] = [];

  let balanceEligible = 0;
  let eaEligible = 0;
  let balanceSum = 0;
  let balanceValid = 0;
  let eaSum = 0;
  let eaValid = 0;

  for (const date of days) {
    const skipBalanceToday = input.excludeToday && date >= input.todayJst;
    const skipEaToday = input.excludeIncompleteToday && date >= input.todayJst;
    if (!skipBalanceToday) balanceEligible += 1;
    if (!skipEaToday) eaEligible += 1;

    const intake = intakeByDate.get(date) ?? {
      date,
      intake_kcal: 0,
      hasFood: false,
    };
    const das = dasByActivity.get(date);
    const basal = das?.basal ?? null;
    const active = das?.active ?? null;
    const balanceOk =
      !skipBalanceToday &&
      intake.hasFood &&
      basal != null &&
      Number.isFinite(basal) &&
      active != null &&
      Number.isFinite(active);

    if (balanceOk) {
      const balance_kcal = intake.intake_kcal - (Number(basal) + Number(active));
      dailyBalance.push({
        date,
        included: true,
        intake_kcal: intake.intake_kcal,
        basal_kcal: Number(basal),
        active_kcal: Number(active),
        balance_kcal,
      });
      balanceSum += balance_kcal;
      balanceValid += 1;
    } else {
      dailyBalance.push({
        date,
        included: false,
        intake_kcal: intake.hasFood ? intake.intake_kcal : null,
        basal_kcal: basal,
        active_kcal: active,
        balance_kcal: null,
      });
    }

    const ffm = resolveFfmKgForDate(date, input.bodyCompRows);
    const eee = eeeByDate.get(date) ?? 0;
    const eaOk = !skipEaToday && ffm != null && ffm > 0;
    if (eaOk) {
      const ea = (intake.intake_kcal - eee) / ffm!;
      dailyEa.push({
        date,
        included: true,
        intake_kcal: intake.intake_kcal,
        eee_kcal: eee,
        ffm_kg: ffm,
        ea,
        hasFood: intake.hasFood,
      });
      eaSum += ea;
      eaValid += 1;
    } else {
      dailyEa.push({
        date,
        included: false,
        intake_kcal: intake.intake_kcal,
        eee_kcal: eee,
        ffm_kg: ffm,
        ea: null,
        hasFood: intake.hasFood,
      });
    }
  }

  const periodEa = eaValid === 0 ? null : eaSum / eaValid;
  return {
    summary: {
      periodDayCount: days.length,
      balanceEligibleDayCount: balanceEligible,
      eaEligibleDayCount: eaEligible,
      balanceValidDayCount: balanceValid,
      balanceExcludedDayCount: Math.max(0, balanceEligible - balanceValid),
      avgBalanceKcal: balanceValid === 0 ? null : balanceSum / balanceValid,
      eaValidDayCount: eaValid,
      eaExcludedDayCount: Math.max(0, eaEligible - eaValid),
      periodEa,
      redsBand: classifyRedsBand(periodEa),
    },
    dailyBalance,
    dailyEa,
  };
}
