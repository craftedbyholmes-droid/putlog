"use client";
import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, PageTitle, Select } from "@/components/ui";
import { ukDate } from "@/lib/utils";

type Msg = { ok: boolean; text: string } | null;

export default function Settings() {
  const [c, setC] = useState<any>(null); const [role, setRole] = useState(""); const [rates, setRates] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]); const [vans, setVans] = useState<any[]>([]); const [msg, setMsg] = useState<Msg>(null);
  const load = async () => {
    const sb = supabase(); const { data: u } = await sb.auth.getUser();
    const { data: me } = await sb.from("profiles").select("role, company_id, companies(*)").eq("id", u.user!.id).single();
    setRole(me?.role ?? ""); setC(me?.companies);
    const [{ data: r }, { data: s }, { data: v }] = await Promise.all([sb.from("rate_cards").select("*"), sb.from("staff").select("*").order("name"), sb.from("vans").select("*").order("registration")]);
    setRates(r ?? []); setStaff(s ?? []); setVans(v ?? []);
  };
  useEffect(() => { load(); }, []);
  if (!c) return <p className="text-sm text-slate-500">Loading…</p>;
  const owner = role === "owner";
  const saveFirm = async () => {
    if (c.vat_registered && !c.vat_number) return setMsg({ ok: false, text: "Enter the VAT number, or switch VAT registered off." });
    const { id, counters, created_at, logo_path, ...patch } = c;
    const { error } = await supabase().from("companies").update(patch).eq("id", id);
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Firm details saved." });
  };
  const logo = async (f: File) => { const fd = new FormData(); fd.append("file", f); try { await api("/company/logo", { method: "POST", body: fd }); setMsg({ ok: true, text: "Logo saved. It goes top right on every document, padded so it never stretches." }); load(); } catch (e: any) { setMsg({ ok: false, text: e.message }); } };
  const rate = (unit: string, kind: string) => rates.find((r) => r.unit === unit && r.scaffold_kind === kind)?.price ?? "";
  const setRate = async (unit: string, kind: string, price: string) => {
    if (price === "") return;
    const { error } = await supabase().from("rate_cards").upsert({ company_id: c.id, unit, scaffold_kind: kind, price }, { onConflict: "company_id,unit,scaffold_kind" });
    setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Rate saved." }); load();
  };
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setC({ ...c, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  return (
    <div className="space-y-4">
      <PageTitle title="Settings" sub={owner ? "" : "Only the owner can change firm details and the logo."} />
      <div className="fixed inset-x-4 bottom-4 z-40 shadow-lg sm:left-auto sm:w-[28rem]"><Notice msg={msg} onClose={() => setMsg(null)} /></div>
      <Card><CardHeader title="Firm" action={owner && <Button size="sm" onClick={saveFirm}>Save</Button>} />
        <fieldset disabled={!owner} className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
          <Field label="Firm name"><Input value={c.name ?? ""} onChange={set("name")} /></Field>
          <Field label="Address"><Input value={c.address ?? ""} onChange={set("address")} /></Field>
          <Field label="Phone"><Input value={c.phone ?? ""} onChange={set("phone")} /></Field>
          <Field label="Email"><Input value={c.email ?? ""} onChange={set("email")} /></Field>
          <Field label="VAT registered" hint="Off: no document shows VAT. On: 20% as a placeholder until your accountant confirms each job's treatment."><label className="flex min-h-10 items-center gap-2 text-sm"><input type="checkbox" checked={!!c.vat_registered} onChange={set("vat_registered")} className="h-5 w-5" />Registered</label></Field>
          <Field label="VAT number"><Input value={c.vat_number ?? ""} onChange={set("vat_number")} disabled={!c.vat_registered} /></Field>
          <Field label="Default bottom lift"><Select value={String(Number(c.default_first_lift_m))} onChange={set("default_first_lift_m")}><option value="2">7 ft (2.0 m)</option><option value="3">10 ft (3.0 m)</option></Select></Field>
          <Field label="Working days / hours (A)"><div className="flex gap-2"><Input value={c.working_days_a ?? ""} onChange={set("working_days_a")} /><Input value={c.working_hours_a ?? ""} onChange={set("working_hours_a")} /></div></Field>
          <Field label="Working days / hours (B)"><div className="flex gap-2"><Input value={c.working_days_b ?? ""} onChange={set("working_days_b")} /><Input value={c.working_hours_b ?? ""} onChange={set("working_hours_b")} /></div></Field>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 border-t p-4 text-sm"><span className="font-medium">Logo</span>{c.logo_path ? <Badge tone="green">Uploaded</Badge> : <Badge tone="red">Missing: documents can't be issued without it</Badge>}{owner && <input type="file" accept="image/*" onChange={(e) => e.target.files?.[0] && logo(e.target.files[0])} className="text-sm" />}</div>
      </Card>
      <MySignature onMsg={setMsg} />
      {owner && <SigningPeople companyId={c.id} onMsg={setMsg} />}
      <Card><CardHeader title="Rates (used to build quotes)" />
        <div className="grid gap-3 p-4 sm:grid-cols-3">
          {[["squareage", "tube_fitting", "Tube & fitting, £ per m²"], ["meterage", "tube_fitting", "Tube & fitting, £ per metre run"], ["height", "haki_stair_tower", "HAKI tower, £ per vertical metre"]].map(([u, k, l]) => (
            <Field key={u + k} label={l}><Input inputMode="decimal" defaultValue={rate(u, k)} onBlur={(e) => setRate(u, k, e.target.value)} /></Field>))}
        </div>
      </Card>
      <Card><CardHeader title="Staff and subbies" action={<Button size="sm" variant="secondary" onClick={async () => { const name = prompt("Name"); if (!name) return; const sub = confirm("Subcontractor? OK = subcontractor, Cancel = employee"); await supabase().from("staff").insert({ company_id: c.id, name, worker_type: sub ? "subcontractor" : "employee", cis_status: sub ? "registered" : null }); load(); }}>Add</Button>} />
        <div className="divide-y">{staff.map((s) => (
          <div key={s.id} className="grid items-center gap-2 p-3 text-sm sm:grid-cols-5">
            <span className="font-medium">{s.name} {s.worker_type === "subcontractor" && <Badge>Subbie</Badge>}</span>
            <Input placeholder="Phone" defaultValue={s.phone ?? ""} onBlur={(e) => supabase().from("staff").update({ phone: e.target.value }).eq("id", s.id)} />
            <Input placeholder="Day rate £" inputMode="decimal" defaultValue={s.day_rate ?? ""} onBlur={(e) => supabase().from("staff").update({ day_rate: e.target.value || null }).eq("id", s.id)} />
            <Input type="date" title="CISRS card expiry" defaultValue={s.cisrs_card_expiry ?? ""} onBlur={(e) => supabase().from("staff").update({ cisrs_card_expiry: e.target.value || null }).eq("id", s.id)} />
            <span className="text-xs text-slate-500">CISRS {ukDate(s.cisrs_card_expiry)}</span>
          </div>))}</div>
      </Card>
      <Card><CardHeader title="Vans" action={<Button size="sm" variant="secondary" onClick={async () => { const reg = prompt("Registration"); if (!reg) return; await supabase().from("vans").insert({ company_id: c.id, registration: reg.toUpperCase() }); load(); }}>Add</Button>} />
        <div className="flex flex-wrap gap-2 p-4">{vans.map((v) => <Badge key={v.id}>{v.registration}</Badge>)}</div>
      </Card>
    </div>
  );
}

function SignaturePad({ busy, onSave }: { busy: boolean; onSave: (b: Blob) => void }) {
  const ref = useRef<HTMLCanvasElement>(null); const drawing = useRef(false); const [empty, setEmpty] = useState(true);
  useEffect(() => {
    const cv = ref.current!; const r = window.devicePixelRatio || 1;
    cv.width = cv.offsetWidth * r; cv.height = cv.offsetHeight * r;
    const g = cv.getContext("2d")!; g.scale(r, r); g.lineWidth = 2.5; g.lineCap = "round"; g.lineJoin = "round"; g.strokeStyle = "#111";
  }, []);
  const at = (e: React.PointerEvent) => { const b = ref.current!.getBoundingClientRect(); return [e.clientX - b.left, e.clientY - b.top] as const; };
  const down = (e: React.PointerEvent<HTMLCanvasElement>) => { e.currentTarget.setPointerCapture(e.pointerId); drawing.current = true; const [x, y] = at(e); const g = ref.current!.getContext("2d")!; g.beginPath(); g.moveTo(x, y); };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => { if (!drawing.current) return; const [x, y] = at(e); const g = ref.current!.getContext("2d")!; g.lineTo(x, y); g.stroke(); setEmpty(false); };
  const up = () => { drawing.current = false; };
  const clear = () => { const cv = ref.current!; cv.getContext("2d")!.clearRect(0, 0, cv.width, cv.height); setEmpty(true); };
  const save = () => ref.current!.toBlob((b) => b && onSave(b), "image/png");
  return (
    <div className="space-y-2">
      <canvas ref={ref} className="h-40 w-full touch-none rounded-md border border-slate-300 bg-white" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerLeave={up} />
      <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={clear}>Clear</Button><Button size="sm" onClick={save} disabled={empty || busy}>{busy ? "Saving…" : "Save drawn signature"}</Button></div>
    </div>
  );
}

function MySignature({ onMsg }: { onMsg: (m: Msg) => void }) {
  const [st, setSt] = useState<any>(null); const [busy, setBusy] = useState(false);
  const [p, setP] = useState({ pin: "", again: "", current: "" });
  const load = () => api("/me/signing").then(setSt).catch((e) => onMsg({ ok: false, text: e.message }));
  useEffect(() => { load(); }, []);
  const upload = async (blob: Blob, name: string) => {
    setBusy(true); const fd = new FormData(); fd.append("file", blob, name);
    try { await api("/me/signature", { method: "POST", body: fd }); onMsg({ ok: true, text: "Signature saved. It is only ever applied when you tap a Sign button yourself." }); load(); }
    catch (e: any) { onMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  const savePin = async () => {
    if (!/^\d{4,6}$/.test(p.pin)) return onMsg({ ok: false, text: "The PIN must be 4 to 6 digits." });
    if (p.pin !== p.again) return onMsg({ ok: false, text: "The two PINs don't match." });
    try { await api("/me/signing-pin", { method: "POST", body: JSON.stringify({ pin: p.pin, current_pin: p.current || null }) }); setP({ pin: "", again: "", current: "" }); onMsg({ ok: true, text: "Signing PIN saved." }); load(); }
    catch (e: any) { onMsg({ ok: false, text: e.message }); }
  };
  const digits = (k: "pin" | "again" | "current") => (e: React.ChangeEvent<HTMLInputElement>) => setP({ ...p, [k]: e.target.value.replace(/\D/g, "") });
  return (
    <Card><CardHeader title="My signature" />
      <div className="grid gap-6 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <p className="text-sm text-slate-600">Draw your signature with your finger or mouse, or upload a photo of it signed on white paper. It is kept privately and is only ever applied when you tap a Sign button yourself.</p>
          {st && <div>{st.has_signature ? <Badge tone="green">Signature saved {ukDate(st.signature_updated_at)}</Badge> : <Badge tone="red">No signature saved yet</Badge>}</div>}
          <SignaturePad busy={busy} onSave={(b) => upload(b, "signature.png")} />
          <label className="block text-xs text-slate-600">Or upload a photo: <input type="file" accept="image/*" className="text-xs" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ""; if (f) upload(f, f.name); }} /></label>
        </div>
        <div className="space-y-3">
          <p className="text-sm text-slate-600">Your signing PIN is asked for each time you sign a RAMS or an inspection report, so only you can apply your signature, even on a shared computer. Five wrong tries lock signing for 15 minutes.</p>
          {st && <div className="flex flex-wrap gap-1">{st.has_pin ? <Badge tone="green">PIN set</Badge> : <Badge tone="red">No PIN set yet</Badge>}{st.can_sign_rams && <Badge tone="blue">Can sign RAMS</Badge>}{st.is_inspector && <Badge tone="violet">Competent inspector</Badge>}</div>}
          {st?.has_pin && <Field label="Current PIN"><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={p.current} onChange={digits("current")} /></Field>}
          <Field label={st?.has_pin ? "New PIN (4 to 6 digits)" : "PIN (4 to 6 digits)"}><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={p.pin} onChange={digits("pin")} /></Field>
          <Field label="Type it again"><Input type="password" inputMode="numeric" autoComplete="off" maxLength={6} value={p.again} onChange={digits("again")} /></Field>
          <Button size="sm" onClick={savePin}>{st?.has_pin ? "Change PIN" : "Set PIN"}</Button>
          {st && !st.position && <p className="text-xs text-amber-700">Your position is blank, so signed documents show your name only. The owner can add it under People who sign.</p>}
          <p className="text-xs text-slate-500">Forgotten your PIN? Ask the owner to reset it, then set a new one here.</p>
        </div>
      </div>
    </Card>
  );
}

function SigningPeople({ companyId, onMsg }: { companyId: string; onMsg: (m: Msg) => void }) {
  const [rows, setRows] = useState<any[]>([]);
  const load = async () => { const { data } = await supabase().from("profiles").select("id, full_name, position, role, can_sign_rams, is_competent_inspector, signature_path").eq("company_id", companyId).order("full_name"); setRows(data ?? []); };
  useEffect(() => { load(); }, [companyId]);
  const upd = async (id: string, patch: any) => { const { error } = await supabase().from("profiles").update(patch).eq("id", id); if (error) onMsg({ ok: false, text: error.message }); else load(); };
  const reset = async (id: string, name: string) => {
    if (!confirm(`Reset ${name}'s signing PIN? They will need to set a new one before they can sign.`)) return;
    try { await api(`/people/${id}/reset-signing-pin`, { method: "POST" }); onMsg({ ok: true, text: `${name}'s signing PIN has been reset.` }); }
    catch (e: any) { onMsg({ ok: false, text: e.message }); }
  };
  return (
    <Card><CardHeader title="People who sign" />
      <p className="px-4 pt-3 text-xs text-slate-500">The owner can always sign a RAMS. Tick who else can. Inspection reports can only be signed by someone marked as a competent inspector. Position prints beside each signature.</p>
      <div className="divide-y">{rows.map((r) => (
        <div key={r.id} className="grid items-center gap-2 p-3 text-sm sm:grid-cols-6">
          <span className="font-medium">{r.full_name}<span className="block text-xs font-normal capitalize text-slate-500">{r.role}</span></span>
          <Input placeholder="Position" defaultValue={r.position ?? ""} onBlur={(e) => e.target.value !== (r.position ?? "") && upd(r.id, { position: e.target.value || null })} />
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={r.role === "owner" || !!r.can_sign_rams} disabled={r.role === "owner"} onChange={(e) => upd(r.id, { can_sign_rams: e.target.checked })} />Can sign RAMS</label>
          <label className="flex items-center gap-2"><input type="checkbox" className="h-5 w-5" checked={!!r.is_competent_inspector} onChange={(e) => upd(r.id, { is_competent_inspector: e.target.checked })} />Competent inspector</label>
          <span>{r.signature_path ? <Badge tone="green">Signature saved</Badge> : <Badge>No signature</Badge>}</span>
          <Button size="sm" variant="secondary" onClick={() => reset(r.id, r.full_name)}>Reset PIN</Button>
        </div>))}</div>
    </Card>
  );
}
