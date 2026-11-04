export type IcsEvent = {
  title: string;
  startAt: string;
  endAt: string | null;
  allDay: boolean;
};

function unfold(text: string): string[] {
  return text.replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "").split("\n");
}

function parseStamp(value: string): { at: string; allDay: boolean } {
  if (/^\d{8}$/.test(value)) {
    return { at: `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`, allDay: true };
  }
  const match = value.match(/^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})(Z)?$/);
  if (!match) return { at: value, allDay: false };
  const iso = `${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}${match[7] ? "Z" : ""}`;
  const date = match[7] ? new Date(iso) : new Date(iso);
  return { at: Number.isNaN(date.getTime()) ? iso : date.toISOString(), allDay: false };
}

export function parseIcs(text: string): IcsEvent[] {
  const events: IcsEvent[] = [];
  let current: Record<string, string> | null = null;
  for (const line of unfold(text)) {
    if (line === "BEGIN:VEVENT") current = {};
    else if (line === "END:VEVENT" && current) {
      const summary = current.SUMMARY || "未命名日程";
      const start = current.DTSTART;
      if (start) {
        const parsed = parseStamp(start);
        const end = current.DTEND ? parseStamp(current.DTEND).at : null;
        events.push({ title: summary, startAt: parsed.at, endAt: end, allDay: parsed.allDay });
      }
      current = null;
    } else if (current) {
      const index = line.indexOf(":");
      if (index === -1) continue;
      const key = line.slice(0, index).split(";")[0];
      current[key] = line.slice(index + 1);
    }
  }
  return events;
}

export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const radius = 6371000;
  const turn = Math.PI / 180;
  const dLat = (lat2 - lat1) * turn;
  const dLng = (lng2 - lng1) * turn;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * turn) * Math.cos(lat2 * turn) * Math.sin(dLng / 2) ** 2;
  return 2 * radius * Math.asin(Math.sqrt(a));
}
