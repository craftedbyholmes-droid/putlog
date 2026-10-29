"""What the buttons do. Every function takes a cursor that is already running as the signed-in user,
so row-level security decides what each query can see or change."""
import datetime as dt, json, uuid
from decimal import Decimal
from fastapi import HTTPException
from . import config, documents as D, quotes as Q, storage, template_checks as T, haki
from .db import one, all_
from .fields import APPROVED, INSPECTION_CHECKLIST

RAMS_KINDS = ("method_statement", "risk_assessment")
DRAWING_TO_FOLLOW = "To follow"
SHEET_STANDARD = {"tg20_21": "NASC TG20:21", "tg30": "NASC TG30", "bespoke_design": "Bespoke design"}
EXPECTED_STANDARD = {"tube_fitting": "NASC TG20:21", "haki_stair_tower": "NASC TG30"}   # until a sheet is recorded

def d(x):
    if x is None: return ""
    if isinstance(x, dt.datetime): return x.strftime("%d/%m/%Y %H:%M")
    if isinstance(x, dt.date): return x.strftime("%d/%m/%Y")
    return str(x)

def me(cur):
    row = one(cur, """select p.id, p.full_name, p.position, p.role, p.company_id, c.name as firm_name, c.address, c.phone,
                             c.email, c.logo_path, c.vat_registered, c.vat_number, c.working_days_a, c.working_hours_a,
                             c.working_days_b, c.working_hours_b
                        from profiles p join companies c on c.id = p.company_id where p.id = auth.uid()""")
    if not row: raise HTTPException(403, "Your login is not linked to a firm.")
    return row

def firm_ctx(m):
    return {"firm_name": m["firm_name"], "firm_address": m["address"], "firm_phone": m["phone"], "firm_email": m["email"]}

def logo_png(m):
    return storage.get("logos", m["logo_path"]) if m["logo_path"] else None

def template(cur, m, kind):
    row = one(cur, """select * from document_templates where company_id = %s and kind = %s and active
                      order by version desc limit 1""", m["company_id"], kind)
    if row:
        return row, storage.get("templates", row["file_path"])
    row = one(cur, "select * from document_templates where company_id is null and kind = %s and active limit 1", kind)
    return row, (config.TEMPLATES_DIR / row["file_path"]).read_bytes()

