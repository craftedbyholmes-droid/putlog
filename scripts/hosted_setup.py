"""One-off setup of a test firm on the hosted Putlog database: logins, the firm, fake demo data, then a check that
Railway can make a RAMS PDF. Every secret arrives through environment variables set by the PowerShell wrapper;
nothing secret is stored in this file. Safe to run again: logins are reused and demo data is only added once."""
import json, os, sys
import httpx, psycopg

E = os.environ
URL, SR, ANON, DB, API, FIRM, OUT = (E[k] for k in ("PUTLOG_SUPABASE_URL", "PUTLOG_SERVICE_ROLE", "PUTLOG_ANON",
                                                    "PUTLOG_DB", "PUTLOG_API", "PUTLOG_FIRM", "PUTLOG_OUT"))
PEOPLE = json.loads(E["PUTLOG_PEOPLE"])
ADMIN = {"apikey": SR, "Authorization": f"Bearer {SR}"}

def say(t, end="\n"): print("  " + t, end=end, flush=True)

def find_user(email):
    page = 1
    while True:
        r = httpx.get(f"{URL}/auth/v1/admin/users", headers=ADMIN, params={"page": page, "per_page": 200}, timeout=30)
        r.raise_for_status()
        users = r.json().get("users", [])
        for u in users:
            if (u.get("email") or "").lower() == email.lower():
                return u["id"]
        if len(users) < 200:
            return None
        page += 1

def ensure_login(p):
    uid = find_user(p["email"])
    if uid:
        r = httpx.put(f"{URL}/auth/v1/admin/users/{uid}", headers=ADMIN, timeout=30,
                      json={"password": p["password"], "email_confirm": True})
        if r.status_code >= 300: sys.exit(f"Could not update the login for {p['email']}: {r.status_code} {r.text[:300]}")
        say(f"login {p['email']} already existed: password updated")
        return uid
    r = httpx.post(f"{URL}/auth/v1/admin/users", headers=ADMIN, timeout=30,
                   json={"email": p["email"], "password": p["password"], "email_confirm": True})
    if r.status_code >= 300: sys.exit(f"Could not create the login for {p['email']}: {r.status_code} {r.text[:300]}")
    say(f"login {p['email']} created")
    return r.json()["id"]

def demo_data(cur, company):
    def new_id(sql, *a): return cur.execute(sql, a).fetchone()[0]
    def run(sql, *a): cur.execute(sql, a)
    dan = new_id("insert into staff (company_id,name,phone,worker_type,day_rate) values (%s,'Dan Price','07700 900001','employee',150) returning id", company)
    run("insert into staff (company_id,name,phone,worker_type,day_rate) values (%s,'Lee Carter','07700 900002','employee',140)", company)
    run("insert into staff (company_id,name,phone,worker_type,cis_status,day_rate) values (%s,'Mick Shaw','07700 900003','subcontractor','registered',160)", company)
    for reg in ("DEMO VAN 1", "DEMO VAN 2"):
        run("insert into vans (company_id,registration) values (%s,%s)", company, reg)
    for unit, kind, price in (("squareage", "tube_fitting", 3.50), ("meterage", "tube_fitting", 12.00), ("height", "haki_stair_tower", 45.00)):
        run("insert into rate_cards (company_id,unit,scaffold_kind,price) values (%s,%s,%s,%s)", company, unit, kind, price)

    acme = new_id("insert into clients (company_id,name,company_name,address,postcode) values (%s,'Jo Bloggs','Acme & Co Builders','2 Market Place, Aylsham','NR11 6EH') returning id", company)
    patel = new_id("insert into clients (company_id,name,company_name,address,postcode) values (%s,'Sam Patel','Patel Homes Ltd','8 Mundesley Road, North Walsham','NR28 0DA') returning id", company)

    job1 = new_id("""insert into jobs (company_id,client_id,scope,supervisor_staff_id,emergency_contact_name,emergency_contact_phone)
                     values (%s,%s,'Scaffold to front elevation for re-roofing',%s,'Office','01632 960001') returning id""", company, acme, dan)
    site1 = new_id("insert into sites (company_id,job_id,address,postcode) values (%s,%s,'14 Church Street, Cromer','NR27 9ES') returning id", company, job1)
    front = new_id("""insert into scaffolds (company_id,site_id,name,kind,pricing_mode,first_lift_m,planned_start_date,planned_days,planned_crew)
                      values (%s,%s,'Front elevation','tube_fitting','squareage',2.0,'2026-11-09',3,3) returning id""", company, site1)
    run("insert into job_elevations (company_id,scaffold_id,label,quoted_length_m,quoted_height_m) values (%s,%s,'A',10,6),(%s,%s,'B',8,6)",
        company, front, company, front)

    job2 = new_id("""insert into jobs (company_id,client_id,scope,supervisor_staff_id,emergency_contact_name,emergency_contact_phone)
                     values (%s,%s,'HAKI stair tower and rear scaffold for a loft conversion',%s,'Office','01632 960001') returning id""", company, patel, dan)
    site2 = new_id("insert into sites (company_id,job_id,address,postcode) values (%s,%s,'3 Grammar School Road, North Walsham','NR28 9JH') returning id", company, job2)
    tower = new_id("""insert into scaffolds (company_id,site_id,name,kind,pricing_mode,first_lift_m,target_height_m,planned_start_date,planned_days,planned_crew)
                      values (%s,%s,'Stair tower','haki_stair_tower','height',2.0,6.0,'2026-11-12',1,2) returning id""", company, site2)
    rear = new_id("""insert into scaffolds (company_id,site_id,name,kind,pricing_mode,price_items,first_lift_m,planned_start_date,planned_days,planned_crew)
                     values (%s,%s,'Rear elevation','tube_fitting','fixed',%s,2.0,'2026-11-12',2,3) returning id""", company, site2,
                  json.dumps([{"id": "main0001", "description": "Scaffold as quoted", "price": 1250},
                              {"id": "extra001", "description": "Loading bay", "price": 180}]))
    for s in (front, tower, rear):     # unscheduled put-ups: they show in the board's unallocated strip
        run("insert into operations (company_id,scaffold_id,type) values (%s,%s,'put_up')", company, s)
    say("demo data added: 3 staff, 2 vans, 3 rates, 2 clients, 2 jobs, 3 scaffolds")
    return front

