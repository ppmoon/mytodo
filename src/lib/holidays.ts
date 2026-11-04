export type Holiday = { date: string; name: string };

export const HOLIDAYS: Holiday[] = [
  { date: "2026-01-01", name: "元旦" },
  { date: "2026-02-17", name: "春节" },
  { date: "2026-04-04", name: "清明" },
  { date: "2026-05-01", name: "劳动节" },
  { date: "2026-06-19", name: "端午" },
  { date: "2026-09-25", name: "中秋" },
  { date: "2026-10-01", name: "国庆" },
  { date: "2027-01-01", name: "元旦" },
  { date: "2027-02-06", name: "春节" },
  { date: "2027-04-05", name: "清明" },
  { date: "2027-05-01", name: "劳动节" },
  { date: "2027-06-09", name: "端午" },
  { date: "2027-09-15", name: "中秋" },
  { date: "2027-10-01", name: "国庆" },
];

export function holidayOn(date: string): string | null {
  return HOLIDAYS.find((item) => item.date === date)?.name ?? null;
}
