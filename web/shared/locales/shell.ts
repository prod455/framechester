import type { AreaCatalog } from './index.ts';

/** Shell, navigation, shared components and overview; also the display labels of the shared
 * pt-BR tables (video styles, workflow steps, voices, scene layout errors), which stay in
 * Portuguese at the source because they are sent to the AI. */
export default {
  en: {
    Idioma: 'Language',
    // Shell and access
    'O estúdio ainda não respondeu': 'The Studio has not responded yet',
    'Verifique o servidor local.': 'Check the local server.',
    'Tentar de novo': 'Try again',
    'Entrar no estúdio': 'Sign in to the Studio',
    'Criar acesso local': 'Create local access',
    'As senhas precisam ser iguais.': 'The passwords must match.',
    'Sua senha local': 'Your local password',
    'Use pelo menos 12 caracteres.': 'Use at least 12 characters.',
    'Confirme a senha': 'Confirm the password',
    'Entrar no Framechester': 'Sign in to Framechester',
    'Configurar acesso local': 'Set up local access',
    'Use a senha desta instalação.': 'Use the password for this installation.',
    'Defina uma senha para proteger seus canais neste computador.':
      'Set a password to protect your channels on this computer.',
    'As credenciais das redes sociais ficam no cofre local.':
      'Social network credentials stay in the local vault.',
    'Somente neste computador': 'Only on this computer',
    'Acesso local · Framechester': 'Local access · Framechester',
    'Navegação principal': 'Main navigation',
    Avançado: 'Advanced',
    'Execução local': 'Running locally',
    Sair: 'Sign out',
    'Sessão encerrada.': 'Signed out.',
    'Não foi possível encerrar a sessão.': 'Could not sign out.',
    'Nenhum canal criado': 'No channel created',
    'Canal selecionado': 'Selected channel',
    'Abrir menu': 'Open menu',
    Canal: 'Channel',
    'Produção indisponível': 'Production unavailable',
    'Atualizar dados do estúdio': 'Refresh Studio data',
    'Dados atualizados.': 'Data refreshed.',
    'Ir para o conteúdo': 'Skip to content',
    'Sua sessão terminou. Entre novamente para continuar.': 'Your session ended. Sign in again to continue.',
    // Pages
    'Criar vídeo': 'Create video',
    Vídeos: 'Videos',
    Canais: 'Channels',
    'Visão geral': 'Overview',
    'Pesquisa de nichos': 'Niche research',
    Roteiros: 'Scripts',
    Narrativas: 'Stories',
    Resultados: 'Results',
    'Contas conectadas': 'Connected accounts',
    Configurações: 'Settings',
    'O estúdio ainda não carregou os dados.': 'The Studio has not loaded the data yet.',
    'A operação falhou.': 'The operation failed.',
    // API
    'Destino de API local inválido.': 'Invalid local API destination.',
    'Não foi possível acessar o servidor local. Confira se o estúdio está em execução.':
      'Could not reach the local server. Check that the Studio is running.',
    'A operação não foi concluída (HTTP {status}).': 'The operation did not complete (HTTP {status}).',
    // Shared components
    Rascunho: 'Draft',
    Revisado: 'Reviewed',
    Arquivado: 'Archived',
    Conectado: 'Connected',
    'Não conectado': 'Not connected',
    'Conexão expirada': 'Connection expired',
    'Requer atenção': 'Needs attention',
    'Na fila': 'Queued',
    'Em produção': 'In production',
    'Revisão pendente': 'Review pending',
    Concluído: 'Completed',
    Falhou: 'Failed',
    Bloqueado: 'Blocked',
    Aprovado: 'Passed',
    Reprovado: 'Failed check',
    'Revisão humana': 'Human review',
    'Não executado': 'Not run',
    'Fonte citada': 'Source cited',
    'A conferir': 'To verify',
    'Contradição identificada': 'Contradiction found',
    'Salvando…': 'Saving…',
    Cancelar: 'Cancel',
    'Não foi possível concluir. Tente novamente.': 'Could not finish. Try again.',
    'Define estrutura, ritmo e layouts visuais. Sem formato, a IA segue apenas o pedido.':
      'Sets structure, pacing and visual layouts. Without a format, the AI follows only your request.',
    'Sem formato definido': 'No format set',
    'Formato do vídeo': 'Video format',
    'Fechar janela': 'Close dialog',
    'Continuar editando': 'Keep editing',
    'Salvamento em andamento': 'Saving in progress',
    'Há alterações não salvas': 'You have unsaved changes',
    'Aguarde o salvamento terminar antes de sair desta tela.':
      'Wait for the save to finish before leaving this screen.',
    'Continue editando para salvar seu trabalho. Se descartar, as alterações desta tela serão perdidas.':
      'Keep editing to save your work. If you discard, the changes on this screen will be lost.',
    'Descartar e continuar': 'Discard and continue',
    'Sem registro': 'No record',
    'Data não disponível': 'Date unavailable',
    // Overview
    'Vídeo deste canal': 'Video from this channel',
    'Vídeo curto': 'Short video',
    'Vídeo longo': 'Long video',
    '{count} cenas': '{count} scenes',
    Revisar: 'Review',
    'Ver produção': 'View production',
    vídeo: 'video',
    'Revisar {target}': 'Review {target}',
    'Ver produção de {target}': 'View production of {target}',
    'Nenhum vídeo produzido': 'No videos produced',
    'Comece por uma pauta ou continue um roteiro salvo.': 'Start from a topic or continue a saved script.',
    'Ver roteiros': 'View scripts',
    Roteiro: 'Script',
    Pesquisa: 'Research',
    'Suas pautas e roteiros vão aparecer aqui.': 'Your topics and scripts will show up here.',
    'Criar pauta': 'Create topic',
    '{count} vídeo aguarda sua revisão.': '{count} video awaits your review.',
    '{count} vídeos aguardam sua revisão.': '{count} videos await your review.',
    'Revisar agora': 'Review now',
    'Recebimentos e custos': 'Payments and costs',
    'Nova pauta': 'New topic',
    Produções: 'Productions',
    'Ver fila': 'View queue',
    'Em desenvolvimento': 'In progress',
    Contas: 'Accounts',
    Gerenciar: 'Manage',
    Recebimentos: 'Payments',
    Custos: 'Costs',
    'Saldo entre registros': 'Recorded balance',
    'Nenhum pagamento registrado': 'No payments recorded',
    'Nenhum custo registrado': 'No costs recorded',
    'Requer recebimentos e custos na mesma moeda': 'Needs payments and costs in the same currency',
    'Pagamentos registrados pelo operador': 'Payments recorded by the operator',
    'Custos registrados pelo operador': 'Costs recorded by the operator',
    'Recebimentos menos custos registrados': 'Payments minus recorded costs',
    'Estimativas não entram neste resumo. O saldo considera os registros existentes; não representa lucro econômico nem conciliação automática da plataforma.':
      'Estimates are not included in this summary. The balance reflects existing records; it is not economic profit or automatic platform reconciliation.',
    'Todas as redes. Valores registrados por você, separados por moeda.':
      'All networks. Amounts you recorded, split by currency.',
    'Ver registros': 'View records',
    // shared/finance.ts
    'Fora do limite': 'Out of range',
    // shared/video-styles.ts
    'Explicador direto': 'Straight explainer',
    'Uma pergunta concreta respondida com mecanismo, analogia e consequência.':
      'A concrete question answered with mechanism, analogy and consequence.',
    'Mistério documental': 'Documentary mystery',
    'Um fato estranho e verificável investigado até a explicação documentada.':
      'A strange, verifiable fact investigated until the documented explanation.',
    Ranking: 'Ranking',
    'N itens com critério explícito, do menos ao mais relevante.':
      'N items with an explicit criterion, from least to most relevant.',
    'Linha do tempo': 'Timeline',
    'Origem, marcos e ponto de virada de uma tecnologia ou ideia.':
      'Origin, milestones and turning point of a technology or idea.',
    Comparativo: 'Comparison',
    'Duas opções medidas pelos mesmos critérios, com veredito condicionado.':
      'Two options measured by the same criteria, with a conditional verdict.',
    // shared/workflow.ts
    'Organize seu primeiro canal': 'Set up your first channel',
    'Defina público e proposta editorial para começar a pesquisa.':
      'Define the audience and editorial angle to start researching.',
    'Criar canal': 'Create channel',
    'A produção está em andamento': 'Production is in progress',
    'Acompanhe a fila e confira os resultados quando o vídeo estiver disponível.':
      'Follow the queue and check the results when the video is ready.',
    'Acompanhar produção': 'Follow production',
    'Seu vídeo precisa de uma revisão': 'Your video needs a review',
    'Assista ao resultado e confira os fatos, o áudio e os direitos de uso.':
      'Watch the result and check the facts, the audio and the usage rights.',
    'Revisar vídeo': 'Review video',
    'Uma produção precisa de atenção': 'A production needs attention',
    'Confira o diagnóstico antes de iniciar uma nova tentativa.':
      'Check the diagnosis before starting a new attempt.',
    'Ver diagnóstico': 'View diagnosis',
    'Leve o roteiro para a produção': 'Take the script to production',
    'Revise as fontes e prepare o vídeo. Os visuais explicativos são criados a partir do roteiro.':
      'Review the sources and prepare the video. The explanatory visuals are built from the script.',
    'Preparar vídeo': 'Prepare video',
    'Transforme a pesquisa em roteiro': 'Turn the research into a script',
    'Escolha uma pauta e desenvolva a promessa, as falas e as cenas.':
      'Pick a topic and develop the promise, the lines and the scenes.',
    'Escrever roteiro': 'Write script',
    'Qual pergunta seu próximo vídeo vai responder?': 'What question will your next video answer?',
    'Investigue o público e registre um ângulo original que você consegue sustentar.':
      'Research the audience and record an original angle you can back up.',
    'Pesquisar uma pauta': 'Research a topic',
    // shared/voices.ts
    'Dora · feminina · PT-BR': 'Dora · female · PT-BR',
    'Alex · masculina · PT-BR': 'Alex · male · PT-BR',
    'Santa · masculina · PT-BR': 'Santa · male · PT-BR',
    'Voz sem aprovação comercial nesta instalação. Escolha Dora, Alex ou Santa (Kokoro) em Configurações. Vozes Piper legadas estão bloqueadas.':
      'This voice is not cleared for commercial use in this installation. Choose Dora, Alex or Santa (Kokoro) in Settings. Legacy Piper voices are blocked.',
    'Configure os arquivos da voz comercial e o Python do Kokoro. Execute npm run voices:setup antes de produzir.':
      'Set up the commercial voice files and the Kokoro Python. Run npm run voices:setup before producing.',
    // shared/scene-layouts.ts (composed errors)
    'Cena {scene}: diretiva visual inválida; cada campo precisa de 1 a {max} caracteres.':
      'Scene {scene}: invalid visual directive; each field needs 1 to {max} characters.',
    "Cena {scene}: diretiva visual inválida; use exatamente {min} campos separados por '{separator}'.":
      "Scene {scene}: invalid visual directive; use exactly {min} fields separated by '{separator}'.",
    "Cena {scene}: diretiva visual inválida; informe de {min} a {max} itens separados por '{separator}'.":
      "Scene {scene}: invalid visual directive; give {min} to {max} items separated by '{separator}'.",
    "Cena {scene}: diretiva visual inválida; cada item precisa do formato 'rotulo: texto'.":
      "Scene {scene}: invalid visual directive; each item needs the format 'rotulo: texto'.",
    "Cena {scene}: diretiva visual inválida; o valor '{value}' precisa aparecer na narração da cena.":
      "Scene {scene}: invalid visual directive; the value '{value}' must appear in the scene narration.",
    "Cena {scene}: diretiva visual inválida; a citação '{value}' precisa aparecer na narração da cena.":
      "Scene {scene}: invalid visual directive; the quote '{value}' must appear in the scene narration.",
    'Cena {scene}: diretiva visual inválida; #destaque não recebe campos.':
      'Scene {scene}: invalid visual directive; #destaque takes no fields.',
    'Cena {scene}: diretiva visual inválida; o valor precisa conter um dígito e até {max} caracteres.':
      'Scene {scene}: invalid visual directive; the value needs a digit and up to {max} characters.',
    "Cena {scene}: diretiva visual inválida; '#{name}' não existe; use {layouts} ou uma diretiva do motor motion ({directives}).":
      "Scene {scene}: invalid visual directive; '#{name}' does not exist; use {layouts} or a motion engine directive ({directives}).",
  },
  es: {
    Idioma: 'Idioma',
    // Shell and access
    'O estúdio ainda não respondeu': 'El Studio todavía no responde',
    'Verifique o servidor local.': 'Revisa el servidor local.',
    'Tentar de novo': 'Intentar de nuevo',
    'Entrar no estúdio': 'Entrar al Studio',
    'Criar acesso local': 'Crear acceso local',
    'As senhas precisam ser iguais.': 'Las contraseñas deben coincidir.',
    'Sua senha local': 'Tu contraseña local',
    'Use pelo menos 12 caracteres.': 'Usa al menos 12 caracteres.',
    'Confirme a senha': 'Confirma la contraseña',
    'Entrar no Framechester': 'Entrar a Framechester',
    'Configurar acesso local': 'Configurar acceso local',
    'Use a senha desta instalação.': 'Usa la contraseña de esta instalación.',
    'Defina uma senha para proteger seus canais neste computador.':
      'Define una contraseña para proteger tus canales en esta computadora.',
    'As credenciais das redes sociais ficam no cofre local.':
      'Las credenciales de las redes sociales quedan en la bóveda local.',
    'Somente neste computador': 'Solo en esta computadora',
    'Acesso local · Framechester': 'Acceso local · Framechester',
    'Navegação principal': 'Navegación principal',
    Avançado: 'Avanzado',
    'Execução local': 'Ejecución local',
    Sair: 'Salir',
    'Sessão encerrada.': 'Sesión cerrada.',
    'Não foi possível encerrar a sessão.': 'No se pudo cerrar la sesión.',
    'Nenhum canal criado': 'Ningún canal creado',
    'Canal selecionado': 'Canal seleccionado',
    'Abrir menu': 'Abrir menú',
    Canal: 'Canal',
    'Produção indisponível': 'Producción no disponible',
    'Atualizar dados do estúdio': 'Actualizar datos del Studio',
    'Dados atualizados.': 'Datos actualizados.',
    'Ir para o conteúdo': 'Ir al contenido',
    'Sua sessão terminou. Entre novamente para continuar.':
      'Tu sesión terminó. Vuelve a entrar para continuar.',
    // Pages
    'Criar vídeo': 'Crear video',
    Vídeos: 'Videos',
    Canais: 'Canales',
    'Visão geral': 'Resumen',
    'Pesquisa de nichos': 'Investigación de nichos',
    Roteiros: 'Guiones',
    Narrativas: 'Narrativas',
    Resultados: 'Resultados',
    'Contas conectadas': 'Cuentas conectadas',
    Configurações: 'Configuración',
    'O estúdio ainda não carregou os dados.': 'El Studio todavía no cargó los datos.',
    'A operação falhou.': 'La operación falló.',
    // API
    'Destino de API local inválido.': 'Destino de API local no válido.',
    'Não foi possível acessar o servidor local. Confira se o estúdio está em execução.':
      'No se pudo acceder al servidor local. Revisa que el Studio esté en ejecución.',
    'A operação não foi concluída (HTTP {status}).': 'La operación no se completó (HTTP {status}).',
    // Shared components
    Rascunho: 'Borrador',
    Revisado: 'Revisado',
    Arquivado: 'Archivado',
    Conectado: 'Conectado',
    'Não conectado': 'No conectado',
    'Conexão expirada': 'Conexión vencida',
    'Requer atenção': 'Requiere atención',
    'Na fila': 'En cola',
    'Em produção': 'En producción',
    'Revisão pendente': 'Revisión pendiente',
    Concluído: 'Completado',
    Falhou: 'Falló',
    Bloqueado: 'Bloqueado',
    Aprovado: 'Aprobado',
    Reprovado: 'Reprobado',
    'Revisão humana': 'Revisión humana',
    'Não executado': 'No ejecutado',
    'Fonte citada': 'Fuente citada',
    'A conferir': 'Por verificar',
    'Contradição identificada': 'Contradicción identificada',
    'Salvando…': 'Guardando…',
    Cancelar: 'Cancelar',
    'Não foi possível concluir. Tente novamente.': 'No se pudo completar. Inténtalo de nuevo.',
    'Define estrutura, ritmo e layouts visuais. Sem formato, a IA segue apenas o pedido.':
      'Define estructura, ritmo y diseños visuales. Sin formato, la IA sigue solo tu pedido.',
    'Sem formato definido': 'Sin formato definido',
    'Formato do vídeo': 'Formato del video',
    'Fechar janela': 'Cerrar ventana',
    'Continuar editando': 'Seguir editando',
    'Salvamento em andamento': 'Guardado en curso',
    'Há alterações não salvas': 'Hay cambios sin guardar',
    'Aguarde o salvamento terminar antes de sair desta tela.':
      'Espera a que termine el guardado antes de salir de esta pantalla.',
    'Continue editando para salvar seu trabalho. Se descartar, as alterações desta tela serão perdidas.':
      'Sigue editando para guardar tu trabajo. Si descartas, se perderán los cambios de esta pantalla.',
    'Descartar e continuar': 'Descartar y continuar',
    'Sem registro': 'Sin registro',
    'Data não disponível': 'Fecha no disponible',
    // Overview
    'Vídeo deste canal': 'Video de este canal',
    'Vídeo curto': 'Video corto',
    'Vídeo longo': 'Video largo',
    '{count} cenas': '{count} escenas',
    Revisar: 'Revisar',
    'Ver produção': 'Ver producción',
    vídeo: 'video',
    'Revisar {target}': 'Revisar {target}',
    'Ver produção de {target}': 'Ver producción de {target}',
    'Nenhum vídeo produzido': 'Ningún video producido',
    'Comece por uma pauta ou continue um roteiro salvo.': 'Empieza por un tema o continúa un guion guardado.',
    'Ver roteiros': 'Ver guiones',
    Roteiro: 'Guion',
    Pesquisa: 'Investigación',
    'Suas pautas e roteiros vão aparecer aqui.': 'Tus temas y guiones aparecerán aquí.',
    'Criar pauta': 'Crear tema',
    '{count} vídeo aguarda sua revisão.': '{count} video espera tu revisión.',
    '{count} vídeos aguardam sua revisão.': '{count} videos esperan tu revisión.',
    'Revisar agora': 'Revisar ahora',
    'Recebimentos e custos': 'Ingresos y costos',
    'Nova pauta': 'Nuevo tema',
    Produções: 'Producciones',
    'Ver fila': 'Ver cola',
    'Em desenvolvimento': 'En desarrollo',
    Contas: 'Cuentas',
    Gerenciar: 'Administrar',
    Recebimentos: 'Ingresos',
    Custos: 'Costos',
    'Saldo entre registros': 'Saldo entre registros',
    'Nenhum pagamento registrado': 'Ningún pago registrado',
    'Nenhum custo registrado': 'Ningún costo registrado',
    'Requer recebimentos e custos na mesma moeda': 'Requiere ingresos y costos en la misma moneda',
    'Pagamentos registrados pelo operador': 'Pagos registrados por el operador',
    'Custos registrados pelo operador': 'Costos registrados por el operador',
    'Recebimentos menos custos registrados': 'Ingresos menos costos registrados',
    'Estimativas não entram neste resumo. O saldo considera os registros existentes; não representa lucro econômico nem conciliação automática da plataforma.':
      'Las estimaciones no entran en este resumen. El saldo considera los registros existentes; no representa ganancia económica ni conciliación automática de la plataforma.',
    'Todas as redes. Valores registrados por você, separados por moeda.':
      'Todas las redes. Valores que registraste, separados por moneda.',
    'Ver registros': 'Ver registros',
    // shared/finance.ts
    'Fora do limite': 'Fuera de rango',
    // shared/video-styles.ts
    'Explicador direto': 'Explicador directo',
    'Uma pergunta concreta respondida com mecanismo, analogia e consequência.':
      'Una pregunta concreta respondida con mecanismo, analogía y consecuencia.',
    'Mistério documental': 'Misterio documental',
    'Um fato estranho e verificável investigado até a explicação documentada.':
      'Un hecho extraño y verificable investigado hasta la explicación documentada.',
    Ranking: 'Ranking',
    'N itens com critério explícito, do menos ao mais relevante.':
      'N elementos con criterio explícito, del menos al más relevante.',
    'Linha do tempo': 'Línea de tiempo',
    'Origem, marcos e ponto de virada de uma tecnologia ou ideia.':
      'Origen, hitos y punto de quiebre de una tecnología o idea.',
    Comparativo: 'Comparativo',
    'Duas opções medidas pelos mesmos critérios, com veredito condicionado.':
      'Dos opciones medidas con los mismos criterios, con veredicto condicionado.',
    // shared/workflow.ts
    'Organize seu primeiro canal': 'Organiza tu primer canal',
    'Defina público e proposta editorial para começar a pesquisa.':
      'Define el público y la propuesta editorial para empezar la investigación.',
    'Criar canal': 'Crear canal',
    'A produção está em andamento': 'La producción está en curso',
    'Acompanhe a fila e confira os resultados quando o vídeo estiver disponível.':
      'Sigue la cola y revisa los resultados cuando el video esté disponible.',
    'Acompanhar produção': 'Seguir producción',
    'Seu vídeo precisa de uma revisão': 'Tu video necesita una revisión',
    'Assista ao resultado e confira os fatos, o áudio e os direitos de uso.':
      'Mira el resultado y revisa los hechos, el audio y los derechos de uso.',
    'Revisar vídeo': 'Revisar video',
    'Uma produção precisa de atenção': 'Una producción necesita atención',
    'Confira o diagnóstico antes de iniciar uma nova tentativa.':
      'Revisa el diagnóstico antes de iniciar un nuevo intento.',
    'Ver diagnóstico': 'Ver diagnóstico',
    'Leve o roteiro para a produção': 'Lleva el guion a producción',
    'Revise as fontes e prepare o vídeo. Os visuais explicativos são criados a partir do roteiro.':
      'Revisa las fuentes y prepara el video. Los visuales explicativos se crean a partir del guion.',
    'Preparar vídeo': 'Preparar video',
    'Transforme a pesquisa em roteiro': 'Convierte la investigación en guion',
    'Escolha uma pauta e desenvolva a promessa, as falas e as cenas.':
      'Elige un tema y desarrolla la promesa, los diálogos y las escenas.',
    'Escrever roteiro': 'Escribir guion',
    'Qual pergunta seu próximo vídeo vai responder?': '¿Qué pregunta va a responder tu próximo video?',
    'Investigue o público e registre um ângulo original que você consegue sustentar.':
      'Investiga al público y registra un ángulo original que puedas sostener.',
    'Pesquisar uma pauta': 'Investigar un tema',
    // shared/voices.ts
    'Dora · feminina · PT-BR': 'Dora · femenina · PT-BR',
    'Alex · masculina · PT-BR': 'Alex · masculina · PT-BR',
    'Santa · masculina · PT-BR': 'Santa · masculina · PT-BR',
    'Voz sem aprovação comercial nesta instalação. Escolha Dora, Alex ou Santa (Kokoro) em Configurações. Vozes Piper legadas estão bloqueadas.':
      'Voz sin aprobación comercial en esta instalación. Elige Dora, Alex o Santa (Kokoro) en Configuración. Las voces Piper heredadas están bloqueadas.',
    'Configure os arquivos da voz comercial e o Python do Kokoro. Execute npm run voices:setup antes de produzir.':
      'Configura los archivos de la voz comercial y el Python de Kokoro. Ejecuta npm run voices:setup antes de producir.',
    // shared/scene-layouts.ts (composed errors)
    'Cena {scene}: diretiva visual inválida; cada campo precisa de 1 a {max} caracteres.':
      'Escena {scene}: directiva visual no válida; cada campo necesita de 1 a {max} caracteres.',
    "Cena {scene}: diretiva visual inválida; use exatamente {min} campos separados por '{separator}'.":
      "Escena {scene}: directiva visual no válida; usa exactamente {min} campos separados por '{separator}'.",
    "Cena {scene}: diretiva visual inválida; informe de {min} a {max} itens separados por '{separator}'.":
      "Escena {scene}: directiva visual no válida; indica de {min} a {max} elementos separados por '{separator}'.",
    "Cena {scene}: diretiva visual inválida; cada item precisa do formato 'rotulo: texto'.":
      "Escena {scene}: directiva visual no válida; cada elemento necesita el formato 'rotulo: texto'.",
    "Cena {scene}: diretiva visual inválida; o valor '{value}' precisa aparecer na narração da cena.":
      "Escena {scene}: directiva visual no válida; el valor '{value}' debe aparecer en la narración de la escena.",
    "Cena {scene}: diretiva visual inválida; a citação '{value}' precisa aparecer na narração da cena.":
      "Escena {scene}: directiva visual no válida; la cita '{value}' debe aparecer en la narración de la escena.",
    'Cena {scene}: diretiva visual inválida; #destaque não recebe campos.':
      'Escena {scene}: directiva visual no válida; #destaque no recibe campos.',
    'Cena {scene}: diretiva visual inválida; o valor precisa conter um dígito e até {max} caracteres.':
      'Escena {scene}: directiva visual no válida; el valor debe tener un dígito y hasta {max} caracteres.',
    "Cena {scene}: diretiva visual inválida; '#{name}' não existe; use {layouts} ou uma diretiva do motor motion ({directives}).":
      "Escena {scene}: directiva visual no válida; '#{name}' no existe; usa {layouts} o una directiva del motor motion ({directives}).",
  },
} satisfies AreaCatalog;
