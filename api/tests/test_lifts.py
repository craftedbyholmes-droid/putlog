"""Acceptance test 23, amended: the toggle is on the bottom lift only."""
from app.lifts import layout

def lv(opts, kind="level"):
    return [x / 1000 for x in next(o for o in opts if o.kind == kind).levels_mm]

def test_23_default_and_examples():
    assert lv(layout(8.0)) == [2, 4, 6, 8]                              # default first lift 7 ft / 2.0 m
    assert lv(layout(7.0, first_lift_m=3.0)) == [3, 5, 7]
    assert lv(layout(8.5, first_lift_m=2.5)) == [2.5, 4.5, 6.5, 8.5]

def test_23_uneven_height_gives_three_options():
    opts = layout(7.5)                                                  # 2 m lifts
    assert [o.kind for o in opts] == ["below", "level", "above"]
    below, level, above = opts
    assert below.diff_mm == -1500 and below.step_warning
    assert above.diff_mm == 500 and above.step_warning
    assert level.diff_mm == 0 and level.first_lift_mm == 3500 and level.bespoke_design   # first lift over 2 m
    small = layout(8.15)
    assert next(o for o in small if o.kind == "below").diff_mm == -150
    assert not next(o for o in small if o.kind == "below").step_warning              # within 200 mm

def test_23_custom_first_lift_over_sheet_max_flags_bespoke():
    assert layout(7.0, first_lift_m=3.0)[0].bespoke_design
    assert not layout(8.0)[0].bespoke_design
