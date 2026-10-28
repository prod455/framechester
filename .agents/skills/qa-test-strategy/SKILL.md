---
name: qa-test-strategy
description: Definir cobertura e evidencias de aceite de uma fatia do Framechester quando existem contratos, risco de regressao, dados de canal ou efeitos externos a verificar.
license: Apache-2.0
---

# Estrategia de QA

Aplique o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md). O dono da
fatia implementa; QA torna o criterio observavel e verifica o resultado.

1. Transforme o requisito em entradas, saidas e falhas esperadas. Identifique
   primeiro perda de dados, mistura de canais, autorizacao, custos e qualidade.
2. Escolha a interface publica que demonstra cada risco. Reuse os testes
   existentes e fixtures sinteticas; registre o comportamento incorreto antes
   de aprovar a correcao.
3. Separe testes deterministas de dominio, contratos de adapters, integracao
   CLI e smoke com ferramentas locais. Reserve avaliacao humana para fatos,
   originalidade e qualidade perceptual que uma metrica isolada nao comprova.
4. Cubra a jornada principal e um caminho adverso material por invariante.
   Confirme que o teste falha pela razao pretendida e nao por infraestrutura.
5. Execute os comandos disponiveis e guarde resultado, ambiente e limitacoes.
   Classifique dependencias ausentes como nao verificadas; gates incompletos
   permanecem pendentes.
6. Revise se as assercoes observam comportamento e sobreviveriam a uma troca
   interna de implementacao. Encaminhe bugs reproduziveis com severidade,
   arquivo, evidencia e criterio de fechamento.

**Artefato:** matriz requisito→teste→resultado e regressoes relevantes.
**Aceite:** riscos materiais cobertos e estados de execucao relatados fielmente.

**Cenario normal:** fluxo local produz pacote no canal solicitado e testes passam.
**Cenario adverso:** configuracao de outro canal ou QA pendente bloqueia o efeito
correspondente, com erro acionavel e nenhuma publicacao.
