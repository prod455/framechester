# Anúncio vertical

Caminho separado do motor Rust para anúncios curtos no formato **Dor e solução**
([GUIA_VISUAL.md](../docs/GUIA_VISUAL.md#formatos-de-roteiro)): 1080×1920 no fps do projeto (30, o perfil de Short do QA; a animação é calculada a 60), cada
animação presa a uma palavra da narração, personagens 3D e a sua voz clonada. O motor
`framechester produce` continua sendo o caminho dos vídeos do canal.

Só software livre e modelos abertos, tudo na sua máquina, sem API paga nem crédito. As cenas
são componentes React (MIT); `src/quadro.tsx` é o motor de quadros próprio. O Vite (MIT)
serve a página no loopback, o Playwright (Apache-2.0) abre o Chromium (BSD) sem janela e
fotografa cada quadro, e o FFmpeg codifica o vídeo e mixa o som.

| Etapa | Modelo aberto | Licença |
|---|---|---|
| Personagens 3D | FLUX.1 [schnell] | Apache-2.0 |
| Fundo transparente | BiRefNet via rembg | MIT |
| Narração base | Kokoro-82M (a mesma voz revisada do projeto) | Apache-2.0 |
| Seu timbre | conversor do OpenVoice V2 | MIT |
| Tempo de cada palavra | faster-whisper | MIT |

Os scripts conferem no Hugging Face a licença declarada do FLUX.1 [schnell] e do OpenVoice V2
antes de baixar os pesos e param se ela mudar.

## O que você precisa

| Item | Onde fica |
|---|---|
| Roteiro | `anuncio/anuncio.json` (copie de `anuncio.exemplo.json`) |
| Uns 20 s de você falando, sem música | `anuncio/public/referencia.wav` |
| Node.js 22.12+, FFmpeg, Python 3.10 a 3.13 | |
| Kokoro do projeto | `npm run voices:setup` na raiz |
| Para os personagens: GPU com ~16 GB ou Mac com 32 GB | em CPU funciona, mas leva minutos por imagem |

O Studio toca só a narração; os efeitos entram no vídeo gerado.

Nada disso vai para o Git: `public/`, `out/`, `.venv-ia/` e `anuncio.json` ficam no `.gitignore`.

## Passo a passo

1. Instale (uma vez):
   ```bash
   npm --prefix anuncio ci
   npm --prefix anuncio run preparar      # fontes e efeitos sonoros
   npm --prefix anuncio run ia:preparar   # ambiente Python com os modelos abertos
   ```
2. Escreva o roteiro em `anuncio/anuncio.json`. Uma cena por frase. A narração vai em
   `frase`, com os números por extenso e sem reticências; o validador recusa algarismos e "...".
   Cada `em` é a palavra dita em que a animação acontece. Em cada `personagem`, `prompt` é o
   personagem em inglês (o estilo comum é adicionado sozinho).
3. Gere os personagens (PNG transparente em `public/personagens/`, mesma semente por prompt):
   ```bash
   npm --prefix anuncio run personagens
   ```
4. Grave a referência em `public/referencia.wav` e gere a narração com a sua voz:
   ```bash
   npm --prefix anuncio run voz
   ```
   A Kokoro lê o roteiro, o OpenVoice troca o timbre pelo seu e o faster-whisper marca o tempo
   de cada palavra (`public/narracao.wav` e `public/palavras.json`). Clone só a sua própria voz.
   Antes de ter a voz, `npm --prefix anuncio run palavras:estimar` gera um tempo estimado; a
   prévia sai com a marca PRÉVIA · TEMPO ESTIMADO. Gravou a narração você mesmo? Salve como
   `public/narracao.wav` e rode só `npm --prefix anuncio run transcrever`.
5. Confira e revise:
   ```bash
   npm --prefix anuncio run checar
   npm --prefix anuncio run quadros   # dois quadros por cena em out/quadros
   npm --prefix anuncio run studio    # http://127.0.0.1:4318: assista, pause, pule de cena
   ```
6. Gere a versão final (H.264, CRF 12, 1080×1920, 30 fps, capturada em 2× e reduzida com lanczos):
   ```bash
   npm --prefix anuncio run render:final
   ```
   Ela só começa se o `checar --final` passar (narração presente, tempo vindo do
   faster-whisper, personagens com transparência, roteiro batendo com a fala) e só termina
   pronta se passar no QA técnico de Short do Framechester (`framechester qa --format short`):
   o script sai com 0 se aprovado, 1 se pede revisão humana e 2 se reprovado. O QA usa
   `FRAMECHESTER_BIN`, o `target/release/framechester` já compilado ou o `cargo`. O arquivo
   fica em `anuncio/out/final.mp4`. Para uma prévia rápida: `npm --prefix anuncio run render`
   (CRF 18, `anuncio/out/previa.mp4`, sem QA).

Na primeira vez, baixe o Chromium do Playwright: `npx --prefix anuncio playwright-core install chromium`.
Para usar outro Chromium já instalado: `NAVEGADOR=/caminho/do/chromium`. `TRABALHADORES=N`
define quantas páginas renderizam em paralelo (padrão: núcleos − 1).

## Cenas

| `tipo` | O que aparece | Campos |
|---|---|---|
| `numero` | número grande que rola com borrão vertical e pousa na palavra | `titulo`, `valor`, `prefixo`, `sufixo`, `em` |
| `titulo` | título grosso, cada palavra entra quando é dita, uma `*palavra*` em destaque | `texto` |
| `personagem` | personagem 3D que cai quicando, flutua, treme em `em` e tem sombra macia | `texto`, `imagem`, `prompt` (o personagem, em inglês), `em` |
| `extrato` | extrato que desenrola de cima para baixo, linha por linha, com total | `titulo`, `linhas` |
| `app` | tela com gráfico de rosca por linha e uma tesoura que corta as linhas `cortar` a partir de `em` | `titulo`, `linhas`, `em` |
| `palavras` | três palavras que entram quando são ditas | `palavras`, `slogan` |
| `logo` | círculo na cor de destaque cobre a tela; ícone e nome entram | `slogan`, `em` |
| `camadas` | a cena se separa em camadas 3D em `em`; o botão vai de "voz original" para "clone" em `alternar_em` | `texto`, `em`, `alternar_em` |
| `final` | logo grande e a última frase em destaque | `texto` |

`som` troca o efeito principal da cena; `"som": null` desliga os efeitos dela. Entre cenas há
sempre a transição whip (borrão horizontal forte, 20 frames) com whoosh.

## Regras

- Tudo determinístico: nada de `Math.random`; o grão usa semente por frame e os transforms são
  arredondados para 2 casas.
- A solução do anúncio precisa existir e todo número precisa de fonte ou de conta dita. O
  exemplo é hipotético ("Imagine") e as contas fecham: 187 × 12 = 2.244; 187 − 42 = 145.
- Clone só a sua própria voz e diga no vídeo que é um clone. A virada só funciona se for verdade.
- O OpenVoice sai sem a marca d'água de áudio: a declaração de clone fica na própria narração.
