import os, json, uuid, contextlib
import psycopg, pytest

DB = os.environ.get("DATABASE_URL", "postgresql://postgres:postgres@127.0.0.1:54322/postgres")

@pytest.fixture
def cur():
    """One transaction per test, always rolled back, so tests never leave data behind."""
    with psycopg.connect(DB, autocommit=False) as conn:
        with conn.cursor() as c:
            yield c
        conn.rollback()

def as_user(cur, user_id):
    cur.execute("set local role authenticated")
    cur.execute("select set_config('request.jwt.claims', %s, true)", (json.dumps({"sub": str(user_id), "role": "authenticated"}),))

def as_admin(cur):
    cur.execute("reset role")
    cur.execute("select set_config('request.jwt.claims', '', true)")

@contextlib.contextmanager
def expect_error(cur, *fragments):
    sp = "sp_" + uuid.uuid4().hex[:8]
    cur.execute(f"savepoint {sp}")
    try:
        yield
    except psycopg.Error as e:
        cur.execute(f"rollback to savepoint {sp}")
        msg = str(e)
        assert all(f.lower() in msg.lower() for f in fragments), f"wrong error: {msg}"
        return
    raise AssertionError("expected the database to refuse this, but it was accepted")

def make_firm(cur, name, client_name="Acme Builders", postcode="NR28 9AA", role="owner"):
    """Creates a firm with an owner login, a client, a job, a site and a scaffold. Runs as admin."""
    ids = {k: uuid.uuid4() for k in ("company","user","client","job","site","scaffold","gang_user","staff","van")}
    cur.execute("insert into public.companies (id,name) values (%s,%s)", (ids["company"], name))
    for uid, r, n in ((ids["user"], role, f"{name} owner"), (ids["gang_user"], "gang", f"{name} charge hand")):
        cur.execute("insert into auth.users (id,email) values (%s,%s)", (uid, f"{uid}@test.invalid"))
        cur.execute("insert into public.profiles (id,company_id,full_name,role) values (%s,%s,%s,%s)", (uid, ids["company"], n, r))
    cur.execute("insert into public.staff (id,company_id,profile_id,name,worker_type,day_rate) values (%s,%s,%s,'Gang member','employee',150)",
                (ids["staff"], ids["company"], ids["gang_user"]))
    cur.execute("insert into public.vans (id,company_id,registration) values (%s,%s,'AB12 CDE')", (ids["van"], ids["company"]))
    cur.execute("insert into public.clients (id,company_id,name,company_name,postcode) values (%s,%s,'Jo Bloggs',%s,%s)",
                (ids["client"], ids["company"], client_name, postcode))
    cur.execute("insert into public.jobs (id,company_id,client_id) values (%s,%s,%s)", (ids["job"], ids["company"], ids["client"]))
    cur.execute("insert into public.sites (id,company_id,job_id,address) values (%s,%s,%s,'1 High St')", (ids["site"], ids["company"], ids["job"]))
    cur.execute("""insert into public.scaffolds (id,company_id,site_id,name,pricing_mode,first_lift_m)
                   values (%s,%s,%s,'Front elevation','squareage',2.0)""", (ids["scaffold"], ids["company"], ids["site"]))
    cur.execute("insert into public.rate_cards (company_id,unit,scaffold_kind,price) values (%s,'squareage','tube_fitting',3.50)", (ids["company"],))
    return ids
