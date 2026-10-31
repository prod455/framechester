# Framechester V4 — Inventário e Viabilidade (relatório)

**Data-base:** 27/10/2026
**Atualização:** 27/10/2026 — segunda passagem após instalação de Python 3.15.2, Rust 1.99.1 e restic 0.19.1; modelos PT-BR (Piper) e ASR multilíngue (whisper.cpp) baixados e testados.
**Status:** inventário original read-only + atualização de implementação em 27/10/2026 (seção 11). Nenhuma credencial real foi criada ou exibida.
**Escopo deste documento:** coletar evidências do ambiente e do repositório e registrar bloqueios reais. Não é aprovação, não é release, não é validação de plataforma.

---

## 1. Metodologia e limites deste inventário

- Somente leitura: sem escrita no repositório, sem commits, sem pushes, sem criação/alteração de segredos, sem acesso a contas reais.
- Nenhum valor de segredo é copiado, logado ou registrado. Variáveis de ambiente com chave presente foram detectadas no processo, mas **não** foram exibidas nem persistidas.
- Informações inacessíveis neste ambiente foram registradas como `UNKNOWN` / `NOT_VERIFIED`, sem inferência não comprovada.

## 2. Inventário do repositório (read-only)

| Item | Situação | Evidência |
|---|---|---|
| Raiz | diretório único, sem `.git` neste workspace | sem repositório Git local |
| `docs/` | 5 arquivos: `00-inventario-e-viabilidade.md`, `04-arquitetura-e-adr.md`, `OPEN_SOURCE_ARCHITECTURE.md`, `PLANO_OPERACIONAL_COMPLETO.md`, `PRIVACY.md` | confirmado |
| `scripts/` | 4 scripts + `tests/test_verificadores.py` (19 testes) | confirmado |
| Arquivos de governança/OSS na raiz | `.env.example`, `.gitignore`, `CHANGELOG.md`, `CODE_OF_CONDUCT.md`, `config.example.toml`, `CONTRIBUTING.md`, `GOVERNANCE.md`, `LEIA_PRIMEIRO.md`, `LICENSE`, `PROMPT_CODEX_CLAUDE.txt`, `README.md`, `SECURITY.md`, `THIRD_PARTY_NOTICES.md` | confirmados |
| `AGENTS.md` / `CLAUDE.md` | presentes, com comandos de build/test/lint e regras de segurança | confirmado |
| Código de aplicação (Rust) | workspace com `framechester-core`, `framechester-adapters` e `framechester-cli`; 80 testes Rust | confirmado |
| CI/CD (`.github/`) | workflow `ci.yml`: fmt, clippy, cargo test e unittest | confirmado |
| Dashboard/CLI/engine | CLI `framechester` com `doctor`, `config-check`, `trends`, `run`, `qa`, `backup-check`, `finance`; dashboard ausente | confirmado |

**Conclusão do inventário de código:** existe um primeiro corte vertical executável (roteiro -> TTS -> render -> QA -> dry-run), porém **não** é produção: upload real, footage licenciado, scheduler, banco e dashboard continuam ausentes.

## 3. Inventário local — hardware e toolchain (medidos neste ambiente)

| Dado | Valor | Status |
|---|---|---|
| Sistema operacional | Microsoft Windows 11 Pro, versão 10.0.26300 (build 26300), 64-bit | CONFIRMED |
| CPU | AMD Ryzen 5 5500, 6 núcleos / 12 threads, base 3.6 GHz | CONFIRMED |
| RAM física | 2 módulos de 8 GB (16 GB total); ~15,9 GiB visíveis | CONFIRMED |
| GPU | AMD Radeon RX 6600; driver 32.0.21045.16010; `VideoMemoryType` = 2 (dedicada); adapter reportado ~4,29 GB | CONFIRMED (valor de VRAM a cruzar com Radeon Software) |
| Resolução de exibição | 1920×1080 | CONFIRMED |
| Disco | Volume C: ~446 GB; livre ~35 GB | CONFIRMED |
| FFmpeg / ffprobe | `ffmpeg version 9.0.1-full_build-www.gyan.dev`, build MSYS2/gcc 16.1.0; `libavcodec 63.1.101`, `libavutil 61.1.101`, `libavformat 63.1.101`, `libavfilter 12.1.101`, `libswscale 10.1.101`, `libswresample 7.1.101` | CONFIRMED |
| FFmpeg flags relevantes | `--enable-gpl --enable-libx264 --enable-libx265 --enable-amf --enable-libvmaf --enable-libass --enable-mediafoundation --enable-whisper ...` | CONFIRMED |
| Rust toolchain (`rustc`/`cargo`) | `rustc 1.99.1` / `cargo 1.99.1` (2026-10-13) no PATH | CONFIRMED |
| `restic` | `restic 0.19.1` (go1.26.4, windows/amd64) no PATH | CONFIRMED |
| Python | `Python 3.15.2` (`python`/`py`/`python3`); simulador executa | CONFIRMED |
| Blender / whisper.cpp CLI / Piper | Binários em `C:\whisper` e `C:\piper`; whisper `ggml-base.en.bin` (~148 MB) e `ggml-base.bin` multilíngue (~148 MB); Piper `en_US-lessac-medium.onnx` (~63 MB) e `pt_BR-faber-medium.onnx` (~63 MB) | CONFIRMED |

