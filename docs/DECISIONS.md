# Decisions made after the spec of 28 October 2026

These amend "Scaffolding CRM — Agreed Spec & Build Handoff". Fold them into the next export of that doc.

## Confirmed by Keith
- **Name: Putlog.** Name checks (Companies House, UK IPO classes 9 and 42, domains) still to do.
- **Stack:** Next.js 16 (App Router, TypeScript, Tailwind 4, shadcn-style components kept in the repo), FastAPI on
  Python 3.14, Supabase with RLS, Railway. The website talks to Supabase directly for simple screens; the API
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
  to a see-through background) and sets a 4–6 digit signing PIN in Settings, while signed in as themselves: nobody can
  save or choose a signature for someone else. A signature is only ever applied by that person's own deliberate tap on
  a button labelled as their legal signature. RAMS: "Sign and issue", by the owner or anyone the owner ticks, with the
  PIN; the signature goes in the signature box and a dated "Signed electronically" block (name, position, UK time, how
  it was applied) ends every part, including parts edited by hand. Inspection report: signed by the inspector who did
  it (competent-inspector flag), with the PIN; it is issued and locked once signed, and missing details are listed
  before signing. Handover certificate: signed by the person confirming erection, one tap, no PIN, as the spec allows;
  the issuer is recorded on the certificate so a later re-render never names someone else. PINs are hashed in the
  private schema the website cannot reach; five wrong tries lock signing for 15 minutes; changing a PIN needs the
  current one; the owner can reset a forgotten PIN. Signature images sit in a private bucket and are only read
  server-side. Size and position in the signed PDF checked and approved by Keith. **The statement and button wording
  are draft, for the solicitor to review.**
- **Metres or feet in every length box (30 Oct 2026).** Elevation length and height, as-built figures, the HAKI target
  height and a custom bottom lift accept metres (`10.5`) or feet (`33ft`, `33'`, `33' 6"`, phone curly quotes too).
  Feet are converted and rounded to a 0.5 m step; the conversion shows while typing so the rounding is never hidden;
  metres are what is saved. **Elevation and as-built measurements round up** to the next 0.5 m, so the firm never
  quotes less scaffold than it builds (rounding to the nearest could move a 20 m × 10 m elevation by up to about
  7.6 m²). **HAKI tower heights and the bottom lift round to the nearest 0.5 m.** A figure typed in metres is kept
  exactly as typed (adopted default, Keith to confirm). Checks: `node --experimental-strip-types web/lib/measure.check.mjs`.
- **RAMS produced before work starts;** the rule 2 gate is unchanged.
- **RAMS layout:** logo top right then the document name, in a real page header on every page. All templates name the
  logo picture `logo`.

## Monetisation (confirmed by Keith, 29 Oct 2026)
Replaces the spec's Open pricing item (Basic £19.99 / Full £24.99).
- **Basic tier: £35.99 a month per firm, 3 logins included** (enough for an owner, an inspector and an office member).
  Sits just under Graft's £41 entry tier while doing far more.
- **Extra office or inspector logins: £8 a month each** beyond the 3.
- **Gang and charge-hand (gang portal) logins are free and unlimited.** Charging for them would push firms to share
  logins, which breaks rule 8 (one account per person) and makes signatures impossible to attribute. A site inspector on
  a gang login with the competent-inspector flag signs inspections at no charge; that is intended. The gang role sees no
  prices and only its assigned job, so office work can't be moved onto free logins.
- **Billing periods: monthly, plus annual with 2 months free** (annual Basic £359.90).
- **Free trial: 30 days, card taken upfront.** A countdown of the days left shows in the app throughout the trial, with
  a prominent "Cancel subscription" button.
- **When a payment fails and Stripe's retries run out, the firm goes read-only:** every past record (RAMS, inspection
  reports, handover certificates, quotes) stays viewable and exportable, but nothing new can be created. A firm must
  always be able to produce its signed safety paperwork for the HSE or a principal contractor.
