/** Lengths typed in metres or feet.
 * Feet (and inches) are converted to metres and rounded to a 0.5 m step. Metres are kept exactly as typed.
 * The rounding rule is fixed per box (Keith, 30 Oct 2026): elevation measurements round UP, so the firm never
 * quotes less scaffold than it builds; HAKI tower heights and the bottom lift round to the NEAREST 0.5 m.
 * Kept free of app imports so it can be checked on its own: node --experimental-strip-types web/lib/measure.check.mjs */
export type Rounding = "up" | "nearest";
export type Parsed =
  | { kind: "empty" }
  | { kind: "error"; error: string }
  | { kind: "ok"; metres: number; exactMetres: number; fromFeet: boolean; feetText: string };

const INCH_M = 0.0254;
const MAX_M = 1000;
const NUM = "(\\d+(?:\\.\\d+)?|\\.\\d+)";
const METRES = new RegExp(`^${NUM}\\s*(?:m|metres?|meters?)?$`);
const FEET = new RegExp(`^${NUM}\\s*(?:'|ft|feet|foot)\\s*(?:${NUM}\\s*(?:"|in|inch|inches)?)?$`);
const INCHES = new RegExp(`^${NUM}\\s*(?:"|in|inch|inches)$`);

const num = (n: number) => String(Number(n.toFixed(2)));

/** Rounds to a 0.5 m step. "up" ignores floating-point dust, so an exact 10.0 stays 10.0. */
export function roundHalf(m: number, rounding: Rounding): number {
  const halves = rounding === "up" ? Math.ceil(m * 2 - 1e-6) : Math.round(m * 2);
  return halves / 2;
}

/** 10 -> "10", 10.5 -> "10.5", 10.25 -> "10.25" */
export function fmtMetres(m: number): string {
  return String(Number(m.toFixed(3)));
}

/** Metres as feet and inches, to the nearest inch: 2.0 -> "6 ft 7 in" */
export function feetAndInches(m: number): string {
  const inches = Math.round(m / INCH_M);
  const ft = Math.floor(inches / 12), i = inches % 12;
  return i ? `${ft} ft ${i} in` : `${ft} ft`;
}

function feetText(ft: number, inch: number): string {
  return [ft ? `${num(ft)} ft` : "", inch ? `${num(inch)} in` : ""].filter(Boolean).join(" ") || "0 ft";
}

function finish(exact: number, fromFeet: boolean, text: string, rounding: Rounding): Parsed {
  if (!(exact > 0)) return { kind: "error", error: "Must be more than 0." };
  if (exact > MAX_M) return { kind: "error", error: "That's over 1,000 m. Check the figure." };
  const metres = fromFeet ? roundHalf(exact, rounding) : exact;
  if (!(metres > 0)) return { kind: "error", error: "That rounds to 0 m. Check the figure." };
  return { kind: "ok", metres, exactMetres: exact, fromFeet, feetText: text };
}

export function parseLength(raw: string, rounding: Rounding): Parsed {
  const s = (raw ?? "").trim().toLowerCase()
    .replace(/[\u2019\u2018\u2032`]/g, "'")      // curly and prime apostrophes from phone keyboards
    .replace(/[\u201D\u201C\u2033]/g, '"')       // curly and prime double quotes
    .replace(/''/g, '"')                          // two apostrophes typed for inches
    .replace(/,/g, ".")
    .replace(/\s+/g, " ");
  if (!s) return { kind: "empty" };
  let m = METRES.exec(s);
  if (m) return finish(Number(m[1]), false, "", rounding);
  m = FEET.exec(s);
  if (m) {
    const ft = Number(m[1]), inch = m[2] ? Number(m[2]) : 0;
    if (inch >= 12) return { kind: "error", error: `${num(inch)} inches is a foot or more: write it as feet and inches, e.g. 6' 6".` };
    return finish((ft * 12 + inch) * INCH_M, true, feetText(ft, inch), rounding);
  }
  m = INCHES.exec(s);
  if (m) {
    const inch = Number(m[1]);
    return finish(inch * INCH_M, true, feetText(Math.floor(inch / 12), inch % 12), rounding);
  }
  return { kind: "error", error: `Not a length. Type metres (10.5) or feet (33ft, 33' 6").` };
}

/** The line shown under the box while typing, so the rounding is never hidden. */
export function describe(p: Parsed, rounding: Rounding): string {
  if (p.kind !== "ok") return "";
  if (!p.fromFeet) return `= ${feetAndInches(p.metres)}`;
  const how = rounding === "up" ? "rounded up" : "nearest 0.5 m";
  return `${p.feetText} = ${p.exactMetres.toFixed(2)} m \u2192 ${fmtMetres(p.metres)} m (${how})`;
}