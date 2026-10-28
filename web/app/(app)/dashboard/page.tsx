"use client";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { AlertTriangle, ChevronLeft, ChevronRight, ClipboardList, FileWarning, HardHat, MoreVertical, PoundSterling } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Card, CardHeader, Notice } from "@/components/ui";
import { ConfirmErectedModal } from "@/components/scaffold/actions";
import { cn, gbp, ukDate } from "@/lib/utils";

/* Two-level pipeline: jobs sit in the commercial columns; once accepted, each scaffold gets its own card
   through the physical columns; when every scaffold is down the job comes back as one card. */
type Col = { key: string; label: string; kind: "job" | "scaffold"; accent: string; drop: boolean };
const COLS: Col[] = [
  { key: "enquiry", label: "Enquiry", kind: "job", accent: "border-l-slate-400", drop: true },
  { key: "quoted", label: "Quoted", kind: "job", accent: "border-l-amber-400", drop: true },
  { key: "planning", label: "Planning & RAMS", kind: "scaffold", accent: "border-l-violet-500", drop: true },
  { key: "erecting", label: "Erecting", kind: "scaffold", accent: "border-l-blue-500", drop: true },
  { key: "on_hire", label: "On hire", kind: "scaffold", accent: "border-l-green-600", drop: true },
  { key: "dismantle", label: "Dismantle", kind: "scaffold", accent: "border-l-orange-500", drop: true },
  { key: "awaiting_invoice", label: "Awaiting invoice", kind: "job", accent: "border-l-slate-500", drop: false },
  { key: "invoiced", label: "Invoiced", kind: "job", accent: "border-l-cyan-600", drop: false },
  { key: "paid", label: "Paid", kind: "job", accent: "border-l-emerald-700", drop: false },
];
const SCAFF_COL: Record<string, string> = { planned: "planning", rams_raised: "planning", erecting: "erecting", on_hire: "on_hire", dismantle_requested: "dismantle", dismantling: "dismantle" };

type CardT = { id: string; type: "job" | "scaffold"; col: string; jobId: string; title: string; sub: string; site: string; kind?: string; status: string;
  date?: string; dateLabel?: string; gang?: number; unsigned?: boolean; rams?: string; hire?: { used: number; total: number }; nextInsp?: string; value?: number };

