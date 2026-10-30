import hashlib
import importlib.util
import pathlib
import tempfile
import unittest
from unittest.mock import patch

ROOT = pathlib.Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("kokoro_tts", ROOT / "scripts/kokoro_tts.py")
tts = importlib.util.module_from_spec(spec)
spec.loader.exec_module(tts)


class CommercialVoices(unittest.TestCase):
    def test_rejects_unreviewed_voices_before_loading_any_files(self):
        for voice in ("pt_BR-faber-medium", "pt_BR-cadu-medium", "pt_BR-edresson-low", "af_heart", "pf_dora+pm_alex"):
            with self.subTest(voice=voice), self.assertRaisesRegex(ValueError, "catálogo comercial"):
                tts.validate("absent.onnx", "absent.bin", voice)

    def test_content_hashes_reject_replacements_even_with_the_same_size(self):
        with tempfile.TemporaryDirectory() as temporary:
            model = pathlib.Path(temporary) / "renamed.onnx"
            voices = pathlib.Path(temporary) / "renamed.bin"
            model.write_bytes(b"synthetic model")
            voices.write_bytes(b"synthetic voices")
            fixtures = {"model": (15, hashlib.sha256(model.read_bytes()).hexdigest()),
                        "voices": (16, hashlib.sha256(voices.read_bytes()).hexdigest())}
            with patch.dict(tts.FILES, fixtures):
                for voice in tts.VOICES:
                    tts.validate(model, voices, voice)
                model.write_bytes(b"changed model!!")
                with self.assertRaisesRegex(ValueError, "Hash"):
                    tts.validate(model, voices, "pf_dora")

    def test_real_unreviewed_assets_never_pass_by_filename(self):
        with tempfile.TemporaryDirectory() as temporary:
            path = pathlib.Path(temporary) / "kokoro-v1.0.onnx"
            path.write_bytes(b"synthetic unapproved bytes")
            with self.assertRaisesRegex(ValueError, "catálogo comercial"):
                tts.validate_file(path, "model")


if __name__ == "__main__":
    unittest.main()


setup_spec = importlib.util.spec_from_file_location("setup_voices", ROOT / "scripts/setup_voices.py")


class NarratorEnvironment(unittest.TestCase):
    def setUp(self):
        import sys
        sys.path.insert(0, str(ROOT / "scripts"))
        self.addCleanup(sys.path.remove, str(ROOT / "scripts"))
        self.setup = importlib.util.module_from_spec(setup_spec)
        setup_spec.loader.exec_module(self.setup)

    def test_an_interpreter_that_cannot_start_is_reported_as_broken(self):
        import sys
        self.assertTrue(self.setup.runs(sys.executable))
        self.assertFalse(self.setup.runs(pathlib.Path("C:/Python312-removido/python.exe")))

    def test_a_broken_environment_is_recreated_and_a_working_one_is_kept(self):
        for works, clear in ((False, True), (True, False)):
            with self.subTest(works=works), tempfile.TemporaryDirectory() as temporary:
                environment = pathlib.Path(temporary) / ".framechester/tts-venv"
                executable = self.setup.environment_python(environment)
                executable.parent.mkdir(parents=True)
                executable.write_bytes(b"")
                with patch.object(self.setup, "ROOT", pathlib.Path(temporary)), \
                        patch.object(self.setup, "runs", return_value=works), \
                        patch.object(self.setup.venv, "create") as create, \
                        patch.object(self.setup.subprocess, "run"), \
                        patch.object(self.setup, "download_models"), \
                        patch.object(self.setup.sys, "version_info", (3, 12, 0)), \
                        patch("sys.argv", ["setup_voices.py"]):
                    self.setup.main()
                create.assert_called_once_with(environment, with_pip=True, clear=clear)
