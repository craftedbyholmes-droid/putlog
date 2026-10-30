"use client";
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Card, CardHeader, Field, Input, Notice, PageTitle, Select } from "@/components/ui";
import { HakiResult } from "@/components/HakiResult";
import { LengthInput } from "@/components/LengthInput";
import { ftIn } from "@/lib/utils";

/* Standalone stair tower calculator. To price a tower on a job, add a HAKI scaffold on the job page. */
export default function Haki() {
  const [f, setF] = useState({ target_m: 6, lift_m: 2, orientation: "width_against", pricing_mode: "height", per_metre: "" });
  const [r, setR] = useState<any>(null); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const run = async () => { setMsg(null); try { setR(await api("/haki/calculate", { method: "POST", body: JSON.stringify({ ...f, per_metre: f.per_metre ? Number(f.per_metre) : null }) })); } catch (e: any) { setR(null); setMsg({ ok: false, text: e.message }); } };
  return (
    <div className="space-y-4">
      <PageTitle title="HAKI stair tower" sub="Standard stair tower, bay 3050 × 1655 mm, single flight. Component quantities are a draft until a HAKI-trained scaffolder signs them off." />
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
        <Card className="space-y-3 p-4">
          <Field label="Target height (m or ft)" hint={`${ftIn(f.target_m * 1000)} · feet round to the nearest 0.5 m · first platform sits at 0.5 m · cap 100 ft (30.48 m)`}>
            <LengthInput block rounding="nearest" value={f.target_m} onCommit={(m) => setF({ ...f, target_m: m ?? 0 })} ariaLabel="Target height" />
          </Field>
          <Field label="Lift height"><Select value={f.lift_m} onChange={(e) => setF({ ...f, lift_m: Number(e.target.value) })}><option value={1}>1 m</option><option value={1.5}>1.5 m</option><option value={2}>2 m</option></Select></Field>
          <Field label="Against the scaffold"><Select value={f.orientation} onChange={(e) => setF({ ...f, orientation: e.target.value })}><option value="width_against">Width (1655 mm): full-width access</option><option value="length_against">Length (3050 mm): side-exit section</option></Select></Field>
          <Field label="£ per vertical metre (optional)" hint="Priced on the target height for now"><Input inputMode="decimal" value={f.per_metre} onChange={(e) => setF({ ...f, per_metre: e.target.value })} /></Field>
          <Button className="w-full" onClick={run}>Calculate</Button>
        </Card>
        <div className="space-y-4">
          {r && r.status === "ok" && <Card><CardHeader title="Tower" /><div className="flex justify-center p-4"><TowerSvg r={r} /></div></Card>}
          {r && <Card className="p-4"><HakiResult r={r} /></Card>}
        </div>
      </div>
    </div>
  );
}

/* Simple side view drawn by us (never HAKI's artwork): landings, flights, standards and the 4 ft handrail zone. */
function TowerSvg({ r }: { r: any }) {
  const H = r.standards_top_mm, scale = 260 / H, w = 120, x0 = 60, ground = 280;
  const y = (mm: number) => ground - mm * scale;
  const lift = (r.built_mm - 500) / r.lifts;
  const levels = Array.from({ length: r.lifts + 1 }, (_, i) => 500 + i * lift);
  return (
    <svg viewBox="0 0 300 300" className="h-80 w-auto" role="img" aria-label="Tower side view">
      <line x1="20" x2="280" y1={ground} y2={ground} stroke="#64748b" strokeWidth="2" />
      <rect x={x0} y={y(H)} width="4" height={H * scale} fill="#334155" /><rect x={x0 + w} y={y(H)} width="4" height={H * scale} fill="#334155" />
      <rect x={x0} y={y(H)} width={w + 4} height={(H - r.built_mm) * scale} fill="#dbeafe" opacity="0.6" />
      {levels.map((l, i) => <g key={i}><rect x={x0} y={y(l) - 2} width={w + 4} height="4" fill="#2563eb" /><text x={x0 + w + 12} y={y(l) + 4} fontSize="9" fill="#334155">{(l / 1000).toFixed(1)} m</text></g>)}
      {levels.slice(0, -1).map((l, i) => <line key={i} x1={i % 2 ? x0 + w - 10 : x0 + 10} y1={y(l)} x2={i % 2 ? x0 + 10 : x0 + w - 10} y2={y(l + lift)} stroke="#f59e0b" strokeWidth="3" />)}
      <rect x={x0 - 20} y={y(250)} width="16" height={250 * scale} fill="#94a3b8" />
      <text x={x0 + w + 12} y={y(H) + 4} fontSize="9" fill="#1d4ed8">tops {(H / 1000).toFixed(1)} m</text>
      <text x="8" y={y(250) - 4} fontSize="8" fill="#475569">step</text>
    </svg>
  );
}