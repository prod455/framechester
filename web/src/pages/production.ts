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
  statusLabels,
} from '../components.ts';
import { button, el, field, icon, input, select, textarea } from '../dom.ts';
import { openFinalVersion } from '../final-version-ui.ts';
import { date, number } from '../format.ts';
import { openProduction } from '../production-ui.ts';
import { render } from '../studio/state.ts';
import { networkMark } from '../studio/platforms.ts';
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
import { t, translateMessage } from '../../shared/i18n.ts';
import type { Platform, Script, WebJob } from '../../shared/types.ts';
import { canPublish, platformLabels, publicPlatforms, publishingPlatforms } from '../../shared/publishing.ts';

export function productionPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const snapshot = state();
  const jobs = scoped(snapshot.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const assets = scoped(snapshot.assets);
  // One primary action, named as on Criar vídeo (law of similarity, Von Restorff).
  const startButton = button(t('Novo vídeo'), () => startProduction(), 'primary', 'spark');
  startButton.disabled = snapshot.engine?.available === false;
  const jobsBody = jobs.length
    ? el('div', {}, ...jobs.map(jobCard))
    : empty(
        t('Nenhum vídeo ainda'),
        t('Mande a pauta: a IA escreve o roteiro e o motor monta as cenas, a voz e o QA.'),
        'film',
        button(t('Novo vídeo'), () => startProduction(), 'primary', 'spark'),
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
                `${asset.kind === 'video' ? t('Vídeo') : t('Imagem')} · ${number(Math.round(asset.bytes / 1024))} KB · ${asset.license}`,
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
        t('Nenhum arquivo próprio'),
        t('Adicione uma gravação ou imagem sua para usar numa cena específica.'),
        'folder',
        button(t('Adicionar arquivo próprio'), () => uploadAsset(), 'secondary', 'plus'),
      );
  // Own files are an occasional need: one place, collapsed (progressive disclosure, Hick).
  const library = el(
    'details',
    { className: 'grid gap-3 border-t pt-4' },
    el(
      'summary',
      { className: 'w-fit cursor-pointer font-semibold' },
      t('Arquivos próprios do canal ({count})', { count: assets.length }),
    ),
    el(
      'p',
      { className: 'field-hint' },
      t(
        'Gravações e imagens suas, com origem e direitos. Os visuais explicativos são gerados pelo motor; estes são opcionais.',
      ),
    ),
    assetBody,
    assets.length ? button(t('Adicionar arquivo próprio'), () => uploadAsset(), 'secondary', 'plus') : null,
  );
  return el(
    'div',
    { className: 'section-stack' },
    heading(
      t('Vídeos'),
      `${jobs.length === 1 ? t('{count} vídeo neste canal.', { count: jobs.length }) : t('{count} vídeos neste canal.', { count: jobs.length })} ${
        currentChannel()?.autoUpload?.length
          ? t('Versões finais aprovadas seguem sem publicar para: {networks}.', {
              networks: currentChannel()!
                .autoUpload!.map((network) => platformLabels[network])
                .join(', '),
            })
          : t('O envio automático às redes está desligado neste canal.')
      }`,
      startButton,
    ),
    snapshot.engine?.available === false ? notice(translateMessage(snapshot.engine.message)) : null,
    jobsBody,
    library,
  );
}