export default function Dashboard() {
  const [cards, setCards] = useState<CardT[]>([]);
  const [kpi, setKpi] = useState({ active: 0, quotes: 0, quoteValue: 0, unsigned: 0, ramsWaiting: 0 });
  const [urgent, setUrgent] = useState<{ text: string; href: string; tone: "red" | "amber" }[]>([]);
  const [opsByDay, setOpsByDay] = useState<Record<string, number>>({});
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [mobileCol, setMobileCol] = useState("planning");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const sb = supabase();
    const [{ data: jobs }, { data: docs }, { data: hand }, { data: lines }, { data: insp }, { data: staff }, { data: ops }] = await Promise.all([
      sb.from("jobs").select("id, reference, status, created_at, clients(name, company_name), sites(address, postcode, scaffolds(id, name, kind, status, planned_start_date, erected_at, hire_included_weeks))").neq("status", "closed").order("created_at"),
      sb.from("compliance_docs").select("scaffold_id, type, issued_at"),
      sb.from("handovers").select("signature_status, next_inspection_due, compliance_docs(scaffold_id)"),
      sb.from("quote_lines").select("line_total, quote_id, quotes(job_id, issued_at, vat_registered, vat_rate)"),
      sb.from("inspections").select("next_inspection_due, compliance_docs(scaffold_id)"),
      sb.from("staff").select("name, cisrs_card_expiry").not("cisrs_card_expiry", "is", null),
      sb.from("operations").select("id, start_date, scaffold_id, type, operation_crew(staff_id)"),
    ]);
    const ramsBy: Record<string, string> = {}; const sheetBy: Record<string, boolean> = {};
    (docs ?? []).forEach((d: any) => {
      if (d.type === "rams") ramsBy[d.scaffold_id] = d.issued_at ? "issued" : ramsBy[d.scaffold_id] === "issued" ? "issued" : "draft";
      if (["tg20_21", "tg30", "bespoke_design"].includes(d.type)) sheetBy[d.scaffold_id] = true;
    });
    const unsignedBy: Record<string, boolean> = {}; const nextBy: Record<string, string> = {};
    (hand ?? []).forEach((h: any) => { const s = h.compliance_docs?.scaffold_id; if (!s) return; if (h.signature_status === "pending") unsignedBy[s] = true; if (h.next_inspection_due && (!nextBy[s] || h.next_inspection_due > nextBy[s])) nextBy[s] = h.next_inspection_due; });
    (insp ?? []).forEach((i: any) => { const s = i.compliance_docs?.scaffold_id; if (s && i.next_inspection_due && (!nextBy[s] || i.next_inspection_due > nextBy[s])) nextBy[s] = i.next_inspection_due; });
    // the latest quote per job only, gross of VAT when the firm is registered
    const perQuote: Record<string, { job: string; at: string; total: number }> = {};
    (lines ?? []).forEach((l: any) => { const q = l.quotes; if (!q) return; const v = Number(l.line_total) * (q.vat_registered ? 1 + Number(q.vat_rate) / 100 : 1);
      perQuote[l.quote_id] = { job: q.job_id, at: q.issued_at ?? "", total: (perQuote[l.quote_id]?.total ?? 0) + v }; });
    const quoteTotal: Record<string, number> = {}; const latestAt: Record<string, string> = {};
    Object.values(perQuote).forEach((q) => { if (!latestAt[q.job] || q.at > latestAt[q.job]) { latestAt[q.job] = q.at; quoteTotal[q.job] = Math.round(q.total * 100) / 100; } });
    const gangBy: Record<string, number> = {}; const byDay: Record<string, number> = {};
    (ops ?? []).forEach((o: any) => { gangBy[o.scaffold_id] = Math.max(gangBy[o.scaffold_id] ?? 0, new Set((o.operation_crew ?? []).map((c: any) => c.staff_id)).size); if (o.start_date) byDay[o.start_date] = (byDay[o.start_date] ?? 0) + 1; });

    const out: CardT[] = []; const today = Date.now();
    (jobs ?? []).forEach((j: any) => {
      const client = j.clients?.company_name || j.clients?.name || "No client";
      const scaffolds = (j.sites ?? []).flatMap((s: any) => (s.scaffolds ?? []).map((x: any) => ({ ...x, site: s.address })));
      const site = j.sites?.[0]?.address ?? "";
      const job = (col: string): CardT => ({ id: "j:" + j.id, type: "job", col, jobId: j.id, title: j.reference, sub: client, site, status: j.status, date: j.created_at, dateLabel: "Logged", value: quoteTotal[j.id] });
      if (j.status === "enquiry" || j.status === "quoted") return out.push(job(j.status));
      if (j.status === "invoiced" || j.status === "paid") return out.push(job(j.status));
      const live = scaffolds.filter((s: any) => s.status !== "dismantled");
      if (!live.length && scaffolds.length) return out.push(job("awaiting_invoice"));
      live.forEach((s: any) => {
        const total = (s.hire_included_weeks ?? 4) * 7;
        const used = s.erected_at ? Math.max(1, Math.ceil((today - new Date(s.erected_at).getTime()) / 864e5)) : 0;
        out.push({ id: "s:" + s.id, type: "scaffold", col: SCAFF_COL[s.status] ?? "planning", jobId: j.id, title: s.name, sub: `${client} · ${j.reference}`, site: s.site,
          kind: s.kind, status: s.status, date: s.erected_at ?? s.planned_start_date, dateLabel: s.erected_at ? "Erected" : "Planned start", gang: gangBy[s.id],
          unsigned: unsignedBy[s.id], rams: ramsBy[s.id] ? (ramsBy[s.id] === "issued" ? (sheetBy[s.id] ? "ready" : "issued-no-sheet") : "draft") : sheetBy[s.id] ? "sheet-only" : "none",
          hire: s.status === "on_hire" || s.status.startsWith("dismantl") ? { used, total } : undefined, nextInsp: nextBy[s.id] });
      });
    });
    setCards(out);
    const unsigned = Object.keys(unsignedBy).length;
    const ramsWaiting = Object.values(ramsBy).filter((v) => v === "draft").length;
    const quoted = (jobs ?? []).filter((j: any) => j.status === "quoted");
    setKpi({ active: out.filter((c) => c.type === "scaffold" && ["erecting", "on_hire", "dismantle"].includes(c.col)).length, quotes: quoted.length,
      quoteValue: quoted.reduce((a: number, j: any) => a + (quoteTotal[j.id] ?? 0), 0), unsigned, ramsWaiting });
    const u: { text: string; href: string; tone: "red" | "amber" }[] = [];
    out.filter((c) => c.unsigned).forEach((c) => u.push({ text: `Handover unsigned: ${c.title} (${c.sub})`, href: `/jobs/${c.jobId}`, tone: "red" }));
    out.filter((c) => c.nextInsp && new Date(c.nextInsp).getTime() < today + 2 * 864e5).forEach((c) => u.push({ text: `Inspection due ${ukDate(c.nextInsp)}: ${c.title}`, href: `/jobs/${c.jobId}`, tone: new Date(c.nextInsp!).getTime() < today ? "red" : "amber" }));
    out.filter((c) => c.rams === "draft").forEach((c) => u.push({ text: `RAMS awaiting issue: ${c.title}`, href: `/jobs/${c.jobId}`, tone: "amber" }));
    (staff ?? []).forEach((s: any) => { const t = new Date(s.cisrs_card_expiry).getTime(); if (t < today + 30 * 864e5) u.push({ text: `CISRS card ${t < today ? "expired" : "expires"} ${ukDate(s.cisrs_card_expiry)}: ${s.name}`, href: "/board", tone: t < today ? "red" : "amber" }); });
    setUrgent(u); setOpsByDay(byDay); setLoading(false);
  }, []);
  useEffect(() => { load(); }, [load]);

  const move = async (card: CardT, to: string) => {
    if (card.col === to) return;
    const sb = supabase();
    try {
      if (card.type === "job") {
        const status = to === "enquiry" ? "enquiry" : to === "quoted" ? "quoted" : to === "planning" ? "accepted" : null;
        if (!status) throw new Error("Jobs move between Enquiry, Quoted and (once accepted) Planning. Invoicing comes in the next update.");
        const { error } = await sb.from("jobs").update({ status }).eq("id", card.jobId); if (error) throw error;
        setMsg({ ok: true, text: status === "accepted" ? `${card.title} accepted: its scaffolds are now in Planning & RAMS.` : `${card.title} moved to ${status}.` });
      } else {
        if (to === "on_hire") { setConfirmFor(card.id.slice(2)); return; }
        const status = to === "erecting" ? "erecting" : to === "dismantle" ? "dismantle_requested" : null;
        if (!status) throw new Error("A scaffold can't move back to that stage.");
        const { error } = await sb.from("scaffolds").update({ status }).eq("id", card.id.slice(2));
        if (error) throw new Error(error.message.includes("RULE 2") ? "Not yet: this scaffold needs an issued RAMS pack and a TG20:21/TG30 sheet or bespoke design before erection." : error.message);
        setMsg({ ok: true, text: `${card.title} moved to ${COLS.find((c) => c.key === to)?.label}.` });
      }
      load();
    } catch (e: any) { setMsg({ ok: false, text: e.message }); }
  };
  const markDismantled = async (card: CardT) => {
    const { error } = await supabase().from("scaffolds").update({ status: "dismantled" }).eq("id", card.id.slice(2));
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: `${card.title} dismantled.` }); load();
  };

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));
  const onDragEnd = (e: DragEndEvent) => { const c = cards.find((x) => x.id === e.active.id); if (c && e.over) move(c, String(e.over.id)); };

  return (
    <div className="flex flex-col gap-4 xl:flex-row">
      <div className="min-w-0 flex-1 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2"><h1 className="text-2xl font-semibold">Dashboard</h1><Link href="/jobs?new=1"><Button>New job</Button></Link></div>
        <Notice msg={msg} onClose={() => setMsg(null)} />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi icon={<HardHat size={18} />} label="Active scaffolds" value={kpi.active} tone="blue" />
          <Kpi icon={<PoundSterling size={18} />} label="Quotes out" value={kpi.quotes} extra={kpi.quoteValue ? gbp(kpi.quoteValue) : undefined} tone="green" />
          <Kpi icon={<FileWarning size={18} />} label="Unsigned handovers" value={kpi.unsigned} tone={kpi.unsigned ? "red" : "slate"} />
          <Kpi icon={<ClipboardList size={18} />} label="RAMS awaiting issue" value={kpi.ramsWaiting} tone={kpi.ramsWaiting ? "amber" : "slate"} />
        </div>
        <Card>
          <CardHeader title="Pipeline" action={<span className="text-xs text-slate-500">Drag cards to move them. On a phone, use the card menu.</span>} />
          {/* phone: one column at a time */}
          <div className="flex gap-2 overflow-x-auto border-b px-3 py-2 lg:hidden">
            {COLS.map((c) => <button key={c.key} onClick={() => setMobileCol(c.key)} className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-xs", mobileCol === c.key ? "border-brand bg-brand text-white" : "border-slate-300")}>{c.label} ({cards.filter((x) => x.col === c.key).length})</button>)}
          </div>
          <DndContext sensors={sensors} onDragEnd={onDragEnd}>
            <div className="flex gap-3 overflow-x-auto p-3">
              {COLS.map((col) => (
                <Column key={col.key} col={col} hiddenOnPhone={mobileCol !== col.key}>
                  {loading ? <p className="p-2 text-xs text-slate-400">Loading…</p> :
                    cards.filter((c) => c.col === col.key).map((c) => <PipeCard key={c.id} card={c} accent={col.accent} onMove={(to) => move(c, to)} onDismantled={() => markDismantled(c)} />)}
                </Column>
              ))}
            </div>
          </DndContext>
        </Card>
      </div>
      <aside className="w-full shrink-0 space-y-4 xl:w-80">
        <Card id="urgent"><CardHeader title="Urgent" />
          <div className="divide-y">{urgent.length === 0 ? <p className="p-4 text-sm text-slate-500">Nothing urgent.</p> : urgent.map((u, i) => (
            <Link key={i} href={u.href} className="flex gap-2 p-3 text-sm hover:bg-slate-50"><AlertTriangle size={16} className={u.tone === "red" ? "text-red-600" : "text-amber-500"} /><span>{u.text}</span></Link>))}</div>
        </Card>
        <Card><CardHeader title="Recent activity" /><p className="p-4 text-sm text-slate-500">Coming in a later update: who changed what, and when.</p></Card>
        <MiniCalendar opsByDay={opsByDay} />
      </aside>
      {confirmFor && <ConfirmErectedModal scaffoldId={confirmFor} open onClose={() => setConfirmFor(null)} onDone={(m) => { setMsg(m); load(); }} />}
    </div>
  );
}

function Kpi({ icon, label, value, extra, tone }: { icon: React.ReactNode; label: string; value: number; extra?: string; tone: "blue" | "green" | "red" | "amber" | "slate" }) {
  const bg = { blue: "bg-blue-50 text-blue-700", green: "bg-green-50 text-green-700", red: "bg-red-50 text-red-700", amber: "bg-amber-50 text-amber-700", slate: "bg-slate-100 text-slate-600" }[tone];
  return <Card className="flex items-center gap-3 p-3"><div className={cn("rounded-md p-2", bg)}>{icon}</div><div><div className="text-xs text-slate-500">{label}</div><div className="text-xl font-semibold">{value}{extra && <span className="ml-2 text-sm font-normal text-slate-500">{extra}</span>}</div></div></Card>;
}

function Column({ col, children, hiddenOnPhone }: { col: Col; children: React.ReactNode; hiddenOnPhone: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key, disabled: !col.drop });
  return (
    <div ref={setNodeRef} className={cn("flex w-full shrink-0 flex-col rounded-md bg-slate-100 p-2 lg:flex lg:w-60", hiddenOnPhone && "hidden", isOver && "ring-2 ring-brand")}>
      <div className="mb-2 flex items-center justify-between px-1"><span className="text-xs font-semibold uppercase tracking-wide text-slate-600">{col.label}</span><Badge>{col.kind === "job" ? "Jobs" : "Scaffolds"}</Badge></div>
      <div className="min-h-24 space-y-2">{children}</div>
    </div>
  );
}

