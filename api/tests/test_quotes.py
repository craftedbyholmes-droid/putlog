"""Acceptance tests 4, 7 and 14 (maths and CSV), plus the VAT figures from B6, plus fixed-price scaffolds."""
import csv, io
from decimal import Decimal
import pytest
from app import quotes

SCAFF = {"name": "Front elevation", "pricing_mode": "squareage"}
ELEV = [{"quoted_area_m2": 60, "quoted_length_m": 10}, {"quoted_area_m2": 48, "quoted_length_m": 8}]

def test_04_quote_from_elevations():
    lines = quotes.lines_for_scaffold(SCAFF, ELEV, Decimal("3.50"))
    assert lines[0]["quantity"] == Decimal("108.00") and lines[0]["line_total"] == Decimal("378.00")
    t = quotes.totals(lines, vat_registered=False)
    assert t["total"] == Decimal("378.00")

def test_14_vat_only_when_registered():
    lines = quotes.lines_for_scaffold(SCAFF, ELEV, Decimal("3.50"))
    off = quotes.totals(lines, False); on = quotes.totals(lines, True)
    assert off["vat_amount"] is None and off["total"] == Decimal("378.00")
    assert on["vat_amount"] == Decimal("75.60") and on["total"] == Decimal("453.60")

def test_07_csv_one_row_per_line_and_same_total():
    lines = (quotes.lines_for_scaffold(SCAFF, ELEV, Decimal("3.50"))
             + quotes.lines_for_scaffold({"name": "Rear", "pricing_mode": "meterage"}, [{"quoted_length_m": 7.33}], Decimal("11.17")))
    t = quotes.totals(lines, True)
    rows = list(csv.DictReader(io.StringIO(quotes.to_csv({"number": "Q0001", "date": "29/10/2026", "client": "Acme", "job": "JOB0001"}, lines, t))))
    assert len(rows) == len(lines)
    assert sum(Decimal(r["Gross"]) for r in rows) == t["total"]
    assert sum(Decimal(r["VAT"]) for r in rows) == t["vat_amount"]

def test_haki_and_tube_priced_separately():
    tube = quotes.lines_for_scaffold(SCAFF, ELEV, Decimal("3.50"))
    tower = quotes.lines_for_scaffold({"name": "Stair tower", "pricing_mode": "height"}, [], Decimal("45"),
                                      haki_calc={"target_height_m": 6.0})
    assert tower[0]["line_total"] == Decimal("270.00") and tower[0]["unit"] == "m (height)"
    assert quotes.totals(tube + tower, False)["total"] == Decimal("648.00")

def test_fixed_price_one_line_per_item_and_ignores_measurements():
    s = {"name": "Front", "pricing_mode": "fixed",
         "price_items": [{"id": "a", "description": "Scaffold as quoted", "price": 1250},
                         {"id": "b", "description": "Loading bay", "price": "180.50"}]}
    lines = quotes.lines_for_scaffold(s, ELEV, Decimal("3.50"))     # measurements and rate must not change a fixed price
    assert [l["description"] for l in lines] == ["Front: Scaffold as quoted", "Front: Loading bay"]
    assert all(l["quantity"] == Decimal("1.00") and l["unit"] == "item" for l in lines)
    t = quotes.totals(lines, True)
    assert t["subtotal"] == Decimal("1430.50") and t["vat_amount"] == Decimal("286.10") and t["total"] == Decimal("1716.60")

@pytest.mark.parametrize("items", [[], [{"description": "Extra", "price": ""}], [{"description": "Extra", "price": -5}],
                                   [{"description": "Extra", "price": "abc"}], [{"description": "Extra"}]])
def test_fixed_price_refuses_missing_or_bad_price(items):
    with pytest.raises(ValueError):
        quotes.lines_for_scaffold({"name": "Front", "pricing_mode": "fixed", "price_items": items}, [], None)
