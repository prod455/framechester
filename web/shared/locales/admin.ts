import type { AreaCatalog } from './index.ts';

/** Channels, connections, analytics and settings. */
export default {
  en: {
    'Comece pelo seu canal': 'Start with your channel',
    'Crie uma identidade local para organizar suas pautas, conteúdos, conexões e resultados.':
      'Create a local identity to organize your topics, content, connections and results.',
    'Adicionar canal': 'Add channel',
    Canais: 'Channels',
    'Organize público, proposta editorial e contas de cada canal.':
      'Organize the audience, editorial focus and accounts of each channel.',
    Selecionado: 'Selected',
    'Descrição editorial ainda não definida.': 'Editorial description not set yet.',
    Nicho: 'Niche',
    'a definir': 'to be defined',
    'Envio ao YouTube': 'YouTube upload',
    'automático, como privado': 'automatic, as private',
    manual: 'manual',
    Identificador: 'Identifier',
    'Abrir canal': 'Open channel',
    'Editar {name}': 'Edit {name}',
    'Excluir {name}': 'Delete {name}',
    'Crie seu primeiro canal': 'Create your first channel',
    'Defina nome, público e proposta editorial. O conteúdo e as contas ficam separados por canal.':
      'Set the name, audience and editorial focus. Content and accounts stay separate for each channel.',
    'Criar canal': 'Create channel',
    'Editar canal': 'Edit channel',
    'A identidade e os arquivos deste canal ficam separados dos demais.':
      "This channel's identity and files stay separate from the others.",
    'Salvar canal': 'Save channel',
    'Canal atualizado.': 'Channel updated.',
    'Canal criado. Agora mande a pauta do primeiro vídeo.':
      'Channel created. Now send the topic for the first video.',
    'Nome do canal': 'Channel name',
    'Identificador local': 'Local identifier',
    'Letras minúsculas, números e hífen no meio. Exemplo: ciencia.':
      'Lowercase letters, numbers and hyphens in the middle. Example: ciencia.',
    'Nicho editorial': 'Editorial niche',
    'Público que você quer alcançar': 'Audience you want to reach',
    Idioma: 'Language',
    'ID do canal no YouTube (opcional)': 'YouTube channel ID (optional)',
    'Descrição e proposta editorial': 'Description and editorial focus',
    'Enviar cada versão final aprovada ao YouTube como vídeo privado (exige o YouTube conectado com permissão de envio)':
      'Upload each approved final version to YouTube as a private video (requires YouTube connected with upload permission)',
    'Excluir este registro?': 'Delete this record?',
    'A exclusão pode ser bloqueada se o canal tiver conteúdo ou conexões vinculadas. Confira o registro antes de continuar.':
      'Deletion may be blocked if the channel has linked content or connections. Check the record before you continue.',
    'Este registro será removido do estado local. Arquivos de produção seguem a política do servidor.':
      'This record will be removed from the local state. Production files follow the server policy.',
    'Excluir registro': 'Delete record',
    'Registro excluído.': 'Record deleted.',
    'Canal: {name}': 'Channel: {name}',
    'Selecione um canal': 'Select a channel',
    'Padrão desta instalação': 'Default for this installation',
    'Salvar padrão da instalação': 'Save installation default',
    'Salvar configuração deste canal': "Save this channel's settings",
    'Padrão da instalação atualizado. Canais com configuração própria conservam seus ajustes.':
      'Installation default updated. Channels with their own settings keep them.',
    'Configuração do canal salva.': 'Channel settings saved.',
    'Onde aplicar estes ajustes?': 'Where should these settings apply?',
    'A configuração do canal prevalece sobre o padrão da instalação.':
      'Channel settings override the installation default.',
    Renderização: 'Rendering',
    'Largura em pixels': 'Width in pixels',
    'Altura em pixels': 'Height in pixels',
    'Quadros por segundo': 'Frames per second',
    'CRF — qualidade de compressão': 'CRF — compression quality',
    'Menor valor prioriza qualidade e pode aumentar o arquivo.':
      'A lower value favors quality and may increase file size.',
    'Preset do encoder': 'Encoder preset',
    Codec: 'Codec',
    'Voz & narração local': 'Voice & local narration',
    'Voz brasileira': 'Brazilian voice',
    'Kokoro-82M v1.0 · Apache 2.0 · permite uso comercial, com as condições da licença.':
      'Kokoro-82M v1.0 · Apache 2.0 · allows commercial use under the license terms.',
    'Python do narrador': 'Narrator Python',
    'Instalação local: npm run voices:setup. No Docker: /opt/tts/bin/python.':
      'Local install: npm run voices:setup. In Docker: /opt/tts/bin/python.',
    'Modelo Kokoro': 'Kokoro model',
    'kokoro-v1.0.onnx do catálogo. O motor confere o SHA-256 antes de narrar.':
      'kokoro-v1.0.onnx from the catalog. The engine checks the SHA-256 before narrating.',
    'Arquivo das vozes': 'Voices file',
    'voices-v1.0.bin do mesmo catálogo. Arquivos alterados ou de outra origem são bloqueados.':
      'voices-v1.0.bin from the same catalog. Modified files or files from other sources are blocked.',
    'Conferência da fala com ASR': 'Speech check with ASR',
    'Usar o modelo local de transcrição no QA': 'Use the local transcription model in QA',
    'Arquivo do modelo ASR': 'ASR model file',
    'Idioma da transcrição': 'Transcription language',
    'Limiar de cobertura': 'Coverage threshold',
    'De 0 a 1. Cobertura não comprova qualidade editorial.':
      'From 0 to 1. Coverage does not prove editorial quality.',
    'Publicação automática': 'Automatic publishing',
    Desativada: 'Off',
    Telemetria: 'Telemetry',
    'Motor de produção': 'Production engine',
    Disponível: 'Available',
    'Não encontrado': 'Not found',
    'Estado do motor não informado pelo servidor.': 'The server did not report the engine status.',
    Configurações: 'Settings',
    'Configure a produção e personalize o assistente de criação.':
      'Configure production and customize the creation assistant.',
    'Operação local': 'Local operation',
    'Controles de segurança desta versão.': 'Safety controls in this version.',
    'Voz sem aprovação comercial nesta instalação. Escolha Dora, Alex ou Santa (Kokoro) em Configurações. Vozes Piper legadas estão bloqueadas.':
      'Voice not approved for commercial use in this installation. Choose Dora, Alex or Santa (Kokoro) in Settings. Legacy Piper voices are blocked.',
    'Configure os arquivos da voz comercial e o Python do Kokoro. Execute npm run voices:setup antes de produzir.':
      'Set up the commercial voice files and the Kokoro Python. Run npm run voices:setup before producing.',
    'Rede social': 'Social network',
    'Nenhuma conta vinculada neste canal': 'No account linked to this channel',
    'Conexão: {connected} · Expiração: {expires}': 'Connected: {connected} · Expires: {expires}',
    'Conexão: {connected}': 'Connected: {connected}',
    'Consultar métricas': 'Fetch metrics',
    'Consulta concluída. Confira os dados e seus períodos em Análises.':
      'Fetch complete. Check the data and its periods in Analytics.',
    'Remover vínculo local': 'Remove local link',
    'Preparar autorização OAuth': 'Prepare OAuth authorization',
    'Salvar vínculo no servidor local': 'Save link on the local server',
    'Destino de autorização inesperado.': 'Unexpected authorization destination.',
    'Autorize a conta correta no Google. O vínculo só será confirmado após o retorno ao servidor local.':
      'Authorize the right account on Google. The link is confirmed only after you return to the local server.',
    'Autorização válida até {date}': 'Authorization valid until {date}',
    'Continuar no Google': 'Continue on Google',
    'Autorização preparada. Continue pelo link do Google.':
      'Authorization ready. Continue through the Google link.',
    'Vínculo salvo no servidor local. Consulte a rede para verificar seus dados.':
      'Link saved on the local server. Fetch the network to check your data.',
    'Não foi possível concluir a conexão. Confira o identificador, a credencial e os requisitos do provedor; o segredo foi removido do formulário.':
      'Could not complete the connection. Check the identifier, the credential and the provider requirements; the secret was removed from the form.',
    'ID do canal no YouTube': 'YouTube channel ID',
    'ID da conta no provedor': 'Provider account ID',
    'Use o cliente OAuth configurado para esta instalação. A autorização ocorre no Google; senhas da sua conta não são solicitadas aqui.':
      'Use the OAuth client set up for this installation. Authorization happens on Google; your account passwords are never asked for here.',
    'Token de acesso oficial': 'Official access token',
    'Enviado apenas ao servidor local e removido deste formulário após o envio.':
      'Sent only to the local server and removed from this form after sending.',
    'Expiração (se conhecida)': 'Expiration (if known)',
    'Escopos concedidos': 'Granted scopes',
    'Separe os escopos por vírgula.': 'Separate scopes with commas.',
    'A capacidade desta integração não foi informada pelo servidor. Atualize o estúdio antes de configurar uma conexão.':
      'The server did not report what this integration can do. Refresh the Studio before setting up a connection.',
    'Métricas disponíveis': 'Metrics available',
    'Métricas indisponíveis': 'Metrics unavailable',
    'Receita sujeita a escopo': 'Revenue depends on scope',
    'Sem receita nesta API': 'No revenue in this API',
    'Envio privado disponível': 'Private upload available',
    'Sem envio nesta API': 'No upload in this API',
    'As informações dependem das permissões e funcionalidades do provedor.':
      "The information depends on the provider's permissions and features.",
    'Documentação oficial': 'Official documentation',
    'Contas conectadas': 'Connected accounts',
    'Cada rede, com a conta e as permissões certas.': 'Each network, with the right account and permissions.',
    'Conectar ao {network}': 'Connect to {network}',
    'Vínculo exclusivo de {channel}.': 'Link exclusive to {channel}.',
    'O que esta integração permite': 'What this integration allows',
    'Capacidades informadas pelo servidor.': 'Capabilities reported by the server.',
    'Remover este vínculo local?': 'Remove this local link?',
    'A credencial deste vínculo será removida da instalação. Seus vídeos na plataforma não serão excluídos. Para consultar a rede novamente, será necessário reconectar.':
      "This link's credential will be removed from the installation. Your videos on the platform will not be deleted. To fetch the network again, you will need to reconnect.",
    'Remover vínculo': 'Remove link',
    'Vínculo local removido.': 'Local link removed.',
    'Cliente OAuth Web próprio e callback local registrado exatamente.':
      'Your own web OAuth client, with the local callback registered exactly.',
    'YouTube Data API e Analytics API habilitadas.': 'YouTube Data API and Analytics API enabled.',
    'youtube.readonly, yt-analytics.readonly, yt-analytics-monetary.readonly e youtube.upload.':
      'youtube.readonly, yt-analytics.readonly, yt-analytics-monetary.readonly and youtube.upload.',
    'Envio sempre como privado; a publicação é decisão do operador no YouTube Studio.':
      "Always uploaded as private; publishing is the operator's decision in YouTube Studio.",
    'Receita estimada pela YouTube Analytics API; não é pagamento recebido e pode sofrer ajustes.':
      'Revenue estimated by the YouTube Analytics API; it is not a received payment and may be adjusted.',
    'Aplicativo e token autorizados para a conta.': 'App and token authorized for the account.',
    'Display API: user.info.basic e user.info.stats.': 'Display API: user.info.basic and user.info.stats.',
    'A Display API usada aqui fornece perfil e contadores, não comprovantes ou receita do Creator Rewards. Recebimentos exigem importação manual.':
      'The Display API used here provides profile and counters, not Creator Rewards receipts or revenue. Payments require manual import.',
    'Conta profissional ligada a uma Página.': 'Professional account linked to a Page.',
    'Token de usuário do Facebook Login com pages_show_list, pages_read_engagement e instagram_basic, conforme aprovação do aplicativo.':
      'Facebook Login user token with pages_show_list, pages_read_engagement and instagram_basic, as approved for the app.',
    'Esta integração lê contadores da conta profissional; não implementa API de recebimentos do Instagram. Importe comprovantes manualmente.':
      'This integration reads the professional account counters; it does not implement an Instagram payments API. Import receipts manually.',
    'Token de acesso da Página, não um perfil pessoal.': 'Page access token, not a personal profile.',
    'Permissões de leitura da Página e aprovação exigida pela Meta.':
      'Page read permissions and the approval Meta requires.',
    'Esta integração lê contadores da Página e não integra receitas ou pagamentos. Importe comprovantes manualmente.':
      'This integration reads Page counters and does not include revenue or payments. Import receipts manually.',
    'Falta autorização yt-analytics-monetary.readonly confirmada pela API. Receita permanece desconhecida.':
      'Missing yt-analytics-monetary.readonly authorization confirmed by the API. Revenue remains unknown.',
    'Fonte: YouTube Analytics API estimatedRevenue, em BRL. Estimativa sujeita a atraso e ajustes; não comprova pagamento ou aprovação atual no YPP.':
      'Source: YouTube Analytics API estimatedRevenue, in BRL. Estimate subject to delay and adjustments; it does not prove payment or current YPP approval.',
    'A YouTube Analytics API não retornou receita na janela; ausência não equivale a zero ou confirmação de monetização.':
      'The YouTube Analytics API returned no revenue for the window; absence does not mean zero or confirm monetization.',
    'Relatório monetário indisponível na YouTube Analytics API; confira escopos, habilitação e permissões. Valor permanece desconhecido.':
      'Monetary report unavailable in the YouTube Analytics API; check scopes, enablement and permissions. The amount remains unknown.',
    'Várias moedas': 'Multiple currencies',
    'Consultar rede': 'Fetch network',
    'Dados consultados no provedor.': 'Data fetched from the provider.',
    Visualizações: 'Views',
    'Período informado pelo provedor': 'Period reported by the provider',
    'Aguardando dados da rede': 'Waiting for network data',
    Seguidores: 'Followers',
    'Contagem na última consulta': 'Count at the last fetch',
    'Nenhum valor presumido': 'No value assumed',
    'Receita estimada': 'Estimated revenue',
    'Indisponível ou sem permissão': 'Unavailable or no permission',
    'Estimativa do provedor, não pagamento': 'Provider estimate, not a payment',
    'Pagamentos registrados': 'Recorded payments',
    'Registros manuais do operador': "Operator's manual records",
    Consulta: 'Fetch',
    Período: 'Period',
    Views: 'Views',
    '{start} a {end}': '{start} to {end}',
    Data: 'Date',
    Natureza: 'Type',
    Valor: 'Amount',
    Observação: 'Note',
    'Custo manual': 'Manual cost',
    'Pagamento manual': 'Manual payment',
    'Estimativa manual': 'Manual estimate',
    'Editar registro financeiro': 'Edit financial record',
    'Excluir registro financeiro': 'Delete financial record',
    'Registro financeiro': 'Financial record',
    '{network} · Coleta: {date} · Conta: {account}': '{network} · Fetched: {date} · Account: {account}',
    'Dados desconhecidos aparecem como —. Conectar uma conta não comprova monetização.':
      'Unknown data shows as —. Connecting an account does not prove monetization.',
    Resultados: 'Results',
    'Dados de audiência e finanças com origem e contexto.':
      'Audience and finance data with source and context.',
    'A receita depende do programa, da conta e dos escopos concedidos. Nenhuma receita é presumida.':
      'Revenue depends on the program, the account and the granted scopes. No revenue is assumed.',
    'Consultas ao provedor': 'Provider fetches',
    'Snapshots preservados · Não somar contagens acumuladas':
      'Snapshots kept · Do not add up cumulative counts',
    'Sem coleta registrada': 'No fetch recorded',
    'Histórico de dados': 'Data history',
    'Conecte a conta e consulte suas métricas': 'Connect the account and fetch your metrics',
    'Os dados disponíveis dependem das capacidades e permissões da API oficial de cada rede.':
      "Available data depends on the capabilities and permissions of each network's official API.",
    'Configurar conexão': 'Set up connection',
    'Seu registro financeiro': 'Your financial records',
    'Custos registrados: {total}': 'Recorded costs: {total}',
    'Histórico financeiro': 'Financial history',
    'Registros manuais são identificados e não substituem extratos ou confirmação da plataforma.':
      'Manual records are labeled and do not replace statements or platform confirmation.',
    'Nenhum registro financeiro neste canal e rede': 'No financial records for this channel and network',
    'Registre somente o que você conhece, indicando se é custo, estimativa ou pagamento.':
      'Record only what you know, stating whether it is a cost, an estimate or a payment.',
    'Adicionar registro': 'Add record',
    'Registrar um movimento': 'Record a transaction',
    'Registro manual, associado à rede e ao canal selecionados.':
      'Manual record, tied to the selected network and channel.',
    'Custo realizado': 'Cost incurred',
    'Pagamento recebido — registro manual': 'Payment received — manual record',
    'Salvar registro': 'Save record',
    'Registro financeiro salvo com origem manual.': 'Financial record saved with manual source.',
    Rede: 'Network',
    Moeda: 'Currency',
    'Código de três letras, como BRL ou USD.': 'Three-letter code, such as BRL or USD.',
    'Data do registro': 'Record date',
    'Início do período (opcional)': 'Period start (optional)',
    'Fim do período (opcional)': 'Period end (optional)',
    'Origem, motivo e observações': 'Source, reason and notes',
    'Estimativa e pagamento são registros diferentes. Não informe uma previsão como dinheiro recebido; use as evidências da sua própria conta.':
      'Estimates and payments are different records. Do not enter a forecast as money received; use the evidence from your own account.',
    'A Display API usada aqui fornece perfil e contadores, não comprovantes ou receita do Creator Rewards. Recebimentos exigem importação manual. Contadores de perfil/Página são instantâneos e não uma série de desempenho de 28 dias.':
      'The Display API used here provides profile and counters, not Creator Rewards receipts or revenue. Payments require manual import. Profile/Page counters are snapshots, not a 28-day performance series.',
    'Esta integração lê contadores da conta profissional; não implementa API de recebimentos do Instagram. Importe comprovantes manualmente. Contadores de perfil/Página são instantâneos e não uma série de desempenho de 28 dias.':
      'This integration reads the professional account counters; it does not implement an Instagram payments API. Import receipts manually. Profile/Page counters are snapshots, not a 28-day performance series.',
    'Esta integração lê contadores da Página e não integra receitas ou pagamentos. Importe comprovantes manualmente. Contadores de perfil/Página são instantâneos e não uma série de desempenho de 28 dias.':
      'This integration reads Page counters and does not include revenue or payments. Import receipts manually. Profile/Page counters are snapshots, not a 28-day performance series.',
    'Envio automático': 'Automatic upload',
    'nunca público': 'never public',
    'Enviar cada versão final aprovada ao TikTok como "Somente eu" (exige o TikTok conectado com permissão de envio)':
      'Send each approved final version to TikTok as "Only me" (needs TikTok connected with upload permission)',
    'Enviar cada vídeo vertical aprovado ao Facebook como rascunho de Reel (exige a Página conectada com permissão de envio)':
      'Send each approved vertical video to Facebook as a Reel draft (needs the Page connected with upload permission)',
    'Autorize a conta correta em {provider}. O vínculo só será confirmado após o retorno ao servidor local.':
      'Authorize the right account on {provider}. The link is only confirmed after returning to the local server.',
    'Continuar em {provider}': 'Continue on {provider}',
    'Autorização preparada. Continue pelo link de {provider}.':
      'Authorization ready. Continue through the {provider} link.',
    'Callback a registrar no aplicativo: {url}': 'Callback to register in the app: {url}',
    'Use o aplicativo OAuth configurado para esta instalação. A autorização ocorre em {provider}; senhas da sua conta não são solicitadas aqui.':
      'Use the OAuth app configured for this installation. Authorization happens on {provider}; your account passwords are never asked for here.',
    'Envio não público disponível': 'Non-public upload available',
    'Nome de usuário no TikTok': 'TikTok username',
    'ID da conta profissional do Instagram': 'Instagram professional account ID',
    '@ do Instagram (ou ID da conta profissional)': 'Instagram @ (or professional account ID)',
    'ID da Página do Facebook': 'Facebook Page ID',
    'Aplicativo próprio no TikTok for Developers, plataforma Web, com o endereço de retorno abaixo registrado exatamente.':
      'Your own app on TikTok for Developers, Web platform, with the redirect URI below registered exactly.',
    'Aplicativo próprio no TikTok for Developers, plataforma Desktop, com o callback local registrado exatamente.':
      'Your own TikTok for Developers app, Desktop platform, with the local callback registered exactly.',
    'Login Kit e Content Posting API (Direct Post): user.info.basic, user.info.profile, user.info.stats e video.publish.':
      'Login Kit and Content Posting API (Direct Post): user.info.basic, user.info.profile, user.info.stats and video.publish.',
    'Envio sempre como "Somente eu" (SELF_ONLY); a publicação é decisão do operador no app do TikTok.':
      'Always uploaded as "Only me" (SELF_ONLY); publishing is the operator\'s decision in the TikTok app.',
    'Aplicativo Meta próprio com Facebook Login e o callback local registrado; pages_show_list, pages_read_engagement e instagram_basic.':
      'Your own Meta app with Facebook Login and the local callback registered; pages_show_list, pages_read_engagement and instagram_basic.',
    'Aplicativo Meta próprio com Facebook Login e o endereço de retorno abaixo registrado; pages_show_list, pages_read_engagement e instagram_basic.':
      'Your own Meta app with Facebook Login and the redirect URI below registered; pages_show_list, pages_read_engagement and instagram_basic.',
    'Sem envio: a API de publicação do Instagram não tem rascunho nem modo privado, e publicar direto é decisão do operador no app.':
      "No upload: Instagram's publishing API has no draft or private mode, and publishing directly is the operator's decision in the app.",
    'Aplicativo Meta próprio com Facebook Login e o callback local registrado; o token salvo é o da Página, não de um perfil pessoal.':
      "Your own Meta app with Facebook Login and the local callback registered; the saved token is the Page's, not a personal profile's.",
    'Aplicativo Meta próprio com Facebook Login e o endereço de retorno abaixo registrado; o token salvo é o da Página, não de um perfil pessoal.':
      "Your own Meta app with Facebook Login and the redirect URI below registered; the saved token is the Page's, not a personal profile's.",
    'pages_show_list, pages_read_engagement e pages_manage_posts, com a aprovação exigida pela Meta.':
      'pages_show_list, pages_read_engagement and pages_manage_posts, with the approval Meta requires.',
    'Envio sempre como rascunho de Reel (vídeo vertical); a publicação é decisão do operador no Meta Business Suite.':
      "Always uploaded as a Reel draft (vertical video); publishing is the operator's decision in Meta Business Suite.",
    'Publicar cada vídeo vertical aprovado no Instagram como Reel público, sem revisão na rede (exige a conta conectada com permissão de publicação)':
      'Publish each approved vertical video on Instagram as a public Reel, with no review on the network (needs the account connected with publishing permission)',
    público: 'public',
    'ID da configuração do Facebook Login for Business': 'Facebook Login for Business configuration ID',
    'Opcional. Sem ele, a Meta mostra a lista de Páginas e contas do Instagram para você marcar no login; use-o só se a sua configuração do Facebook Login for Business oferecer essa escolha.':
      'Optional. Without it, Meta lists your Pages and Instagram accounts to select at login; use it only if your Facebook Login for Business configuration offers that choice.',
    'Opcional no Facebook; use a mesma configuração do Instagram se tiver uma.':
      'Optional for Facebook; use the same configuration as Instagram if you have one.',
    'Publicação pública direta': 'Direct public posting',
    'Aplicativo Meta próprio com Facebook Login for Business e o callback local registrado; a configuração pede pages_show_list, pages_read_engagement, instagram_basic e instagram_content_publish.':
      'Your own Meta app with Facebook Login for Business and the local callback registered; the configuration asks for pages_show_list, pages_read_engagement, instagram_basic and instagram_content_publish.',
    'Aplicativo Meta próprio com Facebook Login for Business e o endereço de retorno abaixo registrado; a configuração pede pages_show_list, pages_read_engagement, instagram_basic e instagram_content_publish.':
      'Your own Meta app with Facebook Login for Business and the redirect URI below registered; the configuration asks for pages_show_list, pages_read_engagement, instagram_basic and instagram_content_publish.',
    'Publicação pública direta como Reel (vídeo vertical): a API do Instagram não tem rascunho nem modo privado. Só sai a versão final aprovada no QA, por clique confirmado ou com o opt-in do canal.':
      'Direct public posting as a Reel (vertical video): the Instagram API has no draft or private mode. Only the final version approved in QA goes out, by a confirmed click or with the channel opt-in.',
    '{language} · sem voz comercial': '{language} · no commercial voice',
    'Voz do narrador': 'Narrator voice',
    'Segue o idioma do canal ({language}).': "Follows the channel's language ({language}).",
    'Heart · feminina · EN-US': 'Heart · female · EN-US',
    'Bella · feminina · EN-US': 'Bella · female · EN-US',
    'Michael · masculina · EN-US': 'Michael · male · EN-US',
    'Dora · feminina · ES': 'Dora · female · ES',
    'Alex · masculina · ES': 'Alex · male · ES',
    'Santa · masculina · ES': 'Santa · male · ES',
  },
  es: {
    'Comece pelo seu canal': 'Empieza por tu canal',
    'Crie uma identidade local para organizar suas pautas, conteúdos, conexões e resultados.':
      'Crea una identidad local para organizar tus temas, contenidos, conexiones y resultados.',
    'Adicionar canal': 'Agregar canal',
    Canais: 'Canales',
    'Organize público, proposta editorial e contas de cada canal.':
      'Organiza el público, la propuesta editorial y las cuentas de cada canal.',
    Selecionado: 'Seleccionado',
    'Descrição editorial ainda não definida.': 'Descripción editorial aún sin definir.',
    Nicho: 'Nicho',
    'a definir': 'por definir',
    'Envio ao YouTube': 'Envío a YouTube',
    'automático, como privado': 'automático, como privado',
    manual: 'manual',
    Identificador: 'Identificador',
    'Abrir canal': 'Abrir canal',
    'Editar {name}': 'Editar {name}',
    'Excluir {name}': 'Eliminar {name}',
    'Crie seu primeiro canal': 'Crea tu primer canal',
    'Defina nome, público e proposta editorial. O conteúdo e as contas ficam separados por canal.':
      'Define el nombre, el público y la propuesta editorial. El contenido y las cuentas quedan separados por canal.',
    'Criar canal': 'Crear canal',
    'Editar canal': 'Editar canal',
    'A identidade e os arquivos deste canal ficam separados dos demais.':
      'La identidad y los archivos de este canal quedan separados de los demás.',
    'Salvar canal': 'Guardar canal',
    'Canal atualizado.': 'Canal actualizado.',
    'Canal criado. Agora mande a pauta do primeiro vídeo.':
      'Canal creado. Ahora envía el tema del primer video.',
    'Nome do canal': 'Nombre del canal',
    'Identificador local': 'Identificador local',
    'Letras minúsculas, números e hífen no meio. Exemplo: ciencia.':
      'Letras minúsculas, números y guion en el medio. Ejemplo: ciencia.',
    'Nicho editorial': 'Nicho editorial',
    'Público que você quer alcançar': 'Público que quieres alcanzar',
    Idioma: 'Idioma',
    'ID do canal no YouTube (opcional)': 'ID del canal en YouTube (opcional)',
    'Descrição e proposta editorial': 'Descripción y propuesta editorial',
    'Enviar cada versão final aprovada ao YouTube como vídeo privado (exige o YouTube conectado com permissão de envio)':
      'Subir cada versión final aprobada a YouTube como video privado (requiere YouTube conectado con permiso de subida)',
    'Excluir este registro?': '¿Eliminar este registro?',
    'A exclusão pode ser bloqueada se o canal tiver conteúdo ou conexões vinculadas. Confira o registro antes de continuar.':
      'La eliminación puede bloquearse si el canal tiene contenido o conexiones vinculadas. Revisa el registro antes de continuar.',
    'Este registro será removido do estado local. Arquivos de produção seguem a política do servidor.':
      'Este registro se eliminará del estado local. Los archivos de producción siguen la política del servidor.',
    'Excluir registro': 'Eliminar registro',
    'Registro excluído.': 'Registro eliminado.',
    'Canal: {name}': 'Canal: {name}',
    'Selecione um canal': 'Selecciona un canal',
    'Padrão desta instalação': 'Predeterminado de esta instalación',
    'Salvar padrão da instalação': 'Guardar predeterminado de la instalación',
    'Salvar configuração deste canal': 'Guardar configuración de este canal',
    'Padrão da instalação atualizado. Canais com configuração própria conservam seus ajustes.':
      'Predeterminado de la instalación actualizado. Los canales con configuración propia conservan sus ajustes.',
    'Configuração do canal salva.': 'Configuración del canal guardada.',
    'Onde aplicar estes ajustes?': '¿Dónde aplicar estos ajustes?',
    'A configuração do canal prevalece sobre o padrão da instalação.':
      'La configuración del canal prevalece sobre el predeterminado de la instalación.',
    Renderização: 'Renderizado',
    'Largura em pixels': 'Ancho en píxeles',
    'Altura em pixels': 'Alto en píxeles',
    'Quadros por segundo': 'Cuadros por segundo',
    'CRF — qualidade de compressão': 'CRF — calidad de compresión',
    'Menor valor prioriza qualidade e pode aumentar o arquivo.':
      'Un valor menor prioriza la calidad y puede aumentar el archivo.',
    'Preset do encoder': 'Preset del codificador',
    Codec: 'Códec',
    'Voz & narração local': 'Voz y narración local',
    'Voz brasileira': 'Voz brasileña',
    'Kokoro-82M v1.0 · Apache 2.0 · permite uso comercial, com as condições da licença.':
      'Kokoro-82M v1.0 · Apache 2.0 · permite uso comercial, con las condiciones de la licencia.',
    'Python do narrador': 'Python del narrador',
    'Instalação local: npm run voices:setup. No Docker: /opt/tts/bin/python.':
      'Instalación local: npm run voices:setup. En Docker: /opt/tts/bin/python.',
    'Modelo Kokoro': 'Modelo Kokoro',
    'kokoro-v1.0.onnx do catálogo. O motor confere o SHA-256 antes de narrar.':
      'kokoro-v1.0.onnx del catálogo. El motor verifica el SHA-256 antes de narrar.',
    'Arquivo das vozes': 'Archivo de voces',
    'voices-v1.0.bin do mesmo catálogo. Arquivos alterados ou de outra origem são bloqueados.':
      'voices-v1.0.bin del mismo catálogo. Los archivos modificados o de otro origen se bloquean.',
    'Conferência da fala com ASR': 'Verificación del habla con ASR',
    'Usar o modelo local de transcrição no QA': 'Usar el modelo local de transcripción en el QA',
    'Arquivo do modelo ASR': 'Archivo del modelo ASR',
    'Idioma da transcrição': 'Idioma de la transcripción',
    'Limiar de cobertura': 'Umbral de cobertura',
    'De 0 a 1. Cobertura não comprova qualidade editorial.':
      'De 0 a 1. La cobertura no comprueba la calidad editorial.',
    'Publicação automática': 'Publicación automática',
    Desativada: 'Desactivada',
    Telemetria: 'Telemetría',
    'Motor de produção': 'Motor de producción',
    Disponível: 'Disponible',
    'Não encontrado': 'No encontrado',
    'Estado do motor não informado pelo servidor.': 'El servidor no informó el estado del motor.',
    Configurações: 'Configuración',
    'Configure a produção e personalize o assistente de criação.':
      'Configura la producción y personaliza el asistente de creación.',
    'Operação local': 'Operación local',
    'Controles de segurança desta versão.': 'Controles de seguridad de esta versión.',
    'Voz sem aprovação comercial nesta instalação. Escolha Dora, Alex ou Santa (Kokoro) em Configurações. Vozes Piper legadas estão bloqueadas.':
      'Voz sin aprobación comercial en esta instalación. Elige Dora, Alex o Santa (Kokoro) en Configuración. Las voces Piper heredadas están bloqueadas.',
    'Configure os arquivos da voz comercial e o Python do Kokoro. Execute npm run voices:setup antes de produzir.':
      'Configura los archivos de la voz comercial y el Python de Kokoro. Ejecuta npm run voices:setup antes de producir.',
    'Rede social': 'Red social',
    'Nenhuma conta vinculada neste canal': 'Ninguna cuenta vinculada a este canal',
    'Conexão: {connected} · Expiração: {expires}': 'Conexión: {connected} · Vencimiento: {expires}',
    'Conexão: {connected}': 'Conexión: {connected}',
    'Consultar métricas': 'Consultar métricas',
    'Consulta concluída. Confira os dados e seus períodos em Análises.':
      'Consulta completada. Revisa los datos y sus períodos en Análisis.',
    'Remover vínculo local': 'Quitar vínculo local',
    'Preparar autorização OAuth': 'Preparar autorización OAuth',
    'Salvar vínculo no servidor local': 'Guardar vínculo en el servidor local',
    'Destino de autorização inesperado.': 'Destino de autorización inesperado.',
    'Autorize a conta correta no Google. O vínculo só será confirmado após o retorno ao servidor local.':
      'Autoriza la cuenta correcta en Google. El vínculo solo se confirma al volver al servidor local.',
    'Autorização válida até {date}': 'Autorización válida hasta {date}',
    'Continuar no Google': 'Continuar en Google',
    'Autorização preparada. Continue pelo link do Google.':
      'Autorización preparada. Continúa por el enlace de Google.',
    'Vínculo salvo no servidor local. Consulte a rede para verificar seus dados.':
      'Vínculo guardado en el servidor local. Consulta la red para verificar tus datos.',
    'Não foi possível concluir a conexão. Confira o identificador, a credencial e os requisitos do provedor; o segredo foi removido do formulário.':
      'No se pudo completar la conexión. Revisa el identificador, la credencial y los requisitos del proveedor; el secreto se quitó del formulario.',
    'ID do canal no YouTube': 'ID del canal en YouTube',
    'ID da conta no provedor': 'ID de la cuenta en el proveedor',
    'Use o cliente OAuth configurado para esta instalação. A autorização ocorre no Google; senhas da sua conta não são solicitadas aqui.':
      'Usa el cliente OAuth configurado para esta instalación. La autorización ocurre en Google; aquí no se piden las contraseñas de tu cuenta.',
    'Token de acesso oficial': 'Token de acceso oficial',
    'Enviado apenas ao servidor local e removido deste formulário após o envio.':
      'Se envía solo al servidor local y se quita de este formulario tras el envío.',
    'Expiração (se conhecida)': 'Vencimiento (si lo conoces)',
    'Escopos concedidos': 'Alcances concedidos',
    'Separe os escopos por vírgula.': 'Separa los alcances con comas.',
    'A capacidade desta integração não foi informada pelo servidor. Atualize o estúdio antes de configurar uma conexão.':
      'El servidor no informó la capacidad de esta integración. Actualiza el Studio antes de configurar una conexión.',
    'Métricas disponíveis': 'Métricas disponibles',
    'Métricas indisponíveis': 'Métricas no disponibles',
    'Receita sujeita a escopo': 'Ingresos sujetos al alcance',
    'Sem receita nesta API': 'Sin ingresos en esta API',
    'Envio privado disponível': 'Subida privada disponible',
    'Sem envio nesta API': 'Sin subida en esta API',
    'As informações dependem das permissões e funcionalidades do provedor.':
      'La información depende de los permisos y funciones del proveedor.',
    'Documentação oficial': 'Documentación oficial',
    'Contas conectadas': 'Cuentas conectadas',
    'Cada rede, com a conta e as permissões certas.': 'Cada red, con la cuenta y los permisos correctos.',
    'Conectar ao {network}': 'Conectar con {network}',
    'Vínculo exclusivo de {channel}.': 'Vínculo exclusivo de {channel}.',
    'O que esta integração permite': 'Lo que permite esta integración',
    'Capacidades informadas pelo servidor.': 'Capacidades informadas por el servidor.',
    'Remover este vínculo local?': '¿Quitar este vínculo local?',
    'A credencial deste vínculo será removida da instalação. Seus vídeos na plataforma não serão excluídos. Para consultar a rede novamente, será necessário reconectar.':
      'La credencial de este vínculo se eliminará de la instalación. Tus videos en la plataforma no se eliminarán. Para volver a consultar la red, tendrás que reconectar.',
    'Remover vínculo': 'Quitar vínculo',
    'Vínculo local removido.': 'Vínculo local quitado.',
    'Cliente OAuth Web próprio e callback local registrado exatamente.':
      'Cliente OAuth web propio y callback local registrado exactamente.',
    'YouTube Data API e Analytics API habilitadas.': 'YouTube Data API y Analytics API habilitadas.',
    'youtube.readonly, yt-analytics.readonly, yt-analytics-monetary.readonly e youtube.upload.':
      'youtube.readonly, yt-analytics.readonly, yt-analytics-monetary.readonly y youtube.upload.',
    'Envio sempre como privado; a publicação é decisão do operador no YouTube Studio.':
      'Siempre se sube como privado; la publicación la decide el operador en YouTube Studio.',
    'Receita estimada pela YouTube Analytics API; não é pagamento recebido e pode sofrer ajustes.':
      'Ingresos estimados por la YouTube Analytics API; no son un pago recibido y pueden ajustarse.',
    'Aplicativo e token autorizados para a conta.': 'Aplicación y token autorizados para la cuenta.',
    'Display API: user.info.basic e user.info.stats.': 'Display API: user.info.basic y user.info.stats.',
    'A Display API usada aqui fornece perfil e contadores, não comprovantes ou receita do Creator Rewards. Recebimentos exigem importação manual.':
      'La Display API usada aquí ofrece perfil y contadores, no comprobantes ni ingresos de Creator Rewards. Los cobros requieren importación manual.',
    'Conta profissional ligada a uma Página.': 'Cuenta profesional vinculada a una Página.',
    'Token de usuário do Facebook Login com pages_show_list, pages_read_engagement e instagram_basic, conforme aprovação do aplicativo.':
      'Token de usuario de Facebook Login con pages_show_list, pages_read_engagement e instagram_basic, según la aprobación de la aplicación.',
    'Esta integração lê contadores da conta profissional; não implementa API de recebimentos do Instagram. Importe comprovantes manualmente.':
      'Esta integración lee los contadores de la cuenta profesional; no implementa una API de cobros de Instagram. Importa los comprobantes manualmente.',
    'Token de acesso da Página, não um perfil pessoal.':
      'Token de acceso de la Página, no de un perfil personal.',
    'Permissões de leitura da Página e aprovação exigida pela Meta.':
      'Permisos de lectura de la Página y la aprobación que exige Meta.',
    'Esta integração lê contadores da Página e não integra receitas ou pagamentos. Importe comprovantes manualmente.':
      'Esta integración lee los contadores de la Página y no integra ingresos ni pagos. Importa los comprobantes manualmente.',
    'Falta autorização yt-analytics-monetary.readonly confirmada pela API. Receita permanece desconhecida.':
      'Falta la autorización yt-analytics-monetary.readonly confirmada por la API. Los ingresos siguen desconocidos.',
    'Fonte: YouTube Analytics API estimatedRevenue, em BRL. Estimativa sujeita a atraso e ajustes; não comprova pagamento ou aprovação atual no YPP.':
      'Fuente: YouTube Analytics API estimatedRevenue, en BRL. Estimación sujeta a demoras y ajustes; no comprueba pago ni aprobación actual en el YPP.',
    'A YouTube Analytics API não retornou receita na janela; ausência não equivale a zero ou confirmação de monetização.':
      'La YouTube Analytics API no devolvió ingresos en la ventana; la ausencia no equivale a cero ni confirma la monetización.',
    'Relatório monetário indisponível na YouTube Analytics API; confira escopos, habilitação e permissões. Valor permanece desconhecido.':
      'Informe monetario no disponible en la YouTube Analytics API; revisa alcances, habilitación y permisos. El valor sigue desconocido.',
    'Várias moedas': 'Varias monedas',
    'Consultar rede': 'Consultar red',
    'Dados consultados no provedor.': 'Datos consultados en el proveedor.',
    Visualizações: 'Visualizaciones',
    'Período informado pelo provedor': 'Período informado por el proveedor',
    'Aguardando dados da rede': 'Esperando datos de la red',
    Seguidores: 'Seguidores',
    'Contagem na última consulta': 'Conteo en la última consulta',
    'Nenhum valor presumido': 'Ningún valor supuesto',
    'Receita estimada': 'Ingresos estimados',
    'Indisponível ou sem permissão': 'No disponible o sin permiso',
    'Estimativa do provedor, não pagamento': 'Estimación del proveedor, no un pago',
    'Pagamentos registrados': 'Pagos registrados',
    'Registros manuais do operador': 'Registros manuales del operador',
    Consulta: 'Consulta',
    Período: 'Período',
    Views: 'Vistas',
    '{start} a {end}': '{start} a {end}',
    Data: 'Fecha',
    Natureza: 'Tipo',
    Valor: 'Monto',
    Observação: 'Observación',
    'Custo manual': 'Costo manual',
    'Pagamento manual': 'Pago manual',
    'Estimativa manual': 'Estimación manual',
    'Editar registro financeiro': 'Editar registro financiero',
    'Excluir registro financeiro': 'Eliminar registro financiero',
    'Registro financeiro': 'Registro financiero',
    '{network} · Coleta: {date} · Conta: {account}': '{network} · Consulta: {date} · Cuenta: {account}',
    'Dados desconhecidos aparecem como —. Conectar uma conta não comprova monetização.':
      'Los datos desconocidos aparecen como —. Conectar una cuenta no comprueba la monetización.',
    Resultados: 'Resultados',
    'Dados de audiência e finanças com origem e contexto.':
      'Datos de audiencia y finanzas con origen y contexto.',
    'A receita depende do programa, da conta e dos escopos concedidos. Nenhuma receita é presumida.':
      'Los ingresos dependen del programa, la cuenta y los alcances concedidos. No se supone ningún ingreso.',
    'Consultas ao provedor': 'Consultas al proveedor',
    'Snapshots preservados · Não somar contagens acumuladas':
      'Instantáneas conservadas · No sumes conteos acumulados',
    'Sem coleta registrada': 'Sin consultas registradas',
    'Histórico de dados': 'Historial de datos',
    'Conecte a conta e consulte suas métricas': 'Conecta la cuenta y consulta tus métricas',
    'Os dados disponíveis dependem das capacidades e permissões da API oficial de cada rede.':
      'Los datos disponibles dependen de las capacidades y permisos de la API oficial de cada red.',
    'Configurar conexão': 'Configurar conexión',
    'Seu registro financeiro': 'Tu registro financiero',
    'Custos registrados: {total}': 'Costos registrados: {total}',
    'Histórico financeiro': 'Historial financiero',
    'Registros manuais são identificados e não substituem extratos ou confirmação da plataforma.':
      'Los registros manuales se identifican y no sustituyen extractos ni la confirmación de la plataforma.',
    'Nenhum registro financeiro neste canal e rede': 'Ningún registro financiero en este canal y red',
    'Registre somente o que você conhece, indicando se é custo, estimativa ou pagamento.':
      'Registra solo lo que conoces, indicando si es costo, estimación o pago.',
    'Adicionar registro': 'Agregar registro',
    'Registrar um movimento': 'Registrar un movimiento',
    'Registro manual, associado à rede e ao canal selecionados.':
      'Registro manual, asociado a la red y al canal seleccionados.',
    'Custo realizado': 'Costo realizado',
    'Pagamento recebido — registro manual': 'Pago recibido — registro manual',
    'Salvar registro': 'Guardar registro',
    'Registro financeiro salvo com origem manual.': 'Registro financiero guardado con origen manual.',
    Rede: 'Red',
    Moeda: 'Moneda',
    'Código de três letras, como BRL ou USD.': 'Código de tres letras, como BRL o USD.',
    'Data do registro': 'Fecha del registro',
    'Início do período (opcional)': 'Inicio del período (opcional)',
    'Fim do período (opcional)': 'Fin del período (opcional)',
    'Origem, motivo e observações': 'Origen, motivo y observaciones',
    'Estimativa e pagamento são registros diferentes. Não informe uma previsão como dinheiro recebido; use as evidências da sua própria conta.':
      'La estimación y el pago son registros distintos. No registres una previsión como dinero recibido; usa la evidencia de tu propia cuenta.',
    'A Display API usada aqui fornece perfil e contadores, não comprovantes ou receita do Creator Rewards. Recebimentos exigem importação manual. Contadores de perfil/Página são instantâneos e não uma série de desempenho de 28 dias.':
      'La Display API usada aquí ofrece perfil y contadores, no comprobantes ni ingresos de Creator Rewards. Los cobros requieren importación manual. Los contadores de perfil/Página son instantáneos, no una serie de rendimiento de 28 días.',
    'Esta integração lê contadores da conta profissional; não implementa API de recebimentos do Instagram. Importe comprovantes manualmente. Contadores de perfil/Página são instantâneos e não uma série de desempenho de 28 dias.':
      'Esta integración lee los contadores de la cuenta profesional; no implementa una API de cobros de Instagram. Importa los comprobantes manualmente. Los contadores de perfil/Página son instantáneos, no una serie de rendimiento de 28 días.',
    'Esta integração lê contadores da Página e não integra receitas ou pagamentos. Importe comprovantes manualmente. Contadores de perfil/Página são instantâneos e não uma série de desempenho de 28 dias.':
      'Esta integración lee los contadores de la Página y no integra ingresos ni pagos. Importa los comprobantes manualmente. Los contadores de perfil/Página son instantáneos, no una serie de rendimiento de 28 días.',
    'Envio automático': 'Envío automático',
    'nunca público': 'nunca público',
    'Enviar cada versão final aprovada ao TikTok como "Somente eu" (exige o TikTok conectado com permissão de envio)':
      'Enviar cada versión final aprobada a TikTok como "Solo yo" (requiere TikTok conectado con permiso de subida)',
    'Enviar cada vídeo vertical aprovado ao Facebook como rascunho de Reel (exige a Página conectada com permissão de envio)':
      'Enviar cada video vertical aprobado a Facebook como borrador de Reel (requiere la Página conectada con permiso de subida)',
    'Autorize a conta correta em {provider}. O vínculo só será confirmado após o retorno ao servidor local.':
      'Autoriza la cuenta correcta en {provider}. El vínculo solo se confirma al volver al servidor local.',
    'Continuar em {provider}': 'Continuar en {provider}',
    'Autorização preparada. Continue pelo link de {provider}.':
      'Autorización preparada. Continúa por el enlace de {provider}.',
    'Callback a registrar no aplicativo: {url}': 'Callback que debes registrar en la app: {url}',
    'Use o aplicativo OAuth configurado para esta instalação. A autorização ocorre em {provider}; senhas da sua conta não são solicitadas aqui.':
      'Usa la app OAuth configurada para esta instalación. La autorización ocurre en {provider}; aquí nunca se piden las contraseñas de tu cuenta.',
    'Envio não público disponível': 'Subida no pública disponible',
    'Nome de usuário no TikTok': 'Nombre de usuario en TikTok',
    'ID da conta profissional do Instagram': 'ID de la cuenta profesional de Instagram',
    '@ do Instagram (ou ID da conta profissional)': '@ de Instagram (o ID de la cuenta profesional)',
    'ID da Página do Facebook': 'ID de la Página de Facebook',
    'Aplicativo próprio no TikTok for Developers, plataforma Web, com o endereço de retorno abaixo registrado exatamente.':
      'Tu propia app en TikTok for Developers, plataforma Web, con la URI de redirección de abajo registrada exactamente.',
    'Aplicativo próprio no TikTok for Developers, plataforma Desktop, com o callback local registrado exatamente.':
      'App propia en TikTok for Developers, plataforma Desktop, con el callback local registrado exactamente.',
    'Login Kit e Content Posting API (Direct Post): user.info.basic, user.info.profile, user.info.stats e video.publish.':
      'Login Kit y Content Posting API (Direct Post): user.info.basic, user.info.profile, user.info.stats y video.publish.',
    'Envio sempre como "Somente eu" (SELF_ONLY); a publicação é decisão do operador no app do TikTok.':
      'Siempre se sube como "Solo yo" (SELF_ONLY); publicar es decisión del operador en la app de TikTok.',
    'Aplicativo Meta próprio com Facebook Login e o callback local registrado; pages_show_list, pages_read_engagement e instagram_basic.':
      'App propia de Meta con Facebook Login y el callback local registrado; pages_show_list, pages_read_engagement e instagram_basic.',
    'Aplicativo Meta próprio com Facebook Login e o endereço de retorno abaixo registrado; pages_show_list, pages_read_engagement e instagram_basic.':
      'App propia de Meta con Facebook Login y la URI de redirección de abajo registrada; pages_show_list, pages_read_engagement e instagram_basic.',
    'Sem envio: a API de publicação do Instagram não tem rascunho nem modo privado, e publicar direto é decisão do operador no app.':
      'Sin subida: la API de publicación de Instagram no tiene borrador ni modo privado, y publicar directamente es decisión del operador en la app.',
    'Aplicativo Meta próprio com Facebook Login e o callback local registrado; o token salvo é o da Página, não de um perfil pessoal.':
      'App propia de Meta con Facebook Login y el callback local registrado; el token guardado es el de la Página, no el de un perfil personal.',
    'Aplicativo Meta próprio com Facebook Login e o endereço de retorno abaixo registrado; o token salvo é o da Página, não de um perfil pessoal.':
      'App propia de Meta con Facebook Login y la URI de redirección de abajo registrada; el token guardado es el de la Página, no el de un perfil personal.',
    'pages_show_list, pages_read_engagement e pages_manage_posts, com a aprovação exigida pela Meta.':
      'pages_show_list, pages_read_engagement y pages_manage_posts, con la aprobación que exige Meta.',
    'Envio sempre como rascunho de Reel (vídeo vertical); a publicação é decisão do operador no Meta Business Suite.':
      'Siempre se sube como borrador de Reel (video vertical); publicar es decisión del operador en Meta Business Suite.',
    'Publicar cada vídeo vertical aprovado no Instagram como Reel público, sem revisão na rede (exige a conta conectada com permissão de publicação)':
      'Publicar cada video vertical aprobado en Instagram como Reel público, sin revisión en la red (requiere la cuenta conectada con permiso de publicación)',
    público: 'público',
    'ID da configuração do Facebook Login for Business': 'ID de configuración de Facebook Login for Business',
    'Opcional. Sem ele, a Meta mostra a lista de Páginas e contas do Instagram para você marcar no login; use-o só se a sua configuração do Facebook Login for Business oferecer essa escolha.':
      'Opcional. Sin él, Meta muestra la lista de Páginas y cuentas de Instagram para marcar al iniciar sesión; úsalo solo si tu configuración de Facebook Login for Business ofrece esa opción.',
    'Opcional no Facebook; use a mesma configuração do Instagram se tiver uma.':
      'Opcional en Facebook; usa la misma configuración de Instagram si tienes una.',
    'Publicação pública direta': 'Publicación pública directa',
    'Aplicativo Meta próprio com Facebook Login for Business e o callback local registrado; a configuração pede pages_show_list, pages_read_engagement, instagram_basic e instagram_content_publish.':
      'App propia de Meta con Facebook Login for Business y el callback local registrado; la configuración pide pages_show_list, pages_read_engagement, instagram_basic e instagram_content_publish.',
    'Aplicativo Meta próprio com Facebook Login for Business e o endereço de retorno abaixo registrado; a configuração pede pages_show_list, pages_read_engagement, instagram_basic e instagram_content_publish.':
      'App propia de Meta con Facebook Login for Business y la URI de redirección de abajo registrada; la configuración pide pages_show_list, pages_read_engagement, instagram_basic e instagram_content_publish.',
    'Publicação pública direta como Reel (vídeo vertical): a API do Instagram não tem rascunho nem modo privado. Só sai a versão final aprovada no QA, por clique confirmado ou com o opt-in do canal.':
      'Publicación pública directa como Reel (video vertical): la API de Instagram no tiene borrador ni modo privado. Solo sale la versión final aprobada en el QA, con un clic confirmado o con el opt-in del canal.',
    '{language} · sem voz comercial': '{language} · sin voz comercial',
    'Voz do narrador': 'Voz del narrador',
    'Segue o idioma do canal ({language}).': 'Sigue el idioma del canal ({language}).',
    'Heart · feminina · EN-US': 'Heart · femenina · EN-US',
    'Bella · feminina · EN-US': 'Bella · femenina · EN-US',
    'Michael · masculina · EN-US': 'Michael · masculina · EN-US',
    'Dora · feminina · ES': 'Dora · femenina · ES',
    'Alex · masculina · ES': 'Alex · masculina · ES',
    'Santa · masculina · ES': 'Santa · masculina · ES',
  },
} satisfies AreaCatalog;
