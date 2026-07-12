import os
import sys
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from core.utils.phone import normalize_phone


class NormalizePhoneTest(unittest.TestCase):
    def test_ru_with_plus7(self):
        self.assertEqual(normalize_phone("+7 (922) 018-64-44"), "79220186444")

    def test_ru_domestic_8(self):
        self.assertEqual(normalize_phone("89220186444"), "79220186444")

    def test_ru_kz_11_digit_7(self):
        self.assertEqual(normalize_phone("79220186444"), "79220186444")

    def test_ru_10_digit_no_country(self):
        self.assertEqual(normalize_phone("9220186444"), "79220186444")

    def test_uk_foreign(self):
        self.assertEqual(normalize_phone("+44 7871 909099"), "447871909099")

    def test_kz_with_plus7(self):
        self.assertEqual(normalize_phone("+7 707 619 1694"), "77076191694")

    def test_too_short(self):
        self.assertIsNone(normalize_phone("123"))

    def test_none_input(self):
        self.assertIsNone(normalize_phone(None))

    def test_empty_string(self):
        self.assertIsNone(normalize_phone(""))


if __name__ == "__main__":
    unittest.main()
