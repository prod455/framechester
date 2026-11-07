// Ambiente local de IA: FLUX.1 [schnell] + BiRefNet (personagens), Kokoro + OpenVoice V2
// (voz clonada) e faster-whisper (tempo das palavras). Tudo roda na sua máquina; nada de API
// paga. Os pesos baixam do Hugging Face na primeira vez, depois de conferida a licença.
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from './comum.mjs';

const OPENVOICE = 'git+https://github.com/myshell-ai/OpenVoice@74a1d147b17a8c3092dd5430504bd83ef6c7eb23';
const windows = process.platform === 'win32';
const pythonDoVenv = (venv) => join(venv, windows ? 'Scripts' : 'bin', windows ? 'python.exe' : 'python');
const VENV_IA = join(RAIZ, '.venv-ia');
const pythonIa = () => {
  const p = pythonDoVenv(VENV_IA);
  if (!existsSync(p)) throw new Error('Ambiente de IA ausente: rode npm --prefix remotion run ia:preparar');
  return p;
};
const pythonKokoro = () => {
  const p =
    process.env.FRAMECHESTER_TTS_PYTHON ?? pythonDoVenv(join(RAIZ, '..', '.framechester', 'tts-venv'));
  if (!existsSync(p))
    throw new Error('Python do Kokoro ausente: rode npm run voices:setup na raiz do repositório');
  return p;
};
const rodar = (python, ...args) => execFileSync(python, args, { stdio: 'inherit', cwd: RAIZ });
const script = (nome) => join(RAIZ, 'ia', nome);

const passos = {
  preparar() {
    if (!existsSync(VENV_IA))
      rodar(process.env.PYTHON ?? (windows ? 'python' : 'python3'), '-m', 'venv', VENV_IA);
    const py = pythonIa();
    rodar(py, '-m', 'pip', 'install', '--upgrade', 'pip');
    rodar(py, '-m', 'pip', 'install', '-r', join(RAIZ, 'ia', 'requirements.txt'));
    // Só o conversor de timbre: as dependências antigas do OpenVoice (numpy 1.22, front-end de
    // texto chinês) ficam de fora; torch, librosa e soundfile já vêm do requirements.txt.
    rodar(py, '-m', 'pip', 'install', '--no-deps', OPENVOICE);
  },
  personagens: () => rodar(pythonIa(), script('personagens.py'), ...process.argv.slice(3)),
  voz() {
    rodar(pythonKokoro(), script('voz_base.py'), ...process.argv.slice(3));
    rodar(pythonIa(), script('voz_clonada.py'));
    rodar(pythonIa(), script('transcrever.py'));
  },
  transcrever: () => rodar(pythonIa(), script('transcrever.py'), ...process.argv.slice(3)),
};

const passo = passos[process.argv[2]];
if (!passo) {
  console.error(`Use: node scripts/ia.mjs ${Object.keys(passos).join(' | ')}`);
  process.exit(2);
}
try {
  passo();
} catch (erro) {
  console.error(erro instanceof Error ? erro.message : String(erro));
  process.exit(1);
}
