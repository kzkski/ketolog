import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHASE_PROFILES,
  activePhaseProfile,
  clampDietPhase,
  normalizePhaseProfiles,
  normalizeUserSettings,
} from "./diet-phase";

describe("clampDietPhase", () => {
  it("1〜3 に収める", () => {
    expect(clampDietPhase(1)).toBe(1);
    expect(clampDietPhase(2)).toBe(2);
    expect(clampDietPhase(3)).toBe(3);
    expect(clampDietPhase(99)).toBe(1);
    expect(clampDietPhase(0)).toBe(1);
    expect(clampDietPhase("3")).toBe(3);
  });
});

describe("normalizePhaseProfiles", () => {
  it("不正値は既定にフォールバック", () => {
    const out = normalizePhaseProfiles(null);
    expect(out["1"].name).toBe(DEFAULT_PHASE_PROFILES["1"].name);
    expect(out["2"].protein_target_g).toBe(DEFAULT_PHASE_PROFILES["2"].protein_target_g);
  });

  it("部分指定を既定とマージする", () => {
    const out = normalizePhaseProfiles({
      "1": { name: "カスタム", protein_target_g: 80 },
    });
    expect(out["1"].name).toBe("カスタム");
    expect(out["1"].protein_target_g).toBe(80);
    expect(out["1"].fat_target_g).toBe(DEFAULT_PHASE_PROFILES["1"].fat_target_g);
    expect(out["2"].name).toBe(DEFAULT_PHASE_PROFILES["2"].name);
  });
});

describe("normalizeUserSettings", () => {
  it("null は既定", () => {
    const out = normalizeUserSettings(null);
    expect(out.diet_phase).toBe(1);
    expect(out.phase_profiles["3"].carbs_target_g).toBe(DEFAULT_PHASE_PROFILES["3"].carbs_target_g);
  });

  it("行オブジェクトを正規化する", () => {
    const out = normalizeUserSettings({ diet_phase: 2, phase_profiles: {} });
    expect(out.diet_phase).toBe(2);
    expect(out.phase_profiles["2"].name).toBe(DEFAULT_PHASE_PROFILES["2"].name);
  });
});

describe("activePhaseProfile", () => {
  it("現在フェーズのプロファイルを返す", () => {
    const profiles = normalizePhaseProfiles({});
    expect(activePhaseProfile({ diet_phase: 3, phase_profiles: profiles }).carbs_target_g).toBe(
      profiles["3"].carbs_target_g,
    );
  });
});
