"use client";
/* Forms shared by the dashboard and the job page: record the drawing ref, confirm erected, inspection.
   A failed save shows its reason inside the form, so it is never hidden behind it. */
import { useState } from "react";
import { api } from "@/lib/api";
import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";

type Done = (msg: { ok: boolean; text: string }) => void;

function FormError({ text }: { text: string }) {
  if (!text) return null;
  return <p role="alert" className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{text}</p>;
}

const SHEET_NUMBERS: Record<string, string> = { max_lift_height_m: "Max lift height (m)", max_height_m: "Max height (m)", max_leg_load_kn: "Max leg load (kN)" };

export function SheetModal({ scaffoldId, open, onClose, onDone }: { scaffoldId: string; open: boolean; onClose: () => void; onDone: Done }) {
  const [f, setF] = useState<Record<string, string>>({ type: "tg20_21" });
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const bespoke = f.type === "bespoke_design";
  const save = async () => {
    setErr("");
    const body: Record<string, any> = { ...f };
    if (bespoke) {
      if (!f.drawing_ref?.trim() || !f.designer_name?.trim()) return setErr("Enter the drawing ref and the designer's name.");
    } else {
      if (!f.sheet_reference?.trim()) return setErr("Enter the drawing ref: the sheet number on the NASC eGuide sheet.");
      for (const [k, label] of Object.entries(SHEET_NUMBERS)) {
        const v = (f[k] ?? "").trim();
        if (v === "") { delete body[k]; continue; }
        const n = Number(v);
        if (!isFinite(n) || n <= 0) return setErr(`${label}: enter a number only, e.g. 2 (not "${v}").`);
        body[k] = n;
      }
    }
    setBusy(true);
    try { await api(`/scaffolds/${scaffoldId}/sheet`, { method: "POST", body: JSON.stringify(body) }); onDone({ ok: true, text: bespoke ? "Bespoke design recorded." : "Drawing ref recorded." }); onClose(); }
    catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Record the drawing ref" wide>
      <p className="mb-4 text-sm text-slate-600">Record the sheet you produced in NASC's eGuide, or the competent person's design. Putlog never generates TG20 or TG30 sheets. Until this is recorded the RAMS says the drawing ref is "To follow", and the scaffold can't be scheduled or erected.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Type"><Select value={f.type} onChange={set("type")}><option value="tg20_21">NASC TG20:21 sheet</option><option value="tg30">NASC TG30 sheet</option><option value="bespoke_design">Bespoke design</option></Select></Field>
        {bespoke ? (<>
          <Field label="Drawing ref *" hint="The number on the designer's drawing"><Input onChange={set("drawing_ref")} /></Field>
          <Field label="Designer name *"><Input onChange={set("designer_name")} /></Field>
          <Field label="Designer position"><Input onChange={set("designer_position")} /></Field>
          <Field label="Designer company"><Input onChange={set("designer_company")} /></Field>
          <Field label="Date designed"><Input type="date" onChange={set("designed_at")} /></Field>
          <Field label="What the design covers" className="sm:col-span-2"><Textarea onChange={set("covers")} /></Field>
        </>) : (<>
          <Field label="Drawing ref *" hint="The sheet number on the NASC eGuide sheet"><Input onChange={set("sheet_reference")} /></Field>
          <Field label="Scaffold type"><Input placeholder="e.g. Tied independent tube and fitting" onChange={set("scaffold_type")} /></Field>
          <Field label="Max lift height (m)" hint="Number only, e.g. 2"><Input inputMode="decimal" onChange={set("max_lift_height_m")} /></Field>
          <Field label="Max height (m)" hint="Number only, e.g. 10"><Input inputMode="decimal" onChange={set("max_height_m")} /></Field>
          <Field label="Load class"><Input placeholder="e.g. Class 2 (1.5 kN/m²)" onChange={set("load_class")} /></Field>
          <Field label="Max leg load (kN)" hint="Number only, e.g. 12.5"><Input inputMode="decimal" onChange={set("max_leg_load_kn")} /></Field>
          <Field label="Add-ons permitted"><Input placeholder="e.g. Loading bay, hop-up brackets" onChange={set("add_ons_permitted")} /></Field>
          <Field label="Restrictions" className="sm:col-span-2"><Textarea onChange={set("restrictions_text")} /></Field>
        </>)}
      </div>
      <FormError text={err} />
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save"}</Button></div>
    </Modal>
  );
}

