import { getTokyoHourMinute } from "@/lib/date";

/**
 * 今日ページヘッダー用の時間帯ベース日次ヒント（純粋ロジック）。
 * Issue #70: Asia/Tokyo・3スロット・糖質優先分岐・PFC不足割合による主マクロ。
 * 表示文面は TodayClient 側で PFC バーと同じ摂取（確定＋カート）に追従させる（#79）。
 */

export const TOKYO_TZ = "Asia/Tokyo";

export type HeaderHintSlot = "before_lunch" | "before_dinner" | "before_bed";

/** 10:30–12:00（12:00 は含まない） */
const SLOT_LUNCH_START = 10 * 60 + 30;
const SLOT_LUNCH_END = 12 * 60;

/** 15:00–18:30（18:30 は含まない） */
const SLOT_DINNER_START = 15 * 60;
const SLOT_DINNER_END = 18 * 60 + 30;

/** 21:00–24:00（翌日 0:00 は含まない） */
const SLOT_BED_START = 21 * 60;
const SLOT_BED_END = 24 * 60;

export const NEAR_CARB_RATIO = 0.15;
export const NEAR_CARB_ABS_G = 5;
export const SHORTFALL_ATTENTION_RATIO = 0.3;

export function getTokyoMinutesSinceMidnight(date: Date): number {
  const { hour: h, minute: m } = getTokyoHourMinute(date);
  return h * 60 + m;
}

export function getActiveHintSlot(now: Date): HeaderHintSlot | null {
  const t = getTokyoMinutesSinceMidnight(now);
  if (t >= SLOT_LUNCH_START && t < SLOT_LUNCH_END) return "before_lunch";
  if (t >= SLOT_DINNER_START && t < SLOT_DINNER_END) return "before_dinner";
  if (t >= SLOT_BED_START && t < SLOT_BED_END) return "before_bed";
  return null;
}

type CarbHeadline =
  | { kind: "over"; overG: number }
  | { kind: "near"; remG: number }
  | { kind: "ok" };

export function classifyCarb(consumedC: number, targetC: number): CarbHeadline {
  if (targetC <= 0) return { kind: "ok" };
  if (consumedC > targetC) {
    return { kind: "over", overG: consumedC - targetC };
  }
  const rem = targetC - consumedC;
  if (rem <= targetC * NEAR_CARB_RATIO || rem <= NEAR_CARB_ABS_G) {
    return { kind: "near", remG: rem };
  }
  return { kind: "ok" };
}

type MacroLetter = "P" | "F" | "C";

function maxShortfallRatio(
  rem: { p: number; f: number; c: number },
  tgt: { p: number; f: number; c: number }
): number {
  const ratios: number[] = [];
  if (tgt.p > 0 && rem.p > 0) ratios.push(rem.p / tgt.p);
  if (tgt.f > 0 && rem.f > 0) ratios.push(rem.f / tgt.f);
  if (tgt.c > 0 && rem.c > 0) ratios.push(rem.c / tgt.c);
  if (ratios.length === 0) return 0;
  return Math.max(...ratios);
}

/** 不足割合 rem/tgt が最大のマクロ。タイブレーク P > F > C。 */
export function pickPrimaryMacro(
  rem: { p: number; f: number; c: number },
  tgt: { p: number; f: number; c: number }
): MacroLetter | null {
  type Cand = { m: MacroLetter; ratio: number };
  const cands: Cand[] = [];
  if (tgt.p > 0 && rem.p > 0) cands.push({ m: "P", ratio: rem.p / tgt.p });
  if (tgt.f > 0 && rem.f > 0) cands.push({ m: "F", ratio: rem.f / tgt.f });
  if (tgt.c > 0 && rem.c > 0) cands.push({ m: "C", ratio: rem.c / tgt.c });
  if (cands.length === 0) return null;
  const order: MacroLetter[] = ["P", "F", "C"];
  cands.sort((a, b) => {
    if (b.ratio !== a.ratio) return b.ratio - a.ratio;
    return order.indexOf(a.m) - order.indexOf(b.m);
  });
  return cands[0]!.m;
}

