"""Acceptance tests 1, 2, 3 and 13, plus rule 2 (no erection without paperwork),
rule 10 for gang users, and the database half of test 19 (template privacy)."""
import uuid
from conftest import as_user, as_admin, expect_error, make_firm

TENANT_TABLES = ["clients","staff","vans","jobs","sites","scaffolds","operations","rate_cards",
                 "job_elevations","quotes","quote_lines","compliance_docs","profiles","companies"]

# ---------- test 1: tenant isolation ----------
def test_01_tenant_isolation(cur):
    a = make_firm(cur, "Firm A"); b = make_firm(cur, "Firm B", client_name="Beta Homes", postcode="IP1 1AA")
    as_user(cur, a["user"])
    for t in TENANT_TABLES:
        col = "id" if t == "companies" else "company_id"
        cur.execute(f"select count(*) from public.{t} where {col} = %s", (b["company"],))
        assert cur.fetchone()[0] == 0, f"firm A can read firm B rows in {t}"
    cur.execute("select count(*) from public.jobs"); assert cur.fetchone()[0] == 1
    # writes into firm B are refused, updates and deletes touch nothing
    with expect_error(cur, "row-level security"):
        cur.execute("insert into public.clients (company_id,name) values (%s,'Sneaky')", (b["company"],))
    cur.execute("update public.clients set name='hacked' where company_id=%s", (b["company"],)); assert cur.rowcount == 0
    cur.execute("delete from public.jobs where company_id=%s", (b["company"],)); assert cur.rowcount == 0
    # moving your own row into another firm is refused
    with expect_error(cur, "row-level security"):
        cur.execute("update public.clients set company_id=%s where id=%s", (b["company"], a["client"]))

def test_01b_no_login_sees_nothing(cur):
    make_firm(cur, "Firm A")
    cur.execute("set local role anon")
    with expect_error(cur, "permission denied"):
        cur.execute("select * from public.jobs")

def test_01c_cross_tenant_links_refused(cur):
    a = make_firm(cur, "Firm A"); b = make_firm(cur, "Firm B")
    with expect_error(cur, "foreign key"):
        cur.execute("insert into public.scaffolds (company_id,site_id,name,pricing_mode,first_lift_m) values (%s,%s,'x','squareage',2)",
                    (a["company"], b["site"]))
    with expect_error(cur, "foreign key"):
        cur.execute("insert into public.jobs (company_id,client_id) values (%s,%s)", (a["company"], b["client"]))

# ---------- test 2: hierarchy ----------
def test_02_hierarchy(cur):
    a = make_firm(cur, "Firm A")
    with expect_error(cur, "null value"):
        cur.execute("insert into public.scaffolds (company_id,name,pricing_mode,first_lift_m) values (%s,'x','squareage',2)", (a["company"],))
    with expect_error(cur, "null value"):
        cur.execute("insert into public.sites (company_id,address) values (%s,'x')", (a["company"],))
    with expect_error(cur, "null value"):
        cur.execute("insert into public.operations (company_id,type) values (%s,'put_up')", (a["company"],))
    with expect_error(cur, "foreign key"):
        cur.execute("delete from public.jobs where id=%s", (a["job"],))
    # a job with a site but no scaffold can be deleted
    cur.execute("insert into public.jobs (id,company_id,client_id) values (%s,%s,%s)", (j := uuid.uuid4(), a["company"], a["client"]))
    cur.execute("insert into public.sites (company_id,job_id,address) values (%s,%s,'2 Low Rd')", (a["company"], j))
    cur.execute("delete from public.jobs where id=%s", (j,)); assert cur.rowcount == 1

# ---------- test 3: status enums ----------
def test_03_status_enums(cur):
    a = make_firm(cur, "Firm A")
    with expect_error(cur, "invalid input value for enum"):
        cur.execute("update public.jobs set status='finished' where id=%s", (a["job"],))
    with expect_error(cur, "invalid input value for enum"):
        cur.execute("update public.scaffolds set status='half_up' where id=%s", (a["scaffold"],))
    cur.execute("select enum_range(null::public.job_status)::text, enum_range(null::public.scaffold_status)::text")
    jobs, scaff = cur.fetchone()
    assert jobs == "{enquiry,quoted,accepted,invoiced,paid,closed}"
    assert scaff == "{planned,rams_raised,erecting,on_hire,dismantle_requested,dismantling,dismantled}"