export function jobCard(job: WebJob): HTMLElement {
  const script = state().scripts.find(
    (entry) => entry.channelId === studio.channelId && entry.id === job.scriptId,
  );
  const active = job.status === 'queued' || job.status === 'running';
  // Stages only matter while the work is moving; a finished card shows its outcome.
  const stages = active
    ? el(
        'div',
        { className: 'mt-4 flex items-center gap-3 text-sm text-muted-foreground' },
        el(
          'div',
          { className: 'progress w-40', role: 'progressbar', 'aria-label': t('Produzindo') },
          el('span', { className: 'w-1/3 animate-pulse' }),
        ),
        el('span', {}, job.startedAt ? t('Motor trabalhando') : t('Na fila')),
      )
    : null;
  // QA labels only when something still needs a look; "aprovado" is already in the message.
  const qa =
    job.qa && !(job.qa.technical === 'pass' && job.qa.editorial === 'pass')
      ? el(
          'div',
          { className: 'entity-meta' },
          el('span', { className: 'field-hint' }, t('Qualidade do arquivo:')),
          badge(job.qa.technical),
          el('span', { className: 'field-hint' }, t('Conteúdo:')),
          badge(job.qa.editorial),
        )
      : null;
  const stopped = ['failed', 'blocked'].includes(job.status) && !job.videoAvailable;
  const diagnostic = stopped
    ? el(
        'details',
        {},
        el('summary', {}, t('Ver diagnóstico')),
        el('pre', { className: 'job-diagnostic' }, translateMessage(job.message)),
      )
    : el('p', {}, translateMessage(job.message));
  // A stop ends with a way forward, not only a log (peak-end rule, feedback loop).
  const retry =
    stopped && script && script.status !== 'archived'
      ? button(
          t('Tentar de novo'),
          () => {
            studio.activeScriptId = script.id;
            startProduction();
          },
          // In a list several cards can stop; only Gerar versão final stays dark (Von Restorff).
          'secondary',
          'refresh',
        )
      : null;
  // Thumbnail in one column, everything about the video in the title's column, so messages
  // and actions line up with the title instead of the thumbnail's edge.
  return el(
    'article',
    { className: 'job-card flex gap-4 max-sm:flex-col', 'data-testid': `job-${job.id}` },
    mediaThumbnail(job),
    el(
      'div',
      { className: 'min-w-0 flex-1' },
      // The state sits with the title it describes (law of proximity).
      el(
        'div',
        { className: 'flex min-w-0 items-center gap-3 [&>h3]:min-w-0 [&>h3]:truncate' },
        el('h3', { title: script?.title || t('Vídeo do canal') }, script?.title || t('Vídeo do canal')),
        badge(job.status),
      ),
      el(
        'p',
        {},
        `${job.kind === 'short' ? t('Short vertical') : job.previewOnly ? t('Prévia') : t('Versão final')} · ${date(job.createdAt)}${job.engine ? ` · ${job.engine === 'motion' ? t('Motor motion') : t('Imagens por cena')}` : ''}`,
      ),
      stages,
      diagnostic,
      qa,
      job.videoAvailable || retry
        ? el(
            'div',
            { className: 'job-artifacts' },
            retry,
            job.videoAvailable ? button(t('Assistir'), () => viewJob(job), 'secondary', 'film') : null,
            finalVersionButton(job, script),
            shortButton(job),
          )
        : null,
      publicationCards(job),
    ),
  );
}

/** A Short is cut from an approved final version made by the motion engine. */
export function shortButton(job: WebJob): HTMLElement | null {
  if (job.kind === 'short' || job.status !== 'completed' || job.previewOnly || job.engine !== 'motion')
    return null;
  // A vertical video already is the Short; a horizontal one gets its Short by itself, and the
  // button only comes back when that cut stopped.
  if (vertical(job)) return null;
  if (
    state().jobs.some(
      (item) =>
        item.kind === 'short' &&
        item.sourceJobId === job.id &&
        item.status !== 'failed' &&
        item.status !== 'blocked',
    )
  )
    return null;
  const action = button(
    t('Gerar Short'),
    async () => {
      action.disabled = true;
      try {
        await request(channelPath(`/jobs/${encodeURIComponent(job.id)}/short`), 'POST', {});
        await refresh();
        toast(t('Short na fila: abertura, fechamento e as cenas que mais prendem, em vertical.'));
      } catch (error) {
        action.disabled = false;
        toast(
          error instanceof Error ? translateMessage(error.message) : t('Não foi possível gerar o Short.'),
        );
      }
    },
    'secondary',
    'film',
  );
  action.dataset.testid = `short-${job.id}`;
  return action;
}

