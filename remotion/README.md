# Anúncio vertical em Remotion

Caminho separado do motor Rust para anúncios curtos no formato **Dor e solução**
([GUIA_VISUAL.md](../docs/GUIA_VISUAL.md#formatos-de-roteiro)): composição de 1080×1920 a 60 fps,
cada animação presa a uma palavra da narração, personagens 3D gerados no Higgsfield e a sua
voz clonada. O motor `framechester produce` continua sendo o caminho dos vídeos do canal.

## O que você precisa

| Item | Onde fica |
|---|---|
| Roteiro | `remotion/anuncio.json` (copie de `anuncio.exemplo.json`) |
| Narração com a sua voz, gravada ou clonada | `remotion/public/narracao.wav` |
| Tempo de cada palavra | `remotion/public/palavras.json` (gerado) |
| Um PNG com fundo transparente por personagem | `remotion/public/personagens/` |
| Node.js 22.12+, FFmpeg e, para transcrever, Python com `faster-whisper` | |

Nada disso vai para o Git: `public/`, `out/` e `anuncio.json` ficam no `.gitignore`.

## Passo a passo

1. Instale e prepare as fontes e os efeitos (pop, whoosh, notificação, papel, caixa,
   sintetizados com o FFmpeg):
   ```bash
   npm --prefix remotion ci
   npm --prefix remotion run preparar
   ```
2. Escreva o roteiro em `remotion/anuncio.json`. Uma cena por frase. A narração vai em
   `frase`, com os números por extenso e sem reticências; o validador recusa algarismos e "...".
   Cada `em` é a palavra dita em que a animação acontece.
3. Gere os prompts do Higgsfield e o texto da voz:
   ```bash
   npm --prefix remotion run prompts
   ```
   Abra `remotion/out/higgsfield.md`. Gere cada personagem no app do Higgsfield (GPT Image,
   qualidade média, fundo transparente) e salve com o nome indicado. Clone **a sua** voz a
   partir de uns 20 s seus sem música, cole `out/narracao.txt` e salve como
   `public/narracao.wav`.
4. Transcreva a narração para prender as animações nas palavras:
   ```bash
   pip install faster-whisper==1.1.1
   python remotion/scripts/transcrever.py
   ```
   Antes de ter a narração, `npm --prefix remotion run palavras:estimar` gera um tempo
   estimado; a prévia sai com a marca PRÉVIA · TEMPO ESTIMADO.
5. Confira e revise:
   ```bash
   npm --prefix remotion run checar
   npm --prefix remotion run quadros   # dois quadros por cena em out/quadros
   npm --prefix remotion run studio    # assista inteiro e peça os ajustes
   ```
6. Gere a versão final (H.264, CRF 12, 60 fps, `--scale=2`, 2160×3840):
   ```bash
   npm --prefix remotion run render:final
   ```
   Ela só roda se o `checar --final` passar: narração presente, tempo vindo do
   faster-whisper, todos os personagens com transparência e o roteiro batendo com a fala.
   O arquivo fica em `remotion/out/final.mp4`. Para uma prévia rápida em 1080×1920:
   `npm --prefix remotion run render`.

Num servidor sem o Chrome do Remotion, aponte para um navegador instalado:
`REMOTION_BROWSER=/caminho/do/chrome-headless-shell`.

## Cenas

| `tipo` | O que aparece | Campos |
|---|---|---|
| `numero` | número grande que rola com borrão vertical e pousa na palavra | `titulo`, `valor`, `prefixo`, `sufixo`, `em` |
| `titulo` | título grosso, cada palavra entra quando é dita, uma `*palavra*` em destaque | `texto` |
| `personagem` | personagem 3D que cai quicando, flutua, treme em `em` e tem sombra macia | `texto`, `imagem`, `prompt` (SUBJECT do Higgsfield), `em` |
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
- Os créditos do Higgsfield são gastos no app, pela sua conta. Este projeto não chama a API dele.
- Licença do Remotion: grátis para pessoa física e empresas de até 3 pessoas; acima disso,
  precisa de licença da empresa ([remotion.dev/license](https://www.remotion.dev/license)).
