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
