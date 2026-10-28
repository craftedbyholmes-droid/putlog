"""Acceptance tests 8, 9, 10 and 11."""
import pytest
from app.haki import calculate, price, HakiInputError, CAP_MM

WORKED = [  # target, lift, lifts, built (m)
    (6.0, 2.0, 3, 6.5), (5.0, 2.0, 3, 6.5), (4.5, 1.5, 3, 5.0), (3.5, 1.0, 3, 3.5), (2.5, 2.0, 1, 2.5)]

@pytest.mark.parametrize("target,lift,lifts,built", WORKED)
def test_08_worked_examples(target, lift, lifts, built):
    r = calculate(target, lift, "width_against")
    assert r.status == "ok" and r.lifts == lifts and r.built_mm == int(built * 1000)
    assert r.overshoot_mm == int(round((built - target) * 1000))

@pytest.mark.parametrize("bad", [0.5, 0.4, 0])
def test_08_rejects_half_metre_or_less(bad):
    with pytest.raises(HakiInputError):
        calculate(bad, 2.0, "width_against")

def count(r, name):
    return sum(l.qty or 0 for l in r.bom if l.item.startswith(name))

@pytest.mark.parametrize("target", [1.0, 2.5, 6.0, 9.7, 14.0, 22.3, 30.0])
@pytest.mark.parametrize("lift", [1.0, 1.5, 2.0])
@pytest.mark.parametrize("orientation", ["width_against", "length_against"])
def test_09_structure(target, lift, orientation):
    r = calculate(target, lift, orientation)
    if r.status != "ok":
        return
    assert count(r, "Entrance step") == 1
    assert count(r, "Top guard frame") == 1 and count(r, "Top guardrail set") == 1
    assert (count(r, "Side-exit") == 1) == (orientation == "length_against")
    assert r.projection_mm >= 1219
    a, b = r.corner_stacks.values()
    assert sum(a) == sum(b) == r.standards_top_mm          # all four tops level
    assert a[0] == 2000 and b[0] == 3000                     # staggered start, 6 ft and 10 ft

def test_09_the_6_5_m_example():
    r = calculate(6.0, 2.0, "width_against")
    assert r.built_mm == 6500 and r.standards_top_mm == 8000 and r.projection_mm == 1500
    assert r.corner_stacks == {"two corners starting 6 ft": [2000, 3000, 3000],
                               "two corners starting 10 ft": [3000, 3000, 2000]}

def test_10_cap():
    r = calculate(31.0, 2.0, "width_against")
    assert r.status == "contact_haki" and r.bom == [] and "contact HAKI" in r.message
    assert calculate(30.4, 2.0, "width_against").status == "contact_haki"   # built 30.5 m is over 30.48 m
    assert calculate(30.0, 1.5, "width_against").status == "contact_haki"  # 0.5 + 20 x 1.5 = 30.5 m built
    assert calculate(29.0, 1.5, "width_against").status == "ok"            # 0.5 + 19 x 1.5 = 29.0 m built

def test_11_pricing_modes():
    r = calculate(6.0, 2.0, "width_against")
    assert str(price(r, "height", target_m=6.0, per_metre=45)) == "270.00"      # placeholder: target height
    prices = {l.item: 1 for l in r.bom if l.qty is not None}
    expected = sum(l.qty for l in r.bom if l.qty is not None)
    assert price(r, "component", unit_prices=prices) == expected
    with pytest.raises(HakiInputError):
        price(r, "component", unit_prices={})                                   # missing prices are named, not zeroed
    with pytest.raises(HakiInputError):
        price(calculate(40, 2.0, "width_against"), "height", target_m=40, per_metre=45)
