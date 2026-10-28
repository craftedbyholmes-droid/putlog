"use client";
import { supabase } from "./supabase";

const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://127.0.0.1:8000";

async function token() {
  const { data } = await supabase().auth.getSession();
  if (!data.session) throw new Error("Sign in again.");
  return data.session.access_token;
}

/** Calls the Putlog API with the user's own login, so the database's row-level security applies. */
export async function api<T = any>(path: string, init: RequestInit = {}): Promise<T> {
  const res = await fetch(BASE + path, { ...init, headers: { ...(init.body instanceof FormData ? {} : { "Content-Type": "application/json" }), ...(init.headers || {}), Authorization: `Bearer ${await token()}` } });
  if (!res.ok) {
    let msg = res.statusText;
    try { const j = await res.json(); msg = typeof j.detail === "string" ? j.detail : JSON.stringify(j.detail); } catch {}
    throw new Error(msg);
  }
  const ct = res.headers.get("content-type") || "";
  return (ct.includes("application/json") ? res.json() : res.blob()) as Promise<T>;
}

/** Downloads a file the API returns and opens it (PDFs open in the phone's viewer). */
export async function download(path: string, filename: string) {
  const blob = await api<Blob>(path);
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}