function PipeCard({ card, accent, onMove, onDismantled }: { card: CardT; accent: string; onMove: (to: string) => void; onDismantled: () => void }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: card.id });
  const [menu, setMenu] = useState(false);
  const targets = card.type === "job" ? COLS.filter((c) => ["enquiry", "quoted", "planning"].includes(c.key)) : COLS.filter((c) => ["erecting", "on_hire", "dismantle"].includes(c.key));
  const style = transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined;
  return (
    <div ref={setNodeRef} style={style} className={cn("relative rounded-md border border-l-4 bg-white p-2.5 text-sm shadow-sm", accent, isDragging && "opacity-80 shadow-lg")}>
      <div {...listeners} {...attributes} className="cursor-grab touch-none">
        <div className="flex items-start justify-between gap-1 pr-6"><Link href={`/jobs/${card.jobId}`} className="font-semibold text-slate-900 hover:underline">{card.title}</Link></div>
        <div className="text-xs text-slate-500">{card.sub}</div>
        <div className="mt-0.5 truncate text-xs text-slate-500">{card.site}</div>
        <div className="mt-1.5 flex flex-wrap gap-1">
          {card.kind && <Badge tone={card.kind === "haki_stair_tower" ? "violet" : "slate"}>{card.kind === "haki_stair_tower" ? "HAKI tower" : "Tube & fitting"}</Badge>}
          {card.unsigned && <Badge tone="red">Handover unsigned</Badge>}
          {card.rams === "draft" && <Badge tone="amber">RAMS draft</Badge>}
          {card.rams === "ready" && card.col === "planning" && <Badge tone="green">Ready to erect</Badge>}
          {card.col === "planning" && ["none", "sheet-only"].includes(card.rams ?? "") && <Badge tone="amber">No RAMS</Badge>}
        </div>
        <div className="mt-1.5 text-xs text-slate-600">{card.dateLabel}: {ukDate(card.date)}{card.gang ? ` · Gang of ${card.gang}` : ""}</div>
        {card.value != null && card.col === "quoted" && <div className="mt-1 text-xs font-medium text-slate-700">Quote {gbp(card.value)}</div>}
        {card.hire && (
          <div className="mt-2">
            <div className="flex justify-between text-[11px] text-slate-500"><span>Hire day {card.hire.used} of {card.hire.total}</span>{card.hire.used > card.hire.total && <span className="text-red-600">Extension</span>}</div>
            <div className="mt-0.5 h-1.5 rounded bg-slate-200"><div className={cn("h-1.5 rounded", card.hire.used > card.hire.total ? "bg-red-500" : "bg-green-600")} style={{ width: `${Math.min(100, (card.hire.used / card.hire.total) * 100)}%` }} /></div>
          </div>
        )}
        {card.nextInsp && <div className={cn("mt-1 text-[11px]", new Date(card.nextInsp).getTime() < Date.now() ? "text-red-600" : "text-slate-500")}>Next inspection {ukDate(card.nextInsp)}</div>}
      </div>
      <button aria-label="Card actions" onClick={() => setMenu(!menu)} className="absolute right-1 top-1 rounded p-1 text-slate-400 hover:bg-slate-100"><MoreVertical size={16} /></button>
      {menu && (
        <div className="absolute right-1 top-8 z-20 w-48 rounded-md border bg-white py-1 text-xs shadow-lg" onMouseLeave={() => setMenu(false)}>
          <Link href={`/jobs/${card.jobId}`} className="block px-3 py-2 hover:bg-slate-50">Open job</Link>
          {targets.filter((t) => t.key !== card.col).map((t) => <button key={t.key} onClick={() => { setMenu(false); onMove(t.key); }} className="block w-full px-3 py-2 text-left hover:bg-slate-50">Move to {t.label}</button>)}
          {card.col === "dismantle" && <button onClick={() => { setMenu(false); onDismantled(); }} className="block w-full px-3 py-2 text-left hover:bg-slate-50">Mark dismantled</button>}
        </div>
      )}
    </div>
  );
}

