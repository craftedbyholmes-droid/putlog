"""Quote lines and totals. Figures are entered once (rule 11); the client is always quoted on the
quoted figures, never the as-built ones."""
import csv, io
from decimal import Decimal, ROUND_HALF_UP
from . import haki

TWO = Decimal("0.01")
UNITS = {"squareage": "m²", "meterage": "m", "height": "m (height)", "component": "each"}

def money(x) -> Decimal:
    return Decimal(str(x)).quantize(TWO, ROUND_HALF_UP)

def lines_for_scaffold(scaffold: dict, elevations: list[dict], rate: Decimal | None,
                       haki_calc: dict | None = None, unit_prices: dict | None = None) -> list[dict]:
    mode, name = scaffold["pricing_mode"], scaffold["name"]
    if mode == "squareage":
        qty = sum(Decimal(str(e["quoted_area_m2"] or 0)) for e in elevations)
        return [_line(f"{name}: scaffold area", "squareage", qty, rate)]
    if mode == "meterage":
        qty = sum(Decimal(str(e["quoted_length_m"] or 0)) for e in elevations)
        return [_line(f"{name}: run length", "meterage", qty, rate)]
    if mode == "height":
        return [_line(f"{name}: HAKI stair tower, {haki_calc['target_height_m']} m target height", "height",
                      Decimal(str(haki_calc["target_height_m"])), rate)]
    if mode == "component":
        out = []
        for item in haki_calc["bill_of_materials"]:
            if item["qty"]:
                if item["item"] not in (unit_prices or {}):
                    raise haki.HakiInputError(f"No unit price for {item['item']}")
                out.append(_line(f"{name}: {item['item']}", "component", Decimal(item["qty"]), unit_prices[item["item"]]))
        return out
    raise ValueError(f"Unknown pricing mode {mode}")

def _line(desc, mode, qty, price):
    if price is None:
        raise ValueError(f"No rate set for {mode}. Add one in Settings → Rates.")
    qty, price = Decimal(qty).quantize(TWO), money(price)
    return {"description": desc, "pricing_mode": mode, "quantity": qty, "unit": UNITS[mode],
            "unit_price": price, "line_total": money(qty * price)}

def totals(lines: list[dict], vat_registered: bool, vat_rate: Decimal = Decimal("20")) -> dict:
    subtotal = money(sum((l["line_total"] for l in lines), Decimal("0")))
    vat = money(subtotal * vat_rate / 100) if vat_registered else Decimal("0.00")
    return {"subtotal": subtotal, "vat_registered": vat_registered, "vat_rate": vat_rate if vat_registered else None,
            "vat_amount": vat if vat_registered else None, "total": subtotal + vat}

def gbp(x) -> str:
    return "" if x is None else f"£{money(x):,.2f}"

def to_csv(quote: dict, lines: list[dict], t: dict) -> str:
    """One row per line item. VAT is worked out on the subtotal (as on the PDF) and spread across the
    lines, with any rounding penny on the last line, so the Gross column always adds up to the PDF total."""
    vat_total = t["vat_amount"] or Decimal("0.00")
    shares, allocated = [], Decimal("0.00")
    for i, l in enumerate(lines):
        if i == len(lines) - 1: v = vat_total - allocated
        else: v = money(l["line_total"] * t["vat_rate"] / 100) if t["vat_registered"] else Decimal("0.00")
        allocated += v; shares.append(v)
    buf = io.StringIO(); w = csv.writer(buf)
    w.writerow(["Quote", "Date", "Client", "Job", "Description", "Quantity", "Unit", "Unit price", "Net", "VAT", "Gross"])
    for l, v in zip(lines, shares):
        w.writerow([quote["number"], quote["date"], quote["client"], quote["job"], l["description"], l["quantity"],
                    l["unit"], l["unit_price"], l["line_total"], v, l["line_total"] + v])
    return buf.getvalue()