def railway_pdf_check(email, password, scaffold):
    r = httpx.post(f"{URL}/auth/v1/token?grant_type=password", headers={"apikey": ANON}, timeout=30,
                   json={"email": email, "password": password})
    if r.status_code != 200: sys.exit(f"Signing in as {email} failed: {r.status_code} {r.text[:300]}")
    h = {"Authorization": f"Bearer {r.json()['access_token']}"}
    say("asking Railway to make the draft RAMS (this can take a minute)... ", end="")
    r = httpx.post(f"{API}/scaffolds/{scaffold}/rams", headers=h, timeout=600)
    if r.status_code != 200:
        print(""); sys.exit(f"RAMS generation on Railway failed: {r.status_code} {r.text[:500]}")
    print("done", flush=True)
    body = r.json()
    pdf = (body.get("files", {}).get("method_statement") or {}).get("pdf")
    if not pdf: sys.exit("The Word file was made but no PDF: LibreOffice on Railway did not convert it.")
    r = httpx.get(f"{API}/files", headers=h, params={"path": pdf}, timeout=120)
    r.raise_for_status()
    with open(OUT, "wb") as fh: fh.write(r.content)
    say(f"PDF saved to {OUT}")
    if body.get("missing"):
        say("still to fill before the RAMS can be signed (expected until the firm details and logo are in): " + ", ".join(body["missing"]))

def main():
    ids = {p["email"]: ensure_login(p) for p in PEOPLE}
    with psycopg.connect(DB, prepare_threshold=None) as c:
        with c.transaction():
            cur = c.cursor()
            row = cur.execute("select id from companies where name = %s order by created_at limit 1", (FIRM,)).fetchone()
            if row:
                company, fresh = row[0], False
                say(f"firm {FIRM} already exists: demo data left as it is")
            else:
                company = cur.execute("insert into companies (name) values (%s) returning id", (FIRM,)).fetchone()[0]
                fresh = True
                say(f"firm {FIRM} created")
            for p in PEOPLE:
                uid = ids[p["email"]]
                cur.execute("""insert into profiles (id,company_id,full_name,position,role,is_competent_inspector,can_sign_rams)
                               values (%s,%s,%s,%s,%s,%s,%s) on conflict (id) do nothing""",
                            (uid, company, p["name"], p["position"], p["role"], p["inspector"], p["signs_rams"]))
                got = cur.execute("select company_id, role from profiles where id = %s", (uid,)).fetchone()
                if got[0] != company:
                    sys.exit(f"{p['email']} already belongs to a different firm. Nothing was changed.")
                say(f"{p['name']} is {got[1]} at {FIRM}")
            front = demo_data(cur, company) if fresh else cur.execute(
                """select s.id from scaffolds s join sites si on si.id = s.site_id join jobs j on j.id = si.job_id
                   where j.company_id = %s and s.name = 'Front elevation' limit 1""", (company,)).fetchone()[0]
    office = next(p for p in PEOPLE if p["role"] == "office")
    railway_pdf_check(office["email"], office["password"], front)

if __name__ == "__main__":
    main()