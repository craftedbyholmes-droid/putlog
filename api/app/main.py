"""Putlog API. Calculations, documents, PDFs and uploads. Simple reads and writes go straight from the
web app to Supabase, under the same row-level security."""
import json
import psycopg
from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response
from pydantic import BaseModel
from . import config, documents as D, haki, lifts, services as S, template_checks as T
from .auth import current_user
from .db import as_user

app = FastAPI(title="Putlog API", version="0.1.0")
app.add_middleware(CORSMiddleware, allow_origins=config.WEB_ORIGINS, allow_methods=["*"], allow_headers=["*"])

@app.exception_handler(psycopg.Error)
def db_error(_, exc: psycopg.Error):
    msg = str(exc).split("\n")[0]
    if "RULE 2" in msg:
        return JSONResponse(status_code=409, content={"detail": "This scaffold cannot be scheduled or erected yet: it needs an issued RAMS pack and a TG20:21/TG30 sheet or a bespoke design."})
    if "row-level security" in msg or "permission denied" in msg:
        return JSONResponse(status_code=403, content={"detail": "You don't have permission to do that."})
    return JSONResponse(status_code=409, content={"detail": msg})

# Pricing and input problems (no rate set, no fixed price, no unit price) are the user's to fix, not server errors.
@app.exception_handler(haki.HakiInputError)
def haki_input_error(_, exc: Exception):
    return JSONResponse(status_code=422, content={"detail": str(exc)})

@app.exception_handler(ValueError)
def value_error(_, exc: ValueError):
    return JSONResponse(status_code=422, content={"detail": str(exc)})

@app.exception_handler(D.PdfConversionError)
def pdf_error(_, exc: Exception):
    return JSONResponse(status_code=503, content={"detail": f"The Word file was made but the PDF could not be: {exc}"})

@app.on_event("startup")
def startup():
    from .storage import ensure_buckets
    try:
        ensure_buckets()
    except Exception as e:                      # the API still serves calculators if storage is down
        print("Storage buckets not checked:", e)

@app.get("/health")
def health():
    from .documents import soffice_path
    return {"ok": True, "pdf": bool(soffice_path())}

# ---------- signing ----------
PIN_ERRORS = {"wrong": (403, "That signing PIN is not right."),
              "locked": (429, "Too many wrong PINs. Signing is locked for 15 minutes."),
              "no_pin": (409, "Set your signing PIN in Settings, under My signature, first.")}

def require_pin(user: str, pin) -> None:
    """Checked in its own transaction before any signing work, so a wrong try is always counted, even when the
    signing step itself then fails."""
    if not pin: raise HTTPException(422, "Enter your signing PIN.")
    with as_user(user) as cur:
        status = S.check_pin(cur, str(pin))
    if status != "ok":
        code, msg = PIN_ERRORS.get(status, (403, "That signing PIN is not right."))
        raise HTTPException(code, msg)

class PinIn(BaseModel):
    pin: str = ""

class SetPinIn(BaseModel):
    pin: str
    current_pin: str | None = None

@app.get("/me/signing")
def me_signing(user=Depends(current_user)):
    with as_user(user) as cur: return S.signing_status(cur)

