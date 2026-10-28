"""Checks on an uploaded Word template (untrusted input) and label detection for untagged documents."""
import copy, io, re, zipfile
from dataclasses import dataclass, field
from .fields import APPROVED, CORE

MAX_BYTES = 10 * 1024 * 1024
TAG = re.compile(r"(\{\{.*?\}\}|\{%.*?%\}|\{#.*?#\})", re.S)
PLAIN = re.compile(r"^\{\{\s*([a-z_][a-z0-9_]*)\s*\}\}$")

@dataclass
class Report:
    errors: list = field(default_factory=list)
    warnings: list = field(default_factory=list)
    tags: list = field(default_factory=list)
    @property
    def ok(self): return not self.errors

def _parts(z):
    return [n for n in z.namelist() if n.startswith("word/") and n.endswith(".xml") and "_rels" not in n]

def _paragraph_texts(xml: str):
    # join runs inside each paragraph so tags split across runs are still seen
    for p in re.findall(r"<w:p[ >].*?</w:p>", xml, re.S):
        yield "".join(re.findall(r"<w:t[^>]*>(.*?)</w:t>", p, re.S))

def check_upload(filename: str, data: bytes) -> Report:
    r = Report()
    if not filename.lower().endswith(".docx"):
        r.errors.append(f"{filename} is not a .docx file. Save it from Word as a .docx (Word Document) and upload again."); return r
    if len(data) > MAX_BYTES:
        r.errors.append(f"The file is {len(data)/1048576:.1f} MB. The limit is {MAX_BYTES//1048576} MB."); return r
    try:
        z = zipfile.ZipFile(io.BytesIO(data))
        names = z.namelist()
        ct = z.read("[Content_Types].xml").decode("utf8", "ignore")
        z.read("word/document.xml")
    except Exception:
        r.errors.append("The file is damaged or is not a real Word document."); return r
    if any("vbaproject" in n.lower() for n in names) or "macroEnabled" in ct:
        r.errors.append("The document contains macros. Save a copy as a plain .docx (not .docm) and upload that.")
    for n in names:
        if n.endswith(".rels"):
            for target in re.findall(r'Target="([^"]+)"[^>]*TargetMode="External"|TargetMode="External"[^>]*Target="([^"]+)"', z.read(n).decode("utf8", "ignore")):
                r.errors.append(f"The document links to an outside file or address ({next(t for t in target if t)}). Remove the link and upload again.")
    seen = []
    for n in _parts(z):
        for text in _paragraph_texts(z.read(n).decode("utf8", "ignore")):
            for tag in TAG.findall(text):
                m = PLAIN.match(tag)
                if not m:
                    r.errors.append(f"{tag} is not allowed. Uploaded templates may only use plain fields like {{{{ client_name }}}}.")
                elif m.group(1) not in APPROVED:
                    r.errors.append(f"Unknown field {tag}. Check the spelling against the field list.")
                else:
                    seen.append(m.group(1))
            if "{{" in text and not TAG.search(text):
                r.errors.append(f"An unfinished tag was found near: {text[:60]!r}")
    r.tags = sorted(set(seen))
    missing = [c for c in CORE if c not in r.tags]
    if r.tags and missing:
        r.warnings.append("Missing core fields: " + ", ".join(missing) + ". The template can still be used.")
    if not re.search(rb'<pic:cNvPr[^>]*\bname="logo"', b"".join(z.read(n) for n in _parts(z))):
        r.warnings.append("No picture named \"logo\" was found, so your firm logo will not appear. "
                          "In Word, right-click your logo, choose Edit Alt Text, and set its name to logo.")
    return r

# ---------- label detection for documents with blanks instead of tags ----------
LABEL_MAP = {
    "customer": "client_name", "client": "client_name", "site": "site_address", "site address": "site_address",
    "address": "site_address", "date": "date", "work area": "work_area", "quotation no": "quote_reference",
    "quotation number": "quote_reference", "quote no": "quote_reference", "quote ref": "quote_reference",
    "item no": "item_no", "design no": "design_no", "supervisor": "supervisor_name",
    "date of erection": "date_of_erection", "start date": "start_date", "duration": "duration",
    "emergency contact": "emergency_contact_name", "prepared by": "prepared_by_name",
    "risk assessment by": "prepared_by_name", "manpower to be utilised": "manpower",
}
LABEL = re.compile(r"([A-Za-z][A-Za-z .]{0,40}?)\s*:")