def store_doc(m, scaffold_id, name, docx):
    base = f"{m['company_id']}/scaffolds/{scaffold_id}/{name}"
    storage.put("documents", base + ".docx", docx, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    pdf = D.to_pdf(docx)
    if pdf: storage.put("documents", base + ".pdf", pdf, "application/pdf")
    return {"docx": base + ".docx", "pdf": base + ".pdf" if pdf else None}

# ---------- context for a scaffold's documents ----------
def scaffold_ctx(cur, m, scaffold_id):
    s = one(cur, """select s.*, si.address as site_address, si.postcode as site_postcode, j.id as job_id, j.reference,
                           j.supervisor_staff_id, j.emergency_contact_name, j.emergency_contact_phone,
                           cl.name as client_contact, cl.company_name as client_company, cl.address as client_address
                      from scaffolds s join sites si on si.id = s.site_id join jobs j on j.id = si.job_id
                      join clients cl on cl.id = j.client_id where s.id = %s""", scaffold_id)
    if not s: raise HTTPException(404, "Scaffold not found.")
    sheet = one(cur, """select d.type, d.reference, cs.*, bd.drawing_ref from compliance_docs d
                        left join compliance_sheets cs on cs.doc_id = d.id left join bespoke_designs bd on bd.doc_id = d.id
                        where d.scaffold_id = %s and d.type in ('tg20_21','tg30','bespoke_design')
                        order by d.created_at desc limit 1""", scaffold_id)
    sup = one(cur, "select name, phone from staff where id = %s", s["supervisor_staff_id"]) if s["supervisor_staff_id"] else None
    put_up = one(cur, """select o.start_date, o.end_date, (select count(distinct staff_id) from operation_crew c where c.operation_id = o.id) as crew
                         from operations o where o.scaffold_id = %s and o.type = 'put_up' order by o.start_date nulls last limit 1""", scaffold_id)
    quote = one(cur, "select number from quotes where job_id = %s order by number desc limit 1", s["job_id"])
    # Until a drawing ref is recorded the RAMS says "To follow" and names the standard the scaffold type implies.
    # Rule 2 is unaffected: it still needs a recorded sheet or bespoke design before scheduling or erection.
    standard = SHEET_STANDARD.get(sheet["type"]) if sheet else EXPECTED_STANDARD.get(s["kind"], "")
    drawing = (sheet["sheet_reference"] or sheet["drawing_ref"] or sheet["reference"]) if sheet else DRAWING_TO_FOLLOW
    start = (put_up["start_date"] if put_up and put_up["start_date"] else None) or s["planned_start_date"]
    days = (put_up["end_date"] - put_up["start_date"]).days + 1 if put_up and put_up["start_date"] and put_up["end_date"] else s["planned_days"]
    # the crew on the board once the put-up is scheduled; before that, the planned crew size (rule 2 blocks the board)
    crew = put_up["crew"] if put_up and put_up["crew"] else s.get("planned_crew")
    client = s["client_company"] or s["client_contact"]
    ctx = {**firm_ctx(m),
           "client_name": client, "client_address": s["client_address"] or "",
           "site_address": s["site_address"] + (f", {s['site_postcode']}" if s["site_postcode"] else ""),
           "work_area": s["name"], "scaffold_ref": s["name"], "quote_reference": quote["number"] if quote else s["reference"],
           "item_no": s["item_no"], "design_no": drawing,
           "compliance_standard": standard, "date": d(dt.date.today()),
           "date_of_erection": d(start), "start_date": d(start),
           "duration": f"{days} day{'s' if days != 1 else ''}" if days else "",
           "supervisor_name": sup["name"] if sup else "", "supervisor_phone": sup["phone"] if sup else "",
           "emergency_contact_name": s["emergency_contact_name"] or "", "emergency_contact_phone": s["emergency_contact_phone"] or "",
           "working_days_a": m["working_days_a"], "working_hours_a": m["working_hours_a"],
           "working_days_b": m["working_days_b"], "working_hours_b": m["working_hours_b"],
           "manpower": str(crew) if crew else "",
           "prepared_by_name": m["full_name"], "prepared_by_signature": "",
           "scaffold_type": (sheet["scaffold_type"] if sheet and sheet.get("scaffold_type") else ""),
           "loading_class": sheet["load_class"] if sheet and sheet.get("load_class") else "",
           "max_leg_load_kn": d(sheet["max_leg_load_kn"]) if sheet and sheet.get("max_leg_load_kn") else "",
           "add_ons_permitted": sheet["add_ons_permitted"] if sheet and sheet.get("add_ons_permitted") else "",
           "restrictions": sheet["restrictions_text"] if sheet and sheet.get("restrictions_text") else ""}
    return s, ctx

# ---------- RAMS ----------
def rams_missing(ctx, has_logo: bool) -> list[str]:
    """Checked against the job and scaffold records, even for parts edited by hand, so the record and the paper agree."""
    missing = set()
    for kind in RAMS_KINDS:
        missing.update(D.missing_required(kind, ctx, logo_present=has_logo))
    return sorted(missing)

def generate_rams(cur, scaffold_id, discard: str | None = None):
    """Builds or refreshes the draft RAMS pack. On an existing draft, a part edited by hand is kept as written unless
    that part is being discarded; every other part is filled fresh from the firm's template. An issued pack is never
    touched: generating after issue starts the next revision."""
    if discard is not None and discard not in RAMS_KINDS: raise HTTPException(422, "Unknown document.")
    m = me(cur); s, ctx = scaffold_ctx(cur, m, scaffold_id); logo = logo_png(m)
    current = one(cur, "select * from compliance_docs where scaffold_id = %s and type = 'rams' order by revision_no desc limit 1", scaffold_id)
    draft = current if current and not current["issued_at"] else None
    rev = 0 if not current else (current["revision_no"] + 1 if current["issued_at"] else current["revision_no"])
    old_files = (draft["files"] or {}) if draft else {}
    files, used, kept = {}, [], []
    for kind in RAMS_KINDS:
        prev = old_files.get(kind) or {}
        if prev.get("edited_by") and kind != discard:
            files[kind] = prev; kept.append(kind); continue
        trow, tbytes = template(cur, m, kind)
        out = D.render(tbytes, ctx, logo)
        files[kind] = store_doc(m, scaffold_id, f"rams-r{rev}-{kind}", out)
        used.append({"kind": kind, "template_id": str(trow["id"]), "version": trow["version"]})
    missing = rams_missing(ctx, bool(logo))
    if draft:
        tid = used[0]["template_id"] if used else draft["template_id"]
        tver = used[0]["version"] if used else draft["template_version"]
        cur.execute("""update compliance_docs set files = %s, missing_fields = %s, docx_path = %s, pdf_path = %s,
                       template_id = %s, template_version = %s where id = %s""",
                    (json.dumps(files), missing, files["method_statement"]["docx"], files["method_statement"]["pdf"],
                     tid, tver, draft["id"]))
        doc_id = draft["id"]
    else:
        doc_id = one(cur, """insert into compliance_docs (company_id, scaffold_id, type, revision_no, files, missing_fields,
                             docx_path, pdf_path, template_id, template_version, reference)
                             values (%s,%s,'rams',%s,%s,%s,%s,%s,%s,%s,%s) returning id""",
                     m["company_id"], scaffold_id, rev, json.dumps(files), missing, files["method_statement"]["docx"],
                     files["method_statement"]["pdf"], used[0]["template_id"], used[0]["version"],
                     f"{s['reference']}-RAMS-R{rev}")["id"]
    if s["status"] == "planned":
        cur.execute("update scaffolds set status = 'rams_raised' where id = %s", (scaffold_id,))
    return {"doc_id": str(doc_id), "revision": rev, "files": files, "missing": missing, "templates": used, "kept": kept}

def upload_rams_edit(cur, scaffold_id, kind, filename, data):
    """A part of the draft adapted to the site in Word. Replaces that part for this scaffold only; the firm's
    template is unchanged. Only a draft can take an edit: an issued pack is locked (rule 7)."""
    if kind not in RAMS_KINDS: raise HTTPException(422, "Choose the method statement or the risk assessment.")
    r = T.check_edited_document(filename, data)
    if not r.ok: raise HTTPException(422, " ".join(r.errors))
    m = me(cur)
    draft = one(cur, """select * from compliance_docs where scaffold_id = %s and type = 'rams' and issued_at is null
                        order by revision_no desc limit 1""", scaffold_id)
    if not draft:
        raise HTTPException(409, "There is no draft to edit. Generate the RAMS pack first, or start a new revision of the issued one.")
    s, ctx = scaffold_ctx(cur, m, scaffold_id)
    stored = store_doc(m, scaffold_id, f"rams-r{draft['revision_no']}-{kind}-edited-{uuid.uuid4().hex[:6]}", data)
    files = dict(draft["files"] or {})
    files[kind] = {**stored, "edited_by": m["full_name"], "edited_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds"),
                   "original_name": filename[:120]}
    missing = rams_missing(ctx, bool(m["logo_path"]))
    ms = files.get("method_statement") or {}
    cur.execute("update compliance_docs set files = %s, missing_fields = %s, docx_path = %s, pdf_path = %s where id = %s",
                (json.dumps(files), missing, ms.get("docx"), ms.get("pdf"), draft["id"]))
    return {"doc_id": str(draft["id"]), "kind": kind, "files": files, "missing": missing}