export function ConfirmErectedModal({ scaffoldId, open, onClose, onDone }: { scaffoldId: string; open: boolean; onClose: () => void; onDone: Done }) {
  const [f, setF] = useState<Record<string, string>>({ inspecting_party: "us", permitted_use: "Access and light duty work", max_loaded_platforms: "1 fully loaded + 1 at 50%" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value });
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api(`/scaffolds/${scaffoldId}/confirm-erected`, { method: "POST", body: JSON.stringify(f) });
      onDone({ ok: true, text: `Scaffold on hire. Handover certificate ${r.certificate_ref} created, unsigned.` + (r.missing.length ? ` Still empty: ${r.missing.join(", ")}.` : "") });
      onClose();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Confirm erected" wide>
      <p className="mb-4 text-sm text-slate-600">This puts the scaffold on hire and creates the handover certificate. It shows <b className="text-red-700">NOT AUTHORISED FOR USE UNTIL SIGNED</b> until the client confirms. Blank fields fill from the compliance sheet.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Permitted use"><Input value={f.permitted_use} onChange={set("permitted_use")} /></Field>
        <Field label="Max loaded platforms"><Input value={f.max_loaded_platforms} onChange={set("max_loaded_platforms")} /></Field>
        <Field label="Loading class" hint="Leave blank to use the sheet's"><Input onChange={set("loading_class")} /></Field>
        <Field label="Restrictions" hint="Leave blank to use the sheet's"><Input onChange={set("restrictions")} /></Field>
        <Field label="Who inspects after handover"><Select value={f.inspecting_party} onChange={set("inspecting_party")}><option value="us">Us (the scaffold contractor)</option><option value="customer">The customer</option><option value="third_party">A third party</option></Select></Field>
        <Field label="Name of the person responsible for inspections"><Input onChange={set("inspection_responsible_name")} /></Field>
        <Field label="Their phone"><Input inputMode="tel" onChange={set("inspection_responsible_phone")} /></Field>
        <Field label="Next inspection due" hint="Defaults to 7 days from today"><Input type="date" onChange={set("next_inspection_due")} /></Field>
      </div>
      <FormError text={err} />
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Working…" : "Confirm erected"}</Button></div>
    </Modal>
  );
}

const CHECKLIST = ["Foundations and base plates", "Standards", "Ledgers and transoms", "Bracing", "Ties", "Working platforms and boards",
  "Edge protection (guardrails and toeboards)", "Access and egress", "Loading within the permitted class", "Fittings and couplers",
  "Protection (netting, sheeting, fans)", "Public and site protection", "Alterations since the last inspection", "Services (overhead lines, etc.)", "Scaffold tag"];

