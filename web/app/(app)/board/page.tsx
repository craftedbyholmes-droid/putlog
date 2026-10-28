"use client";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DndContext, PointerSensor, TouchSensor, useDraggable, useDroppable, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { ChevronLeft, ChevronRight, Truck, User } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Card, Notice, PageTitle } from "@/components/ui";
import { addDays, cn, isoDay, monday, ukDate } from "@/lib/utils";

const TYPE_TONE: Record<string, string> = { put_up: "border-l-blue-500", adapt: "border-l-violet-500", strike: "border-l-orange-500", repair: "border-l-amber-500", inspection: "border-l-green-600" };
const TYPE_LABEL: Record<string, string> = { put_up: "Put up", adapt: "Adapt", strike: "Strike", repair: "Repair", inspection: "Inspection" };

function Board() {
  const sp = useSearchParams();
  const [start, setStart] = useState(() => monday(sp.get("week") ? new Date(sp.get("week")!) : new Date()));
  const days = useMemo(() => Array.from({ length: 6 }, (_, i) => isoDay(addDays(start, i))), [start]);
  const [staff, setStaff] = useState<any[]>([]); const [vans, setVans] = useState<any[]>([]); const [ops, setOps] = useState<any[]>([]);
  const [crew, setCrew] = useState<any[]>([]); const [absent, setAbsent] = useState<any[]>([]); const [companyId, setCompanyId] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null); const [phoneDay, setPhoneDay] = useState(isoDay(new Date()));

  const load = useCallback(async () => {
    const sb = supabase(); const { data: u } = await sb.auth.getUser();
    const [{ data: me }, { data: st }, { data: vn }, { data: op }, { data: ab }] = await Promise.all([
      sb.from("profiles").select("company_id").eq("id", u.user!.id).single(),
      sb.from("staff").select("id, name, worker_type, cisrs_card_expiry").eq("active", true).order("name"),
      sb.from("vans").select("id, registration, name").order("registration"),
      sb.from("operations").select("id, type, start_date, end_date, van_id, scaffold_id, scaffolds(name, status, sites(address, jobs(reference, clients(name, company_name))))"),
      sb.from("staff_absences").select("staff_id, day, kind").gte("day", days[0]).lte("day", days[5]),
    ]);
    const { data: cr } = await sb.from("operation_crew").select("id, operation_id, day, staff_id");
    setCompanyId(me?.company_id ?? ""); setStaff(st ?? []); setVans(vn ?? []); setOps(op ?? []); setCrew(cr ?? []); setAbsent(ab ?? []);
  }, [days]);
  useEffect(() => { load(); }, [load]);

  const opDays = (o: any) => { if (!o.start_date) return []; const out: string[] = []; for (let d = new Date(o.start_date); isoDay(d) <= (o.end_date ?? o.start_date); d = addDays(d, 1)) out.push(isoDay(d)); return out; };
  const unallocated = ops.filter((o) => o.scaffolds?.status !== "dismantled" && (!o.start_date || !o.van_id || !crew.some((c) => c.operation_id === o.id)));
  const isAbsent = (sid: string, day: string) => absent.find((a) => a.staff_id === sid && a.day === day);

  const fail = (e: any) => setMsg({ ok: false, text: String(e?.message ?? e).includes("RULE 2") ? "Not yet: a put-up can't be scheduled until the scaffold has an issued RAMS pack and a TG20:21/TG30 sheet or bespoke design." : String(e?.message ?? e) });
  const onDragEnd = async (e: DragEndEvent) => {
    if (!e.over) return;
    const [, opId, fromKind, fromId, fromDay] = String(e.active.id).split(":");
    const [toKind, toId, toDay] = String(e.over.id).split(":");
    const o = ops.find((x) => x.id === opId); if (!o) return;
    const sb = supabase();
    try {
      if (toKind === "unallocated") {
        if (fromKind === "staff") await sb.from("operation_crew").delete().match({ operation_id: opId, staff_id: fromId, day: fromDay });
        if (fromKind === "van") { const { error } = await sb.from("operations").update({ van_id: null }).eq("id", opId); if (error) throw error; }
      } else {
        if (toKind === "staff" && isAbsent(toId, toDay)) throw new Error("That person is marked off that day.");
        if (!o.start_date || !opDays(o).includes(toDay)) {
          const { error } = await sb.from("operations").update({ start_date: toDay, end_date: toDay }).eq("id", opId); if (error) throw error;
          if (o.start_date) await sb.from("operation_crew").delete().eq("operation_id", opId).neq("day", toDay);
        }
        if (toKind === "staff") {
          if (fromKind === "staff" && fromDay === toDay && fromId !== toId) await sb.from("operation_crew").delete().match({ operation_id: opId, staff_id: fromId, day: fromDay });
          const { error } = await sb.from("operation_crew").upsert({ company_id: companyId, operation_id: opId, staff_id: toId, day: toDay, rate_type: "day" }, { onConflict: "operation_id,day,staff_id" }); if (error) throw error;
        }
        if (toKind === "van") { const { error } = await sb.from("operations").update({ van_id: toId }).eq("id", opId); if (error) throw error; }
      }
      setMsg(null); load();
    } catch (err) { fail(err); }
  };
  const toggleOff = async (sid: string, day: string) => {
    const sb = supabase();
    if (isAbsent(sid, day)) await sb.from("staff_absences").delete().match({ staff_id: sid, day });
    else {
      await sb.from("staff_absences").insert({ company_id: companyId, staff_id: sid, day, kind: "holiday" });
      await sb.from("operation_crew").delete().match({ staff_id: sid, day });          // they come off that day's jobs
    }
    load();
  };
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(TouchSensor, { activationConstraint: { delay: 250, tolerance: 6 } }));
  const cisrs = (s: any) => s.cisrs_card_expiry && new Date(s.cisrs_card_expiry).getTime() < Date.now() + 30 * 864e5;

  return (
    <div className="space-y-3">
      <PageTitle title="Allocation board" sub="Drag operations onto a person and a van for each day. Tap H to mark someone on holiday that day."
        action={<div className="flex items-center gap-2"><Button variant="secondary" size="sm" onClick={() => setStart(addDays(start, -7))}><ChevronLeft size={16} /></Button><span className="text-sm">w/c {ukDate(days[0])}</span><Button variant="secondary" size="sm" onClick={() => setStart(addDays(start, 7))}><ChevronRight size={16} /></Button></div>} />
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <DndContext sensors={sensors} onDragEnd={onDragEnd}>
        <Strip ops={unallocated} />
        <div className="flex gap-2 overflow-x-auto lg:hidden">{days.map((d) => <button key={d} onClick={() => setPhoneDay(d)} className={cn("whitespace-nowrap rounded-full border px-3 py-1.5 text-xs", phoneDay === d ? "border-brand bg-brand text-white" : "border-slate-300")}>{new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" })}</button>)}</div>
        <Card className="overflow-x-auto">
          <table className="w-full min-w-[56rem] border-collapse text-sm max-lg:min-w-0">
            <thead><tr className="bg-slate-50 text-left text-xs text-slate-500"><th className="w-44 p-2">Person / van</th>{days.map((d) => <th key={d} className={cn("p-2", d !== phoneDay && "max-lg:hidden")}>{new Date(d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" })}</th>)}</tr></thead>
            <tbody>
              {staff.map((s) => (
                <tr key={s.id} className="border-t align-top">
                  <td className="p-2"><div className="flex items-center gap-1.5 font-medium"><User size={14} className="text-slate-400" />{s.name}</div><div className="flex gap-1">{s.worker_type === "subcontractor" && <Badge>Subbie</Badge>}{cisrs(s) && <Badge tone="red">CISRS {new Date(s.cisrs_card_expiry) < new Date() ? "expired" : "expiring"}</Badge>}</div></td>
                  {days.map((d) => (
                    <Cell key={d} id={`staff:${s.id}:${d}`} off={!!isAbsent(s.id, d)} hidden={d !== phoneDay} onToggleOff={() => toggleOff(s.id, d)}>
                      {crew.filter((c) => c.staff_id === s.id && c.day === d).map((c) => { const o = ops.find((x) => x.id === c.operation_id); return o ? <OpCard key={c.id} o={o} dragId={`op:${o.id}:staff:${s.id}:${d}`} /> : null; })}
                    </Cell>))}
                </tr>))}
              {vans.map((v) => (
                <tr key={v.id} className="border-t bg-slate-50/50 align-top">
                  <td className="p-2"><div className="flex items-center gap-1.5 font-medium"><Truck size={14} className="text-slate-400" />{v.registration}</div><div className="text-xs text-slate-500">{v.name}</div></td>
                  {days.map((d) => (
                    <Cell key={d} id={`van:${v.id}:${d}`} hidden={d !== phoneDay}>
                      {ops.filter((o) => o.van_id === v.id && opDays(o).includes(d)).map((o) => <OpCard key={o.id} o={o} dragId={`op:${o.id}:van:${v.id}:${d}`} />)}
                    </Cell>))}
                </tr>))}
            </tbody>
          </table>
        </Card>
      </DndContext>
    </div>
  );
}

function Strip({ ops }: { ops: any[] }) {
  const { setNodeRef, isOver } = useDroppable({ id: "unallocated" });
  return (
    <Card ref={setNodeRef} className={cn("p-2", isOver && "ring-2 ring-brand")}>
      <div className="mb-1 px-1 text-xs font-semibold uppercase tracking-wide text-slate-600">Unallocated ({ops.length}) <span className="font-normal normal-case text-slate-500">· needs a date, a gang or a van</span></div>
      <div className="flex gap-2 overflow-x-auto pb-1">{ops.length === 0 ? <span className="px-1 text-xs text-slate-500">Everything is allocated.</span> : ops.map((o) => <div key={o.id} className="w-52 shrink-0"><OpCard o={o} dragId={`op:${o.id}:strip:x:x`} /></div>)}</div>
    </Card>
  );
}

function Cell({ id, children, off, hidden, onToggleOff }: { id: string; children: React.ReactNode; off?: boolean; hidden?: boolean; onToggleOff?: () => void }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: off });
  return (
    <td ref={setNodeRef} className={cn("relative min-w-36 border-l p-1.5", hidden && "max-lg:hidden", off && "bg-[repeating-linear-gradient(45deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)]", isOver && "bg-blue-50")}>
      <div className="min-h-14 space-y-1">{off ? <span className="text-xs font-medium text-slate-500">Holiday</span> : children}</div>
      {onToggleOff && <button onClick={onToggleOff} title={off ? "Clear holiday" : "Mark holiday"} className={cn("absolute right-1 top-1 rounded px-1 text-[10px]", off ? "bg-slate-600 text-white" : "text-slate-300 hover:bg-slate-100 hover:text-slate-600")}>H</button>}
    </td>
  );
}

function OpCard({ o, dragId }: { o: any; dragId: string }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: dragId });
  const job = o.scaffolds?.sites?.jobs; const client = job?.clients?.company_name || job?.clients?.name;
  return (
    <div ref={setNodeRef} {...listeners} {...attributes} style={transform ? { transform: `translate(${transform.x}px, ${transform.y}px)`, zIndex: 50 } : undefined}
      className={cn("cursor-grab touch-none rounded border border-l-4 bg-white p-1.5 text-xs shadow-sm", TYPE_TONE[o.type], isDragging && "opacity-80 shadow-lg")}>
      <div className="font-semibold">{TYPE_LABEL[o.type]} · {o.scaffolds?.name}</div>
      <div className="truncate text-slate-500">{client} · {job?.reference}</div>
      <div className="truncate text-slate-400">{o.scaffolds?.sites?.address}</div>
    </div>
  );
}

export default function Page() { return <Suspense><Board /></Suspense>; }
