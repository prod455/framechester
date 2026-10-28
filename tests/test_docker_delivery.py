import fnmatch
import pathlib
import unittest

ROOT = pathlib.Path(__file__).resolve().parents[1]


def included_in_context(name):
    """Evaluate this repository's deliberately simple allowlist, in rule order."""
    included = True
    for raw in (ROOT / '.dockerignore').read_text(encoding='utf-8').splitlines():
        rule = raw.strip()
        if not rule or rule.startswith('#'):
            continue
        allow = rule.startswith('!')
        rule = rule.lstrip('!').rstrip('/')
        if fnmatch.fnmatchcase(name, rule) or name.startswith(rule + '/'):
            included = allow
    return included


class DockerDeliveryTests(unittest.TestCase):
    def test_context_excludes_private_and_operator_content_even_inside_source_trees(self):
        for name in ['.env', '.env.local', '.git/config', '.framechester/system-prompt.personal.md',
                     'PROMPT_CODEX_CLAUDE.txt', 'models/voice.onnx', 'data/state.json',
                     'artifacts/render/final.mp4', 'web/node_modules/private.js',
                     'web/server/.env', 'web/src/operator.key', 'web/src/real.mp4']:
            with self.subTest(name=name):
                self.assertFalse(included_in_context(name), name)
        for name in ['Cargo.lock', 'crates/framechester-cli/src/main.rs',
                     'web/package-lock.json', 'web/server/index.ts', 'web/src/main.ts']:
            self.assertTrue(included_in_context(name), name)

    def test_container_keeps_runtime_non_root_and_no_secret_or_voice_in_build(self):
        dockerfile = (ROOT / 'Dockerfile').read_text(encoding='utf-8')
        self.assertIn('cargo build --locked --release -p framechester-cli', dockerfile)
        self.assertIn('npm ci', dockerfile)
        self.assertIn('USER 1000:1000', dockerfile)
        self.assertNotIn('COPY . ', dockerfile)
        self.assertNotIn('ARG ANTHROPIC', dockerfile)
        self.assertNotIn('download_voices', dockerfile)
        self.assertIn('tts-requirements.txt', dockerfile)

    def test_compose_limits_exposure_and_preserves_data_separately_from_image(self):
        compose = (ROOT / 'compose.yaml').read_text(encoding='utf-8')
        for contract in ['127.0.0.1:${FRAMECHESTER_HTTP_PORT:-4317}:4317',
                         'read_only: true', 'init: true', 'no-new-privileges:true',
                         'cap_drop:', 'ALL', 'studio-data:/data', '/models',
                         'FRAMECHESTER_VAULT_KEY_FILE: /run/secrets/vault_key',
                         'FRAMECHESTER_DOCKER_VAULT_KEY_FILE:?']:
            self.assertIn(contract, compose)
        for forbidden in ['privileged: true', '/var/run/docker.sock', 'network_mode: host',
                          'ANTHROPIC_API_KEY:', 'OPENAI_API_KEY:']:
            self.assertNotIn(forbidden, compose)

    def test_commercial_narrator_requirements_pin_all_packages_with_integrity_hashes(self):
        requirements = (ROOT / 'docker' / 'tts-requirements.txt').read_text(encoding='utf-8')
        self.assertIn('kokoro-onnx==0.6.1', requirements)
        self.assertIn('--hash=sha256:', requirements)
        self.assertNotIn('>=', requirements)
        self.assertIn('onnxruntime==', requirements)


if __name__ == '__main__':
    unittest.main()