/** Where the operator reviews and publishes what was sent; TikTok has no web page for it. */
function reviewLink(platform: Platform, postId: string, url?: string): HTMLElement | null {
  const permalink = url && URL.canParse(url) ? new URL(url) : undefined;
  const target =
    platform === 'instagram'
      ? permalink?.protocol === 'https:' && permalink.hostname === 'www.instagram.com'
        ? { href: permalink.href, label: t('Ver no Instagram') }
        : null
      : platform === 'youtube'
        ? {
            href: `https://studio.youtube.com/video/${encodeURIComponent(postId)}/edit`,
            label: t('Revisar e publicar no YouTube Studio'),
          }
        : platform === 'facebook'
          ? { href: 'https://business.facebook.com/', label: t('Revisar e publicar no Meta Business Suite') }
          : null;
  if (!target) return null;
  return el(
    'a',
    {
      href: target.href,
      target: '_blank',
      rel: 'noopener noreferrer',
      // Links in running text are underlined, not told apart by colour alone (WCAG 1.4.1).
      className: 'underline underline-offset-4',
    },
    target.label,
  );
}

function uploadedText(platform: Platform, when: string): string {
  if (platform === 'youtube') return t('Enviado ao YouTube como privado em {date}.', { date: when });
  if (platform === 'tiktok')
    return t('Enviado ao TikTok como "Somente eu" em {date}. Revise e publique pelo app do TikTok.', {
      date: when,
    });
  if (platform === 'instagram')
    return t('Publicado no Instagram como Reel público em {date}.', { date: when });
  return t('Enviado ao Facebook como rascunho de Reel em {date}.', { date: when });
}

/** One line per network the video went to; only Instagram is public, the rest wait for the operator. */
export function publicationStatus(job: WebJob, only?: Platform): HTMLElement | null {
  const lines = publishingPlatforms
    .filter((platform) => !only || platform === only)
    .map((platform) => {
      const publication = job.publications?.[platform];
      if (!publication) return null;
      const network = platformLabels[platform];
      if (publication.status === 'uploading')
        return el(
          'p',
          { role: 'status' },
          publicPlatforms.includes(platform)
            ? t('Publicando no {network}…', { network })
            : t('Enviando ao {network} sem publicar…', { network }),
        );
      if (publication.status === 'failed')
        return el(
          'p',
          { className: 'field-hint', role: 'alert' },
          t('Envio ao {network} falhou: {message}', {
            network,
            message: translateMessage(publication.message),
          }),
        );
      const thumbnail =
        publication.thumbnail === 'set'
          ? `${t('Thumbnail aplicada.')} `
          : publication.thumbnail
            ? `${translateMessage(publication.thumbnail.error)} `
            : '';
      return el(
        'p',
        {},
        `${uploadedText(platform, date(publication.uploadedAt))} ${thumbnail}`,
        reviewLink(platform, publication.postId, publication.url),
      );
    })
    .filter((line) => line !== null);
  return lines.length ? el('div', { className: 'section-stack' }, ...lines) : null;
}

function vertical(job: WebJob): boolean {
  const script = scoped(state().scripts).find((item) => item.id === job.scriptId);
  return job.kind === 'short' || script?.format === 'short';
}

/** Only an approved final version goes out, once per network; a failed upload can be retried. */
export function publishButton(job: WebJob, platform: Platform): HTMLElement | null {
  const status = job.publications?.[platform]?.status;
  if (
    job.status !== 'completed' ||
    job.previewOnly ||
    status === 'uploading' ||
    status === 'uploaded' ||
    !canPublish(platform, vertical(job))
  )
    return null;
  const network = platformLabels[platform];
  const labels: Record<Platform, string> = {
    youtube: t('Enviar ao YouTube (privado)'),
    tiktok: t('Enviar ao TikTok (Somente eu)'),
    facebook: t('Enviar ao Facebook (rascunho)'),
    instagram: t('Publicar no Instagram (público)'),
  };
  const send = async () => {
    action.disabled = true;
    try {
      await request(
        channelPath(`/jobs/${encodeURIComponent(job.id)}/publish/${encodeURIComponent(platform)}`),
        'POST',
        {},
      );
      await refresh();
      toast(
        publicPlatforms.includes(platform)
          ? t('Publicação iniciada. O Reel fica público assim que o {network} terminar de processar.', {
              network,
            })
          : t('Envio iniciado. Nada fica público: publique pelo próprio {network}.', { network }),
      );
    } catch (error) {
      action.disabled = false;
      toast(
        error instanceof Error ? translateMessage(error.message) : t('Não foi possível iniciar o envio.'),
      );
    }
  };
  const action = button(
    status === 'failed' ? t('Tentar enviar ao {network} de novo', { network }) : labels[platform],
    () => (publicPlatforms.includes(platform) ? confirmPublic(network, send) : void send()),
    'secondary',
    'external',
  );
  action.dataset.testid = `publish-${platform}-${job.id}`;
  return action;
}

