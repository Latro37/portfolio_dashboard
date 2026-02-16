type YearMonthDay = {
  year: number;
  month: number;
  day: number;
};

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const HOLIDAY_CACHE = new Map<number, Set<string>>();

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function toIsoDate({ year, month, day }: YearMonthDay): string {
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function dateToYmd(date: Date): YearMonthDay {
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  };
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function weekdayUtc(year: number, month: number, day: number): number {
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

function parseIsoDate(dateStr: string): YearMonthDay | null {
  const match = ISO_DATE_PATTERN.exec(dateStr.slice(0, 10));
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12) return null;

  const maxDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  if (day < 1 || day > maxDay) return null;
  return { year, month, day };
}

function nthWeekdayOfMonth(year: number, month: number, weekday: number, nth: number): YearMonthDay {
  const firstDayWeekday = weekdayUtc(year, month, 1);
  const offset = (weekday - firstDayWeekday + 7) % 7;
  return {
    year,
    month,
    day: 1 + offset + (nth - 1) * 7,
  };
}

function lastWeekdayOfMonth(year: number, month: number, weekday: number): YearMonthDay {
  const lastDayDate = new Date(Date.UTC(year, month, 0));
  const lastDay = lastDayDate.getUTCDate();
  const lastWeekday = lastDayDate.getUTCDay();
  const offset = (lastWeekday - weekday + 7) % 7;
  return {
    year,
    month,
    day: lastDay - offset,
  };
}

function observedFixedHoliday(year: number, month: number, day: number): YearMonthDay {
  const fixedDate = new Date(Date.UTC(year, month - 1, day));
  const weekday = fixedDate.getUTCDay();
  if (weekday === 6) return dateToYmd(addDays(fixedDate, -1));
  if (weekday === 0) return dateToYmd(addDays(fixedDate, 1));
  return { year, month, day };
}

function easterSunday(year: number): YearMonthDay {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { year, month, day };
}

function holidaySetForYear(year: number): Set<string> {
  const cached = HOLIDAY_CACHE.get(year);
  if (cached) return cached;

  const holidays = new Set<string>();
  const addHoliday = (value: YearMonthDay) => {
    if (value.year === year) holidays.add(toIsoDate(value));
  };

  addHoliday(observedFixedHoliday(year, 1, 1));
  addHoliday(observedFixedHoliday(year + 1, 1, 1));
  addHoliday(nthWeekdayOfMonth(year, 1, 1, 3));
  addHoliday(nthWeekdayOfMonth(year, 2, 1, 3));

  const easter = easterSunday(year);
  addHoliday(dateToYmd(addDays(new Date(Date.UTC(easter.year, easter.month - 1, easter.day)), -2)));

  addHoliday(lastWeekdayOfMonth(year, 5, 1));
  if (year >= 2022) addHoliday(observedFixedHoliday(year, 6, 19));
  addHoliday(observedFixedHoliday(year, 7, 4));
  addHoliday(nthWeekdayOfMonth(year, 9, 1, 1));
  addHoliday(nthWeekdayOfMonth(year, 11, 4, 4));
  addHoliday(observedFixedHoliday(year, 12, 25));

  HOLIDAY_CACHE.set(year, holidays);
  return holidays;
}

export function isUsEquityTradingDay(dateStr: string): boolean {
  const parsed = parseIsoDate(dateStr);
  if (!parsed) return true;

  const weekday = weekdayUtc(parsed.year, parsed.month, parsed.day);
  if (weekday === 0 || weekday === 6) return false;

  return !holidaySetForYear(parsed.year).has(toIsoDate(parsed));
}
