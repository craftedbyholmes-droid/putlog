"use client";
import { use, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { api, download } from "@/lib/api";
import { Badge, Button, Card, CardHeader, Empty, Field, Input, Modal, Notice, Select } from "@/components/ui";
import { ConfirmErectedModal, InspectionModal, SheetModal, SignModal } from "@/components/scaffold/actions";
import { cn, ftIn, gbp, ukDate } from "@/lib/utils";
import { HakiResult } from "@/components/HakiResult";

type Msg = { ok: boolean; text: string } | null;
const STATUS_TONE: Record<string, any> = { planned: "slate", rams_raised: "violet", erecting: "blue", on_hire: "green", dismantle_requested: "amber", dismantling: "amber", dismantled: "slate" };
const DOC_NAMES: Record<string, string> = { method_statement: "Method statement", risk_assessment: "Risk assessment", handover: "Handover certificate", inspection: "Inspection report" };
const RAMS_PARTS = ["method_statement", "risk_assessment"];
// Stable keys for fixed-price items. Not crypto.randomUUID: that is missing on plain http (a phone on the local network).
const newId = () => Math.random().toString(36).slice(2, 10);
const wholeOrNull = (v: any) => (v === "" || v == null ? null : Number(v));

export default function JobPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [job, setJob] = useState<any>(null); const [staff, setStaff] = useState<any[]>([]); const [quotes, setQuotes] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]); const [me, setMe] = useState<any>(null); const [msg, setMsg] = useState<Msg>(null);
  const [newScaffold, setNewScaffold] = useState<string | null>(null); const [newSite, setNewSite] = useState(false);
  const load = useCallback(async () => {
    const sb = supabase();
    const { data: u } = await sb.auth.getUser();
    const [{ data: j }, { data: st }, { data: q }, { data: d }, { data: p }] = await Promise.all([
      sb.from("jobs").select("*, clients(*), sites(*, scaffolds(*, job_elevations(*)))").eq("id", id).single(),
      sb.from("staff").select("id, name, phone").eq("active", true).order("name"),
      sb.from("quotes").select("id, number, issued_at, vat_registered, vat_rate, quote_lines(line_total)").eq("job_id", id).order("number", { ascending: false }),
      sb.from("compliance_docs").select("*, handovers(*), compliance_sheets(*), bespoke_designs(*)").order("created_at"),
      sb.from("profiles").select("role, company_id").eq("id", u.user!.id).single(),
    ]);
    setJob(j); setStaff(st ?? []); setQuotes(q ?? []); setDocs(d ?? []); setMe(p);
  }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!job) return <p className="text-sm text-slate-500">Loading…</p>;
  const sb = supabase();
  const saveJob = async (patch: any) => { const { error } = await sb.from("jobs").update(patch).eq("id", id); if (error) setMsg({ ok: false, text: error.message }); else load(); };
  const buildQuote = async () => { try { const r = await api(`/jobs/${id}/quotes`, { method: "POST" }); setMsg({ ok: true, text: `Quote ${r.number} created: ${gbp(r.total)}.` }); load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } };

  return (
    <div className="space-y-4">
      {/* Messages pop up in the corner, so a result is seen wherever the page is scrolled to. */}
      <div className="fixed inset-x-4 bottom-4 z-40 shadow-lg sm:left-auto sm:w-[28rem]"><Notice msg={msg} onClose={() => setMsg(null)} /></div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-semibold">{job.reference} · {job.clients?.company_name || job.clients?.name}</h1><p className="text-sm text-slate-500">{job.scope || "No scope entered"}</p></div>
        <div className="flex items-center gap-2"><Badge tone="blue">{job.status}</Badge>
          <Select className="w-40" value={job.status} onChange={(e) => saveJob({ status: e.target.value })}>
            {["enquiry", "quoted", "accepted"].map((s) => <option key={s} value={s}>{s[0].toUpperCase() + s.slice(1)}</option>)}
            {["invoiced", "paid", "closed"].includes(job.status) && <option value={job.status}>{job.status}</option>}
          </Select></div>
      </div>

      <Card><CardHeader title="Job details" />
        <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Supervisor (goes on the RAMS)"><Select value={job.supervisor_staff_id ?? ""} onChange={(e) => saveJob({ supervisor_staff_id: e.target.value || null })}><option value="">Choose…</option>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</Select></Field>
          <Field label="Emergency contact"><Input defaultValue={job.emergency_contact_name ?? ""} onBlur={(e) => saveJob({ emergency_contact_name: e.target.value })} /></Field>
          <Field label="Emergency phone"><Input defaultValue={job.emergency_contact_phone ?? ""} inputMode="tel" onBlur={(e) => saveJob({ emergency_contact_phone: e.target.value })} /></Field>
          <Field label="Hire clock starts on"><Select value={job.hire_start_trigger} onChange={(e) => saveJob({ hire_start_trigger: e.target.value })}><option value="job_up_confirmed">Job up confirmed</option><option value="handover_emailed">Handover emailed</option></Select></Field>
        </div>
        <p className="px-4 pb-3 text-xs text-slate-500">Changed the supervisor or emergency contact? Click Regenerate on each draft RAMS. Signing does it for you.</p>
      </Card>

      {(job.sites ?? []).map((site: any) => (
        <Card key={site.id}>
          <CardHeader title={`Site: ${site.address}${site.postcode ? ", " + site.postcode : ""}`} action={<Button size="sm" variant="secondary" onClick={() => setNewScaffold(site.id)}>Add scaffold</Button>} />
          <div className="space-y-4 p-4">
            {(site.scaffolds ?? []).length === 0 && <Empty>No scaffolds yet. Add one for each elevation or tower you will hire separately.</Empty>}
            {(site.scaffolds ?? []).sort((a: any, b: any) => a.name.localeCompare(b.name)).map((s: any) => (
              <ScaffoldPanel key={s.id} s={s} docs={docs.filter((d) => d.scaffold_id === s.id)} isOwner={me?.role === "owner"} companyId={me?.company_id} onMsg={setMsg} reload={load} />
            ))}
          </div>
        </Card>
      ))}
      <Button variant="secondary" onClick={() => setNewSite(true)}>Add another site</Button>

      <Card><CardHeader title="Quotes" action={<Button size="sm" onClick={buildQuote}>Build quote from measurements</Button>} />
        <div className="divide-y">{quotes.length === 0 ? <p className="p-4 text-sm text-slate-500">No quote yet. Enter elevations, a fixed price, or run the HAKI calculator, and set your rates in Settings, then build the quote.</p> : quotes.map((q) => {
          const net = (q.quote_lines ?? []).reduce((a: number, l: any) => a + Number(l.line_total), 0);
          const gross = q.vat_registered ? net * (1 + Number(q.vat_rate) / 100) : net;
          return (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div><Link href={`/quotes/${q.id}`} className="font-medium hover:underline">{q.number}</Link> · {ukDate(q.issued_at)} · {gbp(Math.round(gross * 100) / 100)}{q.vat_registered ? " inc. VAT" : ""}</div>
              <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => download(`/quotes/${q.id}/pdf`, `${q.number}.pdf`).catch((e) => setMsg({ ok: false, text: e.message }))}>PDF</Button>
                <Button size="sm" variant="secondary" onClick={() => download(`/quotes/${q.id}/docx`, `${q.number}.docx`).catch((e) => setMsg({ ok: false, text: e.message }))}>Word</Button>
                <Button size="sm" variant="secondary" onClick={() => download(`/quotes/${q.id}/csv`, `${q.number}.csv`).catch((e) => setMsg({ ok: false, text: e.message }))}>CSV</Button></div>
            </div>); })}
        </div>
      </Card>

      {newScaffold && <NewScaffoldModal siteId={newScaffold} companyId={me?.company_id} onClose={() => setNewScaffold(null)} onSaved={() => { setNewScaffold(null); load(); }} />}
      {newSite && <NewSiteModal jobId={id} companyId={me?.company_id} onClose={() => setNewSite(false)} onSaved={() => { setNewSite(false); load(); }} />}
    </div>
  );
}

