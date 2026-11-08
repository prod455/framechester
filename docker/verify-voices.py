"""Disposable CI smoke: real Rust narration, no accounts, keys or publication."""
import json
import os
import pathlib
import subprocess
import tempfile
import wave

assert os.getuid() != 0, "The narrator must stay non-root"
assert os.statvfs("/").f_flag & os.ST_RDONLY, "Root filesystem must stay read-only"
assert os.statvfs("/tmp").f_flag & os.ST_NOEXEC, "/tmp must stay noexec"
assert os.statvfs("/models").f_flag & os.ST_RDONLY, "Models must stay read-only"

doctor = subprocess.run(["framechester", "doctor", "--json"], capture_output=True, text=True, check=False)
assert next(check for check in json.loads(doctor.stdout)["checks"] if check["name"] == "commercial_voice")["ok"], doctor.stdout

with tempfile.TemporaryDirectory(prefix="fc-commercial-smoke-") as temporary:
    root = pathlib.Path(temporary)
    # One cited scene: enough for the motion engine to narrate and render.
    source = {"title": "Kokoro-82M", "url": "https://huggingface.co/hexgrad/Kokoro-82M", "publisher": "hexgrad", "retrieved_at": "2026-11-08", "license": "referencia documental"}
    claim = {"text": "Kokoro-82M is released under Apache-2.0.", "status": "cited", "source_urls": [source["url"]]}
    metrics = {key: 0.9 for key in ("acceleration", "demand", "alignment", "originality", "visual_feasibility", "timing", "cross_check")}
    topic = root / "topic.json"
    topic.write_text(json.dumps({"id": "voice-smoke", "title": "Voice smoke", "series": "ia", "angle": "smoke", "sources": [source], "claims": [claim], "metrics": metrics}), encoding="utf-8")
    script = root / "script.json"
    scene = {"id": 0, "heading": "Voz local", "narration": "A narração deste teste foi gerada localmente.", "visual_brief": "#destaque", "duration_hint_secs": 4.0}
    script.write_text(json.dumps({"topic_id": "voice-smoke", "script": {"title": "Voice smoke", "hook": "Voz local", "series": "ia", "format": "short", "cross_checked": True, "scenes": [scene], "sources": [source], "claims": [claim]}}), encoding="utf-8")
    inputs = ["--script", str(script), "--topic", str(topic)]
    for voice in ("pf_dora", "pm_alex", "pm_santa"):
        config = root / (voice + ".toml")
        config.write_text('[render]\nwidth=320\nheight=568\nfps=15\npreset="ultrafast"\n[tts]\nvoice_name="' + voice + '"\n', encoding="utf-8")
        output = root / voice
        result = subprocess.run(["framechester", "--config", str(config), "run", *inputs, "--format", "short", "--workdir", str(output), "--json"], capture_output=True, text=True, check=False)
        # The one-scene fixture may be blocked by QA;
        # this smoke verifies narration/render and never authorizes publication.
        assert result.returncode in (0, 2), result.stderr
        video = output / "render/final.mp4"
        assert video.is_file() and video.stat().st_size > 0
        with wave.open(str(next((output / "audio").glob("*.wav")))) as audio:
            assert audio.getframerate() == 24_000 and audio.getnframes() > 0
        subprocess.run(["ffmpeg", "-v", "error", "-i", str(video), "-f", "null", "-"], check=True, capture_output=True)
        print(voice + ": real Rust WAV/MP4 decoded successfully", flush=True)

    for engine, voice in (("kokoro", "pt_BR-faber-medium"), ("piper", "pf_dora"), ("kokoro", "unknown")):
        config = root / "denied.toml"
        config.write_text('[tts]\nengine="' + engine + '"\nvoice_name="' + voice + '"\n', encoding="utf-8")
        result = subprocess.run(["framechester", "--config", str(config), "run", *inputs, "--workdir", str(root / "denied")], capture_output=True, text=True, check=False)
        assert result.returncode != 0 and "comercial" in result.stderr
        assert not (root / "denied/render/final.mp4").exists()
print("Legacy and unreviewed voices rejected before render", flush=True)