def issue_rams(cur, scaffold_id):
    """Brings the standard parts up to date with the current job and scaffold details (edited parts are kept as
    written), checks nothing is missing, then locks the pack."""
    doc = one(cur, """select * from compliance_docs where scaffold_id = %s and type = 'rams' and issued_at is null
                      order by revision_no desc limit 1""", scaffold_id)
    if not doc: raise HTTPException(409, "Generate the RAMS pack first.")
    g = generate_rams(cur, scaffold_id)
    if g["missing"]:
        raise HTTPException(409, "Fill these before issuing: " + ", ".join(g["missing"]))
    cur.execute("update compliance_docs set issued_at = now(), issued_by = auth.uid() where id = %s", (doc["id"],))
    return {"doc_id": str(doc["id"]), "issued": True, "kept": g["kept"]}

def record_sheet(cur, scaffold_id, body):
    m = me(cur)
    kind = body.pop("type")
    if kind not in ("tg20_21", "tg30", "bespoke_design"): raise HTTPException(422, "Type must be tg20_21, tg30 or bespoke_design.")
    ref = body.get("sheet_reference") or body.get("drawing_ref")
    doc_id = one(cur, "insert into compliance_docs (company_id, scaffold_id, type, reference) values (%s,%s,%s,%s) returning id",
                 m["company_id"], scaffold_id, kind, ref)["id"]
    if kind == "bespoke_design":
        cols = ["designer_name", "designer_position", "designer_company", "drawing_ref", "covers", "designed_at"]
        table = "bespoke_designs"
    else:
        cols = ["sheet_reference", "scaffold_type", "wind_factor", "max_height_m", "max_boarded_lifts", "max_lift_height_m",
                "max_bay_length_m", "max_boards_wide", "max_loading_kn_m2", "tie_duty", "tie_load_kn", "max_leg_load_kn",
                "load_class", "cladding_permitted", "add_ons_permitted", "restrictions_text"]
        table = "compliance_sheets"
    vals = {c: body.get(c) for c in cols if body.get(c) not in (None, "")}
    cur.execute(f"insert into {table} (doc_id, company_id, {', '.join(vals)}) values (%s, %s{', %s' * len(vals)})",
                (doc_id, m["company_id"], *vals.values()))
    return {"doc_id": str(doc_id)}

