# Putlog — first test build

Scaffolding jobs, quotes and compliance for small UK firms. Next.js website, FastAPI backend, Supabase database
with row-level security, Word templates filled with docxtpl and turned into PDFs by LibreOffice.

## 1. Install once (Windows)
You need: **Python 3.14**, **Node 22**, **Docker Desktop** (running), **Supabase CLI**, **Git**.
`python bootstrap.py` checked these and told you what was missing.
- Supabase CLI: `npm install -g supabase` (or `scoop install supabase`)
- LibreOffice (for PDFs on your own machine): https://www.libreoffice.org — without it you still get Word files, and PDFs work on the server.

## 2. Start the database (folder: putlog)
```
supabase init            # say No to the VS Code / IntelliJ questions; it only adds supabase/config.toml
supabase start           # first run downloads Docker images; takes a few minutes
supabase db reset        # applies the migrations and loads the demo data
supabase status          # shows the API URL, anon key and service_role key
```

## 3. Run the backend (second terminal, folder: putlog\api)
```
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
copy ..\.env.example .env      # then paste the keys from `supabase status` into .env
uvicorn app.main:app --reload --env-file .env
```
Check http://127.0.0.1:8000/health shows `"ok": true`. `"pdf": false` means LibreOffice isn't installed on this PC.

## 4. Run the website (third terminal, folder: putlog\web)
```
npm install
copy .env.example .env.local   # paste the anon key from `supabase status`
npm run dev
```
Open http://localhost:3000 and sign in as **owner@putlog.test**, password **putlog-demo**.
Also: office@putlog.test (office role), other@putlog.test (a second firm: it sees none of the first firm's data).
On your phone (same Wi-Fi): http://YOUR-PC-IP:3000, after adding `WEB_ORIGINS=http://YOUR-PC-IP:3000` to api\.env and
setting `NEXT_PUBLIC_API_URL=http://YOUR-PC-IP:8000` in web\.env.local.

First thing to do: Settings → upload a logo. Documents can't be issued without one.

## 5. Tests
```
cd api;  pytest -q            # calculators, quotes, documents, uploads, and the full RAMS → handover → inspection flow
cd ..;   pytest db_tests -q   # tenant isolation, hierarchy, statuses, rule 2, gang scoping, numbering, immutability
```
Both use the local Supabase database by default and roll back or use fresh firms, so they never touch real data.
Never point DATABASE_URL at a project holding real firms' data while testing.
Put the two original RAMS files in `fixtures/private/` (git-ignored) to run test 20 on them.

## 6. Deploy (when ready for testers)
- Supabase: create a London-region project, then `supabase link --project-ref <ref>` and `supabase db push`.
  Do not run seed.sql there; create real logins in the dashboard. Move to Pro before any real firm's data goes in.
- Railway, service 1 (API): repo root, Dockerfile path `api/Dockerfile`. Variables: as in .env.example, with
  the hosted Supabase values and `WEB_ORIGINS` set to the website's address. Use the Supabase *session pooler* connection string.
- Railway, service 2 (website): root `web`, Dockerfile `web/Dockerfile`. Variables: the three `NEXT_PUBLIC_` values.
- Regenerate database types after schema changes: `npm run types` (in web).

## Layout
- `supabase/migrations` schema, rules and row-level security · `supabase/seed.sql` demo data
- `api/app` calculators, quotes, documents, template checks · `api/tests`
- `web/app` pages · `web/components` shared UI
- `templates/standard` the five standard Word templates (cleaned; the originals never go in the repo)
- `docs/DECISIONS.md` what changed since the spec · `docs/ACCEPTANCE.md` test status
