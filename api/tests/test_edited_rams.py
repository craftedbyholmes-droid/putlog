"""A RAMS draft edited by hand in Word and uploaded back: what is accepted and what is refused."""
import io
from docx import Document
from docx.opc.constants import RELATIONSHIP_TYPE as RT
from app import template_checks as T

def _doc(text="Site-specific method: pass tube through the side passage by hand.", rels=()):
    d = Document(); d.add_paragraph(text)
    for target, reltype in rels:
        d.part.relate_to(target, reltype, is_external=True)
    b = io.BytesIO(); d.save(b); return b.getvalue()

def test_plain_edited_draft_is_accepted():
    assert T.check_edited_document("Method statement.docx", _doc()).ok

def test_web_and_email_links_word_adds_are_allowed():
    r = T.check_edited_document("RAMS.docx", _doc(rels=[("mailto:office@example.com", RT.HYPERLINK), ("https://example.com", RT.HYPERLINK)]))
    assert r.ok, r.errors

def test_link_to_an_outside_picture_is_refused():
    r = T.check_edited_document("RAMS.docx", _doc(rels=[("http://example.com/x.png", RT.IMAGE)]))
    assert not r.ok and "outside file" in r.errors[0]

def test_hyperlink_to_a_file_is_refused():
    assert not T.check_edited_document("RAMS.docx", _doc(rels=[("file:///C:/secret.docx", RT.HYPERLINK)])).ok

def test_leftover_template_tags_are_refused():
    r = T.check_edited_document("RAMS.docx", _doc("Client: {{ client_name }}"))
    assert not r.ok and "template tags" in r.errors[0]

def test_not_a_word_file_is_refused():
    assert not T.check_edited_document("RAMS.pdf", b"%PDF-1.7").ok