/** A public post cannot be taken back quietly: the click is confirmed before anything is sent. */
function confirmPublic(network: string, send: () => Promise<void>): void {
  const { dialog, body } = createDialog(t('Publicar agora no {network}?', { network }));
  body.append(
    el(
      'p',
      { className: 'muted' },
      t(
        'O {network} não tem rascunho nem modo privado na API: o Reel fica público para todos assim que terminar de processar.',
        { network },
      ),
    ),
  );
  const { form } = formWithSave(
    t('Publicar no {network}', { network }),
    async () => {
      dialog.close();
      await send();
    },
    () => dialog.close(),
  );
  body.append(form);
}

/** What each network does with the video, said before the operator sends it. */
function networkPromise(platform: Platform): { mode: string; text: string } {
  if (platform === 'youtube')
    return { mode: t('Privado'), text: t('Entra como privado; você publica no YouTube Studio.') };
  if (platform === 'tiktok')
    return { mode: t('Somente eu'), text: t('Entra como "Somente eu"; você publica pelo app do TikTok.') };
  if (platform === 'instagram')
    return { mode: t('Público'), text: t('Publica direto como Reel público, sem revisão no Instagram.') };
  return {
    mode: t('Rascunho'),
    text: t('Entra como rascunho de Reel; você publica no Meta Business Suite.'),
  };
}

/** One card per network: its mark, what happens there, where the video is and the next action. */
export function publicationCards(job: WebJob): HTMLElement | null {
  if (job.status !== 'completed' || job.previewOnly || !job.videoAvailable) return null;
  const connections = scoped(state().connections);
  const automatic = currentChannel()?.autoUpload ?? [];
  const isVertical = vertical(job);
  return el(
    'div',
    {
      className: 'mt-4 grid gap-3 sm:grid-cols-2',
      role: 'group',
      'aria-label': t('Redes sociais deste vídeo'),
    },
    ...publishingPlatforms.map((platform) => {
      const network = platformLabels[platform];
      const promise = networkPromise(platform);
      const publication = job.publications?.[platform];
      const connected = connections.some(
        (connection) => connection.platform === platform && connection.status === 'connected',
      );
      let body: HTMLElement | null;
      let action: HTMLElement | null = null;
      if (publication) {
        body = publicationStatus(job, platform);
        if (publication.status === 'failed') action = publishButton(job, platform);
      } else if (!canPublish(platform, isVertical)) {
        body = el(
          'p',
          { className: 'field-hint' },
          job.kind === 'short'
            ? t('Recebe só vídeo vertical.')
            : t('Recebe só vídeo vertical: vai o Short deste vídeo.'),
        );
      } else if (!connected) {
        body = el(
          'p',
          { className: 'field-hint' },
          t('Conecte o {network} para enviar este vídeo.', { network }),
        );
        action = button(
          t('Conectar {network}', { network }),
          () => {
            studio.activePlatform = platform;
            go('connections');
          },
          'secondary',
          'plug',
        );
      } else {
        body = el('p', { className: 'field-hint' }, promise.text);
        action = publishButton(job, platform);
      }
      return el(
        'section',
        {
          className: 'flex min-w-0 flex-col gap-2 rounded-lg border border-border p-3',
          'data-testid': `network-${platform}-${job.id}`,
        },
        el(
          'div',
          { className: 'flex min-w-0 items-center gap-2' },
          networkMark(platform),
          el('h4', { className: 'min-w-0 truncate font-medium' }, network),
          el('span', { className: 'spacer' }),
          el(
            'span',
            {
              className: 'badge',
              'data-variant': publicPlatforms.includes(platform) ? 'destructive' : 'outline',
            },
            promise.mode,
          ),
        ),
        automatic.includes(platform) && canPublish(platform, isVertical)
          ? el('p', { className: 'field-hint' }, t('Automático neste canal.'))
          : null,
        body,
        action,
      );
    }),
  );
}

