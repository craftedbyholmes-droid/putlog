"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageTitle, Select } from "@/components/ui";

export default function Clients() {
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState(""); const [edit, setEdit] = useState<any | null>(null);
  const load = async () => {
    const sb = supabase();
    const { data } = q.trim().length >= 2 ? await sb.rpc("search_clients", { q: q.trim() }) : await sb.from("clients").select("*").order("company_name");
    setRows(data ?? []);
  };
  useEffect(() => { const t = setTimeout(load, 200); return () => clearTimeout(t); }, [q]);
  const save = async () => {
    const sb = supabase(); const { data: u } = await sb.auth.getUser();
    const { data: me } = await sb.from("profiles").select("company_id").eq("id", u.user!.id).single();
    const row = { ...edit, company_id: me!.company_id };
    const { error } = edit.id ? await sb.from("clients").update(row).eq("id", edit.id) : await sb.from("clients").insert(row);
    if (error) return alert(error.message);
    setEdit(null); load();
  };
  return (
    <div>
      <PageTitle title="Clients" action={<Button onClick={() => setEdit({ name: "", workflow_mode: "full", default_hire_start_trigger: "job_up_confirmed", default_hire_start_offset: "same_day" })}>New client</Button>} />
      <Input className="mb-3 max-w-md" placeholder="Search by name, company or postcode" value={q} onChange={(e) => setQ(e.target.value)} />
      {rows.length === 0 ? <Empty>No clients yet.</Empty> : (
        <Card className="divide-y">{rows.map((c) => (
          <button key={c.id} onClick={() => setEdit(c)} className="flex w-full flex-wrap items-center justify-between gap-2 p-3 text-left hover:bg-slate-50">
            <div><div className="font-medium">{c.company_name || c.name}</div><div className="text-xs text-slate-500">{c.name} · {c.address} {c.postcode}</div></div>
            <div className="flex gap-1">{c.workflow_mode === "simplified" && <Badge tone="amber">Simplified</Badge>}<Link href={`/jobs?client=${c.id}`} onClick={(e) => e.stopPropagation()} className="text-xs text-brand">Jobs</Link></div>
          </button>))}
        </Card>)}
      {edit && (
        <Modal open onClose={() => setEdit(null)} title={edit.id ? "Edit client" : "New client"} wide>
          <div className="grid gap-3 sm:grid-cols-2">
            {[["name", "Contact name *"], ["company_name", "Company"], ["address", "Address"], ["postcode", "Postcode"], ["email", "Email"], ["phone", "Phone"]].map(([k, l]) => (
              <Field key={k} label={l}><Input value={edit[k] ?? ""} onChange={(e) => setEdit({ ...edit, [k]: k === "postcode" ? e.target.value.toUpperCase() : e.target.value })} /></Field>))}
            <Field label="Workflow" hint="Simplified relaxes paperwork around the client only. RAMS, compliance sheets and inspections always stay."><Select value={edit.workflow_mode} onChange={(e) => setEdit({ ...edit, workflow_mode: e.target.value })}><option value="full">Full</option><option value="simplified">Simplified</option></Select></Field>
            <Field label="Hire clock starts on"><Select value={edit.default_hire_start_trigger} onChange={(e) => setEdit({ ...edit, default_hire_start_trigger: e.target.value })}><option value="job_up_confirmed">Job up confirmed</option><option value="handover_emailed">Handover emailed</option></Select></Field>
            <Field label="Counting from"><Select value={edit.default_hire_start_offset} onChange={(e) => setEdit({ ...edit, default_hire_start_offset: e.target.value })}><option value="same_day">The same day</option><option value="next_day">The next day</option></Select></Field>
          </div>
          <div className="mt-4 flex justify-end gap-2"><Button variant="secondary" onClick={() => setEdit(null)}>Cancel</Button><Button onClick={save}>Save</Button></div>
        </Modal>)}
    </div>
  );
}
