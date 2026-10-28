import contextlib
import io
import json
import os
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import verificar_youtube as youtube


CHANNEL_A = "UC" + "a" * 22
CHANNEL_B = "UC" + "b" * 22
CLIENT = {"installed": {"client_id": "fixture-client", "client_secret": "fixture-secret"}}


class YoutubeMultichannelTests(unittest.TestCase):
    def setUp(self):
        self.directory = tempfile.TemporaryDirectory()
        self.addCleanup(self.directory.cleanup)
        self.base = Path(self.directory.name)
        environment = patch.dict(os.environ, {
            "FRAMECHESTER_HOME": str(self.base),
            "YOUTUBE_TOKEN_FILE": str(self.base / "legacy-token.json"),
            "YOUTUBE_CLIENT_SECRET": str(self.base / "legacy-client.json"),
        })
        environment.start()
        self.addCleanup(environment.stop)
        network = patch.object(youtube.urllib.request, "urlopen", side_effect=AssertionError("network disabled"))
        network.start()
        self.addCleanup(network.stop)
        self.output = io.StringIO()
        redirect = contextlib.redirect_stdout(self.output)
        redirect.__enter__()
        self.addCleanup(redirect.__exit__, None, None, None)

    def credentials(self, slug="science", token=None):
        channel_directory = self.base / "channels" / slug
        channel_directory.mkdir(parents=True, exist_ok=True)
        client_path = channel_directory / "client_secret.json"
        client_path.write_text(json.dumps(CLIENT), encoding="utf-8")
        token_file = channel_directory / "youtube_token.json"
        if token is not None:
            token_file.write_text(json.dumps(token), encoding="utf-8")
        return client_path, token_file

    def token(self, bound=None, expired=False):
        result = {"access_token": "fixture-access", "refresh_token": "fixture-refresh",
                  "expires_at": 0 if expired else 9999999999,
                  "scope": " ".join(youtube.SCOPES)}
        if bound:
            result["youtube_channel_id"] = bound
        return result

    def response(self, channel_id=CHANNEL_A):
        return {"items": [{"id": channel_id, "snippet": {"title": "Fixture"}}]}

    def test_paths_are_scoped_and_global_environment_is_ignored(self):
        self.assertEqual(youtube.token_path(None, channel="science"),
                         self.base / "channels" / "science" / "youtube_token.json")
        self.assertEqual(youtube.client_secret_path(None, channel="science"),
                         self.base / "channels" / "science" / "client_secret.json")
        self.assertNotEqual(youtube.token_path(None, channel="science"),
                            youtube.token_path(None, channel="technology"))

    def test_legacy_paths_still_use_environment(self):
        self.assertEqual(youtube.token_path(None), self.base / "legacy-token.json")
        self.assertEqual(youtube.client_secret_path(None), self.base / "legacy-client.json")

    def test_invalid_slugs_are_rejected_without_network(self):
        for slug in ("../other", "a/b", "a\\b", ".", "", "Science", "con", "a" * 65):
            with self.subTest(slug=slug), self.assertRaises(ValueError):
                youtube.token_path(None, channel=slug)
        self.assertFalse((self.base / "channels").exists())

    def test_explicit_paths_cannot_escape_channel(self):
        for resolver in (youtube.token_path, youtube.client_secret_path):
            with self.subTest(resolver=resolver.__name__), self.assertRaises(ValueError):
                resolver(str(self.base / "elsewhere.json"), channel="science")
        expected = self.base / "channels" / "science" / "custom.json"
        self.assertEqual(youtube.token_path(str(expected), channel="science"), expected)

    def test_auth_and_check_require_expected_identity_before_actions(self):
        for mode in ("--auth", "--check"):
            with self.subTest(mode=mode), patch.object(youtube, "run_oauth_flow") as oauth, \
                    patch.object(youtube, "fetch_channel") as fetch, \
                    contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                youtube.main([mode, "--channel", "science"])
            self.assertEqual(error.exception.code, 2)
            oauth.assert_not_called()
            fetch.assert_not_called()

    def test_config_does_not_require_expected_identity(self):
        self.credentials()
        with patch.object(youtube, "run_oauth_flow") as oauth:
            self.assertEqual(youtube.main(["--config", "--channel", "science"]), 0)
        oauth.assert_not_called()

    def test_auth_verifies_identity_before_persisting_and_binds_token(self):
        _, token_file = self.credentials()
        def fetch(_access):
            self.assertFalse(token_file.exists())
            return 200, self.response()
        with patch.object(youtube, "run_oauth_flow", return_value=self.token()) as oauth, \
                patch.object(youtube, "fetch_channel", side_effect=fetch):
            result = youtube.main(["--auth", "--channel", "science",
                                   "--expected-channel-id", CHANNEL_A])
        self.assertEqual(result, 0)
        oauth.assert_called_once()
        saved = json.loads(token_file.read_text(encoding="utf-8"))
        self.assertEqual(saved["youtube_channel_id"], CHANNEL_A)
        for private_value in (CHANNEL_A, "fixture-access", "fixture-refresh", "fixture-secret"):
            self.assertNotIn(private_value, self.output.getvalue())

    def test_auth_wrong_missing_or_ambiguous_channel_never_replaces_existing_token(self):
        _, token_file = self.credentials(token=self.token(CHANNEL_A))
        original = token_file.read_bytes()
        bad_payloads = (self.response(CHANNEL_B), {"items": []},
                        {"items": self.response()["items"] + self.response(CHANNEL_B)["items"]})
        for payload in bad_payloads:
            with self.subTest(payload=payload), \
                    patch.object(youtube, "run_oauth_flow", return_value=self.token()), \
                    patch.object(youtube, "fetch_channel", return_value=(200, payload)):
                result = youtube.main(["--auth", "--channel", "science",
                                       "--expected-channel-id", CHANNEL_A])
            self.assertNotEqual(result, 0)
            self.assertEqual(token_file.read_bytes(), original)

    def test_auth_http_failure_does_not_save_token(self):
        _, token_file = self.credentials()
        with patch.object(youtube, "run_oauth_flow", return_value=self.token()), \
                patch.object(youtube, "fetch_channel", return_value=(403, {})):
            self.assertNotEqual(youtube.main(["--auth", "--channel", "science",
                                             "--expected-channel-id", CHANNEL_A]), 0)
        self.assertFalse(token_file.exists())

    def test_check_rejects_saved_binding_mismatch_before_refresh_or_network(self):
        _, token_file = self.credentials(token=self.token(CHANNEL_B, expired=True))
        original = token_file.read_bytes()
        with patch.object(youtube, "refresh_token") as refresh, \
                patch.object(youtube, "fetch_channel") as fetch:
            result = youtube.main(["--check", "--channel", "science",
                                   "--expected-channel-id", CHANNEL_A])
        self.assertNotEqual(result, 0)
        refresh.assert_not_called()
        fetch.assert_not_called()
        self.assertEqual(token_file.read_bytes(), original)

    def test_check_refresh_mismatch_preserves_disk_token(self):
        _, token_file = self.credentials(token=self.token(CHANNEL_A, expired=True))
        original = token_file.read_bytes()
        with patch.object(youtube, "refresh_token", return_value=self.token(CHANNEL_A)), \
                patch.object(youtube, "fetch_channel", return_value=(200, self.response(CHANNEL_B))):
            self.assertNotEqual(youtube.main(["--check", "--channel", "science",
                                             "--expected-channel-id", CHANNEL_A]), 0)
        self.assertEqual(token_file.read_bytes(), original)

    def test_check_binds_unbound_token_only_after_identity_verification(self):
        _, token_file = self.credentials(token=self.token())
        with patch.object(youtube, "fetch_channel", return_value=(200, self.response())):
            self.assertEqual(youtube.main(["--check", "--channel", "science",
                                           "--expected-channel-id", CHANNEL_A]), 0)
        self.assertEqual(json.loads(token_file.read_text())["youtube_channel_id"], CHANNEL_A)

    def test_check_refresh_persists_only_after_identity_is_confirmed(self):
        _, token_file = self.credentials(token=self.token(CHANNEL_A, expired=True))
        original = token_file.read_bytes()
        def fetch(_access):
            self.assertEqual(token_file.read_bytes(), original)
            return 200, self.response()
        renewed = self.token(CHANNEL_A)
        renewed["access_token"] = "fixture-renewed"
        with patch.object(youtube, "refresh_token", return_value=renewed), \
                patch.object(youtube, "fetch_channel", side_effect=fetch):
            self.assertEqual(youtube.main(["--check", "--channel", "science",
                                           "--expected-channel-id", CHANNEL_A]), 0)
        self.assertEqual(json.loads(token_file.read_text())["access_token"], "fixture-renewed")

    def test_other_channel_token_is_never_used_as_fallback(self):
        self.credentials()
        self.credentials("technology", token=self.token(CHANNEL_B))
        (self.base / "legacy-token.json").write_text(json.dumps(self.token(CHANNEL_A)), encoding="utf-8")
        with patch.object(youtube, "fetch_channel") as fetch:
            self.assertNotEqual(youtube.main(["--check", "--channel", "science",
                                             "--expected-channel-id", CHANNEL_A]), 0)
        fetch.assert_not_called()

    def test_default_existing_channel_token_also_requires_expected_identity(self):
        self.credentials(token=self.token(CHANNEL_A))
        with patch.object(youtube, "fetch_channel") as fetch, \
                contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
            youtube.main(["--channel", "science"])
        self.assertEqual(error.exception.code, 2)
        fetch.assert_not_called()

    def test_legacy_check_still_succeeds_without_expected_identity(self):
        client_path = self.base / "legacy-client.json"
        token_file = self.base / "legacy-token.json"
        client_path.write_text(json.dumps(CLIENT), encoding="utf-8")
        token_file.write_text(json.dumps(self.token()), encoding="utf-8")
        with patch.object(youtube, "fetch_channel", return_value=(200, self.response())):
            self.assertEqual(youtube.main(["--check"]), 0)

    def test_client_and_token_paths_cannot_refer_to_same_file_in_scoped_or_legacy_mode(self):
        scoped_client, _ = self.credentials()
        legacy_client = self.base / "legacy-client.json"
        legacy_client.write_text(json.dumps(CLIENT), encoding="utf-8")
        for channel, client_path in (("science", scoped_client), (None, legacy_client)):
            original = client_path.read_bytes()
            arguments = ["--auth", "--token-file", str(client_path)]
            if channel:
                arguments += ["--channel", channel, "--expected-channel-id", CHANNEL_A]
            with self.subTest(channel=channel):
                with patch.object(youtube, "run_oauth_flow", return_value=self.token()) as oauth, \
                        patch.object(youtube, "fetch_channel", return_value=(200, self.response())) as fetch, \
                        contextlib.redirect_stderr(io.StringIO()), self.assertRaises(SystemExit) as error:
                    youtube.main(arguments)
                self.assertEqual(error.exception.code, 2)
                oauth.assert_not_called()
                fetch.assert_not_called()
                self.assertEqual(client_path.read_bytes(), original)

    def test_refresh_does_not_invent_unknown_scopes_and_check_warns(self):
        token = self.token(CHANNEL_A, expired=True)
        del token["scope"]
        _, token_file = self.credentials(token=token)
        with patch.object(youtube, "post_form", return_value=(200, {
                "access_token": "fixture-refreshed", "expires_in": 3600})), \
                patch.object(youtube, "fetch_channel", return_value=(200, self.response())):
            self.assertEqual(youtube.main(["--check", "--channel", "science",
                                           "--expected-channel-id", CHANNEL_A]), 0)
        self.assertNotIn("scope", json.loads(token_file.read_text()))
        self.assertIn("AVISO: escopos ausentes:", self.output.getvalue())
        for scope in youtube.SCOPES:
            self.assertIn(scope, self.output.getvalue())


if __name__ == "__main__":
    unittest.main()
