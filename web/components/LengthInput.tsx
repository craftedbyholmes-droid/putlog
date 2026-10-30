"use client";
/* A length box that takes metres or feet (10.5, 33ft, 33' 6"). Feet are converted and rounded by the rule given
   for this box, and the conversion shows while typing so the rounding is never hidden. Saves metres when you
   leave the box or press Enter; a mistake stays in the box in red and nothing is saved. */
import { useEffect, useState } from "react";
import { Input } from "@/components/ui";
import { cn } from "@/lib/utils";
import { describe, fmtMetres, parseLength, type Rounding } from "@/lib/measure";

export function LengthInput({ value, onCommit, rounding, className, placeholder, ariaLabel, block }: {
  value: number | string | null | undefined;
  onCommit: (metres: number | null) => void;
  rounding: Rounding;
  className?: string;
  placeholder?: string;
  ariaLabel?: string;
  block?: boolean;
}) {
  const shown = value === null || value === undefined || value === "" ? "" : fmtMetres(Number(value));
  const [text, setText] = useState(shown);
  const [focused, setFocused] = useState(false);
  // a saved value changing underneath (a reload) refreshes the box, but never while someone is typing in it
  useEffect(() => { if (!focused) setText(shown); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps
  const p = parseLength(text, rounding);
  const commit = () => {
    setFocused(false);
    if (p.kind === "error") return;
    const next = p.kind === "empty" ? null : p.metres;
    setText(next === null ? "" : fmtMetres(next));
    const current = shown === "" ? null : Number(shown);
    if (next !== current) onCommit(next);
  };
  const note = p.kind === "error" ? p.error : focused ? describe(p, rounding) : "";
  return (
    <span className={cn(block ? "block" : "inline-block align-top")}>
      <Input className={cn(className, p.kind === "error" && "border-red-400")} inputMode="text" autoComplete="off"
        placeholder={placeholder ?? "m or ft"} aria-label={ariaLabel} value={text}
        onFocus={() => setFocused(true)} onChange={(e) => setText(e.target.value)} onBlur={commit}
        onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
      {note && <span className={cn("mt-0.5 block max-w-[16rem] text-[11px] leading-tight", p.kind === "error" ? "text-red-700" : "text-slate-500")}>{note}</span>}
    </span>
  );
}