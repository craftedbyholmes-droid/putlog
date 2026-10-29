"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { download } from "@/lib/api";
import { Button, Card, Empty, Notice, PageTitle } from "@/components/ui";
import { gbp, ukDate } from "@/lib/utils";

export default function Quotes() {
  const [rows, setRows] = useState<any[]>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => { supabase().from("quotes").select("id, number, issued_at, vat_registered, vat_rate, job_id, jobs(reference, status, clients(name, company_name)), quote_lines(line_total)").order("number", { ascending: false }).then(({ data }: any) => setRows(data ?? [])); }, []);
  const get = (q: any, f: string) => download(`/quotes/${q.id}/${f}`, `${q.number}.${f}`).catch((e) => setMsg({ ok: false, text: e.message }));
  return (
    <div className="space-y-4">
      <PageTitle title="Quotes" sub="Build a quote from the job page once its measurements are in. Click a quote to open it." />
      <Notice msg={msg} onClose={() => setMsg(null)} />
      {rows.length === 0 ? <Empty>No quotes yet.</Empty> : (
        <Card className="divide-y">{rows.map((q) => {
          const net = (q.quote_lines ?? []).reduce((a: number, l: any) => a + Number(l.line_total), 0);
          const gross = q.vat_registered ? net * (1 + Number(q.vat_rate) / 100) : net;
          return (
            <div key={q.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm hover:bg-slate-50">
              <Link href={`/quotes/${q.id}`} className="min-w-0 flex-1"><div className="font-medium">{q.number} · {q.jobs?.clients?.company_name || q.jobs?.clients?.name}</div><div className="text-xs text-slate-500">{q.jobs?.reference} · {ukDate(q.issued_at)} · {gbp(Math.round(gross * 100) / 100)}{q.vat_registered ? " inc. VAT" : ""}</div></Link>
              <div className="flex gap-2">{(["pdf", "docx", "csv"] as const).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => get(q, f)}>{f === "docx" ? "Word" : f.toUpperCase()}</Button>)}</div>
            </div>); })}
        </Card>)}
    </div>
  );
}
