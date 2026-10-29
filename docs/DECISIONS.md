# Decisions made after the spec of 28 October 2026

These amend "Scaffolding CRM — Agreed Spec & Build Handoff". Fold them into the next export of that doc.

## Confirmed by Keith
- **Name: Putlog.** Name checks (Companies House, UK IPO classes 9 and 42, domains) still to do.
- **Stack:** Next.js 16 (App Router, TypeScript, Tailwind 4, shadcn-style components kept in the repo), FastAPI on
  Python 3.14, Supabase (London) with RLS, Railway. The website talks to Supabase directly for simple screens; the API
  does calculations, documents, PDFs and uploads. Both use the user's own login, so RLS always applies.
- **One PDF engine.** WeasyPrint is dropped. Quotes come from a fifth Word template, `Quote_TEMPLATE.docx`, filled the
  same way as the other documents and converted by LibreOffice.
- **UI:** the layout of the reference image (navy sidebar, KPI cards, pipeline board, right-hand panel), with the full
  final navigation from day one. Unbuilt sections show "Coming in a later update" in place. No invented figures.
- **Pipeline board is two-level:** jobs in Enquiry and Quoted; once accepted, one card per scaffold through Planning &
  RAMS, Erecting, On hire, Dismantle; the job returns as one card for Awaiting invoice, Invoiced, Paid.
- **HAKI cap: 100 ft (30.48 m)**, on target or built height.
- **HAKI standards:** first standards staggered, 6 ft in two opposite corners and 10 ft in the other two; all four tops
  level. The 1.5 m bottom standard is dropped.
- **Lift toggle on the bottom lift only.** Test 23 amended.
- **HAKI and tube-and-fitting priced separately:** `scaffolds.pricing_mode` per scaffold.
- **Fixed price (28 Oct 2026):** a fifth pricing option, `fixed`, for tube-and-fitting and HAKI towers alike. One main
  figure plus any priced extras (a loading bay, sheeting), stored on the scaffold as `price_items`, so all linked to its
  site. The quote shows one line per item at quantity 1; measurements and rate cards never change it. Measurements stay
  optional on a fixed-price scaffold and still feed pay and the lift layout. A whole job priced as one figure is one
  scaffold set to fixed price. Extras asked for after acceptance are variations and will go through the confirmation
  trail when it is built. The hand-entered weekly hire-extension rate for fixed-price scaffolds comes with hire billing.
- **Quote CSV stays one row per line item with no totals (29 Oct 2026).** A totals row or totals columns would be
  imported by accounting software as an extra charge. The PDF carries the totals.
- **RAMS amended before work starts (29 Oct 2026).** The RAMS sets out how the job will be done and often needs
  site-specific methods, so a draft can be edited before issue. Scaffold details (name, planned start, planned days,
  planned crew size, bottom lift) are editable at any time and saving refreshes the draft. A part of the draft
  (method statement or risk assessment) can be downloaded, adapted in Word and uploaded back: it replaces that part for
  this scaffold only, records who edited it and when, and gets its own PDF. The firm's standard template is unchanged.
  Regenerate rebuilds only the parts not edited by hand; Discard edit puts a part back to the standard wording. Signing
  first brings the standard parts up to date, then checks the job and scaffold records have every required detail
  (even where the details were typed into an edited part), then signs and locks the pack. After that, any change is a
  new revision (rule 7). An edited part is a filled-in document, not a template: dates in it are changed by hand.
- **Drawing ref "To follow" (29 Oct 2026).** The compliance sheet's reference is labelled "Drawing ref" and is never
  prefilled: whatever is recorded there counts as the scaffold's sheet for rule 2, so a placeholder would let a scaffold
  go up with no design. Until a drawing ref is recorded, the RAMS prints "To follow" as the drawing ref and the standard
  the scaffold type implies (NASC TG20:21 for tube and fitting, NASC TG30 for HAKI towers), and the RAMS can be signed
  and issued. Rule 2 is unchanged: scheduling and erection stay blocked until a real drawing ref is recorded. A RAMS
  signed before the drawing ref was recorded is flagged on the scaffold for a new revision that cites it.
