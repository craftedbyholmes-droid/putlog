"use client";
import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Badge, Button, Card, Empty, Field, Input, Modal, PageTitle } from "@/components/ui";
import { ClientPicker, type Client } from "@/components/ClientPicker";
import { ukDate } from "@/lib/utils";

const TONE: Record<string, any> = { enquiry: "slate", quoted: "amber", accepted: "blue", invoiced: "violet", paid: "green", closed: "slate" };

function Jobs() {
  const sp = useSearchParams(); const router = useRouter();
  const [rows, setRows] = useState<any[]>([]); const [q, setQ] = useState(sp.get("q") ?? "");
  const [filter, setFilter] = useState<"all" | "erected" | "dismantled" | "outstanding">("all");
  const [open, setOpen] = useState(sp.get("new") === "1"); const [client, setClient] = useState<Client | null>(null);
  const [site, setSite] = useState({ address: "", postcode: "" }); const [scope, setScope] = useState(""); const [err, setErr] = useState("");
  useEffect(() => { (async () => {
    const { data } = await supabase().from("jobs").select("id, reference, status, created_at, scope, client_id, clients(name, company_name, postcode), sites(address, postcode, scaffolds(status, compliance_docs(type, handovers(signature_status))))").order("created_at", { ascending: false });
    setRows(data ?? []);
  })(); }, []);
  const flags = (j: any) => {
    const sc = (j.sites ?? []).flatMap((s: any) => s.scaffolds ?? []);
    const outstanding = sc.some((s: any) => (s.compliance_docs ?? []).some((d: any) => d.type === "handover" && (Array.isArray(d.handovers) ? d.handovers : [d.handovers]).some((h: any) => h?.signature_status === "pending")));
    return { erected: sc.some((s: any) => ["erecting", "on_hire", "dismantle_requested", "dismantling"].includes(s.status)), dismantled: sc.length > 0 && sc.every((s: any) => s.status === "dismantled"), outstanding };
  };
  const shown = rows.filter((j) => {
    const t = `${j.reference} ${j.clients?.name} ${j.clients?.company_name} ${j.clients?.postcode} ${(j.sites ?? []).map((s: any) => s.address + " " + (s.postcode ?? "")).join(" ")}`.toLowerCase();
    const f = flags(j);
    return (!q || t.includes(q.toLowerCase())) && (filter === "all" || f[filter]) && (!sp.get("client") || j.client_id === sp.get("client"));
  });
  const create = async () => {
    setErr("");
    if (!client) return setErr("Choose or create the client first. Every job needs one.");
    if (!site.address.trim()) return setErr("Enter the site address.");
    const sb = supabase(); const { data: u } = await sb.auth.getUser();
    const { data: me } = await sb.from("profiles").select("company_id").eq("id", u.user!.id).single();
    const { data: job, error } = await sb.from("jobs").insert({ company_id: me!.company_id, client_id: client.id, scope }).select("id").single();
    if (error) return setErr(error.message);
    await sb.from("sites").insert({ company_id: me!.company_id, job_id: job!.id, address: site.address, postcode: site.postcode || null });
    router.push(`/jobs/${job!.id}`);
  };
  return (
    <div>
      <PageTitle title="Jobs" action={<Button onClick={() => setOpen(true)}>New job</Button>} />
      <div className="mb-3 flex flex-wrap gap-2">
        <Input className="max-w-sm" placeholder="Search reference, client, address, postcode" value={q} onChange={(e) => setQ(e.target.value)} />
        {(["all", "erected", "dismantled", "outstanding"] as const).map((f) => <Button key={f} size="sm" variant={filter === f ? "primary" : "secondary"} onClick={() => setFilter(f)}>{f === "outstanding" ? "Outstanding handover" : f[0].toUpperCase() + f.slice(1)}</Button>)}
      </div>
      {shown.length === 0 ? <Empty>No jobs match.</Empty> : (
        <Card className="divide-y">{shown.map((j) => { const f = flags(j); return (
          <Link key={j.id} href={`/jobs/${j.id}`} className="flex flex-wrap items-center justify-between gap-2 p-3 hover:bg-slate-50">
            <div><div className="font-medium">{j.reference} · {j.clients?.company_name || j.clients?.name}</div><div className="text-xs text-slate-500">{(j.sites ?? []).map((s: any) => s.address).join("; ")} · logged {ukDate(j.created_at)}</div></div>
            <div className="flex gap-1">{f.outstanding && <Badge tone="red">Handover unsigned</Badge>}{f.dismantled && f.outstanding && <Badge tone="red">Most urgent: dismantled, no signed handover</Badge>}<Badge tone={TONE[j.status]}>{j.status}</Badge></div>
          </Link>); })}
        </Card>)}
      <Modal open={open} onClose={() => setOpen(false)} title="New job" wide>
        <div className="space-y-4">
          <Field label="Client *"><ClientPicker value={client} onChange={setClient} /></Field>
          <div className="grid gap-3 sm:grid-cols-3"><Field label="Site address *" className="sm:col-span-2"><Input value={site.address} onChange={(e) => setSite({ ...site, address: e.target.value })} /></Field><Field label="Postcode"><Input value={site.postcode} onChange={(e) => setSite({ ...site, postcode: e.target.value.toUpperCase() })} /></Field></div>
          <Field label="Scope (what the client asked for)"><Input value={scope} onChange={(e) => setScope(e.target.value)} /></Field>
          {err && <p className="text-sm text-red-700">{err}</p>}
          <div className="flex justify-end gap-2"><Button variant="secondary" onClick={() => setOpen(false)}>Cancel</Button><Button onClick={create}>Create job</Button></div>
        </div>
      </Modal>
    </div>
  );
}
export default function Page() { return <Suspense><Jobs /></Suspense>; }
