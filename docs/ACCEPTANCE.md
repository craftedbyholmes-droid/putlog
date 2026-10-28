# Acceptance tests — status at handover of the script (29 Oct 2026)

"Automated" = passes in the test suite. All automated runs so far were on Linux with Python 3.12 and plain Postgres
plus a stand-in for Supabase's auth. The first run on Windows with real Supabase is the real check.

| # | Check | Status |
|---|---|---|
| 1 | Tenant isolation | Automated (database and API). Website: log in as other@putlog.test to see it |
| 2 | Hierarchy | Automated |
| 3 | Status enums | Automated |
| 4 | Quote from elevations (108 m², £378.00) | Automated, through the API |
| 5 | Quoted vs as-built | Automated |
| 6 | Quote PDF (VAT only when registered) | Automated, including PDF output. "Opens on a phone": manual |
| 7 | CSV export | Automated |
| 8 | HAKI worked examples | Automated |
| 9 | HAKI structure | Automated (structure only; quantities await a HAKI-trained reviewer) |
| 10 | HAKI cap (100 ft) | Automated |
| 11 | HAKI pricing modes | Automated |
| 12 | Allocation board | Built; manual check needed (drag, unallocated strip, holiday) |
| 13 | Client on every job | Automated (database); search and create-on-the-spot built in the website |
| 14 | VAT settings | Automated |
| 15 | RAMS pack from the standard template | Automated, through the API, with logo and PDF |
| 16 | Upload your own template | Automated, through the API: upload, preview, activate, used next with version recorded |
| 17 | Bad uploads | Automated |
| 18 | Template sandbox | Automated |
| 19 | Template privacy | Automated (database and API) |
| 20 | Untagged document | Automated on a stand-in document; runs on the two originals once they're in fixtures/private |
| 21 | Handover certificate | Automated, through the API: banner while unsigned, gone once confirmed, required fields listed |
| 22 | Inspection report | Automated, through the API |
| 23 | Lift layout (bottom lift only) | Automated |
| — | Rule 2 gate, gang scoping, per-firm numbering, issued documents locked | Automated |
| — | Demo on a real phone | Manual |
