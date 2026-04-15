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
