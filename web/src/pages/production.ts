import { request } from '../api.ts';
import { openAutomaticProduction } from '../automatic-production-ui.ts';
import {
  badge,
  createDialog,
  empty,
  formWithSave,
  heading,
  mediaThumbnail,
  notice,
  panel,
  statusLabels,
} from '../components.ts';
import { button, el, field, icon, input, select, textarea } from '../dom.ts';
import { openFinalVersion } from '../final-version-ui.ts';
import { date, number } from '../format.ts';
import { openProduction } from '../production-ui.ts';
import { render } from '../studio/state.ts';
import {
  channelPath,
  currentChannel,
  effectiveConfig,
  go,
  refresh,
  scoped,
  state,
  studio,
} from '../studio/state.ts';
import { toast } from '../studio/toast.ts';
import { requiredChannel } from './channels.ts';
import type { Script, WebJob } from '../../shared/types.ts';

export function productionPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const snapshot = state();
  const jobs = scoped(snapshot.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const assets = scoped(snapshot.assets);
  const startButton = button('Produzir com IA', () => startProduction(), 'primary', 'film');
  startButton.disabled = snapshot.engine?.available === false;
  const jobsBody = jobs.length
    ? el('div', {}, ...jobs.map(jobCard))
    : empty(
        'Da sua orientação ao vídeo para revisão',
        'A IA desenvolve o roteiro; o motor prepara os visuais, a voz, a montagem e o QA em sequência.',
        'film',
        button('Produzir com IA', () => startProduction(), 'primary', 'plus'),
      );
  const assetBody = assets.length
    ? el(
        'div',
        { className: 'panel-body asset-grid' },
        ...assets.map((asset) =>
          el(
            'div',
            { className: 'asset-row' },
            icon(asset.kind === 'video' ? 'film' : 'folder'),
            el(
              'div',
              {},
              el('div', { className: 'asset-name', title: asset.name }, asset.name),
              el(
                'div',
                { className: 'asset-caption' },
                `${asset.kind === 'video' ? 'Vídeo' : 'Imagem'} · ${number(Math.round(asset.bytes / 1024))} KB · ${asset.license}`,
              ),
            ),
            el('span', { className: 'spacer' }),
            el(
              'span',
              { className: 'badge mono', 'data-variant': 'outline', title: asset.checksum },
              asset.checksum.slice(0, 8),
            ),
          ),
        ),
      )
    : empty(
        'Os visuais são preparados a partir do roteiro',
        'As imagens explicativas entram aqui automaticamente ao preparar o vídeo. Você também pode adicionar arquivos próprios.',
        'folder',
        button('Adicionar arquivo próprio', () => uploadAsset(), 'secondary', 'plus'),
      );
  return el(
    'div',
    { className: 'section-stack' },
    heading(
      'Produção',
      'Gere o vídeo, confira a qualidade e revise o resultado.',
      button('Adicionar arquivo próprio', () => uploadAsset(), 'secondary', 'plus'),
      startButton,
    ),
    snapshot.engine?.available === false ? notice(snapshot.engine.message) : null,
    panel(
      'Fila de produção',
      `${jobs.length} produções neste canal. ${currentChannel()?.youtubeAutoUpload ? 'Versões finais aprovadas seguem ao YouTube como privadas.' : 'O envio automático ao YouTube está desligado neste canal.'}`,
      jobsBody,
    ),
    panel(
      'Biblioteca do canal',
      `${assets.length} recursos visuais. Confira a origem e os direitos de cada arquivo.`,
      assetBody,
    ),
  );
}

export function jobCard(job: WebJob): HTMLElement {
  const script = state().scripts.find(
    (entry) => entry.channelId === studio.channelId && entry.id === job.scriptId,
  );
  const started = Boolean(job.startedAt);
  const stages = el(
    'div',
    { className: 'job-stages' },
    el('span', { className: 'job-stage reached' }, '1 · Solicitação registrada'),
    el('span', { className: `job-stage ${started ? 'reached' : ''}` }, '2 · Motor iniciado'),
    el('span', { className: `job-stage ${job.qa ? 'reached' : ''}` }, '3 · Relatório de QA'),
    el('span', { className: `job-stage ${job.videoAvailable ? 'reached' : ''}` }, '4 · Arquivo disponível'),
  );
  const qa = job.qa
    ? el(
        'div',
        { className: 'entity-meta' },
        el('span', { className: 'field-hint' }, 'Qualidade do arquivo:'),
        badge(job.qa.technical),
        el('span', { className: 'field-hint' }, 'Conteúdo:'),
        badge(job.qa.editorial),
      )
    : null;
  const diagnostic = ['failed', 'blocked'].includes(job.status)
    ? el(
        'details',
        {},
        el('summary', {}, 'Ver diagnóstico'),
        el('pre', { className: 'job-diagnostic' }, job.message),
      )
    : el('p', {}, job.message);
  return el(
    'article',
    { className: 'job-card', 'data-testid': `job-${job.id}` },
    el(
      'div',
      { className: 'job-card-heading' },
      mediaThumbnail(job),
      el(
        'div',
        {},
        el('h3', { title: script?.title || 'Produção do canal' }, script?.title || 'Produção do canal'),
        el(
          'p',
          {},
          `Solicitado em ${date(job.createdAt)}${job.engine ? ` · ${job.engine === 'motion' ? 'Motor motion' : 'Imagens por cena'}` : ''}`,
        ),
      ),
      el('span', { className: 'spacer' }),
      badge(job.status),
    ),
    stages,
    diagnostic,
    qa,
    youtubeStatus(job),
    job.videoAvailable
      ? el(
          'div',
          { className: 'job-artifacts' },
          button('Revisar vídeo', () => viewJob(job), 'secondary', 'film'),
          finalVersionButton(job, script),
          youtubeButton(job),
        )
      : null,
  );
}