# ---------- test 13: client on every job ----------
def test_13_client_on_every_job(cur):
    a = make_firm(cur, "Firm A", client_name="Acme Builders", postcode="NR28 9AA")
    make_firm(cur, "Firm B", client_name="Acme Rival", postcode="NR28 1ZZ")
    with expect_error(cur, "null value"):
        cur.execute("insert into public.jobs (company_id) values (%s)", (a["company"],))
    as_user(cur, a["user"])
    for q in ("acm", "Bloggs", "nr28", "NR289AA", "builders"):
        cur.execute("select company_name from public.search_clients(%s)", (q,))
        rows = [r[0] for r in cur.fetchall()]
        assert rows == ["Acme Builders"], f"search {q!r} returned {rows}"   # never firm B's client
    # create a client on the spot from the job screen
    cur.execute("insert into public.clients (company_id,name,postcode) values (%s,'New Client','NR1 1AA') returning id", (a["company"],))
    cid = cur.fetchone()[0]
    cur.execute("insert into public.jobs (company_id,client_id) values (%s,%s) returning reference", (a["company"], cid))
    assert cur.fetchone()[0].startswith("JOB0")

# ---------- rule 2: no erection without paperwork ----------
def test_rule2_gate(cur):
    a = make_firm(cur, "Firm A")
    with expect_error(cur, "RULE 2"):
        cur.execute("update public.scaffolds set status='on_hire' where id=%s", (a["scaffold"],))
    with expect_error(cur, "RULE 2"):
        cur.execute("insert into public.operations (company_id,scaffold_id,type,start_date) values (%s,%s,'put_up','2026-11-02')",
                    (a["company"], a["scaffold"]))
    # an unscheduled put-up card is allowed (it sits in the unallocated strip)
    cur.execute("insert into public.operations (company_id,scaffold_id,type) values (%s,%s,'put_up')", (a["company"], a["scaffold"]))
    # RAMS generated but not issued: still refused
    cur.execute("insert into public.compliance_docs (company_id,scaffold_id,type) values (%s,%s,'rams') returning id", (a["company"], a["scaffold"]))
    rams = cur.fetchone()[0]
    cur.execute("update public.scaffolds set status='rams_raised' where id=%s", (a["scaffold"],))
    with expect_error(cur, "RULE 2"):
        cur.execute("update public.scaffolds set status='on_hire' where id=%s", (a["scaffold"],))
    # issued RAMS but no sheet or design: still refused
    cur.execute("update public.compliance_docs set issued_at=now() where id=%s", (rams,))
    with expect_error(cur, "RULE 2"):
        cur.execute("update public.scaffolds set status='on_hire' where id=%s", (a["scaffold"],))
    # add the TG20:21 sheet record: now erection and scheduling are allowed
    cur.execute("insert into public.compliance_docs (company_id,scaffold_id,type,reference) values (%s,%s,'tg20_21','TG-0001') returning id",
                (a["company"], a["scaffold"]))
    cur.execute("insert into public.compliance_sheets (doc_id,company_id,sheet_reference) values (%s,%s,'TG-0001')", (cur.fetchone()[0], a["company"]))
    cur.execute("insert into public.operations (company_id,scaffold_id,type,start_date) values (%s,%s,'put_up','2026-11-02')", (a["company"], a["scaffold"]))
    cur.execute("update public.scaffolds set status='on_hire' where id=%s", (a["scaffold"],)); assert cur.rowcount == 1

def test_rule2_bespoke_design_also_passes(cur):
    a = make_firm(cur, "Firm A")
    cur.execute("insert into public.compliance_docs (company_id,scaffold_id,type,issued_at) values (%s,%s,'rams',now())", (a["company"], a["scaffold"]))
    cur.execute("insert into public.compliance_docs (company_id,scaffold_id,type) values (%s,%s,'bespoke_design')", (a["company"], a["scaffold"]))
    cur.execute("update public.scaffolds set status='on_hire' where id=%s", (a["scaffold"],)); assert cur.rowcount == 1

