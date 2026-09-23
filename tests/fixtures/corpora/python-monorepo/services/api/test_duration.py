import unittest

from services.api.duration import parse


class DurationTest(unittest.TestCase):
    def test_parses_plain_seconds(
        self,
    ):
        # A multi-line `def` signature: v2.83.0's eba8553 told thirteen such tests
        # they "cannot go red" because the signature wrapped.
        self.assertEqual(parse("90"), 90)

    def test_rejects_negative(self):
        with self.assertRaises(ValueError):
            parse("-5")
