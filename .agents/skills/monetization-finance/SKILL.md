---
name: monetization-finance
description: Calcular cenários e conciliar custos e receitas oficiais da audiência por canal Framechester, distinguindo caixa, resultado econômico e ponto de equilíbrio.
license: Apache-2.0
---

# Financeiro de monetização

Leia o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e as [definições financeiras e de YPP](../../../docs/MARKETING_YOUTUBE_OPERACIONAL.md). Selecione canal, período, moeda e recurso de receita.

1. Classifique cada número como dado oficial, informado, hipótese ou desconhecido. Canal configurado e views não demonstram aprovação; cenário operacional mantém anúncios/Premium em zero até evidência correspondente.
2. Separe receita estimada, saldo finalizado e pagamento efetivo. Evite somar Premium novamente se já compõe a medida de receita/RPM utilizada.
3. Distinga gastos incrementais, custos já pagos rateados, horas próprias, depreciação e tributos. Defaults de backup/câmbio são parâmetros, não cotação verificada.
4. Calcule em unidades monetárias consistentes e verifique arredondamento. O equilíbrio informado como long-only deve cobrir o custo pelo líquido de longos após impostos, sem subsidiá-lo silenciosamente por Shorts.
5. Para RPM zero, recurso inativo, tributo integral ou parâmetro desconhecido, informe inexistência de equilíbrio finito confiável conforme o caso. Portfólio agrega resultados compatíveis, não elegibilidade entre canais.

**Artefato:** demonstrativo reproduzível por canal, entradas com origem/validade, cenários rotulados e testes de fronteira monetária.

**Aceite:** ninguém confunde projeção com receita recebida; lucro econômico considera trabalho próprio.

**Avaliações:**
- Normal: receita oficial conciliada com custos gera resultados de caixa e econômico distintos.
- Adverso: views de canal inelegível com RPM hipotético produzem “lucro”; manter cenário operacional em zero e rotular simulação.
