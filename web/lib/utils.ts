import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export const cn = (...v: ClassValue[]) => twMerge(clsx(v));
export const gbp = (n: number | string | null | undefined) =>
  n == null || n === "" ? "—" : "£" + Number(n).toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const ukDate = (s?: string | null) => (s ? new Date(s).toLocaleDateString("en-GB") : "—");
export const ftIn = (mm: number) => {
  const inches = Math.round(mm / 25.4);
  const ft = Math.floor(inches / 12), i = inches % 12;
  return i ? `${ft} ft ${i} in` : `${ft} ft`;
};
export const metres = (mm: number) => `${(mm / 1000).toFixed(mm % 1000 === 0 ? 1 : 2)} m`;
export const isoDay = (d: Date) => d.toISOString().slice(0, 10);
export const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
export const monday = (d: Date) => { const x = new Date(d); const day = (x.getDay() + 6) % 7; x.setDate(x.getDate() - day); x.setHours(12, 0, 0, 0); return x; };