# ---------- handover ----------
PARTY_TEXT = {"us": "Us (the scaffold contractor)", "customer": "The customer", "third_party": "A third party"}

def handover_ctx(cur, m, doc_id):
    h = one(cur, "select h.*, d.scaffold_id, d.created_at from handovers h join compliance_docs d on d.id = h.doc_id where h.doc_id = %s", doc_id)
    s, ctx = scaffold_ctx(cur, m, h["scaffold_id"])
    issuer = one(cur, "select full_name, position from profiles where id = auth.uid()")
    ctx.update({k: d(h[k]) for k in ("certificate_ref", "loading_class", "permitted_use", "max_loaded_platforms", "restrictions",
                                      "max_leg_load_kn", "add_ons_permitted", "inspection_responsible_name",
                                      "inspection_responsible_phone", "next_inspection_due", "confirmed_by_name",
                                      "confirmed_by_role", "confirmed_by_company", "confirmed_at", "signed_ip")})
    ctx.update({"inspecting_party": PARTY_TEXT.get(h["inspecting_party"], ""), "handover_date": d(s["erected_at"] or dt.date.today()),
                "issued_by_name": issuer["full_name"], "issued_by_position": issuer["position"] or "", "issued_by_signature": "",
                "issued_at": d(h["created_at"]), "confirmed_by_signature": "",
                "acceptance_method_text": {"manual_override": f"Confirmed by {h['override_channel'] or 'message'}; recorded by the firm (not a signature)",
                                           "digital_signature": "Signed digitally"}.get(h["acceptance_method"], ""),
                "signature_pending": h["signature_status"] == "pending"})
    return h, ctx

def render_handover(cur, m, doc_id):
    h, ctx = handover_ctx(cur, m, doc_id)
    trow, tbytes = template(cur, m, "handover")
    out = D.render(tbytes, ctx, logo_png(m))
    if trow["source"] == "uploaded" and ctx["signature_pending"]:
        out = D.add_banner(out)
    suffix = "signed" if not ctx["signature_pending"] else "unsigned"
    files = {"handover": store_doc(m, h["scaffold_id"], f"handover-{ctx['certificate_ref']}-{suffix}", out)}
    missing = D.missing_required("handover", ctx, logo_present=bool(m["logo_path"]))
    return files, missing, trow