@app.post("/me/signature")
async def me_signature(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    if len(data) > 8 * 1024 * 1024: raise HTTPException(422, "The picture must be under 8 MB.")
    with as_user(user) as cur: return S.save_signature(cur, data)

@app.post("/me/signing-pin")
def me_signing_pin(body: SetPinIn, user=Depends(current_user)):
    with as_user(user) as cur:
        status = S.set_signing_pin(cur, body.pin, body.current_pin)
    if status == "ok": return {"ok": True}
    code, msg = {"bad_format": (422, "The PIN must be 4 to 6 digits."), "wrong_current": (403, "Your current PIN is not right."),
                 "locked": (429, "Too many wrong PINs. Signing is locked for 15 minutes.")}.get(status, (422, "The PIN was not saved."))
    raise HTTPException(code, msg)

@app.post("/people/{profile_id}/reset-signing-pin")
def people_reset_pin(profile_id: str, user=Depends(current_user)):
    with as_user(user) as cur: return S.reset_signing_pin(cur, profile_id)

# ---------- calculators (no database) ----------
class HakiIn(BaseModel):
    target_m: float; lift_m: float; orientation: str = "width_against"
    pricing_mode: str = "height"; per_metre: float | None = None; unit_prices: dict | None = None

@app.post("/haki/calculate")
def haki_calculate(body: HakiIn, user=Depends(current_user)):
    try:
        r = haki.calculate(body.target_m, body.lift_m, body.orientation)
    except haki.HakiInputError as e:
        raise HTTPException(422, str(e))
    out = {"status": r.status, "message": r.message, "lifts": r.lifts, "built_mm": r.built_mm, "overshoot_mm": r.overshoot_mm,
           "standards_top_mm": r.standards_top_mm, "projection_mm": r.projection_mm, "corner_stacks": r.corner_stacks,
           "bom": [{"item": l.item, "qty": l.qty, "note": l.note} for l in r.bom], "warnings": r.warnings}
    if r.status == "ok":
        try:
            if body.pricing_mode == "height" and body.per_metre is not None:
                out["price"] = str(haki.price(r, "height", target_m=body.target_m, per_metre=body.per_metre))
            elif body.pricing_mode == "component" and body.unit_prices:
                out["price"] = str(haki.price(r, "component", unit_prices=body.unit_prices))
        except haki.HakiInputError as e:
            out["price_error"] = str(e)
    return out

class LiftsIn(BaseModel):
    height_m: float; first_lift_m: float = 2.0; lift_m: float = 2.0; step_limit_mm: int = 200; sheet_max_lift_mm: int | None = None

@app.post("/lifts/layout")
def lift_layout(body: LiftsIn, user=Depends(current_user)):
    try:
        opts = lifts.layout(body.height_m, body.first_lift_m, body.lift_m, body.step_limit_mm, body.sheet_max_lift_mm)
    except ValueError as e:
        raise HTTPException(422, str(e))
    return [{"kind": o.kind, "levels_m": [x / 1000 for x in o.levels_mm], "first_lift_m": o.first_lift_mm / 1000,
             "diff_mm": o.diff_mm, "step_warning": lifts.STEP_WARNING if o.step_warning else None,
             "bespoke_design": o.bespoke_design} for o in opts]

# ---------- scaffold actions ----------
@app.post("/scaffolds/{sid}/haki")
def scaffold_haki(sid: str, body: HakiIn, user=Depends(current_user)):
    with as_user(user) as cur: return S.save_haki(cur, sid, body.model_dump())

@app.post("/scaffolds/{sid}/sheet")
def scaffold_sheet(sid: str, body: dict, user=Depends(current_user)):
    with as_user(user) as cur: return S.record_sheet(cur, sid, dict(body))

@app.post("/scaffolds/{sid}/rams")
def scaffold_rams(sid: str, user=Depends(current_user)):
    with as_user(user) as cur: return S.generate_rams(cur, sid)

@app.post("/scaffolds/{sid}/rams/edited")
async def scaffold_rams_edited(sid: str, kind: str = Form(...), file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    with as_user(user) as cur: return S.upload_rams_edit(cur, sid, kind, file.filename or "edited.docx", data)

class DiscardIn(BaseModel):
    kind: str

@app.post("/scaffolds/{sid}/rams/discard-edit")
def scaffold_rams_discard(sid: str, body: DiscardIn, user=Depends(current_user)):
    with as_user(user) as cur: return S.generate_rams(cur, sid, discard=body.kind)

@app.post("/scaffolds/{sid}/rams/issue")
def scaffold_rams_issue(sid: str, body: PinIn | None = None, user=Depends(current_user)):
    require_pin(user, body.pin if body else "")
    with as_user(user) as cur: return S.issue_rams(cur, sid)

@app.post("/scaffolds/{sid}/confirm-erected")
def scaffold_confirm(sid: str, body: dict, user=Depends(current_user)):
    with as_user(user) as cur: return S.confirm_erected(cur, sid, body)

@app.post("/scaffolds/{sid}/inspections")
def scaffold_inspection(sid: str, body: dict, user=Depends(current_user)):
    require_pin(user, body.get("pin"))
    with as_user(user) as cur: return S.create_inspection(cur, sid, body)

@app.post("/handovers/{doc_id}/mark-signed")
def handover_signed(doc_id: str, body: dict, user=Depends(current_user)):
    with as_user(user) as cur: return S.mark_signed(cur, doc_id, body)

# ---------- quotes ----------
@app.post("/jobs/{job_id}/quotes")
def job_quote(job_id: str, user=Depends(current_user)):
    with as_user(user) as cur: return S.build_quote(cur, job_id)

@app.get("/quotes/{qid}/{fmt}")
def quote_file(qid: str, fmt: str, user=Depends(current_user)):
    if fmt not in ("pdf", "docx", "csv"): raise HTTPException(404, "Unknown format.")
    with as_user(user) as cur:
        data, ctype = S.quote_files(cur, qid, fmt)
    return Response(data, media_type=ctype, headers={"Content-Disposition": f'attachment; filename="quote-{qid[:8]}.{fmt}"'})

# ---------- templates ----------
@app.post("/templates/check")
async def template_check(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    r = T.check_upload(file.filename or "", data)
    proposals, unmatched = ([], [])
    if r.ok and not r.tags:
        proposals, unmatched = T.find_labels(data)
    return {"ok": r.ok, "errors": r.errors, "warnings": r.warnings, "tags": r.tags, "proposals": proposals, "unmatched": unmatched}

@app.post("/templates/tag")
async def template_tag(file: UploadFile = File(...), confirmed: str = Form(...), user=Depends(current_user)):
    data = await file.read()
    if not T.check_upload(file.filename or "", data).ok: raise HTTPException(422, "Fix the upload errors first.")
    out = T.insert_tags(data, json.loads(confirmed))
    return Response(out, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document")

@app.post("/templates")
async def template_save(kind: str = Form(...), file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    with as_user(user) as cur: return S.save_template(cur, kind, file.filename or "template.docx", data)

@app.get("/templates/{tid}/preview")
def template_preview(tid: str, user=Depends(current_user)):
    with as_user(user) as cur: data = S.preview_template(cur, tid)
    pdf = data[:4] == b"%PDF"
    return Response(data, media_type="application/pdf" if pdf else "application/vnd.openxmlformats-officedocument.wordprocessingml.document")

@app.post("/templates/{tid}/activate")
def template_activate(tid: str, user=Depends(current_user)):
    with as_user(user) as cur: return S.activate_template(cur, tid)

# ---------- firm ----------
@app.post("/company/logo")
async def company_logo(file: UploadFile = File(...), user=Depends(current_user)):
    data = await file.read()
    if len(data) > 5 * 1024 * 1024: raise HTTPException(422, "Logo must be under 5 MB.")
    with as_user(user) as cur: return S.set_logo(cur, data)

@app.get("/files")
def file_download(path: str, user=Depends(current_user)):
    with as_user(user) as cur: data = S.read_file(cur, path)
    ctype = "application/pdf" if path.endswith(".pdf") else "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    return Response(data, media_type=ctype, headers={"Content-Disposition": f'attachment; filename="{path.rsplit("/", 1)[-1]}"'})