# ---------- rule 10: gang users ----------
def test_rule10_gang_sees_only_their_operation_and_no_prices(cur):
    a = make_firm(cur, "Firm A")
    cur.execute("insert into public.operations (company_id,scaffold_id,type) values (%s,%s,'adapt') returning id", (a["company"], a["scaffold"]))
    mine = cur.fetchone()[0]
    cur.execute("insert into public.operations (company_id,scaffold_id,type) values (%s,%s,'repair')", (a["company"], a["scaffold"]))
    cur.execute("insert into public.operation_crew (company_id,operation_id,day,staff_id) values (%s,%s,'2026-11-02',%s)", (a["company"], mine, a["staff"]))
    as_user(cur, a["gang_user"])
    cur.execute("select id from public.operations"); assert [r[0] for r in cur.fetchall()] == [mine]
    for t in ("rate_cards","quotes","quote_lines","jobs","clients","staff"):
        cur.execute(f"select count(*) from public.{t}"); assert cur.fetchone()[0] == 0, f"gang user can read {t}"
    with expect_error(cur, "row-level security"):
        cur.execute("insert into public.operations (company_id,scaffold_id,type) values (%s,%s,'strike')", (a["company"], a["scaffold"]))

# ---------- test 19 (database half): template privacy ----------
def test_19_template_privacy(cur):
    a = make_firm(cur, "Firm A"); b = make_firm(cur, "Firm B")
    cur.execute("""insert into public.document_templates (company_id,kind,name,source,file_path,active)
                   values (null,'method_statement','Another default','default','x.docx',true) returning id""")
    default_id = cur.fetchone()[0]
    cur.execute("""insert into public.document_templates (company_id,kind,name,source,file_path) values (%s,'method_statement','B own','uploaded','x.docx')""", (b["company"],))
    as_user(cur, a["user"])
    cur.execute("select name from public.document_templates order by name"); assert [r[0] for r in cur.fetchall()] == ["Another default","Standard handover certificate","Standard inspection report","Standard method statement","Standard quotation","Standard risk assessment"]
    cur.execute("update public.document_templates set name='mine now' where id=%s", (default_id,)); assert cur.rowcount == 0
    cur.execute("delete from public.document_templates where id=%s", (default_id,)); assert cur.rowcount == 0
    with expect_error(cur, "row-level security"):
        cur.execute("""insert into public.document_templates (company_id,kind,name,source,file_path) values (null,'other','fake default','default','y')""")

# ---------- per-firm numbering ----------
def test_numbering_is_per_firm(cur):
    a = make_firm(cur, "Firm A"); b = make_firm(cur, "Firm B")
    cur.execute("select reference from public.jobs where id=%s", (a["job"],)); assert cur.fetchone()[0] == "JOB0001"
    cur.execute("select reference from public.jobs where id=%s", (b["job"],)); assert cur.fetchone()[0] == "JOB0001"
    as_user(cur, a["user"])
    cur.execute("insert into public.quotes (company_id,job_id) values (%s,%s) returning number", (a["company"], a["job"]))
    assert cur.fetchone()[0] == "Q0001"
    cur.execute("insert into public.quotes (company_id,job_id) values (%s,%s) returning number", (a["company"], a["job"]))
    assert cur.fetchone()[0] == "Q0002"

# ---------- rule 7: issued documents are immutable ----------
def test_issued_documents_are_immutable(cur):
    a = make_firm(cur, "Firm A")
    cur.execute("insert into public.compliance_docs (company_id,scaffold_id,type,pdf_path) values (%s,%s,'rams','v1.pdf') returning id", (a["company"], a["scaffold"]))
    d = cur.fetchone()[0]
    cur.execute("update public.compliance_docs set pdf_path='v1b.pdf' where id=%s", (d,))          # drafts can change
    cur.execute("update public.compliance_docs set issued_at=now() where id=%s", (d,))
    with expect_error(cur, "cannot be changed"):
        cur.execute("update public.compliance_docs set pdf_path='v2.pdf' where id=%s", (d,))

# ---------- test 5 (database half): as-built never changes the quoted figure ----------
def test_05_asbuilt_does_not_change_quoted(cur):
    a = make_firm(cur, "Firm A")
    cur.execute("""insert into public.job_elevations (company_id,scaffold_id,quoted_length_m,quoted_height_m)
                   values (%s,%s,10,6) returning id, quoted_area_m2""", (a["company"], a["scaffold"]))
    eid, area = cur.fetchone(); assert float(area) == 60.0
    cur.execute("update public.job_elevations set asbuilt_length_m=12, asbuilt_height_m=6 where id=%s returning quoted_area_m2, asbuilt_area_m2", (eid,))
    q, ab = cur.fetchone(); assert float(q) == 60.0 and float(ab) == 72.0
