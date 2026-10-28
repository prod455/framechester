---
name: devops-local-delivery
description: Configurar ou corrigir CI, instalacao, empacotamento e reversao do Framechester quando uma mudanca precisa ser entregue e reproduzida no ambiente local suportado.
license: Apache-2.0
---

# DevOps local e entrega

Use o [contrato das equipes](../../../docs/EQUIPES_E_SKILLS.md) e o workflow
real do repositorio como ponto inicial.

1. Identifique o artefato entregue, plataformas suportadas e dependencias
   externas. Confira lockfiles e versoes minimas declaradas.
2. Reproduza build, lint e testes na ordem que fornece diagnostico util.
   Acrescente checks que cobrem risco real de instalacao, licenca, segredo
   ou dependencia; use fixtures locais e credenciais ficticias em CI.
3. Separe build Rust, verificadores Python e smoke audiovisual. O job que
   exige FFmpeg deve instalar a dependencia explicitamente e registrar falhas
   como falhas, preservando logs sem dados privados.
4. Prepare instalacao em diretorio limpo e configuracao sanitizada. Ferramentas
   e modelos opcionais precisam de diagnostico de ausencia e origem documentada.
5. Para uma mudanca de distribuicao, descreva rollback e compatibilidade dos
   dados locais. Verifique que reinstalar nao apaga canais, chaves ou trabalhos.
6. Revise o diff da automacao e execute o equivalente local disponivel.
   Publicacao de release e deploy seguem a autorizacao do operador depois que
   o artefato concreto estiver verificavel.

**Artefato:** workflow ou pacote reproduzivel, smoke e procedimento de reversao.
**Aceite:** ambiente suportado instala e valida sem acesso a contas do mantenedor.

**Cenario normal:** CI testa crates e verificadores sem rede paga ou upload.
**Cenario adverso:** dependencia audiovisual ausente falha com diagnostico, sem
marcar um render nao executado como aprovado.
