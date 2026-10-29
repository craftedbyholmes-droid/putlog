"""Saved signatures and signing PINs: the signature in the document, who may sign, PIN checks and lockout."""
import io, uuid, zipfile, pytest, psycopg
from docx import Document
from PIL import Image
from app import config, documents as D
from conftest import FIRM, JOB
from test_api_flow import db_up, seed, client_for, ready_to_sign, sig_png, PIN

needs_db = pytest.mark.skipif(not db_up(), reason="no database: run `supabase start` (or set DATABASE_URL)")

def _xml(docx):
    z = zipfile.ZipFile(io.BytesIO(docx))
    return "".join(z.read(n).decode("utf8", "ignore") for n in z.namelist() if n.startswith("word/") and n.endswith(".xml"))

def test_signature_goes_into_the_signature_box(std):
    plain = _xml(D.render(std("Method_Statement"), {**FIRM, **JOB}))
    signed = _xml(D.render(std("Method_Statement"), {**FIRM, **JOB}, None, images={"prepared_by_signature": D.clean_signature(sig_png())}))
    assert signed.count("<w:drawing") > plain.count("<w:drawing")
    assert "&lt;w:drawing" not in signed and "w:drawing&gt;" not in signed     # inserted as a picture, never as escaped text

def test_photo_of_a_signature_is_trimmed_and_blank_refused():
    im = Image.open(io.BytesIO(D.clean_signature(sig_png())))
    assert im.mode == "RGBA" and im.getpixel((0, 0))[3] == 0 and im.width < 400       # paper made see-through, edges trimmed
    blank = io.BytesIO(); Image.new("RGB", (300, 100), "white").save(blank, "PNG")
    with pytest.raises(ValueError): D.clean_signature(blank.getvalue())
    with pytest.raises(ValueError): D.clean_signature(b"not a picture")

def test_signature_block_names_the_signer():
    d = Document(); d.add_paragraph("Site-specific method"); b = io.BytesIO(); d.save(b)
    out = D.add_signature_block(b.getvalue(), D.clean_signature(sig_png()), ["Signed by Keith, Owner", "on 29/10/2026 at 14:32 (UK time)."])
    t = D.text_of(out)
    assert "Signed electronically" in t and "Signed by Keith, Owner" in t and "<w:drawing" in _xml(out)

def _office(ids):
    office = uuid.uuid4()
    with psycopg.connect(config.DATABASE_URL, autocommit=True) as c:
        c.execute("insert into auth.users (id,email) values (%s,%s)", (office, f"{office}@test.invalid"))
        c.execute("insert into profiles (id,company_id,full_name,position,role) values (%s,%s,'Sarah','Office manager','office')", (office, ids["company"]))
    return office

@needs_db
def test_five_wrong_pins_lock_signing():
    ids = seed(); api = client_for(ids["owner"]); ready_to_sign(api); url = f"/scaffolds/{ids['scaffold']}/rams/issue"
    for _ in range(4):
        assert api.post(url, json={"pin": "0000"}).status_code == 403
    assert api.post(url, json={"pin": "0000"}).status_code == 429
    assert api.post(url, json={"pin": PIN}).status_code == 429          # locked even with the right PIN

@needs_db
def test_only_the_owner_or_people_they_tick_can_sign_a_rams():
    ids = seed(); office = _office(ids); oapi = client_for(office); ready_to_sign(oapi); url = f"/scaffolds/{ids['scaffold']}/rams/issue"
    r = oapi.post(url, json={"pin": PIN}); assert r.status_code == 403 and "People who sign" in r.json()["detail"]
    with psycopg.connect(config.DATABASE_URL, autocommit=True) as c:
        c.execute("update profiles set can_sign_rams = true where id = %s", (office,))
    r = oapi.post(url, json={"pin": PIN}); assert r.status_code == 409 and "Generate" in r.json()["detail"]   # allowed now; just no pack yet

@needs_db
def test_pin_rules_owner_reset_and_the_pin_store_is_unreachable():
    ids = seed(); api = client_for(ids["owner"]); ready_to_sign(api)
    assert api.post("/me/signing-pin", json={"pin": "12"}).status_code == 422
    assert api.post("/me/signing-pin", json={"pin": "1357"}).status_code == 403                  # changing needs the current PIN
    assert api.post("/me/signing-pin", json={"pin": "1357", "current_pin": PIN}).status_code == 200
    st = api.get("/me/signing").json(); assert st["has_pin"] and st["has_signature"] and st["can_sign_rams"] and st["is_inspector"]
    office = _office(ids)
    oapi = client_for(office)
    assert oapi.post(f"/people/{ids['owner']}/reset-signing-pin").status_code == 403
    api = client_for(ids["owner"])
    assert api.post(f"/people/{office}/reset-signing-pin").status_code == 200
    assert api.post(f"/people/{ids['owner']}/reset-signing-pin").status_code == 200
    assert api.get("/me/signing").json()["has_pin"] is False
    from app.db import as_user
    with pytest.raises(psycopg.Error):
        with as_user(ids["owner"]) as cur:
            cur.execute("select * from private.signing_pins")