function youtubeStatus(job: WebJob): HTMLElement | null {
  const youtube = job.youtube;
  if (!youtube) return null;
  if (youtube.status === 'uploading')
    return el('p', { role: 'status' }, 'Enviando ao YouTube como vídeo privado…');
  if (youtube.status === 'failed')
    return el('p', { className: 'field-hint', role: 'alert' }, `Envio ao YouTube falhou: ${youtube.message}`);
  const studioUrl = `https://studio.youtube.com/video/${encodeURIComponent(youtube.videoId)}/edit`;
  return el(
    'p',
    {},
    `Enviado ao YouTube como privado em ${date(youtube.uploadedAt)}. `,
    el(
      'a',
      { href: studioUrl, target: '_blank', rel: 'noopener noreferrer' },
      'Revisar e publicar no YouTube Studio',
    ),
  );
}

/** Only an approved final version goes out, once; a failed upload can be retried. */
function youtubeButton(job: WebJob): HTMLElement | null {
  if (
    job.status !== 'completed' ||
    job.previewOnly ||
    ['uploading', 'uploaded'].includes(job.youtube?.status ?? '')
  )
    return null;
  const action = button(
    job.youtube?.status === 'failed' ? 'Tentar enviar de novo' : 'Enviar ao YouTube (privado)',
    async () => {
      action.disabled = true;
      try {
        await request(channelPath(`/jobs/${encodeURIComponent(job.id)}/youtube`), 'POST', {});
        await refresh();
        toast('Envio iniciado. O vídeo entra no YouTube como privado; publique pelo YouTube Studio.');
      } catch (error) {
        action.disabled = false;
        toast(error instanceof Error ? error.message : 'Não foi possível iniciar o envio.');
      }
    },
    'secondary',
    'external',
  );
  action.dataset.testid = `youtube-${job.id}`;
  return action;
}

/** A watched preview leads straight to its final version; no menus in between. */
function finalVersionButton(job: WebJob, script: Script | undefined): HTMLElement | null {
  if (!job.previewOnly || !job.videoAvailable || !script || script.status === 'archived') return null;
  const action = button('Gerar versão final', () => generateFinal(script), 'primary', 'check');
  action.dataset.testid = `final-from-${job.id}`;
  return action;
}

export function generateFinal(script: Script): void {
  const channel = currentChannel();
  if (!channel) return;
  openFinalVersion({
    channel,
    script,
    config: effectiveConfig(),
    onStarted: async () => {
      await refresh();
      toast('Versão final na fila. Acompanhe aqui; ela fica pronta em alguns minutos.');
    },
    onEditScript: (scriptId) => {
      studio.activeScriptId = scriptId;
      go('scripts');
    },
    onManual: (scriptId) => {
      studio.activeScriptId = scriptId;
      prepareProductionManually();
    },
  });
}

export function startProduction(): void {
  const channel = currentChannel();
  if (!channel) return;
  openAutomaticProduction({
    channel,
    scripts: scoped(state().scripts),
    research: scoped(state().research),
    selectedScriptId: studio.activeScriptId,
    currentChannelId: () => studio.channelId,
    onStarted: async () => {
      await refresh();
      toast('Produção iniciada. Acompanhe o roteiro, os visuais e a montagem na fila.');
    },
    onManual: (scriptId) => {
      if (scriptId) studio.activeScriptId = scriptId;
      prepareProductionManually();
    },
    onSettings: () => go('settings'),
  });
}

export function prepareProductionManually(): void {
  const channel = currentChannel();
  if (!channel) return;
  const dialog = openProduction({
    channel,
    scripts: scoped(state().scripts),
    assets: scoped(state().assets),
    config: effectiveConfig(),
    selectedScriptId: studio.activeScriptId,
    currentChannelId: () => studio.channelId,
    onStarted: async () => {
      await refresh();
      toast('Produção adicionada à fila. Acompanhe o andamento aqui.');
    },
    onPrepared: (prepared) => {
      if (studio.data)
        studio.data.assets = [
          ...studio.data.assets.filter((asset) => asset.channelId !== channel.id),
          ...prepared.assets,
        ];
    },

    onAddAssets: () => uploadAsset(),
    onEditScript: (scriptId) => {
      studio.activeScriptId = scriptId;
      go('scripts');
    },
  });
  dialog.addEventListener('close', () => {
    if (location.hash === '#production') render();
  });
}

