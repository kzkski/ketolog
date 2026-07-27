/**
 * ダイエットフェーズ（最大5スロット・可変）ごとの PFC 目標と表示名。
 * コア1〜3は常在。4・5はキー存在＝使用中。README のフェーズ表と揃えた既定値。
 */

export const CORE_PHASE_SLOT_KEYS = ["1", "2", "3"] as const;
export const OPTIONAL_PHASE_SLOT_KEYS = ["4", "5"] as const;
export const PHASE_SLOT_KEYS = ["1", "2", "3", "4", "5"] as const;
export const MAX_PHASE_SLOTS = 5;

/** @deprecated Prefer PHASE_SLOT_KEYS; kept as alias for 1〜3 互換 import */
export const DIET_PHASE_KEYS = CORE_PHASE_SLOT_KEYS;

export type PhaseSlotKey = (typeof PHASE_SLOT_KEYS)[number];
/** @deprecated Prefer PhaseSlotKey */
export type DietPhaseKey = (typeof DIET_PHASE_KEYS)[number];

export type DietPhase = 1 | 2 | 3 | 4 | 5;

export type PhaseProfile = {
  name: string;
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
};

export type PhaseProfiles = Record<(typeof CORE_PHASE_SLOT_KEYS)[number], PhaseProfile> &
  Partial<Record<(typeof OPTIONAL_PHASE_SLOT_KEYS)[number], PhaseProfile>>;

export const DEFAULT_PHASE_PROFILES: PhaseProfiles = {
  "1": {
    name: "導入期",
    protein_target_g: 100,
    fat_target_g: 150,
    carbs_target_g: 20,
  },
  "2": {
    name: "脂肪燃焼期",
    protein_target_g: 100,
    fat_target_g: 120,
    carbs_target_g: 40,
  },
  "3": {
    name: "TKD",
    protein_target_g: 110,
    fat_target_g: 110,
    carbs_target_g: 60,
  },
};

/** 追加スロットの実装既定名（公式値は未定のため差し替え可能な定数） */
export const NEW_PHASE_SLOT_NAME_PREFIX = "セット";

function defaultOptionalSlotProfile(slot: 4 | 5, init?: Partial<PhaseProfile>): PhaseProfile {
  const fallback = DEFAULT_PHASE_PROFILES["2"];
  return {
    name: init?.name?.trim()
      ? init.name.trim().slice(0, 48)
      : `${NEW_PHASE_SLOT_NAME_PREFIX}${slot}`,
    protein_target_g: toPositiveMacro(init?.protein_target_g) ?? fallback.protein_target_g,
    fat_target_g: toPositiveMacro(init?.fat_target_g) ?? fallback.fat_target_g,
    carbs_target_g: toPositiveMacro(init?.carbs_target_g) ?? fallback.carbs_target_g,
  };
}

function toPositiveMacro(value: unknown): number | null {
  const n = typeof value === "number" ? value : typeof value === "string" ? parseFloat(value) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n);
}

function parseProfile(partial: unknown, fallback: PhaseProfile): PhaseProfile {
  if (!partial || typeof partial !== "object") return { ...fallback };
  const o = partial as Record<string, unknown>;
  const nameRaw = o.name;
  const name =
    typeof nameRaw === "string" && nameRaw.trim().length > 0
      ? nameRaw.trim().slice(0, 48)
      : fallback.name;
  const protein = toPositiveMacro(o.protein_target_g) ?? fallback.protein_target_g;
  const fat = toPositiveMacro(o.fat_target_g) ?? fallback.fat_target_g;
  const carbs = toPositiveMacro(o.carbs_target_g) ?? fallback.carbs_target_g;
  return { name, protein_target_g: protein, fat_target_g: fat, carbs_target_g: carbs };
}

export function isPhaseSlotUsed(profiles: PhaseProfiles, phase: DietPhase): boolean {
  if (phase === 1 || phase === 2 || phase === 3) return true;
  const key = String(phase) as PhaseSlotKey;
  return Object.prototype.hasOwnProperty.call(profiles, key) && profiles[key] != null;
}

