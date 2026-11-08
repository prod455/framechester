// QA técnico do Framechester (duração, resolução, fps, codec, áudio, quadros pretos e
// congelados) no perfil de Short. Sem passar, o vídeo não segue para envio.
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './comum.mjs';

const REPO = join(RAIZ, '..');

export function comandoDoQa(
  video,
  { ambiente = process.env, existe = existsSync, windows = process.platform === 'win32' } = {},
) {
  const args = ['qa', '--format', 'short', '--video', video];
  if (ambiente.FRAMECHESTER_BIN) return [ambiente.FRAMECHESTER_BIN, args];
  const compilado = join(REPO, 'target', 'release', windows ? 'framechester.exe' : 'framechester');
  if (existe(compilado)) return [compilado, args];
  return ['cargo', ['run', '--release', '-q', '-p', 'framechester-cli', '--', ...args]];
}

/** 0 = passou; 1 = precisa de revisão humana; 2 = reprovado ou QA indisponível. */
export function qaDoProjeto(video) {
  const [programa, args] = comandoDoQa(video);
  const r = spawnSync(programa, args, { stdio: 'inherit', cwd: REPO });
  if (r.error) {
    console.error(`QA indisponível (${r.error.message}): instale o Rust ou defina FRAMECHESTER_BIN.`);
    return 2;
  }
  if (r.status === 0) console.log('✓ QA técnico aprovado: pronto para enviar como Short.');
  else if (r.status === 1) console.log('! QA pede revisão humana antes de enviar.');
  else console.log('✗ QA reprovou: não envie este vídeo.');
  return r.status ?? 2;
}
