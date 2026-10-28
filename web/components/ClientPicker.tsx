"use client";
import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button, Field, Input } from "@/components/ui";

export type Client = { id: string; name: string; company_name: string | null; postcode: string | null };

/** Rule 13: every job has exactly one client, found by search or created on the spot. */
export function ClientPicker({ value, onChange }: { value: Client | null; onChange: (c: Client | null) => void }) {
  const [q, setQ] = useState(""); const [hits, setHits] = useState<Client[]>([]); const [creating, setCreating] = useState(false);
  const [f, setF] = useState({ name: "", company_name: "", address: "", postcode: "", email: "", phone: "" }); const [err, setErr] = useState("");
  useEffect(() => {
    if (q.trim().length < 2) { setHits([]); return; }
    const t = setTimeout(async () => { const { data } = await supabase().rpc("search_clients", { q: q.trim() }); setHits((data as Client[]) ?? []); }, 200);
    return () => clearTimeout(t);
  }, [q]);
  const create = async () => {
    setErr("");
    if (!f.name.trim()) return setErr("Enter the contact's name.");
    const sb = supabase(); const { data: u } = await sb.auth.getUser();
    const { data: me } = await sb.from("profiles").select("company_id").eq("id", u.user!.id).single();
    const { data, error } = await sb.from("clients").insert({ ...f, company_id: me!.company_id }).select("id, name, company_name, postcode").single();
    if (error) return setErr(error.message);
    onChange(data as Client); setCreating(false);
  };
  if (value) return <div className="flex items-center justify-between rounded-md border bg-slate-50 p-3 text-sm"><div><div className="font-medium">{value.company_name || value.name}</div><div className="text-xs text-slate-500">{value.name}{value.postcode ? ` · ${value.postcode}` : ""}</div></div><Button size="sm" variant="ghost" onClick={() => onChange(null)}>Change</Button></div>;
  if (creating) return (
    <div className="space-y-2 rounded-md border p-3">
      <div className="grid gap-2 sm:grid-cols-2">
        <Field label="Contact name *"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Company"><Input value={f.company_name} onChange={(e) => setF({ ...f, company_name: e.target.value })} /></Field>
        <Field label="Address"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Postcode"><Input value={f.postcode} onChange={(e) => setF({ ...f, postcode: e.target.value.toUpperCase() })} /></Field>
        <Field label="Email"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Phone"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      {err && <p className="text-sm text-red-700">{err}</p>}
      <div className="flex gap-2"><Button size="sm" onClick={create}>Save client</Button><Button size="sm" variant="ghost" onClick={() => setCreating(false)}>Cancel</Button></div>
    </div>
  );
  return (
    <div className="space-y-2">
      <Input autoFocus placeholder="Search by name, company or postcode" value={q} onChange={(e) => setQ(e.target.value)} />
      {hits.map((c) => <button key={c.id} onClick={() => onChange(c)} className="block w-full rounded-md border p-2 text-left text-sm hover:bg-slate-50"><span className="font-medium">{c.company_name || c.name}</span> <span className="text-slate-500">{c.name}{c.postcode ? ` · ${c.postcode}` : ""}</span></button>)}
      {q.trim().length >= 2 && hits.length === 0 && <p className="text-xs text-slate-500">No match.</p>}
      <Button size="sm" variant="secondary" onClick={() => { setCreating(true); setF({ ...f, company_name: q }); }}>New client</Button>
    </div>
  );
}