export function InspectionModal({ scaffoldId, open, onClose, onDone }: { scaffoldId: string; open: boolean; onClose: () => void; onDone: Done }) {
  const now = new Date(); const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const week = new Date(now.getTime() + 7 * 864e5).toISOString().slice(0, 10);
  const [f, setF] = useState<any>({ inspection_type: "7-day", inspected_at: local, next_inspection_due: week, tag_updated: true, outcome: "Safe to use", weather: "", copies_sent_to: "Office" });
  const [items, setItems] = useState(CHECKLIST.map((item) => ({ item, result: "", comment: "" })));
  const [defects, setDefects] = useState<any[]>([]);
  const [busy, setBusy] = useState(false); const [err, setErr] = useState("");
  const go = async () => {
    setBusy(true); setErr("");
    try {
      const r = await api(`/scaffolds/${scaffoldId}/inspections`, { method: "POST", body: JSON.stringify({ ...f, checklist: items, defects }) });
      onDone({ ok: true, text: `Inspection report ${r.report_ref} created.` + (r.missing.length ? ` Not ready to issue: ${r.missing.join("; ")}.` : "") });
      onClose();
    } catch (e: any) { setErr(e.message); setBusy(false); }
  };
  return (
    <Modal open={open} onClose={onClose} title="Inspection report" wide>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Type"><Select value={f.inspection_type} onChange={(e) => setF({ ...f, inspection_type: e.target.value })}><option>7-day</option><option>After adverse weather</option><option>After alteration</option><option>Before first use</option></Select></Field>
        <Field label="Date and time"><Input type="datetime-local" value={f.inspected_at} onChange={(e) => setF({ ...f, inspected_at: e.target.value })} /></Field>
        <Field label="Weather"><Input value={f.weather} onChange={(e) => setF({ ...f, weather: e.target.value })} /></Field>
      </div>
      <div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-xs text-slate-500"><th className="py-1">Item</th><th>Result</th><th>Comment</th></tr></thead><tbody>
        {items.map((it, i) => (
          <tr key={it.item} className="border-t">
            <td className="py-1.5 pr-2">{it.item}</td>
            <td className="whitespace-nowrap pr-2">{["yes", "no", "n/a"].map((r) => (
              <button key={r} onClick={() => setItems(items.map((x, j) => (j === i ? { ...x, result: r } : x)))} className={`mr-1 min-h-9 rounded border px-2 text-xs ${it.result === r ? (r === "no" ? "border-red-600 bg-red-600 text-white" : "border-brand bg-brand text-white") : "border-slate-300"}`}>{r.toUpperCase()}</button>
            ))}</td>
            <td><Input className="min-h-9" value={it.comment} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, comment: e.target.value } : x)))} /></td>
          </tr>
        ))}
      </tbody></table></div>
      <div className="mt-4">
        <div className="mb-2 flex items-center justify-between"><span className="text-sm font-medium">Matters that could give rise to a risk</span><Button size="sm" variant="secondary" onClick={() => setDefects([...defects, { matter: "", action_taken: "", further_action: "", responsible: "", due_date: "" }])}>Add matter</Button></div>
        {defects.length === 0 && <p className="text-xs text-slate-500">None. The report will say no matter was identified.</p>}
        {defects.map((d, i) => (
          <div key={i} className="mb-2 grid gap-2 rounded border p-2 sm:grid-cols-5">
            {(["matter", "action_taken", "further_action", "responsible"] as const).map((k) => <Input key={k} placeholder={k.replace("_", " ")} value={d[k]} onChange={(e) => setDefects(defects.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} />)}
            <Input type="date" value={d.due_date} onChange={(e) => setDefects(defects.map((x, j) => (j === i ? { ...x, due_date: e.target.value } : x)))} />
          </div>
        ))}
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        <Field label="Outcome"><Select value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value })}><option>Safe to use</option><option>Safe to use with restrictions</option><option>Not safe to use</option></Select></Field>
        <Field label="Next inspection due"><Input type="date" value={f.next_inspection_due} onChange={(e) => setF({ ...f, next_inspection_due: e.target.value })} /></Field>
        <Field label="Copies sent to"><Input value={f.copies_sent_to} onChange={(e) => setF({ ...f, copies_sent_to: e.target.value })} /></Field>
      </div>
      <p className="mt-3 text-xs text-slate-500">The checklist prompts the inspection; it does not replace the inspector's judgement. Signing with re-authentication comes in a later update.</p>
      <FormError text={err} />
      <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={onClose}>Cancel</Button><Button onClick={go} disabled={busy}>{busy ? "Working…" : "Create report"}</Button></div>
    </Modal>
  );
}
