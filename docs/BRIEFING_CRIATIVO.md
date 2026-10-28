# Campos com finalidade e briefing da IA

Implementado em **28/10/2026**, para um operador local com canais separados.
As skills `product-analyst`, `framechester-teams` e
`anti-injection-and-provenance` orientaram a fatia: dados preenchidos precisam
alimentar uma tarefa ou controle observável; nenhuma sugestão aprova conteúdo.

## O que foi mantido, conectado e simplificado

| Grupo | Utilidade implementada |
|---|---|
| Canal: nome, descrição, nicho, público e idioma | Orientam a identidade editorial em cada pedido; não alteram permissões |
| Pauta: título, nicho, público, hipótese, contribuição original, palavras-chave e notas | Entram no briefing atual da IA, mesmo antes de salvar; palavras-chave também servem à busca da lista |
| Fontes e condições de uso | São enviadas como referências fornecidas, sem buscar URLs nem comprovar fatos/direitos; são preservadas ao aplicar |
| Demanda, competição e viabilidade | Foram retiradas do fluxo principal para “Minha priorização (opcional)”; servem à ordenação manual da lista, sem pretensão de medir mercado |
| Estado editorial | Organiza o registro; não é uma instrução criativa. Aplicar IA retorna pauta/roteiro a rascunho |
| Roteiro: título, pauta vinculada, série, formato, gancho, cenas, fala, visual, duração e alegações | Orientam a geração estruturada. As cenas salvas seguem para o motor Rust. O formato é preservado na resposta; durações são estimativas, não medições |
| Narrativa: título, roteiro vinculado, gancho, contexto, tensão, descoberta, resolução e próximo passo | Orientam e recebem o arco estruturado; o roteiro vinculado é referência. O arco é planejamento separado, sem alterar automaticamente as cenas/voz do vídeo |
| ID técnico do tópico | Mantém o contrato do motor e não entra no briefing criativo |
| Voz, resolução, FPS, compressão, ASR e legendas | Controlam produção e QA; não são texto de system prompt |
| Contas, custos e receitas | Alimentam conexão, consulta e finanças; não são enviados ao assistente editorial |

## Percurso do operador

1. Abra/crie pauta, roteiro ou narrativa e preencha o que já sabe.
2. Clique **Desenvolver com IA** no próprio editor. O snapshot usa os valores
   atuais, sem exigir salvar um documento incompleto.
3. Confira **Ver campos usados neste pedido** e ajuste a tarefa. A pauta ou
   roteiro selecionado é resolvido no próprio canal. Outras pesquisas revisadas
   entram somente por seleção explícita, até seis.
4. Gere e confira a prévia e **Ver campos propostos**. O segundo quadro mostra
   os valores estruturados que serão aplicados, não apenas a descrição do modelo.
5. **Usar nos campos** substitui os campos criativos desse editor; não grava no
   estado. Pauta/roteiro voltam a rascunho. No roteiro, `crossChecked=false` e
   todas as alegações recebidas ficam `unverified`. Vínculos, IDs técnicos e
   notas manuais do operador são preservados.
6. Revise fontes, fatos e texto e use o botão de salvar do editor. Produção e
   publicação continuam ações distintas; publicação web permanece desativada.

Pedidos e resultados ficam em memória apenas para a sessão, com cache de até
12 rascunhos por contexto exato. Outro canal ou outro conteúdo não recebe o
mesmo resultado por engano. Sair da sessão limpa o cache; isso não é autosave.
Durante uma nova geração, o resultado anterior fica inerte. Configurações,
Escape e fechamento conservam a proteção de edições.

## Contrato e segurança

O system contém limites fixos, guia da tarefa e preferências pessoais. Os
campos ficam serializados como **dados não confiáveis**, em `editorContext`,
separados do system. Instruções dentro de notas/fontes não concedem ferramentas,
acesso a segredos, pesquisa externa, publicação ou acesso a outro canal.

`editorContext` aceita uma whitelist por tarefa; campos desconhecidos, tarefa
divergente, vínculo estrangeiro e tamanhos excessivos são recusados antes da
inferência. Não se cortam silenciosamente os campos atuais: limite de 32 KB
com vínculos e 48 KB no pedido total. A resposta usa schema específico. Fontes
do roteiro vêm do contexto autorizado; a IA não inventa URLs nem licenças.
Fontes ainda incompletas podem orientar um rascunho, mas precisam ser completadas
para salvar/produzir segundo as validações existentes.

O prompt pessoal continua ignorado no Git e não foi editado ou exibido por
esta revisão. A geração real exige Ollama local, nuvem desativada e modelo
GGUF instalado/selecionado; não se baixou modelo nem se ativou provedor pago.

## Evidência e limite

**93 testes web aprovados**: nove novos contratos backend, cinco da interface
do assistente e um de ordenação manual, além dos 78 anteriores. Casos incluem
contexto parcial, vínculo estrangeiro, campos não permitidos, fontes inventadas,
tentativa de aprovação, limite, autenticação/CSRF, aplicar somente por decisão
do operador, cache por contexto e proteção durante nova geração.

No navegador, um perfil isolado executou pauta, roteiro e narrativa com o
serviço criativo real e transporte Ollama substituído por uma fixture
determinista. Foram gerados campos, aplicados e salvos; o roteiro preservou o
formato e perdeu a aprovação anterior. A pesquisa pública recebeu o novo título.
A ordenação manual foi conferida. Fontes e conteúdo são sintéticos, sem contas
reais ou faturamento. Artefatos ignorados em `artifacts/creative-fields-qa/`.

Isso valida a integração e os limites executáveis, **não** a criatividade,
veracidade ou resistência semântica de um LLM real. Na checagem local, o serviço
Ollama não comprovou prontidão com nuvem desativada; permanece necessário
configurar o assistente antes de gerar resultados reais. Nenhuma publicação,
compra, chamada paga ou produção audiovisual foi feita nesta fatia.
