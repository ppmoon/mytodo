import { Solar } from "lunar-javascript";

export function lunarLabel(date: string): string {
  const [y, m, d] = date.split("-").map(Number);
  const lunar = Solar.fromYmd(y, m, d).getLunar();
  return `${lunar.getMonthInChinese()}月${lunar.getDayInChinese()}`;
}