- **Saved signatures (29 Oct 2026).** Each person saves their own signature (drawn, or a photo on white paper, cleaned
  to a see-through background) and sets a 4–6 digit signing PIN in Settings. A signature is only ever applied by that
  person's own deliberate tap on a button labelled as their legal signature. RAMS: "Sign and issue", by the owner or
  anyone the owner ticks, with the PIN; the signature goes in the signature box and a dated "Signed electronically"
  block (name, position, UK time, how it was applied) ends every part, including parts edited by hand. Inspection
  report: signed by the inspector who did it (competent-inspector flag), with the PIN; it is issued and locked once
  signed, and missing details are listed before signing. Handover certificate: signed by the person confirming erection,
  one tap, no PIN, as the spec allows; the issuer is recorded on the certificate so a later re-render never names
  someone else. PINs are hashed in the private schema the website cannot reach; five wrong tries lock signing for 15
  minutes; changing a PIN needs the current one; the owner can reset a forgotten PIN. Signature images sit in a private
  bucket and are only read server-side. **The statement and button wording are draft, for the solicitor to review.**
- **RAMS produced before work starts;** the rule 2 gate is unchanged.
- **RAMS layout:** logo top right then the document name, in a real page header on every page. All templates name the
  logo picture `logo`.

## Found during the build
- **Rule 2 vs the RAMS dates.** The RAMS needs the erection date and manpower, but rule 2 blocks scheduling the put-up
  until the RAMS is issued. Resolution: each scaffold has a *planned start date*, *planned days* and *planned crew size*,
  which go on the RAMS until the put-up is on the board. Scheduling on the board stays blocked until the RAMS is issued.
  (Needs Keith's confirmation.)
- **Handover "marked signed" in this build** is the owner recording the client's email or text confirmation, with
  evidence. The certificate says it was confirmed by message and recorded by the firm, never "signed" (rule 5).
- **The RAMS pack is one record holding two files** (method statement and risk assessment), signed and issued together.
- **Edited RAMS uploads have their own check.** Word turns typed email addresses into links by itself, so web and email
  links are allowed in an edited draft; macros, links to outside files and leftover template tags are refused. Uploaded
  templates keep the stricter rule (no outside links at all).
- **Errors show where the user is looking.** Form errors appear inside the form; page messages pop up in the bottom
  corner, so a failed action is never hidden behind an open form or off the top of the page.
- **Times on documents are UK time.** Stored times are converted to Europe/London when printed.
- **CSV export:** one row per line item; VAT is worked on the subtotal and spread across lines so the CSV adds up
  exactly to the PDF.
- **Numbering is per firm** (JOB0001, Q0001, HC0001, IR0001), so firms can't infer each other's volumes.
- **Uploaded templates may not contain outside links** (including hyperlinks), as the spec says. Firms may object;
  revisit after testing.
- **Windows development (29 Oct 2026):** LibreOffice is found in its Windows install folder if it is not on the system
  path (`SOFFICE_PATH` can still override). The conversion builds its profile address as a proper file URI on every OS
  (the old form crashed LibreOffice on Windows with "bootstrap.ini is corrupt"), never waits on a prompt, and reports a
  failed conversion as a 503 with LibreOffice's message. First tested on Windows with real local Supabase.
- **Pricing and input errors are 422s, not server errors.** "No rate set", "no fixed price" and missing unit prices now
  reach the user as a readable message.

## Still to build around signatures
- Operatives signing on to the issued method statement (`rams_signons`), with re-authentication.
- Removing a leaver's signature and sessions; flagging device and server times that differ on inspections.
- Passkeys (WebAuthn) in place of the PIN, once the gang portal lands.

## Adopted defaults (confirm or change)
- `scaffolds.status` starts at `planned`; new `staff_absences`, `quotes`, `quote_lines` tables.
- Who inspects after handover: a required choice of us, the customer or a third party, with a named person.
- Base jacks (4) are on the HAKI bill of materials; one side-exit section per tower when length is against the scaffold.
- Lift layout "level" option puts the remainder into the bottom lift (flags a bespoke design above 2 m).
- Tables live in `public`; RLS helpers and triggers in `private`.
