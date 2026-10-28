---
name: marketing-data-analysis
description: Analisar dados de marketing, custos e receitas por canal com validação de origem, janelas compatíveis e cálculo reproduzível, sem ativar telemetria.
license: Apache-2.0
---

# Análise de dados de marketing

Leia o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e o [plano YouTube](../../../docs/MARKETING_YOUTUBE_OPERACIONAL.md). Esta função valida cálculos e comparabilidade; a análise YouTube interpreta o contexto do canal e a direção decide prioridades.

1. Identifique `channel_id`, decisão, arquivos de entrada, origem, data de extração, período, fuso, moeda, unidade e definição de cada métrica.
2. Valide linhas duplicadas, valores ausentes, sinal, escala e cobertura. Preserve zeros verdadeiros e use `unknown` para ausências; rejeite junções ambíguas entre canais.
3. Calcule por código ou planilha, registrando fórmulas e tratamento de dados. Razões exigem numerador e denominador da mesma população e janela. Agregue taxas pelos componentes quando forem compatíveis.
4. Separe receita estimada, recebida, custos incrementais, despesas fixas e trabalho do operador. Apresente margem com seu escopo e moeda explícitos; CPM não substitui RPM.
5. Compare por canal, formato e janela. Declare amostra, atrasos, mudanças de definição e vieses; uma correlação orienta investigação, sem provar causalidade.

**Artefato:** `artifacts/channels/<channel_id>/marketing/data-readout.md`, com fontes, validação, cálculos reproduzíveis, achados, incertezas e decisão suportada. Anexos preservam a identificação do canal.

**Aceite:** números reconciliam com as entradas ou explicam a diferença; fontes privadas seguem o armazenamento previsto no contrato.

**Avaliação normal:** dois CSVs compatíveis geram taxas ponderadas e custos conciliados.

**Avaliação adversa:** receita em moedas diferentes, janela parcial e denominador zero produzem análise segmentada e razões indefinidas, sem preenchimento fictício.
