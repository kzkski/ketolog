import { describe, expect, it } from "vitest";
import {
  activePhaseTargetsChanged,
  buildPfcTargetSnapshotWriteRow,
  canOverwritePfcTargetSnapshot,
  dietPhaseResolvedByRepair,
  isInsertOnlyPfcTargetSnapshotSource,
  snapshotSourceForSettingsChange,
  snapshotSourceForSettingsChangeWithRepair,
} from "./pfc-target-snapshot";
import { DEFAULT_PHASE_PROFILES, addPhaseSlot } from "./diet-phase";
import { buildAchievementRates, buildInsights } from "./insights";

describe("pfc-target-snapshot source priority", () => {
  it("allows switch to overwrite ensure", () => {
    expect(canOverwritePfcTargetSnapshot("food_log_ensure", "app_switch")).toBe(true);
    expect(canOverwritePfcTargetSnapshot("app_switch", "food_log_ensure")).toBe(false);
  });

  it("marks ensure/backfill as insert-only", () => {
    expect(isInsertOnlyPfcTargetSnapshotSource("food_log_ensure")).toBe(true);
    expect(isInsertOnlyPfcTargetSnapshotSource("app_ensure")).toBe(true);
    expect(isInsertOnlyPfcTargetSnapshotSource("claude_backfill")).toBe(true);
    expect(isInsertOnlyPfcTargetSnapshotSource("app_switch")).toBe(false);
  });

  it("detects active profile edits vs inactive-only", () => {
    const base = { diet_phase: 1 as const, phase_profiles: DEFAULT_PHASE_PROFILES };
    const inactiveOnly = {
      diet_phase: 1 as const,
      phase_profiles: {
        ...DEFAULT_PHASE_PROFILES,
        "2": { ...DEFAULT_PHASE_PROFILES["2"], protein_target_g: 999 },
      },
    };
    expect(activePhaseTargetsChanged(base, inactiveOnly)).toBe(false);
    expect(snapshotSourceForSettingsChange(base, inactiveOnly)).toBeNull();

    const activeEdit = {
      diet_phase: 1 as const,
      phase_profiles: {
        ...DEFAULT_PHASE_PROFILES,
        "1": { ...DEFAULT_PHASE_PROFILES["1"], carbs_target_g: 30 },
      },
    };
    expect(snapshotSourceForSettingsChange(base, activeEdit)).toBe("app_profile_edit");

    const switched = { diet_phase: 2 as const, phase_profiles: DEFAULT_PHASE_PROFILES };
    expect(snapshotSourceForSettingsChange(base, switched)).toBe("app_switch");
  });

  it("builds write row from active profile", () => {
    const row = buildPfcTargetSnapshotWriteRow({
      userId: "u1",
      date: "2026-07-26",
      diet_phase: 3,
      phase_profiles: DEFAULT_PHASE_PROFILES,
      source: "app_switch",
      updatedAt: "2026-07-26T00:00:00.000Z",
    });
    expect(row.diet_phase).toBe(3);
    expect(row.phase_name).toBe("TKD");
    expect(row.protein_target_g).toBe(110);
    expect(row.fat_target_g).toBe(110);
    expect(row.carbs_target_g).toBe(60);
    expect(row.source).toBe("app_switch");
  });

  it("builds write row for slot 5 and resolves unused slot 4 to 1", () => {
    const with5 = addPhaseSlot(addPhaseSlot(DEFAULT_PHASE_PROFILES));
    const row5 = buildPfcTargetSnapshotWriteRow({
      userId: "u1",
      date: "2026-07-26",
      diet_phase: 5,
      phase_profiles: with5,
      source: "app_switch",
    });
    expect(row5.diet_phase).toBe(5);
    expect(row5.phase_name).toBe(with5["5"]!.name);

    const repaired = buildPfcTargetSnapshotWriteRow({
      userId: "u1",
      date: "2026-07-26",
      diet_phase: 4,
      phase_profiles: DEFAULT_PHASE_PROFILES,
      source: "app_switch",
    });
    expect(repaired.diet_phase).toBe(1);
    expect(repaired.phase_name).toBe(DEFAULT_PHASE_PROFILES["1"].name);
    expect(repaired.protein_target_g).toBe(DEFAULT_PHASE_PROFILES["1"].protein_target_g);
  });

  it("detects repair when raw diet_phase points at unused slot", () => {
    expect(dietPhaseResolvedByRepair(4, 1, DEFAULT_PHASE_PROFILES)).toBe(true);
    expect(dietPhaseResolvedByRepair(2, 2, DEFAULT_PHASE_PROFILES)).toBe(false);

    const normalized = { diet_phase: 1 as const, phase_profiles: DEFAULT_PHASE_PROFILES };
    expect(
      snapshotSourceForSettingsChangeWithRepair({
        prev: normalized,
        next: normalized,
        rawDietPhaseFromDb: 4,
      })
    ).toBe("app_switch");
    expect(
      snapshotSourceForSettingsChangeWithRepair({
        prev: normalized,
        next: normalized,
        rawDietPhaseFromDb: 1,
      })
    ).toBeNull();
  });

  it("treats deleting active optional slot as app_switch", () => {
    const with4 = addPhaseSlot(DEFAULT_PHASE_PROFILES, { name: "減量" });
    const prev = { diet_phase: 4 as const, phase_profiles: with4 };
    const next = { diet_phase: 1 as const, phase_profiles: DEFAULT_PHASE_PROFILES };
    expect(snapshotSourceForSettingsChange(prev, next)).toBe("app_switch");
  });
});

