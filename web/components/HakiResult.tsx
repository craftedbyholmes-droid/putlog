"use client";
import { ftIn, gbp } from "@/lib/utils";

export function HakiResult({ r }: { r: any }) {
  if (r.status !== "ok") return <p className="rounded bg-amber-50 p-2 text-sm text-amber-800">{r.message}</p>;
  return (
    <div className="space-y-1 text-xs">
      <div>{r.lifts} lifts · built {(r.built_mm / 1000).toFixed(2)} m ({ftIn(r.built_mm)}) · overshoot {r.overshoot_mm} mm · standards top {(r.standards_top_mm / 1000).toFixed(1)} m ({r.projection_mm} mm above the platform)</div>
      <table className="w-full"><tbody>{r.bom.map((l: any) => <tr key={l.item} className="border-t"><td className="py-0.5">{l.item}</td><td className="text-right font-medium">{l.qty ?? "TBC"}</td></tr>)}</tbody></table>
      {r.price && <div className="text-right text-sm">Price {gbp(r.price)}</div>}
      <p className="text-amber-700">{r.warnings?.[0]}</p>
    </div>
  );
}
