# Canais e calendário inicial

Decisão do operador em 08/11/2026: abrir os canais pelos nichos de maior RPM e publicar
um vídeo por dia às 22:00 (horário de Brasília, 20:00 em Nova York).

## Canais

| Canal | Idioma | Nicho | Por quê |
|---|---|---|---|
| `money-explained` | en-US | finanças pessoais com contas | nicho de maior RPM nas estimativas públicas de 2026, público dos EUA |
| `tech-explained` | en-US | tecnologia e IA | segundo grupo de RPM; o motor já tem os componentes de diagrama |
| `dinheiro-explicado` | pt-BR | finanças pessoais | mesmo formato para o público brasileiro; RPM menor |

As faixas de RPM vêm de blogs de ferramentas (OutlierKit, TubeLab, ClipSpeed), não de
dados próprios: servem para ordenar nichos, não para prever receita. Canal novo só
recebe anúncio depois do YPP.

## Primeiros 7 vídeos (`money-explained`, horizontal)

Todo número sai de conta reproduzível (fórmula de juros compostos, amortização ou
simulação mensal), com a suposição dita na tela. As fontes são SEC/Investor.gov, CFPB,
BLS e Navy Federal.

| Dia (22:00 BRT) | Vídeo | Roteiro |
|---|---|---|
| dom 08/11 | Invest less, end up richer | `examples/juros-compostos` |
| seg 09/11 | Why a $5,000 credit card takes almost 5 years to pay off | `examples/money-explained/02-credit-card-minimum` |
| ter 10/11 | How a 1% fee can cost you $95,000 | `examples/money-explained/03-investment-fees` |
| qua 11/11 | Cash is not safe: what 3% inflation does to $10,000 | `examples/money-explained/04-inflation-cash` |
| qui 12/11 | Pay $100 extra on a car loan and see what happens | `examples/money-explained/05-car-loan-extra-100` |
| sex 13/11 | Debt snowball vs avalanche: the math with three real-looking debts | `examples/money-explained/06-snowball-vs-avalanche` |
| sáb 14/11 | What $50 a month in subscriptions really costs over 30 years | `examples/money-explained/07-subscriptions-50` |

Cada roteiro tem `.roteiro.json` e `.topico.json`. Produzir:

```bash
framechester --config framechester.toml run --channel money-explained --script <roteiro> --topic <topico> --format long --workdir artifacts/money
```