### 3.1. Encoders disponíveis

- `libx264` (H.264/MPEG-4 AVC): **disponível**.
- `h264_amf` (AMD AMF H.264 Encoder): **disponível**.
- `hevc_amf`, `av1_amf`: disponíveis; HEVC baseline também via `libx265`.
- Hardware acceleration listadas: `cuda, vaapi, dxva2, qsv, d3d11va, opencl, vulkan, d3d12va, amf`.
- **Opções observadas no `h264_amf`:** aceita `-preset`/`-quality` (`balanced|speed|quality|high_quality`), `-usage`, `-rc` (`cqp|cbr|vbr_peak|vbr_latency|qvbr|hqvbr|hqcbr`) e `-profile`. **Não** existe `-crf`; para qualidade variável usar `-rc qvbr -qvbr_quality_level N`. Valores no estilo x264 (`medium`, `crf 23`) foram rejeitados em teste anterior.

### 3.2. Benchmark — 1 amostra curta (CPU vs AMF)

**Amostra:** fonte sintética 5 s, `testsrc` 1280×720 @30 fps + `sine` 440 Hz; áudio AAC; destino MP4.

| Variante | Comando | Duração | Tamanho | Bitrate | Tempo (wall) | Speed | Status |
|---|---|---|---|---|---|---|---|
| `libx264` baseline CPU | `-c:v libx264 -preset medium -crf 23 -c:a aac` | 5.000 s | 109,609 B (≈107 KiB) | — | ~0.58 s | ~8.5x | OK |
| `h264_amf` (AMD) | `-c:v h264_amf -b:v 1000k -c:a aac` | 5.000 s | 198,328 B (≈193 KiB) | ~313 kbit/s (medição) | ~0.86 s | 5.79x | OK |

- **Perfil/8-bit:** `libx264` reportou `High 4:4:4 Predictive`, level 3.1, 4:4:4, 8-bit — consequência da fonte RGB; recomenda-se fonte YUV (yuv420p) em renders reais.
- **Comparação de qualidade:** SSIM entre encodes de taxa equivalente: All = **0,973**, Y = 0,974, U = 0,975, V = 0,971. **Ressalva:** este teste curto comparou taxas diferentes e superestimou a similaridade; o benchmark 1080p da seção 3.3 (VMAF 73 vs 38) é o resultado válido para decisão.
- **Reprodução:** decodificação/execução validada via `ffprobe`/`ffmpeg` neste ambiente sintético. **Render final real** e VMAF completo permanecem como pendência (necessário fixture de cena e referência).

### 3.3. Benchmark 1080p30 — CPU vs AMF (20 s, execução sequencial)

**Fixture:** `testsrc2` 1920×1080 @30 fps, 20 s, `yuv420p`, áudio `sine` 440 Hz; mezanino lossless `libx264 -qp 0` (82,9 MB, gerado em 1,2 s). Conteúdo sintético de alto detalhe/movimento — pior caso, **não** representa cena real.

| Variante | Comando (resumo) | Tempo | Speed | Tamanho | SSIM All | VMAF |
|---|---|---|---|---|---|---|
| `libx264` medium @6M | `-preset medium -b:v 6000k -maxrate 6000k -bufsize 12000k` | 4,94–5,34 s | ~3,8–4,0x | 15,04 MB (≈6,14 Mbps) | 0,9793 | **73,06** |
| `libx264` veryfast @6M | `-preset veryfast -b:v 6000k ...` | 2,83 s | ~7,1x | 14,53 MB (≈6,09 Mbps) | 0,9795 | 72,35 |
| `h264_amf` balanced @6M | `-b:v 6000k` (default) | 1,88–1,91 s | ~10,5x | 15,20 MB (≈6,21 Mbps) | 0,9591 | 37,90 |
| `h264_amf` high_quality + vbr_peak @6M | `-usage high_quality -quality high_quality -rc vbr_peak` | 86,32 s | ~0,23x | 15,05 MB | 0,9592 | 38,09 |
| `h264_amf` high_quality + qvbr 23 | `-rc qvbr -qvbr_quality_level 23` | 62,14 s | ~0,32x | 51,56 MB | não medido | não medido |

