"""HAKI standard stair tower (bay 3050 x 1655 mm), Traditional MK1, single flight.

Agreed rules
- First platform 0.5 m up on base jacks, reached by exactly one entrance step.
- lifts = ceil((target - 0.5 m) / lift height); single lift height throughout in the first build.
- Standards: 6 ft (2.0 m) and 10 ft (3.0 m). The first standards are staggered: 6 ft in two
  opposite corners, 10 ft in the other two. All four tops finish level.
- The standards project at least 1,219 mm (4 ft) above the top platform. More is allowed.
- Cap: above 100 ft (30.48 m) the calculator says contact HAKI and gives no bill of materials.

Proposed reading (confirm with a HAKI-trained scaffolder)
- Above the first standard every piece is 10 ft; the corners that started on 10 ft finish with
  one 6 ft so the tops are level. Level tops therefore fall at 2.0 m + n x 3.0 m.
- Per-lift quantities below come from the reseller copy of HAKI's manual and are a DRAFT.
"""
from dataclasses import dataclass, field
from decimal import Decimal
from .units import to_mm, ft_in, m

PLATFORM_BASE_MM = 500
MIN_PROJECTION_MM = 1219
CAP_MM = 30480                       # 100 ft
LIFT_HEIGHTS_MM = (1000, 1500, 2000)
STANDARD_SHORT_MM, STANDARD_LONG_MM = 2000, 3000
FLIGHT_CODES = {1000: "Stair flight 1000 mm rise", 1500: "Stair flight 1500 mm rise", 2000: "Stair flight 2000 mm rise"}

class HakiInputError(ValueError):
    pass

@dataclass
class Line:
    item: str
    qty: int | None
    note: str = ""

@dataclass
class HakiResult:
    status: str                       # "ok" | "contact_haki" | "cannot_achieve_projection"
    message: str = ""
    lifts: int = 0
    built_mm: int = 0
    overshoot_mm: int = 0
    standards_top_mm: int = 0
    projection_mm: int = 0
    corner_stacks: dict = field(default_factory=dict)
    bom: list = field(default_factory=list)
    warnings: list = field(default_factory=list)

    def summary(self):
        return {"lifts": self.lifts, "built": f"{m(self.built_mm)} ({ft_in(self.built_mm)})",
                "overshoot": f"{m(self.overshoot_mm)}", "projection": f"{self.projection_mm} mm"}

def lifts_needed(target_mm: int, lift_mm: int) -> int:
    if target_mm <= PLATFORM_BASE_MM:
        raise HakiInputError("Height must be more than 0.5 m: the first platform already sits at 0.5 m.")
    if lift_mm not in LIFT_HEIGHTS_MM:
        raise HakiInputError("Lift height must be 1 m, 1.5 m or 2 m.")
    return -(-(target_mm - PLATFORM_BASE_MM) // lift_mm)        # ceiling division

def standard_stacks(top_platform_mm: int):
    """Smallest level top (2.0 m + n x 3.0 m) that clears the 1,219 mm minimum."""
    needed = top_platform_mm + MIN_PROJECTION_MM
    n = max(1, -(-(needed - STANDARD_SHORT_MM) // STANDARD_LONG_MM))
    top = STANDARD_SHORT_MM + n * STANDARD_LONG_MM
    a = [STANDARD_SHORT_MM] + [STANDARD_LONG_MM] * n                         # starts 6 ft
    b = [STANDARD_LONG_MM] * n + [STANDARD_SHORT_MM]                         # starts 10 ft, topped 6 ft
    assert sum(a) == sum(b) == top
    return top, a, b

def calculate(target_m, lift_m, orientation: str) -> HakiResult:
    target_mm, lift_mm = to_mm(target_m), to_mm(lift_m)
    if orientation not in ("width_against", "length_against"):
        raise HakiInputError("Orientation must be width_against or length_against.")
    lifts = lifts_needed(target_mm, lift_mm)
    built = PLATFORM_BASE_MM + lifts * lift_mm
    if target_mm > CAP_MM or built > CAP_MM:
        return HakiResult(status="contact_haki", lifts=lifts, built_mm=built,
                          message="Above 100 ft (30.48 m): contact HAKI technical department. No bill of materials is produced.")
    top, a, b = standard_stacks(built)
    projection = top - built
    if projection < MIN_PROJECTION_MM:
        return HakiResult(status="cannot_achieve_projection", lifts=lifts, built_mm=built,
                          message="The available standard lengths cannot reach 1,219 mm above the top platform.")
    mid = lifts - 1
    guard_rows = lift_mm // 500                       # guardrail frames every half-metre up the flight (draft)
    bom = [
        Line("Base jack", 4, "the first platform sits on base jacks"),
        Line("Entrance step", 1),
        Line(f"Standard 2.0 m ({ft_in(2000)})", a.count(2000) * 2 + b.count(2000) * 2),
        Line(f"Standard 3.0 m ({ft_in(3000)})", a.count(3000) * 2 + b.count(3000) * 2),
        Line("Ledger beam 3050 mm", lifts),
        Line("Single ledger 1655 mm", lifts),
        Line(FLIGHT_CODES[lift_mm], lifts),
        Line("Landing", lifts),
        Line("Handrail post", lifts),
        Line("Handrail", lifts),
        Line("Toeboard set", lifts),
        Line("Tie through both standards", lifts),
        Line("Guardrail frame, transverse", mid * guard_rows, "draft quantity"),
        Line("Guardrail frame, longitudinal", mid * guard_rows, "draft quantity"),
        Line("Top guardrail set, both directions", 1, "top-lift variant"),
        Line("Top toeboard set", 1, "top-lift variant"),
        Line("Top guard frame or safety gate", 1, "top-lift variant"),
    ]
    if orientation == "length_against":
        bom += [Line("Side-exit guardrail section (2210 or 2357 mm)", 1, "access point, length against the scaffold"),
                Line("Guardrail post or intermediate standard", 1, "carries the side-exit section")]
    bom.append(Line("Link tube and couplers to the scaffold", None, "TBC: levels, lengths and couplers not yet confirmed"))
    bom = [l for l in bom if l.qty != 0]
    return HakiResult(status="ok", lifts=lifts, built_mm=built, overshoot_mm=built - target_mm,
                      standards_top_mm=top, projection_mm=projection,
                      corner_stacks={"two corners starting 6 ft": a, "two corners starting 10 ft": b},
                      bom=bom, warnings=["Component quantities are a draft until signed off by a HAKI-trained scaffolder."])

def price(result: HakiResult, mode: str, *, target_m=None, per_metre=None, unit_prices: dict | None = None):
    if result.status != "ok":
        raise HakiInputError(result.message)
    if mode == "height":
        # placeholder: £ per metre x TARGET height until the open question is answered
        return (Decimal(str(per_metre)) * Decimal(str(target_m))).quantize(Decimal("0.01"))
    if mode == "component":
        total, missing = Decimal("0"), []
        for l in result.bom:
            if l.qty is None:
                continue
            if l.item not in (unit_prices or {}):
                missing.append(l.item); continue
            total += Decimal(str(unit_prices[l.item])) * l.qty
        if missing:
            raise HakiInputError("No unit price for: " + ", ".join(missing))
        return total.quantize(Decimal("0.01"))
    raise HakiInputError("Pricing mode must be height or component.")
