# Framechester

**Motor open-source, self-hosted e single-operator de producao e analise de midia.**

> **Status:** pre-alpha executavel. O primeiro corte vertical roda offline: topico -> roteiro -> TTS PT-BR -> render FFmpeg -> QA tecnico/editorial -> pacote de publicacao (SRT, thumbnail, descricao, fontes) -> dry-run. Ainda **nao** faz upload real, nao usa footage licenciado e nao promete receita.

Framechester ajuda um criador independente a descobrir assuntos, verificar fontes, escrever roteiros originais, gerar narracao, renderizar video, rodar QA audiovisual e analisar monetizacao oficial da plataforma. Nao e fabrica de engajamento, nao compra views e nao garante elegibilidade ou receita.

## Principios

- **Self-hosted, single-operator primeiro:** sem conta central, billing, SaaS ou API paga obrigatoria.
- **Open-source:** codigo proprio em Apache-2.0; dependencias, modelos, vozes, midia e fontes mantem suas licencas.
- **Local-first:** orquestracao em Rust, FFmpeg como CLI externa, TTS/LLM substituiveis.
- **Privacy-first:** telemetria desligada por padrao; credenciais ficam apenas na instalacao local.
- **Editorial-first:** fontes datadas, trabalho original, QA e aprovacao humana antes de publicar.
- **Receita:** cada criador usa a monetizacao oficial do seu proprio canal; o projeto nao vende servico, assinatura ou audiencia.

## Requisitos

- Rust 1.85+ (testado com 1.99.1)
- FFmpeg/ffprobe no `PATH` (testado com 9.0.1 full build)
- Piper + voz PT-BR, por exemplo `C:/piper/piper.exe` e `C:/piper/pt_BR-faber-medium.onnx`
- Opcional: restic para backup/restore
- Opcional: whisper/FFmpeg com modelo para QA ASR (`--asr`)
- Opcional: chave Anthropic para o adaptador de LLM pago

## Inicio rapido

```bash
cp config.example.toml framechester.toml   # ajuste caminhos locais
cargo run -p framechester-cli -- doctor
cargo run -p framechester-cli -- trends --limit 3
cargo run -p framechester-cli -- run --workdir artifacts/demo-short
cargo run -p framechester-cli -- run --format long --workdir artifacts/demo-long
cargo run -p framechester-cli -- run --topic examples/topico.exemplo.json --workdir artifacts/demo-custom
cargo run -p framechester-cli -- run --asr --workdir artifacts/demo-short
cargo run -p framechester-cli -- qa --video artifacts/demo-short/render/final.mp4
```

O comando `run` usa por padrao o LLM de template offline, assets sinteticos e publicacao em dry-run. O relatorio fica em `artifacts/<run>/pipeline_report.json` e o painel local em `artifacts/<run>/report.html`; o pacote revisavel fica em `artifacts/<run>/publish/` com `final.srt`, `description.txt`, `metadata.json` e `sources.md`, e a thumbnail em `artifacts/<run>/render/thumbnail.png`.

Para instalar o binario:

```bash
cargo install --path crates/framechester-cli
framechester doctor
```

## Comandos

| Comando | O que faz |
|---|---|
| `doctor` | Checa FFmpeg, ffprobe, restic, Piper/modelo, variaveis de ambiente, telemetria e dry-run |
| `config-check` | Valida `framechester.toml` e mostra os valores efetivos |
| `trends` | Lista e pontua topicos do fixture local, com bloqueios editoriais |
| `run` | Pipeline completo: roteiro, TTS, timeline, render, QA e dry-run publish |
| `qa --video PATH` | QA tecnico de um MP4 existente |
| `report --workdir DIR` | Gera `report.html` offline a partir de `pipeline_report.json` |
| `backup-check` | Valida o repositorio restic via `RESTIC_REPOSITORY`/`RESTIC_PASSWORD` |
| `backup --path DIR --yes` | Cria snapshot restic local; bloqueia remoto sem `--allow-remote` |
| `restore --snapshot ID --target DIR --yes` | Restaura snapshot; trata timestamp do Windows como aviso |
| `finance` | Simula custos e receita em centavos, sem promessa de resultado |

Flags uteis em `run`: `--topic arquivo.json`, `--format short|long`, `--max-scenes N`, `--voice NOME`, `--llm template|anthropic`, `--max-cost-cents N` (obrigatorio para Anthropic), `--privacy private|unlisted|public`, `--asr` para QA de fala com whisper local e `--burn-subtitles` para queimar as legendas no MP4.

## Arquitetura

- `crates/framechester-core`: dominio, estagios, portas (traits), config, seguranca, editorial, financeiro, QA e pipeline.
- `crates/framechester-adapters`: fixtures offline, TemplateLlm, AnthropicLlm, PiperTts, renderer/QA FFmpeg + ASR whisper, dry-run publisher, metricas e restic.
- `crates/framechester-cli`: comandos `doctor`, `config-check`, `trends`, `run`, `qa`, `report`, `backup-check`, `backup`, `restore`, `finance`.
- `scripts/`: verificadores Python para Anthropic, YouTube OAuth e backup restic.
- `docs/`: plano operacional, inventario de viabilidade, arquitetura e ADRs.

## Testes

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
python -m unittest discover -s tests -v
```

## Limites deste MVP

- Publicacao real (YouTube/TikTok/Facebook) nao esta implementada; o publisher sempre dry-run e bloqueia `dry_run=false`.
- Legendas, thumbnail, descricao e fontes/licencas sao geradas; `--burn-subtitles` embute o SRT no MP4, mas ainda nao ha trilha musical licenciada.
- O QA ASR e opcional e usa whisper local; a cobertura e um alerta, nao prova de qualidade editorial.
- Assets sao sinteticos (`testsrc2`) para provar o pipeline; footage licenciado ainda nao entra.
- O LLM de template e deliberadamente simples e exige revisao humana.
- O adaptador Anthropic existe, mas so roda com chave e budget explicitos.
- Nao ha scheduler, banco, dashboard, fila ou VPS neste corte.
- Nenhum modelo, midia ou segredo e redistribuido no repositorio.

## Licenciamento

Codigo proprio: [Apache License 2.0](LICENSE). FFmpeg, modelos, vozes, midia e fontes sao licenciados separadamente; consulte [third-party notices](THIRD_PARTY_NOTICES.md).

## Contribuicao e seguranca

Leia [CONTRIBUTING](CONTRIBUTING.md), [SECURITY](SECURITY.md) e [GOVERNANCE](GOVERNANCE.md). Nunca envie tokens reais, dados pessoais, midia nao autorizada ou URLs privadas.