function MiniCalendar({ opsByDay }: { opsByDay: Record<string, number> }) {
  const [month, setMonth] = useState(() => { const d = new Date(); d.setDate(1); return d; });
  const days = useMemo(() => {
    const first = new Date(month); const start = (first.getDay() + 6) % 7; const out: (Date | null)[] = Array(start).fill(null);
    const n = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
    for (let i = 1; i <= n; i++) out.push(new Date(first.getFullYear(), first.getMonth(), i, 12));
    return out;
  }, [month]);
  const today = new Date().toDateString();
  return (
    <Card>
      <CardHeader title="Schedule" action={<div className="flex items-center gap-1"><button aria-label="Previous month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}><ChevronLeft size={16} /></button><span className="text-xs">{month.toLocaleDateString("en-GB", { month: "short", year: "numeric" })}</span><button aria-label="Next month" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}><ChevronRight size={16} /></button></div>} />
      <div className="grid grid-cols-7 gap-1 p-3 text-center text-xs">
        {["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"].map((d) => <div key={d} className="text-slate-400">{d}</div>)}
        {days.map((d, i) => d ? (
          <Link key={i} href={`/board?week=${d.toISOString().slice(0, 10)}`} className={cn("relative rounded py-1 hover:bg-slate-100", d.toDateString() === today && "bg-brand text-white hover:bg-brand")}>
            {d.getDate()}{opsByDay[d.toISOString().slice(0, 10)] ? <span className="absolute bottom-0.5 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-500" /> : null}
          </Link>) : <div key={i} />)}
      </div>
    </Card>
  );
}
