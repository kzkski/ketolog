import { describe, expect, it } from "vitest";
import {
  buildPeriodEnergyMetrics,
  classifyRedsBand,
  dasStorageDateToActivityDate,
  indexDasByActivityDate,
  jstNoonUtcMs,
  resolveFfmKgForDate,
  sumEeeByDate,
  type BodyCompRow,
  type DailyIntake,
  type DasRow,
  type TrainingBurnRow,
} from "./energy-availability";

describe("dasStorageDateToActivityDate", () => {
  it("shifts storage date by -1 day", () => {
    expect(dasStorageDateToActivityDate("2026-07-02")).toBe("2026-07-01");
    expect(dasStorageDateToActivityDate("2026-08-01")).toBe("2026-07-31");
  });
});

describe("indexDasByActivityDate", () => {
  it("maps storage date to activity date without adding training", () => {
    const map = indexDasByActivityDate([
      { date: "2026-07-02", basal_calories_kcal: 1500, active_calories_kcal: 500 },
    ]);
    expect(map.get("2026-07-01")).toEqual({ basal: 1500, active: 500 });
    expect(map.has("2026-07-02")).toBe(false);
  });
});

describe("resolveFfmKgForDate", () => {
  it("joins same-day weight and body fat (0–100%)", () => {
    const samples: BodyCompRow[] = [
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T01:00:00.000Z",
        weight_kg: 70,
        body_fat_pct: null,
      },
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T02:00:00.000Z",
        weight_kg: null,
        body_fat_pct: 20,
      },
    ];
    expect(resolveFfmKgForDate("2026-07-01", samples)).toBe(56);
  });

  it("returns null when weight or body fat is missing", () => {
    expect(
      resolveFfmKgForDate("2026-07-01", [
        {
          date: "2026-07-01",
          measured_at: "2026-07-01T01:00:00.000Z",
          weight_kg: 70,
          body_fat_pct: null,
        },
      ])
    ).toBeNull();
    expect(
      resolveFfmKgForDate("2026-07-01", [
        {
          date: "2026-07-01",
          measured_at: "2026-07-01T01:00:00.000Z",
          weight_kg: null,
          body_fat_pct: 20,
        },
      ])
    ).toBeNull();
  });

  it("picks weight closest to JST noon when multiple", () => {
    // JST noon 2026-07-01 = 2026-07-01T03:00:00.000Z
    expect(jstNoonUtcMs("2026-07-01")).toBe(Date.parse("2026-07-01T03:00:00.000Z"));
    const samples: BodyCompRow[] = [
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T00:00:00.000Z",
        weight_kg: 80,
        body_fat_pct: null,
      },
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T02:50:00.000Z",
        weight_kg: 70,
        body_fat_pct: null,
      },
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T03:00:00.000Z",
        weight_kg: null,
        body_fat_pct: 20,
      },
    ];
    expect(resolveFfmKgForDate("2026-07-01", samples)).toBe(56);
  });
});

describe("sumEeeByDate", () => {
  it("sums calories_burned and treats missing as 0", () => {
    const rows: TrainingBurnRow[] = [
      { date: "2026-07-01", calories_burned: 200 },
      { date: "2026-07-01", calories_burned: 200 },
      { date: "2026-07-02", calories_burned: null },
    ];
    const map = sumEeeByDate(rows);
    expect(map.get("2026-07-01")).toBe(400);
    expect(map.get("2026-07-02")).toBe(0);
  });
});

describe("classifyRedsBand", () => {
  it("classifies provisional thresholds", () => {
    expect(classifyRedsBand(null)).toBeNull();
    expect(classifyRedsBand(19.9)).toBe("red");
    expect(classifyRedsBand(20)).toBe("yellow");
    expect(classifyRedsBand(29.9)).toBe("yellow");
    expect(classifyRedsBand(30)).toBe("green");
  });
});

