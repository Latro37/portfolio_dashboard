import type { SymphonyDetailPeriod } from "@/features/symphony-detail/types";

export function fmtDollar(value: number): string {
  return `$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtSignedDollar(value: number): string {
  const sign = value >= 0 ? "+" : "-";
  return `${sign}$${Math.abs(value).toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function fmtPct(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(2)}%`;
}

export function colorVal(value: number): string {
  if (value > 0) return "text-emerald-400";
  if (value < 0) return "text-red-400";
  return "text-muted-foreground";
}

export function makeDateFormatter(data: { date: string }[]) {
  const multiYear =
    data.length > 1 &&
    new Date(`${data[0].date}T00:00:00`).getFullYear() !==
      new Date(`${data[data.length - 1].date}T00:00:00`).getFullYear();
  return (dateStr: string) => {
    const date = new Date(`${dateStr}T00:00:00`);
    if (multiYear) {
      const yr = String(date.getFullYear()).slice(-2);
      return (
        date.toLocaleDateString("en-US", { month: "short", day: "numeric" }) +
        ` '${yr}`
      );
    }
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
}

export function formatPctAxis(value: number): string {
  return `${value.toFixed(2)}%`;
}

export function epochDayToDate(dayNumber: number): string {
  const date = new Date(dayNumber * 86400 * 1000);
  return date.toISOString().slice(0, 10);
}

export function isWeekday(dateStr: string): boolean {
  const day = new Date(`${dateStr}T00:00`).getDay();
  return day !== 0 && day !== 6;
}

export function periodStartDate(period: SymphonyDetailPeriod): string {
  const now = new Date();
  switch (period) {
    case "1W": {
      const d = new Date(now);
      d.setDate(d.getDate() - 7);
      return d.toISOString().slice(0, 10);
    }
    case "1M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 10);
    }
    case "3M": {
      const d = new Date(now);
      d.setMonth(d.getMonth() - 3);
      return d.toISOString().slice(0, 10);
    }
    case "YTD":
      return `${now.getFullYear()}-01-01`;
    case "1Y": {
      const d = new Date(now);
      d.setFullYear(d.getFullYear() - 1);
      return d.toISOString().slice(0, 10);
    }
    case "ALL":
    case "OOS":
      return "";
    default:
      return "";
  }
}

export function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}
