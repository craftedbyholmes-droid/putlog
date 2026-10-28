"""Every request runs as the signed-in user, inside one transaction, with row-level security in force.
The service-role key is never used for data; it only moves files in private storage."""
import json
from contextlib import contextmanager
import psycopg
from psycopg.rows import dict_row
from . import config

@contextmanager
def as_user(user_id: str):
    with psycopg.connect(config.DATABASE_URL, prepare_threshold=None, row_factory=dict_row) as conn:
        with conn.transaction():
            with conn.cursor() as cur:
                cur.execute("set local role authenticated")
                cur.execute("select set_config('request.jwt.claims', %s, true)",
                            (json.dumps({"sub": str(user_id), "role": "authenticated"}),))
                yield cur

def one(cur, sql, *args):
    cur.execute(sql, args); return cur.fetchone()

def all_(cur, sql, *args):
    cur.execute(sql, args); return cur.fetchall()
