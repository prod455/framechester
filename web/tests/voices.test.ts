import test from 'node:test';
import assert from 'node:assert/strict';
import { commercialVoiceError, productionLanguage, voiceFor } from '../shared/voices.ts';
import { defaultConfig } from '../server/store.ts';

test('only the reviewed Kokoro voices are accepted, with required local files', () => {
  for (const voiceName of ['pf_dora', 'pm_alex', 'pm_santa', 'af_heart', 'am_michael', 'ef_dora'])
    assert.equal(commercialVoiceError({ ...defaultConfig().tts, voiceName }), undefined);
  for (const voiceName of ['pt_BR-faber-medium', 'bf_emma', 'am_adam', 'custom', 'pf_dora+pm_alex'])
    assert.match(commercialVoiceError({ ...defaultConfig().tts, voiceName })!, /comercial/);
  assert.match(commercialVoiceError({ ...defaultConfig().tts, engine: 'piper' })!, /bloqueadas/);
  assert.match(commercialVoiceError({ ...defaultConfig().tts, voiceStyles: '' })!, /Configure/);
});

test('the voice follows the channel language and never rescues an unreviewed one', () => {
  const english = productionLanguage('en-US')!;
  assert.equal(voiceFor('pf_dora', english), 'af_heart', 'A Portuguese voice gives way');
  assert.equal(voiceFor('am_michael', english), 'am_michael', 'The chosen voice of the language stays');
  assert.equal(voiceFor('pt_BR-faber-medium', english), 'pt_BR-faber-medium', 'Left for the refusal');
  assert.equal(productionLanguage('es-MX')?.tag, 'es');
  assert.equal(productionLanguage('pt')?.tag, 'pt-BR');
  assert.equal(productionLanguage('de-DE'), undefined, 'No reviewed German voice');
});
