const TOKYO_TZ = "Asia/Tokyo";

export function toJstDateString(date: Date = new Date()): string {
  return date.toLocaleDateString("sv-SE", { timeZone: TOKYO_TZ });
}

export function addDaysJst(dateStr: string, delta: number): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1));
  date.setUTCDate(date.getUTCDate() + delta);
  return date.toISOString().slice(0, 10);
}

export function getTokyoHourMinute(date: Date = new Date()): { hour: number; minute: number } {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TOKYO_TZ,
    hour: "numeric",
    minute: "numeric",
    hourCycle: "h23",
  });
  const parts = dtf.formatToParts(date);
  let hour = 0;
  let minute = 0;
  for (const p of parts) {
    if (p.type === "hour") hour = Number.parseInt(p.value, 10);
    if (p.type === "minute") minute = Number.parseInt(p.value, 10);
  }
  return { hour, minute };
}

export function eachDate(start: string, end: string): string[] {
  const out: string[] = [];
  let cursor = start;
  while (cursor <= end) {
    out.push(cursor);
    cursor = addDaysJst(cursor, 1);
  }
  return out;
}

const NAV_DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"] as const;

/**
 * Today 画面の日付ナビ表示。`dateStr` / `todayJst` は `toJstDateString` と同じ `YYYY-MM-DD`。
 * 暦日は JST の暦として解釈し、曜日は `Intl` のロケール差（Hermes / iOS 等）に依存しない。
 */
export function formatNavDate(dateStr: string, todayJst: string): string {
  const parts = dateStr.split("-").map(Number);
  const y = parts[0]!;
  const mo = parts[1]!;
  const d = parts[2]!;
  // その暦日の JST 正午 = UTC 同日 03:00（日本は DST なし）。その瞬間の世界共通の曜日 = その日の曜日。
  const anchor = new Date(Date.UTC(y, mo - 1, d, 3, 0, 0));
  const wi = anchor.getUTCDay();
  const wk = NAV_DAY_LABELS[wi] ?? "？";

  const label = `${mo}/${d}（${wk}）`;
  return dateStr === todayJst ? `今日 ${label}` : label;
}
