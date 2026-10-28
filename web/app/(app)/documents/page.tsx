"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { api, download } from "@/lib/api";
import { Badge, Button, Card, CardHeader, Empty, Field, Notice, PageTitle, Select } from "@/components/ui";
import { ukDate } from "@/lib/utils";

const KINDS: Record<string, string> = { method_statement: "Method statement", risk_assessment: "Risk assessment", handover: "Handover certificate", inspection: "Inspection report", quote: "Quotation", other: "Other" };
const FIELDS = ["client_name", "client_address", "site_address", "work_area", "date", "date_of_erection", "start_date", "duration", "quote_reference", "item_no", "design_no", "compliance_standard", "supervisor_name", "supervisor_phone", "emergency_contact_name", "emergency_contact_phone", "manpower", "prepared_by_name", "firm_name", "firm_address", "firm_phone", "firm_email"];

export default function Documents() {
  const [docs, setDocs] = useState<any[]>([]); const [tpls, setTpls] = useState<any[]>([]); const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const load = async () => {
    const sb = supabase();
    const [{ data: d }, { data: t }] = await Promise.all([
      sb.from("compliance_docs").select("id, type, reference, revision_no, issued_at, created_at, files, missing_fields, scaffolds(name, sites(job_id, address))").in("type", ["rams", "handover", "inspection"]).order("created_at", { ascending: false }).limit(100),
      sb.from("document_templates").select("*").order("kind").order("version", { ascending: false }),
    ]);
    setDocs(d ?? []); setTpls(t ?? []);
  };
  useEffect(() => { load(); }, []);
  return (
    <div className="space-y-4">
      <PageTitle title="Documents" sub="Every RAMS pack, handover certificate and inspection report, and the Word templates they are made from." />
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <Card><CardHeader title="Generated documents" />
        {docs.length === 0 ? <div className="p-4"><Empty>Nothing generated yet. Generate a RAMS pack from a scaffold on its job page.</Empty></div> : (
          <div className="divide-y">{docs.map((d) => Object.entries(d.files ?? {}).map(([k, v]: any) => (
            <div key={d.id + k} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div><Link href={`/jobs/${d.scaffolds?.sites?.job_id}`} className="font-medium hover:underline">{KINDS[k] ?? k} · {d.reference}{d.type === "rams" ? ` r${d.revision_no}` : ""}</Link><div className="text-xs text-slate-500">{d.scaffolds?.name} · {d.scaffolds?.sites?.address} · {ukDate(d.created_at)}</div></div>
              <div className="flex items-center gap-2">{d.issued_at ? <Badge tone="green">Issued</Badge> : <Badge tone="amber">Draft</Badge>}{d.missing_fields?.length > 0 && !d.issued_at && <Badge tone="red">{d.missing_fields.length} empty</Badge>}
                {v.pdf && <Button size="sm" variant="secondary" onClick={() => download(`/files?path=${encodeURIComponent(v.pdf)}`, v.pdf.split("/").pop())}>PDF</Button>}
                <Button size="sm" variant="secondary" onClick={() => download(`/files?path=${encodeURIComponent(v.docx)}`, v.docx.split("/").pop())}>Word</Button></div>
            </div>)))}</div>)}
      </Card>
      <Templates tpls={tpls} onMsg={setMsg} reload={load} />
    </div>
  );
}

