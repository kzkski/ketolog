import { describe, expect, it } from "vitest";
import {
  DEFAULT_PHASE_PROFILES,
  NEW_PHASE_SLOT_NAME_PREFIX,
  activePhaseProfile,
  addPhaseSlot,
  canAddPhaseSlot,
  clampDietPhase,
  nextAvailablePhaseSlot,
  normalizePhaseProfiles,
  normalizeUserSettings,
  removePhaseSlot,
  resolveActiveDietPhase,
  usedPhaseSlots,
  type PhaseProfiles,
} from "./diet-phase";

describe("clampDietPhase", () => {
  it("1〜5 をそのまま、範囲外は 1", () => {
    expect(clampDietPhase(1)).toBe(1);
    expect(clampDietPhase(2)).toBe(2);
    expect(clampDietPhase(3)).toBe(3);
    expect(clampDietPhase(4)).toBe(4);
    expect(clampDietPhase(5)).toBe(5);
    expect(clampDietPhase(0)).toBe(1);
    expect(clampDietPhase(6)).toBe(1);
    expect(clampDietPhase("abc")).toBe(1);
    expect(clampDietPhase(null)).toBe(1);
    expect(clampDietPhase("5")).toBe(5);
  });
});

describe("normalizePhaseProfiles", () => {
  it("null / {} はコア1〜3のみ（4・5キーなし）", () => {
    for (const raw of [null, {}]) {
      const out = normalizePhaseProfiles(raw);
      expect(out["1"].name).toBe(DEFAULT_PHASE_PROFILES["1"].name);
      expect(out["2"].protein_target_g).toBe(DEFAULT_PHASE_PROFILES["2"].protein_target_g);
      expect(out["3"].name).toBe(DEFAULT_PHASE_PROFILES["3"].name);
      expect("4" in out).toBe(false);
      expect("5" in out).toBe(false);
    }
  });

  it("4 のオブジェクトを採用し、1〜3は既定", () => {
    const out = normalizePhaseProfiles({
      "4": { name: "減量", protein_target_g: 120, fat_target_g: 80, carbs_target_g: 30 },
    });
    expect(out["4"]?.name).toBe("減量");
    expect(out["4"]?.protein_target_g).toBe(120);
    expect(out["1"].name).toBe(DEFAULT_PHASE_PROFILES["1"].name);
  });

  it("空オブジェクトの4はキーを残し既定名で埋める", () => {
    const out = normalizePhaseProfiles({ "4": {} });
    expect("4" in out).toBe(true);
    expect(out["4"]?.name).toBe(`${NEW_PHASE_SLOT_NAME_PREFIX}4`);
  });

  it("null の4や未知キー6は落とす", () => {
    const out = normalizePhaseProfiles({
      "4": null,
      "6": { name: "x", protein_target_g: 1, fat_target_g: 1, carbs_target_g: 1 },
    });
    expect("4" in out).toBe(false);
    expect("6" in out).toBe(false);
  });

  it("部分指定を既定とマージする", () => {
    const out = normalizePhaseProfiles({
      "1": { name: "カスタム", protein_target_g: 80 },
    });
    expect(out["1"].name).toBe("カスタム");
    expect(out["1"].protein_target_g).toBe(80);
    expect(out["1"].fat_target_g).toBe(DEFAULT_PHASE_PROFILES["1"].fat_target_g);
  });
});

describe("usedPhaseSlots / nextAvailable / add / remove", () => {
  it("コアのみなら [1,2,3]、穴あきを許容", () => {
    expect(usedPhaseSlots(DEFAULT_PHASE_PROFILES)).toEqual([1, 2, 3]);
    const with5 = addPhaseSlot(addPhaseSlot(DEFAULT_PHASE_PROFILES));
    const only5 = removePhaseSlot(with5, 4);
    expect(usedPhaseSlots(only5)).toEqual([1, 2, 3, 5]);
  });

  it("nextAvailable は最小の空きを返す", () => {
    expect(nextAvailablePhaseSlot(DEFAULT_PHASE_PROFILES)).toBe(4);
    expect(canAddPhaseSlot(DEFAULT_PHASE_PROFILES)).toBe(true);
    const with4 = addPhaseSlot(DEFAULT_PHASE_PROFILES);
    expect(nextAvailablePhaseSlot(with4)).toBe(5);
    const only5 = removePhaseSlot(addPhaseSlot(with4), 4);
    expect(nextAvailablePhaseSlot(only5)).toBe(4);
    const full = addPhaseSlot(with4);
    expect(nextAvailablePhaseSlot(full)).toBeNull();
    expect(canAddPhaseSlot(full)).toBe(false);
  });

  it("addPhaseSlot は init と既定名を扱う", () => {
    const withInit = addPhaseSlot(DEFAULT_PHASE_PROFILES, {
      name: "減量",
      protein_target_g: 90,
      fat_target_g: 100,
      carbs_target_g: 25,
    });
    expect(withInit["4"]?.name).toBe("減量");
    expect(withInit["4"]?.protein_target_g).toBe(90);

    const plain = addPhaseSlot(DEFAULT_PHASE_PROFILES);
    expect(plain["4"]?.name).toBe(`${NEW_PHASE_SLOT_NAME_PREFIX}4`);

    const full = addPhaseSlot(addPhaseSlot(DEFAULT_PHASE_PROFILES));
    expect(addPhaseSlot(full)).toEqual(full);
  });

  it("removePhaseSlot は1〜3を触らず、詰め替えしない", () => {
    const full = addPhaseSlot(addPhaseSlot(DEFAULT_PHASE_PROFILES));
    expect(removePhaseSlot(full, 1)).toEqual(full);
    const without4 = removePhaseSlot(full, 4);
    expect("4" in without4).toBe(false);
    expect(without4["5"]?.name).toBe(`${NEW_PHASE_SLOT_NAME_PREFIX}5`);
  });
});

describe("resolveActiveDietPhase / normalizeUserSettings / activePhaseProfile", () => {
  it("未使用スロットは1へ", () => {
    expect(resolveActiveDietPhase(4, DEFAULT_PHASE_PROFILES)).toBe(1);
    expect(resolveActiveDietPhase(99, DEFAULT_PHASE_PROFILES)).toBe(1);
    const with4 = addPhaseSlot(DEFAULT_PHASE_PROFILES) as PhaseProfiles;
    expect(resolveActiveDietPhase(4, with4)).toBe(4);
  });

  it("normalizeUserSettings は resolve 後の diet_phase を返す", () => {
    expect(
      normalizeUserSettings({ diet_phase: 4, phase_profiles: DEFAULT_PHASE_PROFILES }).diet_phase
    ).toBe(1);
    const with4 = addPhaseSlot(DEFAULT_PHASE_PROFILES);
    expect(normalizeUserSettings({ diet_phase: 4, phase_profiles: with4 }).diet_phase).toBe(4);
  });

  it("activePhaseProfile は解決後のスロットを返す", () => {
    const with4 = addPhaseSlot(DEFAULT_PHASE_PROFILES, { name: "減量" });
    expect(activePhaseProfile({ diet_phase: 4, phase_profiles: with4 }).name).toBe("減量");
    expect(activePhaseProfile({ diet_phase: 4, phase_profiles: DEFAULT_PHASE_PROFILES }).name).toBe(
      DEFAULT_PHASE_PROFILES["1"].name
    );
  });
});