function NewSiteModal({ jobId, companyId, onClose, onSaved }: any) {
  const [f, setF] = useState({ address: "", postcode: "" });
  const save = async () => { const { error } = await supabase().from("sites").insert({ ...f, job_id: jobId, company_id: companyId }); if (error) alert(error.message); else onSaved(); };
  return <Modal open onClose={onClose} title="Add site"><div className="space-y-3"><Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field><Field label="Postcode"><Input value={f.postcode} onChange={(e) => setF({ ...f, postcode: e.target.value.toUpperCase() })} /></Field><Button onClick={save}>Save</Button></div></Modal>;
}

function NewScaffoldModal({ siteId, companyId, onClose, onSaved }: any) {
  const [f, setF] = useState<any>({ name: "", kind: "tube_fitting", pricing_mode: "squareage", fixed_price: "", first_lift_m: 2.0, lift_m: 2.0, item_no: 1, planned_start_date: "", planned_days: "", planned_crew: "" });
  useEffect(() => { (async () => { const { data } = await supabase().from("companies").select("default_first_lift_m").eq("id", companyId).single(); if (data) setF((x: any) => ({ ...x, first_lift_m: Number(data.default_first_lift_m) })); })(); }, [companyId]);
  const save = async () => {
    if (!f.name.trim()) return alert("Give the scaffold a name, e.g. Front elevation.");
    const days = wholeOrNull(f.planned_days), crew = wholeOrNull(f.planned_crew);
    if ((days !== null && (!Number.isInteger(days) || days < 1)) || (crew !== null && (!Number.isInteger(crew) || crew < 1))) return alert("Planned days and crew size must be whole numbers, 1 or more.");
    let price_items: any[] = [];
    if (f.pricing_mode === "fixed") {
      const p = Number(f.fixed_price);
      if (String(f.fixed_price).trim() === "" || isNaN(p) || p < 0) return alert("Enter the fixed price in pounds, e.g. 1250.");
      price_items = [{ id: newId(), description: "Scaffold as quoted", price: p }];
    }
    const { fixed_price, ...rest } = f;
    const row = { ...rest, price_items, site_id: siteId, company_id: companyId, planned_start_date: f.planned_start_date || null, planned_days: days, planned_crew: crew };
    const { error } = await supabase().from("scaffolds").insert(row); if (error) alert(error.message); else onSaved();
  };
  const tower = f.kind === "haki_stair_tower";
  return (
    <Modal open onClose={onClose} title="Add scaffold" wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name / work area"><Input placeholder="e.g. Front elevation" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Type"><Select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value, pricing_mode: f.pricing_mode === "fixed" ? "fixed" : e.target.value === "haki_stair_tower" ? "height" : "squareage" })}><option value="tube_fitting">Tube and fitting</option><option value="haki_stair_tower">HAKI stair tower</option></Select></Field>
        <Field label="Priced by" hint="HAKI and tube-and-fitting are priced separately">
          <Select value={f.pricing_mode} onChange={(e) => setF({ ...f, pricing_mode: e.target.value })}>
            {tower ? (<><option value="height">£ per vertical metre</option><option value="component">Components</option></>) : (<><option value="squareage">£ per m² (squareage)</option><option value="meterage">£ per metre run (meterage)</option></>)}
            <option value="fixed">Fixed price (one figure, plus any extras)</option>
          </Select></Field>
        {f.pricing_mode === "fixed" && <Field label="Fixed price (£)" hint="Extras such as a loading bay can be added on the scaffold afterwards."><Input inputMode="decimal" placeholder="e.g. 1250" value={f.fixed_price} onChange={(e) => setF({ ...f, fixed_price: e.target.value })} /></Field>}
        {!tower && <FirstLift value={f.first_lift_m} onChange={(v) => setF({ ...f, first_lift_m: v })} />}
        <Field label="Planned start (for the RAMS)"><Input type="date" value={f.planned_start_date} onChange={(e) => setF({ ...f, planned_start_date: e.target.value })} /></Field>
        <Field label="Planned days to erect"><Input inputMode="numeric" value={f.planned_days} onChange={(e) => setF({ ...f, planned_days: e.target.value })} /></Field>
        <Field label="Planned crew size" hint="Goes on the RAMS as manpower until the put-up is on the board."><Input inputMode="numeric" value={f.planned_crew} onChange={(e) => setF({ ...f, planned_crew: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save}>Save scaffold</Button></div>
    </Modal>
  );
}

