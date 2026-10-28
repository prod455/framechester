---
name: rust-developer
description: Implementar e refatorar funcionalidades Rust executaveis do Framechester, conectando dominio, adaptadores e CLI com regressao reproduzida e validacao real do comportamento entregue.
license: Apache-2.0
---

# Rust Developer

Use o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e os comandos
reais do workspace. Leia a porta publica, os consumidores e os testes antes
de alterar o codigo; preserve a separacao core/adapters/CLI. O resultado deve
ser uma fatia funcional observavel, acompanhada da evidencia correspondente.

1. Defina entrada, saida, erros, compatibilidade e criterio de aceite da fatia.
   Identifique efeitos em arquivos, rede, custos e contexto do canal.
2. Reproduza o comportamento incorreto ou a capacidade ausente com teste pela
   interface publica. Rode o teste e registre a falha antes da implementacao.
3. Implemente a menor mudanca que atende o comportamento. Use tipos de dominio,
   erros explicitos e ownership simples; introduza concorrencia ou novas
   dependencias somente com necessidade demonstrada.
4. Valide dados na fronteira e mantenha operacoes locais isoladas por canal.
   Nao converta erro externo, falta de evidencia ou QA pendente em sucesso.
5. Execute formatacao, lint e testes relevantes. Para mudanca audiovisual,
   rode smoke com midia sintetica local e confira o arquivo de saida; um
   argumento de comando bem formado nao prova que o renderer funciona.
6. Revise diff, compatibilidade e caminhos de falha. Registre limites sem
   declarar recursos de adaptadores ou APIs que nao foram executados.

**Artefato:** codigo funcional, testes, comando de uso e evidencia de execucao.
**Aceite:** comportamento observavel passa; regressao negativa bloqueia;
nenhuma publicacao, credencial real ou gasto introduzido sem autorizacao.

**Cenario normal:** manifesto local autorizado gera MP4 com a imagem ou video
fornecido, audio da narracao e perfil esperado, comprovados pelo smoke.
**Cenario adverso:** checksum alterado ou cena sem asset falha antes do render,
sem substituir silenciosamente a midia por um placeholder.