export function uploadAsset(): void {
  const { dialog, body } = createDialog(
    'Adicionar recurso visual',
    'O arquivo fica no armazenamento privado deste canal, no servidor local.',
  );
  const file = input('file', '', 'file');
  file.required = true;
  file.accept = '.png,.jpg,.jpeg,.webp,.bmp,.mp4,.mov,.m4v,.mkv,.webm,.avi';
  const kind = select(
    'kind',
    [
      ['image', 'Imagem'],
      ['video', 'Vídeo'],
    ],
    'image',
  );
  file.addEventListener('change', () => {
    const selected = file.files?.[0];
    if (selected) kind.value = /\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(selected.name) ? 'video' : 'image';
  });
  const license = input('license');
  license.required = true;
  const provenance = textarea('provenance', '', 3);
  provenance.required = true;
  const restrictions = textarea('restrictions', '', 2);
  restrictions.required = true;
  const { form, fields } = formWithSave(
    'Enviar ao servidor local',
    async () => {
      const selected = file.files?.[0];
      if (!selected) throw new Error('Selecione um arquivo.');
      if (selected.size > 20 * 1024 * 1024)
        throw new Error('O arquivo excede o limite de 20 MB por recurso. Use um trecho ou uma versão menor.');
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result.split(',')[1] || '')
            : reject(new Error('Não foi possível ler o arquivo.'));
        reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'));
        reader.readAsDataURL(selected);
      });
      await request(channelPath('/assets'), 'POST', {
        filename: selected.name,
        kind: kind.value,
        contentBase64,
        license: license.value.trim(),
        provenance: provenance.value.trim(),
        restrictions: restrictions.value.trim(),
      });
      file.value = '';
      dialog.close();
      await refresh();
      toast('Recurso visual registrado com origem e hash.');
    },
    () => dialog.close(),
  );
  fields.append(
    field('Arquivo de imagem ou vídeo', file, 'Até 20 MB por recurso visual.'),
    field('Tipo de recurso', kind),
    field(
      'Licença ou autorização de uso',
      license,
      'Informe a condição real de uso. A licença do código não cobre mídia de terceiros.',
    ),
    field('Origem e autoria', provenance, 'Quem criou, de onde veio e como o uso foi autorizado?'),
    field('Restrições e atribuição', restrictions, 'Se não houver restrições, declare isso expressamente.'),
  );
  body.append(form);
}

export function viewJob(job: WebJob): void {
  const script = state().scripts.find(
    (entry) => entry.channelId === studio.channelId && entry.id === job.scriptId,
  );
  const { dialog, body } = createDialog(
    job.previewOnly ? 'Revisar vídeo gerado' : 'Revisar vídeo',
    `${currentChannel()?.name} · ${statusLabels[job.status] || job.status}`,
  );
  const base = channelPath(`/jobs/${encodeURIComponent(job.id)}/files`);
  const video = el(
    'video',
    {
      className: 'video-preview',
      controls: true,
      preload: 'metadata',
      src: `${base}/video`,
      'aria-label': 'Vídeo produzido pelo motor Rust',
    },
    'Seu navegador não conseguiu abrir o vídeo. Use o link do arquivo abaixo.',
  );
  const files = job.previewOnly
    ? [
        ['video', 'Vídeo MP4'],
        ['subtitles', 'Legendas'],
        ['report', 'Relatório'],
      ]
    : [
        ['video', 'Vídeo MP4'],
        ['subtitles', 'Legendas'],
        ['thumbnail', 'Thumbnail'],
        ['description', 'Descrição'],
        ['sources', 'Fontes'],
        ['metadata', 'Metadados'],
        ['report', 'Relatório'],
      ];
  body.append(
    video,
    el(
      'div',
      { className: 'job-artifacts' },
      ...files.map(([key, label]) =>
        el(
          'a',
          { href: `${base}/${key}`, target: '_blank', rel: 'noopener noreferrer' },
          label,
          icon('external'),
        ),
      ),
    ),
    el('div', { className: 'divider' }),
    notice(
      job.previewOnly
        ? 'Esta é a prévia, com marca de revisão. Se estiver bom, gere a versão final: mesmo roteiro e mesmos visuais, sem a marca.'
        : 'Confira fatos, direitos, legibilidade e ritmo. O pacote é revisável e sua existência não comprova aprovação editorial ou publicação.',
    ),
  );
  const next = finalVersionButton(job, script);
  if (next) {
    next.addEventListener('click', () => dialog.close(), { capture: true });
    body.append(el('div', { className: 'form-actions' }, next));
  }
}
