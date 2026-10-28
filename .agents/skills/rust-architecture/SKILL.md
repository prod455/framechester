---
name: rust-architecture
description: Projetar ou refatorar contratos entre core, adapters e CLI Rust do Framechester quando uma funcionalidade atravessa modulos, exige migracao ou revela acoplamento concreto.
license: Apache-2.0
---

# Arquitetura Rust

Consulte o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e a
[auditoria](../../../docs/AUDITORIA_ENGENHARIA.md) para contextualizar a mudanca.

1. Trace a entrada real da CLI ate o artefato produzido. Liste os contratos
   publicos afetados, os consumidores e as invariantes preservadas.
2. Identifique o acoplamento que causa a dificuldade observada. Compare manter
   a interface atual e aprofundar um modulo com uma alternativa incremental;
   explicite o custo de migracao de cada opcao.
3. Proponha a menor fronteira que encapsula a complexidade. Mantenha dominio
   independente de credenciais, processo FFmpeg e fornecedor de rede.
4. Para estado ou schema, defina leitura de versoes anteriores, defaults e
   falha em dados invalidos. Para canais, preserve identidade em cada efeito.
5. Implemente uma fatia atraves da interface publica com regressao executavel,
   depois migre consumidores. Remova caminhos antigos somente quando todos os
   consumidores estiverem cobertos.
6. Verifique o fluxo ponta a ponta e registre a decisao quando houver tradeoff
   duradouro. Prefira fatos do codigo a diagramas de componentes imaginarios.

**Artefato:** diff funcional, contrato atualizado e ADR curta quando necessario.
**Aceite:** comportamento anterior pertinente preservado, nova capacidade
verificada e dependencias direcionadas do adapter para o dominio.

**Cenario normal:** adicionar fonte local por AssetProvider sem alterar dominio.
**Cenario adverso:** mudar schema de relatorio preserva leitura de um relatorio
anterior ou apresenta erro de migracao documentado.
