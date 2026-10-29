# Framechester

**Motor open-source, self-hosted e single-operator de producao e analise de midia.**

[![CI](https://github.com/prod455/framechester/actions/workflows/ci.yml/badge.svg)](https://github.com/prod455/framechester/actions/workflows/ci.yml)
[![Docker](https://github.com/prod455/framechester/actions/workflows/docker.yml/badge.svg)](https://github.com/prod455/framechester/actions/workflows/docker.yml)
[![Release](https://img.shields.io/github/v/release/prod455/framechester?include_prereleases&sort=semver)](https://github.com/prod455/framechester/releases)
[![License: Apache-2.0](https://img.shields.io/badge/license-Apache--2.0-blue.svg)](LICENSE)
![Rust 1.85+](https://img.shields.io/badge/rust-1.85%2B-orange.svg)
![Node 22.12+](https://img.shields.io/badge/node-22.12%2B-brightgreen.svg)

> **Status:** versao 0.1.0. Studio web local, editores e producao completa por canal: topico -> roteiro (manual ou com IA) -> fontes revisadas por pares -> visuais explicativos -> TTS PT-BR -> render FFmpeg -> QA -> video aprovado para upload manual. Publicacao automatica continua desativada; elegibilidade e receita dependem de cada canal. Veja o [CHANGELOG](CHANGELOG.md) e [como aprovar um video](docs/WEB_STUDIO.md#fontes-e-revisão).

Framechester ajuda um criador independente a descobrir assuntos, verificar fontes, escrever roteiros originais, gerar narracao, renderizar video, rodar QA audiovisual e analisar monetizacao oficial da plataforma. Nao e fabrica de engajamento, nao compra views e nao garante elegibilidade ou receita.

No Studio, **Produzir com IA** recebe sua orientação, desenvolve um novo roteiro e segue automaticamente com [visuais explicativos locais](docs/VISUAIS_AUTOMATICOS.md), voz, legendas, montagem e QA. Você autoriza o custo antes da geração paga e revisa o vídeo resultante. A preparação manual permanece nos controles avançados.

## Principios

- **Self-hosted, multicanais e um operador:** sem conta central, billing, SaaS ou API paga obrigatoria.
- **Open-source:** codigo proprio em Apache-2.0; dependencias, modelos, vozes, midia e fontes mantem suas licencas.
- **Local-first:** orquestracao em Rust, FFmpeg como CLI externa, TTS/LLM substituiveis.
- **Privacy-first:** telemetria desligada por padrao; credenciais ficam apenas na instalacao local.
- **Editorial-first:** fontes datadas, trabalho original, QA e aprovacao humana antes de publicar.
- **Receita:** cada criador usa a monetizacao oficial do seu proprio canal; o projeto nao vende servico, assinatura ou audiencia.

## Requisitos

- Node.js 22.12+ e npm para o Studio web
- Rust 1.85+ (testado com 1.99.1)
- FFmpeg/ffprobe no `PATH` (testado com 9.0.1 full build)
- Python 3.11–3.13 + Kokoro PT-BR: `npm run voices:setup` (runtime e modelos comerciais fixados)
- Opcional: restic para backup/restore
- Opcional: whisper/FFmpeg com modelo para QA ASR (`--asr`)
- Opcional: chave Anthropic para o adaptador de LLM pago

A narração usa somente Dora, Alex e Santa, vozes brasileiras do Kokoro-82M v1.0 sob Apache-2.0. O motor confere os hashes do modelo e das vozes antes de narrar. Piper e vozes fora do catálogo ficam bloqueados; configurações antigas migram para Dora. Veja [vozes comerciais](docs/VOZES_COMERCIAIS.md).

## Studio web local

Na raiz do repositorio:

```powershell
npm run setup
npm run voices:setup
npm start
```

Nas proximas execucoes, basta `npm start`: ele recompila o motor Rust e a
interface quando o codigo muda, entao continua valendo depois de atualizar. Para encerrar os processos desta
instalacao, use `npm stop`. O comando identifica o projeto antes de parar;
nao encerra processos Node ou containers de outros projetos.

Com Docker Desktop/Engine e Compose disponiveis, a instalacao das ferramentas
do motor fica dentro da imagem:

```powershell
npm run voices:models
npm run docker:up
```

O comando prepara a chave privada de criptografia fora do repositorio, constroi
a imagem e aguarda o healthcheck. Para parar, use `npm run docker:down`; os
dados e a chave sao preservados. A primeira construcao baixa e compila as
dependencias; as seguintes reutilizam cache. O Docker usa um perfil proprio,
separado do perfil Windows existente. Consulte [DOCKER.md](docs/DOCKER.md)
para comandos Compose diretos, volumes, modelos, backup e rollback.

Abra [http://127.0.0.1:4317](http://127.0.0.1:4317), crie a senha local e cadastre seu canal. O Studio permite configurar a producao, editar pesquisa de nicho, roteiros e storytelling, importar midia autorizada e acompanhar jobs do motor Rust. O painel oferece conexoes/leitura para YouTube, TikTok, Instagram e Facebook, com capacidades especificas por rede; dados indisponiveis continuam desconhecidos e pagamentos manuais ficam separados de estimativas.

Dados privados ficam em `~/.framechester/web`, selecionaveis por `FRAMECHESTER_WEB_HOME`. Tokens usam cofre DPAPI no Windows; nao entram no frontend ou na configuracao editorial. O servidor escuta somente em loopback, com um operador e varios canais locais. Publicacao continua desativada nas quatro redes.

Leia o [guia de operacao do Studio](docs/WEB_STUDIO.md) para primeiro acesso, perfis, configuracoes, producao e diagnostico, e o [guia das redes sociais](docs/REDES_SOCIAIS_WEB.md) para autorizacoes e limites das integracoes.

O painel usa [tokens e componentes compartilhados](docs/DESIGN_SYSTEM.md). Pesquisa,
roteiros e narrativas oferecem rascunhos opcionais com Claude, OpenAI ou Ollama,
sempre mediante pedido e revisao. A [direcao criativa pessoal](docs/PROMPT_PESSOAL.md)
fica fora do Git. APIs exigem chave no cofre e autorizacao de custo; o
[registro de consumo](docs/CONSUMO_IA.md) preserva uso por canal/provedor/chave.
Ollama exige modelo local e nuvem desativada. Nenhuma voz ou modelo e baixado
automaticamente pelo Studio.

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

O comando `run` usa por padrao o LLM de template offline, assets sinteticos e publicacao em dry-run. O relatorio fica em `artifacts/<run>/pipeline_report.json` e o painel local em `artifacts/<run>/report.html`; o pacote revisavel fica em `artifacts/<run>/publish/` com `final.srt`, `description.txt`, `metadata.json` e `sources.md`, e a thumbnail em `artifacts/<run>/render/thumbnail.png`.

## Producao autoral e multicanais

Use `examples/canais.exemplo.toml` como base privada de configuracao. Cada `[[channels]]` tem um `id` local e pode declarar `youtube_channel_id` no arquivo privado. Quando ha canais cadastrados, `run` exige `--channel`; canal desconhecido ou duplicado falha antes da producao.

```bash
cargo run -p framechester-cli -- --config examples/canais.exemplo.toml run --channel tech --topic examples/topico.exemplo.json --script examples/roteiro.exemplo.json --assets caminho/manifesto.json --workdir artifacts/piloto --burn-subtitles
cargo run -p framechester-cli -- --config examples/canais.exemplo.toml analytics --channel tech --input examples/analytics.exemplo.json --json
```

O exemplo `roteiro.exemplo.json` demonstra o contrato e usa fontes ficticias explicitamente identificadas; substitua a pauta por material real revisado antes de produzir para publicacao. `--script` le `{topic_id, script}` e preserva a narracao, fontes e IDs das cenas; nao pode ser combinado com `--llm`. `--assets` le um array de `AssetManifest`: `scene_id`, `kind` (`image` ou `video`), `path` relativo ao manifesto, `license`, `provenance`, `checksum` SHA256 e `restrictions`. Arquivos devem permanecer no diretorio do manifesto; cada cena exige seu recurso. O sistema verifica metadados e integridade; a validade juridica dos direitos continua exigindo evidencia.

Com `--workdir artifacts/piloto --channel tech`, os resultados ficam em `artifacts/piloto/channels/tech/`. Relatorio e metadados registram o canal. O mesmo topico no canal `science` usa outro diretorio. A selecao do canal e o namespace de arquivos nao implementam autenticacao de varios usuarios, isolamento por processo ou orcamento independente persistido.

`short` orienta o perfil para vertical; `long`, para horizontal, preservando o par de dimensoes configurado. O renderer normaliza proporcao, FPS e audio e aceita imagens ou clips locais, repetindo a fonte quando necessario para cobrir a narracao. O QA continua identificando congelamentos e problemas do video final.

Analytics importa observacoes JSON locais com origem, janela, moeda BRL e canal explicitos. O exemplo e `fixture`, com receita desconhecida. RPM de Shorts usa engaged views; receitas estimadas e recebidas permanecem separadas. Importar dados nao verifica o Studio nem habilita monetizacao.

O verificador OAuth aceita `--channel SLUG --expected-channel-id ID` e guarda os arquivos de cada canal em `FRAMECHESTER_HOME/channels/SLUG/`. No modo canal nao reutiliza os caminhos globais de tokens; confere a identidade antes de salvar ou persistir renovacao. Nenhum upload e feito pelo verificador. Nesse verificador Python, o armazenamento de tokens ainda precisa evoluir para o gerenciador de segredos; o cofre do Studio web e um fluxo independente.

Para reproduzir o piloto original de enquadramento vertical, o gerador de demonstracao exige Pillow e FFmpeg (Pillow nao e dependencia do motor Rust):

```bash
python scripts/gerar_assets_piloto.py --output-dir artifacts/piloto-multicanal/media
cargo run -p framechester-cli -- --config examples/canais.exemplo.toml run --channel tech --topic examples/piloto-vertical.topico.json --script examples/piloto-vertical.roteiro.json --assets artifacts/piloto-multicanal/media/assets.json --workdir artifacts/piloto-multicanal/output --burn-subtitles --asr
```

Os clipes sao diagramas originais de demonstracao. O perfil configurado controla a resolucao final; a prova registrada nesta entrega usa 360x640 como previa. O roteiro tem fontes primarias reais e continua em revisao humana. Veja [a validacao executada](docs/VALIDACAO_ENTREGA.md) para comandos, resultados e limites.

Para instalar o binario:

```bash
cargo install --path crates/framechester-cli
framechester doctor
```

## Comandos

| Comando | O que faz |
|---|---|
| `doctor` | Checa FFmpeg, ffprobe, restic, Kokoro/modelos comerciais, variaveis de ambiente, telemetria e dry-run |
| `config-check` | Valida `framechester.toml` e mostra os valores efetivos |
| `trends` | Lista e pontua topicos do fixture local, com bloqueios editoriais |
| `run` | Pipeline completo: roteiro, TTS, timeline, render, QA e dry-run publish |
| `qa --video PATH` | QA tecnico de um MP4 existente |
| `report --workdir DIR` | Gera `report.html` offline a partir de `pipeline_report.json` |
| `backup-check` | Valida o repositorio restic via `RESTIC_REPOSITORY`/`RESTIC_PASSWORD` |
| `backup --path DIR --yes` | Cria snapshot restic local; bloqueia remoto sem `--allow-remote` |
| `restore --snapshot ID --target DIR --yes` | Restaura para destino novo/vazio; exige sucesso do processo |
| `finance` | Simula custos e receita em centavos, sem promessa de resultado |
| `analytics --channel ID --input PATH` | Valida e resume um snapshot JSON local sem misturar canais, formatos ou classes de receita |

Flags uteis em `run`: `--topic arquivo.json`, `--format short|long`, `--max-scenes N`, `--voice NOME`, `--llm template|anthropic`, `--max-cost-cents N` (obrigatorio para Anthropic), `--privacy private|unlisted|public`, `--asr` para QA de fala com whisper local e `--burn-subtitles` para queimar as legendas no MP4.

## Arquitetura

- `crates/framechester-core`: dominio, estagios, portas (traits), config, seguranca, editorial, financeiro, QA e pipeline.
- `crates/framechester-adapters`: fixtures offline, TemplateLlm, AnthropicLlm, KokoroTts, renderer/QA FFmpeg + ASR whisper, dry-run publisher, metricas e restic.
- `crates/framechester-cli`: comandos `doctor`, `config-check`, `trends`, `run`, `qa`, `report`, `backup-check`, `backup`, `restore`, `finance`.
- `web/`: frontend TypeScript/Vite e backend Node.js local, autenticacao, editores, configuracao por canal, cofre e integracao com o motor Rust.
- `scripts/`: verificadores Python para Anthropic, YouTube OAuth e backup restic.
- `docs/`: plano operacional, inventario de viabilidade, arquitetura e ADRs.

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

- Publicacao real esta desativada nas quatro redes do Studio; o publisher do motor sempre dry-run e bloqueia `dry_run=false`.
- Legendas, thumbnail, descricao e fontes/licencas sao geradas; `--burn-subtitles` embute o SRT no MP4, mas ainda nao ha trilha musical licenciada.
- O QA ASR e opcional e usa whisper local; a cobertura e um alerta, nao prova de qualidade editorial.
- Sem `--assets`, os recursos continuam sinteticos (`testsrc2`). Com manifesto, entram imagens e videos locais cujos direitos foram declarados pelo operador.
- O LLM de template e deliberadamente simples e exige revisao humana.
- O adaptador Anthropic possui integracao HTTP, mas inferencia paga fica bloqueada antes do POST ate existir cotacao confiavel e controle de custo por canal/job. `--max-cost-cents` sozinho nao libera chamadas. O caminho com `--script` e local e nao chama essa API.
- O Studio tem dashboard e fila local de jobs em um processo. Nao ha agendador, fila distribuida, banco SQL ou VPS; jobs interrompidos no reinicio exigem novo trabalho.
- Nenhum modelo, midia ou segredo e redistribuido no repositorio.

## Licenciamento

Codigo proprio: [Apache License 2.0](LICENSE). FFmpeg, modelos, vozes, midia e fontes sao licenciados separadamente; consulte [third-party notices](THIRD_PARTY_NOTICES.md).

## Versoes e instalacao por binario

Cada tag `vX.Y.Z` gera uma [release no GitHub](https://github.com/prod455/framechester/releases) com a CLI para Linux (x86_64), Windows (x86_64) e macOS (Apple Silicon), checksums SHA-256 e a imagem `ghcr.io/prod455/framechester:X.Y.Z`. O Studio continua sendo executado a partir do codigo (`npm start`) ou da imagem Docker. O projeto segue [SemVer](https://semver.org/lang/pt-BR/) e o changelog segue [Keep a Changelog](https://keepachangelog.com/pt-BR/1.1.0/); antes de 1.0, versoes minor podem quebrar compatibilidade e dizem isso no changelog.

## Comunidade, contribuicao e seguranca

- [Ajuda e duvidas](SUPPORT.md) · [Discussions](https://github.com/prod455/framechester/discussions)
- [Como contribuir](CONTRIBUTING.md) · [Codigo de conduta](CODE_OF_CONDUCT.md) · [Governanca](GOVERNANCE.md)
- [Politica de seguranca](SECURITY.md): relato privado, nunca issue publica
- Templates de [issue](.github/ISSUE_TEMPLATE) e de [pull request](.github/PULL_REQUEST_TEMPLATE.md); dependencias atualizadas pelo Dependabot e auditadas semanalmente (`cargo audit`, `npm audit`)

Nunca envie tokens reais, dados pessoais, midia nao autorizada ou URLs privadas.

As [equipes e skills locais](docs/EQUIPES_E_SKILLS.md) apoiam implementacao Rust e marketing por canal. Consulte a [auditoria de engenharia](docs/AUDITORIA_ENGENHARIA.md), o [plano de marketing](docs/MARKETING_YOUTUBE_OPERACIONAL.md) e a [curadoria de fontes](docs/skills-sources.lock.md) para evidencias e limites.




