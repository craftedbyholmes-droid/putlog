"""Lift layout for a tube-and-fitting scaffold. Only the bottom lift has a toggle
(7 ft / 2.0 m default, 10 ft / 3.0 m, or custom); every lift above it is the scaffold's lift height."""
from dataclasses import dataclass
from .units import to_mm, ft_in

SHEET_STANDARD_MAX_LIFT_MM = 2000   # used when no compliance sheet is recorded yet

@dataclass
class Option:
    kind: str            # below | level | above
    levels_mm: list
    first_lift_mm: int
    diff_mm: int         # top platform minus target (negative = below)
    step_warning: bool
    bespoke_design: bool

    def describe(self):
        lv = ", ".join(f"{x/1000:g} m" for x in self.levels_mm)
        return f"{self.kind}: levels {lv}; difference {self.diff_mm:+d} mm"

STEP_WARNING = "A single step up or down must be added on site using appropriate materials."

def layout(height_m, first_lift_m=2.0, lift_m=2.0, step_limit_mm=200, sheet_max_lift_mm=None):
    H, F, L = to_mm(height_m), to_mm(first_lift_m), to_mm(lift_m)
    sheet_max = sheet_max_lift_mm or SHEET_STANDARD_MAX_LIFT_MM
    if F <= 0 or L <= 0 or H < F:
        raise ValueError("Height must be at least the first lift.")
    def levels(first, top_limit):
        out, x = [], first
        while x <= top_limit:
            out.append(x); x += L
        return out
    rem = (H - F) % L
    def opt(kind, lv, first):
        diff = lv[-1] - H
        return Option(kind, lv, first, diff, abs(diff) > step_limit_mm, first > sheet_max)
    if rem == 0:
        return [opt("level", levels(F, H), F)]
    below = levels(F, H)
    above = below + [below[-1] + L]
    raised_first = F + rem                          # level by taking the remainder in the bottom lift
    return [opt("below", below, F),
            opt("level", levels(raised_first, H), raised_first),
            opt("above", above, F)]