/** A watched preview leads straight to its final version; no menus in between. */
function finalVersionButton(job: WebJob, script: Script | undefined): HTMLElement | null {
  if (!job.previewOnly || !job.videoAvailable || !script || script.status === 'archived') return null;
  const action = button(t('Gerar versão final'), () => generateFinal(script), 'primary', 'check');
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
      toast(t('Versão final na fila. Acompanhe aqui; ela fica pronta em alguns minutos.'));
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
    channels: state().channels,
    scripts: scoped(state().scripts),
    research: scoped(state().research),
    selectedScriptId: studio.activeScriptId,
    currentChannelId: () => studio.channelId,
    onStarted: async () => {
      await refresh();
      toast(t('Produção iniciada. Acompanhe o roteiro, os visuais e a montagem na fila.'));
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
      toast(t('Produção adicionada à fila. Acompanhe o andamento aqui.'));
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
    t('Adicionar recurso visual'),
    t('O arquivo fica no armazenamento privado deste canal, no servidor local.'),
  );
  const file = input('file', '', 'file');
  file.required = true;
  file.accept = '.png,.jpg,.jpeg,.webp,.bmp,.mp4,.mov,.m4v,.mkv,.webm,.avi';
  const kind = select(
    'kind',
    [
      ['image', t('Imagem')],
      ['video', t('Vídeo')],
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
    t('Enviar ao servidor local'),
    async () => {
      const selected = file.files?.[0];
      if (!selected) throw new Error(t('Selecione um arquivo.'));
      if (selected.size > 20 * 1024 * 1024)
        throw new Error(
          t('O arquivo excede o limite de 20 MB por recurso. Use um trecho ou uma versão menor.'),
        );
      const contentBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () =>
          typeof reader.result === 'string'
            ? resolve(reader.result.split(',')[1] || '')
            : reject(new Error(t('Não foi possível ler o arquivo.')));
        reader.onerror = () => reject(new Error(t('Não foi possível ler o arquivo.')));
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
      toast(t('Recurso visual registrado com origem e hash.'));
    },
    () => dialog.close(),
  );
  fields.append(
    field(t('Arquivo de imagem ou vídeo'), file, t('Até 20 MB por recurso visual.')),
    field(t('Tipo de recurso'), kind),
    field(
      t('Licença ou autorização de uso'),
      license,
      t('Informe a condição real de uso. A licença do código não cobre mídia de terceiros.'),
    ),
    field(t('Origem e autoria'), provenance, t('Quem criou, de onde veio e como o uso foi autorizado?')),
    field(
      t('Restrições e atribuição'),
      restrictions,
      t('Se não houver restrições, declare isso expressamente.'),
    ),
  );
  body.append(form);
}

export function viewJob(job: WebJob): void {
  const script = state().scripts.find(
    (entry) => entry.channelId === studio.channelId && entry.id === job.scriptId,
  );
  const { dialog, body } = createDialog(
    job.previewOnly ? t('Revisar vídeo gerado') : t('Revisar vídeo'),
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
      'aria-label': t('Vídeo produzido pelo motor Rust'),
    },
    t('Seu navegador não conseguiu abrir o vídeo. Use o link do arquivo abaixo.'),
  );
  const files = job.previewOnly
    ? [
        ['video', t('Vídeo MP4')],
        ['subtitles', t('Legendas')],
        ['report', t('Relatório')],
      ]
    : [
        ['video', t('Vídeo MP4')],
        ['subtitles', t('Legendas')],
        ['thumbnail', t('Thumbnail')],
        ['description', t('Descrição')],
        ['sources', t('Fontes')],
        ['metadata', t('Metadados')],
        ['report', t('Relatório')],
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
        ? t(
            'Esta é a prévia, com marca de revisão. Se estiver bom, gere a versão final: mesmo roteiro e mesmos visuais, sem a marca.',
          )
        : t(
            'Confira fatos, direitos, legibilidade e ritmo. O pacote é revisável e sua existência não comprova aprovação editorial ou publicação.',
          ),
    ),
  );
  const next = finalVersionButton(job, script);
  if (next) {
    next.addEventListener('click', () => dialog.close(), { capture: true });
    body.append(el('div', { className: 'form-actions' }, next));
  }
}
