import sys
import unittest
from decimal import Decimal
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import calculadora_monetizacao as finance


class MonetizationTests(unittest.TestCase):
    def scenario(self, **changes):
        values = dict(
            provider="b2", gb_month=Decimal(10), usd_brl=Decimal("5.34"),
            eligible=True, views_long=Decimal(0), rpm_long=Decimal(10),
            views_shorts=Decimal(0), rpm_shorts=Decimal(0),
            additional_cost=Decimal(100), other_actual_revenue=Decimal(0),
            taxes_rate=Decimal("0.20"), own_hours=Decimal(0),
            hour_rate=Decimal(0), economic_allocations=Decimal(0),
        )
        values.update(changes)
        return finance.model(**values)

    def test_breakeven_covers_taxes_on_the_revenue_needed_for_costs(self):
        result = self.scenario()
        self.assertEqual(result["long_views_for_breakeven"], Decimal(12500))
        at_threshold = self.scenario(views_long=Decimal(12500))
        below_threshold = self.scenario(views_long=Decimal(12499))
        self.assertEqual(at_threshold["cash_result_brl"], Decimal(0))
        self.assertLess(below_threshold["cash_result_brl"], 0)

    def test_breakeven_rounds_up_to_whole_views(self):
        result = self.scenario(
            additional_cost=Decimal("2.48"), rpm_long=Decimal(6),
            taxes_rate=Decimal("0.10"),
        )
        self.assertEqual(result["long_views_for_breakeven"], Decimal(460))

    def test_storage_and_breakeven_use_the_same_cents_shown_to_the_operator(self):
        result = self.scenario(gb_month=Decimal(50), additional_cost=Decimal(1),
                               rpm_long=Decimal(6), taxes_rate=Decimal("0.10"))
        self.assertEqual(result["backup_brl"], Decimal("1.48"))
        self.assertEqual(result["additional_cash_cost_brl"], Decimal("2.48"))
        self.assertEqual(result["long_views_for_breakeven"], Decimal(460))

    def test_each_format_revenue_is_rounded_to_cents_before_tax(self):
        result = self.scenario(views_long=Decimal(1), rpm_long=Decimal(6),
                               views_shorts=Decimal(1), rpm_shorts=Decimal(6),
                               taxes_rate=Decimal("0.10"))
        self.assertEqual(result["gross_revenue_brl"], Decimal("0.02"))
        self.assertEqual(result["taxes_brl"], Decimal("0.00"))

    def test_full_tax_rate_has_no_positive_net_rpm(self):
        self.assertIsNone(self.scenario(taxes_rate=Decimal(1))["long_views_for_breakeven"])

    def test_ineligible_youtube_revenue_stays_zero_even_with_views(self):
        result = self.scenario(eligible=False, views_long=Decimal(1000000))
        self.assertEqual(result["gross_revenue_brl"], 0)
        self.assertIsNone(result["long_views_for_breakeven"])

    def test_confirmed_other_platform_revenue_is_separate_from_ypp(self):
        result = self.scenario(eligible=False, other_actual_revenue=Decimal(50))
        self.assertEqual(result["gross_revenue_brl"], Decimal(50))

    def test_non_finite_values_are_rejected_with_a_validation_error(self):
        for field in ("gb_month", "usd_brl", "views_long", "taxes_rate"):
            for value in ("NaN", "Infinity", "-Infinity"):
                with self.subTest(field=field, value=value), self.assertRaises(ValueError):
                    self.scenario(**{field: Decimal(value)})

    def test_storage_api_rejects_non_finite_volume(self):
        for value in ("NaN", "Infinity"):
            with self.subTest(value=value), self.assertRaises(ValueError):
                finance.storage_cost_usd("b2", Decimal(value))

    def test_exchange_rate_must_be_positive(self):
        with self.assertRaises(ValueError):
            self.scenario(usd_brl=Decimal(0))

    def test_negative_cost_and_tax_outside_range_are_rejected(self):
        for changes in ({"additional_cost": Decimal(-1)}, {"taxes_rate": Decimal("1.01")}):
            with self.subTest(changes=changes), self.assertRaises(ValueError):
                self.scenario(**changes)


if __name__ == "__main__":
    unittest.main()
