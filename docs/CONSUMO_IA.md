# OpenAI, Claude e consumo das chaves

Entrega validada em 28/10/2026 para o Studio local, com um operador e múltiplos
canais. O motor Rust e a publicação em redes não foram alterados nesta fatia.

## Operação

1. Escolha o canal e abra **Configurações → Assistente de criação**.
2. Em **Modelo e direção**, selecione Claude ou OpenAI, modelo e limites e salve.
   O Studio preserva os modelos configurados de cada provedor ao alternar.
3. Em **Chave do canal**, escolha o provedor da chave e grave sua chave de API
   no cofre local. É possível manter ambas conectadas. A chave não é exibida de novo.
4. Nos editores, **Calcular custo** envia os dados indicados ao provedor para contar
   tokens. **Autorizar e gerar** permite uma geração do mesmo pedido, canal e sessão.
   A autorização expira em cinco minutos e não pode ser reutilizada após tentativa.
5. Revise o retorno e use **Usar nos campos**. Isso não salva nem aprova o conteúdo.
6. Na aba **Consumo**, consulte período de 7, 30 ou 90 dias e filtre por provedor.
   **Atualizar consumo** consulta somente o registro local, sem inferência remota.

Ollama continua opcional. Modelos locais não utilizam chaves de API nem entram
nos custos de API deste registro. Configurações antigas continuam válidas.

## O que os números significam

| Campo | Definição e limite |
|---|---|
| Gerações | Tentativas que tiveram um registro durável antes do efeito remoto |
| Estimativas | Chamadas de contagem, separadas das gerações; não duplicam os tokens do total |
| Tokens de entrada/resposta | Contadores retornados pelo provedor nas gerações, inclusive saídas descartadas |
| Cache e raciocínio | Parcelas da entrada e da resposta, respectivamente; não somar novamente |
| Custo calculado | Tokens reportados × preços públicos registrados para o modelo, em USD; não é fatura |
| Sem confirmação | Chamada sem conclusão confirmada ou interrompida pelo reinício; pode haver cobrança |
| Não informado | Informação ausente, mantida como desconhecida; zero só aparece quando reportado/calculado |
| Por chave | Identificação local derivada por HMAC, sem usar prefixo ou sufixo da credencial |

Os totais somam os valores conhecidos. Contadores de gerações sem custo ou tokens
informam quando essa soma é parcial. Uma saída pode ser descartada por formato,
recusa ou validação editorial e ainda ter consumo conhecido. A cobrança não depende
de a proposta ter sido aceita pelo operador. Trocas de chave conservam os registros.

A janela corresponde ao instante inicial de cada chamada, em intervalo móvel de
24 horas × dias escolhidos. Datas da interface indicam UTC. As últimas 100 chamadas
são exibidas; os totais incluem todos os registros da janela. O histórico não é
apagado automaticamente quando sai da janela.

O escopo é **somente o uso feito pelo Studio desde a ativação do registro**.
Não há importação retroativa nem contabilização de outros aplicativos, saldo de
assinatura, créditos restantes ou conciliação automática de fatura. Os links
oficiais estão disponíveis na interface para consultar a conta completa.

## Fronteiras e recuperação

- Chaves ficam em slots separados `anthropic`/`openai` por canal no cofre DPAPI.
  Nenhuma chave, prompt, briefing, saída ou erro remoto bruto entra no histórico.
- `ai-usage/salt.json` e `ai-usage/usage.json` ficam dentro do perfil privado
  (`FRAMECHESTER_WEB_HOME` ou o padrão do Studio), sem exposição estática/HTTP pública.
  O estado editorial e o bootstrap não incluem esses arquivos.
- A escrita do registro `pending` termina antes de chamar o provedor. Armazenamento
  inválido ou sem permissão bloqueia novas chamadas. A conclusão atualiza tokens,
  estado e duração de forma atômica; falhas de persistência não provocam nova geração.
- Ao abrir o perfil novamente, registros pendentes viram `unknown`. O Studio não
  tenta descobrir a cobrança reenviando o pedido. A consulta oficial é independente.
