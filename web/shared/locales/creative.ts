import type { AreaCatalog } from './index.ts';

/** Creative assistant, automatic production dialog and AI usage ledger. */
export default {
  en: {
    // AI usage ledger
    'Em andamento': 'In progress',
    Concluída: 'Completed',
    'Resposta descartada': 'Response discarded',
    Falhou: 'Failed',
    'Sem confirmação': 'Unconfirmed',
    Pesquisa: 'Research',
    Roteiro: 'Script',
    Narrativa: 'Story',
    'Não informado': 'Not reported',
    'Data indisponível': 'Date unavailable',
    'Consumo no Studio': 'Studio usage',
    '{channel} · chamadas feitas pelo Framechester.': '{channel} · calls made by Framechester.',
    'Selecione um canal para consultar o consumo.': 'Select a channel to check usage.',
    'Últimos 7 dias': 'Last 7 days',
    'Últimos 30 dias': 'Last 30 days',
    'Últimos 90 dias': 'Last 90 days',
    'Todos os provedores': 'All providers',
    'Consulte o registro local deste canal.': "Check this channel's local log.",
    'Atualizar consumo': 'Refresh usage',
    'Consultando…': 'Checking…',
    'Consultando o registro local…': 'Checking the local log…',
    'O registro não corresponde a este canal. Atualize o consumo novamente.':
      "The log doesn't match this channel. Refresh usage again.",
    'Período: {from} a {to} (UTC).': 'Period: {from} to {to} (UTC).',
    'Não foi possível consultar o consumo.': "Couldn't check usage.",
    'Tente atualizar o registro local.': 'Try refreshing the local log.',
    'Nenhuma chamada registrada neste período. O histórico começa com as chamadas feitas pelo Studio após a ativação do monitoramento.':
      'No calls logged in this period. The history starts with calls the Studio made after monitoring was turned on.',
    Gerações: 'Generations',
    'Tokens de entrada reportados': 'Reported input tokens',
    'Tokens de resposta reportados': 'Reported output tokens',
    'Custo calculado (USD)': 'Calculated cost (USD)',
    'Concluídas: {succeeded} · Com falha ou resposta descartada: {failed} · Sem confirmação: {unknown}. Estimativas: {estimates}; os tokens dessas contagens não são somados às gerações.':
      'Completed: {succeeded} · Failed or response discarded: {failed} · Unconfirmed: {unknown}. Estimates: {estimates}; tokens from these counts are not added to generations.',
    'Cache de entrada informado: {cached} tokens, já incluídos na entrada. Raciocínio informado: {reasoning} tokens, já incluídos na resposta.':
      'Reported input cache: {cached} tokens, already included in input. Reported reasoning: {reasoning} tokens, already included in output.',
    '{count} geração sem custo confirmado. O total considera somente o uso informado; uma falha ou interrupção pode ter cobrança no provedor.':
      '{count} generation without a confirmed cost. The total only counts reported usage; a failure or interruption may still be billed by the provider.',
    '{count} gerações sem custo confirmado. O total considera somente o uso informado; uma falha ou interrupção pode ter cobrança no provedor.':
      '{count} generations without a confirmed cost. The total only counts reported usage; a failure or interruption may still be billed by the provider.',
    '{count} geração sem contagem de tokens. Campos não informados permanecem desconhecidos.':
      '{count} generation without a token count. Unreported fields stay unknown.',
    '{count} gerações sem contagem de tokens. Campos não informados permanecem desconhecidos.':
      '{count} generations without a token count. Unreported fields stay unknown.',
    'Por chave': 'By key',
    'Consumo por chave': 'Usage by key',
    'Provedor e identificação local': 'Provider and local ID',
    'Entrada / resposta': 'Input / output',
    'Custo calculado': 'Calculated cost',
    'Chave {id}': 'Key {id}',
    'A identificação é criada pelo Studio e não é um trecho da chave. A troca ou remoção de uma chave conserva seu histórico.':
      'The ID is created by the Studio and is not part of the key. Replacing or removing a key keeps its history.',
    'Chamadas recentes': 'Recent calls',
    'Início (UTC)': 'Start (UTC)',
    'Provedor e tarefa': 'Provider and task',
    Estado: 'Status',
    Estimativa: 'Estimate',
    'Até 100 chamadas recentes. Os totais usam todas as chamadas do período e os preços registrados na geração.':
      'Up to 100 recent calls. Totals use every call in the period and the prices recorded at generation time.',
    'Período do consumo': 'Usage period',
    'Provedor do consumo': 'Usage provider',
    'Este registro cobre somente o uso feito pelo Studio. Ele não representa o saldo da conta, a fatura oficial ou chamadas feitas por outros aplicativos. Assinatura do aplicativo e acesso/consumo da API seguem cobranças próprias. Consulte créditos no provedor.':
      "This log only covers usage by the Studio. It doesn't reflect your account balance, the official invoice or calls made by other apps. App subscriptions and API access/usage are billed separately. Check your credits with the provider.",
    'Consumo oficial OpenAI': 'Official OpenAI usage',
    'Consumo oficial Anthropic': 'Official Anthropic usage',

    // Automatic production
    'Novo vídeo': 'New video',
    'Canal: {channel}. Você manda a pauta e revisa o vídeo pronto.':
      'Channel: {channel}. You send the topic and review the finished video.',
    'Ex.: explique como esta skill ajuda a melhorar uma interface, com um exemplo hipotético.':
      'E.g.: explain how this skill helps improve an interface, with a hypothetical example.',
    'Curto · 65 a 90 segundos': 'Short · 65 to 90 seconds',
    'Longo · 7 a 12 minutos': 'Long · 7 to 12 minutes',
    'Começar pela orientação acima': 'Start from the brief above',
    'Roteiro: {title}': 'Script: {title}',
    'Pauta: {title}': 'Topic: {title}',
    'Consultando o assistente configurado…': 'Checking the configured assistant…',
    'Para calcular o custo, suas instruções pessoais, a orientação e as referências serão enviadas ao provedor configurado. A geração paga começa somente após sua autorização.':
      'To calculate the cost, your personal instructions, the brief and the references will be sent to the configured provider. Paid generation only starts after you authorize it.',
    'Autorizar e produzir': 'Authorize and produce',
    'Calcular custo da produção': 'Calculate production cost',
    'Produzir neste computador': 'Produce on this computer',
    'O canal mudou. Abra a produção novamente.': 'The channel changed. Open production again.',
    'Configure um assistente disponível antes de produzir.':
      'Set up an available assistant before producing.',
    'A estimativa não corresponde a este pedido. Calcule novamente.':
      "The estimate doesn't match this request. Calculate again.",
    'Roteiro com {model}: até {cost}, cobrindo até {attempts} gerações para cumprir a duração do formato. Limite configurado: {limit}.':
      "Script with {model}: up to {cost}, covering up to {attempts} generations to meet the format's duration. Configured limit: {limit}.",
    'Uma geração de roteiro com {model}: até {cost}. Limite configurado: {limit}.':
      'One script generation with {model}: up to {cost}. Configured limit: {limit}.',
    'Visuais, voz, montagem e QA seguem localmente, sem outras chamadas pagas de IA nesta produção.':
      'Visuals, voice, editing and QA run locally, with no other paid AI calls in this production.',
    'Confira o custo e autorize a produção completa.': 'Check the cost and authorize the full production.',
    'A estimativa expirou. Calcule novamente.': 'The estimate expired. Calculate again.',
    'Iniciando a sequência no servidor. Acompanhe as etapas na fila de produção.':
      'Starting the sequence on the server. Follow the steps in the production queue.',
    'Confira a fila e o consumo antes de repetir. A produção não será reenviada automaticamente.':
      "Check the queue and usage before retrying. The production won't be resubmitted automatically.",
    'Preparando produção…': 'Preparing production…',
    'Pedido alterado. Calcule novamente antes de autorizar.':
      'Request changed. Calculate again before authorizing.',
    'Configurar assistente': 'Set up assistant',
    'Mais opções': 'More options',
    'Referência do canal': 'Channel reference',
    'Roteiro → visuais → narração → montagem com legendas → QA → sua revisão.':
      'Script → visuals → narration → editing with captions → QA → your review.',
    'Abrir preparação manual': 'Open manual setup',
    'Sobre o que é o vídeo?': 'What is the video about?',
    'Uma ou duas frases. A IA escreve o roteiro; o motor monta cenas, voz e legendas.':
      'One or two sentences. The AI writes the script; the engine builds scenes, voice and captions.',
    Duração: 'Duration',
    'Sai como prévia para sua revisão; nada é publicado sem você.':
      'It comes out as a preview for your review; nothing is published without you.',
    'Assistente: {model}. Calcule o custo antes de autorizar.':
      'Assistant: {model}. Calculate the cost before authorizing.',
    'Assistente: {model}. A produção usa o modelo local configurado.':
      'Assistant: {model}. Production uses the configured local model.',
    'Não foi possível consultar o assistente.': "Couldn't reach the assistant.",

    // Creative assistant
    'Investigar um nicho': 'Investigate a niche',
    'Desenvolver um roteiro': 'Develop a script',
    'Construir uma narrativa': 'Build a story',
    'Descreva o público, a pergunta e o que você quer investigar. Peça hipóteses e um plano de apuração.':
      'Describe the audience, the question and what you want to investigate. Ask for hypotheses and a fact-finding plan.',
    'Informe a pergunta do vídeo, formato, duração e o que já foi apurado. Defina o tom e o que o roteiro deve entregar.':
      "Give the video's question, format, duration and what has been verified so far. Set the tone and what the script should deliver.",
    'Descreva a ideia central, o conflito e a descoberta que sustentam a história. Informe o público e a resposta que você pode demonstrar.':
      'Describe the core idea, the conflict and the discovery that carry the story. Give the audience and the answer you can demonstrate.',
    'Desenvolva esta hipótese a partir dos campos preenchidos e indique o que falta apurar.':
      'Develop this hypothesis from the filled-in fields and point out what still needs checking.',
    'Desenvolva o roteiro a partir dos campos, da pauta e das fontes fornecidas. Preserve o formato escolhido e explicite o que falta verificar.':
      'Develop the script from the fields, the topic and the sources provided. Keep the chosen format and spell out what still needs verifying.',
    'Desenvolva a narrativa a partir dos campos e do roteiro vinculado. Entregue a promessa e mantenha os limites das evidências.':
      'Develop the story from the fields and the linked script. Deliver on the promise and stay within the evidence.',
    Título: 'Title',
    Nicho: 'Niche',
    Público: 'Audience',
    'Hipótese de interesse': 'Interest hypothesis',
    'Contribuição original': 'Original contribution',
    'Palavras-chave': 'Keywords',
    'Fontes fornecidas': 'Sources provided',
    'Notas e próximos passos': 'Notes and next steps',
    Série: 'Series',
    Formato: 'Format',
    Gancho: 'Hook',
    Cenas: 'Scenes',
    Alegações: 'Claims',
    Contexto: 'Setup',
    Tensão: 'Tension',
    Descoberta: 'Discovery',
    Resolução: 'Resolution',
    'Próximo passo': 'Next step',
    'Referência: a pauta selecionada deste canal será incluída.':
      "Reference: this channel's selected topic will be included.",
    'Referência: o roteiro selecionado deste canal será incluído.':
      "Reference: this channel's selected script will be included.",
    Longo: 'Long',
    Curto: 'Short',
    '{heading}\nFala: {narration}\nVisual: {visual}\nDuração sugerida: {seconds}s':
      '{heading}\nNarration: {narration}\nVisual: {visual}\nSuggested duration: {seconds}s',
    '{title} — {publisher}\n{url}\nConsulta: {retrievedAt}. Condição de uso: {license}':
      '{title} — {publisher}\n{url}\nRetrieved: {retrievedAt}. Terms of use: {license}',
    '{text}\nEvidências: {sources}. Estado: {status}': '{text}\nEvidence: {sources}. Status: {status}',
    'Não fornecidas': 'None provided',
    'Assistente de criação': 'Creative assistant',
    'Modelos, direção criativa e consumo.': 'Models, creative direction and usage.',
    'Conecte Claude ou OpenAI para desenvolver pautas, roteiros e narrativas a partir do seu trabalho.':
      'Connect Claude or OpenAI to develop topics, scripts and stories from your work.',
    'Suas instruções ficam fora do Git. Cada geração por API exige confirmação; a proposta continua sendo um rascunho para revisão.':
      'Your instructions stay out of Git. Every API generation needs confirmation; the proposal remains a draft for review.',
    'Chave deste canal: {channel}. Modelo e direção criativa valem para esta instalação.':
      "This channel's key: {channel}. Model and creative direction apply to this installation.",
    'Selecione um canal para conectar sua chave. Modelo e direção criativa valem para esta instalação.':
      'Select a channel to connect your key. Model and creative direction apply to this installation.',
    'Carregando suas instruções…': 'Loading your instructions…',
    'Selecione um modelo local': 'Select a local model',
    'Claude · API Anthropic': 'Claude · Anthropic API',
    'OpenAI · API': 'OpenAI · API',
    'Ollama · neste computador': 'Ollama · on this computer',
    'Salvar preferências': 'Save preferences',
    'Preferências salvas. Elas serão usadas no próximo pedido.':
      'Preferences saved. They will be used on the next request.',
    'Modelo de IA local': 'Local AI model',
    'Use um modelo instalado no Ollama com licença compatível. Nenhum modelo é baixado automaticamente.':
      'Use a model installed in Ollama with a compatible license. No model is downloaded automatically.',
    'Modelo Claude': 'Claude model',
    'Modelo OpenAI': 'OpenAI model',
    'Limite da estimativa por geração (USD)': 'Estimate limit per generation (USD)',
    'Estimativas acima deste valor são bloqueadas. A cobrança final pode variar; confira também os controles de gasto no provedor.':
      "Estimates above this amount are blocked. The final charge may vary; also check the provider's spending controls.",
    'Máximo de tokens de resposta': 'Maximum output tokens',
    'Uma resposta mais longa pode custar mais. Respostas interrompidas são descartadas.':
      'A longer response may cost more. Interrupted responses are discarded.',
    'Ao calcular o custo, suas instruções, o perfil do canal e os campos usados no pedido são enviados à {provider}. A geração usa sua chave de API. Assinatura do aplicativo e acesso/consumo da API seguem cobranças próprias. Consulte créditos no provedor.':
      'When the cost is calculated, your instructions, the channel profile and the fields used in the request are sent to {provider}. Generation uses your API key. App subscriptions and API access/usage are billed separately. Check your credits with the provider.',
    Provedor: 'Provider',
    'Você pode salvar as preferências antes de conectar o assistente.':
      'You can save your preferences before connecting the assistant.',
    'Sua direção criativa': 'Your creative direction',
    'Defina estilo, público e limites. Não inclua senhas ou tokens. Estas preferências não concedem acesso a contas, arquivos ou ferramentas.':
      "Set style, audience and limits. Don't include passwords or tokens. These preferences don't grant access to accounts, files or tools.",
    'Chaves de API deste canal': "This channel's API keys",
    'Consultando o cofre local…': 'Checking the local vault…',
    'Remover chave': 'Remove key',
    'Nenhuma chave conectada a este canal para este provedor.':
      'No key connected to this channel for this provider.',
    'Não foi possível remover a chave.': "Couldn't remove the key.",
    'Salvar chave no cofre': 'Save key to vault',
    'Chave guardada no cofre local deste canal. Ela não é exibida novamente.':
      "Key stored in this channel's local vault. It won't be shown again.",
    'Chave de API deste canal': "This channel's API key",
    'Guardada no cofre do sistema operacional. Não entra no prompt, nas preferências nem no Git.':
      "Stored in the operating system's vault. It never goes into the prompt, preferences or Git.",
    'Provedor da chave': 'Key provider',
    'Há uma chave guardada para este canal e provedor. Preencha o campo apenas para substituí-la.':
      'A key is stored for this channel and provider. Fill in the field only to replace it.',
    'Não foi possível consultar o cofre. Você pode tentar salvar a chave novamente.':
      "Couldn't check the vault. You can try saving the key again.",
    'Selecione um canal no cabeçalho para conectar sua chave.':
      'Select a channel in the header to connect your key.',
    'Configuração do assistente': 'Assistant settings',
    'Modelo e direção': 'Model and direction',
    'Chave do canal': 'Channel key',
    Consumo: 'Usage',
    'Não foi possível carregar as instruções pessoais.': "Couldn't load your personal instructions.",
    '{channel} · rascunho para revisão': '{channel} · draft for review',
    'Consultando o assistente…': 'Checking the assistant…',
    'Calcular o custo envia à {provider} suas instruções pessoais, o perfil deste canal, os campos do editor e as referências selecionadas. A geração paga só começa após você conferir a estimativa e autorizar.':
      "Calculating the cost sends {provider} your personal instructions, this channel's profile, the editor fields and the selected references. Paid generation only starts after you check the estimate and authorize it.",
    'A proposta aparece aqui depois de gerar. Nenhum campo será alterado antes de você aplicar.':
      'The proposal appears here after generating. No field changes until you apply it.',
    'Rascunho gerado pela IA': 'AI-generated draft',
    'Rascunho · {model} · revisão pendente': 'Draft · {model} · review pending',
    '{input} tokens de entrada · {output} de resposta · custo calculado: {cost}. Confira a cobrança no provedor.':
      '{input} input tokens · {output} output · calculated cost: {cost}. Check the charge with the provider.',
    'Usar nos campos': 'Use in fields',
    'Abra novamente o editor nesta sessão.': 'Open the editor again in this session.',
    'Não foi possível preencher o editor.': "Couldn't fill in the editor.",
    'Copiar rascunho': 'Copy draft',
    'Autorizar e gerar': 'Authorize and generate',
    'Calcular custo': 'Calculate cost',
    'Gerar rascunho': 'Generate draft',
    'Calculando a estimativa na {provider}. A geração ainda não começou…':
      "Calculating the estimate with {provider}. Generation hasn't started yet…",
    'A estimativa não corresponde a este pedido. Calcule novamente antes de autorizar.':
      "The estimate doesn't match this request. Calculate again before authorizing.",
    'Confira antes de gerar': 'Check before generating',
    '{model} · {input} tokens de entrada · até {output} de resposta.':
      '{model} · {input} input tokens · up to {output} output.',
    'Estimativa máxima com margem: {cost}, cobrindo até {attempts} gerações para cumprir a duração. Limite configurado: {limit}.':
      'Maximum estimate with margin: {cost}, covering up to {attempts} generations to meet the duration. Configured limit: {limit}.',
    'Estimativa máxima com margem: {cost}. Limite configurado: {limit}.':
      'Maximum estimate with margin: {cost}. Configured limit: {limit}.',
    'Preços consultados em {date}. A cobrança final pode variar. A autorização vale para este pedido por até cinco minutos. Alterar o pedido exige novo cálculo.':
      'Prices checked on {date}. The final charge may vary. The authorization is valid for this request for up to five minutes. Changing the request requires a new calculation.',
    'Estimativa pronta. Confira os valores e use Autorizar e gerar para iniciar a chamada paga.':
      'Estimate ready. Check the amounts and use Authorize and generate to start the paid call.',
    'A estimativa expirou. Calcule novamente antes de autorizar a geração.':
      'The estimate expired. Calculate again before authorizing generation.',
    'Gerando a proposta com {provider}…': 'Generating the proposal with {provider}…',
    'Gerando a proposta no modelo local…': 'Generating the proposal with the local model…',
    'O rascunho não corresponde ao canal e à tarefa solicitados.':
      "The draft doesn't match the requested channel and task.",
    'A resposta não contém campos válidos para este editor. Nenhuma alteração foi aplicada.':
      'The response has no valid fields for this editor. No changes were applied.',
    'Proposta pronta para revisão. Aplicar preenche o editor, sem salvar.':
      'Proposal ready for review. Applying fills in the editor without saving.',
    'O pedido não foi concluído. Pode haver cobrança; confira o consumo na {provider} antes de tentar novamente.':
      "The request didn't complete. You may be charged; check your usage with {provider} before trying again.",
    'A geração não foi iniciada. Confira o erro e calcule novamente.':
      "Generation didn't start. Check the error and calculate again.",
    'A proposta não foi gerada. Confira o erro e tente novamente.':
      "The proposal wasn't generated. Check the error and try again.",
    'Calculando…': 'Calculating…',
    'Gerando…': 'Generating…',
    'Pedido alterado. Calcule o custo novamente antes de autorizar.':
      'Request changed. Calculate the cost again before authorizing.',
    'O que desenvolver?': 'What should it develop?',
    'O pedido usa os campos atuais do editor.': "The request uses the editor's current fields.",
    'Acrescentar outras pesquisas revisadas do canal': 'Add other reviewed research from the channel',
    'Opcional: até seis pesquisas. As referências não são verificadas automaticamente.':
      "Optional: up to six research items. References aren't verified automatically.",
    'Este pedido usa o perfil do canal e as instruções pessoais.':
      'This request uses the channel profile and your personal instructions.',
    Pedido: 'Request',
    'Dados usados': 'Data used',
    Proposta: 'Proposal',
    'Voltar ao editor': 'Back to editor',
    Fechar: 'Close',
    'Configure o modelo em Configurações → Assistente de criação. Você pode voltar e continuar escrevendo.':
      'Set up the model in Settings → Creative assistant. You can go back and keep writing.',
    '{provider}: {model}. Calcule a estimativa antes de autorizar a geração.':
      '{provider}: {model}. Calculate the estimate before authorizing generation.',
    'Modelo local: {model}. A geração começa ao enviar o pedido.':
      'Local model: {model}. Generation starts when you send the request.',
    'O assistente não respondeu.': "The assistant didn't respond.",
    'O assistente do canal {channel} não está disponível: {reason}':
      "The assistant for channel {channel} isn't available: {reason}",
    '{channel}: roteiro com {model}, até {cost} ({attempts} gerações no máximo).':
      '{channel}: script with {model}, up to {cost} ({attempts} generations at most).',
    'Total: até {cost}.': 'Total: up to {cost}.',
    falhou: 'failed',
    'Também em outros idiomas': 'Also in other languages',
    'A IA escreve cada versão direto no idioma do canal, com as mesmas fontes, e cada canal publica pelas próprias contas.':
      "The AI writes each version directly in the channel's language, with the same sources, and each channel publishes through its own accounts.",
  },
  es: {
    // AI usage ledger
    'Em andamento': 'En curso',
    Concluída: 'Completada',
    'Resposta descartada': 'Respuesta descartada',
    Falhou: 'Falló',
    'Sem confirmação': 'Sin confirmación',
    Pesquisa: 'Investigación',
    Roteiro: 'Guion',
    Narrativa: 'Narrativa',
    'Não informado': 'No informado',
    'Data indisponível': 'Fecha no disponible',
    'Consumo no Studio': 'Consumo en Studio',
    '{channel} · chamadas feitas pelo Framechester.': '{channel} · llamadas hechas por Framechester.',
    'Selecione um canal para consultar o consumo.': 'Selecciona un canal para consultar el consumo.',
    'Últimos 7 dias': 'Últimos 7 días',
    'Últimos 30 dias': 'Últimos 30 días',
    'Últimos 90 dias': 'Últimos 90 días',
    'Todos os provedores': 'Todos los proveedores',
    'Consulte o registro local deste canal.': 'Consulta el registro local de este canal.',
    'Atualizar consumo': 'Actualizar consumo',
    'Consultando…': 'Consultando…',
    'Consultando o registro local…': 'Consultando el registro local…',
    'O registro não corresponde a este canal. Atualize o consumo novamente.':
      'El registro no corresponde a este canal. Actualiza el consumo de nuevo.',
    'Período: {from} a {to} (UTC).': 'Período: {from} a {to} (UTC).',
    'Não foi possível consultar o consumo.': 'No se pudo consultar el consumo.',
    'Tente atualizar o registro local.': 'Intenta actualizar el registro local.',
    'Nenhuma chamada registrada neste período. O histórico começa com as chamadas feitas pelo Studio após a ativação do monitoramento.':
      'No hay llamadas registradas en este período. El historial empieza con las llamadas que hizo Studio después de activar el monitoreo.',
    Gerações: 'Generaciones',
    'Tokens de entrada reportados': 'Tokens de entrada reportados',
    'Tokens de resposta reportados': 'Tokens de respuesta reportados',
    'Custo calculado (USD)': 'Costo calculado (USD)',
    'Concluídas: {succeeded} · Com falha ou resposta descartada: {failed} · Sem confirmação: {unknown}. Estimativas: {estimates}; os tokens dessas contagens não são somados às gerações.':
      'Completadas: {succeeded} · Con falla o respuesta descartada: {failed} · Sin confirmación: {unknown}. Estimaciones: {estimates}; los tokens de esos conteos no se suman a las generaciones.',
    'Cache de entrada informado: {cached} tokens, já incluídos na entrada. Raciocínio informado: {reasoning} tokens, já incluídos na resposta.':
      'Caché de entrada informada: {cached} tokens, ya incluidos en la entrada. Razonamiento informado: {reasoning} tokens, ya incluidos en la respuesta.',
    '{count} geração sem custo confirmado. O total considera somente o uso informado; uma falha ou interrupção pode ter cobrança no provedor.':
      '{count} generación sin costo confirmado. El total solo considera el uso informado; una falla o interrupción puede generar un cobro en el proveedor.',
    '{count} gerações sem custo confirmado. O total considera somente o uso informado; uma falha ou interrupção pode ter cobrança no provedor.':
      '{count} generaciones sin costo confirmado. El total solo considera el uso informado; una falla o interrupción puede generar un cobro en el proveedor.',
    '{count} geração sem contagem de tokens. Campos não informados permanecem desconhecidos.':
      '{count} generación sin conteo de tokens. Los campos no informados siguen siendo desconocidos.',
    '{count} gerações sem contagem de tokens. Campos não informados permanecem desconhecidos.':
      '{count} generaciones sin conteo de tokens. Los campos no informados siguen siendo desconocidos.',
    'Por chave': 'Por clave',
    'Consumo por chave': 'Consumo por clave',
    'Provedor e identificação local': 'Proveedor e identificación local',
    'Entrada / resposta': 'Entrada / respuesta',
    'Custo calculado': 'Costo calculado',
    'Chave {id}': 'Clave {id}',
    'A identificação é criada pelo Studio e não é um trecho da chave. A troca ou remoção de uma chave conserva seu histórico.':
      'Studio crea la identificación y no es un fragmento de la clave. Cambiar o quitar una clave conserva su historial.',
    'Chamadas recentes': 'Llamadas recientes',
    'Início (UTC)': 'Inicio (UTC)',
    'Provedor e tarefa': 'Proveedor y tarea',
    Estado: 'Estado',
    Estimativa: 'Estimación',
    'Até 100 chamadas recentes. Os totais usam todas as chamadas do período e os preços registrados na geração.':
      'Hasta 100 llamadas recientes. Los totales usan todas las llamadas del período y los precios registrados en la generación.',
    'Período do consumo': 'Período del consumo',
    'Provedor do consumo': 'Proveedor del consumo',
    'Este registro cobre somente o uso feito pelo Studio. Ele não representa o saldo da conta, a fatura oficial ou chamadas feitas por outros aplicativos. Assinatura do aplicativo e acesso/consumo da API seguem cobranças próprias. Consulte créditos no provedor.':
      'Este registro solo cubre el uso hecho por Studio. No representa el saldo de la cuenta, la factura oficial ni llamadas hechas por otras aplicaciones. La suscripción de la aplicación y el acceso/consumo de la API se cobran por separado. Consulta los créditos en el proveedor.',
    'Consumo oficial OpenAI': 'Consumo oficial de OpenAI',
    'Consumo oficial Anthropic': 'Consumo oficial de Anthropic',

    // Automatic production
    'Novo vídeo': 'Nuevo video',
    'Canal: {channel}. Você manda a pauta e revisa o vídeo pronto.':
      'Canal: {channel}. Tú envías el tema y revisas el video terminado.',
    'Ex.: explique como esta skill ajuda a melhorar uma interface, com um exemplo hipotético.':
      'Ej.: explica cómo esta skill ayuda a mejorar una interfaz, con un ejemplo hipotético.',
    'Curto · 65 a 90 segundos': 'Corto · 65 a 90 segundos',
    'Longo · 7 a 12 minutos': 'Largo · 7 a 12 minutos',
    'Começar pela orientação acima': 'Empezar por la orientación de arriba',
    'Roteiro: {title}': 'Guion: {title}',
    'Pauta: {title}': 'Tema: {title}',
    'Consultando o assistente configurado…': 'Consultando el asistente configurado…',
    'Para calcular o custo, suas instruções pessoais, a orientação e as referências serão enviadas ao provedor configurado. A geração paga começa somente após sua autorização.':
      'Para calcular el costo, tus instrucciones personales, la orientación y las referencias se enviarán al proveedor configurado. La generación paga solo empieza después de tu autorización.',
    'Autorizar e produzir': 'Autorizar y producir',
    'Calcular custo da produção': 'Calcular costo de la producción',
    'Produzir neste computador': 'Producir en esta computadora',
    'O canal mudou. Abra a produção novamente.': 'El canal cambió. Abre la producción de nuevo.',
    'Configure um assistente disponível antes de produzir.':
      'Configura un asistente disponible antes de producir.',
    'A estimativa não corresponde a este pedido. Calcule novamente.':
      'La estimación no corresponde a este pedido. Calcula de nuevo.',
    'Roteiro com {model}: até {cost}, cobrindo até {attempts} gerações para cumprir a duração do formato. Limite configurado: {limit}.':
      'Guion con {model}: hasta {cost}, cubriendo hasta {attempts} generaciones para cumplir la duración del formato. Límite configurado: {limit}.',
    'Uma geração de roteiro com {model}: até {cost}. Limite configurado: {limit}.':
      'Una generación de guion con {model}: hasta {cost}. Límite configurado: {limit}.',
    'Visuais, voz, montagem e QA seguem localmente, sem outras chamadas pagas de IA nesta produção.':
      'Visuales, voz, montaje y QA se hacen localmente, sin otras llamadas pagas de IA en esta producción.',
    'Confira o custo e autorize a produção completa.': 'Revisa el costo y autoriza la producción completa.',
    'A estimativa expirou. Calcule novamente.': 'La estimación expiró. Calcula de nuevo.',
    'Iniciando a sequência no servidor. Acompanhe as etapas na fila de produção.':
      'Iniciando la secuencia en el servidor. Sigue las etapas en la cola de producción.',
    'Confira a fila e o consumo antes de repetir. A produção não será reenviada automaticamente.':
      'Revisa la cola y el consumo antes de repetir. La producción no se reenviará automáticamente.',
    'Preparando produção…': 'Preparando producción…',
    'Pedido alterado. Calcule novamente antes de autorizar.':
      'Pedido modificado. Calcula de nuevo antes de autorizar.',
    'Configurar assistente': 'Configurar asistente',
    'Mais opções': 'Más opciones',
    'Referência do canal': 'Referencia del canal',
    'Roteiro → visuais → narração → montagem com legendas → QA → sua revisão.':
      'Guion → visuales → narración → montaje con subtítulos → QA → tu revisión.',
    'Abrir preparação manual': 'Abrir preparación manual',
    'Sobre o que é o vídeo?': '¿De qué trata el video?',
    'Uma ou duas frases. A IA escreve o roteiro; o motor monta cenas, voz e legendas.':
      'Una o dos frases. La IA escribe el guion; el motor arma escenas, voz y subtítulos.',
    Duração: 'Duración',
    'Sai como prévia para sua revisão; nada é publicado sem você.':
      'Sale como vista previa para tu revisión; nada se publica sin ti.',
    'Assistente: {model}. Calcule o custo antes de autorizar.':
      'Asistente: {model}. Calcula el costo antes de autorizar.',
    'Assistente: {model}. A produção usa o modelo local configurado.':
      'Asistente: {model}. La producción usa el modelo local configurado.',
    'Não foi possível consultar o assistente.': 'No se pudo consultar el asistente.',

    // Creative assistant
    'Investigar um nicho': 'Investigar un nicho',
    'Desenvolver um roteiro': 'Desarrollar un guion',
    'Construir uma narrativa': 'Construir una narrativa',
    'Descreva o público, a pergunta e o que você quer investigar. Peça hipóteses e um plano de apuração.':
      'Describe el público, la pregunta y lo que quieres investigar. Pide hipótesis y un plan de verificación.',
    'Informe a pergunta do vídeo, formato, duração e o que já foi apurado. Defina o tom e o que o roteiro deve entregar.':
      'Indica la pregunta del video, formato, duración y lo que ya se verificó. Define el tono y lo que el guion debe entregar.',
    'Descreva a ideia central, o conflito e a descoberta que sustentam a história. Informe o público e a resposta que você pode demonstrar.':
      'Describe la idea central, el conflicto y el descubrimiento que sostienen la historia. Indica el público y la respuesta que puedes demostrar.',
    'Desenvolva esta hipótese a partir dos campos preenchidos e indique o que falta apurar.':
      'Desarrolla esta hipótesis a partir de los campos completados e indica lo que falta verificar.',
    'Desenvolva o roteiro a partir dos campos, da pauta e das fontes fornecidas. Preserve o formato escolhido e explicite o que falta verificar.':
      'Desarrolla el guion a partir de los campos, el tema y las fuentes proporcionadas. Conserva el formato elegido y explicita lo que falta verificar.',
    'Desenvolva a narrativa a partir dos campos e do roteiro vinculado. Entregue a promessa e mantenha os limites das evidências.':
      'Desarrolla la narrativa a partir de los campos y del guion vinculado. Cumple la promesa y respeta los límites de la evidencia.',
    Título: 'Título',
    Nicho: 'Nicho',
    Público: 'Público',
    'Hipótese de interesse': 'Hipótesis de interés',
    'Contribuição original': 'Aporte original',
    'Palavras-chave': 'Palabras clave',
    'Fontes fornecidas': 'Fuentes proporcionadas',
    'Notas e próximos passos': 'Notas y próximos pasos',
    Série: 'Serie',
    Formato: 'Formato',
    Gancho: 'Gancho',
    Cenas: 'Escenas',
    Alegações: 'Afirmaciones',
    Contexto: 'Contexto',
    Tensão: 'Tensión',
    Descoberta: 'Descubrimiento',
    Resolução: 'Resolución',
    'Próximo passo': 'Próximo paso',
    'Referência: a pauta selecionada deste canal será incluída.':
      'Referencia: se incluirá el tema seleccionado de este canal.',
    'Referência: o roteiro selecionado deste canal será incluído.':
      'Referencia: se incluirá el guion seleccionado de este canal.',
    Longo: 'Largo',
    Curto: 'Corto',
    '{heading}\nFala: {narration}\nVisual: {visual}\nDuração sugerida: {seconds}s':
      '{heading}\nNarración: {narration}\nVisual: {visual}\nDuración sugerida: {seconds}s',
    '{title} — {publisher}\n{url}\nConsulta: {retrievedAt}. Condição de uso: {license}':
      '{title} — {publisher}\n{url}\nConsulta: {retrievedAt}. Condición de uso: {license}',
    '{text}\nEvidências: {sources}. Estado: {status}': '{text}\nEvidencias: {sources}. Estado: {status}',
    'Não fornecidas': 'No proporcionadas',
    'Assistente de criação': 'Asistente de creación',
    'Modelos, direção criativa e consumo.': 'Modelos, dirección creativa y consumo.',
    'Conecte Claude ou OpenAI para desenvolver pautas, roteiros e narrativas a partir do seu trabalho.':
      'Conecta Claude u OpenAI para desarrollar temas, guiones y narrativas a partir de tu trabajo.',
    'Suas instruções ficam fora do Git. Cada geração por API exige confirmação; a proposta continua sendo um rascunho para revisão.':
      'Tus instrucciones quedan fuera de Git. Cada generación por API requiere confirmación; la propuesta sigue siendo un borrador para revisión.',
    'Chave deste canal: {channel}. Modelo e direção criativa valem para esta instalação.':
      'Clave de este canal: {channel}. El modelo y la dirección creativa valen para esta instalación.',
    'Selecione um canal para conectar sua chave. Modelo e direção criativa valem para esta instalação.':
      'Selecciona un canal para conectar tu clave. El modelo y la dirección creativa valen para esta instalación.',
    'Carregando suas instruções…': 'Cargando tus instrucciones…',
    'Selecione um modelo local': 'Selecciona un modelo local',
    'Claude · API Anthropic': 'Claude · API de Anthropic',
    'OpenAI · API': 'OpenAI · API',
    'Ollama · neste computador': 'Ollama · en esta computadora',
    'Salvar preferências': 'Guardar preferencias',
    'Preferências salvas. Elas serão usadas no próximo pedido.':
      'Preferencias guardadas. Se usarán en el próximo pedido.',
    'Modelo de IA local': 'Modelo de IA local',
    'Use um modelo instalado no Ollama com licença compatível. Nenhum modelo é baixado automaticamente.':
      'Usa un modelo instalado en Ollama con licencia compatible. No se descarga ningún modelo automáticamente.',
    'Modelo Claude': 'Modelo de Claude',
    'Modelo OpenAI': 'Modelo de OpenAI',
    'Limite da estimativa por geração (USD)': 'Límite de la estimación por generación (USD)',
    'Estimativas acima deste valor são bloqueadas. A cobrança final pode variar; confira também os controles de gasto no provedor.':
      'Las estimaciones por encima de este valor se bloquean. El cobro final puede variar; revisa también los controles de gasto en el proveedor.',
    'Máximo de tokens de resposta': 'Máximo de tokens de respuesta',
    'Uma resposta mais longa pode custar mais. Respostas interrompidas são descartadas.':
      'Una respuesta más larga puede costar más. Las respuestas interrumpidas se descartan.',
    'Ao calcular o custo, suas instruções, o perfil do canal e os campos usados no pedido são enviados à {provider}. A geração usa sua chave de API. Assinatura do aplicativo e acesso/consumo da API seguem cobranças próprias. Consulte créditos no provedor.':
      'Al calcular el costo, tus instrucciones, el perfil del canal y los campos usados en el pedido se envían a {provider}. La generación usa tu clave de API. La suscripción de la aplicación y el acceso/consumo de la API se cobran por separado. Consulta los créditos en el proveedor.',
    Provedor: 'Proveedor',
    'Você pode salvar as preferências antes de conectar o assistente.':
      'Puedes guardar las preferencias antes de conectar el asistente.',
    'Sua direção criativa': 'Tu dirección creativa',
    'Defina estilo, público e limites. Não inclua senhas ou tokens. Estas preferências não concedem acesso a contas, arquivos ou ferramentas.':
      'Define estilo, público y límites. No incluyas contraseñas ni tokens. Estas preferencias no dan acceso a cuentas, archivos ni herramientas.',
    'Chaves de API deste canal': 'Claves de API de este canal',
    'Consultando o cofre local…': 'Consultando la bóveda local…',
    'Remover chave': 'Quitar clave',
    'Nenhuma chave conectada a este canal para este provedor.':
      'No hay ninguna clave conectada a este canal para este proveedor.',
    'Não foi possível remover a chave.': 'No se pudo quitar la clave.',
    'Salvar chave no cofre': 'Guardar clave en la bóveda',
    'Chave guardada no cofre local deste canal. Ela não é exibida novamente.':
      'Clave guardada en la bóveda local de este canal. No se volverá a mostrar.',
    'Chave de API deste canal': 'Clave de API de este canal',
    'Guardada no cofre do sistema operacional. Não entra no prompt, nas preferências nem no Git.':
      'Se guarda en la bóveda del sistema operativo. No entra en el prompt, en las preferencias ni en Git.',
    'Provedor da chave': 'Proveedor de la clave',
    'Há uma chave guardada para este canal e provedor. Preencha o campo apenas para substituí-la.':
      'Hay una clave guardada para este canal y proveedor. Completa el campo solo para reemplazarla.',
    'Não foi possível consultar o cofre. Você pode tentar salvar a chave novamente.':
      'No se pudo consultar la bóveda. Puedes intentar guardar la clave de nuevo.',
    'Selecione um canal no cabeçalho para conectar sua chave.':
      'Selecciona un canal en el encabezado para conectar tu clave.',
    'Configuração do assistente': 'Configuración del asistente',
    'Modelo e direção': 'Modelo y dirección',
    'Chave do canal': 'Clave del canal',
    Consumo: 'Consumo',
    'Não foi possível carregar as instruções pessoais.':
      'No se pudieron cargar las instrucciones personales.',
    '{channel} · rascunho para revisão': '{channel} · borrador para revisión',
    'Consultando o assistente…': 'Consultando el asistente…',
    'Calcular o custo envia à {provider} suas instruções pessoais, o perfil deste canal, os campos do editor e as referências selecionadas. A geração paga só começa após você conferir a estimativa e autorizar.':
      'Calcular el costo envía a {provider} tus instrucciones personales, el perfil de este canal, los campos del editor y las referencias seleccionadas. La generación paga solo empieza después de que revises la estimación y la autorices.',
    'A proposta aparece aqui depois de gerar. Nenhum campo será alterado antes de você aplicar.':
      'La propuesta aparece aquí después de generarla. Ningún campo cambiará antes de que la apliques.',
    'Rascunho gerado pela IA': 'Borrador generado por la IA',
    'Rascunho · {model} · revisão pendente': 'Borrador · {model} · revisión pendiente',
    '{input} tokens de entrada · {output} de resposta · custo calculado: {cost}. Confira a cobrança no provedor.':
      '{input} tokens de entrada · {output} de respuesta · costo calculado: {cost}. Revisa el cobro en el proveedor.',
    'Usar nos campos': 'Usar en los campos',
    'Abra novamente o editor nesta sessão.': 'Abre el editor de nuevo en esta sesión.',
    'Não foi possível preencher o editor.': 'No se pudo completar el editor.',
    'Copiar rascunho': 'Copiar borrador',
    'Autorizar e gerar': 'Autorizar y generar',
    'Calcular custo': 'Calcular costo',
    'Gerar rascunho': 'Generar borrador',
    'Calculando a estimativa na {provider}. A geração ainda não começou…':
      'Calculando la estimación en {provider}. La generación aún no empezó…',
    'A estimativa não corresponde a este pedido. Calcule novamente antes de autorizar.':
      'La estimación no corresponde a este pedido. Calcula de nuevo antes de autorizar.',
    'Confira antes de gerar': 'Revisa antes de generar',
    '{model} · {input} tokens de entrada · até {output} de resposta.':
      '{model} · {input} tokens de entrada · hasta {output} de respuesta.',
    'Estimativa máxima com margem: {cost}, cobrindo até {attempts} gerações para cumprir a duração. Limite configurado: {limit}.':
      'Estimación máxima con margen: {cost}, cubriendo hasta {attempts} generaciones para cumplir la duración. Límite configurado: {limit}.',
    'Estimativa máxima com margem: {cost}. Limite configurado: {limit}.':
      'Estimación máxima con margen: {cost}. Límite configurado: {limit}.',
    'Preços consultados em {date}. A cobrança final pode variar. A autorização vale para este pedido por até cinco minutos. Alterar o pedido exige novo cálculo.':
      'Precios consultados el {date}. El cobro final puede variar. La autorización vale para este pedido por hasta cinco minutos. Cambiar el pedido requiere un nuevo cálculo.',
    'Estimativa pronta. Confira os valores e use Autorizar e gerar para iniciar a chamada paga.':
      'Estimación lista. Revisa los valores y usa Autorizar y generar para iniciar la llamada paga.',
    'A estimativa expirou. Calcule novamente antes de autorizar a geração.':
      'La estimación expiró. Calcula de nuevo antes de autorizar la generación.',
    'Gerando a proposta com {provider}…': 'Generando la propuesta con {provider}…',
    'Gerando a proposta no modelo local…': 'Generando la propuesta con el modelo local…',
    'O rascunho não corresponde ao canal e à tarefa solicitados.':
      'El borrador no corresponde al canal ni a la tarea solicitados.',
    'A resposta não contém campos válidos para este editor. Nenhuma alteração foi aplicada.':
      'La respuesta no contiene campos válidos para este editor. No se aplicó ningún cambio.',
    'Proposta pronta para revisão. Aplicar preenche o editor, sem salvar.':
      'Propuesta lista para revisión. Aplicar completa el editor, sin guardar.',
    'O pedido não foi concluído. Pode haver cobrança; confira o consumo na {provider} antes de tentar novamente.':
      'El pedido no se completó. Puede haber un cobro; revisa el consumo en {provider} antes de intentarlo de nuevo.',
    'A geração não foi iniciada. Confira o erro e calcule novamente.':
      'La generación no se inició. Revisa el error y calcula de nuevo.',
    'A proposta não foi gerada. Confira o erro e tente novamente.':
      'La propuesta no se generó. Revisa el error e inténtalo de nuevo.',
    'Calculando…': 'Calculando…',
    'Gerando…': 'Generando…',
    'Pedido alterado. Calcule o custo novamente antes de autorizar.':
      'Pedido modificado. Calcula el costo de nuevo antes de autorizar.',
    'O que desenvolver?': '¿Qué desarrollar?',
    'O pedido usa os campos atuais do editor.': 'El pedido usa los campos actuales del editor.',
    'Acrescentar outras pesquisas revisadas do canal': 'Agregar otras investigaciones revisadas del canal',
    'Opcional: até seis pesquisas. As referências não são verificadas automaticamente.':
      'Opcional: hasta seis investigaciones. Las referencias no se verifican automáticamente.',
    'Este pedido usa o perfil do canal e as instruções pessoais.':
      'Este pedido usa el perfil del canal y tus instrucciones personales.',
    Pedido: 'Pedido',
    'Dados usados': 'Datos usados',
    Proposta: 'Propuesta',
    'Voltar ao editor': 'Volver al editor',
    Fechar: 'Cerrar',
    'Configure o modelo em Configurações → Assistente de criação. Você pode voltar e continuar escrevendo.':
      'Configura el modelo en Configuración → Asistente de creación. Puedes volver y seguir escribiendo.',
    '{provider}: {model}. Calcule a estimativa antes de autorizar a geração.':
      '{provider}: {model}. Calcula la estimación antes de autorizar la generación.',
    'Modelo local: {model}. A geração começa ao enviar o pedido.':
      'Modelo local: {model}. La generación empieza al enviar el pedido.',
    'O assistente não respondeu.': 'El asistente no respondió.',
    'O assistente do canal {channel} não está disponível: {reason}':
      'El asistente del canal {channel} no está disponible: {reason}',
    '{channel}: roteiro com {model}, até {cost} ({attempts} gerações no máximo).':
      '{channel}: guion con {model}, hasta {cost} ({attempts} generaciones como máximo).',
    'Total: até {cost}.': 'Total: hasta {cost}.',
    falhou: 'falló',
    'Também em outros idiomas': 'También en otros idiomas',
    'A IA escreve cada versão direto no idioma do canal, com as mesmas fontes, e cada canal publica pelas próprias contas.':
      'La IA escribe cada versión directamente en el idioma del canal, con las mismas fuentes, y cada canal publica con sus propias cuentas.',
  },
} satisfies AreaCatalog;
