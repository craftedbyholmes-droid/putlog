import os, pathlib

ROOT = pathlib.Path(__file__).resolve().parents[2]
DATABASE_URL = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")
SUPABASE_URL = os.environ.get("SUPABASE_URL", "http://127.0.0.1:54321")
SUPABASE_ANON_KEY = os.environ.get("SUPABASE_ANON_KEY", "")
SUPABASE_SERVICE_ROLE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")     # server side only, storage I/O only
STORAGE_BACKEND = os.environ.get("STORAGE_BACKEND", "supabase")                  # "supabase" | "local"
STORAGE_DIR = pathlib.Path(os.environ.get("STORAGE_DIR", ROOT / ".storage"))
TEMPLATES_DIR = pathlib.Path(os.environ.get("TEMPLATES_DIR", ROOT / "templates"))
WEB_ORIGINS = [o.strip() for o in os.environ.get("WEB_ORIGINS", "http://localhost:3000").split(",") if o.strip()]
VAT_STANDARD_RATE = 20   # placeholder until an accountant confirms each job's treatment