- Arquivos e ancestrais simbólicos, hard links, JSON inválido, registros malformados
  e salt ausente com histórico existente são recusados. Não remova o salt para
  tentar reparar o perfil: preserve a pasta inteira em uma cópia privada.
- O limite local é de 50.000 registros ou 32 MiB. Ao atingi-lo, novas chamadas são
  bloqueadas sem descartar histórico. O perfil pressupõe uma instância do Studio;
  não há trava de arquivo entre processos que compartilham o mesmo perfil.
- Um canal com qualquer histórico de consumo não pode ser excluído pela API,
  inclusive quando os registros estão fora de 90 dias. Isso preserva a atribuição.

Esse registro operacional foi solicitado pelo operador; não ativa telemetria de
produto nem envia métricas a terceiros. As preferências pessoais continuam fora do Git.

## Contratos dos provedores

OpenAI usa Responses API com schema estrito, `store:false`, `truncation:disabled`,
tier padrão, sem ferramentas ou repetição automática. O modo de cache é explícito
sem breakpoints, evitando solicitação de leitura/gravação de cache. Uma resposta com
tier/modelo inesperado ou gravação de cache inesperada é descartada; seus contadores
válidos são preservados, e o custo fica desconhecido.

Anthropic mantém Messages API e validação editorial. A entrada total normaliza tokens
de cache, quando retornados. Gravação inesperada de cache ou modelo divergente não
recebem custo adivinhado. Nenhum provedor vira fallback silencioso para o outro.

A estimativa usa entrada contada + margem de 20% e 1.024 tokens e o máximo de saída.
Ela bloqueia pedidos acima do limite configurado; não garante teto da fatura.
Os preços são datados em código e precisam de revisão quando os provedores mudarem.
As assinaturas dos aplicativos e o acesso/consumo da API seguem seus próprios contratos
e créditos. O Studio usa chaves de API, sem reaproveitar credenciais de assinatura.

Referências primárias consultadas em 28/10/2026:

- OpenAI: [contagem](https://developers.openai.com/api/docs/guides/token-counting),
  [schema](https://developers.openai.com/api/docs/guides/structured-outputs),
  [cache](https://developers.openai.com/api/docs/guides/prompt-caching),
  [preços](https://developers.openai.com/api/docs/pricing),
  [GPT-6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol) e
  [GPT-6 Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).
- Uso geral da conta: [Admin APIs OpenAI](https://developers.openai.com/api/docs/guides/admin-apis)
  e [Usage and Cost Admin API Anthropic](https://platform.claude.com/docs/en/manage-claude/usage-cost-api).
  Esses relatórios exigem permissões administrativas adicionais; o Studio não solicita
  nem armazena essas credenciais nesta entrega.

## Evidência

**165 testes web aprovados**, TypeScript e build aprovados. Os testes incluem
autenticação/CSRF/Origin, separação de chaves/canais/sessões/provedores, autorização
de uso único, armazenamento durável antes do efeito, restauração, rotação de chave,
valores desconhecidos, saída descartada, limites, links inseguros e falhas de rede.

QA visual em perfil descartável com prompt e chaves sintéticas: configuração,
gravação de chave OpenAI, cálculo, autorização, proposta estruturada, aplicação
manual, histórico persistido, filtro por provedor e conservação de histórico após
troca de chave. Nenhuma chamada real aos provedores ou gasto foi efetuado.

Em desktop de 1280 px, os filtros tiveram o mesmo topo e altura de 44 px, e as
tabelas ocuparam 857 px sem rolagem horizontal. Em 390 × 844 px, os filtros ocuparam
311 px e as tabelas de 720 px rolaram dentro de contêineres de 311 px. Datas,
estados e valores permanecem inteiros; a rolagem foi verificada também por teclado.
Não houve overflow horizontal da página ou do diálogo nessas telas.

As capturas ignoradas pelo Git estão em `artifacts/ai-usage-qa/`, incluindo
`usage-final-desktop.png`, `usage-final-mobile.png` e `usage-mobile-costs.png`.
O teste valida contratos com fixtures; acesso real aos modelos, qualidade de um LLM
real, créditos e cobrança oficial dependem da conta e permanecem sem verificação.
