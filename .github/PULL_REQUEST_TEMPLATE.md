## O que muda

<!-- Comportamento antes e depois, em uma ou duas frases. Referencie a issue com "Closes #N". -->

## Como foi verificado

<!-- Comandos executados e resultado. Mudanças de render/QA incluem um relatório local (`pipeline_report.json`) e dizem se os fixtures são sintéticos ou reais. -->

- [ ] `cargo fmt --all --check && cargo clippy --workspace --all-targets -- -D warnings && cargo test --workspace`
- [ ] `npm --prefix web run check && npm --prefix web test && npm --prefix web run build`
- [ ] `python -m unittest discover -s tests -v`
- [ ] Testes adicionados ou atualizados junto com a implementação
- [ ] `CHANGELOG.md` atualizado em `[Unreleased]`

## Regras do projeto

- [ ] Sem credenciais, tokens, dados pessoais, mídia real ou URLs privadas
- [ ] Studio continua em loopback, com autenticação/CSRF e cofre local; publicação continua desativada
- [ ] Dependências, modelos ou assets novos trazem licença e origem em `THIRD_PARTY_NOTICES.md`