- **Achado:** neste build, `h264_amf` **aceita** `-quality`/`-preset`, `-usage`, `-rc` e `-profile` (o relatório anterior estava incorreto ao afirmar que só havia bitrate). Porém os presets de qualidade do AMF não melhoraram SSIM/VMAF nesta fixture e custaram 16–45x mais tempo.
- **Achado:** `libx264 -preset veryfast` entrega VMAF ~72 a 2,83 s; o AMF balanced entrega VMAF ~38 a 1,9 s. Para este conteúdo, AMF só é ~33% mais rápido que `veryfast`, com metade do VMAF → usar AMF para prévia/rascunho e x264 para render final.
- **Limitação:** fixture sintética; benchmark com cena real de tecnologia (movimento de câmera, texto, gradientes, ruído de sensor) continua pendente.

### 3.4. Modelos locais baixados — origem, licença e integridade

| Modelo | Origem | Licença declarada | Tamanho | SHA-256 |
|---|---|---|---|---|
| `pt_BR-faber-medium.onnx` | `rhasspy/piper-voices` → `pt/pt_BR/faber/medium` | Dataset **CC0**; checkpoint finetuned de `en_US-lessac-medium` (licença do checkpoint a confirmar no model card) | 63.201.294 B | `858555E3A064209C57088FE6BD70C4C3DC54D03EAA00C45D5ECAF43A33F95AA7` |
| `pt_BR-faber-medium.onnx.json` | idem | idem | 4.855 B | `7E694DE195AE3FC36DD732C445EB04FB49B649854893CB5506B978F0D50A1D6F` |
| `ggml-base.bin` (multilíngue) | `ggerganov/whisper.cpp` | OpenAI Whisper base — **MIT**; conversão ggml do whisper.cpp (MIT) | 147.951.465 B | `60ED5BC3DD14EEA856493D334349B405782DDCAF0028D4B5DF4088345FBA2EFE` |

- Nenhum modelo foi copiado para o repositório; todos ficam em `C:\piper` e `C:\whisper\models` (fora do Git).
- Registrado em `THIRD_PARTY_NOTICES.md`; a auditoria final do build FFmpeg e do lockfile Rust continua pendente antes de distribuir binários.

### 3.5. TTS PT-BR e ASR — teste de ida e volta

| Item | Comando/evidência | Resultado |
|---|---|---|
| Piper PT-BR | `piper.exe -m C:\piper\pt_BR-faber-medium.onnx` | OK; RTF 0,067 (5,14 s de áudio em ~0,30 s de inferência) |
| ASR multilíngue | `ffmpeg -af whisper=model='C\:/whisper/models/ggml-base.bin':language=pt:...` | OK; transcreveu o áudio PT-BR gerado |
| Limitação | Voz sintética diz "Piper"; ASR grafou algo próximo de "piper" | Esperado para nome próprio; revisar pronúncia/lexicon |

### 3.6. Backup/restore local com restic

| Etapa | Comando | Resultado |
|---|---|---|
| Init + backup | `restic init` / `restic backup` em repositório local temporário | OK; 221 KB em 0,83 s |
| Restore | `restic restore latest` | 10/11 entradas restauradas; 1 erro de timestamp no diretório raiz (Access denied no Windows) |
| Integridade | SHA-256 antes/depois | `a.txt` e `audio.wav` idênticos |
| Limitação | repositório local, senha descartável | Teste com B2/R2 e credenciais reais continua pendente e exige autorização |

## 4. VPS

- **Status: `NOT_REQUIRED`** — decisão do operador: operação 100% local, sem VPS.
- A arquitetura já previa VPS como **opcional** (`docs/OPEN_SOURCE_ARCHITECTURE.md`). Sem VPS, scheduler, banco e render rodam na máquina local; não há publicação com o PC desligado.
- Consequência operacional: jobs são enfileirados localmente e só executam com a máquina ligada; dashboard remoto e workers distribuídos ficam fora do escopo imediato.

## 5. Fornecedor de IA

