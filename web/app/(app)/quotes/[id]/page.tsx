"use client";
import { use, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { download } from "@/lib/api";
import { Button, Card, CardHeader, Notice, PageTitle } from "@/components/ui";
import { gbp, ukDate } from "@/lib/utils";

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export default function QuotePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const [q, setQ] = useState<any>(undefined);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    supabase().from("quotes")
      .select("id, number, issued_at, vat_registered, vat_number, vat_rate, job_id, jobs(reference, scope, quote_valid_days, clients(name, company_name, address, postcode), sites(address, postcode)), quote_lines(id, description, quantity, unit, unit_price, line_total)")
      .eq("id", id).maybeSingle().then(({ data }: any) => setQ(data ?? null));
  }, [id]);
  if (q === undefined) return <p className="text-sm text-slate-500">Loading…</p>;
  if (q === null) return <p className="text-sm text-slate-500">Quote not found. <Link href="/quotes" className="underline">Back to quotes</Link></p>;
  const lines = [...(q.quote_lines ?? [])].sort((a: any, b: any) => a.description.localeCompare(b.description));
  const net = round2(lines.reduce((a: number, l: any) => a + Number(l.line_total), 0));
  const vat = q.vat_registered ? round2((net * Number(q.vat_rate)) / 100) : null;
  const total = round2(net + (vat ?? 0));
  const client = q.jobs?.clients;
  const site = (q.jobs?.sites ?? [])[0];
  const valid = q.issued_at ? new Date(new Date(q.issued_at).getTime() + (q.jobs?.quote_valid_days ?? 30) * 864e5).toISOString() : null;
  const get = (f: string) => download(`/quotes/${q.id}/${f}`, `${q.number}.${f}`).catch((e) => setMsg({ ok: false, text: e.message }));
  return (
    <div className="space-y-4">
      <PageTitle title={`Quote ${q.number}`} sub={`${client?.company_name || client?.name || ""} · issued ${ukDate(q.issued_at)}${valid ? ` · valid until ${ukDate(valid)}` : ""}`}
        action={<div className="flex gap-2">{(["pdf", "docx", "csv"] as const).map((f) => <Button key={f} size="sm" variant="secondary" onClick={() => get(f)}>{f === "docx" ? "Word" : f.toUpperCase()}</Button>)}</div>} />
      <Notice msg={msg} onClose={() => setMsg(null)} />
      <Card><CardHeader title="Details" />
        <div className="grid gap-3 p-4 text-sm sm:grid-cols-3">
          <div><div className="text-xs text-slate-500">Client</div>{client?.company_name && <div className="font-medium">{client.company_name}</div>}<div>{client?.name}</div>{client?.address && <div className="text-slate-600">{client.address}{client.postcode ? `, ${client.postcode}` : ""}</div>}</div>
          <div><div className="text-xs text-slate-500">Site</div><div>{site ? `${site.address}${site.postcode ? `, ${site.postcode}` : ""}` : "—"}</div></div>
          <div><div className="text-xs text-slate-500">Job</div><Link href={`/jobs/${q.job_id}`} className="font-medium hover:underline">{q.jobs?.reference}</Link>{q.jobs?.scope && <div className="text-slate-600">{q.jobs.scope}</div>}</div>
        </div>
      </Card>
      <Card><CardHeader title="Lines" />
        <div className="overflow-x-auto"><table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="px-4 py-2">Description</th><th className="px-2 py-2 text-right">Qty</th><th className="px-2 py-2">Unit</th><th className="px-2 py-2 text-right">Unit price</th><th className="px-4 py-2 text-right">Total</th></tr></thead>
          <tbody>{lines.map((l: any) => (
            <tr key={l.id} className="border-b last:border-0"><td className="px-4 py-2">{l.description}</td><td className="px-2 py-2 text-right">{Number(l.quantity).toLocaleString("en-GB", { maximumFractionDigits: 2 })}</td><td className="px-2 py-2">{l.unit}</td><td className="px-2 py-2 text-right">{gbp(l.unit_price)}</td><td className="px-4 py-2 text-right">{gbp(l.line_total)}</td></tr>))}
          </tbody>
          <tfoot className="text-sm">
            <tr className="border-t"><td colSpan={4} className="px-4 py-2 text-right text-slate-600">Subtotal</td><td className="px-4 py-2 text-right">{gbp(net)}</td></tr>
            {q.vat_registered && <tr><td colSpan={4} className="px-4 py-1 text-right text-slate-600">VAT at {Number(q.vat_rate)}%{q.vat_number ? ` (VAT no. ${q.vat_number})` : ""}</td><td className="px-4 py-1 text-right">{gbp(vat)}</td></tr>}
            <tr className="border-t font-semibold"><td colSpan={4} className="px-4 py-2 text-right">Total</td><td className="px-4 py-2 text-right">{gbp(total)}</td></tr>
          </tfoot>
        </table></div>
      </Card>
      <p className="text-xs text-slate-500">The client is quoted on these figures. As-built measurements change pay, never this quote. To change a quote, edit the job and build a new one.</p>
    </div>
  );
}
