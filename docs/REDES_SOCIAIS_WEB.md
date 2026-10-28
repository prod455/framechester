# Redes sociais no Framechester Studio

Consulta de fontes primárias e implementação: **2026-10-27**, America/Sao_Paulo. O serviço implementa chamadas reais somente de leitura, acionadas pelo operador. Nenhuma conta real foi conectada durante a implementação; testes de APIs usam respostas injetadas e não comprovam permissões de um aplicativo específico.

## Capacidades implementadas

| Rede | Conexão e identidade | Estatísticas | Receita automática |
| --- | --- | --- | --- |
| YouTube | OAuth de cliente Web próprio ou token existente; `channels.list(mine=true)` deve corresponder ao Channel ID esperado | Analytics: views, minutos assistidos e likes na janela solicitada; inscritos são contador atual | `estimatedRevenue` em BRL quando autorizado. Estimativa, sujeita a ajustes; pagamento recebido permanece `null` |
| TikTok | Token Display API; `user/info` deve retornar o `open_id` esperado | Seguidores e likes totais autorizados; views/minutos não disponíveis nesse endpoint permanecem `null` | Não implementada pela integração Display API; nunca inferida a partir de views |
| Instagram | Token de usuário com Facebook Login; conta profissional deve aparecer como `instagram_business_account` numa Página autorizada | Seguidores da conta profissional; campos ausentes permanecem `null` | Não implementada nesta integração. Comprovantes podem ser lançados manualmente |
| Facebook | Token da Página; `/me` deve identificar a Página esperada e permitir os campos solicitados | Seguidores e curtidas da Página; não equivalem a views ou receita de vídeo | Não implementada nesta integração. Comprovantes podem ser lançados manualmente |

`publishingAvailable` é falso nas quatro redes. Não há chamada de upload, publicação, anúncios, compra ou alteração de conta. Permissões e revisão de aplicativo dependem da plataforma e da conta; possuir um token não comprova monetização.

## YouTube: autorização e receita