def confirm_erected(cur, scaffold_id, body):
    m = me(cur)
    cur.execute("update scaffolds set status = 'on_hire', erected_at = now() where id = %s", (scaffold_id,))   # rule 2 trigger guards this
    s, ctx = scaffold_ctx(cur, m, scaffold_id)
    n = one(cur, "select private.next_number(%s, 'certificate') as n", m["company_id"])["n"]
    ref = f"HC{n:04d}"
    doc_id = one(cur, "insert into compliance_docs (company_id, scaffold_id, type, reference) values (%s,%s,'handover',%s) returning id",
                 m["company_id"], scaffold_id, ref)["id"]
    fields = {"loading_class": body.get("loading_class") or ctx["loading_class"], "permitted_use": body.get("permitted_use"),
              "max_loaded_platforms": body.get("max_loaded_platforms"), "restrictions": body.get("restrictions") or ctx["restrictions"],
              "max_leg_load_kn": body.get("max_leg_load_kn") or (ctx["max_leg_load_kn"] or None),
              "add_ons_permitted": body.get("add_ons_permitted") or ctx["add_ons_permitted"],
              "inspecting_party": body.get("inspecting_party"), "inspection_responsible_name": body.get("inspection_responsible_name"),
              "inspection_responsible_phone": body.get("inspection_responsible_phone"),
              "next_inspection_due": body.get("next_inspection_due") or (dt.date.today() + dt.timedelta(days=7))}
    cur.execute(f"insert into handovers (doc_id, company_id, certificate_ref, {', '.join(fields)}) values (%s,%s,%s{', %s' * len(fields)})",
                (doc_id, m["company_id"], ref, *fields.values()))
    files, missing, trow = render_handover(cur, m, doc_id)
    cur.execute("update compliance_docs set files = %s, missing_fields = %s, docx_path = %s, pdf_path = %s, template_id = %s, template_version = %s where id = %s",
                (json.dumps(files), missing, files["handover"]["docx"], files["handover"]["pdf"], trow["id"], trow["version"], doc_id))
    return {"doc_id": str(doc_id), "certificate_ref": ref, "files": files, "missing": missing, "signature_pending": True}

def mark_signed(cur, doc_id, body):
    m = me(cur)
    if m["role"] != "owner": raise HTTPException(403, "Only the owner can record a handover as signed.")
    if not body.get("evidence_note"): raise HTTPException(422, "Say how the client confirmed (for example: email from J Bloggs, 3 Nov).")
    cur.execute("""update handovers set signature_status = 'resolved', acceptance_method = 'manual_override',
                   overridden_by_user_id = auth.uid(), override_evidence_url = %s, override_channel = %s,
                   confirmed_by_name = %s, confirmed_by_role = %s, confirmed_by_company = %s, confirmed_at = now()
                   where doc_id = %s and signature_status = 'pending'""",
                (body["evidence_note"], body.get("channel", "email"), body.get("name"), body.get("role"), body.get("company"), doc_id))
    if cur.rowcount != 1: raise HTTPException(409, "This handover is already resolved.")
    files, missing, trow = render_handover(cur, m, doc_id)
    cur.execute("update compliance_docs set files = %s, docx_path = %s, pdf_path = %s, issued_at = now(), issued_by = auth.uid() where id = %s",
                (json.dumps(files), files["handover"]["docx"], files["handover"]["pdf"], doc_id))
    return {"doc_id": str(doc_id), "files": files, "signature_pending": False}