describe("buildPeriodEnergyMetrics", () => {
  const intake = (rows: Array<Partial<DailyIntake> & { date: string }>): DailyIntake[] =>
    rows.map((r) => ({
      date: r.date,
      intake_kcal: r.intake_kcal ?? 0,
      hasFood: r.hasFood ?? false,
    }));

  it("does not add training calories into balance", () => {
    const das: DasRow[] = [
      { date: "2026-07-02", basal_calories_kcal: 1500, active_calories_kcal: 500 },
    ];
    const training: TrainingBurnRow[] = [{ date: "2026-07-01", calories_burned: 9999 }];
    const result = buildPeriodEnergyMetrics({
      start: "2026-07-01",
      end: "2026-07-01",
      todayJst: "2026-07-10",
      excludeToday: true,
      excludeIncompleteToday: true,
      dailyIntake: intake([{ date: "2026-07-01", intake_kcal: 2200, hasFood: true }]),
      dasRows: das,
      trainingRows: training,
      bodyCompRows: [],
    });
    expect(result.dailyBalance[0]?.balance_kcal).toBe(200); // 2200 - (1500+500)
    expect(result.summary.avgBalanceKcal).toBe(200);
  });

  it("excludes balance when food missing or basal/active incomplete", () => {
    const result = buildPeriodEnergyMetrics({
      start: "2026-07-01",
      end: "2026-07-02",
      todayJst: "2026-07-10",
      excludeToday: true,
      excludeIncompleteToday: true,
      dailyIntake: intake([
        { date: "2026-07-01", intake_kcal: 0, hasFood: false },
        { date: "2026-07-02", intake_kcal: 2000, hasFood: true },
      ]),
      dasRows: [
        { date: "2026-07-02", basal_calories_kcal: 1500, active_calories_kcal: 500 },
        { date: "2026-07-03", basal_calories_kcal: 1500, active_calories_kcal: null },
      ],
      trainingRows: [],
      bodyCompRows: [],
    });
    expect(result.dailyBalance.find((d) => d.date === "2026-07-01")?.included).toBe(false);
    expect(result.dailyBalance.find((d) => d.date === "2026-07-02")?.included).toBe(false);
    expect(result.summary.avgBalanceKcal).toBeNull();
  });

  it("includes EA with intake=0 when food missing but FFM present (U1=B)", () => {
    const body: BodyCompRow[] = [
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T03:00:00.000Z",
        weight_kg: 70,
        body_fat_pct: null,
      },
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T03:00:00.000Z",
        weight_kg: null,
        body_fat_pct: 20,
      },
    ];
    const result = buildPeriodEnergyMetrics({
      start: "2026-07-01",
      end: "2026-07-01",
      todayJst: "2026-07-10",
      excludeToday: true,
      excludeIncompleteToday: true,
      dailyIntake: intake([{ date: "2026-07-01", intake_kcal: 0, hasFood: false }]),
      dasRows: [],
      trainingRows: [{ date: "2026-07-01", calories_burned: 400 }],
      bodyCompRows: body,
    });
    expect(result.dailyBalance[0]?.included).toBe(false);
    expect(result.dailyEa[0]?.included).toBe(true);
    expect(result.dailyEa[0]?.ea).toBeCloseTo((0 - 400) / 56, 5);
    expect(result.summary.periodEa).toBeCloseTo(-400 / 56, 5);
  });

  it("uses mean of valid daily EA (not week-total / avg FFM)", () => {
    const bodyFor = (date: string): BodyCompRow[] => [
      {
        date,
        measured_at: `${date}T03:00:00.000Z`,
        weight_kg: 70,
        body_fat_pct: null,
      },
      {
        date,
        measured_at: `${date}T03:00:00.000Z`,
        weight_kg: null,
        body_fat_pct: 20,
      },
    ];
    const result = buildPeriodEnergyMetrics({
      start: "2026-07-01",
      end: "2026-07-02",
      todayJst: "2026-07-10",
      excludeToday: true,
      excludeIncompleteToday: true,
      dailyIntake: intake([
        { date: "2026-07-01", intake_kcal: 2200, hasFood: true },
        { date: "2026-07-02", intake_kcal: 1800, hasFood: true },
      ]),
      dasRows: [],
      trainingRows: [
        { date: "2026-07-01", calories_burned: 400 },
        { date: "2026-07-02", calories_burned: 0 },
      ],
      bodyCompRows: [...bodyFor("2026-07-01"), ...bodyFor("2026-07-02")],
    });
    const ea1 = (2200 - 400) / 56;
    const ea2 = (1800 - 0) / 56;
    expect(result.summary.periodEa).toBeCloseTo((ea1 + ea2) / 2, 5);
  });

  it("excludes today from balance and EA with separate flags", () => {
    const body: BodyCompRow[] = [
      {
        date: "2026-07-10",
        measured_at: "2026-07-10T03:00:00.000Z",
        weight_kg: 70,
        body_fat_pct: null,
      },
      {
        date: "2026-07-10",
        measured_at: "2026-07-10T03:00:00.000Z",
        weight_kg: null,
        body_fat_pct: 20,
      },
    ];
    const result = buildPeriodEnergyMetrics({
      start: "2026-07-10",
      end: "2026-07-10",
      todayJst: "2026-07-10",
      excludeToday: true,
      excludeIncompleteToday: true,
      dailyIntake: intake([{ date: "2026-07-10", intake_kcal: 2200, hasFood: true }]),
      dasRows: [
        { date: "2026-07-11", basal_calories_kcal: 1500, active_calories_kcal: 500 },
      ],
      trainingRows: [],
      bodyCompRows: body,
    });
    expect(result.dailyBalance[0]?.included).toBe(false);
    expect(result.dailyEa[0]?.included).toBe(false);
    expect(result.summary.avgBalanceKcal).toBeNull();
    expect(result.summary.periodEa).toBeNull();
    expect(result.summary.redsBand).toBeNull();
  });

  it("treats missing EEE as 0", () => {
    const body: BodyCompRow[] = [
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T03:00:00.000Z",
        weight_kg: 70,
        body_fat_pct: null,
      },
      {
        date: "2026-07-01",
        measured_at: "2026-07-01T03:00:00.000Z",
        weight_kg: null,
        body_fat_pct: 20,
      },
    ];
    const result = buildPeriodEnergyMetrics({
      start: "2026-07-01",
      end: "2026-07-01",
      todayJst: "2026-07-10",
      excludeToday: true,
      excludeIncompleteToday: true,
      dailyIntake: intake([{ date: "2026-07-01", intake_kcal: 2240, hasFood: true }]),
      dasRows: [],
      trainingRows: [],
      bodyCompRows: body,
    });
    expect(result.dailyEa[0]?.eee_kcal).toBe(0);
    expect(result.dailyEa[0]?.ea).toBeCloseTo(40, 5);
    expect(result.summary.redsBand).toBe("green");
  });
});
