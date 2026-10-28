---
name: oss-license-review
description: Verificar licencas, atribuicoes e condicoes de redistribuicao do codigo, dependencias, ferramentas e modelos incluidos numa entrega open-source do Framechester.
license: Apache-2.0
---

# Licencas e distribuicao OSS

Consulte o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md). Esta skill
cuida do software distribuido; direitos de uma peca editorial vao para a
revisao juridica de marketing.

1. Inventarie o que entra no artefato: codigo proprio, dependencias, binarios,
   fontes, modelos e arquivos de exemplo. Distingua ferramenta instalada pelo
   operador de componente efetivamente redistribuido pelo projeto.
2. Para cada componente incluido, registre origem, revisao ou hash, licenca
   exata e arquivo de aviso. Consulte o texto da fonte primaria; nome parecido
   ou repositorio publico nao prova permissao de uso e distribuicao.
3. Confira condicoes aplicaveis ao artefato concreto, incluindo avisos, fontes,
   modificacoes e licencas de pesos separadas do codigo que os executa.
4. Quando a licenca depender da configuracao de build, como FFmpeg, registre
   o build e as bibliotecas habilitadas. Uso por subprocesso nao elimina
   obrigacoes de um binario que seja redistribuido.
5. Mantenha componentes de origem incerta fora do pacote ate esclarecimento.
   Atualize avisos e manifestos existentes, evitando relicenciar contribuicoes
   ou apresentar uma conclusao juridica definitiva sem base adequada.
6. Verifique o pacote produzido e ligue cada item de terceiro a sua evidencia.
   Registre pendencias e impacto concreto na distribuicao proposta.

**Artefato:** inventario por componente e avisos correspondentes.
**Aceite:** cada item distribuido tem origem e tratamento de licenca verificaveis.

**Cenario normal:** dependencia permissiva inclui os avisos exigidos no pacote.
**Cenario adverso:** modelo sem licenca verificavel e excluido da distribuicao.