# ---------- inspection report (simple form, no scheduling or signing yet) ----------
def create_inspection(cur, scaffold_id, body):
    m = me(cur); s, ctx = scaffold_ctx(cur, m, scaffold_id)
    n = one(cur, "select private.next_number(%s, 'report') as n", m["company_id"])["n"]; ref = f"IR{n:04d}"
    inspector = one(cur, "select full_name, position, inspector_qualification from profiles where id = %s",
                    body.get("inspector_profile_id") or m["id"])
    prev = one(cur, "select max(inspected_at) as at from inspections i join compliance_docs d on d.id = i.doc_id where d.scaffold_id = %s", scaffold_id)
    doc_id = one(cur, "insert into compliance_docs (company_id, scaffold_id, type, reference) values (%s,%s,'inspection',%s) returning id",
                 m["company_id"], scaffold_id, ref)["id"]
    inspected_at = body.get("inspected_at") or dt.datetime.now().isoformat(timespec="minutes")
    cur.execute("""insert into inspections (doc_id, company_id, report_ref, inspection_type, inspected_at, weather, outcome,
                   tag_updated, next_inspection_due, copies_sent_to, inspector_profile_id, server_received_at)
                   values (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s, now())""",
                (doc_id, m["company_id"], ref, body.get("inspection_type", "7-day"), inspected_at, body.get("weather"),
                 body.get("outcome"), body.get("tag_updated"), body.get("next_inspection_due"), body.get("copies_sent_to"),
                 body.get("inspector_profile_id") or m["id"]))
    results = {c["item"]: c for c in body.get("checklist", [])}
    checklist = [{"item": i, "result": (results.get(i) or {}).get("result", ""), "comment": (results.get(i) or {}).get("comment", "")}
                 for i in INSPECTION_CHECKLIST]
    for pos, c in enumerate(checklist, 1):
        cur.execute("insert into inspection_items (company_id, inspection_id, position, item, result, comment) values (%s,%s,%s,%s,%s,%s)",
                    (m["company_id"], doc_id, pos, c["item"], c["result"] or None, c["comment"]))
    defects = body.get("defects", [])
    for x in defects:
        cur.execute("""insert into inspection_defects (company_id, inspection_id, matter, action_taken, further_action, responsible, due_date)
                       values (%s,%s,%s,%s,%s,%s,%s)""", (m["company_id"], doc_id, x["matter"], x.get("action_taken"),
                       x.get("further_action"), x.get("responsible"), x.get("due_date") or None))
    ctx.update({"report_ref": ref, "inspection_type": body.get("inspection_type", "7-day"),
                "inspected_at": d(dt.datetime.fromisoformat(inspected_at)), "previous_inspection_at": d(prev["at"]) if prev and prev["at"] else "None recorded",
                "weather": body.get("weather", ""), "outcome": body.get("outcome", ""),
                "tag_updated": {True: "Yes", False: "No"}.get(body.get("tag_updated"), ""),
                "next_inspection_due": d(dt.date.fromisoformat(body["next_inspection_due"])) if body.get("next_inspection_due") else "",
                "copies_sent_to": body.get("copies_sent_to", ""), "signed_at": "",
                "inspector_name": inspector["full_name"], "inspector_position": inspector["position"] or "",
                "inspector_qualification": inspector["inspector_qualification"] or "", "inspector_signature": "",
                "checklist": [{**c, "result": {"yes": "Yes", "no": "No", "n/a": "N/A"}.get(c["result"], c["result"])} for c in checklist],
                "defects": [{**x, "due_date": x.get("due_date", "")} for x in defects]})
    trow, tbytes = template(cur, m, "inspection")
    out = D.render(tbytes, ctx, logo_png(m))
    files = {"inspection": store_doc(m, scaffold_id, f"inspection-{ref}", out)}
    missing = D.missing_required("inspection", ctx, logo_present=bool(m["logo_path"]))
    cur.execute("update compliance_docs set files = %s, missing_fields = %s, docx_path = %s, pdf_path = %s, template_id = %s, template_version = %s where id = %s",
                (json.dumps(files), missing, files["inspection"]["docx"], files["inspection"]["pdf"], trow["id"], trow["version"], doc_id))
    return {"doc_id": str(doc_id), "report_ref": ref, "files": files, "missing": missing}

