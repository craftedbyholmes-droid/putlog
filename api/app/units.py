"""Heights are held as whole millimetres to avoid floating-point drift. The trade talks in feet."""
from decimal import Decimal, ROUND_HALF_UP

def to_mm(metres) -> int:
    return int((Decimal(str(metres)) * 1000).to_integral_value(ROUND_HALF_UP))

def ft_in(mm: int) -> str:
    inches = int((Decimal(mm) / Decimal("25.4")).to_integral_value(ROUND_HALF_UP))
    ft, inch = divmod(inches, 12)
    return f"{ft} ft {inch} in" if inch else f"{ft} ft"

def m(mm: int) -> str:
    return f"{Decimal(mm) / 1000:.2f} m".replace(".00 m", ".0 m")
