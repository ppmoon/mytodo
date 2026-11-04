import { addDays, wallTimeToUtc, weekdayMon0, ymdInZone, ymdString, type Ymd } from "./dates";

export type RepeatRule = {
  freq: "daily" | "weekly" | "monthly";
  interval: number;
  weekdays?: number[];
};

const WEEK = "一二三四五六日天";

export type ParsedQuickAdd = {
  title: string;
  dueAt: string | null;
  allDay: boolean;
  priority?: number;
  tags: string[];
};

function nextMonday(ymd: Ymd): Ymd {
  const weekday = weekdayMon0(ymd);
  const delta = (7 - weekday) % 7 || 7;
  return addDays(ymd, delta);
}

function upcomingWeekday(ymd: Ymd, target: number): Ymd {
  const weekday = weekdayMon0(ymd);
  return addDays(ymd, (target - weekday + 7) % 7);
}

function readDate(text: string, today: Ymd): { ymd: Ymd; rest: string } | null {
  const rules: [RegExp, (match: RegExpMatchArray) => Ymd][] = [
    [/大后天/, () => addDays(today, 3)],
    [/后天/, () => addDays(today, 2)],
    [/明天/, () => addDays(today, 1)],
    [/今天/, () => today],
    [/\btomorrow\b/i, () => addDays(today, 1)],
    [/\btoday\b/i, () => today],
    [/下周([一二三四五六日天])/, (match) => addDays(nextMonday(today), WEEK.indexOf(match[1]) % 7)],
    [/下?星期([一二三四五六日天])/, (match) => upcomingWeekday(today, WEEK.indexOf(match[1]) % 7)],
    [/周([一二三四五六日天])/, (match) => upcomingWeekday(today, WEEK.indexOf(match[1]) % 7)],
  ];
  for (const [pattern, build] of rules) {
    const match = text.match(pattern);
    if (!match || match.index === undefined) continue;
    return { ymd: build(match), rest: `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}` };
  }
  return null;
}

function readTime(text: string): { hour: number; minute: number; rest: string } | null {
  const clock = text.match(/(\d{1,2})[:：](\d{2})/);
  if (clock && clock.index !== undefined) {
    return {
      hour: Number(clock[1]),
      minute: Number(clock[2]),
      rest: `${text.slice(0, clock.index)} ${text.slice(clock.index + clock[0].length)}`,
    };
  }
  const spoken = text.match(/(上午|下午|晚上|中午|早上)?\s*(\d{1,2})\s*点(半|\d{1,2}分)?/);
  if (!spoken || spoken.index === undefined) return null;
  let hour = Number(spoken[2]);
  const minute = spoken[3] === "半" ? 30 : spoken[3] ? Number(spoken[3].replace("分", "")) : 0;
  if ((spoken[1] === "下午" || spoken[1] === "晚上") && hour < 12) hour += 12;
  if (spoken[1] === "中午" && hour < 11) hour = 12;
  return {
    hour,
    minute,
    rest: `${text.slice(0, spoken.index)} ${text.slice(spoken.index + spoken[0].length)}`,
  };
}

export function parseQuickAdd(input: string, now: Date, timeZone: string): ParsedQuickAdd {
  let text = input.trim();
  const tags: string[] = [];
  text = text.replace(/#([^\s#]+)/g, (_all, name: string) => {
    tags.push(name);
    return " ";
  });
  let priority: number | undefined;
  text = text.replace(/!(高|中|低|无)|\bp([123])\b/gi, (token) => {
    if (token.includes("高") || /p1/i.test(token)) priority = 3;
    else if (token.includes("中") || /p2/i.test(token)) priority = 2;
    else if (token.includes("低") || /p3/i.test(token)) priority = 1;
    else priority = 0;
    return " ";
  });
  const today = ymdInZone(now, timeZone);
  const date = readDate(text, today);
  if (date) text = date.rest;
  const time = readTime(text);
  if (time) text = time.rest;
  const title = text.replace(/\s+/g, " ").trim();
  if (!date && !time) {
    return { title, dueAt: null, allDay: false, priority, tags };
  }
  const ymd = date?.ymd ?? today;
  if (!time) {
    return { title, dueAt: ymdString(ymd), allDay: true, priority, tags };
  }
  const local = `${ymdString(ymd)}T${String(time.hour).padStart(2, "0")}:${String(time.minute).padStart(2, "0")}`;
  return { title, dueAt: wallTimeToUtc(local, timeZone).toISOString(), allDay: false, priority, tags };
}

export function advanceDue(value: string, allDay: boolean, rule: RepeatRule): string {
  const interval = Math.max(1, rule.interval || 1);
  if (/^\d{4}-\d{2}-\d{2}$/.test(value) || allDay) {
    const [y, m, d] = value.slice(0, 10).split("-").map(Number);
    const ymd = { y, m, d };
    if (rule.freq === "monthly") {
      const date = new Date(Date.UTC(y, m - 1 + interval, d));
      return ymdString({ y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() });
    }
    if (rule.freq === "weekly") {
      const days = rule.weekdays?.length ? rule.weekdays : [weekdayMon0(ymd)];
      for (let step = 1; step <= 7 * interval + 7; step += 1) {
        const candidate = addDays(ymd, step);
        if (!days.includes(weekdayMon0(candidate))) continue;
        if (Math.floor(step / 7) % interval === 0) return ymdString(candidate);
      }
    }
    return ymdString(addDays(ymd, rule.freq === "daily" ? interval : interval * 7));
  }
  const date = new Date(value);
  if (rule.freq === "monthly") {
    date.setUTCMonth(date.getUTCMonth() + interval);
    return date.toISOString();
  }
  if (rule.freq === "weekly") {
    const ymd = { y: date.getUTCFullYear(), m: date.getUTCMonth() + 1, d: date.getUTCDate() };
    const next = advanceDue(ymdString(ymd), true, rule);
    const [y, m, d] = next.split("-").map(Number);
    date.setUTCFullYear(y, m - 1, d);
    return date.toISOString();
  }
  date.setUTCDate(date.getUTCDate() + interval);
  return date.toISOString();
}

export function describeRepeat(rule: RepeatRule | null): string {
  if (!rule) return "不重复";
  const n = rule.interval > 1 ? `每 ${rule.interval}` : "每";
  if (rule.freq === "daily") return `${n}天`;
  if (rule.freq === "monthly") return `${n}月`;
  const names = ["一", "二", "三", "四", "五", "六", "日"];
  const days = rule.weekdays?.map((day) => names[day]).join("、");
  return days ? `${n}周的周${days}` : `${n}周`;
}
