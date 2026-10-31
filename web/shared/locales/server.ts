/** Messages the local server sends to the interface (HTTP errors and production status lines),
 * keyed by the pt-BR text with `{placeholders}` where the server interpolates values. */
import type { AreaCatalog } from './index.ts';

export default {
  en: {
    'A Meta não liberou nenhuma Página para o Studio e não concedeu business_management, sem a qual Páginas de um portfólio de empresa não aparecem (concedidas: {granted}). Conecte de novo aceitando todas as permissões; se usar o ID da configuração, inclua business_management nela.':
      'Meta granted no Page to the Studio and did not grant business_management, without which Pages of a business portfolio do not appear (granted: {granted}). Connect again accepting every permission; if you use the configuration ID, add business_management to it.',
    'O Instagram @{username} não está ligado a nenhuma Página autorizada. Contas encontradas: {found}.':
      'Instagram @{username} is not linked to any authorized Page. Accounts found: {found}.',
    'A Meta liberou a Página {pages}, mas ela não tem uma conta profissional do Instagram ligada. Ligue o Instagram a essa Página (perfil da Página → Configurações → Contas vinculadas → Instagram) e conecte de novo.':
      'Meta granted the Page {pages}, but it has no linked Instagram professional account. Link Instagram to that Page (Page profile → Settings → Linked accounts → Instagram) and connect again.',
    'A Meta não liberou nenhuma Página para o Studio, embora tenha concedido {granted}. Este perfil do Facebook não marcou nenhuma Página no login ou não administra uma. Remova o app em facebook.com/settings/?tab=business_tools, conecte de novo e, na tela da Meta, use Editar acesso para marcar a Página.':
      'Meta granted no Page to the Studio, although it granted {granted}. This Facebook profile selected no Page at login or manages none. Remove the app at facebook.com/settings/?tab=business_tools, connect again and, on the Meta screen, use Edit access to select the Page.',
    'A Meta não concedeu pages_show_list, sem a qual o Studio não vê nenhuma Página (concedidas: {granted}). Inclua pages_show_list, pages_read_engagement, business_management, instagram_basic e instagram_content_publish na configuração do Facebook Login for Business e conecte de novo sem desmarcar nenhuma.':
      'Meta did not grant pages_show_list, without which the Studio sees no Page (granted: {granted}). Add pages_show_list, pages_read_engagement, business_management, instagram_basic and instagram_content_publish to the Facebook Login for Business configuration and connect again without unchecking any.',
    'O armazenamento privado de consumo está indisponível ou é inválido. Preserve o histórico e verifique as permissões antes de tentar novamente.':
      'Private usage storage is unavailable or invalid. Keep the history and check the permissions before trying again.',
    'O registro de consumo contém campos, tokens, custo, canal, provedor ou modelo inválidos.':
      'The usage record has invalid fields, tokens, cost, channel, provider or model.',
    'O histórico de consumo atingiu o limite local. Preserve e arquive os registros antes de iniciar novas chamadas.':
      'The usage history reached its local limit. Keep and archive the records before starting new calls.',
    'Registro de consumo não encontrado.': 'Usage record not found.',
    'Este registro de consumo já foi concluído.': 'This usage record is already complete.',
    'Escolha um período de 1 a 90 dias.': 'Choose a period of 1 to 90 days.',
    'Escolha um modelo Claude da lista de modelos com preço conhecido.':
      'Choose a Claude model from the list of models with known pricing.',
    'O Claude retornou uma resposta incompleta ou incompatível. O resultado foi descartado; uma nova tentativa exige sua confirmação.':
      'Claude returned an incomplete or incompatible response. The result was discarded; a new attempt needs your confirmation.',
    'O pedido ao Claude tem parâmetros inválidos.': 'The request to Claude has invalid parameters.',
    'O pedido ao Claude excede o limite de contexto do assistente. Reduza o conteúdo antes de tentar novamente.':
      "The request to Claude exceeds the assistant's context limit. Shorten the content before trying again.",
    'A chave da API Claude está ausente ou tem formato inválido. Configure uma chave no cofre deste canal.':
      "The Claude API key is missing or malformed. Set up a key in this channel's vault.",
    'A Anthropic recusou a credencial ou o acesso ao modelo. Revise a chave e as permissões do canal no Console Claude.':
      "Anthropic rejected the credential or model access. Check the key and the channel's permissions in the Claude Console.",
    'A Anthropic atingiu um limite de uso. Confira os limites da conta e tente novamente quando estiverem disponíveis.':
      'Anthropic hit a usage limit. Check the account limits and try again once they are available.',
    'Caminho inválido.': 'Invalid path.',
    'Caminho não permitido.': 'Path not allowed.',
    'A operação local não pôde ser concluída.': 'The local operation could not be completed.',
    'Requisição entre sites não permitida.': 'Cross-site request not allowed.',
    'Origem obrigatória.': 'Origin required.',
    'Método não permitido.': 'Method not allowed.',
    'Rota local não encontrada.': 'Local route not found.',
    'A senha deve ter entre 12 e 256 caracteres.': 'The password must have 12 to 256 characters.',
    'O arquivo de autenticação local está inválido.': 'The local authentication file is invalid.',
    'Muitas sessões locais. Tente novamente mais tarde.': 'Too many local sessions. Try again later.',
    'Entre na sessão local para continuar.': 'Sign in to the local session to continue.',
    'Token CSRF inválido; atualize a sessão.': 'Invalid CSRF token; refresh the session.',
    'A senha local já foi configurada.': 'The local password is already set.',
    'Muitas tentativas de login; aguarde 15 minutos.': 'Too many sign-in attempts; wait 15 minutes.',
    'Configure a senha local primeiro.': 'Set the local password first.',
    'Senha local inválida.': 'Invalid local password.',
    'Opção de produção automática inválida.': 'Invalid automatic production option.',
    'Descreva o tema ou a orientação para a IA.': 'Describe the topic or the guidance for the AI.',
    'Escolha o formato do vídeo.': 'Choose the video format.',
    'Escolha uma pauta ou um roteiro como referência.': 'Choose a topic or a script as reference.',
    'Canal não encontrado.': 'Channel not found.',
    'A referência não pertence a este canal ou está arquivada.':
      'The reference does not belong to this channel or is archived.',
    'A estimativa de custo não está disponível.': 'The cost estimate is not available.',
    'A produção automática não está disponível.': 'Automatic production is not available.',
    'Calcule o custo e autorize esta produção antes de iniciar.':
      'Calculate the cost and authorize this production before starting.',
    'A IA não retornou um roteiro válido para este canal.':
      'The AI did not return a valid script for this channel.',
    'Campo inválido no contexto editorial. Confira os textos, fontes e opções do editor.':
      "Invalid field in the editorial context. Check the editor's texts, sources and options.",
    'O contexto do editor excede o limite de 32 KB. Reduza o texto antes de gerar; nenhum campo foi cortado.':
      'The editor context exceeds the 32 KB limit. Shorten the text before generating; no field was cut.',
    'A tarefa não corresponde ao contexto do editor.': 'The task does not match the editor context.',
    'A pauta vinculada não pertence a este canal.': 'The linked topic does not belong to this channel.',
    'O roteiro vinculado não pertence a este canal.': 'The linked script does not belong to this channel.',
    'O contexto com os vínculos excede o limite de 32 KB. Reduza o texto ou remova um vínculo antes de gerar.':
      'The context with its links exceeds the 32 KB limit. Shorten the text or remove a link before generating.',
    'O modelo devolveu uma resposta inválida ou fora do formato esperado. Revise o briefing antes de uma nova geração.':
      'The model returned an invalid response or one outside the expected format. Review the brief before generating again.',
    'Provedor de API inválido.': 'Invalid API provider.',
    'O registro de consumo não está disponível. Nenhuma nova chamada ao provedor foi iniciada.':
      'The usage log is not available. No new call to the provider was started.',
    'Adicione a chave da API {provider} deste canal em Avançado → Configurações → Assistente de criação.':
      "Add this channel's {provider} API key in Advanced → Settings → Creation assistant.",
    'Tarefa criativa inválida. Escolha pesquisa, roteiro ou storytelling.':
      'Invalid creative task. Choose research, script or storytelling.',
    'Descreva o pedido em 12 a 6.000 caracteres.': 'Describe the request in 12 to 6,000 characters.',
    'A inclusão de pesquisas revisadas deve ser uma escolha explícita.':
      'Including reviewed research must be an explicit choice.',
    'Formato editorial inválido.': 'Invalid editorial format.',
    'O formato de vídeo vale para roteiro e narrativa, não para pesquisa.':
      'The video format applies to scripts and narratives, not to research.',
    'O pedido completo excede o limite de contexto. Reduza textos/referências ou as instruções pessoais antes de gerar; o editor não foi cortado.':
      'The full request exceeds the context limit. Shorten texts/references or the personal instructions before generating; the editor was not cut.',
    'Modelo sem preço verificado.': 'Model without verified pricing.',
    'O Ollama local não respondeu. Inicie o serviço neste computador e desative seus recursos de nuvem.':
      'Local Ollama did not respond. Start the service on this computer and turn off its cloud features.',
    'Não foi possível consultar o Ollama local. Nenhuma alternativa em nuvem será utilizada.':
      'Could not reach local Ollama. No cloud fallback will be used.',
    'Desative a nuvem do Ollama (OLLAMA_NO_CLOUD=1) e reinicie o serviço antes de usar o prompt pessoal.':
      "Turn off Ollama's cloud (OLLAMA_NO_CLOUD=1) and restart the service before using the personal prompt.",
    'Informe uma chave válida da API {provider}, sem espaços ou quebras de linha.':
      'Enter a valid {provider} API key, without spaces or line breaks.',
    'O cofre local não está disponível.': 'The local vault is not available.',
    'Autorize o envio do pedido e das instruções ao provedor selecionado para calcular a estimativa.':
      'Authorize sending the request and instructions to the selected provider to calculate the estimate.',
    'Já existe um pedido em andamento. Aguarde a conclusão.':
      'A request is already in progress. Wait for it to finish.',
    'Já existe um rascunho em criação. Aguarde a conclusão antes de pedir outro.':
      'A draft is already being created. Wait for it to finish before asking for another.',
    'A resposta tentou reproduzir o prompt pessoal e foi descartada.':
      'The response tried to reproduce the personal prompt and was discarded.',
    'Calcule a estimativa e autorize o custo antes de gerar com o provedor selecionado.':
      'Calculate the estimate and authorize the cost before generating with the selected provider.',
    'Estimativa inválida para este canal ou sessão. Calcule e autorize novamente.':
      'Invalid estimate for this channel or session. Calculate and authorize again.',
    'A estimativa expirou ou o pedido mudou. Calcule e autorize novamente.':
      'The estimate expired or the request changed. Calculate and authorize again.',
    'O provedor mudou. Abra o assistente novamente antes de gerar.':
      'The provider changed. Open the assistant again before generating.',
    'Escolha em Configurações um modelo GGUF instalado no Ollama local. Modelos de nuvem não são aceitos.':
      'In Settings, choose a GGUF model installed in local Ollama. Cloud models are not accepted.',
    'O modelo selecionado não comprovou execução local. Escolha um modelo GGUF sem encaminhamento remoto.':
      'The selected model did not prove it runs locally. Choose a GGUF model without remote routing.',
    'A IA entregou {words} palavras de narração (cerca de {duration}) depois de {attempts} tentativas, e o formato {format} exige de {minDuration} a {maxDuration} ({minWords} a {maxWords} palavras). Nenhum roteiro foi salvo. Gere de novo ou escolha um modelo maior; para um Short de um vídeo longo já pronto, use Gerar Short no vídeo.':
      'The AI delivered {words} words of narration (about {duration}) after {attempts} attempts, and the {format} format needs {minDuration} to {maxDuration} ({minWords} to {maxWords} words). No script was saved. Generate again or choose a larger model; for a Short from a finished long video, use Generate Short on that video.',
    'Cofre criptografado indisponível ou inválido. Preserve os dados e confira a chave externa e as permissões; nenhum segredo foi salvo em texto puro.':
      'Encrypted vault unavailable or invalid. Keep the data and check the external key and permissions; no secret was saved in plain text.',
    'Campo inválido: {name}.': 'Invalid field: {name}.',
    'O objeto contém campos não permitidos.': 'The object has fields that are not allowed.',
    'O recurso pertence a outro canal.': 'The resource belongs to another channel.',
    'Use Content-Type application/json.': 'Use Content-Type application/json.',
    'O corpo da requisição excede o limite permitido.': 'The request body exceeds the allowed limit.',
    'JSON inválido.': 'Invalid JSON.',
    'Host local não permitido.': 'Local host not allowed.',
    'Origem não permitida.': 'Origin not allowed.',
    'Origem local obrigatória nesta operação.': 'This operation requires a local origin.',
    'Arquivo não encontrado.': 'File not found.',
    'Faixa de bytes inválida.': 'Invalid byte range.',
    'A interface ainda não foi compilada. Execute o build web local.':
      'The interface has not been built yet. Run the local web build.',
    'Escolha um modelo OpenAI com preço conhecido.': 'Choose an OpenAI model with known pricing.',
    'A OpenAI retornou uma resposta incompleta ou incompatível. O resultado foi descartado; uma nova tentativa exige sua confirmação.':
      'OpenAI returned an incomplete or incompatible response. The result was discarded; a new attempt needs your confirmation.',
    'O pedido à OpenAI tem parâmetros inválidos.': 'The request to OpenAI has invalid parameters.',
    'O pedido à OpenAI excede o limite de contexto do assistente. Reduza o conteúdo antes de tentar novamente.':
      "The request to OpenAI exceeds the assistant's context limit. Shorten the content before trying again.",
    'A chave da API OpenAI está ausente ou tem formato inválido. Configure uma chave no cofre deste canal.':
      "The OpenAI API key is missing or malformed. Set up a key in this channel's vault.",
    'A OpenAI recusou a credencial ou o acesso ao modelo. Revise a chave e as permissões do projeto na plataforma OpenAI.':
      'OpenAI rejected the credential or model access. Check the key and the project permissions on the OpenAI platform.',
    'A OpenAI atingiu um limite de uso. Confira os limites e créditos da conta antes de tentar novamente.':
      'OpenAI hit a usage limit. Check the account limits and credits before trying again.',
    'O armazenamento privado do prompt não está disponível ou contém vínculos inseguros.':
      'Private prompt storage is not available or has unsafe links.',
    'Escolha um nome de modelo local válido; modelos de nuvem não são aceitos.':
      'Choose a valid local model name; cloud models are not accepted.',
    'Escolha um provedor de IA disponível.': 'Choose an available AI provider.',
    'Escolha um modelo Claude disponível.': 'Choose an available Claude model.',
    'Escolha um modelo OpenAI disponível.': 'Choose an available OpenAI model.',
    'O limite de saída deve conter entre 512 e 8.192 tokens inteiros.':
      'The output limit must be a whole number from 512 to 8,192 tokens.',
    'O teto de custo por geração deve estar entre US$ 0,001 e US$ 5.':
      'The cost cap per generation must be between US$ 0.001 and US$ 5.',
    'A configuração aceita apenas preferências editoriais e opções de modelo; credenciais pertencem ao cofre.':
      'Settings accept only editorial preferences and model options; credentials belong in the vault.',
    'O prompt pessoal deve conter no máximo 20.000 caracteres, sem caracteres nulos.':
      'The personal prompt must have at most 20,000 characters, with no null characters.',
    'Filtro de consumo inválido. Escolha até 90 dias e um provedor disponível.':
      'Invalid usage filter. Choose up to 90 days and an available provider.',
    'O roteiro não pertence ao canal.': 'The script does not belong to the channel.',
    'Muitos assets.': 'Too many assets.',
    'ID de cena inválido.': 'Invalid scene ID.',
    'Opção de job inválida.': 'Invalid job option.',
    'Tipo de asset inválido.': 'Invalid asset type.',
    'Imagem não disponível neste canal.': 'Image not available in this channel.',
    'O corte de Shorts não está disponível.': 'Shorts cutting is not available.',
    'O envio ao YouTube não está disponível.': 'YouTube upload is not available.',
    'Arquivo não disponível.': 'File not available.',
    'Arquivo não disponível neste canal.': 'File not available in this channel.',
    'Recurso não encontrado neste canal.': 'Resource not found in this channel.',
    'Informe até seis termos de busca.': 'Enter up to six search terms.',
    'A pesquisa precisa de pelo menos dois caracteres.': 'The search needs at least two characters.',
    'O serviço retornou dados de outra conta.': 'The service returned data from another account.',
    'Rede incompatível.': 'Incompatible network.',
    'Escopos inválidos.': 'Invalid scopes.',
    'Motor local ainda não configurado.': 'Local engine not set up yet.',
    'O canal possui produção ou conexões; preserve o histórico e desconecte as contas antes de excluir.':
      'The channel has productions or connections; keep the history and disconnect the accounts before deleting.',
    'O canal possui conteúdo ou histórico; remova os vínculos antes de excluir.':
      'The channel has content or history; remove the links before deleting.',
    'O canal possui histórico de consumo de IA. Preserve o canal para manter a atribuição dos custos.':
      'The channel has AI usage history. Keep the channel to preserve cost attribution.',
    'Identificador inválido.': 'Invalid identifier.',
    'Índice local de produção inválido.': 'Invalid local production index.',
    'Confirme o cruzamento das fontes no roteiro antes de produzir.':
      'Confirm the source cross-check in the script before producing.',
    'Quantidade ou tamanho das cenas inválido.': 'Invalid number or size of scenes.',
    'Cena incompleta ou ID duplicado.': 'Incomplete scene or duplicate ID.',
    'Fonte incompleta ou URL insegura.': 'Incomplete source or unsafe URL.',
    'Resolva as alegações marcadas como contraditórias e use só URLs das fontes do roteiro.':
      "Resolve the claims marked as contradictory and use only URLs from the script's sources.",
    'Execução interrompida pelo encerramento do servidor. Crie um novo trabalho para retomar.':
      'Run interrupted because the server shut down. Create a new job to resume.',
    'Envio interrompido pelo encerramento do servidor. Envie novamente.':
      'Upload interrupted because the server shut down. Upload again.',
    'Motor Rust local disponível.': 'Local Rust engine available.',
    'Construa o motor com npm run engine:build antes de produzir.':
      'Build the engine with npm run engine:build before producing.',
    'Canal não cadastrado.': 'Channel not registered.',
    'Servidor encerrando.': 'Server shutting down.',
    'Roteiro não encontrado neste canal.': 'Script not found in this channel.',
    'Complete os títulos e as falas das cenas no roteiro antes de preparar os visuais.':
      'Fill in the scene titles and lines in the script before preparing the visuals.',
    'O plano visual excede 1 MB. Reduza o texto das cenas.':
      'The visual plan exceeds 1 MB. Shorten the scene text.',
    'Não foi possível criar os visuais locais. Confira os títulos e as falas das cenas e reconstrua o motor com npm run engine:build se necessário.':
      'Could not create the local visuals. Check the scene titles and lines, and rebuild the engine with npm run engine:build if needed.',
    'O motor retornou um plano visual inválido.': 'The engine returned an invalid visual plan.',
    'O motor Rust está desatualizado (respondeu {renderer}; esperado {expected}). Encerre o Studio e rode npm --prefix web start, que recompila o motor antes de subir.':
      'The Rust engine is outdated (it answered {renderer}; expected {expected}). Close Studio and run npm --prefix web start, which rebuilds the engine before starting.',
    'O motor retornou cenas visuais incompatíveis.': 'The engine returned incompatible visual scenes.',
    'O motor retornou um arquivo visual inválido. Reconstrua o motor local se necessário.':
      'The engine returned an invalid visual file. Rebuild the local engine if needed.',
    'O arquivo visual saiu da área permitida ou tem tamanho inválido.':
      'The visual file left the allowed area or has an invalid size.',
    'O motor não produziu uma imagem PNG válida.': 'The engine did not produce a valid PNG image.',
    'Nome de arquivo inválido.': 'Invalid file name.',
    'Declare tipo, licença, origem e restrições da mídia.':
      "Declare the media's type, license, origin and restrictions.",
    'Arquivo muito grande ou conteúdo inválido. Limite: 20 MB.':
      'File too large or invalid content. Limit: 20 MB.',
    'Tamanho de mídia inválido.': 'Invalid media size.',
    'O conteúdo do arquivo não corresponde ao formato declarado.':
      'The file content does not match the declared format.',
    'Opção de prévia inválida.': 'Invalid preview option.',
    'Selecione uma mídia deste canal para cada cena.': 'Select media from this channel for each scene.',
    'Mídia ausente ou pertencente a outro canal.': 'Media missing or belonging to another channel.',
    'O roteiro mudou ou este visual foi preparado para outra cena. Prepare os visuais novamente antes de gerar o vídeo.':
      'The script changed or this visual was prepared for another scene. Prepare the visuals again before generating the video.',
    'Aguardando o motor local.': 'Waiting for the local engine.',
    'O roteiro de referência não pertence a este canal.':
      'The reference script does not belong to this channel.',
    'Arquivos do narrador não encontrados: {files}. Confira os caminhos em Configurações; caminhos relativos partem da raiz do projeto.':
      'Narrator files not found: {files}. Check the paths in Settings; relative paths start at the project root.',
    'Produção com IA na fila.': 'AI production queued.',
    'A IA está desenvolvendo o roteiro.': 'The AI is writing the script.',
    'Produção interrompida pelo encerramento do servidor. O roteiro gerado foi preservado.':
      'Production interrupted because the server shut down. The generated script was kept.',
    'O roteiro gerado não pertence a este canal.': 'The generated script does not belong to this channel.',
    'Roteiro salvo. Preparando os visuais de todas as cenas.':
      'Script saved. Preparing the visuals for every scene.',
    'A preparação automática não entregou um visual para cada cena.':
      'Automatic preparation did not deliver a visual for every scene.',
    'A produção automática não foi concluída. Confira o roteiro salvo e a configuração do assistente antes de tentar novamente.':
      'Automatic production did not finish. Check the saved script and the assistant settings before trying again.',
    'Cortando o Short: abertura, fechamento e as cenas que mais prendem.':
      'Cutting the Short: opening, closing and the most gripping scenes.',
    'Motor motion: gerando a voz, animando as cenas e executando o QA local.':
      'Motion engine: generating the voice, animating the scenes and running local QA.',
    'Gerando a voz, montando as cenas com seus arquivos e executando o QA local.':
      'Generating the voice, building the scenes from your files and running local QA.',
    'A integridade de uma mídia mudou; produção bloqueada.':
      "A media file's integrity changed; production blocked.",
    'O motor não concluiu a entrada: {detail}': 'The engine did not finish the delivery: {detail}',
    'O motor não concluiu a entrada. Confira o diagnóstico e a configuração local.':
      'The engine did not finish the delivery. Check the diagnostics and the local settings.',
    'O motor bloqueou a entrega: {reasons}.': 'The engine blocked the delivery: {reasons}.',
    'O motor bloqueou a entrega. Confira o relatório de QA.':
      'The engine blocked the delivery. Check the QA report.',
    'Prévia gerada com marca de revisão. Assista e, se estiver bom, use Gerar versão final.':
      'Preview generated with a review watermark. Watch it and, if it looks good, use Generate final version.',
    'Entrega incompleta: confira o arquivo de vídeo e os relatórios de QA antes de criar um novo trabalho.':
      'Incomplete delivery: check the video file and the QA reports before creating a new job.',
    'Short pronto: QA técnico aprovado; a revisão editorial vem do vídeo de origem.':
      'Short ready: technical QA passed; the editorial review comes from the source video.',
    'Vídeo aprovado: QA técnico e editorial sem pendências.':
      'Video approved: technical and editorial QA with nothing pending.',
    'Vídeo produzido. Confira no relatório: {checks}.': 'Video produced. Check in the report: {checks}.',
    'Vídeo produzido. Confira no relatório: verificações pendentes.':
      'Video produced. Check the pending checks in the report.',
    'Falha na produção local.': 'Local production failed.',
    'Falha no envio ao YouTube.': 'YouTube upload failed.',
    'Produção não encontrada neste canal.': 'Production not found in this channel.',
    'Este vídeo já é um Short.': 'This video is already a Short.',
    'O Short sai de uma versão final aprovada feita pelo motor motion.':
      'A Short comes from an approved final version made by the motion engine.',
    'O storyboard deste vídeo não foi encontrado; gere a versão final novamente.':
      "This video's storyboard was not found; generate the final version again.",
    'Roteiro do vídeo de origem não encontrado.': 'Source video script not found.',
    'Na fila: corte do Short.': 'Queued: Short cut.',
    'Só a versão final aprovada no QA pode ser enviada ao YouTube.':
      'Only the final version that passed QA can be uploaded to YouTube.',
    'O envio deste vídeo já está em andamento.': "This video's upload is already in progress.",
    'Este vídeo já foi enviado ao YouTube.': 'This video was already uploaded to YouTube.',
    'Roteiro ou pacote de publicação ausente; gere a versão final novamente.':
      'Script or publishing package missing; generate the final version again.',
    'Produção interrompida pelo limite de tempo ou encerramento.':
      'Production interrupted by the time limit or shutdown.',
    'Não foi possível iniciar o motor Rust local.': 'Could not start the local Rust engine.',
    'Identificador de canal inválido.': 'Invalid channel identifier.',
    'Identidade da conta ou plataforma inválida.': 'Invalid account identity or platform.',
    'O YouTube não abriu a sessão de envio.': 'YouTube did not open the upload session.',
    'Sessão de envio fora do endpoint do YouTube.': 'Upload session outside the YouTube endpoint.',
    'Credencial ausente ou com formato inválido.': 'Credential missing or malformed.',
    'A API retornou métrica inválida.': 'The API returned an invalid metric.',
    'Métrica fora do limite numérico seguro.': 'Metric outside the safe numeric range.',
    'Endpoint não permitido.': 'Endpoint not allowed.',
    'Consulta recusada ou indisponível na API (HTTP {status}).':
      'Query rejected or unavailable in the API (HTTP {status}).',
    'Resposta da API excedeu o limite.': 'The API response exceeded the limit.',
    'Não foi possível consultar a API com segurança. Nenhum token ou detalhe privado foi registrado.':
      'Could not query the API safely. No token or private detail was logged.',
    'Resposta inválida da API.': 'Invalid API response.',
    'A plataforma recusou a consulta; confira token, escopos e permissões.':
      'The platform rejected the query; check the token, scopes and permissions.',
    'Token expirado. Conecte novamente.': 'Token expired. Connect again.',
    'Cliente OAuth protegido indisponível ou inválido. Configure novamente; nenhum segredo foi exposto.':
      'Protected OAuth client unavailable or invalid. Set it up again; no secret was exposed.',
    'O token não corresponde ao canal YouTube esperado.':
      'The token does not match the expected YouTube channel.',
    'O token não corresponde à conta TikTok esperada.':
      'The token does not match the expected TikTok account.',
    'Conta Instagram não encontrada nas Páginas autorizadas para este token.':
      'Instagram account not found in the Pages authorized for this token.',
    'A resposta não corresponde à conta Instagram esperada.':
      'The response does not match the expected Instagram account.',
    'Use um token da Página Facebook esperada, não de outro perfil ou Página.':
      'Use a token from the expected Facebook Page, not from another profile or Page.',
    'Identidade e escopos verificados pela API; isso não confirma monetização.':
      'Identity and scopes verified by the API; this does not confirm monetization.',
    'Identidade verificada; escopos não retornados por esta integração. Validade pode ter sido informada pelo operador.':
      'Identity verified; this integration does not return scopes. The expiry may have been entered by the operator.',
    'Credencial protegida inválida ou vinculada a outro canal/rede. Conecte novamente.':
      'Protected credential invalid or linked to another channel/network. Connect again.',
    'Não foi possível abrir a conexão no cofre do sistema. Nenhum segredo foi exposto.':
      'Could not open the connection in the system vault. No secret was exposed.',
    'Validade do token ausente, inválida ou expirada.': 'Token expiry missing, invalid or past.',
    'Callback OAuth inválido.': 'Invalid OAuth callback.',
    'OAuth exige callback de loopback local registrado exatamente no cliente Google.':
      'OAuth requires a local loopback callback registered exactly in the Google client.',
    'Há muitas autorizações pendentes. Aguarde a expiração.':
      'Too many pending authorizations. Wait for them to expire.',
    'Autorização OAuth ausente, expirada ou já utilizada. Inicie novamente.':
      'OAuth authorization missing, expired or already used. Start again.',
    'A configuração OAuth mudou; inicie novamente.': 'The OAuth settings changed; start again.',
    'Google não retornou um token válido.': 'Google did not return a valid token.',
    'Token emitido para outro aplicativo OAuth.': 'Token issued to another OAuth app.',
    'Conecte a conta desta rede antes de sincronizar.': "Connect this network's account before syncing.",
    'Cliente OAuth indisponível ou alterado; conecte novamente.':
      'OAuth client unavailable or changed; connect again.',
    'Google não retornou token renovado válido.': 'Google did not return a valid refreshed token.',
    'Token renovado pertence a outro aplicativo.': 'The refreshed token belongs to another app.',
    'Token expirado; conecte novamente esta conta.': 'Token expired; connect this account again.',
    'Rede inválida.': 'Invalid network.',
    'Receita fora do limite seguro.': 'Revenue outside the safe range.',
    'Pesquise entre 2 e 120 caracteres.': 'Search with 2 to 120 characters.',
    'O vídeo precisa de título para ser enviado.': 'The video needs a title to be uploaded.',
    'Arquivo de vídeo ausente; gere a versão final novamente.':
      'Video file missing; generate the final version again.',
    'Reconecte o YouTube em Contas conectadas para autorizar o envio de vídeos.':
      'Reconnect YouTube in Connected accounts to authorize video uploads.',
    'O YouTube recusou o envio (HTTP {status}); confira a quota e as permissões do projeto.':
      "YouTube rejected the upload (HTTP {status}); check the project's quota and permissions.",
    'O YouTube recusou o arquivo (HTTP {status}).': 'YouTube rejected the file (HTTP {status}).',
    'O YouTube não retornou o ID do vídeo enviado.': "YouTube did not return the uploaded video's ID.",
    'Não foi possível concluir o envio ao YouTube. Nenhum token ou detalhe privado foi registrado.':
      'Could not finish the YouTube upload. No token or private detail was logged.',
    'Um objeto JSON é obrigatório.': 'A JSON object is required.',
    'Número inválido: {name}.': 'Invalid number: {name}.',
    'Lista inválida: {name}.': 'Invalid list: {name}.',
    'O canal deve usar um identificador seguro com letras minúsculas, números e hífen.':
      'The channel must use a safe identifier with lowercase letters, numbers and hyphens.',
    'Data inválida: {name}.': 'Invalid date: {name}.',
    'Status editorial inválido.': 'Invalid editorial status.',
    'URL de fonte inválida.': 'Invalid source URL.',
    'A fonte deve usar uma URL pública HTTP(S), sem credenciais.':
      'The source must use a public HTTP(S) URL, without credentials.',
    'dryRun deve permanecer true e telemetry false.': 'dryRun must stay true and telemetry false.',
    'Motor de voz inválido.': 'Invalid voice engine.',
    'Perfil de renderização inválido.': 'Invalid render profile.',
    'asr.enabled deve ser booleano.': 'asr.enabled must be a boolean.',
    'Use um caminho local.': 'Use a local path.',
    'O identificador do canal não pode mudar.': 'The channel identifier cannot change.',
    'Idioma inválido.': 'Invalid language.',
    'O envio automático ao YouTube deve ser verdadeiro ou falso.':
      'Automatic YouTube upload must be true or false.',
    'O recurso pertence a outro canal ou identificador.':
      'The resource belongs to another channel or identifier.',
    'A pesquisa vinculada não pertence ao canal.': 'The linked research does not belong to the channel.',
    'ID de cena duplicado.': 'Duplicate scene ID.',
    'Status de alegação inválido.': 'Invalid claim status.',
    'A alegação usa fonte não documentada.': 'The claim uses an undocumented source.',
    'Formato ou declaração de checagem inválidos.': 'Invalid format or fact-check statement.',
    'O roteiro vinculado não pertence ao canal.': 'The linked script does not belong to the channel.',
    'Tipo ou origem do registro financeiro inválidos.': 'Invalid financial record type or origin.',
    'Moeda inválida.': 'Invalid currency.',
    'Período financeiro inválido.': 'Invalid financial period.',
    'Snapshot sem canal cadastrado.': 'Snapshot without a registered channel.',
    'Receita da plataforma inválida; pagamentos são importados separadamente.':
      'Invalid platform revenue; payments are imported separately.',
    'Receita indisponível deve permanecer desconhecida.': 'Unavailable revenue must stay unknown.',
    'Data do snapshot inválida.': 'Invalid snapshot date.',
    'Período do snapshot inválido.': 'Invalid snapshot period.',
    'Versão de armazenamento inválida.': 'Invalid storage version.',
    'Timestamp inválido.': 'Invalid timestamp.',
    'Canal duplicado.': 'Duplicate channel.',
    'Configuração sem canal.': 'Settings without a channel.',
    'Recurso duplicado.': 'Duplicate resource.',
    'O armazenamento local está inválido; preserve o arquivo para recuperação.':
      'Local storage is invalid; keep the file for recovery.',
    'Recurso não encontrado.': 'Resource not found.',
    'O recurso possui vínculos editoriais.': 'The resource has editorial links.',
    'Identidade de canal ou rede inválida para o cofre.':
      'Invalid channel or network identity for the vault.',
    'Cofre indisponível neste sistema. Configure um gerenciador de segredos suportado; não há fallback em texto puro.':
      'Vault unavailable on this system. Set up a supported secret manager; there is no plain-text fallback.',
    'O envio às redes não está disponível.': 'Uploading to the networks is not available.',
    'Envio automático inválido.': 'Invalid automatic upload.',
    'Esta rede não recebe envio automático.': 'This network does not take automatic uploads.',
    'Reconecte o {network} em Contas conectadas para autorizar o envio de vídeos.':
      'Reconnect {network} in Connected accounts to authorize video uploads.',
    'Não foi possível concluir o envio ao {network}. Nenhum token ou detalhe privado foi registrado.':
      'Could not finish the upload to {network}. No token or private detail was logged.',
    'Só a versão final aprovada no QA pode ser enviada ao {network}.':
      'Only the final version approved in QA can be sent to {network}.',
    'Este vídeo já foi enviado ao {network}.': 'This video was already uploaded to {network}.',
    'O {network} não recebe envio pelo Studio.': '{network} does not take uploads from the Studio.',
    'Falha no envio ao {network}.': 'Upload to {network} failed.',
    'A API do Instagram só publica direto, sem rascunho ou modo privado; envie pelo app do Instagram.':
      "Instagram's API only publishes directly, with no draft or private mode; post from the Instagram app.",
    'O Facebook recebe só vídeo vertical, como Reel; envie o Short deste vídeo.':
      "Facebook only takes vertical video, as a Reel; send this video's Short.",
    'O TikTok não oferece "Somente eu" para esta conta; nada foi enviado.':
      'TikTok does not offer "Only me" for this account; nothing was sent.',
    'Vídeo grande demais para o TikTok.': 'Video too large for TikTok.',
    'O TikTok não retornou o ID do envio.': 'TikTok did not return the upload ID.',
    'O TikTok recusou o arquivo (HTTP {status}).': 'TikTok rejected the file (HTTP {status}).',
    'O Facebook não retornou o ID do vídeo.': 'Facebook did not return the video ID.',
    'O Facebook recusou o arquivo (HTTP {status}).': 'Facebook rejected the file (HTTP {status}).',
    'O Facebook não confirmou o recebimento do arquivo.': 'Facebook did not confirm it received the file.',
    'O Facebook não confirmou o rascunho do Reel.': 'Facebook did not confirm the Reel draft.',
    'A plataforma não abriu a sessão de envio.': 'The platform did not open the upload session.',
    'Sessão de envio fora do endpoint da plataforma.': 'Upload session outside the platform endpoint.',
    'O TikTok não retornou um token válido.': 'TikTok did not return a valid token.',
    'A Meta não retornou um token válido.': 'Meta did not return a valid token.',
    'A Página Facebook esperada não está entre as Páginas autorizadas.':
      'The expected Facebook Page is not among the authorized Pages.',
    'OAuth exige callback de loopback local registrado exatamente no aplicativo do provedor.':
      "OAuth needs a local loopback callback registered exactly in the provider's app.",
    'O {network} recebe só vídeo vertical, como Reel; envie o Short deste vídeo.':
      "{network} only takes vertical video, as a Reel; send this video's Short.",
    'ID de configuração do Facebook Login for Business inválido.':
      'Invalid Facebook Login for Business configuration ID.',
    'O Instagram aceita Reels de até 300 MB.': 'Instagram takes Reels up to 300 MB.',
    'O Instagram não retornou o contêiner do Reel.': 'Instagram did not return the Reel container.',
    'O Instagram recusou o arquivo (HTTP {status}).': 'Instagram rejected the file (HTTP {status}).',
    'O Instagram não confirmou o recebimento do arquivo.': 'Instagram did not confirm it received the file.',
    'O Instagram recusou o vídeo ao processar; nada foi publicado.':
      'Instagram rejected the video while processing; nothing was published.',
    'O Instagram não terminou de processar o vídeo em 5 minutos; nada foi publicado. Tente de novo.':
      'Instagram did not finish processing the video within 5 minutes; nothing was published. Try again.',
    'O Instagram não retornou o ID da publicação.': 'Instagram did not return the post ID.',
    'Este vídeo já é vertical: ele mesmo segue como Short.':
      'This video is already vertical: it goes out as the Short itself.',
    'Este vídeo já tem um Short.': 'This video already has a Short.',
    'O {network} aceita até {max} MB; este vídeo tem {size} MB.':
      '{network} takes up to {max} MB; this video is {size} MB.',
    'O {network} aceita de {min} a {max} s; este vídeo tem {seconds} s.':
      '{network} takes {min} to {max} s; this video is {seconds} s.',
    'O {network} aceita até {max} s; este vídeo tem {seconds} s.':
      '{network} takes up to {max} s; this video is {seconds} s.',
    'O {network} aceita de {min} a {max} quadros por segundo; este vídeo tem {fps}.':
      '{network} takes {min} to {max} frames per second; this video has {fps}.',
    'A resolução {width}x{height} está fora do que o {network} aceita.':
      'The {width}x{height} resolution is outside what {network} takes.',
    'Esta conta do TikTok aceita até {max} s; este vídeo tem {seconds} s.':
      'This TikTok account takes up to {max} s; this video is {seconds} s.',
    'Não foi possível ler duração e resolução do vídeo; gere a versão final novamente.':
      "Couldn't read the video's duration and resolution; generate the final version again.",
    'Canal de origem não encontrado.': 'Source channel not found.',
    'O idioma {tag} deste canal não tem voz comercial. Use pt-BR, en-US ou es no cadastro do canal.':
      "This channel's language {tag} has no commercial voice. Use pt-BR, en-US or es in the channel settings.",
    'Voz sem aprovação comercial nesta instalação. Escolha uma voz Kokoro do catálogo (PT-BR, EN-US ou ES) em Configurações. Vozes Piper legadas estão bloqueadas.':
      'Voice without commercial approval in this installation. Choose a Kokoro voice from the catalog (PT-BR, EN-US or ES) in Settings. Legacy Piper voices are blocked.',
  },
  es: {
    'A Meta não liberou nenhuma Página para o Studio e não concedeu business_management, sem a qual Páginas de um portfólio de empresa não aparecem (concedidas: {granted}). Conecte de novo aceitando todas as permissões; se usar o ID da configuração, inclua business_management nela.':
      'Meta no autorizó ninguna Página para el Studio y no concedió business_management, sin la cual no aparecen las Páginas de un portafolio comercial (concedidos: {granted}). Conecta de nuevo aceptando todos los permisos; si usas el ID de configuración, incluye business_management en ella.',
    'O Instagram @{username} não está ligado a nenhuma Página autorizada. Contas encontradas: {found}.':
      'El Instagram @{username} no está vinculado a ninguna Página autorizada. Cuentas encontradas: {found}.',
    'A Meta liberou a Página {pages}, mas ela não tem uma conta profissional do Instagram ligada. Ligue o Instagram a essa Página (perfil da Página → Configurações → Contas vinculadas → Instagram) e conecte de novo.':
      'Meta autorizó la Página {pages}, pero no tiene una cuenta profesional de Instagram vinculada. Vincula Instagram a esa Página (perfil de la Página → Configuración → Cuentas vinculadas → Instagram) y conecta de nuevo.',
    'A Meta não liberou nenhuma Página para o Studio, embora tenha concedido {granted}. Este perfil do Facebook não marcou nenhuma Página no login ou não administra uma. Remova o app em facebook.com/settings/?tab=business_tools, conecte de novo e, na tela da Meta, use Editar acesso para marcar a Página.':
      'Meta no autorizó ninguna Página para el Studio, aunque concedió {granted}. Este perfil de Facebook no marcó ninguna Página al iniciar sesión o no administra ninguna. Elimina la app en facebook.com/settings/?tab=business_tools, conecta de nuevo y, en la pantalla de Meta, usa Editar acceso para marcar la Página.',
    'A Meta não concedeu pages_show_list, sem a qual o Studio não vê nenhuma Página (concedidas: {granted}). Inclua pages_show_list, pages_read_engagement, business_management, instagram_basic e instagram_content_publish na configuração do Facebook Login for Business e conecte de novo sem desmarcar nenhuma.':
      'Meta no concedió pages_show_list, sin la cual el Studio no ve ninguna Página (concedidos: {granted}). Incluye pages_show_list, pages_read_engagement, business_management, instagram_basic e instagram_content_publish en la configuración de Facebook Login for Business y conecta de nuevo sin desmarcar ninguno.',
    'O armazenamento privado de consumo está indisponível ou é inválido. Preserve o histórico e verifique as permissões antes de tentar novamente.':
      'El almacenamiento privado de consumo no está disponible o no es válido. Conserva el historial y revisa los permisos antes de volver a intentarlo.',
    'O registro de consumo contém campos, tokens, custo, canal, provedor ou modelo inválidos.':
      'El registro de consumo tiene campos, tokens, costo, canal, proveedor o modelo no válidos.',
    'O histórico de consumo atingiu o limite local. Preserve e arquive os registros antes de iniciar novas chamadas.':
      'El historial de consumo llegó al límite local. Conserva y archiva los registros antes de iniciar nuevas llamadas.',
    'Registro de consumo não encontrado.': 'No se encontró el registro de consumo.',
    'Este registro de consumo já foi concluído.': 'Este registro de consumo ya se completó.',
    'Escolha um período de 1 a 90 dias.': 'Elige un periodo de 1 a 90 días.',
    'Escolha um modelo Claude da lista de modelos com preço conhecido.':
      'Elige un modelo Claude de la lista de modelos con precio conocido.',
    'O Claude retornou uma resposta incompleta ou incompatível. O resultado foi descartado; uma nova tentativa exige sua confirmação.':
      'Claude devolvió una respuesta incompleta o incompatible. Se descartó el resultado; un nuevo intento requiere tu confirmación.',
    'O pedido ao Claude tem parâmetros inválidos.': 'La solicitud a Claude tiene parámetros no válidos.',
    'O pedido ao Claude excede o limite de contexto do assistente. Reduza o conteúdo antes de tentar novamente.':
      'La solicitud a Claude supera el límite de contexto del asistente. Reduce el contenido antes de volver a intentarlo.',
    'A chave da API Claude está ausente ou tem formato inválido. Configure uma chave no cofre deste canal.':
      'La clave de la API de Claude falta o tiene un formato no válido. Configura una clave en la bóveda de este canal.',
    'A Anthropic recusou a credencial ou o acesso ao modelo. Revise a chave e as permissões do canal no Console Claude.':
      'Anthropic rechazó la credencial o el acceso al modelo. Revisa la clave y los permisos del canal en la Consola de Claude.',
    'A Anthropic atingiu um limite de uso. Confira os limites da conta e tente novamente quando estiverem disponíveis.':
      'Anthropic alcanzó un límite de uso. Revisa los límites de la cuenta y vuelve a intentarlo cuando estén disponibles.',
    'Caminho inválido.': 'Ruta no válida.',
    'Caminho não permitido.': 'Ruta no permitida.',
    'A operação local não pôde ser concluída.': 'No se pudo completar la operación local.',
    'Requisição entre sites não permitida.': 'No se permiten solicitudes entre sitios.',
    'Origem obrigatória.': 'El origen es obligatorio.',
    'Método não permitido.': 'Método no permitido.',
    'Rota local não encontrada.': 'No se encontró la ruta local.',
    'A senha deve ter entre 12 e 256 caracteres.': 'La contraseña debe tener entre 12 y 256 caracteres.',
    'O arquivo de autenticação local está inválido.': 'El archivo de autenticación local no es válido.',
    'Muitas sessões locais. Tente novamente mais tarde.':
      'Demasiadas sesiones locales. Vuelve a intentarlo más tarde.',
    'Entre na sessão local para continuar.': 'Inicia sesión en la sesión local para continuar.',
    'Token CSRF inválido; atualize a sessão.': 'Token CSRF no válido; actualiza la sesión.',
    'A senha local já foi configurada.': 'La contraseña local ya está configurada.',
    'Muitas tentativas de login; aguarde 15 minutos.':
      'Demasiados intentos de inicio de sesión; espera 15 minutos.',
    'Configure a senha local primeiro.': 'Configura primero la contraseña local.',
    'Senha local inválida.': 'Contraseña local no válida.',
    'Opção de produção automática inválida.': 'Opción de producción automática no válida.',
    'Descreva o tema ou a orientação para a IA.': 'Describe el tema o las indicaciones para la IA.',
    'Escolha o formato do vídeo.': 'Elige el formato del video.',
    'Escolha uma pauta ou um roteiro como referência.': 'Elige un tema o un guion como referencia.',
    'Canal não encontrado.': 'No se encontró el canal.',
    'A referência não pertence a este canal ou está arquivada.':
      'La referencia no pertenece a este canal o está archivada.',
    'A estimativa de custo não está disponível.': 'La estimación de costo no está disponible.',
    'A produção automática não está disponível.': 'La producción automática no está disponible.',
    'Calcule o custo e autorize esta produção antes de iniciar.':
      'Calcula el costo y autoriza esta producción antes de iniciar.',
    'A IA não retornou um roteiro válido para este canal.':
      'La IA no devolvió un guion válido para este canal.',
    'Campo inválido no contexto editorial. Confira os textos, fontes e opções do editor.':
      'Campo no válido en el contexto editorial. Revisa los textos, las fuentes y las opciones del editor.',
    'O contexto do editor excede o limite de 32 KB. Reduza o texto antes de gerar; nenhum campo foi cortado.':
      'El contexto del editor supera el límite de 32 KB. Reduce el texto antes de generar; no se recortó ningún campo.',
    'A tarefa não corresponde ao contexto do editor.': 'La tarea no coincide con el contexto del editor.',
    'A pauta vinculada não pertence a este canal.': 'El tema vinculado no pertenece a este canal.',
    'O roteiro vinculado não pertence a este canal.': 'El guion vinculado no pertenece a este canal.',
    'O contexto com os vínculos excede o limite de 32 KB. Reduza o texto ou remova um vínculo antes de gerar.':
      'El contexto con los vínculos supera el límite de 32 KB. Reduce el texto o quita un vínculo antes de generar.',
    'O modelo devolveu uma resposta inválida ou fora do formato esperado. Revise o briefing antes de uma nova geração.':
      'El modelo devolvió una respuesta no válida o fuera del formato esperado. Revisa el briefing antes de volver a generar.',
    'Provedor de API inválido.': 'Proveedor de API no válido.',
    'O registro de consumo não está disponível. Nenhuma nova chamada ao provedor foi iniciada.':
      'El registro de consumo no está disponible. No se inició ninguna nueva llamada al proveedor.',
    'Adicione a chave da API {provider} deste canal em Avançado → Configurações → Assistente de criação.':
      'Agrega la clave de la API de {provider} de este canal en Avanzado → Configuración → Asistente de creación.',
    'Tarefa criativa inválida. Escolha pesquisa, roteiro ou storytelling.':
      'Tarea creativa no válida. Elige investigación, guion o storytelling.',
    'Descreva o pedido em 12 a 6.000 caracteres.': 'Describe la solicitud en 12 a 6.000 caracteres.',
    'A inclusão de pesquisas revisadas deve ser uma escolha explícita.':
      'Incluir investigaciones revisadas debe ser una elección explícita.',
    'Formato editorial inválido.': 'Formato editorial no válido.',
    'O formato de vídeo vale para roteiro e narrativa, não para pesquisa.':
      'El formato de video aplica a guiones y narrativas, no a investigaciones.',
    'O pedido completo excede o limite de contexto. Reduza textos/referências ou as instruções pessoais antes de gerar; o editor não foi cortado.':
      'La solicitud completa supera el límite de contexto. Reduce los textos/referencias o las instrucciones personales antes de generar; el editor no se recortó.',
    'Modelo sem preço verificado.': 'Modelo sin precio verificado.',
    'O Ollama local não respondeu. Inicie o serviço neste computador e desative seus recursos de nuvem.':
      'Ollama local no respondió. Inicia el servicio en esta computadora y desactiva sus funciones en la nube.',
    'Não foi possível consultar o Ollama local. Nenhuma alternativa em nuvem será utilizada.':
      'No se pudo consultar Ollama local. No se usará ninguna alternativa en la nube.',
    'Desative a nuvem do Ollama (OLLAMA_NO_CLOUD=1) e reinicie o serviço antes de usar o prompt pessoal.':
      'Desactiva la nube de Ollama (OLLAMA_NO_CLOUD=1) y reinicia el servicio antes de usar el prompt personal.',
    'Informe uma chave válida da API {provider}, sem espaços ou quebras de linha.':
      'Ingresa una clave válida de la API de {provider}, sin espacios ni saltos de línea.',
    'O cofre local não está disponível.': 'La bóveda local no está disponible.',
    'Autorize o envio do pedido e das instruções ao provedor selecionado para calcular a estimativa.':
      'Autoriza el envío de la solicitud y las instrucciones al proveedor seleccionado para calcular la estimación.',
    'Já existe um pedido em andamento. Aguarde a conclusão.':
      'Ya hay una solicitud en curso. Espera a que termine.',
    'Já existe um rascunho em criação. Aguarde a conclusão antes de pedir outro.':
      'Ya se está creando un borrador. Espera a que termine antes de pedir otro.',
    'A resposta tentou reproduzir o prompt pessoal e foi descartada.':
      'La respuesta intentó reproducir el prompt personal y se descartó.',
    'Calcule a estimativa e autorize o custo antes de gerar com o provedor selecionado.':
      'Calcula la estimación y autoriza el costo antes de generar con el proveedor seleccionado.',
    'Estimativa inválida para este canal ou sessão. Calcule e autorize novamente.':
      'Estimación no válida para este canal o sesión. Calcula y autoriza de nuevo.',
    'A estimativa expirou ou o pedido mudou. Calcule e autorize novamente.':
      'La estimación venció o la solicitud cambió. Calcula y autoriza de nuevo.',
    'O provedor mudou. Abra o assistente novamente antes de gerar.':
      'El proveedor cambió. Abre el asistente de nuevo antes de generar.',
    'Escolha em Configurações um modelo GGUF instalado no Ollama local. Modelos de nuvem não são aceitos.':
      'En Configuración, elige un modelo GGUF instalado en Ollama local. No se aceptan modelos en la nube.',
    'O modelo selecionado não comprovou execução local. Escolha um modelo GGUF sem encaminhamento remoto.':
      'El modelo seleccionado no comprobó que se ejecuta localmente. Elige un modelo GGUF sin enrutamiento remoto.',
    'A IA entregou {words} palavras de narração (cerca de {duration}) depois de {attempts} tentativas, e o formato {format} exige de {minDuration} a {maxDuration} ({minWords} a {maxWords} palavras). Nenhum roteiro foi salvo. Gere de novo ou escolha um modelo maior; para um Short de um vídeo longo já pronto, use Gerar Short no vídeo.':
      'La IA entregó {words} palabras de narración (cerca de {duration}) tras {attempts} intentos, y el formato {format} requiere de {minDuration} a {maxDuration} ({minWords} a {maxWords} palabras). No se guardó ningún guion. Genera de nuevo o elige un modelo más grande; para un Short de un video largo ya listo, usa Generar Short en ese video.',
    'Cofre criptografado indisponível ou inválido. Preserve os dados e confira a chave externa e as permissões; nenhum segredo foi salvo em texto puro.':
      'Bóveda cifrada no disponible o no válida. Conserva los datos y revisa la clave externa y los permisos; no se guardó ningún secreto en texto plano.',
    'Campo inválido: {name}.': 'Campo no válido: {name}.',
    'O objeto contém campos não permitidos.': 'El objeto tiene campos no permitidos.',
    'O recurso pertence a outro canal.': 'El recurso pertenece a otro canal.',
    'Use Content-Type application/json.': 'Usa Content-Type application/json.',
    'O corpo da requisição excede o limite permitido.':
      'El cuerpo de la solicitud supera el límite permitido.',
    'JSON inválido.': 'JSON no válido.',
    'Host local não permitido.': 'Host local no permitido.',
    'Origem não permitida.': 'Origen no permitido.',
    'Origem local obrigatória nesta operação.': 'Esta operación requiere un origen local.',
    'Arquivo não encontrado.': 'No se encontró el archivo.',
    'Faixa de bytes inválida.': 'Rango de bytes no válido.',
    'A interface ainda não foi compilada. Execute o build web local.':
      'La interfaz aún no se compiló. Ejecuta el build web local.',
    'Escolha um modelo OpenAI com preço conhecido.': 'Elige un modelo OpenAI con precio conocido.',
    'A OpenAI retornou uma resposta incompleta ou incompatível. O resultado foi descartado; uma nova tentativa exige sua confirmação.':
      'OpenAI devolvió una respuesta incompleta o incompatible. Se descartó el resultado; un nuevo intento requiere tu confirmación.',
    'O pedido à OpenAI tem parâmetros inválidos.': 'La solicitud a OpenAI tiene parámetros no válidos.',
    'O pedido à OpenAI excede o limite de contexto do assistente. Reduza o conteúdo antes de tentar novamente.':
      'La solicitud a OpenAI supera el límite de contexto del asistente. Reduce el contenido antes de volver a intentarlo.',
    'A chave da API OpenAI está ausente ou tem formato inválido. Configure uma chave no cofre deste canal.':
      'La clave de la API de OpenAI falta o tiene un formato no válido. Configura una clave en la bóveda de este canal.',
    'A OpenAI recusou a credencial ou o acesso ao modelo. Revise a chave e as permissões do projeto na plataforma OpenAI.':
      'OpenAI rechazó la credencial o el acceso al modelo. Revisa la clave y los permisos del proyecto en la plataforma de OpenAI.',
    'A OpenAI atingiu um limite de uso. Confira os limites e créditos da conta antes de tentar novamente.':
      'OpenAI alcanzó un límite de uso. Revisa los límites y créditos de la cuenta antes de volver a intentarlo.',
    'O armazenamento privado do prompt não está disponível ou contém vínculos inseguros.':
      'El almacenamiento privado del prompt no está disponible o tiene vínculos inseguros.',
    'Escolha um nome de modelo local válido; modelos de nuvem não são aceitos.':
      'Elige un nombre de modelo local válido; no se aceptan modelos en la nube.',
    'Escolha um provedor de IA disponível.': 'Elige un proveedor de IA disponible.',
    'Escolha um modelo Claude disponível.': 'Elige un modelo Claude disponible.',
    'Escolha um modelo OpenAI disponível.': 'Elige un modelo OpenAI disponible.',
    'O limite de saída deve conter entre 512 e 8.192 tokens inteiros.':
      'El límite de salida debe tener entre 512 y 8.192 tokens enteros.',
    'O teto de custo por geração deve estar entre US$ 0,001 e US$ 5.':
      'El tope de costo por generación debe estar entre US$ 0,001 y US$ 5.',
    'A configuração aceita apenas preferências editoriais e opções de modelo; credenciais pertencem ao cofre.':
      'La configuración solo acepta preferencias editoriales y opciones de modelo; las credenciales van en la bóveda.',
    'O prompt pessoal deve conter no máximo 20.000 caracteres, sem caracteres nulos.':
      'El prompt personal debe tener como máximo 20.000 caracteres, sin caracteres nulos.',
    'Filtro de consumo inválido. Escolha até 90 dias e um provedor disponível.':
      'Filtro de consumo no válido. Elige hasta 90 días y un proveedor disponible.',
    'O roteiro não pertence ao canal.': 'El guion no pertenece al canal.',
    'Muitos assets.': 'Demasiados recursos.',
    'ID de cena inválido.': 'ID de escena no válido.',
    'Opção de job inválida.': 'Opción de trabajo no válida.',
    'Tipo de asset inválido.': 'Tipo de recurso no válido.',
    'Imagem não disponível neste canal.': 'Imagen no disponible en este canal.',
    'O corte de Shorts não está disponível.': 'El corte de Shorts no está disponible.',
    'O envio ao YouTube não está disponível.': 'La subida a YouTube no está disponible.',
    'Arquivo não disponível.': 'Archivo no disponible.',
    'Arquivo não disponível neste canal.': 'Archivo no disponible en este canal.',
    'Recurso não encontrado neste canal.': 'No se encontró el recurso en este canal.',
    'Informe até seis termos de busca.': 'Ingresa hasta seis términos de búsqueda.',
    'A pesquisa precisa de pelo menos dois caracteres.': 'La búsqueda necesita al menos dos caracteres.',
    'O serviço retornou dados de outra conta.': 'El servicio devolvió datos de otra cuenta.',
    'Rede incompatível.': 'Red incompatible.',
    'Escopos inválidos.': 'Alcances no válidos.',
    'Motor local ainda não configurado.': 'El motor local aún no está configurado.',
    'O canal possui produção ou conexões; preserve o histórico e desconecte as contas antes de excluir.':
      'El canal tiene producciones o conexiones; conserva el historial y desconecta las cuentas antes de eliminarlo.',
    'O canal possui conteúdo ou histórico; remova os vínculos antes de excluir.':
      'El canal tiene contenido o historial; quita los vínculos antes de eliminarlo.',
    'O canal possui histórico de consumo de IA. Preserve o canal para manter a atribuição dos custos.':
      'El canal tiene historial de consumo de IA. Conserva el canal para mantener la atribución de costos.',
    'Identificador inválido.': 'Identificador no válido.',
    'Índice local de produção inválido.': 'Índice local de producción no válido.',
    'Confirme o cruzamento das fontes no roteiro antes de produzir.':
      'Confirma el cruce de fuentes en el guion antes de producir.',
    'Quantidade ou tamanho das cenas inválido.': 'Cantidad o tamaño de escenas no válido.',
    'Cena incompleta ou ID duplicado.': 'Escena incompleta o ID duplicado.',
    'Fonte incompleta ou URL insegura.': 'Fuente incompleta o URL insegura.',
    'Resolva as alegações marcadas como contraditórias e use só URLs das fontes do roteiro.':
      'Resuelve las afirmaciones marcadas como contradictorias y usa solo URL de las fuentes del guion.',
    'Execução interrompida pelo encerramento do servidor. Crie um novo trabalho para retomar.':
      'Ejecución interrumpida por el cierre del servidor. Crea un nuevo trabajo para retomarla.',
    'Envio interrompido pelo encerramento do servidor. Envie novamente.':
      'Subida interrumpida por el cierre del servidor. Vuelve a subirlo.',
    'Motor Rust local disponível.': 'Motor Rust local disponible.',
    'Construa o motor com npm run engine:build antes de produzir.':
      'Compila el motor con npm run engine:build antes de producir.',
    'Canal não cadastrado.': 'Canal no registrado.',
    'Servidor encerrando.': 'El servidor se está cerrando.',
    'Roteiro não encontrado neste canal.': 'No se encontró el guion en este canal.',
    'Complete os títulos e as falas das cenas no roteiro antes de preparar os visuais.':
      'Completa los títulos y los diálogos de las escenas en el guion antes de preparar los visuales.',
    'O plano visual excede 1 MB. Reduza o texto das cenas.':
      'El plan visual supera 1 MB. Reduce el texto de las escenas.',
    'Não foi possível criar os visuais locais. Confira os títulos e as falas das cenas e reconstrua o motor com npm run engine:build se necessário.':
      'No se pudieron crear los visuales locales. Revisa los títulos y los diálogos de las escenas y recompila el motor con npm run engine:build si es necesario.',
    'O motor retornou um plano visual inválido.': 'El motor devolvió un plan visual no válido.',
    'O motor Rust está desatualizado (respondeu {renderer}; esperado {expected}). Encerre o Studio e rode npm --prefix web start, que recompila o motor antes de subir.':
      'El motor Rust está desactualizado (respondió {renderer}; se esperaba {expected}). Cierra Studio y ejecuta npm --prefix web start, que recompila el motor antes de iniciar.',
    'O motor retornou cenas visuais incompatíveis.': 'El motor devolvió escenas visuales incompatibles.',
    'O motor retornou um arquivo visual inválido. Reconstrua o motor local se necessário.':
      'El motor devolvió un archivo visual no válido. Recompila el motor local si es necesario.',
    'O arquivo visual saiu da área permitida ou tem tamanho inválido.':
      'El archivo visual salió del área permitida o tiene un tamaño no válido.',
    'O motor não produziu uma imagem PNG válida.': 'El motor no produjo una imagen PNG válida.',
    'Nome de arquivo inválido.': 'Nombre de archivo no válido.',
    'Declare tipo, licença, origem e restrições da mídia.':
      'Declara el tipo, la licencia, el origen y las restricciones del medio.',
    'Arquivo muito grande ou conteúdo inválido. Limite: 20 MB.':
      'Archivo demasiado grande o contenido no válido. Límite: 20 MB.',
    'Tamanho de mídia inválido.': 'Tamaño de medio no válido.',
    'O conteúdo do arquivo não corresponde ao formato declarado.':
      'El contenido del archivo no coincide con el formato declarado.',
    'Opção de prévia inválida.': 'Opción de vista previa no válida.',
    'Selecione uma mídia deste canal para cada cena.': 'Selecciona un medio de este canal para cada escena.',
    'Mídia ausente ou pertencente a outro canal.': 'Medio ausente o perteneciente a otro canal.',
    'O roteiro mudou ou este visual foi preparado para outra cena. Prepare os visuais novamente antes de gerar o vídeo.':
      'El guion cambió o este visual se preparó para otra escena. Prepara los visuales de nuevo antes de generar el video.',
    'Aguardando o motor local.': 'Esperando el motor local.',
    'O roteiro de referência não pertence a este canal.': 'El guion de referencia no pertenece a este canal.',
    'Arquivos do narrador não encontrados: {files}. Confira os caminhos em Configurações; caminhos relativos partem da raiz do projeto.':
      'No se encontraron los archivos del narrador: {files}. Revisa las rutas en Configuración; las rutas relativas parten de la raíz del proyecto.',
    'Produção com IA na fila.': 'Producción con IA en cola.',
    'A IA está desenvolvendo o roteiro.': 'La IA está desarrollando el guion.',
    'Produção interrompida pelo encerramento do servidor. O roteiro gerado foi preservado.':
      'Producción interrumpida por el cierre del servidor. Se conservó el guion generado.',
    'O roteiro gerado não pertence a este canal.': 'El guion generado no pertenece a este canal.',
    'Roteiro salvo. Preparando os visuais de todas as cenas.':
      'Guion guardado. Preparando los visuales de todas las escenas.',
    'A preparação automática não entregou um visual para cada cena.':
      'La preparación automática no entregó un visual para cada escena.',
    'A produção automática não foi concluída. Confira o roteiro salvo e a configuração do assistente antes de tentar novamente.':
      'La producción automática no terminó. Revisa el guion guardado y la configuración del asistente antes de volver a intentarlo.',
    'Cortando o Short: abertura, fechamento e as cenas que mais prendem.':
      'Cortando el Short: apertura, cierre y las escenas que más atrapan.',
    'Motor motion: gerando a voz, animando as cenas e executando o QA local.':
      'Motor motion: generando la voz, animando las escenas y ejecutando el QA local.',
    'Gerando a voz, montando as cenas com seus arquivos e executando o QA local.':
      'Generando la voz, armando las escenas con tus archivos y ejecutando el QA local.',
    'A integridade de uma mídia mudou; produção bloqueada.':
      'La integridad de un medio cambió; producción bloqueada.',
    'O motor não concluiu a entrada: {detail}': 'El motor no completó la entrega: {detail}',
    'O motor não concluiu a entrada. Confira o diagnóstico e a configuração local.':
      'El motor no completó la entrega. Revisa el diagnóstico y la configuración local.',
    'O motor bloqueou a entrega: {reasons}.': 'El motor bloqueó la entrega: {reasons}.',
    'O motor bloqueou a entrega. Confira o relatório de QA.':
      'El motor bloqueó la entrega. Revisa el informe de QA.',
    'Prévia gerada com marca de revisão. Assista e, se estiver bom, use Gerar versão final.':
      'Vista previa generada con marca de revisión. Mírala y, si está bien, usa Generar versión final.',
    'Entrega incompleta: confira o arquivo de vídeo e os relatórios de QA antes de criar um novo trabalho.':
      'Entrega incompleta: revisa el archivo de video y los informes de QA antes de crear un nuevo trabajo.',
    'Short pronto: QA técnico aprovado; a revisão editorial vem do vídeo de origem.':
      'Short listo: QA técnico aprobado; la revisión editorial viene del video de origen.',
    'Vídeo aprovado: QA técnico e editorial sem pendências.':
      'Video aprobado: QA técnico y editorial sin pendientes.',
    'Vídeo produzido. Confira no relatório: {checks}.': 'Video producido. Revisa en el informe: {checks}.',
    'Vídeo produzido. Confira no relatório: verificações pendentes.':
      'Video producido. Revisa las verificaciones pendientes en el informe.',
    'Falha na produção local.': 'Falló la producción local.',
    'Falha no envio ao YouTube.': 'Falló la subida a YouTube.',
    'Produção não encontrada neste canal.': 'No se encontró la producción en este canal.',
    'Este vídeo já é um Short.': 'Este video ya es un Short.',
    'O Short sai de uma versão final aprovada feita pelo motor motion.':
      'El Short sale de una versión final aprobada hecha por el motor motion.',
    'O storyboard deste vídeo não foi encontrado; gere a versão final novamente.':
      'No se encontró el storyboard de este video; genera la versión final de nuevo.',
    'Roteiro do vídeo de origem não encontrado.': 'No se encontró el guion del video de origen.',
    'Na fila: corte do Short.': 'En cola: corte del Short.',
    'Só a versão final aprovada no QA pode ser enviada ao YouTube.':
      'Solo la versión final aprobada en QA se puede subir a YouTube.',
    'O envio deste vídeo já está em andamento.': 'La subida de este video ya está en curso.',
    'Este vídeo já foi enviado ao YouTube.': 'Este video ya se subió a YouTube.',
    'Roteiro ou pacote de publicação ausente; gere a versão final novamente.':
      'Falta el guion o el paquete de publicación; genera la versión final de nuevo.',
    'Produção interrompida pelo limite de tempo ou encerramento.':
      'Producción interrumpida por el límite de tiempo o el cierre.',
    'Não foi possível iniciar o motor Rust local.': 'No se pudo iniciar el motor Rust local.',
    'Identificador de canal inválido.': 'Identificador de canal no válido.',
    'Identidade da conta ou plataforma inválida.': 'Identidad de la cuenta o plataforma no válida.',
    'O YouTube não abriu a sessão de envio.': 'YouTube no abrió la sesión de subida.',
    'Sessão de envio fora do endpoint do YouTube.': 'Sesión de subida fuera del endpoint de YouTube.',
    'Credencial ausente ou com formato inválido.': 'Credencial ausente o con formato no válido.',
    'A API retornou métrica inválida.': 'La API devolvió una métrica no válida.',
    'Métrica fora do limite numérico seguro.': 'Métrica fuera del límite numérico seguro.',
    'Endpoint não permitido.': 'Endpoint no permitido.',
    'Consulta recusada ou indisponível na API (HTTP {status}).':
      'Consulta rechazada o no disponible en la API (HTTP {status}).',
    'Resposta da API excedeu o limite.': 'La respuesta de la API superó el límite.',
    'Não foi possível consultar a API com segurança. Nenhum token ou detalhe privado foi registrado.':
      'No se pudo consultar la API de forma segura. No se registró ningún token ni dato privado.',
    'Resposta inválida da API.': 'Respuesta de la API no válida.',
    'A plataforma recusou a consulta; confira token, escopos e permissões.':
      'La plataforma rechazó la consulta; revisa el token, los alcances y los permisos.',
    'Token expirado. Conecte novamente.': 'Token vencido. Conéctate de nuevo.',
    'Cliente OAuth protegido indisponível ou inválido. Configure novamente; nenhum segredo foi exposto.':
      'Cliente OAuth protegido no disponible o no válido. Configúralo de nuevo; no se expuso ningún secreto.',
    'O token não corresponde ao canal YouTube esperado.':
      'El token no coincide con el canal de YouTube esperado.',
    'O token não corresponde à conta TikTok esperada.':
      'El token no coincide con la cuenta de TikTok esperada.',
    'Conta Instagram não encontrada nas Páginas autorizadas para este token.':
      'No se encontró la cuenta de Instagram en las Páginas autorizadas para este token.',
    'A resposta não corresponde à conta Instagram esperada.':
      'La respuesta no coincide con la cuenta de Instagram esperada.',
    'Use um token da Página Facebook esperada, não de outro perfil ou Página.':
      'Usa un token de la Página de Facebook esperada, no de otro perfil o Página.',
    'Identidade e escopos verificados pela API; isso não confirma monetização.':
      'Identidad y alcances verificados por la API; esto no confirma la monetización.',
    'Identidade verificada; escopos não retornados por esta integração. Validade pode ter sido informada pelo operador.':
      'Identidad verificada; esta integración no devuelve alcances. La vigencia pudo haberla indicado el operador.',
    'Credencial protegida inválida ou vinculada a outro canal/rede. Conecte novamente.':
      'Credencial protegida no válida o vinculada a otro canal/red. Conéctate de nuevo.',
    'Não foi possível abrir a conexão no cofre do sistema. Nenhum segredo foi exposto.':
      'No se pudo abrir la conexión en la bóveda del sistema. No se expuso ningún secreto.',
    'Validade do token ausente, inválida ou expirada.': 'Vigencia del token ausente, no válida o vencida.',
    'Callback OAuth inválido.': 'Callback OAuth no válido.',
    'OAuth exige callback de loopback local registrado exatamente no cliente Google.':
      'OAuth requiere un callback de loopback local registrado exactamente en el cliente de Google.',
    'Há muitas autorizações pendentes. Aguarde a expiração.':
      'Hay demasiadas autorizaciones pendientes. Espera a que venzan.',
    'Autorização OAuth ausente, expirada ou já utilizada. Inicie novamente.':
      'Autorización OAuth ausente, vencida o ya utilizada. Empieza de nuevo.',
    'A configuração OAuth mudou; inicie novamente.': 'La configuración OAuth cambió; empieza de nuevo.',
    'Google não retornou um token válido.': 'Google no devolvió un token válido.',
    'Token emitido para outro aplicativo OAuth.': 'Token emitido para otra aplicación OAuth.',
    'Conecte a conta desta rede antes de sincronizar.': 'Conecta la cuenta de esta red antes de sincronizar.',
    'Cliente OAuth indisponível ou alterado; conecte novamente.':
      'Cliente OAuth no disponible o modificado; conéctate de nuevo.',
    'Google não retornou token renovado válido.': 'Google no devolvió un token renovado válido.',
    'Token renovado pertence a outro aplicativo.': 'El token renovado pertenece a otra aplicación.',
    'Token expirado; conecte novamente esta conta.': 'Token vencido; vuelve a conectar esta cuenta.',
    'Rede inválida.': 'Red no válida.',
    'Receita fora do limite seguro.': 'Ingresos fuera del límite seguro.',
    'Pesquise entre 2 e 120 caracteres.': 'Busca entre 2 y 120 caracteres.',
    'O vídeo precisa de título para ser enviado.': 'El video necesita un título para subirse.',
    'Arquivo de vídeo ausente; gere a versão final novamente.':
      'Falta el archivo de video; genera la versión final de nuevo.',
    'Reconecte o YouTube em Contas conectadas para autorizar o envio de vídeos.':
      'Vuelve a conectar YouTube en Cuentas conectadas para autorizar la subida de videos.',
    'O YouTube recusou o envio (HTTP {status}); confira a quota e as permissões do projeto.':
      'YouTube rechazó la subida (HTTP {status}); revisa la cuota y los permisos del proyecto.',
    'O YouTube recusou o arquivo (HTTP {status}).': 'YouTube rechazó el archivo (HTTP {status}).',
    'O YouTube não retornou o ID do vídeo enviado.': 'YouTube no devolvió el ID del video subido.',
    'Não foi possível concluir o envio ao YouTube. Nenhum token ou detalhe privado foi registrado.':
      'No se pudo completar la subida a YouTube. No se registró ningún token ni dato privado.',
    'Um objeto JSON é obrigatório.': 'Se requiere un objeto JSON.',
    'Número inválido: {name}.': 'Número no válido: {name}.',
    'Lista inválida: {name}.': 'Lista no válida: {name}.',
    'O canal deve usar um identificador seguro com letras minúsculas, números e hífen.':
      'El canal debe usar un identificador seguro con minúsculas, números y guiones.',
    'Data inválida: {name}.': 'Fecha no válida: {name}.',
    'Status editorial inválido.': 'Estado editorial no válido.',
    'URL de fonte inválida.': 'URL de fuente no válida.',
    'A fonte deve usar uma URL pública HTTP(S), sem credenciais.':
      'La fuente debe usar una URL pública HTTP(S), sin credenciales.',
    'dryRun deve permanecer true e telemetry false.': 'dryRun debe seguir en true y telemetry en false.',
    'Motor de voz inválido.': 'Motor de voz no válido.',
    'Perfil de renderização inválido.': 'Perfil de renderizado no válido.',
    'asr.enabled deve ser booleano.': 'asr.enabled debe ser booleano.',
    'Use um caminho local.': 'Usa una ruta local.',
    'O identificador do canal não pode mudar.': 'El identificador del canal no puede cambiar.',
    'Idioma inválido.': 'Idioma no válido.',
    'O envio automático ao YouTube deve ser verdadeiro ou falso.':
      'La subida automática a YouTube debe ser verdadera o falsa.',
    'O recurso pertence a outro canal ou identificador.':
      'El recurso pertenece a otro canal o identificador.',
    'A pesquisa vinculada não pertence ao canal.': 'La investigación vinculada no pertenece al canal.',
    'ID de cena duplicado.': 'ID de escena duplicado.',
    'Status de alegação inválido.': 'Estado de afirmación no válido.',
    'A alegação usa fonte não documentada.': 'La afirmación usa una fuente no documentada.',
    'Formato ou declaração de checagem inválidos.': 'Formato o declaración de verificación no válidos.',
    'O roteiro vinculado não pertence ao canal.': 'El guion vinculado no pertenece al canal.',
    'Tipo ou origem do registro financeiro inválidos.': 'Tipo u origen del registro financiero no válidos.',
    'Moeda inválida.': 'Moneda no válida.',
    'Período financeiro inválido.': 'Periodo financiero no válido.',
    'Snapshot sem canal cadastrado.': 'Snapshot sin canal registrado.',
    'Receita da plataforma inválida; pagamentos são importados separadamente.':
      'Ingresos de la plataforma no válidos; los pagos se importan por separado.',
    'Receita indisponível deve permanecer desconhecida.':
      'Los ingresos no disponibles deben seguir como desconocidos.',
    'Data do snapshot inválida.': 'Fecha del snapshot no válida.',
    'Período do snapshot inválido.': 'Periodo del snapshot no válido.',
    'Versão de armazenamento inválida.': 'Versión de almacenamiento no válida.',
    'Timestamp inválido.': 'Timestamp no válido.',
    'Canal duplicado.': 'Canal duplicado.',
    'Configuração sem canal.': 'Configuración sin canal.',
    'Recurso duplicado.': 'Recurso duplicado.',
    'O armazenamento local está inválido; preserve o arquivo para recuperação.':
      'El almacenamiento local no es válido; conserva el archivo para recuperarlo.',
    'Recurso não encontrado.': 'No se encontró el recurso.',
    'O recurso possui vínculos editoriais.': 'El recurso tiene vínculos editoriales.',
    'Identidade de canal ou rede inválida para o cofre.':
      'Identidad de canal o red no válida para la bóveda.',
    'Cofre indisponível neste sistema. Configure um gerenciador de segredos suportado; não há fallback em texto puro.':
      'Bóveda no disponible en este sistema. Configura un gestor de secretos compatible; no hay alternativa en texto plano.',
    'O envio às redes não está disponível.': 'La subida a las redes no está disponible.',
    'Envio automático inválido.': 'Subida automática no válida.',
    'Esta rede não recebe envio automático.': 'Esta red no recibe subidas automáticas.',
    'Reconecte o {network} em Contas conectadas para autorizar o envio de vídeos.':
      'Vuelve a conectar {network} en Cuentas conectadas para autorizar la subida de videos.',
    'Não foi possível concluir o envio ao {network}. Nenhum token ou detalhe privado foi registrado.':
      'No se pudo completar la subida a {network}. No se registró ningún token ni detalle privado.',
    'Só a versão final aprovada no QA pode ser enviada ao {network}.':
      'Solo la versión final aprobada en el QA puede enviarse a {network}.',
    'Este vídeo já foi enviado ao {network}.': 'Este video ya se subió a {network}.',
    'O {network} não recebe envio pelo Studio.': '{network} no recibe subidas desde el Studio.',
    'Falha no envio ao {network}.': 'Falló la subida a {network}.',
    'A API do Instagram só publica direto, sem rascunho ou modo privado; envie pelo app do Instagram.':
      'La API de Instagram solo publica directamente, sin borrador ni modo privado; publica desde la app de Instagram.',
    'O Facebook recebe só vídeo vertical, como Reel; envie o Short deste vídeo.':
      'Facebook solo recibe video vertical, como Reel; envía el Short de este video.',
    'O TikTok não oferece "Somente eu" para esta conta; nada foi enviado.':
      'TikTok no ofrece "Solo yo" para esta cuenta; no se envió nada.',
    'Vídeo grande demais para o TikTok.': 'Video demasiado grande para TikTok.',
    'O TikTok não retornou o ID do envio.': 'TikTok no devolvió el ID de la subida.',
    'O TikTok recusou o arquivo (HTTP {status}).': 'TikTok rechazó el archivo (HTTP {status}).',
    'O Facebook não retornou o ID do vídeo.': 'Facebook no devolvió el ID del video.',
    'O Facebook recusou o arquivo (HTTP {status}).': 'Facebook rechazó el archivo (HTTP {status}).',
    'O Facebook não confirmou o recebimento do arquivo.': 'Facebook no confirmó la recepción del archivo.',
    'O Facebook não confirmou o rascunho do Reel.': 'Facebook no confirmó el borrador del Reel.',
    'A plataforma não abriu a sessão de envio.': 'La plataforma no abrió la sesión de subida.',
    'Sessão de envio fora do endpoint da plataforma.':
      'Sesión de subida fuera del endpoint de la plataforma.',
    'O TikTok não retornou um token válido.': 'TikTok no devolvió un token válido.',
    'A Meta não retornou um token válido.': 'Meta no devolvió un token válido.',
    'A Página Facebook esperada não está entre as Páginas autorizadas.':
      'La Página de Facebook esperada no está entre las Páginas autorizadas.',
    'OAuth exige callback de loopback local registrado exatamente no aplicativo do provedor.':
      'OAuth exige un callback de loopback local registrado exactamente en la app del proveedor.',
    'O {network} recebe só vídeo vertical, como Reel; envie o Short deste vídeo.':
      '{network} solo recibe video vertical, como Reel; envía el Short de este video.',
    'ID de configuração do Facebook Login for Business inválido.':
      'ID de configuración de Facebook Login for Business no válido.',
    'O Instagram aceita Reels de até 300 MB.': 'Instagram acepta Reels de hasta 300 MB.',
    'O Instagram não retornou o contêiner do Reel.': 'Instagram no devolvió el contenedor del Reel.',
    'O Instagram recusou o arquivo (HTTP {status}).': 'Instagram rechazó el archivo (HTTP {status}).',
    'O Instagram não confirmou o recebimento do arquivo.': 'Instagram no confirmó la recepción del archivo.',
    'O Instagram recusou o vídeo ao processar; nada foi publicado.':
      'Instagram rechazó el video al procesarlo; no se publicó nada.',
    'O Instagram não terminou de processar o vídeo em 5 minutos; nada foi publicado. Tente de novo.':
      'Instagram no terminó de procesar el video en 5 minutos; no se publicó nada. Inténtalo de nuevo.',
    'O Instagram não retornou o ID da publicação.': 'Instagram no devolvió el ID de la publicación.',
    'Este vídeo já é vertical: ele mesmo segue como Short.':
      'Este video ya es vertical: él mismo sale como Short.',
    'Este vídeo já tem um Short.': 'Este video ya tiene un Short.',
    'O {network} aceita até {max} MB; este vídeo tem {size} MB.':
      '{network} acepta hasta {max} MB; este video tiene {size} MB.',
    'O {network} aceita de {min} a {max} s; este vídeo tem {seconds} s.':
      '{network} acepta de {min} a {max} s; este video dura {seconds} s.',
    'O {network} aceita até {max} s; este vídeo tem {seconds} s.':
      '{network} acepta hasta {max} s; este video dura {seconds} s.',
    'O {network} aceita de {min} a {max} quadros por segundo; este vídeo tem {fps}.':
      '{network} acepta de {min} a {max} cuadros por segundo; este video tiene {fps}.',
    'A resolução {width}x{height} está fora do que o {network} aceita.':
      'La resolución {width}x{height} está fuera de lo que acepta {network}.',
    'Esta conta do TikTok aceita até {max} s; este vídeo tem {seconds} s.':
      'Esta cuenta de TikTok acepta hasta {max} s; este video dura {seconds} s.',
    'Não foi possível ler duração e resolução do vídeo; gere a versão final novamente.':
      'No se pudieron leer la duración y la resolución del video; genera la versión final de nuevo.',
    'Canal de origem não encontrado.': 'Canal de origen no encontrado.',
    'O idioma {tag} deste canal não tem voz comercial. Use pt-BR, en-US ou es no cadastro do canal.':
      'El idioma {tag} de este canal no tiene voz comercial. Usa pt-BR, en-US o es en el registro del canal.',
    'Voz sem aprovação comercial nesta instalação. Escolha uma voz Kokoro do catálogo (PT-BR, EN-US ou ES) em Configurações. Vozes Piper legadas estão bloqueadas.':
      'Voz sin aprobación comercial en esta instalación. Elige una voz Kokoro del catálogo (PT-BR, EN-US o ES) en Configuración. Las voces Piper heredadas están bloqueadas.',
  },
} satisfies AreaCatalog;
