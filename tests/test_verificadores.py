import json
import sys
import tempfile
import unittest
from pathlib import Path

SCRIPTS = Path(__file__).resolve().parents[1] / "scripts"
sys.path.insert(0, str(SCRIPTS))

import verificar_anthropic as anthropic
import verificar_backup as backup
import verificar_youtube as youtube


class AnthropicTests(unittest.TestCase):
    def test_describe_secret_never_returns_value(self):
        secret = "sk-ant-api03-segredo-que-nao-pode-vazar"
        described = anthropic.describe_secret(secret)
        self.assertNotIn("segredo", described)
        self.assertIn(str(len(secret)), described)

    def test_find_key_prefers_anthropic_var(self):
        name, value = anthropic.find_key({"ANTHROPIC_API_KEY": "a" * 30, "CLAUDE_API_KEY": "b" * 30})
        self.assertEqual(name, "ANTHROPIC_API_KEY")
        self.assertEqual(value, "a" * 30)

    def test_validate_key_format_rejects_oauth_token(self):
        problems = anthropic.validate_key_format("sk-ant-oat01" + "x" * 30)
        self.assertTrue(any("OAuth" in problem for problem in problems))

    def test_validate_key_format_accepts_api_key(self):
        self.assertEqual(anthropic.validate_key_format("sk-ant-api03-" + "x" * 40), [])

    def test_model_ids_and_suggestion(self):
        payload = {"data": [{"id": "claude-haiku-x"}, {"id": "claude-sonnet-y"}]}
        ids = anthropic.model_ids(payload)
        self.assertEqual(ids, ["claude-haiku-x", "claude-sonnet-y"])
        self.assertEqual(anthropic.suggest_model(ids), "claude-sonnet-y")


class YoutubeTests(unittest.TestCase):
    def test_parse_client_secret_installed(self):
        kind, block = youtube.parse_client_secret(
            {"installed": {"client_id": "id", "client_secret": "secret"}}
        )
        self.assertEqual(kind, "installed")
        self.assertEqual(block["client_id"], "id")

    def test_parse_client_secret_rejects_incomplete(self):
        with self.assertRaises(ValueError):
            youtube.parse_client_secret({"installed": {"client_id": "id"}})

    def test_parse_client_secret_rejects_non_object(self):
        with self.assertRaises(ValueError):
            youtube.parse_client_secret([])

    def test_build_auth_url_contains_scopes_and_state(self):
        url = youtube.build_auth_url("client", "http://127.0.0.1:8765/", "estado")
        self.assertIn("client_id=client", url)
        self.assertIn("state=estado", url)
        self.assertIn("access_type=offline", url)
        self.assertIn("youtube.upload", url)
        self.assertIn("yt-analytics.readonly", url)

    def test_missing_scopes(self):
        granted = " ".join(youtube.SCOPES[:2])
        self.assertEqual(youtube.missing_scopes(granted), [youtube.SCOPES[2]])

    def test_token_is_expired_handles_missing_expiry(self):
        self.assertTrue(youtube.token_is_expired({}))
        self.assertFalse(youtube.token_is_expired({"expires_at": 9999999999}))

    def test_write_private_json_roundtrip(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "sub" / "token.json"
            youtube.write_private_json(path, {"access_token": "x"})
            self.assertEqual(json.loads(path.read_text(encoding="utf-8"))["access_token"], "x")


class BackupTests(unittest.TestCase):
    def test_detect_provider(self):
        self.assertEqual(backup.detect_provider("b2:bucket:framechester"), "b2")
        self.assertEqual(backup.detect_provider("s3:https://endpoint/bucket"), "s3")
        self.assertEqual(backup.detect_provider("rest:http://host/"), "rest")
        self.assertEqual(backup.detect_provider("relativo/sem/sentido"), "desconhecido")

    def test_validate_repo_url(self):
        self.assertTrue(backup.validate_repo_url("b2:bucket:framechester")[0])
        self.assertFalse(backup.validate_repo_url("b2:")[0])
        self.assertTrue(backup.validate_repo_url("s3:https://endpoint/bucket")[0])
        self.assertFalse(backup.validate_repo_url("ftp://host/bucket")[0])

    def test_mask_repo_url_hides_credentials(self):
        masked = backup.mask_repo_url("s3:https://access:secret@endpoint/bucket")
        self.assertNotIn("secret", masked)
        self.assertNotIn("access:", masked)
        self.assertIn("endpoint/bucket", masked)

    def test_redact_removes_all_secret_values(self):
        env = {"RESTIC_PASSWORD": "senha-super-secreta", "B2_ACCOUNT_KEY": "chave-b2-secreta"}
        text = backup.redact("erro senha-super-secreta e chave-b2-secreta", env)
        self.assertNotIn("senha-super-secreta", text)
        self.assertNotIn("chave-b2-secreta", text)

    def test_validate_env_requires_provider_credentials(self):
        info, problems = backup.validate_env(
            {"RESTIC_REPOSITORY": "b2:bucket:path", "RESTIC_PASSWORD": "p"}
        )
        self.assertEqual(info["provider"], "b2")
        self.assertTrue(any("B2_ACCOUNT_ID" in problem for problem in problems))

    def test_validate_env_local_has_no_credential_requirement(self):
        with tempfile.TemporaryDirectory() as directory:
            info, problems = backup.validate_env(
                {"RESTIC_REPOSITORY": directory, "RESTIC_PASSWORD": "p"}
            )
        self.assertEqual(info["provider"], "local")
        self.assertEqual(problems, [])

    def test_parse_snapshot_id_reads_summary_line(self):
        output = (
            '{"message_type":"status"}\n'
            '{"message_type":"summary","snapshot_id":"abcdef123456"}\n'
        )
        self.assertEqual(backup.parse_snapshot_id(output), "abcdef123456")


if __name__ == "__main__":
    unittest.main()