# ---------- quotes ----------
def build_quote(cur, job_id):
    m = me(cur)
    scaffolds = all_(cur, """select s.* from scaffolds s join sites si on si.id = s.site_id where si.job_id = %s order by s.name""", job_id)
    if not scaffolds: raise HTTPException(409, "Add a scaffold with its measurements before quoting.")
    rates = {(r["unit"], r["scaffold_kind"]): r["price"] for r in all_(cur, "select unit, scaffold_kind, price from rate_cards")}
    lines = []
    for s in scaffolds:
        elev = all_(cur, "select * from job_elevations where scaffold_id = %s", s["id"])
        calc = one(cur, "select * from haki_calculations where scaffold_id = %s order by created_at desc limit 1", s["id"])
        if s["kind"] == "haki_stair_tower" and not calc:
            raise HTTPException(409, f"Run the HAKI calculator for {s['name']} first.")
        unit_prices = None
        if s["pricing_mode"] == "component":
            unit_prices = (calc["bill_of_materials"] or {}).get("unit_prices", {})
            calc = {**calc, "bill_of_materials": calc["bill_of_materials"]["items"]}
        for l in Q.lines_for_scaffold(s, elev, rates.get((s["pricing_mode"], s["kind"])), calc, unit_prices):
            lines.append({**l, "scaffold_id": s["id"]})
    t = Q.totals(lines, m["vat_registered"], Decimal(config.VAT_STANDARD_RATE))
    q = one(cur, """insert into quotes (company_id, job_id, issued_at, vat_registered, vat_number, vat_rate)
                    values (%s,%s,now(),%s,%s,%s) returning id, number""",
            m["company_id"], job_id, m["vat_registered"], m["vat_number"] if m["vat_registered"] else None, t["vat_rate"])
    for l in lines:
        cur.execute("""insert into quote_lines (company_id, quote_id, scaffold_id, description, pricing_mode, quantity, unit, unit_price)
                       values (%s,%s,%s,%s,%s,%s,%s,%s)""", (m["company_id"], q["id"], l["scaffold_id"], l["description"],
                       l["pricing_mode"], l["quantity"], l["unit"], l["unit_price"]))
    cur.execute("update jobs set status = 'quoted' where id = %s and status = 'enquiry'", (job_id,))
    return {"quote_id": str(q["id"]), "number": q["number"], "subtotal": str(t["subtotal"]),
            "vat_amount": str(t["vat_amount"]) if t["vat_amount"] is not None else None, "total": str(t["total"])}

def quote_data(cur, quote_id):
    m = me(cur)
    q = one(cur, """select q.*, j.reference, j.quote_valid_days, cl.name as contact, cl.company_name, si.address as site_address
                    from quotes q join jobs j on j.id = q.job_id join clients cl on cl.id = j.client_id
                    left join lateral (select address from sites where job_id = j.id order by address limit 1) si on true
                    where q.id = %s""", quote_id)
    if not q: raise HTTPException(404, "Quote not found.")
    lines = all_(cur, "select * from quote_lines where quote_id = %s order by description", quote_id)
    t = Q.totals(lines, bool(q["vat_registered"]), q["vat_rate"] or Decimal(config.VAT_STANDARD_RATE))
    elev = all_(cur, """select s.name as scaffold, e.label, e.quoted_length_m, e.quoted_height_m, e.quoted_area_m2
                        from job_elevations e join scaffolds s on s.id = e.scaffold_id join sites si on si.id = s.site_id
                        where si.job_id = %s order by s.name, e.label""", q["job_id"])
    weeks = one(cur, """select min(hire_included_weeks) as w from scaffolds s join sites si on si.id = s.site_id where si.job_id = %s""", q["job_id"])["w"] or 4
    issued = (q["issued_at"] or dt.datetime.now()).date()
    return m, q, lines, t, elev, issued, weeks

def quote_files(cur, quote_id, fmt):
    m, q, lines, t, elev, issued, weeks = quote_data(cur, quote_id)
    client = q["company_name"] or q["contact"]
    if fmt == "csv":
        return Q.to_csv({"number": q["number"], "date": d(issued), "client": client, "job": q["reference"]}, lines, t).encode("utf-8-sig"), "text/csv"
    g = Q.gbp
    ctx = {**firm_ctx(m), "client_name": client, "site_address": q["site_address"] or "", "quote_number": q["number"],
           "quote_date": d(issued), "valid_days": q["quote_valid_days"], "valid_until": d(issued + dt.timedelta(days=q["quote_valid_days"])),
           "job_reference": q["reference"], "hire_included_weeks": weeks, "prepared_by_name": m["full_name"],
           "elevations": [{"scaffold": e["scaffold"], "label": e["label"] or "", "length": d(e["quoted_length_m"]),
                           "height": d(e["quoted_height_m"]), "area": d(e["quoted_area_m2"])} for e in elev],
           "lines": [{"description": l["description"], "quantity": d(l["quantity"]), "unit": l["unit"],
                      "unit_price": g(l["unit_price"]), "line_total": g(l["line_total"])} for l in lines],
           "subtotal": g(t["subtotal"]), "vat_registered": t["vat_registered"], "vat_number": q["vat_number"] or "",
           "vat_rate": t["vat_rate"], "vat_amount": g(t["vat_amount"]), "total": g(t["total"])}
    _, tbytes = template(cur, m, "quote")
    out = D.render(tbytes, ctx, logo_png(m))
    if fmt == "docx": return out, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    pdf = D.to_pdf(out)
    if not pdf: raise HTTPException(503, "PDF conversion is not available on this server (LibreOffice not found).")
    return pdf, "application/pdf"

