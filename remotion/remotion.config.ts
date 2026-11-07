import { Config } from '@remotion/cli/config';

// Determinístico e alinhado ao guia: 60 fps vêm da composição; aqui só a saída.
Config.setVideoImageFormat('png');
Config.setPixelFormat('yuv420p');
Config.setCodec('h264');
Config.setConcurrency(Number(process.env.REMOTION_CONCURRENCY ?? 0) || null);
// Navegador já instalado na máquina (opcional). Sem a variável, o Remotion usa o dele.
if (process.env.REMOTION_BROWSER) Config.setBrowserExecutable(process.env.REMOTION_BROWSER);
