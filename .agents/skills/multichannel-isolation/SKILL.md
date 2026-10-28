---
name: multichannel-isolation
description: Implementar ou auditar identidade e separacao de multiplos canais locais do Framechester quando configuracoes, artefatos, roteiros, metricas ou receitas podem se misturar.
license: Apache-2.0
---

# Isolamento de multiplos canais

O [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) define o escopo:
um operador controla varios canais; autenticacao SaaS exige trabalho separado.

1. Identifique a origem do canal selecionado e os recursos afetados. Trace o
   identificador ate saidas, pacote, relatorio, publicacao e dados financeiros.
2. Valide IDs antes de derivar caminhos. Rejeite duplicatas, travessia, nomes
   reservados e selecao ambigua. Mantenha defaults legados somente onde nao
   possam selecionar silenciosamente outra conta.
3. Separe diretorios e associe metadados ao canal e ao job. Entradas privadas
   e credenciais devem ter referencia local apropriada, com contexto explicito
   em cada uso futuro de uma conta externa.
4. Para importacao de roteiro ou metricas, confirme correspondencia de canal,
   periodo e formato. Dados de um canal nao sao evidencia de outro nem
   autorizam reutilizar a aprovacao de um video diferente.
5. Teste dois canais na mesma raiz, reexecucao e selecao invalida. Confira que
   falhas ocorrem antes de efeitos caros e que o arquivo final de um canal
   nao e sobrescrito pelo outro.
6. Declare limites: segregacao de nomes e pastas sob o mesmo usuario do SO nao
   oferece barreira de acesso contra esse usuario ou malware local.

**Artefato:** fluxo isolado por canal, testes cruzados e migracao documentada.
**Aceite:** identidade preservada em todos os recursos da fatia.

**Cenario normal:** tech e ciencia geram relatorios em destinos distintos.
**Cenario adverso:** roteiro identificado como ciencia nao e aceito em tech.