- **Fornecedor escolhido:** Anthropic API (`LlmProvider`), via `ANTHROPIC_API_KEY` do Console — **não** a assinatura Claude.ai.
- **Status: `NOT_VERIFIED`** — nenhuma chave `ANTHROPIC_API_KEY`/`CLAUDE_API_KEY` foi encontrada no ambiente nesta passagem; nenhuma chamada de inferência foi feita.
- Validação segura: `python scripts/verificar_anthropic.py` (somente `GET /v1/models`, sem custo de inferência e sem imprimir a chave). `--offline` valida apenas formato/presença.
- Custo: uso da API é cobrado por token; exige crédito/limite no Console e autorização dentro do contrato de orçamento. Modelo deve vir de `ANTHROPIC_MODEL`, sem hardcode.

## 6. Canais / contas / plataformas

- **Escopo definido:** **1 canal YouTube** com **3 séries** (tech, IA, ciência). TikTok (prioridade 2) e Facebook (prioridade 3) ficam para depois e são opcionais.
- **Status: `NOT_VERIFIED`** — canal e credenciais ainda não existem neste ambiente.
- Checklist YouTube: 2FA + verificação de telefone; canal criado; projeto no Google Cloud com **YouTube Data API v3** e **YouTube Analytics API**; consent screen External/Testing; escopos `youtube.upload`, `youtube.readonly`, `yt-analytics.readonly`; OAuth client **Desktop app**; `client_secret.json` fora do repositório; AdSense somente após elegibilidade do YPP.
- Validação segura: `python scripts/verificar_youtube.py --config|--auth|--check`. O script só lê o canal (`channels?mine=true`); não publica nada.

## 7. Fontes consultadas (registro de origem)

| Fonte | Licença/uso | Versão/Commit | Status |
|---|---|---|---|
| FFmpeg / x264 / AMF / VMAF | tecnologia, licenças por componente | build 9.0.1-full_build (MSYS2) | CONFIRMED (binário local) |
| Rust (`rustc`/`cargo`) | MIT/Apache-2.0 | 1.99.1 (2026-10-13) | CONFIRMED (binário local) |
| Python | PSF-2.0 | 3.15.2 | CONFIRMED (binário local) |
| restic | BSD-2-Clause | 0.19.1 (go1.26.4) | CONFIRMED (binário local) |
| Piper + `pt_BR-faber-medium` | Piper MIT; dataset CC0 | checkpoint por hash (seção 3.4) | CONFIRMED (local) |
| whisper.cpp + `ggml-base.bin` | MIT (código e pesos OpenAI Whisper) | hash (seção 3.4) | CONFIRMED (local) |
| Superpowers / Vercel Agent Skills / Agent Skills spec / Anthropic skill creator | referência de skills | URLs reportadas | Acesso por verificação na fonte |
| YouTube monetização / YPP / originalidade / uploads / AdSense / TikTok / Trends / B2 / R2 | documentação oficial | data-base 27/10/2026 | CITED |

## 8. Evidências e bloqueios

- **Conforme:** FFmpeg completo (libx264/h264_amf/libvmaf/libass/whisper), RAM 16 GB, CPU Ryzen 5 5500, GPU RX 6600 com AMF; Python 3.15.2, Rust 1.99.1 e restic 0.19.1 instalados; TTS PT-BR + ASR round-trip executado; backup/restore local restic com hashes conferidos; benchmark sintético 720p e 1080p executado; VPS descartada; escopo de canal definido (1 YouTube, 3 séries).
- **Resolvidos nesta passagem:** toolchain Rust; `restic`; voz PT-BR (`pt_BR-faber-medium`); modelo ASR multilíngue (`ggml-base.bin`); ausência de Python; decisão de operação local sem VPS; scripts de verificação de Anthropic, YouTube e backup.
- **Bloqueios conhecidos (dependem do operador):** chave `ANTHROPIC_API_KEY` ainda não presente no ambiente; `client_secret.json`/consentimento OAuth do YouTube ainda não criados; credenciais de backup B2/R2 ausentes; fixture de cena real para benchmark AMF definitivo; licenças/hashes da voz/modelo já registrados em `THIRD_PARTY_NOTICES.md` (auditoria final do build FFmpeg e crates ainda pendente).
- **Pendências imediatas para o próximo passo:** rodar `scripts/verificar_anthropic.py` após definir a chave; criar o projeto Google Cloud + canal e rodar `scripts/verificar_youtube.py`; autorizar e rodar `scripts/verificar_backup.py --restore-check --yes`; benchmark AMF com cena real.

## 9. Proposta de compra zero (resumo)

Conforme o contrato de orçamento do prompt: energia no aluguel, IA já paga e computador existente permanecem como hipóteses a validar; **VPS não é usada**. Nenhum gasto novo é autorizado sem aprovação. Este inventário não adiciona custo novo.

