"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { download } from "@/lib/api";
import { Badge, Button, Card, Empty, PageTitle } from "@/components/ui";
import { ukDate } from "@/lib/utils";

export default function Inspections() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase().from("inspections").select("report_ref, inspection_type, inspected_at, outcome, next_inspection_due, compliance_docs(files, scaffold_id, scaffolds(name, sites(job_id, address)))").order("inspected_at", { ascending: false }).then(({ data }: any) => setRows(data ?? [])); }, []);
  return (
    <div>
      <PageTitle title="Inspections" sub="Create a report from the scaffold on its job page. Automatic 7-day scheduling, signing and sending come in a later update." />
      {rows.length === 0 ? <Empty>No inspection reports yet.</Empty> : (
        <Card className="divide-y">{rows.map((r) => { const d = r.compliance_docs; const f = d?.files?.inspection; const overdue = r.next_inspection_due && new Date(r.next_inspection_due) < new Date(); return (
          <div key={r.report_ref} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
            <div><Link href={`/jobs/${d?.scaffolds?.sites?.job_id}`} className="font-medium hover:underline">{r.report_ref} · {d?.scaffolds?.name}</Link><div className="text-xs text-slate-500">{d?.scaffolds?.sites?.address} · {r.inspection_type} · {ukDate(r.inspected_at)} · {r.outcome}</div></div>
            <div className="flex items-center gap-2"><Badge tone={overdue ? "red" : "slate"}>Next due {ukDate(r.next_inspection_due)}</Badge>{f?.pdf && <Button size="sm" variant="secondary" onClick={() => download(`/files?path=${encodeURIComponent(f.pdf)}`, `${r.report_ref}.pdf`)}>PDF</Button>}</div>
          </div>); })}
        </Card>)}
    </div>
  );
}
