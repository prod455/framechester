import contextlib
import io
import json
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import verificar_backup as backup


class BackupRestoreCheckTests(unittest.TestCase):
    def run_fixture(self, returncode=0, stderr="", corrupt=None, missing=None):
        with tempfile.TemporaryDirectory(prefix="fc-restore-test-") as directory:
            root = Path(directory).resolve()
            native_mkdtemp = tempfile.mkdtemp
            source = None
            commands = []
            output = io.StringIO()

            def scoped_mkdtemp(prefix):
                path = Path(native_mkdtemp(prefix=prefix, dir=root)).resolve()
                self.assertTrue(path.is_relative_to(root))
                return str(path)

            def fake_restic(args, _env):
                nonlocal source
                commands.append(args[0])
                if args[0] == "backup":
                    source = Path(args[-1])
                    return subprocess.CompletedProcess(args, 0, json.dumps({
                        "message_type": "summary", "snapshot_id": "fixture-snapshot"}), "")
                if args[0] == "restore":
                    target = Path(args[args.index("--target") + 1]) / "restored-source"
                    target.mkdir()
                    for original in source.iterdir():
                        if original.name == missing:
                            continue
                        restored = target / original.name
                        shutil.copyfile(original, restored)
                        if original.name == corrupt:
                            restored.write_bytes(b"fixture-corrupted-content")
                    return subprocess.CompletedProcess(args, returncode, "", stderr)
                if args[0] == "forget":
                    return subprocess.CompletedProcess(args, 0, "", "")
                raise AssertionError("Unexpected restic operation")

            environment = {"RESTIC_REPOSITORY": str(root / "fixture-repository"),
                           "RESTIC_PASSWORD": "fixture-password"}
            with patch.object(backup.tempfile, "mkdtemp", side_effect=scoped_mkdtemp), \
                    patch.object(backup, "run_restic", side_effect=fake_restic), \
                    contextlib.redirect_stdout(output):
                result = backup.command_restore_check(environment, confirmed=True)
            return result, output.getvalue(), commands

    def test_nonzero_restore_is_failure_even_when_both_fixture_hashes_match(self):
        for stderr in (
            "failed to restore timestamp",
            "failed to restore timestamp; missing metadata blob",
            "failed to restore permissions",
        ):
            with self.subTest(stderr=stderr):
                result, output, commands = self.run_fixture(returncode=1, stderr=stderr)
                self.assertEqual(result, 4)
                self.assertNotIn("Restore: OK", output)
                self.assertNotIn("AVISO: restic reportou erro de timestamp", output)
                self.assertNotIn("forget", commands)

    def test_zero_exit_with_matching_fixtures_succeeds(self):
        result, output, commands = self.run_fixture()
        self.assertEqual(result, 0)
        self.assertIn("Restore: OK; SHA-256 identico para os 2 arquivos sinteticos.", output)
        self.assertIn("forget", commands)

    def test_zero_exit_still_requires_every_fixture_to_exist_and_match(self):
        for name in ("verificacao.txt", "blob.bin"):
            with self.subTest(corrupt=name):
                result, output, commands = self.run_fixture(corrupt=name)
                self.assertEqual(result, 4)
                self.assertIn("hash divergente", output)
                self.assertNotIn("forget", commands)
            with self.subTest(missing=name):
                result, output, commands = self.run_fixture(missing=name)
                self.assertEqual(result, 4)
                self.assertIn("nao restaurado", output)
                self.assertNotIn("forget", commands)


if __name__ == "__main__":
    unittest.main()
