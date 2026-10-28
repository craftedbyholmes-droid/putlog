"""End-to-end through the API against a real database: the RAMS → erect → handover → inspection flow,
quotes, own templates and logo. Skipped when no database is reachable.
Covers tests 4, 6, 7, 14, 15, 16, 19 and 21 through the app, and rule 2 as the user sees it."""
import os, io, tempfile, uuid, csv, pytest
os.environ.setdefault("STORAGE_BACKEND", "local")
os.environ.setdefault("STORAGE_DIR", tempfile.mkdtemp(prefix="putlog-store-"))
import psycopg
from docx import Document
from fastapi.testclient import TestClient
from app import config, documents as D
from app.main import app
from app.auth import current_user
from app.fields import INSPECTION_CHECKLIST

def db_up():
    try:
        psycopg.connect(config.DATABASE_URL, connect_timeout=2).close(); return True
    except Exception:
        return False
pytestmark = pytest.mark.skipif(not db_up(), reason="no database: run `supabase start` (or set DATABASE_URL)")

def seed(vat=False):
    ids = {k: uuid.uuid4() for k in ("company", "owner", "client", "job", "site", "scaffold", "staff")}
    with psycopg.connect(config.DATABASE_URL, autocommit=True) as c:
        x = c.execute
        x("insert into companies (id,name,address,phone,email,vat_registered,vat_number) values (%s,%s,'Unit 4, Yarmouth Road, North Walsham','01692 000000','office@example.invalid',%s,%s)",
          (ids["company"], f"Smith & Sons {ids['company'].hex[:4]}", vat, "GB123456789" if vat else None))
        x("insert into auth.users (id,email) values (%s,%s)", (ids["owner"], f"{ids['owner']}@test.invalid"))
        x("insert into profiles (id,company_id,full_name,position,role,is_competent_inspector) values (%s,%s,'Keith','Owner','owner',true)", (ids["owner"], ids["company"]))
        x("insert into staff (id,company_id,name,phone,worker_type,day_rate) values (%s,%s,'Dan Price','07700 900001','employee',150)", (ids["staff"], ids["company"]))
        x("insert into clients (id,company_id,name,company_name,address,postcode) values (%s,%s,'Jo Bloggs','Acme & Co Builders','2 Market Place, Aylsham','NR11 6EH')", (ids["client"], ids["company"]))
        x("insert into jobs (id,company_id,client_id,supervisor_staff_id,emergency_contact_name,emergency_contact_phone) values (%s,%s,%s,%s,'Office','01692 000000')",
          (ids["job"], ids["company"], ids["client"], ids["staff"]))
        x("insert into sites (id,company_id,job_id,address,postcode) values (%s,%s,%s,'14 Church Street, Cromer','NR27 9ES')", (ids["site"], ids["company"], ids["job"]))
        x("insert into scaffolds (id,company_id,site_id,name,pricing_mode,first_lift_m,planned_start_date,planned_days) values (%s,%s,%s,'Front elevation','squareage',2.0,'2026-11-02',3)", (ids["scaffold"], ids["company"], ids["site"]))
        x("insert into job_elevations (company_id,scaffold_id,label,quoted_length_m,quoted_height_m) values (%s,%s,'A',10,6),(%s,%s,'B',8,6)",
          (ids["company"], ids["scaffold"], ids["company"], ids["scaffold"]))
        x("insert into rate_cards (company_id,unit,scaffold_kind,price) values (%s,'squareage','tube_fitting',3.50)", (ids["company"],))
        op = x("insert into operations (company_id,scaffold_id,type) values (%s,%s,'put_up') returning id", (ids["company"], ids["scaffold"])).fetchone()[0]
        x("insert into operation_crew (company_id,operation_id,day,staff_id) values (%s,%s,'2026-11-02',%s)", (ids["company"], op, ids["staff"]))
        ids["op"] = op
    return ids

def client_for(user_id):
    app.dependency_overrides[current_user] = lambda: str(user_id)
    return TestClient(app)

def logo_bytes():
    from PIL import Image
    b = io.BytesIO(); Image.new("RGB", (400, 120), (20, 60, 120)).save(b, "JPEG"); return b.getvalue()

def test_quote_flow_vat_off_and_on():
    for vat, total in ((False, "378.00"), (True, "453.60")):
        ids = seed(vat); api = client_for(ids["owner"])
        r = api.post(f"/jobs/{ids['job']}/quotes"); assert r.status_code == 200, r.text
        q = r.json(); assert q["subtotal"] == "378.00" and q["total"] == total and q["number"] == "Q0001"
        rows = list(csv.DictReader(io.StringIO(api.get(f"/quotes/{q['quote_id']}/csv").content.decode("utf-8-sig"))))
        assert len(rows) == 1 and sum(float(r["Gross"]) for r in rows) == float(total)
        docx = api.get(f"/quotes/{q['quote_id']}/docx").content
        text = D.text_of(docx)
        assert "Q0001" in text and "Acme & Co Builders" in text and f"£{total}" in text and ("GB123456789" in text) == vat
        if D.soffice_path():
            assert api.get(f"/quotes/{q['quote_id']}/pdf").content[:4] == b"%PDF"

