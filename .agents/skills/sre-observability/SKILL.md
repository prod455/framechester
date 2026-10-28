---
name: sre-observability
description: Melhorar estado, diagnostico e recuperacao operacional de jobs locais do Framechester quando ha falhas, interrupcoes, lentidao ou necessidade de rastrear uma execucao.
license: Apache-2.0
---

# SRE e observabilidade local

Siga o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md). Use eventos
locais necessarios ao operador e mantenha a telemetria remota desativada.

1. Defina a unidade operacional: canal, job e etapa. Identifique inicio, fim,
   erro e artefatos de cada efeito que precisa ser rastreado.
2. Registre duracao, resultado e contexto suficiente para diagnostico sem
   conteudo privado ou segredo. Diferencie falha tecnica, QA reprovado,
   dependencia indisponivel e revisao humana pendente.
3. Ao investigar desempenho, meca uma carga representativa e mantenha a
   configuracao comparavel. Use percentis apenas com amostra suficiente e
   informe tamanho da amostra e incerteza.
4. Para recuperacao, preserve trabalho valido e defina idempotencia antes de
   repetir efeitos externos. Jobs interrompidos precisam de estado demonstravel;
   um arquivo existente nao prova conclusao ou integridade.
5. Exercite interrupcao e retomada em fronteiras da fatia. Faca restauracao
   pela skill responsavel quando o incidente envolver backup, conferindo
   integridade do material recuperado.
6. Entregue runbook curto com sintoma, diagnostico, acao e verificacao. Qualquer
   alerta ou automacao futura deve ter condicao acionavel e respeitar as
   autorizacoes de execucao do operador.

**Artefato:** eventos ou relatorio de execucao e procedimento de recuperacao.
**Aceite:** operador explica uma falha e verifica retomada sem presumir sucesso.

**Cenario normal:** job mostra tempos e saidas associados ao proprio canal.
**Cenario adverso:** processo interrompido permanece incompleto e nao e publicado.