- Self-service card changes, plan changes and cancellation go through Stripe's customer portal.
- Tier limits are enforced by the API and the database, never only by hiding buttons.
- **Price floor (30 Oct 2026):** what the first test firm (Keith's brother, a careful spender) will actually pay is
  Keith's bottom estimate of the product's value. Ask for a commitment after the trial ("card in at £35.99, or the price
  you would put your card in at"), not an opinion; the other test firms show how far above the floor the price sits.

### Monetisation, still open
- **Full tier:** its price and what it adds (the client portal is the spec's candidate).
- **Annual price for extra logins** (proposed default: the same 2 months free, £80 a year each).
- **VAT:** whether Ceilte Ltd is VAT-registered, and so whether prices are shown plus VAT.
- **Trial reminder email 7 days before the first charge** (recommended, to avoid disputes and chargebacks): needs
  transactional email (Postmark), not yet built. Until then the in-app countdown covers it.
- **How long read-only data is kept after a firm stops paying** (for example 6 years, in line with how long safety
  records are commonly kept), and how that is told to the firm. Check retention against the HSE's expectations.
- **Firm self sign-up** (create firm and owner login, then Stripe Checkout) and **inviting people** to a firm are both
  still to build; today logins are created by `scripts/hosted_setup.py`.

## Hosting (set up 30 Oct 2026)
- **GitHub:** private repository `craftedbyholmes-droid/putlog`, the backup and Railway's source. Run `git push` after
  every commit.
- **Supabase (hosted):** project `lfoiiktjihhozfctsjcb`, region **West EU (Ireland, eu-west-1)**, not London as the spec
  planned. Fine for testing; state the data location in the privacy policy, and decide before real firms whether to
  move to London. Free plan: no backups and it pauses when idle, so fake data only until Supabase Pro. Public sign-up
  is switched off. Migrations go up with `npx supabase db push` (never `--include-seed`: the seed has demo logins with
  a known password).
- **Database password:** letters and digits only, so the connection address never needs encoding. Railway and the
  setup script connect through the **session pooler** (`aws-0-eu-west-1.pooler.supabase.com`, port 5432); the direct
  address is IPv6-only.
- **Railway:** project `putlog`, two services built from GitHub `main`. **api**: built from the repo root with
  `RAILWAY_DOCKERFILE_PATH=api/Dockerfile`, at https://putlog-production.up.railway.app (`/health` shows `"pdf": true`).
  **web**: root directory `web`, at https://web-production-8238f.up.railway.app. Both use the **legacy** `anon` and
  `service_role` keys (the file storage code sends the key as a bearer token). `WEB_ORIGINS` on api must equal the web
  address exactly (https, no trailing slash), or the browser shows "Failed to fetch". `NEXT_PUBLIC_` settings are baked
  into the website when it is built, so changing one needs a redeploy of web. Check both services run in an EU region.
- **Test firm:** Bear Scaffolding (owner James Holmes, competent inspector and RAMS signer; office login Keith Holmes),
  with fake clients, jobs, staff, vans and rates, created by `scripts/hosted_setup.py` (prompts for every secret, safe
  to rerun, ends by generating a RAMS on Railway and saving the PDF to the Desktop).
- **First Railway PDF (30 Oct 2026):** tables and filled fields correct. The RAMS templates' page numbers are typed as
  ordinary text, so on Railway's fonts they drift into the middle of pages and leave gaps: replace them with real
  page-number footers. Some numbered points in the cleaned template run together on one line (cosmetic, later).

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
- **Local development:** stop the API with Ctrl+C rather than closing its terminal. Closing it can leave a hidden
  worker process holding port 8000 and serving old code; Windows then lets two programs share the port.

## Next (30 Oct 2026)
- Before James's test: real page-number footers in the RAMS templates; the PDF speed-up if Regenerate takes over about
  20 seconds on Railway; check both Railway services are in an EU region; a look on a phone; the allocation board by
  hand (test 12).
- Ask James: why the method statement says the 7-day inspection is "If ordered by customer" (conflicts with rule 1; the
  spec proposes a required choice of who inspects instead).
- After his feedback: the allocation board and an inspections list, then the money slice (invoices, rates, timesheets,
  pay), then stock, documents and reports; the monetisation workflow (sign-up, trial, Stripe, read-only on lapse);
  inviting people to a firm.
- Fold this file into an updated spec document so a new chat starts from one accurate record.

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