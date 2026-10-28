import io, os, pathlib, pytest
from PIL import Image, ImageDraw

ROOT = pathlib.Path(__file__).resolve().parents[2]
STD = ROOT / "templates" / "standard"

@pytest.fixture
def std():
    return lambda name: (STD / f"{name}_TEMPLATE.docx").read_bytes()

@pytest.fixture
def square_logo():
    im = Image.new("RGB", (300, 300), (200, 30, 30)); ImageDraw.Draw(im).text((100, 140), "ACME", fill="white")
    b = io.BytesIO(); im.save(b, "JPEG"); return b.getvalue()          # a JPEG on purpose: uploads won't all be PNG

FIRM = {"firm_name": "Smith & Sons Scaffolding Ltd", "firm_address": "Unit 4, Yarmouth Road, North Walsham NR28 0AA",
        "firm_phone": "01692 000000", "firm_email": "office@example.invalid"}
JOB = {"client_name": "Acme & Co Builders", "client_address": "2 Market Place, Aylsham NR11 6EH",
       "site_address": "14 Church Street, Cromer NR27 9ES", "work_area": "Front elevation",
       "quote_reference": "Q0001", "item_no": "1", "design_no": "TG-2026-0042", "compliance_standard": "NASC TG20:21",
       "date": "29/10/2026", "date_of_erection": "02/11/2026", "start_date": "02/11/2026", "duration": "3 days",
       "supervisor_name": "Dan Price", "supervisor_phone": "07700 900001", "emergency_contact_name": "Office",
       "emergency_contact_phone": "01692 000000", "working_days_a": "Mon–Thu", "working_hours_a": "0800–1600",
       "working_days_b": "Fri", "working_hours_b": "0800–1530", "manpower": "3 (charge hand + 2)",
       "prepared_by_name": "Keith", "prepared_by_signature": ""}