def test_full_scaffold_flow():
    ids = seed(); api = client_for(ids["owner"]); sid = ids["scaffold"]
    assert api.post("/company/logo", files={"file": ("logo.jpg", logo_bytes(), "image/jpeg")}).status_code == 200
    # rule 2: cannot erect yet
    r = api.post(f"/scaffolds/{sid}/confirm-erected", json={}); assert r.status_code == 409 and "RAMS" in r.json()["detail"]
    # record the TG20:21 sheet, generate RAMS (test 15)
    assert api.post(f"/scaffolds/{sid}/sheet", json={"type": "tg20_21", "sheet_reference": "TG-2026-0042",
                    "scaffold_type": "Tied independent tube and fitting", "load_class": "Class 2", "max_leg_load_kn": 12.5}).status_code == 200
    rams = api.post(f"/scaffolds/{sid}/rams").json()
    assert rams["missing"] == [], rams["missing"]
    for kind in ("method_statement", "risk_assessment"):
        docx = api.get("/files", params={"path": rams["files"][kind]["docx"]}).content
        text = D.text_of(docx)
        assert "Acme & Co Builders" in text and "NASC TG20:21" in text and "{{" not in text
        assert ("TG-2026-0042" in text) == (kind == "method_statement")      # only the method statement carries the design number
        if D.soffice_path(): assert api.get("/files", params={"path": rams["files"][kind]["pdf"]}).content[:4] == b"%PDF"
    assert api.post(f"/scaffolds/{sid}/rams/issue").json()["issued"]
    # erect: handover created unsigned with the banner (test 21)
    h = api.post(f"/scaffolds/{sid}/confirm-erected", json={"permitted_use": "Access and light duty", "max_loaded_platforms": "1 + 1 at 50%",
                 "inspecting_party": "us", "inspection_responsible_name": "Dan Price", "inspection_responsible_phone": "07700 900001"}).json()
    assert h["certificate_ref"] == "HC0001" and h["missing"] == [], h
    unsigned = D.text_of(api.get("/files", params={"path": h["files"]["handover"]["docx"]}).content)
    assert D.BANNER in unsigned.upper() and "Class 2" in unsigned
    # only with a note of how the client confirmed
    assert api.post(f"/handovers/{h['doc_id']}/mark-signed", json={"name": "Jo Bloggs"}).status_code == 422
    s = api.post(f"/handovers/{h['doc_id']}/mark-signed", json={"name": "Jo Bloggs", "role": "Site manager", "company": "Acme",
                 "evidence_note": "Email from Jo Bloggs 02/11/2026 16:40", "channel": "email"}).json()
    signed = D.text_of(api.get("/files", params={"path": s["files"]["handover"]["docx"]}).content)
    assert D.BANNER not in signed.upper() and "not a signature" in signed
    # inspection report (test 22 through the app)
    i = api.post(f"/scaffolds/{sid}/inspections", json={"inspection_type": "7-day", "inspected_at": "2026-11-09T08:30", "weather": "Dry",
                 "outcome": "Safe to use", "tag_updated": True, "next_inspection_due": "2026-11-16", "copies_sent_to": "Office; client",
                 "checklist": [{"item": x, "result": "yes"} for x in INSPECTION_CHECKLIST], "defects": []}).json()
    assert i["report_ref"] == "IR0001" and i["missing"] == []
    rep = D.text_of(api.get("/files", params={"path": i["files"]["inspection"]["docx"]}).content)
    assert "2 Market Place, Aylsham" in rep and "no matter" in rep.lower()

def test_own_template_used_and_private():
    a = seed(); b = seed(); api = client_for(a["owner"])
    d = Document(); [d.add_paragraph(t) for t in ("OUR METHOD STATEMENT", "Client: {{ client_name }}", "Site: {{ site_address }}",
                                                   "Date: {{ date }}", "Area: {{ work_area }}", "By: {{ prepared_by_name }}")]
    buf = io.BytesIO(); d.save(buf)
    t = api.post("/templates", data={"kind": "method_statement"}, files={"file": ("ours.docx", buf.getvalue(), "application/octet-stream")}).json()
    assert t["version"] == 1
    assert api.get(f"/templates/{t['template_id']}/preview").status_code == 200
    assert api.post(f"/templates/{t['template_id']}/activate").json()["active"]
    api.post(f"/scaffolds/{a['scaffold']}/sheet", json={"type": "tg20_21", "sheet_reference": "TG-1"})
    rams = api.post(f"/scaffolds/{a['scaffold']}/rams").json()
    assert rams["templates"][0]["template_id"] == t["template_id"] and rams["templates"][0]["version"] == 1
    assert "OUR METHOD STATEMENT" in D.text_of(api.get("/files", params={"path": rams["files"]["method_statement"]["docx"]}).content)
    # test 19: firm B cannot preview, activate or download firm A's template or files
    other = client_for(b["owner"])
    assert other.get(f"/templates/{t['template_id']}/preview").status_code == 404
    assert other.post(f"/templates/{t['template_id']}/activate").status_code == 404
    assert other.get("/files", params={"path": rams["files"]["method_statement"]["docx"]}).status_code == 404

def test_bad_upload_rejected_with_reason():
    a = seed(); api = client_for(a["owner"])
    d = Document(); d.add_paragraph("{{ client_name.__class__ }}"); buf = io.BytesIO(); d.save(buf)
    r = api.post("/templates", data={"kind": "other"}, files={"file": ("x.docx", buf.getvalue(), "application/octet-stream")})
    assert r.status_code == 422 and "not allowed" in str(r.json())
