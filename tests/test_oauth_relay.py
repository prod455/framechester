"""The public TikTok OAuth relay page (docs/oauth/tiktok/index.html) stays inert and safe."""
import base64
import hashlib
import re
import unittest
from pathlib import Path

PAGE = Path(__file__).resolve().parents[1] / "docs" / "oauth" / "tiktok" / "index.html"


class OAuthRelayPage(unittest.TestCase):
    def setUp(self):
        self.html = PAGE.read_text(encoding="utf-8")

    def test_the_csp_hash_matches_the_only_inline_script(self):
        scripts = re.findall(r"<script>(.*?)</script>", self.html, re.S)
        self.assertEqual(len(scripts), 1)
        digest = base64.b64encode(hashlib.sha256(scripts[0].encode("utf-8")).digest()).decode()
        self.assertIn(f"script-src 'sha256-{digest}'", self.html, "edit the script, then update its CSP hash")
        self.assertIn("default-src 'none'", self.html)

    def test_it_forwards_only_to_this_computer_and_never_leaks_the_code(self):
        self.assertIn('<meta name="referrer" content="no-referrer">', self.html)
        targets = re.findall(r"'(https?://[^']+)'", self.html)
        self.assertEqual(targets, ["http://127.0.0.1:"], "the only destination is the local Studio")
        self.assertNotRegex(self.html, r"<script[^>]+src=|fetch\(|XMLHttpRequest|sendBeacon")
        self.assertIn("location.replace(target)", self.html)
        self.assertIn(r"/^(\d{2,5})\.[0-9a-f]{48}$/", self.html, "only a state minted by the Studio is accepted")


if __name__ == "__main__":
    unittest.main()