describe("buildAchievementRates", () => {
  it("averages only recorded days with snapshots", () => {
    const insight = buildInsights(
      [
        {
          id: "1",
          date: "2026-07-20",
          meal_type: "lunch",
          eaten_at: "2026-07-20T12:00:00Z",
          item_name: "卵",
          grams: 100,
          protein_g: 50,
          fat_g: 75,
          carbs_g: 10,
          source: "manual",
          menu_item_id: null,
          created_at: "2026-07-20T12:00:01Z",
        },
      ],
      "2026-07-20",
      "2026-07-21"
    );
    const achievement = buildAchievementRates(
      insight.daily,
      [
        {
          date: "2026-07-20",
          diet_phase: 1,
          phase_name: "導入期",
          protein_target_g: 100,
          fat_target_g: 150,
          carbs_target_g: 20,
        },
      ],
      2
    );
    expect(achievement.summary.recordedDayCount).toBe(1);
    expect(achievement.summary.excludedDayCount).toBe(1);
    expect(achievement.summary.avgProteinPct).toBeCloseTo(50);
    expect(achievement.summary.avgFatPct).toBeCloseTo(50);
    expect(achievement.summary.avgCarbsPct).toBeCloseTo(50);
    expect(achievement.chart[0]!.protein).toBeCloseTo(50);
    expect(achievement.chart[1]!.protein).toBeNull();
  });

  it("excludes days with food but no snapshot", () => {
    const insight = buildInsights(
      [
        {
          id: "1",
          date: "2026-07-20",
          meal_type: "lunch",
          eaten_at: "2026-07-20T12:00:00Z",
          item_name: "卵",
          grams: 100,
          protein_g: 100,
          fat_g: 100,
          carbs_g: 100,
          source: "manual",
          menu_item_id: null,
          created_at: "2026-07-20T12:00:01Z",
        },
      ],
      "2026-07-20",
      "2026-07-20"
    );
    const achievement = buildAchievementRates(insight.daily, [], 1);
    expect(achievement.summary.recordedDayCount).toBe(0);
    expect(achievement.summary.avgProteinPct).toBeNull();
    expect(achievement.summary.excludedDayCount).toBe(1);
  });
});