function copyCarbOver(slot: HeaderHintSlot, overG: number): string {
  const g = fmtMacro(overG);
  switch (slot) {
    case "before_lunch":
      return `糖質が目標を${g}g超えています。昼で調整を。`;
    case "before_dinner":
      return `糖質が目標を${g}g超えています。夕食で注意。`;
    case "before_bed":
      return `糖質が目標を${g}g超えています。明日に回しても大丈夫です。`;
  }
}

function copyCarbNear(slot: HeaderHintSlot, remG: number): string {
  const g = fmtMacro(remG);
  switch (slot) {
    case "before_lunch":
      return `糖質はあと${g}gだけ。昼のメニューに注意。`;
    case "before_dinner":
      return `糖質はあと${g}g。この後の食事に注意。`;
    case "before_bed":
      return `糖質はあと${g}g。今夜の一口は控えめに。`;
  }
}

function copyAllMet(slot: HeaderHintSlot): string {
  switch (slot) {
    case "before_lunch":
      return "朝のペースよさそう。昼もキープで。";
    case "before_dinner":
      return "今日は順調。夕食はいつも通りで。";
    case "before_bed":
      return "今日はお疲れさま。いい一日でした。";
  }
}

function copyCoaching(
  slot: HeaderHintSlot,
  urgent: boolean,
  primary: MacroLetter,
  rem: { p: number; f: number; c: number }
): string {
  if (!urgent) {
    switch (slot) {
      case "before_lunch":
        return "いい感じです。このまま昼もいきましょう。";
      case "before_dinner":
        return "夕方も順調。夜はこのまま仕上げを。";
      case "before_bed":
        return "今日はお疲れさま。目標付近まで来ています。";
    }
  }

  const gp = fmtMacro(rem.p);
  const gf = fmtMacro(rem.f);
  const gc = fmtMacro(rem.c);

  switch (slot) {
    case "before_lunch":
      if (primary === "P") return `タンパク質があと${gp}g。昼で少し厚めに。`;
      if (primary === "F") return `脂質があと${gf}g。昼はしっかりめでも大丈夫。`;
      return `糖質にあと${gc}gの余裕。昼のメニュー、選びやすいです。`;
    case "before_dinner":
      if (primary === "P") return `今夜までにタンパク質あと${gp}g。夕食で確認を。`;
      if (primary === "F") return `脂質があと${gf}g。軽めの夕食なら間食も検討。`;
      return `糖質の残り${gc}g。夜のメニュー、選びやすいです。`;
    case "before_bed":
      if (primary === "P") return `タンパク質があと${gp}g。寝る前にプロテインはいかがですか。`;
      if (primary === "F") return `脂質があと${gf}g。ナッツ少々で足すのも手です。`;
      return `糖質にあと${gc}gの枠。無理のない範囲で。`;
  }
}

function fmtMacro(n: number): string {
  return n < 10 ? n.toFixed(1) : String(Math.round(n));
}

export function computeHeaderHintText(input: {
  slot: HeaderHintSlot;
  consumed: { p: number; f: number; c: number };
  targets: { p: number; f: number; c: number };
}): string {
  const { slot, consumed, targets } = input;
  const rem = {
    p: Math.max(0, targets.p - consumed.p),
    f: Math.max(0, targets.f - consumed.f),
    c: Math.max(0, targets.c - consumed.c),
  };

  const carb = classifyCarb(consumed.c, targets.c);
  if (carb.kind === "over") return copyCarbOver(slot, carb.overG);
  if (carb.kind === "near") return copyCarbNear(slot, carb.remG);

  const allMet = rem.p === 0 && rem.f === 0 && rem.c === 0;
  if (allMet) return copyAllMet(slot);

  const maxRatio = maxShortfallRatio(rem, targets);
  const urgent = maxRatio >= SHORTFALL_ATTENTION_RATIO;
  const primary = pickPrimaryMacro(rem, targets);
  if (primary === null) return copyAllMet(slot);
  return copyCoaching(slot, urgent, primary, rem);
}
