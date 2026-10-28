# Framechester V4 — pre-alpha executavel

**Estado:** o primeiro corte vertical ja roda localmente (topico -> roteiro -> narracao PT-BR -> render -> QA -> dry-run). Ainda nao ha upload real, footage licenciado, scheduler, banco ou dashboard.

1. Leia `README.md` e `docs/PLANO_OPERACIONAL_COMPLETO.md`.
2. Copie `config.example.toml` para `framechester.toml` e ajuste caminhos locais (nunca commite esse arquivo).
3. Rode `cargo run -p framechester-cli -- doctor`.
4. Gere um video de demonstracao: `cargo run -p framechester-cli -- run --workdir artifacts/demo-short`.
5. Revise `artifacts/demo-short/pipeline_report.json` antes de qualquer publicacao.
6. Revise o diff e as varreduras de segredos/licencas antes de tornar o repositorio publico.
7. Nao poste videos, publique repo, faca commits/push, contrate backup, nem conecte contas reais sem autorizacao explicita.
8. Execute `python scripts/calculadora_monetizacao.py --storage-gb 50` para simular custos de backup.

**Escopo monetario:** seus videos/canais monetizam nas plataformas; o software open-source nao inclui venda, afiliados nem faturamento como SaaS.
