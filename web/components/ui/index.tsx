"use client";
/* Small shadcn-style building blocks, kept in the repo so library updates never change the look.
   Phone rule (30 Oct 2026): every field and form box may shrink to the screen (min-w-0, max-w-full). Without it, a
   box in a grid can't get narrower than its contents, so a dropdown with a long option pushes the form off the side. */
import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

const button = cva("inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand min-h-10 px-4", {
  variants: {
    variant: {
      primary: "bg-brand text-white hover:bg-blue-700",
      secondary: "bg-white text-slate-800 border border-slate-300 hover:bg-slate-50",
      ghost: "text-slate-700 hover:bg-slate-100",
      danger: "bg-red-600 text-white hover:bg-red-700",
    },
    size: { sm: "min-h-8 px-3 text-xs", md: "", lg: "min-h-12 px-6 text-base" },
  },
  defaultVariants: { variant: "primary", size: "md" },
});
export function Button({ className, variant, size, ...p }: React.ButtonHTMLAttributes<HTMLButtonElement> & VariantProps<typeof button>) {
  return <button className={cn(button({ variant, size }), className)} {...p} />;
}

export function Card({ className, ...p }: React.ComponentProps<"div">) {
  return <div className={cn("min-w-0 rounded-lg border border-slate-200 bg-white shadow-sm", className)} {...p} />;
}
export function CardHeader({ title, action, className }: { title: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return <div className={cn("flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3", className)}><h2 className="min-w-0 text-sm font-semibold uppercase tracking-wide text-slate-700">{title}</h2>{action}</div>;
}

const badge = cva("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium", {
  variants: { tone: { slate: "bg-slate-100 text-slate-700", green: "bg-green-100 text-green-800", amber: "bg-amber-100 text-amber-800", red: "bg-red-100 text-red-700", blue: "bg-blue-100 text-blue-800", violet: "bg-violet-100 text-violet-800" } },
  defaultVariants: { tone: "slate" },
});
export function Badge({ className, tone, ...p }: React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badge>) {
  return <span className={cn(badge({ tone }), className)} {...p} />;
}

const field = "w-full min-w-0 max-w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm min-h-10 focus:border-brand focus:outline-none focus:ring-2 focus:ring-blue-200";
export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => <input ref={ref} className={cn(field, className)} {...p} />);
Input.displayName = "Input";
export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) { return <select className={cn(field, "truncate", className)} {...p} />; }
export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) { return <textarea className={cn(field, "min-h-20", className)} {...p} />; }
export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <label className={cn("block min-w-0 space-y-1", className)}><span className="text-xs font-medium text-slate-600">{label}</span>{children}{hint && <span className="block break-words text-xs text-slate-500">{hint}</span>}</label>;
}

export function Modal({ open, onClose, title, children, wide }: { open: boolean; onClose: () => void; title: string; children: React.ReactNode; wide?: boolean }) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 sm:items-center" onClick={onClose}>
      <div className={cn("max-h-[92vh] w-full min-w-0 max-w-full overflow-y-auto overflow-x-hidden rounded-t-xl bg-white shadow-xl sm:rounded-xl", wide ? "sm:max-w-3xl" : "sm:max-w-lg")} onClick={(e) => e.stopPropagation()}>
        <div className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b bg-white px-5 py-3"><h3 className="min-w-0 font-semibold">{title}</h3><button aria-label="Close" onClick={onClose} className="shrink-0 rounded p-1 hover:bg-slate-100"><X size={18} /></button></div>
        <div className="min-w-0 p-4 sm:p-5">{children}</div>
      </div>
    </div>
  );
}

/** One-line message banner used after every action: green when it worked, red with the reason when not. */
export function Notice({ msg, onClose }: { msg: { ok: boolean; text: string } | null; onClose: () => void }) {
  if (!msg) return null;
  return <div role="status" className={cn("flex items-start justify-between gap-3 rounded-md px-4 py-3 text-sm", msg.ok ? "bg-green-50 text-green-800" : "bg-red-50 text-red-800")}><span className="min-w-0 break-words">{msg.text}</span><button onClick={onClose} aria-label="Dismiss" className="shrink-0"><X size={16} /></button></div>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">{children}</div>;
}

export function PageTitle({ title, action, sub }: { title: string; action?: React.ReactNode; sub?: string }) {
  return <div className="mb-4 flex flex-wrap items-end justify-between gap-3"><div className="min-w-0"><h1 className="text-2xl font-semibold text-slate-900">{title}</h1>{sub && <p className="text-sm text-slate-500">{sub}</p>}</div>{action}</div>;
}