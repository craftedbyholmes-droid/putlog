"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { api } from "@/lib/api";
import { Badge, Button, Card, CardHeader, Field, Input, Notice, PageTitle, Select } from "@/components/ui";
import { ukDate } from "@/lib/utils";

export default function Settings() {
  const [c, setC] = useState<any>(null); const [role, setRole] = useState(""); const [rates, setRates] = useState<any[]>([]);
  const [staff, setStaff] = useState<any[]>([]); const [vans, setVans] = useState<any[]>([]); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
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
      <Notice msg={msg} onClose={() => setMsg(null)} />
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
