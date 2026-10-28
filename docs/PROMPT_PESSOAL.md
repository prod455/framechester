# Prompt pessoal e criação com IA local

O prompt editorial do operador fica em **`.framechester/system-prompt.personal.md`**, na raiz da instalação. Esse diretório e o arquivo legado `PROMPT_CODEX_CLAUDE.txt` estão no `.gitignore`. O prompt não é incluído no estado dos canais, no bootstrap da página, no bundle Vite ou nos artefatos de produção.

O arquivo pessoal criado nesta instalação orienta criatividade, pesquisa de nicho, narração e storytelling. Seu conteúdo não é reproduzido neste documento. Ele pode ser editado em **Configurações → Assistente de criação → Editar instruções pessoais** ou por um editor local. Alterações são lidas na próxima solicitação. Uma instalação clonada do Git não recebe o prompt pessoal: o operador escreve suas próprias preferências. Não coloque senhas, tokens ou dados sensíveis nesse texto; as credenciais continuam no cofre próprio.

## Regras e preferências são coisas distintas

As fronteiras fixas do aplicativo ficam no backend: tarefa permitida, isolamento do canal, destino do provedor, formato da resposta, ausência de ferramentas e revisão humana. O prompt pessoal orienta voz e criatividade dentro dessas fronteiras. Fontes, títulos, notas e outros materiais de referência são serializados como dados, separados das instruções do sistema.

Os três pedidos permitidos são:

| Pedido | Guias editoriais aplicados | Resultado |
|---|---|---|
| Pesquisa de nicho (`research`) | análise de marketing e inteligência de pautas | Hipótese específica, contribuição original, evidências disponíveis e próximo teste |
| Roteiro (`script`) | escrita de roteiro e checagem editorial | Gancho, falas, cenas, evidências e lacunas |
| Storytelling (`story`) | estrutura narrativa e direção audiovisual | Promessa, contexto, conflito, virada sustentada, resolução e CTA pertinente |

Esses guias são instruções editoriais selecionadas pelo aplicativo; não significam que um modelo recebeu acesso ao sistema de arquivos ou executou ferramentas de skills. O campo `guides` identifica os métodos usados no pedido. O modelo não pode solicitar outras skills, buscar segredos ou acionar redes sociais por esse conector.

Todo resultado chega como **rascunho**, com `crossChecked=false` e revisão obrigatória. Nada é salvo automaticamente como roteiro aprovado, publicado ou enviado ao motor Rust. O operador revisa e leva o conteúdo desejado ao editor. Dois links, um prompt ou uma resposta do modelo não demonstram veracidade, originalidade suficiente, licença comercial ou elegibilidade para monetização.

## Claude pela API Anthropic

O Studio oferece Claude Sonnet 5.5 e Haiku 5.5. Selecione o provedor em
**Configurações → Assistente de criação → Modelo e direção** e salve. Em
**Chave do canal**, guarde uma chave de API restrita ao workspace Anthropic
apropriado. A assinatura do aplicativo Claude e o faturamento da API são
separados. A chave é protegida pelo cofre DPAPI, não pelo arquivo de preferências.
Novas instalações preferem Claude; o JSON legado `{model}` conserva Ollama.

**Calcular custo** autoriza o envio das instruções pessoais, briefing, perfil do
canal e contexto editorial à Anthropic para contar tokens. Não gera conteúdo.
**Autorizar e gerar** inicia uma chamada paga para o mesmo pedido. A estimativa
tem identificador aleatório, uso único, validade de cinco minutos e vínculo ao
canal e à sessão; mudar conteúdo, referências, modelo, limites ou chave exige
novo cálculo. O servidor consome a autorização antes da chamada e não repete
requisições. Timeout ou resposta descartada ainda podem ter cobrança.

A estimativa combina contagem de entrada, margem de 20% + 1.024 tokens,
máximo de saída e preços públicos consultados em 28/10/2026. O limite configurado
bloqueia estimativas superiores; não garante limite de faturamento. Use também
os controles de gasto do Console Anthropic. O resultado informa tokens e custo
calculado a partir do uso retornado, sem representar conciliação de fatura.
Os preços precisam ser revisados quando o provedor os alterar.

Modelo, provedor e limites ficam no JSON privado, sem credencial. A API de
disponibilidade não envia prompts nem consulta o provedor. Endpoints de chave
devolvem somente presença, jamais a chave. Sem ela, os editores manuais continuam
disponíveis. O conector não oferece ferramentas nem navegação: pesquisar aqui
significa desenvolver hipóteses e trabalhar sobre evidências fornecidas.