/** 使用中スロット（昇順）。コア1〜3は常に含み、穴あき（例: 1,2,3,5）を許容する。 */
export function usedPhaseSlots(profiles: PhaseProfiles): DietPhase[] {
  const slots: DietPhase[] = [1, 2, 3];
  if (isPhaseSlotUsed(profiles, 4)) slots.push(4);
  if (isPhaseSlotUsed(profiles, 5)) slots.push(5);
  return slots;
}

/** 最小の空き番号を返す（4優先）。詰め替えはしない。 */
export function nextAvailablePhaseSlot(profiles: PhaseProfiles): DietPhase | null {
  if (!isPhaseSlotUsed(profiles, 4)) return 4;
  if (!isPhaseSlotUsed(profiles, 5)) return 5;
  return null;
}

export function canAddPhaseSlot(profiles: PhaseProfiles): boolean {
  return nextAvailablePhaseSlot(profiles) != null;
}

export function addPhaseSlot(
  profiles: PhaseProfiles,
  init?: Partial<PhaseProfile>
): PhaseProfiles {
  const slot = nextAvailablePhaseSlot(profiles);
  if (slot !== 4 && slot !== 5) return profiles;
  return {
    ...profiles,
    [String(slot)]: defaultOptionalSlotProfile(slot, init),
  };
}

/** コア1〜3は削除不可（no-op）。4・5のみキー削除。 */
export function removePhaseSlot(profiles: PhaseProfiles, phase: DietPhase): PhaseProfiles {
  if (phase !== 4 && phase !== 5) return profiles;
  if (!isPhaseSlotUsed(profiles, phase)) return profiles;
  const next = { ...profiles };
  delete next[String(phase) as "4" | "5"];
  return next;
}

export function clampDietPhase(n: unknown): DietPhase {
  const x = typeof n === "number" && Number.isFinite(n) ? n : parseInt(String(n ?? 1), 10);
  if (x === 2) return 2;
  if (x === 3) return 3;
  if (x === 4) return 4;
  if (x === 5) return 5;
  return 1;
}

/** 範囲内だが未使用スロットを指す場合は 1 にフォールバック。 */
export function resolveActiveDietPhase(dietPhase: unknown, profiles: PhaseProfiles): DietPhase {
  const clamped = clampDietPhase(dietPhase);
  if (isPhaseSlotUsed(profiles, clamped)) return clamped;
  return 1;
}

/** DB の jsonb や不完全なオブジェクトを既定とマージして正規化する */
export function normalizePhaseProfiles(raw: unknown): PhaseProfiles {
  const base = DEFAULT_PHASE_PROFILES;
  const o = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;

  const out: PhaseProfiles = {
    "1": parseProfile(o?.["1"], base["1"]),
    "2": parseProfile(o?.["2"], base["2"]),
    "3": parseProfile(o?.["3"], base["3"]),
  };

  for (const key of OPTIONAL_PHASE_SLOT_KEYS) {
    const slot = Number(key) as 4 | 5;
    const rawSlot = o?.[key];
    if (rawSlot && typeof rawSlot === "object") {
      out[key] = parseProfile(rawSlot, defaultOptionalSlotProfile(slot));
    }
  }

  return out;
}

export type UserSettingsRow = {
  diet_phase?: unknown;
  phase_profiles?: unknown;
};

export function normalizeUserSettings(row: UserSettingsRow | null | undefined): {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
} {
  const phase_profiles = normalizePhaseProfiles(row?.phase_profiles);
  return {
    diet_phase: resolveActiveDietPhase(row?.diet_phase, phase_profiles),
    phase_profiles,
  };
}

export function activePhaseProfile(settings: {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
}): PhaseProfile {
  const phase = resolveActiveDietPhase(settings.diet_phase, settings.phase_profiles);
  const key = String(phase) as PhaseSlotKey;
  return settings.phase_profiles[key] ?? DEFAULT_PHASE_PROFILES["1"];
}
