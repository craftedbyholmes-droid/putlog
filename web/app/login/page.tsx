"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { Button, Field, Input } from "@/components/ui";

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState(""); const [password, setPassword] = useState("");
  const [err, setErr] = useState(""); const [busy, setBusy] = useState(false);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault(); setBusy(true); setErr("");
    const { error } = await supabase().auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setErr("That email and password don't match an account."); else router.replace("/dashboard");
  };
  return (
    <div className="flex min-h-screen items-center justify-center bg-navy-800 p-4">
      <form onSubmit={submit} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow-xl">
        <div><h1 className="text-2xl font-bold text-navy-800">Putlog</h1><p className="text-sm text-slate-500">Sign in to your firm</p></div>
        <Field label="Email"><Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Password"><Input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></Field>
        {err && <p className="text-sm text-red-700">{err}</p>}
        <Button className="w-full" disabled={busy}>{busy ? "Signing in…" : "Sign in"}</Button>
        <p className="text-xs text-slate-500">One login per person. Never share a login: inspections and signatures are recorded against it.</p>
      </form>
    </div>
  );
}