# ---------- HAKI ----------
def save_haki(cur, scaffold_id, body):
    m = me(cur)
    r = haki.calculate(body["target_m"], body["lift_m"], body["orientation"])
    if r.status != "ok": return {"status": r.status, "message": r.message}
    items = [{"item": l.item, "qty": l.qty, "note": l.note} for l in r.bom]
    cur.execute("""insert into haki_calculations (company_id, scaffold_id, target_height_m, lift_height_m, orientation, pricing_mode, bill_of_materials)
                   values (%s,%s,%s,%s,%s,%s,%s)""", (m["company_id"], scaffold_id, body["target_m"], body["lift_m"], body["orientation"],
                   body["pricing_mode"], json.dumps({"items": items, "unit_prices": body.get("unit_prices") or {}})))
    cur.execute("update scaffolds set target_height_m = %s where id = %s", (body["target_m"], scaffold_id))
    return {"status": "ok", "saved": True}

# ---------- templates ----------
SAMPLE = {f: f"Sample {f.replace('_', ' ')}" for f in APPROVED}
SAMPLE.update({"client_name": "Sample Client Ltd", "site_address": "1 Sample Street, Norwich NR1 1AA", "date": "01/01/2027",
               "work_area": "Front elevation", "prepared_by_name": "Sample Name", "signature_pending": True})

def save_template(cur, kind, filename, data):
    m = me(cur)
    r = T.check_upload(filename, data)
    if not r.ok: raise HTTPException(422, {"errors": r.errors, "warnings": r.warnings})
    v = one(cur, "select coalesce(max(version),0)+1 as v from document_templates where company_id = %s and kind = %s", m["company_id"], kind)["v"]
    path = f"{m['company_id']}/{kind}/v{v}-{uuid.uuid4().hex[:8]}.docx"
    storage.put("templates", path, data, "application/vnd.openxmlformats-officedocument.wordprocessingml.document")
    tid = one(cur, """insert into document_templates (company_id, kind, name, source, file_path, version, active, uploaded_by)
                      values (%s,%s,%s,'uploaded',%s,%s,false,auth.uid()) returning id""", m["company_id"], kind, filename, path, v)["id"]
    return {"template_id": str(tid), "version": v, "warnings": r.warnings, "tags": r.tags}

def preview_template(cur, template_id):
    m = me(cur)
    row = one(cur, "select * from document_templates where id = %s", template_id)
    if not row: raise HTTPException(404, "Template not found.")
    data = storage.get("templates", row["file_path"]) if row["source"] == "uploaded" else (config.TEMPLATES_DIR / row["file_path"]).read_bytes()
    out = D.render(data, {**SAMPLE, **firm_ctx(m)}, logo_png(m))
    if row["kind"] == "handover" and row["source"] == "uploaded": out = D.add_banner(out)
    return D.to_pdf(out) or out

def activate_template(cur, template_id):
    row = one(cur, "select * from document_templates where id = %s and company_id is not null", template_id)
    if not row: raise HTTPException(404, "Template not found.")
    cur.execute("update document_templates set active = false where company_id = %s and kind = %s", (row["company_id"], row["kind"]))
    cur.execute("update document_templates set active = true where id = %s", (template_id,))
    return {"active": True, "kind": row["kind"], "version": row["version"]}

def set_logo(cur, data):
    m = me(cur)
    if m["role"] != "owner": raise HTTPException(403, "Only the owner can change the firm's logo.")
    png = D.pad_logo(data)
    path = f"{m['company_id']}/logo-{uuid.uuid4().hex[:8]}.png"
    storage.put("logos", path, png, "image/png")
    cur.execute("update companies set logo_path = %s where id = %s", (path, m["company_id"]))
    return {"logo_path": path}

def read_file(cur, path):
    m = me(cur)
    if not path.startswith(str(m["company_id"]) + "/") or ".." in path:
        raise HTTPException(404, "File not found.")
    return storage.get("documents", path)
