"""Private file storage. Paths always start with the firm's id; callers check that against the
signed-in user's firm (read through RLS) before any read or write."""
import httpx
from . import config

def put(bucket: str, path: str, data: bytes, content_type: str) -> str:
    if config.STORAGE_BACKEND == "local":
        p = config.STORAGE_DIR / bucket / path; p.parent.mkdir(parents=True, exist_ok=True); p.write_bytes(data)
        return path
    r = httpx.post(f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{path}", content=data, timeout=60,
                   headers={"Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}",
                            "apikey": config.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": content_type, "x-upsert": "true"})
    r.raise_for_status(); return path

def get(bucket: str, path: str) -> bytes:
    if config.STORAGE_BACKEND == "local":
        return (config.STORAGE_DIR / bucket / path).read_bytes()
    r = httpx.get(f"{config.SUPABASE_URL}/storage/v1/object/{bucket}/{path}", timeout=60,
                  headers={"Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}", "apikey": config.SUPABASE_SERVICE_ROLE_KEY})
    r.raise_for_status(); return r.content

BUCKETS = ("logos", "documents", "templates", "signatures")

def ensure_buckets():
    """Creates the private buckets on first start if they don't exist yet (hosted or local Supabase)."""
    if config.STORAGE_BACKEND == "local" or not config.SUPABASE_SERVICE_ROLE_KEY:
        return
    h = {"Authorization": f"Bearer {config.SUPABASE_SERVICE_ROLE_KEY}", "apikey": config.SUPABASE_SERVICE_ROLE_KEY}
    existing = {b["id"] for b in httpx.get(f"{config.SUPABASE_URL}/storage/v1/bucket", headers=h, timeout=15).json()}
    for b in BUCKETS:
        if b not in existing:
            httpx.post(f"{config.SUPABASE_URL}/storage/v1/bucket", headers=h, json={"id": b, "name": b, "public": False}, timeout=15).raise_for_status()
