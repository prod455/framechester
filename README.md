# Framechester

**Motor open-source, self-hosted e single-operator de produção e análise de mídia.**

[![CI](https://github.com/prod455/framechester/actions/workflows/ci.yml/badge.svg)](https://github.com/prod455/framechester/actions/workflows/ci.yml)
[![Docker](https://github.com/prod455/framechester/actions/workflows/docker.yml/badge.svg)](https://github.com/prod455/framechester/actions/workflows/docker.yml)
[![Release](https://img.shields.io/github/v/release/prod455/framechester?include_prereleases&sort=semver)](https://github.com/prod455/framechester/releases)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Rust 1.85+](https://img.shields.io/badge/rust-1.85%2B-orange.svg)
![Node 22.12+](https://img.shields.io/badge/node-22.12%2B-brightgreen.svg)

> **Como subir o Framechester:** siga o [manual de instalação](docs/DEPLOY.md), direto no computador ou no Docker.

> **Status:** versão 0.1.0. Studio web local, editores e produção completa por canal: tema -> roteiro (manual ou com IA) -> fontes revisadas por pares -> visuais explicativos -> narração TTS PT-BR -> vídeo gerado com FFmpeg -> QA -> vídeo aprovado para envio manual. A publicação automática continua desativada; elegibilidade e receita dependem de cada canal. Veja o [CHANGELOG](CHANGELOG.md) e [como aprovar um vídeo](docs/WEB_STUDIO.md#fontes-e-revisão).

O Framechester ajuda um criador independente a descobrir assuntos, conferir fontes, escrever roteiros originais, gerar narração, gerar o vídeo, rodar o QA audiovisual e analisar a monetização oficial da plataforma. Não é uma fábrica de engajamento, não compra views e não garante elegibilidade nem receita.

No Studio, **Produzir com IA** recebe sua orientação, escreve um roteiro novo e segue sozinho com [visuais explicativos locais](docs/VISUAIS_AUTOMATICOS.md), voz, legendas, montagem e QA. Você autoriza o custo antes de qualquer geração paga e revisa o vídeo pronto. A preparação manual continua nos controles avançados.

## Princípios

- **Self-hosted, vários canais e um operador:** sem conta central, cobrança, SaaS ou API paga obrigatória.
- **Open-source:** código próprio sob Apache-2.0; dependências, modelos, vozes, mídia e fontes mantêm suas licenças.
- **Local-first:** orquestração em Rust, FFmpeg como CLI externa, TTS e LLM substituíveis.
- **Privacidade em primeiro lugar:** telemetria desligada por padrão; as credenciais ficam só na instalação local.
- **Editorial em primeiro lugar:** fontes datadas, trabalho original, QA e aprovação humana antes de publicar.
- **Receita:** cada criador usa a monetização oficial do próprio canal; o projeto não vende serviço, assinatura nem audiência.

## Requisitos

- Node.js 22.12+ e npm para o Studio web
- Rust 1.85+ (testado com 1.99.1)
- FFmpeg/ffprobe no `PATH` (testado com o 9.0.1 full build)
- Python 3.11–3.13 + Kokoro PT-BR: `npm run voices:setup` (runtime e modelos comerciais fixados)
- Opcional: restic para backup e restauração
- Opcional: whisper/FFmpeg com modelo para o QA por ASR (`--asr`)
- Opcional: chave da Anthropic para o adaptador de LLM pago

A narração usa só as vozes revisadas do Kokoro-82M v1.0 sob Apache-2.0, em português (Dora, Alex, Santa), inglês (Heart, Bella, Michael) e espanhol (Dora, Alex, Santa). O motor confere os hashes do modelo e das vozes antes de narrar. Piper e vozes fora do catálogo ficam bloqueados; configurações antigas migram para Dora. Veja [vozes comerciais](docs/VOZES_COMERCIAIS.md).

## Studio web local

Na raiz do repositório:

```powershell
npm run setup
npm run voices:setup
npm start
```

Nas próximas vezes, basta `npm start`: ele recompila o motor Rust e a interface
quando o código muda, então continua valendo depois de atualizar. Para encerrar os
processos desta instalação, use `npm stop`. O comando identifica o projeto antes de
parar; ele não encerra processos Node nem containers de outros projetos.

Com Docker Desktop/Engine e Compose disponíveis, as ferramentas do motor ficam
instaladas dentro da imagem:

```powershell
npm run voices:models
npm run docker:up
```

O comando prepara a chave privada de criptografia fora do repositório, constrói a
imagem e espera o healthcheck. Para parar, use `npm run docker:down`; os dados e a
chave são preservados. A primeira construção baixa e compila as dependências; as
seguintes reaproveitam o cache. O Docker usa um perfil próprio, separado do perfil
Windows existente. Consulte o [DOCKER.md](docs/DOCKER.md) para comandos Compose
diretos, volumes, modelos, backup e rollback.

Abra [http://127.0.0.1:4317](http://127.0.0.1:4317), crie a senha local e cadastre seu canal. No Studio você configura a produção, edita pesquisa de nichos, roteiros e storytelling, importa mídia autorizada e acompanha as produções do motor Rust. O painel oferece conexões de leitura com YouTube, TikTok, Instagram e Facebook, com capacidades específicas por rede; dados indisponíveis continuam desconhecidos, e pagamentos manuais ficam separados das estimativas.

Os dados privados ficam em `~/.framechester/web`, e você pode trocar o local com `FRAMECHESTER_WEB_HOME`. Os tokens usam o cofre DPAPI no Windows; eles não entram no frontend nem na configuração editorial. O servidor escuta só em loopback, com um operador e vários canais locais. A publicação continua desativada nas quatro redes.

Leia o [guia de operação do Studio](docs/WEB_STUDIO.md) para primeiro acesso, perfis, configurações, produção e diagnóstico, e o [guia das redes sociais](docs/REDES_SOCIAIS_WEB.md) para autorizações e limites das integrações.

O painel usa [tokens e componentes compartilhados](docs/DESIGN_SYSTEM.md). Pesquisa,
roteiros e narrativas oferecem rascunhos opcionais com Claude, OpenAI ou Ollama,
sempre a pedido e com revisão. A [direção criativa pessoal](docs/PROMPT_PESSOAL.md)
fica fora do Git. As APIs exigem chave no cofre e autorização de custo; o
[registro de consumo](docs/CONSUMO_IA.md) guarda o uso por canal, provedor e chave.
O Ollama exige modelo local e nuvem desativada. O Studio não baixa nenhuma voz ou
modelo sozinho.

## Uso pela CLI

```bash
cp config.example.toml framechester.toml   # ajuste caminhos locais
cargo run -p framechester-cli -- doctor
cargo run -p framechester-cli -- trends --limit 3
cargo run -p framechester-cli -- run --workdir artifacts/demo-short
cargo run -p framechester-cli -- run --format long --workdir artifacts/demo-long
cargo run -p framechester-cli -- run --topic examples/topico.exemplo.json --workdir artifacts/demo-custom
cargo run -p framechester-cli -- run --asr --workdir artifacts/demo-short
cargo run -p framechester-cli -- qa --format short --video artifacts/demo-short/render/final.mp4
```

Por padrão, o comando `run` usa o LLM de template offline, assets sintéticos e publicação em dry-run. O relatório fica em `artifacts/<run>/pipeline_report.json` e o painel local em `artifacts/<run>/report.html`; o pacote para revisão fica em `artifacts/<run>/publish/`, com `final.srt`, `description.txt`, `metadata.json` e `sources.md`, e a thumbnail em `artifacts/<run>/render/thumbnail.png`.

## Vídeos explicativos animados (motor motion)

O motor motion transforma um roteiro autoral em um storyboard semântico, narra cada
frase, anima componentes vetoriais sincronizados com a fala e exporta com legendas por
palavra, loudness normalizada e um relatório de QA que bloqueia falhas críticas. Use o
perfil `--release`: a rasterização em `debug` é várias vezes mais lenta.

```bash
cargo run --release -p framechester-cli -- plan --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format vertical --output artifacts/storyboard.json
cargo run --release -p framechester-cli -- produce --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format vertical --workdir artifacts/motion/vertical
cargo run --release -p framechester-cli -- produce --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format horizontal --workdir artifacts/motion/horizontal
cargo run --release -p framechester-cli -- run --engine motion --script examples/skills-vs-agentes.roteiro.json --topic examples/skills-vs-agentes.topico.json --format short --workdir artifacts/motion/run
cargo run --release -p framechester-cli -- short --from <storyboard.json> --workdir artifacts/short
```

O último comando corta um Short vertical de até 58 s a partir do storyboard narrado de um vídeo motion.

Formatos: `vertical` (1080x1920), `horizontal` (1920x1080) e `x` (1280x720), cada um com
layout, tipografia e áreas seguras próprias. Saídas em `workdir/`: `storyboard.json`,
`render/final.mp4`, `render/captions.srt`, `render/contact_sheet.png`,
`render/render_manifest.json`, `qa_report.json`, `pipeline_report.json` e o pacote de
publicação. Documentação: [docs/STORYBOARD.md](docs/STORYBOARD.md),
[docs/DESIGN_SYSTEM_VIDEO.md](docs/DESIGN_SYSTEM_VIDEO.md),
[docs/MOTOR_MOTION.md](docs/MOTOR_MOTION.md) e
[docs/BENCHMARK_SKILLS_VS_AGENTES.md](docs/BENCHMARK_SKILLS_VS_AGENTES.md).

## Produção autoral e vários canais

Use `examples/canais.exemplo.toml` como base privada de configuração. Cada `[[channels]]` tem um `id` local e pode declarar `youtube_channel_id` no arquivo privado. Quando há canais cadastrados, `run` exige `--channel`; um canal desconhecido ou duplicado falha antes da produção.

```bash
cargo run -p framechester-cli -- --config examples/canais.exemplo.toml run --channel tech --topic examples/topico.exemplo.json --script examples/roteiro.exemplo.json --assets caminho/manifesto.json --workdir artifacts/piloto --burn-subtitles
cargo run -p framechester-cli -- --config examples/canais.exemplo.toml analytics --channel tech --input examples/analytics.exemplo.json --json
```

O exemplo `roteiro.exemplo.json` demonstra o contrato e usa fontes fictícias, identificadas como tal; troque a pauta por material real revisado antes de produzir para publicação. `--script` lê `{topic_id, script}` e preserva a narração, as fontes e os IDs das cenas; não pode ser combinado com `--llm`. `--assets` lê um array de `AssetManifest`: `scene_id`, `kind` (`image` ou `video`), `path` relativo ao manifesto, `license`, `provenance`, `checksum` SHA256 e `restrictions`. Os arquivos precisam ficar no diretório do manifesto; cada cena exige seu recurso. O sistema confere metadados e integridade; a validade jurídica dos direitos continua exigindo evidência.

Com `--workdir artifacts/piloto --channel tech`, os resultados ficam em `artifacts/piloto/channels/tech/`. O relatório e os metadados registram o canal. O mesmo tema no canal `science` usa outro diretório. A seleção do canal e o namespace de arquivos não implementam autenticação de vários usuários, isolamento por processo nem orçamento independente persistido.

`short` orienta o perfil para vertical; `long`, para horizontal, preservando o par de dimensões configurado. O renderizador normaliza proporção, FPS e áudio e aceita imagens ou clipes locais, repetindo a fonte quando necessário para cobrir a narração. O QA continua apontando congelamentos e problemas do vídeo final.

O analytics importa observações JSON locais com origem, janela, moeda BRL e canal explícitos. O exemplo é `fixture`, com receita desconhecida. O RPM de Shorts usa engaged views; receitas estimadas e recebidas continuam separadas. Importar dados não verifica o Studio nem habilita monetização.

O verificador OAuth aceita `--channel SLUG --expected-channel-id ID` e guarda os arquivos de cada canal em `FRAMECHESTER_HOME/channels/SLUG/`. No modo canal, ele não reaproveita os caminhos globais de tokens e confere a identidade antes de salvar ou de persistir uma renovação. O verificador não faz nenhum envio. Nesse verificador Python, o armazenamento de tokens ainda precisa evoluir para o gerenciador de segredos; o cofre do Studio web é um fluxo independente.

Para reproduzir o piloto original de enquadramento vertical, o gerador de demonstração exige Pillow e FFmpeg (o Pillow não é dependência do motor Rust):

```bash
python scripts/gerar_assets_piloto.py --output-dir artifacts/piloto-multicanal/media
cargo run -p framechester-cli -- --config examples/canais.exemplo.toml run --channel tech --topic examples/piloto-vertical.topico.json --script examples/piloto-vertical.roteiro.json --assets artifacts/piloto-multicanal/media/assets.json --workdir artifacts/piloto-multicanal/output --burn-subtitles --asr
```

Os clipes são diagramas originais de demonstração. O perfil configurado controla a resolução final; a prova registrada nesta entrega usa 360x640 como prévia. O roteiro tem fontes primárias reais e continua em revisão humana. Veja [a validação executada](docs/VALIDACAO_ENTREGA.md) para comandos, resultados e limites.

Para instalar o binário:

```bash
cargo install --path crates/framechester-cli
framechester doctor
```

## Comandos

| Comando | O que faz |
|---|---|
| `doctor` | Confere FFmpeg, ffprobe, restic, Kokoro/modelos comerciais, variáveis de ambiente, telemetria e dry-run |
| `config-check` | Valida o `framechester.toml` e mostra os valores efetivos |
| `trends` | Lista e pontua os temas da fixture local, com bloqueios editoriais |
| `run` | Pipeline completo: roteiro, TTS, timeline, geração do vídeo, QA e publicação em dry-run |
| `plan` | Monta o storyboard semântico a partir do roteiro, sem narrar nem gerar o vídeo |
| `produce` | Gera um vídeo animado com o motor motion |
| `short --from PATH` | Corta um Short vertical de até 58 s a partir do storyboard narrado de um vídeo motion |
| `qa --video PATH` | QA técnico de um MP4 existente |
| `report --workdir DIR` | Gera o `report.html` offline a partir do `pipeline_report.json` |
| `backup-check` | Valida o repositório restic via `RESTIC_REPOSITORY`/`RESTIC_PASSWORD` |
| `backup --path DIR --yes` | Cria um snapshot restic local; bloqueia destino remoto sem `--allow-remote` |
| `restore --snapshot ID --target DIR --yes` | Restaura para um destino novo ou vazio; exige que o processo termine com sucesso |
| `finance` | Simula custos e receita em centavos, sem promessa de resultado |
| `analytics --channel ID --input PATH` | Valida e resume um snapshot JSON local sem misturar canais, formatos ou classes de receita |

Flags úteis em `run`: `--topic arquivo.json`, `--format short|long`, `--max-scenes N`, `--voice NOME`, `--llm template|anthropic`, `--max-cost-cents N` (obrigatório para Anthropic), `--privacy private|unlisted|public`, `--asr` para o QA de fala com whisper local e `--burn-subtitles` para queimar as legendas no MP4.

## Arquitetura

- `crates/framechester-core`: domínio, etapas, portas (traits), configuração, segurança, editorial, financeiro, QA e pipeline.
- `crates/framechester-adapters`: fixtures offline, TemplateLlm, AnthropicLlm, KokoroTts, renderizador/QA com FFmpeg + ASR com whisper, publisher em dry-run, métricas e restic.
- `crates/framechester-motion`: motor de animação (storyboard -> componentes -> quadros -> mixagem -> QA).
- `crates/framechester-cli`: comandos `doctor`, `config-check`, `trends`, `run`, `plan`, `produce`, `short`, `qa`, `report`, `backup-check`, `backup`, `restore`, `finance`.
- `web/`: frontend TypeScript/Vite e backend Node.js local, autenticação, editores, configuração por canal, cofre e integração com o motor Rust.
- `scripts/`: verificadores Python para Anthropic, YouTube OAuth e backup restic.
- `docs/`: plano operacional, inventário de viabilidade, arquitetura e ADRs.

## Testes

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
python -m unittest discover -s tests -v
npm --prefix web run check
npm --prefix web test
npm --prefix web run build
```

## Limites deste MVP

- A publicação real está desativada nas quatro redes do Studio; o publisher do motor é sempre dry-run e bloqueia `dry_run=false`.
- Legendas, thumbnail, descrição e fontes/licenças são geradas; `--burn-subtitles` embute o SRT no MP4, mas ainda não há trilha musical licenciada.
- O QA por ASR é opcional e usa whisper local; a cobertura é um alerta, não prova de qualidade editorial.
- Sem `--assets`, os recursos continuam sintéticos (`testsrc2`). Com manifesto, entram imagens e vídeos locais cujos direitos foram declarados pelo operador.
- O LLM de template é simples de propósito e exige revisão humana.
- O adaptador Anthropic tem integração HTTP, mas a inferência paga fica bloqueada antes do POST até existir cotação confiável e controle de custo por canal e por produção. `--max-cost-cents` sozinho não libera chamadas. O caminho com `--script` é local e não chama essa API.
- O Studio tem painel e fila local de produções em um único processo. Não há agendador, fila distribuída, banco SQL nem VPS; produções interrompidas por um reinício precisam ser iniciadas de novo.
- Nenhum modelo, mídia ou segredo é redistribuído no repositório.

## Licenciamento

Código próprio: [Apache License 2.0](LICENSE). FFmpeg, modelos, vozes, mídia e fontes têm licenças próprias; consulte os [avisos de terceiros](THIRD_PARTY_NOTICES.md).

## Versões e instalação por binário

Cada tag `vX.Y.Z` gera uma [release no GitHub](https://github.com/prod455/framechester/releases) com a CLI para Linux (x86_64), Windows (x86_64) e macOS (Apple Silicon), checksums SHA-256 e a imagem `ghcr.io/prod455/framechester:X.Y.Z`. O Studio continua rodando a partir do código (`npm start`) ou da imagem Docker. O projeto segue o [SemVer](https://semver.org/lang/pt-BR/) e o changelog segue o [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); antes da 1.0, versões minor podem quebrar a compatibilidade e avisam isso no changelog.

## Comunidade, contribuição e segurança

- [Ajuda e dúvidas](SUPPORT.md) · [Discussions](https://github.com/prod455/framechester/discussions)
- [Como contribuir](CONTRIBUTING.md) · [Código de conduta](CODE_OF_CONDUCT.md) · [Governança](GOVERNANCE.md)
- [Política de segurança](SECURITY.md): relato privado, nunca uma issue pública
- Modelos de [issue](.github/ISSUE_TEMPLATE) e de [pull request](.github/PULL_REQUEST_TEMPLATE.md); dependências atualizadas pelo Dependabot e auditadas toda semana (`cargo audit`, `npm audit`)

Nunca envie tokens reais, dados pessoais, mídia não autorizada ou URLs privadas.

As [equipes e skills locais](docs/EQUIPES_E_SKILLS.md) apoiam a implementação em Rust e o marketing por canal. Consulte a [auditoria de engenharia](docs/AUDITORIA_ENGENHARIA.md), o [plano de marketing](docs/MARKETING_YOUTUBE_OPERACIONAL.md) e a [curadoria de fontes](docs/skills-sources.lock.md) para evidências e limites.