function EditScaffoldModal({ s, onClose, onSaved }: any) {
  const tower = s.kind === "haki_stair_tower";
  const [f, setF] = useState<any>({ name: s.name, planned_start_date: s.planned_start_date ?? "", planned_days: s.planned_days ?? "", planned_crew: s.planned_crew ?? "", first_lift_m: Number(s.first_lift_m) });
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!String(f.name).trim()) return alert("Give the scaffold a name, e.g. Front elevation.");
    const days = wholeOrNull(f.planned_days), crew = wholeOrNull(f.planned_crew);
    if ((days !== null && (!Number.isInteger(days) || days < 1)) || (crew !== null && (!Number.isInteger(crew) || crew < 1))) return alert("Planned days and crew size must be whole numbers, 1 or more.");
    setBusy(true);
    const patch: any = { name: String(f.name).trim(), planned_start_date: f.planned_start_date || null, planned_days: days, planned_crew: crew };
    if (!tower) patch.first_lift_m = f.first_lift_m;
    const { error } = await supabase().from("scaffolds").update(patch).eq("id", s.id);
    setBusy(false);
    if (error) return alert(error.message);
    onSaved();
  };
  return (
    <Modal open onClose={onClose} title={`Edit ${s.name}`} wide>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name / work area"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        {!tower && <FirstLift value={f.first_lift_m} onChange={(v) => setF({ ...f, first_lift_m: v })} />}
        <Field label="Planned start (for the RAMS)"><Input type="date" value={f.planned_start_date} onChange={(e) => setF({ ...f, planned_start_date: e.target.value })} /></Field>
        <Field label="Planned days to erect"><Input inputMode="numeric" value={f.planned_days} onChange={(e) => setF({ ...f, planned_days: e.target.value })} /></Field>
        <Field label="Planned crew size" hint="Goes on the RAMS as manpower until the put-up is on the board."><Input inputMode="numeric" value={f.planned_crew} onChange={(e) => setF({ ...f, planned_crew: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">Saving updates a draft RAMS straight away. Parts you edited in Word are kept as you wrote them, so change these details in them by hand if they appear there. A signed RAMS never changes: start a new revision instead.</p>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
    </Modal>
  );
}

function FirstLift({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const preset = value === 2 ? "2" : value === 3 ? "3" : "custom";
  return (
    <Field label="Bottom lift" hint={value > 2 ? "Above 2 m: a bespoke design by a competent person is needed (no standard TG20 sheet covers it)." : "The only lift you can change; every lift above is 2 m."}>
      <div className="flex gap-2">
        <Select className="w-44" value={preset} onChange={(e) => onChange(e.target.value === "custom" ? 2.5 : Number(e.target.value))}><option value="2">7 ft (2.0 m)</option><option value="3">10 ft (3.0 m)</option><option value="custom">Custom</option></Select>
        {preset === "custom" && <Input inputMode="decimal" className="w-28" value={value} onChange={(e) => onChange(Number(e.target.value))} />}
      </div>
    </Field>
  );
}

function ScaffoldPanel({ s, docs, isOwner, companyId, onMsg, reload }: any) {
  const [modal, setModal] = useState<"" | "sheet" | "erect" | "inspect" | "signed" | "edit" | "signRams">("");
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<any>, ok: (r: any) => string) => { setBusy(true); try { const r = await fn(); onMsg({ ok: true, text: ok(r) }); reload(); } catch (e: any) { onMsg({ ok: false, text: e.message }); } setBusy(false); };
  const rams = docs.filter((d: any) => d.type === "rams").sort((a: any, b: any) => b.revision_no - a.revision_no)[0];
  const draft = rams && !rams.issued_at ? rams : null;
  const sheet = docs.filter((d: any) => ["tg20_21", "tg30", "bespoke_design"].includes(d.type)).sort((a: any, b: any) => (a.created_at < b.created_at ? 1 : -1))[0];
  // the latest issued RAMS went out before the drawing ref existed, so it says "To follow"
  const issuedBeforeSheet = rams?.issued_at && sheet && new Date(sheet.created_at) > new Date(rams.issued_at);
  const pendingHandover = docs.find((d: any) => d.type === "handover" && (Array.isArray(d.handovers) ? d.handovers[0] : d.handovers)?.signature_status === "pending");
  const tower = s.kind === "haki_stair_tower";
  const fixed = s.pricing_mode === "fixed";
  const sheetName = (t: string) => (t === "bespoke_design" ? "bespoke design" : t === "tg30" ? "TG30 sheet" : "TG20:21 sheet");
  const keptText = (r: any) => (r?.kept?.length ? `. Your edited ${r.kept.map((k: string) => DOC_NAMES[k].toLowerCase()).join(" and ")} kept as you wrote it.` : ".");
  const refreshDraft = (lead: string) => act(() => api(`/scaffolds/${s.id}/rams`, { method: "POST" }), (r) => `${lead} The draft RAMS has been updated${keptText(r)}`);
  const afterEdit = () => {
    setModal("");
    if (draft) return refreshDraft("Details saved.");
    onMsg({ ok: true, text: rams?.issued_at ? "Details saved. The signed RAMS still shows the old details: click New revision if the change affects it." : "Details saved." });
    reload();
  };
  const signRams = async (pin: string) => {
    const r = await api(`/scaffolds/${s.id}/rams/issue`, { method: "POST", body: JSON.stringify({ pin }) });
    onMsg({ ok: true, text: `RAMS signed by ${r.signed_by} and issued. It can no longer be changed; changes need a new revision.` });
    reload();
  };
  const uploadEdited = (kind: string, file: File) => act(async () => { const fd = new FormData(); fd.append("kind", kind); fd.append("file", file); return api(`/scaffolds/${s.id}/rams/edited`, { method: "POST", body: fd }); },
    (r) => `Edited ${DOC_NAMES[kind].toLowerCase()} saved for this scaffold.` + (r.missing.length ? ` Still to fill before signing: ${r.missing.join(", ")}.` : " Ready to sign."));
  const discardEdit = (kind: string) => { if (!confirm(`Put the ${DOC_NAMES[kind].toLowerCase()} back to the standard wording? Your edits to it will be lost.`)) return; act(() => api(`/scaffolds/${s.id}/rams/discard-edit`, { method: "POST", body: JSON.stringify({ kind }) }), () => `${DOC_NAMES[kind]} put back to the standard wording, filled in fresh.`); };
  return (
    <div className="rounded-lg border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-slate-50 px-3 py-2">
        <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{s.name}</span><Badge tone={STATUS_TONE[s.status]}>{s.status.replace("_", " ")}</Badge><Badge tone={tower ? "violet" : "slate"}>{tower ? "HAKI tower" : "Tube & fitting"}</Badge>{fixed && <Badge tone="amber">Fixed price</Badge>}{pendingHandover && <Badge tone="red">Handover unsigned</Badge>}</div>
        <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500"><span>{tower ? "" : `Bottom lift ${s.first_lift_m} m (${ftIn(Number(s.first_lift_m) * 1000)})`}{s.planned_start_date ? ` · planned ${ukDate(s.planned_start_date)}` : " · no planned start"}{s.planned_crew ? ` · crew ${s.planned_crew}` : ""}</span><Button size="sm" variant="secondary" onClick={() => setModal("edit")}>Edit details</Button></div>
      </div>
      <div className="grid gap-4 p-3 lg:grid-cols-2">
        <div className="space-y-4">{fixed && <FixedPrice s={s} onMsg={onMsg} reload={reload} />}{tower ? <HakiPanel s={s} onMsg={onMsg} reload={reload} /> : <Elevations s={s} companyId={companyId} reload={reload} />}</div>
        <div className="space-y-3">
          <div className="text-sm font-semibold">Compliance</div>
          <ol className="space-y-2 text-sm">
            <Step done={!!sheet} label={sheet ? `Drawing ref ${sheet.reference ?? ""} (${sheetName(sheet.type)})` : "Drawing ref (compliance sheet or bespoke design)"} action={!sheet && <Button size="sm" variant="secondary" onClick={() => setModal("sheet")}>Record</Button>} />
            {!sheet && <li className="ml-6 text-xs text-slate-500">Not recorded yet: the RAMS says "To follow", and the scaffold can't be scheduled or erected until it is recorded.</li>}
            <Step done={!!rams} label={rams ? `RAMS pack revision ${rams.revision_no}${rams.issued_at ? `, signed and issued ${ukDate(rams.issued_at)}` : " (draft)"}` : "RAMS pack"} action={
              <div className="flex gap-1"><Button size="sm" variant="secondary" disabled={busy} onClick={() => act(() => api(`/scaffolds/${s.id}/rams`, { method: "POST" }), (r) => `RAMS revision ${r.revision} ${draft ? "updated" : "generated"}${keptText(r)}` + (r.missing.length ? ` Fill before signing: ${r.missing.join(", ")}.` : " Ready to sign."))}>{rams ? (rams.issued_at ? "New revision" : "Regenerate") : "Generate"}</Button>
                {draft && <Button size="sm" disabled={busy || draft.missing_fields?.length > 0} onClick={() => setModal("signRams")}>Sign and issue</Button>}</div>} />
            {issuedBeforeSheet && <li className="ml-6 text-xs text-amber-700">This RAMS was signed before the drawing ref was recorded, so it says "To follow". Click New revision to sign one that cites {sheet.reference}.</li>}
            {draft?.missing_fields?.length > 0 && <li className="ml-6 text-xs text-amber-700">Empty before signing: {draft.missing_fields.join(", ")}. Most come from Edit details (planned start, crew) and the job details above.</li>}
            {draft && <li className="ml-6 text-xs text-slate-500">Site-specific methods: download the Word file below, edit it, then Upload edited. Regenerate keeps any part you edited.</li>}
            <Step done={["on_hire", "dismantle_requested", "dismantling", "dismantled"].includes(s.status)} label={s.erected_at ? `Erected ${ukDate(s.erected_at)}` : "Confirm erected"} action={!s.erected_at && <Button size="sm" onClick={() => setModal("erect")}>Confirm erected</Button>} />
            {pendingHandover && <li className="ml-6 flex flex-wrap items-center gap-2 text-xs text-red-700">Handover {pendingHandover.reference} is not signed by the client.{isOwner && <Button size="sm" variant="secondary" onClick={() => setModal("signed")}>Record client confirmation</Button>}</li>}
            {s.erected_at && <Step done={false} label="Inspection report" action={<Button size="sm" variant="secondary" onClick={() => setModal("inspect")}>New inspection</Button>} />}
          </ol>
          {busy && <p className="text-xs text-slate-500">Working… making the Word and PDF files can take up to half a minute.</p>}
          <DocList docs={docs} busy={busy} onUpload={uploadEdited} onDiscard={discardEdit} />
        </div>
      </div>
      {modal === "sheet" && <SheetModal scaffoldId={s.id} open onClose={() => setModal("")} onDone={(m) => { if (m.ok && draft) refreshDraft(m.text); else { onMsg(m); reload(); } }} />}
      {modal === "erect" && <ConfirmErectedModal scaffoldId={s.id} open onClose={() => setModal("")} onDone={(m) => { onMsg(m); reload(); }} />}
      {modal === "inspect" && <InspectionModal scaffoldId={s.id} open onClose={() => setModal("")} onDone={(m) => { onMsg(m); reload(); }} />}
      {modal === "signed" && pendingHandover && <SignedModal docId={pendingHandover.id} onClose={() => setModal("")} onDone={(m: any) => { onMsg(m); reload(); }} />}
      {modal === "edit" && <EditScaffoldModal s={s} onClose={() => setModal("")} onSaved={afterEdit} />}
      {modal === "signRams" && draft && <SignModal title="Sign and issue the RAMS" what={`You are signing ${draft.reference ?? "the RAMS"}, revision ${draft.revision_no}, for ${s.name}: the method statement and the risk assessment. Once signed it is issued and can't be changed; any change needs a new revision.`} onSign={signRams} onClose={() => setModal("")} />}
    </div>
  );
}

function Step({ done, label, action }: { done: boolean; label: string; action?: React.ReactNode }) {
  return <li className="flex flex-wrap items-center justify-between gap-2"><span className="flex items-center gap-2"><span className={cn("flex h-5 w-5 items-center justify-center rounded-full text-[11px] text-white", done ? "bg-green-600" : "bg-slate-300")}>{done ? "✓" : ""}</span>{label}</span>{action}</li>;
}

function DocList({ docs, busy, onUpload, onDiscard }: { docs: any[]; busy?: boolean; onUpload?: (kind: string, f: File) => void; onDiscard?: (kind: string) => void }) {
  const files = docs.flatMap((d: any) => Object.entries(d.files ?? {}).map(([k, v]: any) => ({ d, k, v })));
  if (!files.length) return null;
  return (
    <div className="rounded-md border"><div className="border-b px-3 py-1.5 text-xs font-semibold text-slate-600">Documents</div>
      {files.map(({ d, k, v }, i) => {
        const editable = d.type === "rams" && !d.issued_at && RAMS_PARTS.includes(k);
        return (
          <div key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs">
            <span className="flex flex-wrap items-center gap-1">{DOC_NAMES[k] ?? k} · {d.reference ?? ""}{d.type === "rams" ? ` r${d.revision_no}` : ""}{d.issued_at ? " · issued" : " · draft"}{v.edited_by && <Badge tone="amber">edited by {v.edited_by}, {ukDate(v.edited_at)}</Badge>}{v.signed_by && <Badge tone="green">signed by {v.signed_by}</Badge>}</span>
            <span className="flex flex-wrap gap-1">{v.pdf && <Button size="sm" variant="ghost" onClick={() => download(`/files?path=${encodeURIComponent(v.pdf)}`, v.pdf.split("/").pop())}>PDF</Button>}<Button size="sm" variant="ghost" onClick={() => download(`/files?path=${encodeURIComponent(v.docx)}`, v.docx.split("/").pop())}>Word</Button>
              {editable && onUpload && <label className={cn("inline-flex min-h-8 cursor-pointer items-center rounded-md px-3 text-xs font-medium text-slate-700 hover:bg-slate-100", busy && "pointer-events-none opacity-50")}>Upload edited<input type="file" accept=".docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) onUpload(k, f); }} /></label>}
              {editable && v.edited_by && onDiscard && <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDiscard(k)}>Discard edit</Button>}</span>
          </div>);
      })}
    </div>
  );
}

function SignedModal({ docId, onClose, onDone }: any) {
  const [f, setF] = useState({ name: "", role: "", company: "", evidence_note: "", channel: "email" });
  const go = async () => { try { await api(`/handovers/${docId}/mark-signed`, { method: "POST", body: JSON.stringify(f) }); onDone({ ok: true, text: "Handover resolved. The certificate shows it was confirmed by message and recorded by you, not signed." }); onClose(); } catch (e: any) { onDone({ ok: false, text: e.message }); } };
  return (
    <Modal open onClose={onClose} title="Record the client's confirmation">
      <p className="mb-3 text-sm text-slate-600">Owner only. Use this when the client's named person confirmed by email or text. The certificate will say it was recorded by you, so it never looks like a signature.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Their name"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Their role"><Input value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })} /></Field>
        <Field label="Their company"><Input value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} /></Field>
        <Field label="How they confirmed"><Select value={f.channel} onChange={(e) => setF({ ...f, channel: e.target.value })}><option value="email">Email</option><option value="sms">Text message</option></Select></Field>
        <Field label="Evidence *" className="sm:col-span-2" hint="e.g. Email from J Bloggs, 3 Nov 2026, 16:40, 'all good, accepted'"><Input value={f.evidence_note} onChange={(e) => setF({ ...f, evidence_note: e.target.value })} /></Field>
      </div>
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={go}>Record</Button></div>
    </Modal>
  );
}

function FixedPrice({ s, onMsg, reload }: any) {
  const items: any[] = Array.isArray(s.price_items) ? s.price_items : [];
  const save = async (next: any[]) => { const { error } = await supabase().from("scaffolds").update({ price_items: next }).eq("id", s.id); if (error) onMsg({ ok: false, text: error.message }); else reload(); };
  const setItem = (i: number, patch: any) => save(items.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const setPrice = (i: number, v: string) => {
    if (v.trim() === "") return setItem(i, { price: "" });
    const p = Number(v);
    if (isNaN(p) || p < 0) return onMsg({ ok: false, text: "Enter a price in pounds, e.g. 250." });
    return setItem(i, { price: p });
  };
  const total = items.reduce((a, it) => a + (Number(it.price) || 0), 0);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between"><span className="text-sm font-semibold">Fixed price</span><Button size="sm" variant="secondary" onClick={() => save([...items, { id: newId(), description: "", price: "" }])}>Add extra</Button></div>
      {items.length === 0 && <p className="text-xs text-amber-700">No price yet. Add one before building the quote.</p>}
      {items.map((it, i) => (
        <div key={it.id ?? i} className="flex gap-2">
          <Input className="min-h-8 flex-1" placeholder={i === 0 ? "e.g. Scaffold as quoted" : "e.g. Loading bay"} defaultValue={it.description ?? ""} onBlur={(e) => setItem(i, { description: e.target.value })} />
          <Input className="min-h-8 w-28" inputMode="decimal" placeholder="£" defaultValue={it.price ?? ""} onBlur={(e) => setPrice(i, e.target.value)} />
          <Button size="sm" variant="ghost" onClick={() => save(items.filter((_, j) => j !== i))}>✕</Button>
        </div>))}
      {items.length > 0 && <div className="text-right text-sm">Fixed total <b>{gbp(total)}</b></div>}
      <p className="text-xs text-slate-500">Each line goes on the quote as its own item. Measurements are optional on a fixed price: they still feed pay and the lift layout, never the price.</p>
    </div>
  );
}

function Elevations({ s, companyId, reload }: any) {
  const [rows, setRows] = useState<any[]>(s.job_elevations ?? []);
  useEffect(() => setRows(s.job_elevations ?? []), [s.job_elevations]);
  const add = async () => { await supabase().from("job_elevations").insert({ scaffold_id: s.id, company_id: companyId, label: String.fromCharCode(65 + rows.length) }); reload(); };
  const upd = async (id: string, patch: any) => { await supabase().from("job_elevations").update(patch).eq("id", id); reload(); };
  const del = async (id: string) => { await supabase().from("job_elevations").delete().eq("id", id); reload(); };
  const total = rows.reduce((a, r) => a + Number(r.quoted_area_m2 ?? 0), 0);
  const height = Math.max(0, ...rows.map((r) => Number(r.quoted_height_m ?? 0)));
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between"><span className="text-sm font-semibold">Elevations</span><Button size="sm" variant="secondary" onClick={add}>Add elevation</Button></div>
      {rows.length === 0 ? <p className="text-xs text-slate-500">Enter each elevation's length and height once. Wages and hire reuse them.</p> : (
        <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th>Elev.</th><th>Length m</th><th>Height m</th><th>Area m²</th><th title="As-built changes pay, never the quote">As-built L × H</th><th /></tr></thead>
          <tbody>{rows.map((r) => (
            <tr key={r.id} className="border-t">
              <td><Input className="min-h-8 w-14" defaultValue={r.label ?? ""} onBlur={(e) => upd(r.id, { label: e.target.value })} /></td>
              <td><Input className="min-h-8 w-20" inputMode="decimal" defaultValue={r.quoted_length_m ?? ""} onBlur={(e) => upd(r.id, { quoted_length_m: e.target.value || null })} /></td>
              <td><Input className="min-h-8 w-20" inputMode="decimal" defaultValue={r.quoted_height_m ?? ""} onBlur={(e) => upd(r.id, { quoted_height_m: e.target.value || null })} /></td>
              <td className="px-1 font-medium">{r.quoted_area_m2 ?? "—"}</td>
              <td className="whitespace-nowrap"><Input className="inline min-h-8 w-16" inputMode="decimal" defaultValue={r.asbuilt_length_m ?? ""} onBlur={(e) => upd(r.id, { asbuilt_length_m: e.target.value || null })} /> × <Input className="inline min-h-8 w-16" inputMode="decimal" defaultValue={r.asbuilt_height_m ?? ""} onBlur={(e) => upd(r.id, { asbuilt_height_m: e.target.value || null })} /></td>
              <td><Button size="sm" variant="ghost" onClick={() => del(r.id)}>✕</Button></td>
            </tr>))}</tbody></table>
          <div className="mt-1 text-right text-sm">Quoted area <b>{total.toFixed(2)} m²</b></div></div>)}
      {height > 0 && <LiftLayout s={s} height={height} />}
    </div>
  );
}

