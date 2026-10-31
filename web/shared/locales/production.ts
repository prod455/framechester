import type { AreaCatalog } from './index.ts';

export default {
  en: {
    // Videos page and job cards
    'Novo vídeo': 'New video',
    'Nenhum vídeo ainda': 'No videos yet',
    'Mande a pauta: a IA escreve o roteiro e o motor monta as cenas, a voz e o QA.':
      'Send the topic: AI writes the script and the engine builds the scenes, the voice and the QA.',
    Vídeo: 'Video',
    Imagem: 'Image',
    'Nenhum arquivo próprio': 'No files of your own',
    'Adicione uma gravação ou imagem sua para usar numa cena específica.':
      'Add a recording or image of your own to use in a specific scene.',
    'Adicionar arquivo próprio': 'Add your own file',
    'Arquivos próprios do canal ({count})': "Channel's own files ({count})",
    'Gravações e imagens suas, com origem e direitos. Os visuais explicativos são gerados pelo motor; estes são opcionais.':
      'Your recordings and images, with source and rights. The engine generates the explanatory visuals; these are optional.',
    Vídeos: 'Videos',
    '{count} vídeo neste canal.': '{count} video on this channel.',
    '{count} vídeos neste canal.': '{count} videos on this channel.',
    'Versões finais aprovadas seguem ao YouTube como privadas.':
      'Approved final versions go to YouTube as private.',
    'O envio automático ao YouTube está desligado neste canal.':
      'Automatic upload to YouTube is off for this channel.',
    Produzindo: 'Producing',
    'Motor trabalhando': 'Engine working',
    'Na fila': 'Queued',
    'Qualidade do arquivo:': 'File quality:',
    'Conteúdo:': 'Content:',
    'Ver diagnóstico': 'View diagnostics',
    'Tentar de novo': 'Try again',
    'Vídeo do canal': 'Channel video',
    'Short vertical': 'Vertical Short',
    Prévia: 'Preview',
    'Versão final': 'Final version',
    'Motor motion': 'Motion engine',
    'Imagens por cena': 'Images per scene',
    Assistir: 'Watch',
    'Enviando ao YouTube como vídeo privado…': 'Uploading to YouTube as a private video…',
    'Envio ao YouTube falhou: {message}': 'YouTube upload failed: {message}',
    'Thumbnail aplicada.': 'Thumbnail applied.',
    'Enviado ao YouTube como privado em {date}.': 'Uploaded to YouTube as private on {date}.',
    'Revisar e publicar no YouTube Studio': 'Review and publish in YouTube Studio',
    'Gerar Short': 'Generate Short',
    'Short na fila: abertura, fechamento e as cenas que mais prendem, em vertical.':
      'Short queued: opening, closing and the most gripping scenes, in vertical.',
    'Não foi possível gerar o Short.': "Couldn't generate the Short.",
    'Tentar enviar de novo': 'Try uploading again',
    'Enviar ao YouTube (privado)': 'Upload to YouTube (private)',
    'Envio iniciado. O vídeo entra no YouTube como privado; publique pelo YouTube Studio.':
      'Upload started. The video goes to YouTube as private; publish it from YouTube Studio.',
    'Não foi possível iniciar o envio.': "Couldn't start the upload.",
    'Gerar versão final': 'Generate final version',
    'Versão final na fila. Acompanhe aqui; ela fica pronta em alguns minutos.':
      'Final version queued. Follow it here; it will be ready in a few minutes.',
    'Produção iniciada. Acompanhe o roteiro, os visuais e a montagem na fila.':
      'Production started. Follow the script, visuals and editing in the queue.',
    'Produção adicionada à fila. Acompanhe o andamento aqui.':
      'Production added to the queue. Follow its progress here.',
    // Visual asset upload
    'Adicionar recurso visual': 'Add visual asset',
    'O arquivo fica no armazenamento privado deste canal, no servidor local.':
      "The file stays in this channel's private storage, on the local server.",
    'Enviar ao servidor local': 'Upload to local server',
    'Selecione um arquivo.': 'Select a file.',
    'O arquivo excede o limite de 20 MB por recurso. Use um trecho ou uma versão menor.':
      'The file exceeds the 20 MB limit per asset. Use a clip or a smaller version.',
    'Não foi possível ler o arquivo.': "Couldn't read the file.",
    'Recurso visual registrado com origem e hash.': 'Visual asset registered with source and hash.',
    'Arquivo de imagem ou vídeo': 'Image or video file',
    'Até 20 MB por recurso visual.': 'Up to 20 MB per visual asset.',
    'Tipo de recurso': 'Asset type',
    'Licença ou autorização de uso': 'License or usage permission',
    'Informe a condição real de uso. A licença do código não cobre mídia de terceiros.':
      "State the actual terms of use. The code's license doesn't cover third-party media.",
    'Origem e autoria': 'Source and authorship',
    'Quem criou, de onde veio e como o uso foi autorizado?':
      'Who created it, where it came from and how its use was authorized?',
    'Restrições e atribuição': 'Restrictions and attribution',
    'Se não houver restrições, declare isso expressamente.':
      'If there are no restrictions, say so explicitly.',
    // Video review dialog
    'Revisar vídeo gerado': 'Review generated video',
    'Revisar vídeo': 'Review video',
    'Vídeo produzido pelo motor Rust': 'Video produced by the Rust engine',
    'Seu navegador não conseguiu abrir o vídeo. Use o link do arquivo abaixo.':
      "Your browser couldn't open the video. Use the file link below.",
    'Vídeo MP4': 'MP4 video',
    Legendas: 'Subtitles',
    Relatório: 'Report',
    Thumbnail: 'Thumbnail',
    Descrição: 'Description',
    Fontes: 'Sources',
    Metadados: 'Metadata',
    'Esta é a prévia, com marca de revisão. Se estiver bom, gere a versão final: mesmo roteiro e mesmos visuais, sem a marca.':
      'This is the preview, with a review watermark. If it looks good, generate the final version: same script and visuals, no watermark.',
    'Confira fatos, direitos, legibilidade e ritmo. O pacote é revisável e sua existência não comprova aprovação editorial ou publicação.':
      "Check facts, rights, readability and pacing. The package can be reviewed, and its existence doesn't prove editorial approval or publication.",
    // Manual production dialog
    'Preparar vídeo': 'Prepare video',
    'Canal: {channel}. Confira as prévias das cenas e o que falta para gerar o vídeo.':
      "Channel: {channel}. Check the scene previews and what's left before generating the video.",
    'Adicione um roteiro primeiro': 'Add a script first',
    'O motor usa as falas e as cenas do roteiro.': "The engine uses the script's lines and scenes.",
    'Ir para roteiros': 'Go to scripts',
    Roteiro: 'Script',
    'Criando e vinculando os visuais deste roteiro…': "Creating and linking this script's visuals…",
    'A preparação retornou recursos de outro roteiro ou canal.':
      'The preparation returned assets from another script or channel.',
    'Selecione uma imagem ou clipe do canal': 'Select an image or clip from the channel',
    'Visual de {heading}': 'Visual for {heading}',
    'Clipe selecionado: {name}': 'Selected clip: {name}',
    'Cena {number} · {heading}': 'Scene {number} · {heading}',
    'Visual explicativo criado e associado a esta cena.':
      'Explanatory visual created and linked to this scene.',
    'Usar outro recurso visual': 'Use another visual asset',
    'Imagem ou clipe do canal': 'Image or clip from the channel',
    'Gerar prévia do vídeo': 'Generate video preview',
    'O canal ou roteiro mudou. Abra a preparação novamente.':
      'The channel or script changed. Open the preparation again.',
    'Marque “Conferi e cruzei as fontes e as alegações” no roteiro antes da versão final.':
      'Check “I reviewed and cross-checked the sources and claims” in the script before the final version.',
    'Iniciando produção…': 'Starting production…',
    'Para a versão final, marque “Conferi e cruzei as fontes e as alegações” no roteiro (aba Fontes e revisão).':
      'For the final version, check “I reviewed and cross-checked the sources and claims” in the script (Sources and review tab).',
    'Para a versão final, corrija no roteiro as alegações marcadas como contradição ou com URL fora das fontes.':
      'For the final version, fix the claims in the script marked as contradicted or citing a URL outside the sources.',
    '{count} prévia criada': '{count} preview created',
    '{count} prévias criadas': '{count} previews created',
    'A preparação precisa de atenção': 'The preparation needs attention',
    'Os visuais explicativos já estão vinculados às cenas. Confira as imagens antes de continuar.':
      'The explanatory visuals are already linked to the scenes. Check the images before you continue.',
    'Revisar roteiro': 'Review script',
    'Falta resolver {count} cena para gerar a versão final. As prévias ilustrativas já estão disponíveis.':
      '{count} scene still needs a visual before the final version. The illustrative previews are already available.',
    'Falta resolver {count} cenas para gerar a versão final. As prévias ilustrativas já estão disponíveis.':
      '{count} scenes still need a visual before the final version. The illustrative previews are already available.',
    'Cenas prontas para gerar o vídeo neste computador.':
      'Scenes ready to generate the video on this computer.',
    'Incluir legendas no vídeo': 'Burn subtitles into the video',
    'Conferir a fala com ASR local': 'Check the speech with local ASR',
    'A prévia de vídeo pode ser gerada antes da revisão editorial e recebe uma marca de revisão. Os visuais e a montagem são locais. A adaptação com IA pede autorização antes de qualquer geração paga.':
      'The video preview can be generated before editorial review and gets a review watermark. Visuals and editing run locally. AI adaptation asks for permission before any paid generation.',
    'Não foi possível preparar os visuais.': "Couldn't prepare the visuals.",
    // Final version dialog
    '{count} fonte no roteiro.': '{count} source in the script.',
    '{count} fontes no roteiro.': '{count} sources in the script.',
    'Nenhuma fonte no roteiro. O vídeo é gerado e o relatório de QA pede uma antes de publicar.':
      'No sources in the script. The video is generated, and the QA report asks for one before publishing.',
    '{count} alegação marcada como contradição. Corrija ou remova no roteiro.':
      '{count} claim marked as contradicted. Fix or remove it in the script.',
    '{count} alegações marcadas como contradição. Corrija ou remova no roteiro.':
      '{count} claims marked as contradicted. Fix or remove them in the script.',
    '{count} alegação cita URL fora das fontes do roteiro. Corrija no roteiro.':
      "{count} claim cites a URL outside the script's sources. Fix it in the script.",
    '{count} alegações citam URL fora das fontes do roteiro. Corrija no roteiro.':
      "{count} claims cite a URL outside the script's sources. Fix them in the script.",
    'Abrir roteiro': 'Open script',
    'Abrir preparação manual': 'Open manual preparation',
    'Registrando a revisão no roteiro…': 'Recording the review in the script…',
    'Conferindo os visuais das cenas…': 'Checking the scene visuals…',
    '{scenes} ficou sem visual. Prepare os visuais novamente.':
      '{scenes} has no visual. Prepare the visuals again.',
    'Cena {number}': 'Scene {number}',
    'Iniciando a versão final…': 'Starting the final version…',
    'Não foi possível iniciar a versão final.': "Couldn't start the final version.",
    'Mesmo roteiro e mesmos visuais da prévia, sem a marca de revisão.':
      'Same script and visuals as the preview, without the review watermark.',
    'Conferi e cruzei as fontes e as alegações desta pauta':
      'I reviewed and cross-checked the sources and claims for this topic',
    'Esta é a sua aprovação editorial e fica registrada no roteiro e no relatório de QA. Publicar continua manual.':
      'This is your editorial approval, recorded in the script and the QA report. Publishing stays manual.',
    // Create video page
    Pauta: 'Topic',
    'Pauta registrada': 'Topic saved',
    'Diga sobre o que é o vídeo. A IA escreve o roteiro e o motor monta as cenas.':
      'Say what the video is about. AI writes the script and the engine builds the scenes.',
    'Gerar vídeo': 'Generate video',
    'Começa quando a pauta for enviada.': 'Starts once the topic is sent.',
    'Vídeo montado e conferido pelo QA.': 'Video built and checked by QA.',
    Revisar: 'Review',
    'Assista quando o vídeo ficar pronto.': 'Watch it when the video is ready.',
    'Assista à prévia. Se estiver bom, gere a versão final.':
      'Watch the preview. If it looks good, generate the final version.',
    'Versão final aprovada no QA.': 'Final version passed QA.',
    'Enviar ao YouTube': 'Upload to YouTube',
    'Disponível para a versão final aprovada.': 'Available for the approved final version.',
    'Enviado como privado. Publique pelo YouTube Studio.':
      'Uploaded as private. Publish it from YouTube Studio.',
    'Enviando como privado…': 'Uploading as private…',
    'Envie como vídeo privado e publique quando quiser.':
      "Upload as a private video and publish whenever you're ready.",
    'Conecte o YouTube deste canal para enviar.': "Connect this channel's YouTube to upload.",
    Feito: 'Done',
    Agora: 'Now',
    Depois: 'Later',
    Parou: 'Stopped',
    'Crie seu canal para começar': 'Create your channel to get started',
    'Um canal guarda o nome, o público e as contas conectadas. Depois disso, é só mandar a pauta.':
      'A channel holds the name, the audience and the connected accounts. After that, just send the topic.',
    'Criar canal': 'Create channel',
    'Passos concluídos': 'Steps completed',
    'Vídeo enviado. Falta só publicar no YouTube Studio.':
      'Video uploaded. All that’s left is publishing in YouTube Studio.',
    '{done} de 4 passos': '{done} of 4 steps',
    'Criar vídeo': 'Create video',
    'Canal {channel}: pauta, vídeo, revisão e envio, nesta ordem.':
      'Channel {channel}: topic, video, review and upload, in that order.',
    'Ver todos os vídeos': 'View all videos',
    'Gerando vídeo': 'Generating video',
    'começou agora': 'just started',
    'há {minutes} min': '{minutes} min ago',
    'Começar outro vídeo': 'Start another video',
    'Conectar YouTube': 'Connect YouTube',
  },
  es: {
    // Videos page and job cards
    'Novo vídeo': 'Nuevo video',
    'Nenhum vídeo ainda': 'Aún no hay videos',
    'Mande a pauta: a IA escreve o roteiro e o motor monta as cenas, a voz e o QA.':
      'Envía el tema: la IA escribe el guion y el motor arma las escenas, la voz y el QA.',
    Vídeo: 'Video',
    Imagem: 'Imagen',
    'Nenhum arquivo próprio': 'No hay archivos propios',
    'Adicione uma gravação ou imagem sua para usar numa cena específica.':
      'Agrega una grabación o imagen tuya para usarla en una escena específica.',
    'Adicionar arquivo próprio': 'Agregar archivo propio',
    'Arquivos próprios do canal ({count})': 'Archivos propios del canal ({count})',
    'Gravações e imagens suas, com origem e direitos. Os visuais explicativos são gerados pelo motor; estes são opcionais.':
      'Tus grabaciones e imágenes, con origen y derechos. El motor genera los visuales explicativos; estos son opcionales.',
    Vídeos: 'Videos',
    '{count} vídeo neste canal.': '{count} video en este canal.',
    '{count} vídeos neste canal.': '{count} videos en este canal.',
    'Versões finais aprovadas seguem ao YouTube como privadas.':
      'Las versiones finales aprobadas se suben a YouTube como privadas.',
    'O envio automático ao YouTube está desligado neste canal.':
      'La subida automática a YouTube está desactivada en este canal.',
    Produzindo: 'Produciendo',
    'Motor trabalhando': 'Motor trabajando',
    'Na fila': 'En cola',
    'Qualidade do arquivo:': 'Calidad del archivo:',
    'Conteúdo:': 'Contenido:',
    'Ver diagnóstico': 'Ver diagnóstico',
    'Tentar de novo': 'Intentar de nuevo',
    'Vídeo do canal': 'Video del canal',
    'Short vertical': 'Short vertical',
    Prévia: 'Vista previa',
    'Versão final': 'Versión final',
    'Motor motion': 'Motor motion',
    'Imagens por cena': 'Imágenes por escena',
    Assistir: 'Ver',
    'Enviando ao YouTube como vídeo privado…': 'Subiendo a YouTube como video privado…',
    'Envio ao YouTube falhou: {message}': 'La subida a YouTube falló: {message}',
    'Thumbnail aplicada.': 'Miniatura aplicada.',
    'Enviado ao YouTube como privado em {date}.': 'Subido a YouTube como privado el {date}.',
    'Revisar e publicar no YouTube Studio': 'Revisar y publicar en YouTube Studio',
    'Gerar Short': 'Generar Short',
    'Short na fila: abertura, fechamento e as cenas que mais prendem, em vertical.':
      'Short en cola: apertura, cierre y las escenas que más enganchan, en vertical.',
    'Não foi possível gerar o Short.': 'No se pudo generar el Short.',
    'Tentar enviar de novo': 'Intentar subir de nuevo',
    'Enviar ao YouTube (privado)': 'Subir a YouTube (privado)',
    'Envio iniciado. O vídeo entra no YouTube como privado; publique pelo YouTube Studio.':
      'Subida iniciada. El video entra a YouTube como privado; publícalo desde YouTube Studio.',
    'Não foi possível iniciar o envio.': 'No se pudo iniciar la subida.',
    'Gerar versão final': 'Generar versión final',
    'Versão final na fila. Acompanhe aqui; ela fica pronta em alguns minutos.':
      'Versión final en cola. Síguela aquí; estará lista en unos minutos.',
    'Produção iniciada. Acompanhe o roteiro, os visuais e a montagem na fila.':
      'Producción iniciada. Sigue el guion, los visuales y el montaje en la cola.',
    'Produção adicionada à fila. Acompanhe o andamento aqui.':
      'Producción agregada a la cola. Sigue su avance aquí.',
    // Visual asset upload
    'Adicionar recurso visual': 'Agregar recurso visual',
    'O arquivo fica no armazenamento privado deste canal, no servidor local.':
      'El archivo queda en el almacenamiento privado de este canal, en el servidor local.',
    'Enviar ao servidor local': 'Subir al servidor local',
    'Selecione um arquivo.': 'Selecciona un archivo.',
    'O arquivo excede o limite de 20 MB por recurso. Use um trecho ou uma versão menor.':
      'El archivo supera el límite de 20 MB por recurso. Usa un fragmento o una versión más pequeña.',
    'Não foi possível ler o arquivo.': 'No se pudo leer el archivo.',
    'Recurso visual registrado com origem e hash.': 'Recurso visual registrado con origen y hash.',
    'Arquivo de imagem ou vídeo': 'Archivo de imagen o video',
    'Até 20 MB por recurso visual.': 'Hasta 20 MB por recurso visual.',
    'Tipo de recurso': 'Tipo de recurso',
    'Licença ou autorização de uso': 'Licencia o autorización de uso',
    'Informe a condição real de uso. A licença do código não cobre mídia de terceiros.':
      'Indica la condición real de uso. La licencia del código no cubre medios de terceros.',
    'Origem e autoria': 'Origen y autoría',
    'Quem criou, de onde veio e como o uso foi autorizado?':
      '¿Quién lo creó, de dónde viene y cómo se autorizó su uso?',
    'Restrições e atribuição': 'Restricciones y atribución',
    'Se não houver restrições, declare isso expressamente.':
      'Si no hay restricciones, decláralo expresamente.',
    // Video review dialog
    'Revisar vídeo gerado': 'Revisar video generado',
    'Revisar vídeo': 'Revisar video',
    'Vídeo produzido pelo motor Rust': 'Video producido por el motor Rust',
    'Seu navegador não conseguiu abrir o vídeo. Use o link do arquivo abaixo.':
      'Tu navegador no pudo abrir el video. Usa el enlace del archivo de abajo.',
    'Vídeo MP4': 'Video MP4',
    Legendas: 'Subtítulos',
    Relatório: 'Informe',
    Thumbnail: 'Miniatura',
    Descrição: 'Descripción',
    Fontes: 'Fuentes',
    Metadados: 'Metadatos',
    'Esta é a prévia, com marca de revisão. Se estiver bom, gere a versão final: mesmo roteiro e mesmos visuais, sem a marca.':
      'Esta es la vista previa, con marca de revisión. Si está bien, genera la versión final: mismo guion y mismos visuales, sin la marca.',
    'Confira fatos, direitos, legibilidade e ritmo. O pacote é revisável e sua existência não comprova aprovação editorial ou publicação.':
      'Revisa hechos, derechos, legibilidad y ritmo. El paquete se puede revisar y su existencia no prueba aprobación editorial ni publicación.',
    // Manual production dialog
    'Preparar vídeo': 'Preparar video',
    'Canal: {channel}. Confira as prévias das cenas e o que falta para gerar o vídeo.':
      'Canal: {channel}. Revisa las vistas previas de las escenas y lo que falta para generar el video.',
    'Adicione um roteiro primeiro': 'Agrega un guion primero',
    'O motor usa as falas e as cenas do roteiro.': 'El motor usa los diálogos y las escenas del guion.',
    'Ir para roteiros': 'Ir a guiones',
    Roteiro: 'Guion',
    'Criando e vinculando os visuais deste roteiro…': 'Creando y vinculando los visuales de este guion…',
    'A preparação retornou recursos de outro roteiro ou canal.':
      'La preparación devolvió recursos de otro guion o canal.',
    'Selecione uma imagem ou clipe do canal': 'Selecciona una imagen o clip del canal',
    'Visual de {heading}': 'Visual de {heading}',
    'Clipe selecionado: {name}': 'Clip seleccionado: {name}',
    'Cena {number} · {heading}': 'Escena {number} · {heading}',
    'Visual explicativo criado e associado a esta cena.':
      'Visual explicativo creado y asociado a esta escena.',
    'Usar outro recurso visual': 'Usar otro recurso visual',
    'Imagem ou clipe do canal': 'Imagen o clip del canal',
    'Gerar prévia do vídeo': 'Generar vista previa del video',
    'O canal ou roteiro mudou. Abra a preparação novamente.':
      'El canal o el guion cambió. Abre la preparación de nuevo.',
    'Marque “Conferi e cruzei as fontes e as alegações” no roteiro antes da versão final.':
      'Marca “Revisé y crucé las fuentes y las afirmaciones” en el guion antes de la versión final.',
    'Iniciando produção…': 'Iniciando producción…',
    'Para a versão final, marque “Conferi e cruzei as fontes e as alegações” no roteiro (aba Fontes e revisão).':
      'Para la versión final, marca “Revisé y crucé las fuentes y las afirmaciones” en el guion (pestaña Fuentes y revisión).',
    'Para a versão final, corrija no roteiro as alegações marcadas como contradição ou com URL fora das fontes.':
      'Para la versión final, corrige en el guion las afirmaciones marcadas como contradicción o con una URL fuera de las fuentes.',
    '{count} prévia criada': '{count} vista previa creada',
    '{count} prévias criadas': '{count} vistas previas creadas',
    'A preparação precisa de atenção': 'La preparación necesita atención',
    'Os visuais explicativos já estão vinculados às cenas. Confira as imagens antes de continuar.':
      'Los visuales explicativos ya están vinculados a las escenas. Revisa las imágenes antes de continuar.',
    'Revisar roteiro': 'Revisar guion',
    'Falta resolver {count} cena para gerar a versão final. As prévias ilustrativas já estão disponíveis.':
      'Falta resolver {count} escena para generar la versión final. Las vistas previas ilustrativas ya están disponibles.',
    'Falta resolver {count} cenas para gerar a versão final. As prévias ilustrativas já estão disponíveis.':
      'Faltan resolver {count} escenas para generar la versión final. Las vistas previas ilustrativas ya están disponibles.',
    'Cenas prontas para gerar o vídeo neste computador.':
      'Escenas listas para generar el video en esta computadora.',
    'Incluir legendas no vídeo': 'Incluir subtítulos en el video',
    'Conferir a fala com ASR local': 'Verificar la locución con ASR local',
    'A prévia de vídeo pode ser gerada antes da revisão editorial e recebe uma marca de revisão. Os visuais e a montagem são locais. A adaptação com IA pede autorização antes de qualquer geração paga.':
      'La vista previa del video se puede generar antes de la revisión editorial y lleva una marca de revisión. Los visuales y el montaje son locales. La adaptación con IA pide autorización antes de cualquier generación paga.',
    'Não foi possível preparar os visuais.': 'No se pudieron preparar los visuales.',
    // Final version dialog
    '{count} fonte no roteiro.': '{count} fuente en el guion.',
    '{count} fontes no roteiro.': '{count} fuentes en el guion.',
    'Nenhuma fonte no roteiro. O vídeo é gerado e o relatório de QA pede uma antes de publicar.':
      'No hay fuentes en el guion. El video se genera y el informe de QA pide una antes de publicar.',
    '{count} alegação marcada como contradição. Corrija ou remova no roteiro.':
      '{count} afirmación marcada como contradicción. Corrígela o elimínala en el guion.',
    '{count} alegações marcadas como contradição. Corrija ou remova no roteiro.':
      '{count} afirmaciones marcadas como contradicción. Corrígelas o elimínalas en el guion.',
    '{count} alegação cita URL fora das fontes do roteiro. Corrija no roteiro.':
      '{count} afirmación cita una URL fuera de las fuentes del guion. Corrígela en el guion.',
    '{count} alegações citam URL fora das fontes do roteiro. Corrija no roteiro.':
      '{count} afirmaciones citan una URL fuera de las fuentes del guion. Corrígelas en el guion.',
    'Abrir roteiro': 'Abrir guion',
    'Abrir preparação manual': 'Abrir preparación manual',
    'Registrando a revisão no roteiro…': 'Registrando la revisión en el guion…',
    'Conferindo os visuais das cenas…': 'Revisando los visuales de las escenas…',
    '{scenes} ficou sem visual. Prepare os visuais novamente.':
      '{scenes} quedó sin visual. Prepara los visuales de nuevo.',
    'Cena {number}': 'Escena {number}',
    'Iniciando a versão final…': 'Iniciando la versión final…',
    'Não foi possível iniciar a versão final.': 'No se pudo iniciar la versión final.',
    'Mesmo roteiro e mesmos visuais da prévia, sem a marca de revisão.':
      'Mismo guion y mismos visuales de la vista previa, sin la marca de revisión.',
    'Conferi e cruzei as fontes e as alegações desta pauta':
      'Revisé y crucé las fuentes y las afirmaciones de este tema',
    'Esta é a sua aprovação editorial e fica registrada no roteiro e no relatório de QA. Publicar continua manual.':
      'Esta es tu aprobación editorial y queda registrada en el guion y en el informe de QA. Publicar sigue siendo manual.',
    // Create video page
    Pauta: 'Tema',
    'Pauta registrada': 'Tema registrado',
    'Diga sobre o que é o vídeo. A IA escreve o roteiro e o motor monta as cenas.':
      'Di de qué trata el video. La IA escribe el guion y el motor arma las escenas.',
    'Gerar vídeo': 'Generar video',
    'Começa quando a pauta for enviada.': 'Empieza cuando envíes el tema.',
    'Vídeo montado e conferido pelo QA.': 'Video armado y revisado por el QA.',
    Revisar: 'Revisar',
    'Assista quando o vídeo ficar pronto.': 'Míralo cuando el video esté listo.',
    'Assista à prévia. Se estiver bom, gere a versão final.':
      'Mira la vista previa. Si está bien, genera la versión final.',
    'Versão final aprovada no QA.': 'Versión final aprobada en el QA.',
    'Enviar ao YouTube': 'Subir a YouTube',
    'Disponível para a versão final aprovada.': 'Disponible para la versión final aprobada.',
    'Enviado como privado. Publique pelo YouTube Studio.':
      'Subido como privado. Publícalo desde YouTube Studio.',
    'Enviando como privado…': 'Subiendo como privado…',
    'Envie como vídeo privado e publique quando quiser.':
      'Súbelo como video privado y publícalo cuando quieras.',
    'Conecte o YouTube deste canal para enviar.': 'Conecta el YouTube de este canal para subirlo.',
    Feito: 'Hecho',
    Agora: 'Ahora',
    Depois: 'Después',
    Parou: 'Detenido',
    'Crie seu canal para começar': 'Crea tu canal para empezar',
    'Um canal guarda o nome, o público e as contas conectadas. Depois disso, é só mandar a pauta.':
      'Un canal guarda el nombre, el público y las cuentas conectadas. Después, solo envía el tema.',
    'Criar canal': 'Crear canal',
    'Passos concluídos': 'Pasos completados',
    'Vídeo enviado. Falta só publicar no YouTube Studio.':
      'Video subido. Solo falta publicarlo en YouTube Studio.',
    '{done} de 4 passos': '{done} de 4 pasos',
    'Criar vídeo': 'Crear video',
    'Canal {channel}: pauta, vídeo, revisão e envio, nesta ordem.':
      'Canal {channel}: tema, video, revisión y subida, en ese orden.',
    'Ver todos os vídeos': 'Ver todos los videos',
    'Gerando vídeo': 'Generando video',
    'começou agora': 'empezó ahora',
    'há {minutes} min': 'hace {minutes} min',
    'Começar outro vídeo': 'Empezar otro video',
    'Conectar YouTube': 'Conectar YouTube',
  },
} satisfies AreaCatalog;
