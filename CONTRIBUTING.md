# Como contribuir com o Framechester

Obrigado pela ajuda. O Framechester é um motor de produção de mídia self-hosted, para um único operador: um motor em Rust (`crates/`) e um Studio local em TypeScript (`web/`). As contribuições são avaliadas pelo mérito e pelo alinhamento com os [princípios do README](README.md#princípios).

## Antes de começar

- Abra uma issue antes de qualquer coisa além de uma correção pequena, para discutir o desenho antes do código.
- Leia o [`CLAUDE.md`](CLAUDE.md) e o [`AGENTS.md`](AGENTS.md): eles trazem as regras que toda mudança precisa respeitar, seja escrita por uma pessoa ou com um assistente de IA.
- Consulte as [notas de arquitetura](docs/OPEN_SOURCE_ARCHITECTURE.md) e o [plano operacional](docs/PLANO_OPERACIONAL_COMPLETO.md); eles são a fonte de verdade sobre o escopo.
- Ao escrever documentação ou textos da interface, siga o [guia de escrita](docs/GUIA_DE_ESCRITA.md).

## Preparação

Requisitos: Rust 1.85+, Node.js 22.12+, Python 3.11–3.13, FFmpeg/ffprobe no `PATH`.

```bash
git clone https://github.com/prod455/framechester
cd framechester
npm run setup          # installs the Studio dependencies and builds the engine
npm run voices:setup   # Kokoro PT-BR runtime and pinned commercial voices
npm start              # http://127.0.0.1:4317
```

`npm run dev` inicia o backend em modo watch, com o Vite em `http://127.0.0.1:5173`. A CLI roda a partir do workspace: `cargo run -p framechester-cli -- doctor`.

## Verificações

Antes de abrir um pull request, rode tudo o que o CI roda:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets -- -D warnings
cargo test --workspace
python -m unittest discover -s tests -v
npm --prefix web run check     # typecheck + Prettier
npm --prefix web test
npm --prefix web run build
npm run infra:test             # startup/shutdown helpers
```

`npm --prefix web run format` aplica o Prettier. O Rust é formatado pelo `cargo fmt`.

## Convenções

- **Testes vêm junto com a implementação.** Uma mudança de comportamento sem um teste que falhava antes dela não está completa. Os testes do Studio usam `node:test` (`web/tests/*.test.ts`); os testes do motor ficam junto do código; contratos entre linguagens compartilham fixtures em `tests/fixtures/`.
- **Um jeito óbvio.** Não crie um segundo caminho para algo que já funciona; substitua o existente.
- **Erros são explícitos.** Prefira um erro de compilação a um erro em tempo de execução, e um erro em tempo de execução a uma saída errada em silêncio. O Studio mostra o que o motor disse; ele nunca adivinha.
- **O escopo continua honesto.** O motor nunca publica, compra ou gasta sem uma ação explícita do operador; `dry_run` continua `true`; o Studio continua em loopback, com autenticação, CSRF e o cofre local. Não enfraqueça nada disso para facilitar uma funcionalidade.
- **Nada de dados reais no repositório.** Nada de credenciais, tokens, dados pessoais, mídia real, URLs privadas, capturas de tela de analytics ou perfis de operador. As fixtures são sintéticas e dizem isso.
- **Material de terceiros é registrado.** Uma nova dependência, modelo, voz, fonte tipográfica ou asset entra com licença e origem no [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md) (e no `docker/THIRD_PARTY.md` quando vai na imagem).
- **Changelog.** Adicione uma linha em `## [Unreleased]` no [`CHANGELOG.md`](CHANGELOG.md), escrita para o operador, não para o diff.
- **Commits** usam um assunto curto no imperativo (`fix: …`, `feat: …`, `docs: …`); PRs são pequenos e focados e seguem o [modelo](.github/PULL_REQUEST_TEMPLATE.md).

Mudanças em mídia e geração de vídeo incluem um relatório local de `run`/`qa` na descrição do PR e dizem quais fixtures são sintéticas e quais são reais. Afirmações de ganho de desempenho vêm com a medição.

## O que não aceitamos

Viewbots, manipulação de engajamento, scraping contra os termos das plataformas, automação com cookies de sessão, desvios das travas de publicação ou de custo, e qualquer coisa que invente fontes, elegibilidade ou receita.

## Como lançar uma versão

Só para mantenedores.

1. Mova as entradas de `## [Unreleased]` do `CHANGELOG.md` para uma nova seção `## [X.Y.Z] - YYYY-MM-DD` e atualize a versão em `Cargo.toml` (`[workspace.package]`), `package.json` e `web/package.json`.
2. Rode a lista completa de verificações acima e `cargo build --locked --release -p framechester-cli`.
3. Revise o `THIRD_PARTY_NOTICES.md` contra os lockfiles (`cargo audit`, `npm audit`).
4. Faça o merge na `main` e crie a tag: `git tag -a vX.Y.Z -m "Framechester X.Y.Z" && git push origin vX.Y.Z`.
5. O workflow `release` compila a CLI para Linux, Windows e macOS, publica a imagem do container em `ghcr.io/prod455/framechester` e cria a GitHub Release com a seção do changelog como notas.

## Licença

Ao contribuir, você concorda que sua contribuição fica licenciada sob a [Apache License 2.0](LICENSE), como o restante do código próprio do projeto.