function LiftLayout({ s, height }: { s: any; height: number }) {
  const [opts, setOpts] = useState<any[]>([]); const [err, setErr] = useState("");
  useEffect(() => { api("/lifts/layout", { method: "POST", body: JSON.stringify({ height_m: height, first_lift_m: Number(s.first_lift_m), lift_m: Number(s.lift_m) }) }).then(setOpts).catch((e) => setErr(e.message)); }, [height, s.first_lift_m, s.lift_m]);
  if (err) return <p className="text-xs text-red-700">{err}</p>;
  return (
    <div className="rounded-md bg-slate-50 p-2 text-xs">
      <div className="mb-1 font-semibold">Lift layout for {height} m</div>
      {opts.map((o) => (
        <div key={o.kind} className="py-0.5"><b className="capitalize">{o.kind}</b>: lifts at {o.levels_m.join(", ")} m ({o.diff_mm >= 0 ? "+" : ""}{o.diff_mm} mm){o.kind === "level" && o.first_lift_m !== Number(s.first_lift_m) ? `, bottom lift ${o.first_lift_m} m` : ""}
          {o.step_warning && <span className="block text-amber-700">{o.step_warning}</span>}{o.bespoke_design && <span className="block text-red-700">Bottom lift above 2 m: needs a bespoke design.</span>}</div>))}
    </div>
  );
}