def _norm(label: str) -> str:
    return re.sub(r"\s+", " ", label.lower().replace(".", "")).strip()

def _containers(doc):
    seen = set()
    yield doc
    for s in doc.sections:
        for part in (s.header, s.first_page_header, s.even_page_header, s.footer, s.first_page_footer, s.even_page_footer):
            if part.is_linked_to_previous or id(part._element) in seen:
                continue
            seen.add(id(part._element)); yield part

def _paragraphs_and_cells(container):
    for p in container.paragraphs:
        yield p, None
    for t in container.tables:
        for row in t.rows:
            cells = row.cells
            for i, c in enumerate(cells):
                for p in c.paragraphs:
                    yield p, (cells[i + 1] if i + 1 < len(cells) and cells[i + 1]._tc is not c._tc else None)

def find_labels(docx_bytes: bytes):
    """Returns (proposals, unmatched). Each proposal: where it is, the label, and the proposed field."""
    from docx import Document
    doc = Document(io.BytesIO(docx_bytes))
    proposals, unmatched = [], []
    for ci, cont in enumerate(_containers(doc)):
        for pi, (p, next_cell) in enumerate(_paragraphs_and_cells(cont)):
            text = p.text
            matches = list(LABEL.finditer(text))
            for k, m in enumerate(matches):
                value = text[m.end(): matches[k + 1].start() if k + 1 < len(matches) else len(text)]
                blank_here = value.strip() == ""
                blank_cell = blank_here and k == len(matches) - 1 and next_cell is not None and next_cell.text.strip() == ""
                if not blank_here:
                    continue
                label = _norm(m.group(1)); fieldname = LABEL_MAP.get(label)
                entry = {"container": ci, "paragraph": pi, "label": m.group(1).strip(), "offset": m.end(),
                         "into_next_cell": blank_cell}
                (proposals if fieldname else unmatched).append({**entry, "field": fieldname} if fieldname else entry)
    return proposals, unmatched

def insert_tags(docx_bytes: bytes, confirmed: list[dict]) -> bytes:
    """Insert {{ field }} after each confirmed label (or into the empty cell beside it), keeping formatting."""
    from docx import Document
    doc = Document(io.BytesIO(docx_bytes))
    index = {}
    for ci, cont in enumerate(_containers(doc)):
        for pi, pc in enumerate(_paragraphs_and_cells(cont)):
            index[(ci, pi)] = pc
    # work from the end of each paragraph backwards so offsets stay valid
    for c in sorted(confirmed, key=lambda c: (c["container"], c["paragraph"], -c["offset"])):
        p, next_cell = index[(c["container"], c["paragraph"])]
        tag = "{{ " + c["field"] + " }}"
        if c.get("into_next_cell") and next_cell is not None:
            target = next_cell.paragraphs[0]
            src = p.runs[-1] if p.runs else None
            new = copy.deepcopy(src._r) if src is not None else None
            if new is not None:
                for t in new.findall(".//{http://schemas.openxmlformats.org/wordprocessingml/2006/main}t"): t.text = tag
                target._p.append(new)
            else:
                target.add_run(tag)
            continue
        pos = 0
        for run in p.runs:
            end = pos + len(run.text)
            if pos < c["offset"] <= end:
                cut = c["offset"] - pos
                before, after = run.text[:cut], run.text[cut:]
                run.text = before
                tag_run = copy.deepcopy(run._r); run._r.addnext(tag_run)
                from docx.text.run import Run
                Run(tag_run, p).text = " " + tag + (" " if after and not after.startswith(" ") else "")
                if after:
                    rest = copy.deepcopy(run._r); tag_run.addnext(rest); Run(rest, p).text = after
                break
            pos = end
    out = io.BytesIO(); doc.save(out); return out.getvalue()