## 10. Scripts de verificação por serviço

| Serviço | Script | O que faz | Custo/segurança |
|---|---|---|---|
| Anthropic | `scripts/verificar_anthropic.py` | valida presença/formato da chave e lista modelos via `GET /v1/models` | sem inferência paga; nunca imprime a chave |
| YouTube | `scripts/verificar_youtube.py` | valida `client_secret.json`, faz OAuth Desktop, lê o canal | somente leitura; token em `~/.framechester` |
| Backup | `scripts/verificar_backup.py` | valida env/restic, `--check`, `--init`, `--backup`, `--restore-check` | `--init/--backup/--restore-check` exigem `--yes` (pay-as-you-go) |

```bash
python scripts/verificar_anthropic.py --offline
python scripts/verificar_youtube.py --config
python scripts/verificar_backup.py --check
python -m unittest discover -s tests -v
```

- Evidência desta passagem: 19 testes unittest passando; smoke tests offline (Anthropic/YouTube) e ciclo restic local `init → check → backup → restore-check` com SHA-256 idêntico.
- `--restore-check` trata como aviso o erro de timestamp do Windows (restic retorna código 1 mesmo restaurando os arquivos); o critério de sucesso é hash + presença.

## 11. Atualização pós-implementação (27/10/2026)

### 11.1. O que passou a existir

| Item | Evidência |
|---|---|
| Workspace Rust | `crates/framechester-core`, `crates/framechester-adapters`, `crates/framechester-cli` |
| Testes Rust | 80 passando (`cargo test --workspace`): 47 core, 28 adapters, 5 CLI |
| Testes Python | 19 passando (`python -m unittest discover -s tests -v`) |
| Lint | `cargo fmt --all --check` e `cargo clippy --workspace --all-targets -- -D warnings` limpos |
| Demo curta | 78,5 s, 1920x1080, 30 fps, QA técnico `pass` (inclui ASR acima do limiar com `--asr`), QA editorial `needs_human`, publish `dry_run` |
| Demo longa | 427,5 s, 1920x1080, 30 fps, QA técnico `pass`, QA editorial `needs_human`, publish `dry_run` |
| Tópico customizado | `examples/topico.exemplo.json` -> 90,0 s, QA técnico `pass`, pacote de publicação gerado |
| Pacote de publicação | `publish/final.srt`, `description.txt`, `metadata.json`, `sources.md` e `render/thumbnail.png`; metadados marcam `containsSyntheticMedia=true` |
| QA ASR | `run --asr` usa whisper local, gera `render/asr_transcript.json` e mede cobertura de palavras; limiar baixo vira `needs_human` |
| Painel local | `run` grava `report.html`; `report --workdir DIR` regenera offline |
| Legendas queimadas | `run --burn-subtitles` gera `render/captions.srt`, reencoda com libass e marca `subtitlesBurned=true` |
| Backup local | restic 0.19.1 `init` + `backup-check` + `backup --yes` + `restore --yes` -> snapshot e arquivo restaurados; timestamp do Windows vira aviso; sem gasto remoto |
| Segurança | bloqueio de SSRF (loopback/private/IP não canônico/host sem domínio), detecção de prompt injection e telemetry=false obrigatório |

### 11.2. Comandos reproduzíveis

```bash
cargo run -p framechester-cli -- doctor
cargo run -p framechester-cli -- run --asr --burn-subtitles --workdir artifacts/demo-short
cargo run -p framechester-cli -- run --format long --workdir artifacts/demo-long
cargo run -p framechester-cli -- run --topic examples/topico.exemplo.json --workdir artifacts/demo-custom
cargo run -p framechester-cli -- qa --video artifacts/demo-short/render/final.mp4
cargo run -p framechester-cli -- report --workdir artifacts/demo-short
cargo run -p framechester-cli -- backup --path artifacts --yes
cargo run -p framechester-cli -- finance --storage-gb 50 --provider b2
```

### 11.3. O que continua bloqueado

- Upload real YouTube/TikTok/Facebook: exige OAuth do operador, política de plataforma e autorização explícita; o publisher atual é dry-run e bloqueia `dry_run=false`.
- Footage licenciado: assets são `testsrc2` sintéticos para provar o pipeline.
- LLM Anthropic ao vivo: `ANTHROPIC_API_KEY` e `ANTHROPIC_MODEL` ainda ausentes; adaptador exige budget explícito.
- Backup remoto B2/R2: credenciais ausentes; nenhum gasto foi feito.
- Scheduler, banco, dashboard e fila: fora deste corte.







