"use client";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Bell, LogOut, Menu, Search, X } from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import { supabase } from "@/lib/supabase";

function Logo({ small }: { small?: boolean }) {
  return <div className="flex items-center gap-2 text-white"><svg viewBox="0 0 32 32" className={small ? "h-7 w-7" : "h-8 w-8"} aria-hidden><rect x="3" y="3" width="4" height="26" rx="1" fill="currentColor" /><rect x="25" y="3" width="4" height="26" rx="1" fill="currentColor" /><rect x="3" y="10" width="26" height="3" rx="1" fill="#60a5fa" /><rect x="3" y="20" width="26" height="3" rx="1" fill="#60a5fa" /></svg>{!small && <span className="text-lg font-bold tracking-tight">Putlog</span>}</div>;
}

export function Shell({ children }: { children: React.ReactNode }) {
  const path = usePathname(); const router = useRouter();
  const [me, setMe] = useState<{ full_name: string; position: string | null; firm: string } | null>(null);
  const [q, setQ] = useState(""); const [more, setMore] = useState(false);
  useEffect(() => {
    (async () => {
      const sb = supabase(); const { data: u } = await sb.auth.getUser(); if (!u.user) return;
      const { data } = await sb.from("profiles").select("full_name, position, companies(name)").eq("id", u.user.id).single();
      if (data) setMe({ full_name: data.full_name, position: data.position, firm: (data.companies as any)?.name ?? "" });
    })();
  }, []);
  useEffect(() => setMore(false), [path]);
  const signOut = async () => { await supabase().auth.signOut(); router.replace("/login"); };
  const active = (href: string) => path === href || path.startsWith(href + "/");

  return (
    <div className="flex min-h-screen">
      {/* desktop sidebar */}
      <aside className="sticky top-0 hidden h-screen w-24 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-navy-800 py-4 lg:flex">
        <Link href="/dashboard" className="mb-3"><Logo small /></Link>
        {NAV.map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex w-20 flex-col items-center gap-1 rounded-md px-1 py-2 text-[11px] text-blue-100/80 hover:bg-navy-700 hover:text-white", active(n.href) && "bg-navy-700 text-white", !n.live && "opacity-60")}>
            <n.icon size={20} /><span className="text-center leading-tight">{n.label}</span>
          </Link>
        ))}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        {/* top bar */}
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-2 pt-[max(0.5rem,env(safe-area-inset-top))]">
          <div className="lg:hidden rounded bg-navy-800 p-1.5"><Logo small /></div>
          <div className="hidden text-base font-semibold text-slate-900 sm:block">Putlog <span className="font-normal text-slate-500">{me?.firm ? `· ${me.firm}` : ""}</span></div>
          <form className="ml-auto flex max-w-md flex-1 items-center gap-2 rounded-md bg-slate-100 px-3" onSubmit={(e) => { e.preventDefault(); if (q.trim()) router.push(`/jobs?q=${encodeURIComponent(q.trim())}`); }}>
            <Search size={16} className="text-slate-400" /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search jobs, clients, postcodes" className="min-h-9 w-full bg-transparent text-sm outline-none" />
          </form>
          <Link href="/dashboard#urgent" aria-label="Urgent items" className="rounded p-2 text-slate-600 hover:bg-slate-100"><Bell size={18} /></Link>
          <div className="hidden text-right text-xs leading-tight sm:block"><div className="font-medium text-slate-800">{me?.full_name ?? "…"}</div><div className="text-slate-500">{me?.position ?? ""}</div></div>
          <button onClick={signOut} aria-label="Sign out" className="rounded p-2 text-slate-600 hover:bg-slate-100"><LogOut size={18} /></button>
        </header>
        <main className="flex-1 px-3 pb-24 pt-4 sm:px-6 lg:pb-8">{children}</main>
      </div>
      {/* phone bottom bar */}
      <nav className="fixed inset-x-0 bottom-0 z-40 grid grid-cols-5 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] lg:hidden">
        {NAV.filter((n) => n.mobile).map((n) => (
          <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-0.5 py-2 text-[11px] text-slate-500", active(n.href) && "text-brand")}><n.icon size={20} />{n.label}</Link>
        ))}
        <button onClick={() => setMore(true)} className="flex flex-col items-center gap-0.5 py-2 text-[11px] text-slate-500"><Menu size={20} />More</button>
      </nav>
      {more && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 lg:hidden" onClick={() => setMore(false)}>
          <div className="absolute inset-x-0 bottom-0 rounded-t-xl bg-white p-4 pb-[max(1rem,env(safe-area-inset-bottom))]" onClick={(e) => e.stopPropagation()}>
            <div className="mb-2 flex justify-between"><span className="font-semibold">All sections</span><button onClick={() => setMore(false)} aria-label="Close"><X size={18} /></button></div>
            <div className="grid grid-cols-3 gap-2">
              {NAV.map((n) => <Link key={n.href} href={n.href} className={cn("flex flex-col items-center gap-1 rounded-md border p-3 text-xs", !n.live && "opacity-60")}><n.icon size={20} />{n.label}</Link>)}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ComingLater({ title, what }: { title: string; what: string }) {
  return (
    <div>
      <h1 className="mb-4 text-2xl font-semibold">{title}</h1>
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-10 text-center">
        <p className="text-lg font-medium text-slate-800">Coming in a later update</p>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-500">{what} It will appear here, in this same place, when it goes live.</p>
      </div>
    </div>
  );
}
