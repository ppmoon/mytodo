export type Ymd = { y: number; m: number; d: number };

export function ymdInZone(date: Date, timeZone: string): Ymd {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
}

export function pad(value: number): string {
  return String(value).padStart(2, "0");
}

export function ymdString(ymd: Ymd): string {
  return `${ymd.y}-${pad(ymd.m)}-${pad(ymd.d)}`;
}

export function addDays(ymd: Ymd, days: number): Ymd {
  const date = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
  return { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
}

export function weekdayMon0(ymd: Ymd): number {
  const js = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)).getUTCDay();
  return (js + 6) % 7;
}

export function compareYmd(a: Ymd, b: Ymd): number {
  return ymdString(a).localeCompare(ymdString(b));
}

export function wallTimeToUtc(local: string, timeZone: string): Date {
  const [date, time] = local.split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  let utc = Date.UTC(y, m - 1, d, hh, mm);
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = Object.fromEntries(fmt.formatToParts(new Date(utc)).map((part) => [part.type, part.value]));
    let hour = Number(parts.hour);
    if (hour === 24) hour = 0;
    const asUtc = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), hour, Number(parts.minute));
    const desired = Date.UTC(y, m - 1, d, hh, mm);
    const diff = desired - asUtc;
    if (diff === 0) break;
    utc += diff;
  }
  return new Date(utc);
}

export function formatWhen(value: string | null, allDay: boolean, timeZone: string): string {
  if (!value) return "";
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return `${y}年${m}月${d}日`;
  }
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

export function dueYmd(value: string | null, allDay: boolean, timeZone: string): Ymd | null {
  if (!value) return null;
  if (allDay || /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    return { y, m, d };
  }
  return ymdInZone(new Date(value), timeZone);
}

export function todayYmd(now: Date, timeZone: string): Ymd {
  return ymdInZone(now, timeZone);
}

export function sameYmd(a: Ymd | null, b: Ymd | null): boolean {
  if (!a || !b) return false;
  return a.y === b.y && a.m === b.m && a.d === b.d;
}

export function isoToLocalInput(iso: string, timeZone: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
  const hour = parts.hour === "24" ? "00" : parts.hour;
  return `${parts.year}-${parts.month}-${parts.day}T${hour}:${parts.minute}`;
}

export function formatClock(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("zh-CN", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(iso));
}
