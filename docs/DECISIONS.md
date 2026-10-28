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
- **RAMS produced before work starts;** the rule 2 gate is unchanged.
- **RAMS layout:** logo top right then the document name, in a real page header on every page. All templates name the
  logo picture `logo`.

## Found during the build
- **Rule 2 vs the RAMS dates.** The RAMS needs the erection date, but rule 2 blocks scheduling the put-up until the RAMS
  is issued. Resolution: each scaffold has a *planned start date* and *planned days*, which go on the RAMS. Scheduling
  on the board stays blocked until the RAMS is issued. (Needs Keith's confirmation.)
- **Handover "marked signed" in this build** is the owner recording the client's email or text confirmation, with
  evidence. The certificate says it was confirmed by message and recorded by the firm, never "signed" (rule 5).
- **The RAMS pack is one record holding two files** (method statement and risk assessment). It is "issued" by the owner
  or office once no required field is empty and a logo is uploaded; after that it can't change (new revision instead).
- **CSV export:** one row per line item; VAT is worked on the subtotal and spread across lines so the CSV adds up
  exactly to the PDF.
- **Numbering is per firm** (JOB0001, Q0001, HC0001, IR0001), so firms can't infer each other's volumes.
- **Uploaded templates may not contain outside links** (including hyperlinks), as the spec says. Firms may object;
  revisit after testing.

## Adopted defaults (confirm or change)
- `scaffolds.status` starts at `planned`; new `staff_absences`, `quotes`, `quote_lines` tables.
- Who inspects after handover: a required choice of us, the customer or a third party, with a named person.
- Base jacks (4) are on the HAKI bill of materials; one side-exit section per tower when length is against the scaffold.
- Lift layout "level" option puts the remainder into the bottom lift (flags a bespoke design above 2 m).
- Tables live in `public`; RLS helpers and triggers in `private`.