No Google Cloud do operador, habilitar YouTube Data API v3 e YouTube Analytics API e criar um cliente OAuth **Web application**. Registrar exatamente o callback utilizado, normalmente `http://127.0.0.1:4317/api/oauth/youtube/callback`. Porta, host, esquema e caminho devem coincidir. O Google documenta a exceção de localhost ao requisito geral de HTTPS. As credenciais são enviadas por POST protegido ao backend local e persistidas somente no cofre. [OAuth para servidores Web](https://developers.google.com/identity/protocols/oauth2/web-server).

O serviço solicita `youtube.readonly`, `yt-analytics.readonly` e `yt-analytics-monetary.readonly`; não solicita `youtube.upload`. O consentimento usa navegador normal, state aleatório válido por dez minutos, uso único e PKCE S256. State vincula canal local, Channel ID esperado, cliente e callback. Reiniciar o servidor invalida autorizações pendentes. Outra tentativa para o mesmo canal invalida o state anterior. O SDK oficial do Google documenta `codeChallenge` e `codeVerifier`. [Código primário do cliente OAuth](https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts).

O retorno do Google aceita GET no callback mediante validação de state/PKCE.
O redirecionamento seguinte pode conservar `Sec-Fetch-Site: cross-site`;
por isso a página pública de entrada `/` aceita GET com modo `navigate` e
destino `document`. Essa exceção não libera APIs, iframes, requisições fetch,
outros métodos ou Hosts/Origins externos. A sessão e o CSRF das operações
do Studio continuam obrigatórios. Após reiniciar para atualizar o servidor,
comece uma nova autorização em Contas conectadas; recarregar um callback
antigo não recria o state pendente.

Antes de salvar ou substituir tokens, o backend consulta a identidade autenticada. Token de outro canal, resposta ambígua e refresh que retorna identidade diferente são rejeitados; o token anterior não é substituído. Escopos e validade do YouTube são lidos de `tokeninfo` por POST com Bearer no header, sem access token na URL. Dados ausentes continuam desconhecidos; não se aplica validade fictícia de uma hora. Renovação automática exige refresh token e cliente protegido correspondente. [Identidade autenticada em channels.list](https://developers.google.com/youtube/data/reference/rest/v3/channels/list), [implementação primária de tokeninfo](https://github.com/googleapis/google-auth-library-nodejs/blob/main/src/auth/oauth2client.ts).

Uma sincronização consulta os últimos **28 dias calendários encerrados em Pacific time**, com `ids=channel==<conta esperada>`. A API pode retornar dados somente até uma data anterior, conforme disponibilidade das métricas. `periodStart`/`periodEnd` representam a janela solicitada, não certificação de cobertura integral; a nota de receita informa atrasos e ajustes. Estatísticas e receita são consultas distintas e podem ter defasagens distintas. O serviço não calcula RPM ou compara rentabilidade usando essas janelas como se estivessem integralmente conciliadas. [Datas e disponibilidade](https://developers.google.com/youtube/analytics/dimensions#time-periods).

`estimatedRevenue` é receita líquida estimada das fontes cobertas pela API e pode sofrer ajustes de fechamento. A consulta especifica `currency=BRL`; não converte dólares localmente com taxa inventada. Falta de escopo confirmado retorna `missing_scope`; relatório recusado, vazio ou indisponível retorna `unavailable` e valor `null`. Zero somente é exibido quando efetivamente retornado como número. Nenhum desses estados comprova pagamento do AdSense ou aprovação no YPP. [Reports.query](https://developers.google.com/youtube/analytics/reference/reports/query), [definição das métricas](https://developers.google.com/youtube/analytics/metrics#estimated-revenue-metrics).

## TikTok e Meta: limites concretos

TikTok usa somente `GET https://open.tiktokapis.com/v2/user/info/`. `open_id` identifica a conta no aplicativo; estatísticas de perfil exigem `user.info.stats`, além de `user.info.basic`. A conexão básica pode existir sem autorização para os contadores adicionais; nesse caso a sincronização é recusada pela plataforma, sem fabricar valores. Não se usa Research API nem se pressupõe acesso ao Creator Rewards. [Get User Info](https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info), [Scopes Reference](https://developers.tiktok.com/doc/tiktok-api-scopes).

Instagram e Facebook usam Graph API **v26.0**, versão encontrada no SDK oficial da Meta na consulta. Para Instagram, a leitura de `/me/accounts` é limitada a dez páginas de cem registros e usa somente cursor em um endpoint fixo; URLs `paging.next` nunca são seguidas como destinos arbitrários. A consulta deve comprovar o vínculo da conta profissional esperada. Contas pessoais e o fluxo distinto de Instagram Login não estão implementados nesta fatia. Para Facebook, é necessário token da Página. [SDK oficial: versão](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/api.js), [Páginas autorizadas](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/user.js), [campos de Página](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/page.js), [campos de IG User](https://github.com/facebook/facebook-nodejs-business-sdk/blob/main/src/objects/ig-user.js).

As páginas developer da Meta sobre permissões e Instagram Login retornaram bloqueio/429 na consulta; não foram apresentadas como se integralmente lidas. Os campos e a versão foram confirmados no código primário do SDK. Permissões efetivas continuam dependentes da resposta real da Graph API; uma integração com outra combinação de conta/token pode exigir adaptação documentada. Referências de configuração: [Instagram com Facebook Login](https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/), [Pages API](https://developers.facebook.com/docs/pages-api/).

Contadores atuais de TikTok/Meta recebem `periodStart=periodEnd` na data de coleta. Não são apresentados como histórico de 28 dias. Não há endpoint de receita ou payout integrado para essas três redes; isso descreve esta implementação e o produto de API consultado, não afirma inexistência universal de qualquer produto financeiro dessas empresas. O total de pagamentos recebidos exige comprovantes/importação manual e conciliação; dados indisponíveis não valem zero.

## Pesquisa de nicho

`discoverYoutube(channelId, query)` requer YouTube conectado e consulta `search.list` com tipo vídeo, até oito resultados e texto entre 2 e 120 caracteres; depois consulta `videos.list` para estatísticas dos IDs retornados. URLs de vídeo são construídas a partir de IDs validados. A saída identifica `youtube_data_api`, horário e métricas públicas disponíveis. Views não comprovam receita, demanda representativa ou licença de reutilização do vídeo.

A pesquisa só ocorre ao solicitar; carregar a página ou conectar a conta não executa buscas. A documentação consultada apresenta para `search.list` **100 chamadas/dia e uma unidade no bucket Search Queries**; não reutilizar a antiga regra genérica de cem unidades por chamada sem conferir o projeto e a documentação atual. A identidade e a consulta de vídeos também consomem a quota aplicável. [Search.list](https://developers.google.com/youtube/data/reference/rest/v3/search/list), [Videos.list](https://developers.google.com/youtube/data/reference/rest/v3/videos/list).

## Cofre e fronteiras de segurança

`createLocalVault({directory})` usa Windows DPAPI com `DataProtectionScope.CurrentUser`. PowerShell recebe apenas código estático em seus argumentos; segredos entram por STDIN, nunca por argumento de processo, log, bundle de frontend ou localStorage. Apenas ciphertext em Base64 é escrito nos arquivos `.dpapi` por canal/rede, mediante arquivo temporário e rename. Um envelope protegido inclui o canal e a rede; cópia de ciphertext para outro vínculo é rejeitada. Caminhos com traversal, nomes reservados, links e arquivos com hard links são bloqueados. [Documentação Microsoft de ProtectedData](https://learn.microsoft.com/en-us/dotnet/api/system.security.cryptography.protecteddata).

Este mecanismo depende do usuário/perfil Windows e não promete portabilidade do segredo para outra conta ou máquina. Migrações podem exigir reconectar. Linux e outros sistemas retornam cofre indisponível ao tentar salvar; não há fallback em texto puro. Nenhum secret-tool foi configurado nesta fatia. O cofre pode ser substituído pela interface injetável `SecretVault` para outra implementação revisada.

Desconectar remove tokens, cliente OAuth e estados pendentes locais daquela rede/canal. Não revoga o consentimento global do aplicativo no provedor; o operador pode revisar esse consentimento na própria conta. Não é disparada revogação que possa afetar outros vínculos do mesmo aplicativo.

APIs externas são allowlisted por HTTPS, host e caminho; redirects são bloqueados, respostas limitadas a 512 KiB e há timeout. IDs são validados antes de compor URLs. Erros retornam mensagens controladas, sem corpo privado da plataforma. A interface pública devolve somente metadados de conexão; `accessToken`, `refreshToken` e `clientSecret` permanecem no backend/cofre. O backend HTTP deve aplicar autenticação, CSRF e validação de canal aos métodos mutáveis; esse controle pertence à aplicação que chama o serviço.

## Verificação executada

Testes com fetch e cofre em memória: identidade divergente, dados entre canais, state expirado/repetido, PKCE, callback externo, ausência de escopo monetário, erro contendo token, body excessivo, segredo protegido malformado, refresh divergente, quatro redes e pesquisa de nicho com métricas ausentes preservadas. Testes do cofre verificam ciphertext, separação e ausência de fallback.

Também foi feito smoke real de **DPAPI com valor artificial**, em diretório temporário dedicado: roundtrip verdadeiro e texto puro ausente no arquivo. Não houve OAuth real, acesso a contas, publicação ou compra. Conexões e permissões reais precisam ser verificadas pelo operador no ambiente configurado.
