// Checks for metres/feet input and 0.5 m rounding. Run from the repo root:
//   node --experimental-strip-types web/lib/measure.check.mjs
import assert from "node:assert/strict";
import { parseLength, roundHalf, fmtMetres } from "./measure.ts";

let n = 0;
const check = (fn) => { fn(); n++; };
const metres = (s, r) => {
  const p = parseLength(s, r);
  assert.equal(p.kind, "ok", `${s} should be a length: ${p.error ?? p.kind}`);
  return p.metres;
};
const isError = (s, r = "up") => assert.equal(parseLength(s, r).kind, "error", `${s} should be refused`);

// metres are kept exactly as typed
check(() => assert.equal(metres("10.5", "up"), 10.5));
check(() => assert.equal(metres("10.3", "up"), 10.3));
check(() => assert.equal(metres("10m", "nearest"), 10));
// feet round UP for elevations: 33 ft = 10.06 m -> 10.5; 21 ft = 6.40 m -> 6.5
check(() => assert.equal(metres("33ft", "up"), 10.5));
check(() => assert.equal(metres("21ft", "up"), 6.5));
check(() => assert.equal(metres(`33' 6"`, "up"), 10.5));
check(() => assert.equal(metres("33ft 6in", "up"), 10.5));
check(() => assert.equal(metres("33'6", "up"), 10.5));
check(() => assert.equal(metres("33\u2019 6\u201D", "up"), 10.5));       // curly quotes from a phone
// feet round to the NEAREST 0.5 m for towers and the bottom lift
check(() => assert.equal(metres("33ft", "nearest"), 10));
check(() => assert.equal(metres(`33' 6"`, "nearest"), 10));             // 10.21 m
check(() => assert.equal(metres("20ft", "nearest"), 6));                // 6.10 m
check(() => assert.equal(metres("7ft", "nearest"), 2));                 // 2.13 m
check(() => assert.equal(metres("8ft", "nearest"), 2.5));               // 2.44 m
check(() => assert.equal(metres("10ft", "nearest"), 3));                // 3.05 m
// refusals
check(() => assert.equal(parseLength("", "up").kind, "empty"));
check(() => isError(`6' 13"`));
check(() => isError("0"));
check(() => isError("-3"));
check(() => isError("abc"));
check(() => isError("1in", "nearest"));                                  // rounds to 0 m
// the rounding itself
check(() => {
  assert.equal(roundHalf(10, "up"), 10);
  assert.equal(roundHalf(10.01, "up"), 10.5);
  assert.equal(roundHalf(10.25, "nearest"), 10.5);
  assert.equal(roundHalf(10.24, "nearest"), 10);
  assert.equal(fmtMetres(10), "10");
  assert.equal(fmtMetres(10.5), "10.5");
});

console.log(`measure checks passed: ${n}`);