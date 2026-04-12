/**
 * ダイエットフェーズ（1〜3）ごとの PFC 目標と表示名。
 * README のフェーズ表と揃えた既定値。
 */

export const DIET_PHASE_KEYS = ["1", "2", "3"] as const;
export type DietPhaseKey = (typeof DIET_PHASE_KEYS)[number];
export type DietPhase = 1 | 2 | 3;

export type PhaseProfile = {
  name: string;
  protein_target_g: number;
  fat_target_g: number;
  carbs_target_g: number;
};

export type PhaseProfiles = Record<DietPhaseKey, PhaseProfile>;

export const DEFAULT_PHASE_PROFILES: PhaseProfiles = {
  "1": {
    name: "ケト導入期",
    protein_target_g: 100,
    fat_target_g: 120,
    carbs_target_g: 40,
  },
  "2": {
    name: "ケト脂肪燃焼期間",
    protein_target_g: 110,
    fat_target_g: 110,
    carbs_target_g: 60,
  },
  "3": {
    name: "TKD",
    protein_target_g: 120,
    fat_target_g: 100,
    carbs_target_g: 100,
  },
};

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

/** DB の jsonb や不完全なオブジェクトを既定とマージして正規化する */
export function normalizePhaseProfiles(raw: unknown): PhaseProfiles {
  const base = DEFAULT_PHASE_PROFILES;
  if (!raw || typeof raw !== "object") {
    return {
      "1": { ...base["1"] },
      "2": { ...base["2"] },
      "3": { ...base["3"] },
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    "1": parseProfile(o["1"], base["1"]),
    "2": parseProfile(o["2"], base["2"]),
    "3": parseProfile(o["3"], base["3"]),
  };
}

export function clampDietPhase(n: unknown): DietPhase {
  const x = typeof n === "number" && Number.isFinite(n) ? n : parseInt(String(n ?? 1), 10);
  if (x === 2) return 2;
  if (x === 3) return 3;
  return 1;
}

export type UserSettingsRow = {
  diet_phase?: unknown;
  phase_profiles?: unknown;
};

export function normalizeUserSettings(row: UserSettingsRow | null | undefined): {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
} {
  return {
    diet_phase: clampDietPhase(row?.diet_phase),
    phase_profiles: normalizePhaseProfiles(row?.phase_profiles),
  };
}

export function activePhaseProfile(settings: {
  diet_phase: DietPhase;
  phase_profiles: PhaseProfiles;
}): PhaseProfile {
  const key = String(settings.diet_phase) as DietPhaseKey;
  return settings.phase_profiles[key] ?? DEFAULT_PHASE_PROFILES["1"];
}
