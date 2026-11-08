# Canais de música (dark/faceless)

Caminho para canais só de música: lofi para estudar, ambiente para dormir, foco para
trabalhar. A música vem de duas fontes, as duas liberadas para vídeo monetizado:

| Fonte | Como entra | Licença conferida | Crédito |
|---|---|---|---|
| **ACE-Step 1.5**, gerado na sua máquina | `music generate` | MIT (código e pesos). O card diz que a música gerada pode ser usada comercialmente. README de [github.com/ace-step/ACE-Step-1.5](https://github.com/ace-step/ACE-Step-1.5), lido em 08/11/2026 | aviso de IA na descrição |
| **Openverse** (agrega Jamendo, Freesound, ccMixter...) | `music search --take N` | só CC0, PDM e CC BY | CC BY: crédito automático na descrição |

O que fica de fora, e por quê (`crates/framechester-core/src/music.rs`):

- **MusicGen**: pesos CC-BY-NC, uso não comercial.
- **Stable Audio Open**: usa a Stability Community License, que não é open source.
- **Suno e Udio**: são serviços pagos e fechados, e os direitos dependem do plano.
- **CC BY-NC e BY-NC-***: canal monetizado é uso comercial.
- **CC BY-SA**: obrigaria o vídeo inteiro a sair sob a mesma licença.
- **CC BY-ND**: o crossfade altera a obra.

A licença de cada faixa não é digitada pelo operador. Numa faixa gerada, ela vem dos
modelos que o servidor diz ter usado. Se aparecer um modelo fora de `GENERATOR_MODELS`,
a faixa é recusada. Numa faixa de biblioteca, a licença vem do código CC do catálogo.

## Preparar

1. Gerador local (Python 3.11 a 3.12, GPU recomendada). Instalação do README oficial:

```bash
git clone https://github.com/ACE-Step/ACE-Step-1.5.git
```

```bash
cd ACE-Step-1.5 && uv sync
```

```bash
uv run acestep-api
```

   A API sobe em `http://127.0.0.1:8001` e os pesos baixam do Hugging Face na primeira
   execução. Se o servidor for iniciado com `--api-key`, exporte a chave em
   `ACESTEP_API_KEY`. O Framechester só aceita `music.acestep_url` em loopback, então
   prompt e áudio não saem da máquina.

2. Canal em `framechester.toml`, um por nicho (veja `examples/canais.exemplo.toml`):

```toml
[[channels]]
id = "lofi-estudo"
language = "en-US"

[music]
crossfade_secs = 4.0
```

## Produzir um mix

```bash
cargo run --release -p framechester-cli -- music --channel lofi-estudo generate --title "Rainy Window" --count 20 --duration 180 --prompt "lofi hip hop, mellow rhodes piano, soft vinyl crackle, light rain, 72 bpm, relaxing, instrumental"
```

```bash
cargo run --release -p framechester-cli -- music --channel lofi-estudo search --query "lofi piano" --limit 10 --take 3
```

```bash
cargo run --release -p framechester-cli -- music --channel lofi-estudo list
```

```bash
cargo run --release -p framechester-cli -- music --channel lofi-estudo mix --episode chuva-01 --cover capa.png
```

Saída em `artifacts/channels/<canal>/music-mixes/<episode>/`:

- `final.mp4`: horizontal no perfil do canal, AAC, -14 LUFS em duas passagens com limitador de pico.
- `description.txt`: faixas com timestamps (viram capítulos a partir de 3 faixas), créditos CC BY e aviso de IA.
- `mix.json`: faixas com origem, SHA-256 e semente, mais capítulos, loudness e QA técnico. `published: false`.

O mix recusa:

- faixa sem liberação;
- o mesmo áudio duas vezes (repetir faixa para encher tempo é conteúdo repetitivo);
- menos de 3 faixas;
- faixa curta demais para o crossfade.

O vídeo sempre se mexe: a capa deriva devagar, ou, sem capa, um gradiente anda. Por
cima vão a onda da música e o título da faixa que está tocando. Por isso passa no
`freezedetect` do QA. Sai código 2 se o QA falhar. Nada é publicado.

Medido aqui com 720p30 `veryfast` em CPU: cerca de 2,5× o tempo real. Estimativa sem medição para
1 h em 1080p: 30 a 40 min. Use `--release`.

## Monetização: riscos reais

- **Conteúdo inautêntico (YPP)**: desde 15/07/2025 o YouTube chama de "inauthentic" o
  conteúdo produzido em massa ou repetitivo e não monetiza isso. O YouTube não proibiu
  IA, mas a regra pega canal de música com imagem parada e faixas iguais
  ([TechCrunch, 09/07/2025](https://techcrunch.com/2025/07/09/youtube-prepares-crackdown-on-mass-produced-and-repetitive-videos-as-concern-over-ai-slop-grows)).
  O texto oficial está em support.google.com/youtube/answer/1311392 e não foi lido
  nesta entrega (host bloqueado no ambiente), então confira antes de pedir o YPP. O que
  o motor já faz contra isso: bloqueia faixa repetida, gera visual em movimento e
  capítulos por faixa. O que depende de você: capa própria por mix, curadoria (ouvir e
  descartar faixas ruins), tema e título distintos por vídeo, e ritmo de publicação
  humano, não 10 por dia.
- **Content ID**: licença CC não impede reivindicação. Um autor de CC BY pode ter
  registrado a faixa numa distribuidora. Antes de publicar, suba como **privado** e
  espere a checagem de direitos autorais do YouTube Studio. O `landing_url` no
  `mix.json` é a prova para contestar.
- **Aviso de IA**: a descrição diz quais faixas vieram de IA. O selo "conteúdo alterado
  ou sintético" do YouTube é para conteúdo realista que engana, e música ambiente
  normalmente não entra nisso. Ainda assim, confira a regra vigente ao subir.
- **Elegibilidade**: os requisitos de YPP (inscritos, horas e Shorts) são do canal e
  mudam. Confira na fonte oficial e rode `framechester finance` só para cenários, nunca
  como promessa.

## Começar os canais

Hipóteses a validar com `youtube-channel-analysis` e `trend-intelligence` antes de
escalar. Não há dado de audiência medido nesta entrega.

| Canal | Idioma | Prompt base (ACE-Step) | Mix |
|---|---|---|---|
| `lofi-estudo` | en-US | `lofi hip hop, mellow rhodes piano, soft vinyl crackle, light rain, 72 bpm, relaxing, instrumental` | 1 h, 20 faixas de 3 min |
| `sono-ambiente` | en-US | `dark ambient drone, warm pads, slow evolving textures, no drums, 50 bpm, sleep, instrumental` | 2 h a 3 h, faixas de 6 a 10 min |
| `foco-trabalho` | pt-BR | `deep focus electronic, minimal downtempo, soft synth arpeggio, 90 bpm, instrumental` | 1 h a 2 h |

Rotina por canal: 1 a 2 mixes por semana, cada um com capa própria e faixas inéditas.
Varie prompt e semente por mix.
Upload sempre privado pelo Studio, conforme a regra do repositório.