Referências oficiais: [Messages](https://platform.claude.com/docs/en/api/messages),
[contagem de tokens](https://platform.claude.com/docs/en/build-with-claude/token-counting),
[saídas estruturadas](https://platform.claude.com/docs/en/build-with-claude/structured-outputs),
[versão da API](https://platform.claude.com/docs/en/api/versioning) e
[preços](https://platform.claude.com/docs/en/about-claude/pricing).

## OpenAI e histórico de consumo

O mesmo assistente aceita **OpenAI pela Responses API**, com GPT-6.1 Sol e GPT-6
Luna. Escolha OpenAI em **Modelo e direção**, salve as preferências e grave a chave
OpenAI em **Chave do canal → Provedor da chave**. Ela ocupa um slot próprio no cofre,
sem substituir a chave Anthropic. Os campos editoriais, os guias, o schema, a revisão
obrigatória e o fluxo de estimativa/autorização são os mesmos. Cada autorização
inclui o provedor: mudar para outra API exige nova estimativa.

A Responses API usa `store:false`, sem ferramentas, com truncamento desativado e
modo de cache explícito sem breakpoints. Nenhum cache de prompt é solicitado.
O registro guarda apenas metadados e contadores, antes do efeito remoto, em
`ai-usage/` no perfil privado. Respostas descartadas conservam os contadores válidos;
timeouts e outros casos sem uso confirmado ficam desconhecidos. Não há repetição
automática nem leitura de tokens de assinatura dos aplicativos.

Consulte a aba **Consumo** para comparar canais/provedores/chaves sem copiar segredos.
Ela cobre chamadas do Studio após a ativação, não a fatura ou o saldo oficial. Veja
[CONSUMO_IA.md](CONSUMO_IA.md). Os arquivos privados de preferências continuam fora do Git.

Fontes: [Responses](https://developers.openai.com/api/docs/guides/text),
[contagem](https://developers.openai.com/api/docs/guides/token-counting),
[saída estruturada](https://developers.openai.com/api/docs/guides/structured-outputs),
[cache](https://developers.openai.com/api/docs/guides/prompt-caching) e
[preços](https://developers.openai.com/api/docs/pricing), consultados em 28/10/2026.

## Ollama local opcional

Quando Ollama é selecionado, o conector usa somente **`http://127.0.0.1:11434`**. Não lê `OLLAMA_HOST`, não aceita URL fornecida no prompt e não usa chaves de API. Não instala ou baixa modelos, não configura a conta Ollama e não faz chamadas pagas. Instalar um modelo compatível, verificar sua licença e dimensionar os recursos do computador são decisões do operador.

Antes de enviar o prompt pessoal, o backend exige:

1. `/api/status` deve informar `cloud.disabled=true`. Configure `OLLAMA_NO_CLOUD=1` **no processo/serviço Ollama** e reinicie-o; definir essa variável apenas no Studio não altera um Ollama que já está rodando.
2. O nome selecionado precisa aparecer entre os modelos instalados, com tamanho positivo, formato GGUF e sem indicação `remote_host`/`remote_model` ou nome de nuvem.
3. `/api/show` precisa confirmar GGUF sem encaminhamento remoto. Versões que não comprovem essas condições ficam indisponíveis antes da geração.

O modelo é escolhido nas configurações e armazenado em `.framechester/creative.local.json`, igualmente ignorado pelo Git. Não há seleção automática do primeiro modelo nem fallback para nuvem. Os dois arquivos são pessoais da instalação e se aplicam aos seus perfis web; o conteúdo de referência continua limitado ao canal selecionado.

Há no máximo uma geração em andamento por instância, timeout de 120 segundos e limite de 256 KiB para respostas do serviço. O briefing aceita 12 a 6.000 caracteres. O prompt pessoal aceita até 20.000 caracteres. Referências adicionais revisadas do canal têm orçamento agregado de 16.000 caracteres; campos longos podem ser reduzidos e fontes com URLs excessivamente longas podem ser omitidas, sem inventar URLs encurtadas. O contexto explícito do editor e seus vínculos têm limite de 32 KB, sem corte silencioso; o pedido completo tem limite de 48 KB. Pedido excessivo recebe erro antes de chamar o modelo.

Pedidos legados recebem `title` e `body`. Pedidos dos editores recebem também `fields` com schema específico da tarefa, prévia de até 2.000 caracteres e campos validados. A IA não devolve fontes ou aprovação; o servidor conserva fontes fornecidas e força alegações novas para `unverified`. Resposta truncada, outro modelo declarado, campos extras, citações inventadas, instruções de ferramentas e reprodução integral detectada do prompt são rejeitados. **Usar nos campos** aplica a sugestão ao editor, ainda sem salvar; alterações exigem nova conferência. O detalhamento está em [BRIEFING_CRIATIVO.md](BRIEFING_CRIATIVO.md).

Sem serviço ou modelo local pronto, o Studio informa a indisponibilidade e preserva os editores manuais. Não apresenta texto de fixture como criação real de IA. A inferência Anthropic do motor Rust conserva seus bloqueios de custo; este conector local é independente dela.

## Endpoints internos e privacidade

- `GET /api/creative/settings`: conteúdo pessoal e modelo, somente em sessão autenticada, mediante abertura explícita do editor.
- `PUT /api/creative/settings`: `{content, model, provider?, anthropicModel?, openaiModel?, maxOutputTokens?, maxCostUsd?}`, com autenticação, Origin local e CSRF. Caminhos, credenciais e campos adicionais são recusados.
- `GET /api/creative/capabilities?channel_id=:id`: disponibilidade do provedor escolhido; não devolve o prompt nem a chave.
- `GET/PUT/DELETE /api/channels/:id/creative/key`: presença, gravação `{key}` ou remoção no cofre por canal. As mutações exigem CSRF.
- `GET/PUT/DELETE /api/channels/:id/creative/keys/:provider`: presença, gravação ou remoção separada para `anthropic`/`openai`. O endpoint legado acima continua restrito à chave Anthropic.
- `GET /api/channels/:id/creative/usage?days=30&provider=openai`: histórico local autenticado, com período de até 90 dias e provedor opcional. Nunca devolve credenciais ou prompts.
- `POST /api/channels/:id/creative/quote`: pedido editorial e `consentToSend:true`; devolve a estimativa sem inferência.
- Para Claude e OpenAI, `POST /api/channels/:id/creative/draft` exige ainda `quoteId` e `authorizePaid:true`; não aceita autorização de outro canal/sessão/provedor ou já consumida.
- `POST /api/channels/:id/creative/draft`: `{task, brief, includeReferences?, editorContext?}`, com autenticação, CSRF e canal existente; `includeReferences` é booleano e permanece falso quando ausente. `editorContext` contém a mesma tarefa e os valores permitidos do editor. Vínculos são resolvidos no próprio canal. Devolve o rascunho e campos estruturados quando solicitados, sem persistir no estado editorial.

Arquivos usam caminhos fixos, gravação atômica por arquivo e modo `0600` onde suportado. Diretório simbólico, arquivo simbólico/hard-linked e conteúdo excessivo são recusados. No Windows, a proteção de acesso também depende das ACLs do perfil. O prompt é texto privado em disco, **não um segredo criptografado**; faça sua cópia privada de forma apropriada. O `.gitignore` não apaga versões que eventualmente já tenham sido publicadas no histórico Git.

## O que a defesa contra injeção cobre

A fronteira executora impede que uma resposta textual conceda acesso a ferramentas, segredos, publicação ou outro canal: essas capacidades não existem nesse serviço. Dados externos ficam fora do campo de instruções. Por padrão, o pedido leva apenas briefing e perfil do canal; a opção **Incluir as pesquisas revisadas deste canal** precisa ser marcada para anexar essas referências. Respostas exigem schema, tamanho e revisão.

Isso reduz riscos, mas **não demonstra imunidade do modelo a prompt injection**, ausência de alucinações ou resistência a toda tentativa de revelar parte das preferências. A detecção de cópia integral não equivale a proteção semântica contra paráfrases. Um serviço Ollama local comprometido ou um usuário com acesso ao arquivo continua fora dessa garantia. Não aceite uma resposta como autorização para ações externas ou como conteúdo comercial pronto.

## Evidência e fontes

Os testes adicionados começaram antes da implementação e cobrem armazenamento privado, atualização por leitura, limites, symlink/hardlink, identidade de canal, fontes com instruções maliciosas, contexto agregado, recusa de nuvem e modelo remoto, resposta inválida, ausência de gravação automática e proteção HTTP de autenticação/CSRF. As respostas de modelo nesses testes são fixtures: não constituem avaliação comportamental de um LLM real nem prova de monetização.

Referências primárias consultadas em **28/10/2026**: [Ollama Generate](https://docs.ollama.com/api/generate), [lista de modelos](https://docs.ollama.com/api/tags), [saídas estruturadas](https://docs.ollama.com/capabilities/structured-outputs), [comportamento de modelos em nuvem](https://docs.ollama.com/cloud), [tipos oficiais do servidor](https://github.com/ollama/ollama/blob/main/api/types.go) e [cliente oficial para `/api/status`](https://github.com/ollama/ollama/blob/main/api/client.go). O endpoint de status é experimental no cliente upstream; se a API mudar, a recusa por falta de comprovação local deve ser preservada até adaptar e testar o conector.

As [orientações OWASP sobre injeção de prompt](https://cheatsheetseries.owasp.org/cheatsheets/LLM_Prompt_Injection_Prevention_Cheat_Sheet.html) sustentam a separação entre instruções e dados, validação da saída e controle de capacidades fora do modelo; um rótulo textual não é uma fronteira de execução. As [políticas de monetização do YouTube](https://support.google.com/youtube/answer/1311392?hl=pt-BR) exigem criação original e autêntica e avaliam conteúdo genérico, repetitivo ou produzido em massa. Os guias pedem contribuição própria e promessa honesta; não constituem declaração de que um vídeo será aprovado ou monetizado.
