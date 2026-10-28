import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialVoiceError } from '../shared/voices.ts';
import { defaultConfig } from '../server/store.ts';

test('only the three reviewed PT-BR voices are accepted, with required local files', () => {
  for (const voiceName of ['pf_dora', 'pm_alex', 'pm_santa'])
    assert.equal(commercialVoiceError({ ...defaultConfig().tts, voiceName }), undefined);
  for (const voiceName of ['pt_BR-faber-medium', 'af_heart', 'custom', 'pf_dora+pm_alex'])
    assert.match(commercialVoiceError({ ...defaultConfig().tts, voiceName })!, /comercial/);
  assert.match(commercialVoiceError({ ...defaultConfig().tts, engine: 'piper' })!, /bloqueadas/);
  assert.match(commercialVoiceError({ ...defaultConfig().tts, voiceStyles: '' })!, /Configure/);
});
