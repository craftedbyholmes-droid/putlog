"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { download } from "@/lib/api";
import { Button, Card, Empty, PageTitle } from "@/components/ui";
import { gbp, ukDate } from "@/lib/utils";

export default function Quotes() {
  const [rows, setRows] = useState<any[]>([]);
  useEffect(() => { supabase().from("quotes").select("id, number, issued_at, vat_registered, vat_rate, job_id, jobs(reference, status, clients(name, company_name)), quote_lines(line_total)").order("number", { ascending: false }).then(({ data }: any) => setRows(data ?? [])); }, []);
  return (
    <div>
      <PageTitle title="Quotes" sub="Build a quote from the job page once its measurements are in. PDF, Word and CSV for your accountant." />
      {rows.length === 0 ? <Empty>No quotes yet.</Empty> : (
        <Card className="divide-y">{rows.map((q) => {
          const net = (q.quote_lines ?? []).reduce((a: number, l: any) => a + Number(l.line_total), 0);
          const gross = q.vat_registered ? net * (1 + Number(q.vat_rate) / 100) : net;
          return (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <div><Link href={`/jobs/${q.job_id}`} className="font-medium hover:underline">{q.number} · {q.jobs?.clients?.company_name || q.jobs?.clients?.name}</Link><div className="text-xs text-slate-500">{q.jobs?.reference} · {ukDate(q.issued_at)} · {gbp(Math.round(gross * 100) / 100)}{q.vat_registered ? " inc. VAT" : ""}</div></div>
              <div className="flex gap-2">{(["pdf", "docx", "csv"] as const).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => download(`/quotes/${q.id}/${f}`, `${q.number}.${f}`)}>{f === "docx" ? "Word" : f.toUpperCase()}</Button>)}</div>
            </div>); })}
        </Card>)}
    </div>
  );
}