function Templates({ tpls, onMsg, reload }: any) {
  const [kind, setKind] = useState("method_statement"); const [file, setFile] = useState<File | null>(null);
  const [check, setCheck] = useState<any>(null); const [mapping, setMapping] = useState<Record<number, string>>({});
  const [saved, setSaved] = useState<any>(null); const [previewed, setPreviewed] = useState(false); const [busy, setBusy] = useState(false);
  const reset = () => { setCheck(null); setSaved(null); setPreviewed(false); setMapping({}); };
  const runCheck = async (f: File) => {
    reset(); setFile(f); const fd = new FormData(); fd.append("file", f);
    try { const r = await api("/templates/check", { method: "POST", body: fd }); setCheck(r); setMapping(Object.fromEntries(r.proposals.map((p: any, i: number) => [i, p.field]))); } catch (e: any) { onMsg({ ok: false, text: e.message }); }
  };
  const save = async () => {
    if (!file || !check) return; setBusy(true);
    try {
      let upload: Blob = file;
      if (check.tags.length === 0 && check.proposals.length) {        // untagged: insert the confirmed tags first
        const confirmed = check.proposals.map((p: any, i: number) => ({ ...p, field: mapping[i] })).filter((p: any) => p.field);
        const fd = new FormData(); fd.append("file", file); fd.append("confirmed", JSON.stringify(confirmed));
        upload = await api<Blob>("/templates/tag", { method: "POST", body: fd });
      }
      const fd = new FormData(); fd.append("kind", kind); fd.append("file", new File([upload], file.name));
      const r = await api("/templates", { method: "POST", body: fd }); setSaved(r);
      onMsg({ ok: true, text: `Saved as version ${r.version}. Preview it with sample data before you switch it on.` + (r.warnings.length ? " " + r.warnings.join(" ") : "") });
      reload();
    } catch (e: any) { onMsg({ ok: false, text: e.message }); }
    setBusy(false);
  };
  const preview = async (id: string) => { await download(`/templates/${id}/preview`, "preview.pdf"); setPreviewed(true); };
  const activate = async (id: string) => { try { await api(`/templates/${id}/activate`, { method: "POST" }); onMsg({ ok: true, text: "Template switched on. The next document of this kind uses it." }); reset(); setFile(null); reload(); } catch (e: any) { onMsg({ ok: false, text: e.message }); } };
  return (
    <Card><CardHeader title="Templates" />
      <div className="grid gap-4 p-4 lg:grid-cols-2">
        <div className="space-y-2">
          <div className="text-sm font-semibold">In use</div>
          {Object.keys(KINDS).filter((k) => k !== "other").map((k) => { const own = tpls.find((t: any) => t.kind === k && t.company_id && t.active); return (
            <div key={k} className="flex items-center justify-between rounded border p-2 text-sm"><span>{KINDS[k]}</span><span className="text-xs text-slate-500">{own ? `Yours: ${own.name} v${own.version}` : "Standard (read-only)"}</span></div>); })}
          <p className="text-xs text-slate-500">The standard templates are starting points. Adapt each pack to the site before it is issued.</p>
        </div>
        <div className="space-y-3">
          <div className="text-sm font-semibold">Upload your own Word template</div>
          <Field label="It is a"><Select value={kind} onChange={(e) => setKind(e.target.value)}>{Object.entries(KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</Select></Field>
          <Field label=".docx file" hint="Upload a blank copy, not one from a past job: old client details can't be told apart from template text."><input type="file" accept=".docx" onChange={(e) => e.target.files?.[0] && runCheck(e.target.files[0])} className="block text-sm" /></Field>
          {check && !check.ok && <div className="rounded bg-red-50 p-3 text-sm text-red-800"><b>Can't use this file:</b><ul className="ml-4 list-disc">{check.errors.map((e: string, i: number) => <li key={i}>{e}</li>)}</ul></div>}
          {check?.ok && check.tags.length > 0 && <p className="text-sm text-green-700">Fields found: {check.tags.join(", ")}</p>}
          {check?.ok && check.tags.length === 0 && (
            <div className="space-y-2 rounded border p-3 text-sm">
              <p>No fields yet. These blanks were found; check each one:</p>
              {check.proposals.map((p: any, i: number) => (
                <div key={i} className="flex items-center gap-2"><span className="w-36 truncate">{p.label}:</span><Select className="min-h-8" value={mapping[i] ?? ""} onChange={(e) => setMapping({ ...mapping, [i]: e.target.value })}><option value="">Skip</option>{FIELDS.map((f) => <option key={f} value={f}>{f}</option>)}</Select></div>))}
              {check.unmatched.length > 0 && <p className="text-xs text-slate-500">Not recognised (left as they are): {check.unmatched.map((u: any) => u.label).join(", ")}</p>}
            </div>)}
          {check?.warnings?.length > 0 && <p className="text-xs text-amber-700">{check.warnings.join(" ")}</p>}
          {check?.ok && !saved && <Button onClick={save} disabled={busy}>{busy ? "Saving…" : "Save template"}</Button>}
          {saved && <div className="flex gap-2"><Button variant="secondary" onClick={() => preview(saved.template_id)}>Preview with sample data</Button><Button disabled={!previewed} onClick={() => activate(saved.template_id)} title={previewed ? "" : "Preview it first"}>Switch on</Button></div>}
        </div>
      </div>
    </Card>
  );
}
