"""Checks the Supabase login token on every request. Works with both local and hosted Supabase
because it asks Supabase Auth itself rather than verifying keys locally."""
import hashlib, time
import httpx
from fastapi import Header, HTTPException
from . import config

_cache: dict[str, tuple[float, str]] = {}

def current_user(authorization: str = Header(default="")) -> str:
    if not authorization.lower().startswith("bearer "):
        raise HTTPException(401, "Sign in first.")
    token = authorization[7:]
    key = hashlib.sha256(token.encode()).hexdigest()
    hit = _cache.get(key)
    if hit and hit[0] > time.time():
        return hit[1]
    r = httpx.get(f"{config.SUPABASE_URL}/auth/v1/user", timeout=10,
                  headers={"Authorization": f"Bearer {token}", "apikey": config.SUPABASE_ANON_KEY})
    if r.status_code != 200:
        raise HTTPException(401, "Your session has expired. Sign in again.")
    uid = r.json()["id"]
    _cache[key] = (time.time() + 60, uid)
    return uid