function HakiPanel({ s, onMsg, reload }: any) {
  const [f, setF] = useState({ target_m: Number(s.target_height_m ?? 6), lift_m: 2, orientation: "width_against", per_metre: "" });
  const [r, setR] = useState<any>(null);
  const run = async () => { try { setR(await api("/haki/calculate", { method: "POST", body: JSON.stringify({ ...f, pricing_mode: s.pricing_mode, per_metre: f.per_metre ? Number(f.per_metre) : null }) })); } catch (e: any) { onMsg({ ok: false, text: e.message }); } };
  const save = async () => { try { await api(`/scaffolds/${s.id}/haki`, { method: "POST", body: JSON.stringify({ ...f, pricing_mode: s.pricing_mode }) }); onMsg({ ok: true, text: "Tower saved to this scaffold. Build the quote to price it." }); reload(); } catch (e: any) { onMsg({ ok: false, text: e.message }); } };
  return (
    <div className="space-y-2">
      <div className="text-sm font-semibold">HAKI stair tower</div>
      <div className="grid grid-cols-2 gap-2">
        <Field label="Target height (m)"><Input inputMode="decimal" value={f.target_m} onChange={(e) => setF({ ...f, target_m: Number(e.target.value) })} /></Field>
        <Field label="Lift height"><Select value={f.lift_m} onChange={(e) => setF({ ...f, lift_m: Number(e.target.value) })}><option value={1}>1 m</option><option value={1.5}>1.5 m</option><option value={2}>2 m</option></Select></Field>
        <Field label="Against the scaffold"><Select value={f.orientation} onChange={(e) => setF({ ...f, orientation: e.target.value })}><option value="width_against">Width (1655 mm)</option><option value="length_against">Length (3050 mm)</option></Select></Field>
      </div>
      <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={run}>Calculate</Button><Button size="sm" onClick={save}>Save to scaffold</Button></div>
      {r && <HakiResult r={r} />}
    </div>
  );
}
