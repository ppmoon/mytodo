import { describe, expect, it } from "vitest";
import { advanceDue, parseQuickAdd } from "../lib/nlp";
import { parseIcs } from "../lib/ics";

describe("parseQuickAdd", () => {
  const now = new Date("2026-11-04T02:00:00Z");
  const zone = "Asia/Shanghai";

  it("reads a timed Chinese phrase", () => {
    const parsed = parseQuickAdd("明天上午9点 买牛奶 #生活 !高", now, zone);
    expect(parsed.title).toBe("买牛奶");
    expect(parsed.tags).toEqual(["生活"]);
    expect(parsed.priority).toBe(3);
    expect(parsed.allDay).toBe(false);
    expect(parsed.dueAt).toBe("2026-11-05T01:00:00.000Z");
  });

  it("reads next week's weekday", () => {
    const parsed = parseQuickAdd("下周一下午3点 开会", now, zone);
    expect(parsed.title).toBe("开会");
    expect(parsed.dueAt).toBe("2026-11-09T07:00:00.000Z");
  });

  it("keeps an undated title", () => {
    const parsed = parseQuickAdd("交周报", now, zone);
    expect(parsed.title).toBe("交周报");
    expect(parsed.dueAt).toBeNull();
  });
});

describe("advanceDue", () => {
  it("moves a weekly task to the next selected weekday", () => {
    expect(advanceDue("2026-11-04", true, { freq: "weekly", interval: 1, weekdays: [4] })).toBe("2026-11-06");
  });

  it("moves a daily timestamp by one day", () => {
    expect(advanceDue("2026-11-04T01:00:00.000Z", false, { freq: "daily", interval: 1 })).toBe("2026-11-05T01:00:00.000Z");
  });
});

describe("parseIcs", () => {
  it("reads an all-day event", () => {
    const events = parseIcs("BEGIN:VCALENDAR\nBEGIN:VEVENT\nSUMMARY:放假\nDTSTART;VALUE=DATE:20261001\nEND:VEVENT\nEND:VCALENDAR");
    expect(events).toEqual([{ title: "放假", startAt: "2026-10-01", endAt: null, allDay: true }]);
  });
});
