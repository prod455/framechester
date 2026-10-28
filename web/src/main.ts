import "./basecoat.css";
import "./styles.css";
import { openProduction } from "./production-ui.ts";
import {openAutomaticProduction} from './automatic-production-ui.ts';
import { commercialVoices, commercialVoiceError } from "../shared/voices.ts";
import { request, setCsrfToken } from "./api.ts";
import { hasUnsavedEdits, protectEdits } from "./edit-protection.ts";
import { cashSummary, money, recordedMoney } from "../shared/finance.ts";
import { orderResearch } from "../shared/research-order.ts";
import type { ResearchOrder } from "../shared/research-order.ts";
import { renderOverview } from "./overview.ts";
import { clearCreativeDrafts, creativeSettingsPanel, openCreativeDraft } from "./creative-ui.ts";
import type { CreativeEditorContext, CreativeFields, ResearchCreativeValues, ScriptCreativeValues, StoryCreativeValues } from "../shared/creative-types.ts";
import { badge, createDialog, editorWorkspace, empty, formWithSave, heading, iconButton, mediaThumbnail, notice, panel, statusLabels } from "./components.ts";
import {editorTabs} from './ui-tabs.ts';
import { button, el, externalLink, field, icon, input, replace, select, textarea, setButtonLabel } from "./dom.ts";
import type { IconName } from "./dom.ts";
import type { AuthStatus, Bootstrap, Channel, Claim, Platform, Research, RevenueEntry, Script, ScriptScene, Source, Story, WebConfig, WebJob, YoutubeDiscovery } from "../shared/types.ts";

const root = document.querySelector<HTMLDivElement>("#app")!;
const toasts = el("div", { className: "studio-toast-region", role: "status", "aria-live": "polite" });
document.body.append(toasts);
let data: Bootstrap | undefined;
let channelId = new URLSearchParams(location.search).get("channel") || "";
let activePlatform: Platform = "youtube";
let activeScriptId = "";
let activeStoryId = "";
let loading = false;
let pollTimer: ReturnType<typeof setTimeout> | undefined;
let globalConfigScope = false;
let renderedHash = location.hash;
const discoveries = new Map<string, YoutubeDiscovery>();

const pages = {
  overview: { title: "Visão geral", icon: "grid", group: "Estúdio" },
  channels: { title: "Canais", icon: "channels", group: "" },
  research: { title: "Pesquisa de nichos", icon: "search", group: "Conteúdo" },
  scripts: { title: "Roteiros", icon: "script", group: "" },
  stories: { title: "Narrativas", icon: "story", group: "" },
  production: { title: "Produção", icon: "film", group: "" },
  analytics: { title: "Resultados", icon: "chart", group: "Operação" },
  connections: { title: "Contas conectadas", icon: "plug", group: "" },
  settings: { title: "Configurações", icon: "settings", group: "" },
} satisfies Record<string, { title: string; icon: IconName; group: string }>;
type Page = keyof typeof pages;
const platforms: Platform[] = ["youtube", "tiktok", "instagram", "facebook"];
const labels: Record<Platform, string> = { youtube: "YouTube", tiktok: "TikTok", instagram: "Instagram", facebook: "Facebook" };
function currentPage(): Page {
  const hash = location.hash.slice(1).split("?")[0];
  return Object.hasOwn(pages, hash) ? hash as Page : "overview";
}
function go(page: Page): void {
  protectEdits(() => {
    if (currentPage() === page) render();
    else location.hash = page;
  });
}
function currentChannel(): Channel | undefined { return data?.channels.find((channel) => channel.id === channelId); }
function scoped<T extends { channelId: string }>(items: T[]): T[] { return items.filter((item) => item.channelId === channelId); }
function channelPath(suffix = ""): string { return `/api/channels/${encodeURIComponent(channelId)}${suffix}`; }
function number(value: number | null | undefined): string { return value == null ? "—" : new Intl.NumberFormat("pt-BR").format(value); }
function date(value?: string | null): string {
  if (!value) return "Sem registro";
  const parsed = new Date(value);
  return Number.isNaN(parsed.valueOf()) ? "Data não disponível" : parsed.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function toast(message: string, error = false): void {
  const item = el("div", { className: `studio-toast ${error ? "studio-toast-error" : ""}`, role: error ? "alert" : "status" }, icon(error ? "circle" : "check"), message);
  toasts.append(item);
  setTimeout(() => item.remove(), 6500);
}
function requiredChannel(): HTMLElement | undefined {
  if (currentChannel()) return;
  return el("section", { className: "panel" }, empty("Comece pelo seu canal", "Crie uma identidade local para organizar suas pautas, conteúdos, conexões e resultados.", "channels", button("Adicionar canal", () => editChannel(), "primary", "plus")));
}
function creativeEditorButton(context: () => CreativeEditorContext, apply: (fields: CreativeFields) => void, getForm:()=>HTMLFormElement): HTMLButtonElement {
  const trigger=button("Desenvolver com IA", () => {
    const channel = currentChannel();
    if (!channel) { editChannel(); return; }
    const form=getForm();if(form.getAttribute('aria-busy')==='true')return;
    const workspace=form.closest('.editor-workspace')!;
    const actions=workspace.querySelector<HTMLElement>('.editor-actionbar')!;
    const host=el('section',{className:'assistant-host'});
    const close=()=>{host.remove();form.hidden=false;actions.hidden=false;if(trigger.isConnected)trigger.focus();};
    try {const snapshot = context();workspace.append(host);form.hidden=true;actions.hidden=true;openCreativeDraft(snapshot.task, channel.id, channel.name, { context: snapshot, onApply: apply,mount:{host,onClose:close} });}
    catch(error){close();toast(error instanceof Error ? error.message : "Não foi possível preparar o briefing.",true);}
  }, "secondary", "spark");
  return trigger;
}
function documentPicker(label:string,records:Array<{id:string;title:string}>,selected:string,onSelect:(id:string)=>void):HTMLElement {
  const options:Array<[string,string]>=records.map(record=>[record.id,record.title]);if(selected==='__new__')options.unshift(['__new__','Novo documento (não salvo)']);
  const picker=select('editor-document',options,selected);picker.setAttribute('aria-label',label);
  picker.addEventListener('change',()=>{const next=picker.value;picker.value=selected;protectEdits(()=>onSelect(next));});
  return el('div',{className:'editor-picker'},field(label,picker));
}
async function refresh(): Promise<void> {
  const incoming = await request<Bootstrap>("/api/bootstrap");
  data = incoming;
  setCsrfToken(incoming.csrfToken);
  if (!incoming.channels.some((channel) => channel.id === channelId)) channelId = incoming.channels[0]?.id || "";
  render();
  schedulePoll();
}
async function save(path: string, method: string, body: unknown): Promise<void> {
  await request(path, method, body);
  await refresh();
}
async function action(operation: () => Promise<unknown>, message: string): Promise<void> {
  try { await operation(); await refresh(); toast(message); }
  catch (error) { toast(error instanceof Error ? error.message : "A operação falhou.", true); }
}
function schedulePoll(): void {
  if (pollTimer) clearTimeout(pollTimer);
  if (data?.jobs.some((job) => job.status === "queued" || job.status === "running")) {
    pollTimer = setTimeout(() => {
      void request<Bootstrap>("/api/bootstrap").then((incoming) => {
        data = incoming;
        setCsrfToken(incoming.csrfToken);
        if (["overview", "production", "analytics"].includes(currentPage()) && !document.querySelector("dialog[open]") && !hasUnsavedEdits()) render();
        schedulePoll();
      }).catch(() => undefined);
    }, 4000);
  }
}

async function start(): Promise<void> {
  loading = true;
  try {
    const status = await request<AuthStatus>("/api/auth/status");
    setCsrfToken(status.csrfToken || "");
    if (status.authenticated) await refresh();
    else renderAuth(status.configured);
  } catch (error) {
    replace(root, el("main", { className: "initial-loading" }, empty("O estúdio ainda não respondeu", error instanceof Error ? error.message : "Verifique o servidor local.", "plug", button("Tentar novamente", () => { void start(); }, "primary", "refresh"))));
  } finally { loading = false; }
}

function renderAuth(configured: boolean): void {
  data = undefined;
  clearCreativeDrafts();
  document.querySelectorAll<HTMLDialogElement>("dialog[open]").forEach((dialog) => dialog.close());
  if (pollTimer) clearTimeout(pollTimer);
  const password = input("password", "", "password");
  password.required = true;
  password.minLength = configured ? 1 : 12;
  password.autocomplete = configured ? "current-password" : "new-password";
  password.setAttribute("data-testid", "auth-password");
  const confirmation = input("confirmation", "", "password");
  confirmation.autocomplete = "new-password";
  confirmation.required = !configured;
  const { form, fields } = formWithSave(configured ? "Entrar no estúdio" : "Criar acesso local", async () => {
    if (!configured && password.value !== confirmation.value) throw new Error("As senhas precisam ser iguais.");
    const secret = password.value;
    password.value = "";
    confirmation.value = "";
    const status = await request<AuthStatus>(`/api/auth/${configured ? "login" : "setup"}`, "POST", { password: secret });
    setCsrfToken(status.csrfToken || "");
    await refresh();
  });
  fields.append(field("Sua senha local", password, configured ? undefined : "Use pelo menos 12 caracteres."));
  if (!configured) fields.append(field("Confirme a senha", confirmation));
  const authBox = el("section", { className: "auth-box" }, el("h1", {}, configured ? "Entrar no Framechester" : "Configurar acesso local"), el("p", {}, configured ? "Use a senha desta instalação." : "Defina uma senha para proteger seus canais neste computador."), form, el("p", { className: "auth-privacy" }, "As credenciais das redes sociais ficam no cofre local."));
  replace(root, el("main", { className: "auth-layout" }, el("header",{className:"auth-brand"},brand()), el("div", { className: "auth-main" }, authBox),el("footer",{className:"auth-footer"},"Somente neste computador")));
  document.title = "Acesso local · Framechester";
}

function brand(): HTMLElement {
  return el("div", { className: "brand" }, icon("film"), el("span", { className: "brand-name" }, "Framechester"));
}

function render(): void {
  if (!data) return;
  const page = currentPage();
  document.title = `${pages[page].title} · Framechester`;
  const nav = el("nav", { className: "nav", "aria-label": "Navegação principal" });
  for (const [key, item] of Object.entries(pages)) {
    if (item.group) nav.append(el("div", { className: "nav-group-label" }, item.group));
    const link = el("a", { href: `#${key}`, className: "nav-item", "data-testid": `nav-${key}`, "aria-current": key === page ? "page" : undefined }, icon(item.icon), item.title);
    link.addEventListener("click", event => { event.preventDefault(); go(key as Page); sidebar.classList.remove("open"); mobile.setAttribute("aria-expanded", "false"); });
    nav.append(link);
  }
  const sidebar = el("aside", { className: "studio-sidebar" }, brand(), nav, el("div", { className: "studio-sidebar-bottom" }, el("span",{className:"field-hint"},"Execução local"),button("Sair", () => {
    protectEdits(() => { void request("/api/auth/logout", "POST", {}).then(async () => { setCsrfToken(""); await start(); toast("Sessão encerrada."); }).catch(() => toast("Não foi possível encerrar a sessão.", true)); });
  },"ghost","logout")));
  const picker = select("channel", data.channels.length ? data.channels.map((channel) => [channel.id, channel.name]) : [["", "Nenhum canal criado"]], channelId);
  picker.setAttribute("aria-label", "Canal selecionado");
  picker.setAttribute("data-testid", "channel-select");
  picker.addEventListener("change", () => {
    const selected = picker.value; picker.value = channelId;
    protectEdits(() => {
    channelId = selected;
    activeScriptId = "";
    activeStoryId = "";
    const url = new URL(location.href);
    url.searchParams.set("channel", channelId);
    history.replaceState(null, "", url);
    render();
    });
  });
  const mobile = iconButton("Abrir menu", "menu", () => {
    const opened = sidebar.classList.toggle("open");
    mobile.setAttribute("aria-expanded", String(opened));
    if(opened) sidebar.querySelector<HTMLAnchorElement>('a[aria-current="page"]')?.focus();
  });
  mobile.classList.add("mobile-menu");
  sidebar.id="primary-navigation";
  mobile.setAttribute("aria-controls",sidebar.id);
  mobile.setAttribute("aria-expanded","false");
  const engine = data.engine;
  const topbar = el("header", { className: "topbar" }, mobile, el("label", { className: "channel-picker" }, el("span", {}, "Canal"), picker),el("div", { className: "spacer" }),engine?.available===false?el("span",{className:"field-hint"},"Produção indisponível"):null, iconButton("Atualizar dados do estúdio", "refresh", () => protectEdits(() => { void action(async () => undefined, "Dados atualizados."); })));
  const content = el("main", { className: "content", id: "main-content", tabindex: "-1" });
  const renderers: Record<Page, () => HTMLElement> = { overview: overviewPage, channels: channelsPage, research: researchPage, scripts: scriptsPage, stories: storiesPage, production: productionPage, analytics: analyticsPage, connections: connectionsPage, settings: settingsPage };
  content.append(renderers[page]());
  const skip = el("a", { href: "#main-content", className: "skip-link" }, "Ir para o conteúdo");
  skip.addEventListener("click", (event) => { event.preventDefault(); content.focus(); });
  const shell=el("div", { className: "shell" }, sidebar, el("div", { className: "workspace" }, topbar, content));
  shell.addEventListener("keydown",event=>{if(event.key==="Escape"&&sidebar.classList.contains("open")){sidebar.classList.remove("open");mobile.setAttribute("aria-expanded","false");mobile.focus();}});
  replace(root, skip, shell);
  renderedHash = location.hash;
}

function stat(label: string, value: string, detail: string, name: IconName): HTMLElement {
  return el("div", { className: "stat-card" }, el("div", { className: "stat-label" }, icon(name), label), el("div", { className: "stat-value" }, value), el("div", { className: "stat-detail" }, detail));
}

function recordedCashPanel(): HTMLElement {
  const summaries = cashSummary(data!.receipts, channelId);
  const body = el("div", { className: "panel-body cash-panel", "data-testid": "recorded-cash" });
  if (!summaries.length) {
    body.append(el("div", { className: "cash-grid" }, dataTile("Recebimentos", "—", "Nenhum pagamento registrado"), dataTile("Custos", "—", "Nenhum custo registrado"), dataTile("Saldo entre registros", "—", "Requer recebimentos e custos na mesma moeda")));
  }
  for (const { currency, payments, costs, balance } of summaries) {
    body.append(el("div", { className: "cash-currency" }, el("span", { className: "badge", "data-variant": "secondary" }, currency), el("div", { className: "cash-grid" }, dataTile("Recebimentos", recordedMoney(payments, currency), "Pagamentos registrados pelo operador"), dataTile("Custos", recordedMoney(costs, currency), "Custos registrados pelo operador"), dataTile("Saldo entre registros", recordedMoney(balance, currency), "Recebimentos menos custos registrados"))));
  }
  body.append(el("p", { className: "field-hint cash-note" }, "Estimativas não entram neste resumo. O saldo considera os registros existentes; não representa lucro econômico nem conciliação automática da plataforma."));
  return panel("Recebimentos e custos", "Todas as redes. Valores registrados por você, separados por moeda.", body, button("Ver registros", () => go("analytics"), "ghost", "arrow"));
}

function overviewPage(): HTMLElement {
  return renderOverview(data!, channelId, {go,createResearch:()=>currentChannel()?editResearch():editChannel(),review:viewJob,editResearch,editScript:script=>{activeScriptId=script.id;go('scripts');}}, recordedCashPanel());
}
function networkMark(platform: Platform): SVGSVGElement { return icon(platform==='youtube'||platform==='tiktok'?'film':'channels'); }
function dataTile(label: string, value: string, detail: string): HTMLElement { return el("div", { className: "data-tile" }, el("div", { className: "data-tile-label" }, label), el("div", { className: "data-tile-value" }, value), el("div", { className: "data-tile-detail" }, detail)); }

function channelsPage(): HTMLElement {
  const channels = data!.channels;
  return el("div", {}, heading("Canais", "Organize público, proposta editorial e contas de cada canal.", button("Adicionar canal", () => editChannel(), "primary", "plus")), channels.length ? el("div", { className: "entity-grid" }, ...channels.map((channel) => el("article", { className: "panel entity-card", "data-testid": `channel-${channel.id}` }, el("div", { className: "entity-card-top" }, el("div", { className: "entity-card-icon" }, icon("channels")), channel.id === channelId ? el("span", { className: "badge", "data-variant": "secondary" }, "Selecionado") : el("span", { className: "badge", "data-variant": "outline" }, channel.language)), el("h3", {title:channel.name}, channel.name), el("p", {}, channel.description || "Descrição editorial ainda não definida."), el("div", { className: "entity-meta" }, el("span", { className: "tag" }, channel.niche || "Nicho a desenvolver"), el("span", { className: "tag mono" }, channel.id)), el("div", { className: "entity-card-bottom" }, button("Abrir canal", () => { channelId = channel.id; go("overview"); }, "ghost", "arrow"), el("div", { className: "card-actions" }, iconButton(`Editar ${channel.name}`, "edit", () => editChannel(channel)), iconButton(`Excluir ${channel.name}`, "trash", () => deleteRecord("channels", channel.id, channel.name))))))) : el("div", { className: "panel" }, empty("Crie seu primeiro canal", "Defina nome, público e proposta editorial. O conteúdo e as contas ficam separados por canal.", "channels", button("Criar canal", () => editChannel(), "primary", "plus"))));
}

function editChannel(record?: Channel): void {
  const { dialog, body } = createDialog(record ? "Editar canal" : "Criar canal", "A identidade e os arquivos deste canal ficam separados dos demais.");
  const name = input("name", record?.name || ""); name.required = true;
  const identifier = input("id", record?.id || ""); identifier.required = true; identifier.pattern = "[a-z0-9]([a-z0-9-]*[a-z0-9])?"; identifier.maxLength = 64; identifier.disabled = Boolean(record);
  identifier.setAttribute("data-testid", "channel-id"); name.setAttribute("data-testid", "channel-name");
  const description = textarea("description", record?.description || "", 3);
  const niche = input("niche", record?.niche || "");
  const audience = input("audience", record?.audience || "");
  const language = input("language", record?.language || "pt-BR"); language.required = true;
  const youtubeChannelId = input("youtubeChannelId", record?.youtubeChannelId || "");
  const { form, fields } = formWithSave(record ? "Salvar canal" : "Criar canal", async () => {
    const id = record?.id || identifier.value.trim();
    await save(record ? `/api/channels/${encodeURIComponent(id)}` : "/api/channels", record ? "PUT" : "POST", { id, name: name.value.trim(), description: description.value.trim(), niche: niche.value.trim(), audience: audience.value.trim(), language: language.value.trim(), youtubeChannelId: youtubeChannelId.value.trim() || undefined });
    channelId = id;
    dialog.close(); render(); toast(record ? "Canal atualizado." : "Canal criado. Seu próximo passo é desenvolver uma pauta.");
  }, () => dialog.close());
  fields.append(el("div", { className: "form-grid" }, field("Nome do canal", name), field("Identificador local", identifier, "Letras minúsculas, números e hífen no meio. Exemplo: ciencia."), field("Nicho editorial", niche), field("Público que você quer alcançar", audience), field("Idioma", language), field("ID do canal no YouTube (opcional)", youtubeChannelId)));
  fields.append(field("Descrição e proposta editorial", description));
  body.append(form);
}

function deleteRecord(kind: "channels" | "research" | "scripts" | "stories" | "receipts", id: string, title: string): void {
  const { dialog, body } = createDialog("Excluir este registro?", title);
  body.append(el("p", { className: "muted" }, kind === "channels" ? "A exclusão pode ser bloqueada se o canal tiver conteúdo ou conexões vinculadas. Confira o registro antes de continuar." : "Este registro será removido do estado local. Arquivos de produção seguem a política do servidor."));
  const { form } = formWithSave("Excluir registro", async () => {
    await request(`/api/${kind}/${encodeURIComponent(id)}${kind === "channels" ? "" : `?channel_id=${encodeURIComponent(channelId)}`}`, "DELETE");
    dialog.close(); await refresh(); toast("Registro excluído.");
  }, () => dialog.close());
  body.append(form);
}

function statusControl(value = "draft"): HTMLSelectElement {
  return select("status", [["draft", "Rascunho"], ["reviewed", "Revisado pelo operador"], ["archived", "Arquivado"]], value);
}

function sourceEditor(initial: Source[]): { node: HTMLElement; read: () => Source[]; write: (values: Source[]) => void } {
  const container = el("div");
  const rows: Array<{ node: HTMLElement; read: () => Source }> = [];
  function add(source?: Source): void {
    const title = input("source-title", source?.title || ""); title.required = true;
    const url = input("source-url", source?.url || "", "url"); url.required = true;
    const publisher = input("source-publisher", source?.publisher || ""); publisher.required = true;
    const retrievedAt = input("source-retrievedAt", source?.retrievedAt?.slice(0, 10) || "", "date"); retrievedAt.required = true;
    const license = input("source-license", source?.license || ""); license.required = true;
    const node = el("div", { className: "source-card" }, el("div", { className: "source-card-head" }, icon("folder"), "Fonte documental", el("span", { className: "spacer" }), iconButton("Remover esta fonte", "trash", () => node.remove())), el("div", { className: "form-grid" }, field("Título da fonte", title), field("URL", url), field("Publicador", publisher), field("Consultada em", retrievedAt), el("div", { className: "full" }, field("Condição de uso / referência", license, "Consultar um documento não autoriza reproduzir sua mídia. Registre a condição real de uso."))));
    rows.push({ node, read: () => ({ title: title.value.trim(), url: url.value.trim(), publisher: publisher.value.trim(), retrievedAt: retrievedAt.value, license: license.value.trim() }) });
    container.append(node);
  }
  initial.forEach(add);
  return {
    node: el("div", {}, el("div", { className: "editor-section-heading" }, el("h3", {}, "Fontes e referências"), button("Adicionar fonte", () => add(), "ghost", "plus")), container),
    read: () => rows.filter((row) => row.node.parentElement === container).map((row) => row.read()),
    write: values => { container.replaceChildren(); rows.splice(0); values.forEach(add); },
  };
}

function claimsEditor(initial: Claim[]): { node: HTMLElement; read: () => Claim[]; write: (values: Claim[]) => void } {
  const container = el("div");
  const rows: Array<{ node: HTMLElement; read: () => Claim }> = [];
  function add(claim?: Claim): void {
    const text = textarea("claim-text", claim?.text || "", 2); text.required = true;
    const status = select("claim-status", [["unverified", "Não verificado"], ["cited", "Citado — requer conferência"], ["contradicted", "Contraditório — bloqueio editorial"]], claim?.status || "unverified");
    const urls = textarea("claim-sourceUrls", claim?.sourceUrls.join("\n") || "", 2);
    const node = el("div", { className: "claim-card" }, el("div", { className: "source-card-head" }, "Alegação verificável", el("span", { className: "spacer" }), iconButton("Remover esta alegação", "trash", () => node.remove())), el("div", { className: "form-stack" }, field("O que está sendo afirmado?", text), el("div", { className: "form-grid" }, field("Estado da evidência", status), field("URLs que sustentam a alegação", urls, "Uma por linha. Use URLs presentes nas fontes do roteiro."))));
    rows.push({ node, read: () => ({ text: text.value.trim(), status: status.value as Claim["status"], sourceUrls: urls.value.split("\n").map((url) => url.trim()).filter(Boolean) }) });
    container.append(node);
  }
  initial.forEach(add);
  return { node: el("div", {}, el("div", { className: "editor-section-heading" }, el("h3", {}, "Alegações & evidências"), button("Adicionar alegação", () => add(), "ghost", "plus")), container), read: () => rows.filter((row) => row.node.parentElement === container).map((row) => row.read()), write: values => { container.replaceChildren(); rows.splice(0); values.forEach(add); } };
}

function researchPage(): HTMLElement {
  const missing = requiredChannel();
  if (missing) return missing;
  const records = scoped(data!.research);
  const cards = el("div", { className: "entity-grid" });
  const query = input("search-research"); query.placeholder = "Buscar pauta, nicho ou palavra-chave…"; query.setAttribute("aria-label", "Buscar pautas e nichos");
  const order = select('research-order',[['recent','Atualização recente'],['feasibility','Minha viabilidade: maior primeiro'],['demand','Minha demanda: maior primeiro'],['competition','Minha competição: menor primeiro']],'recent');order.setAttribute('aria-label','Ordenar pautas');
  function show(): void {
    const term = query.value.trim().toLocaleLowerCase("pt-BR");
    const filtered = orderResearch(records.filter((record) => `${record.title} ${record.niche} ${record.keywords.join(" ")}`.toLocaleLowerCase("pt-BR").includes(term)),order.value as ResearchOrder);
    replace(cards, ...filtered.map((record) => {
      const actions = el("div", { className: "card-actions" },
        iconButton(`Editar ${record.title}`, "edit", () => editResearch(record)),
        iconButton(`Excluir ${record.title}`, "trash", () => deleteRecord("research", record.id, record.title)),
      );
      return el("article", { className: "panel entity-card" },
        el("div", { className: "entity-card-top" }, el("div", { className: "entity-card-icon" }, icon("search")), badge(record.status)),
        el("h3", {title:record.title}, record.title), el("p", {}, record.hypothesis || "Hipótese ainda não descrita."),
        el("div", { className: "entity-meta" }, el("span", { className: "tag" }, record.niche || "Nicho em desenvolvimento"), el("span", { className: "tag" }, `${record.sources.length} fonte(s)`),order.value==='recent'?null:el('span',{className:'tag'},`Nota manual: ${order.value==='demand'?record.demandScore:order.value==='competition'?record.competitionScore:record.feasibilityScore}/100`)),
        el("div", { className: "entity-card-bottom" }, button("Desenvolver roteiro", () => startScript(record.id), "ghost", "arrow"), actions),
      );
    }));
    if (!filtered.length) cards.append(el("section", { className: "panel full" }, empty(term ? "Nenhum resultado nesta busca" : "Nenhuma pauta neste canal", term ? "Tente outro termo ou limpe a busca." : "Registre a pergunta do vídeo, o público e as fontes que você pretende conferir.", "search", !term ? button("Criar primeira pauta", () => editResearch(), "primary", "plus") : undefined)));
  }
  query.addEventListener("input", show);order.addEventListener('change',show); show();
  return el("div", {}, heading("Pesquisa de nichos", "Investigue o público, registre hipóteses e compare fontes.", button("Nova hipótese de nicho", () => editResearch(undefined, true), "secondary", "spark"), button("Nova pauta", () => editResearch(), "primary", "plus")), discoveryPanel(), el("div", { className: "section-label" }, el("h2", {}, "Sua pesquisa editorial"), el("span", {}, "Hipóteses, referências e próximos passos")), el("div", { className: "toolbar" }, query,order, el("span", { className: "toolbar-caption" }, `${records.length} registro(s) neste canal`)), cards);
}

function editResearch(record?: Research, nicheMode = false, prefill: Partial<Research> = {}): void {
  if (!currentChannel()) { editChannel(); return; }
  const { dialog, body } = createDialog(record ? "Desenvolver esta pauta" : nicheMode ? "Explorar uma hipótese de nicho" : "Criar pauta", "Registre o que você observou e o que ainda precisa investigar.");
  const title = input("title", record?.title || prefill.title || ""); title.required = true; title.setAttribute("data-testid", "research-title");
  const niche = input("niche", record?.niche || currentChannel()?.niche || "");
  const audience = input("audience", record?.audience || currentChannel()?.audience || "");
  const hypothesis = textarea("hypothesis", record?.hypothesis || "", 3);
  const differentiation = textarea("differentiation", record?.differentiation || "", 3);
  const keywords = input("keywords", record?.keywords.join(", ") || "");
  const notes = textarea("notes", record?.notes || "", 3);
  const status = statusControl(record?.status);
  const demand = input("demandScore", String(record?.demandScore ?? 0), "number");
  const competition = input("competitionScore", String(record?.competitionScore ?? 0), "number");
  const feasibility = input("feasibilityScore", String(record?.feasibilityScore ?? 0), "number");
  for (const control of [demand, competition, feasibility]) { control.min = "0"; control.max = "100"; control.step = "1"; }
  const sources = sourceEditor(record?.sources || prefill.sources || []);
  const owner = channelId;
  const readCreative = (): ResearchCreativeValues => ({title:title.value.trim(),niche:niche.value.trim(),audience:audience.value.trim(),hypothesis:hypothesis.value.trim(),differentiation:differentiation.value.trim(),keywords:keywords.value.split(',').map(word=>word.trim()).filter(Boolean),sources:sources.read(),notes:notes.value.trim()});
  const ai = creativeEditorButton(() => ({task:'research',values:readCreative()}), result => {
    if(!form.isConnected||channelId!==owner||!('hypothesis' in result))throw new Error('A pauta mudou. Abra o assistente a partir do editor atual.');
    title.value=result.title;niche.value=result.niche;audience.value=result.audience;hypothesis.value=result.hypothesis;differentiation.value=result.differentiation;keywords.value=result.keywords.join(', ');notes.value=result.notes;status.value='draft';publicSearch.href=`https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
    toast('Rascunho nos campos. Revise as fontes e salve a pauta.');
  },()=>form);
  const publicSearch = el("a", { className: "btn button", "data-variant":"ghost", target: "_blank", rel: "noopener noreferrer", href: "https://www.google.com/" }, icon("external"), "Abrir pesquisa pública");
  title.addEventListener("input", () => { publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`; });
  if (title.value) publicSearch.href = `https://www.google.com/search?q=${encodeURIComponent(title.value)}`;
  const { form, fields, actions } = formWithSave("Salvar pesquisa", async () => {
    await save(record ? `/api/research/${encodeURIComponent(record.id)}` : "/api/research", record ? "PUT" : "POST", { channelId, ...readCreative(), demandScore: Number(demand.value), competitionScore: Number(competition.value), feasibilityScore: Number(feasibility.value), status: status.value });
    dialog.close(); toast("Pesquisa salva no canal selecionado.");
  });
  const researchTabs=editorTabs('Partes da pauta',[
    {key:'brief',label:'Pauta',content:el('div',{className:'form-stack'},field(nicheMode?'Hipótese de nicho':'Pergunta ou título de trabalho',title),el('div',{className:'form-grid'},field('Nicho',niche),field('Público',audience)),field('Hipótese de interesse do público',hypothesis),field('Contribuição original',differentiation),field('Palavras-chave',keywords),field('Notas e próximos passos',notes))},
    {key:'sources',label:'Fontes',content:el('div',{className:'form-stack'},publicSearch,sources.node,field('Estado editorial',status,'Aplicar IA devolve a pauta para rascunho.'))},
    {key:'priority',label:'Priorização',content:el('fieldset',{className:'fieldset'},el('legend',{},'Minha avaliação'),el('p',{className:'field-hint'},'Opcional. Notas manuais para ordenar pautas; não representam medição de mercado.'),el('div',{className:'form-grid'},field('Demanda percebida',demand),field('Competição percebida',competition),field('Viabilidade de produção',feasibility)))}]);
  fields.append(researchTabs.node);
  body.append(editorWorkspace(form,actions,ai,'Editor da pauta'));
}

function discoveryPanel(): HTMLElement {
  const discoveryChannelId = channelId;
  const saved = discoveries.get(discoveryChannelId);
  const query = input("discovery-query", saved?.query || "");
  query.required = true; query.minLength = 2; query.maxLength = 120;
  query.placeholder = "Uma pergunta, um assunto ou um nicho…";
  query.setAttribute("aria-label", "Tema para pesquisar no YouTube");
  query.setAttribute("data-testid", "discovery-query");
  const submit = button("Consultar YouTube", () => {}, "primary", "search"); submit.type = "submit"; submit.dataset.testid = "discovery-submit";
  const error = el("div", { className: "alert form-error", role: "alert", hidden: true });
  const results = el("div");
  const queryForm = el("form", { className: "research-query" }, query, submit);
  const resultBody = el("div", { className: "panel-body" }, queryForm, el("p", { className: "field-hint research-quota" }, "Consulta explícita à API oficial. Usa a quota do seu projeto e requer uma conexão autorizada do YouTube."), error, results);
  const drawResults = (response: YoutubeDiscovery): void => {
    const heading = el("div", { className: "discovery-heading" }, el("span", {}, `${response.items.length} vídeo(s) nesta amostra pública`), el("span", { className: "field-hint" }, `Fonte: YouTube Data API · ${date(response.queriedAt)}`));
    const items = response.items.map((item) => el("article", { className: "discovery-item" }, el("div", { className: "discovery-icon" }, networkMark("youtube")), el("div", { className: "discovery-copy" }, externalLink(item.title, item.url), el("p", { className: "field-hint" }, `${item.channelTitle} · Publicado em ${date(item.publishedAt)}`), el("div", { className: "entity-meta" }, el("span", { className: "tag" }, `${number(item.views)} views`), el("span", { className: "tag" }, `${number(item.likes)} likes`), el("span", { className: "tag" }, `${number(item.comments)} comentários`))), button("Usar como referência", () => editResearch(undefined, false, { title: `Investigar: ${item.title}`, sources: [{ title: item.title, url: item.url, publisher: item.channelTitle, retrievedAt: response.queriedAt.slice(0, 10), license: "Referência ao vídeo; licença de reprodução não verificada" }] }), "secondary", "plus")));
    replace(results, heading, ...items, !items.length ? empty("Nenhum vídeo retornado para esta consulta", "Tente uma pergunta mais específica. Ausência nesta amostra não demonstra ausência de audiência.", "search") : null, el("p", { className: "field-hint discovery-note" }, response.note));
  };
  if (saved) drawResults(saved);
  queryForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!queryForm.reportValidity() || submit.disabled) return;
    submit.disabled = true; setButtonLabel(submit,"Consultando…"); error.hidden = true;
    queryForm.setAttribute("aria-busy", "true");
    try {
      const connection = scoped(data!.connections).find((entry) => entry.platform === "youtube");
      if (connection?.status !== "connected") throw new Error("Conecte a conta do YouTube deste canal para consultar a API. A pesquisa editorial manual continua disponível abaixo.");
      const response = await request<YoutubeDiscovery>(`/api/channels/${encodeURIComponent(discoveryChannelId)}/research/discover`, "POST", { query: query.value.trim() });
      discoveries.set(discoveryChannelId, response); drawResults(response);
    } catch (failure) {
      replace(error, failure instanceof Error ? failure.message : "A consulta não foi concluída.", el("div", {}, button("Ir para conexões", () => { activePlatform = "youtube"; go("connections"); }, "ghost", "plug")));
      error.hidden = false;
    } finally { submit.disabled = false; setButtonLabel(submit,"Consultar YouTube","search"); queryForm.removeAttribute("aria-busy"); }
  });
  return panel("Explore o que está sendo publicado", "Uma amostra real para investigar perguntas e desenvolver um ângulo próprio.", resultBody);
}

let draftResearchId = "";
function startScript(researchId = ""): void { protectEdits(() => { draftResearchId = researchId; activeScriptId = "__new__"; go("scripts"); }); }

function sceneEditor(initial: ScriptScene[]): { node: HTMLElement; read: () => ScriptScene[]; write: (values: ScriptScene[]) => void } {
  const container = el("div");
  const rows: Array<{ node: HTMLElement; id: number; read: () => ScriptScene }> = [];
  function add(scene?: ScriptScene): void {
    const id = scene?.id ?? (rows.length ? Math.max(...rows.map((row) => row.id)) + 1 : 0);
    const title = input("scene-heading", scene?.heading || ""); title.required = true;
    const narration = textarea("scene-narration", scene?.narration || "", 4); narration.required = true; narration.setAttribute("data-testid", `scene-${id}-narration`);
    const visual = textarea("scene-visual", scene?.visualBrief || "", 3); visual.required = true;
    const duration = input("scene-duration", String(scene?.durationHintSecs ?? 20), "number"); duration.min = "0.1"; duration.step = "0.1"; duration.required = true;
    const count = el("span", { className: "field-hint" });
    const updateCount = () => { count.textContent = `${narration.value.trim().split(/\s+/).filter(Boolean).length} palavra(s) · duração final medida na narração`; };
    narration.addEventListener("input", updateCount); updateCount();
    const node = el("section", { className: "scene-card" }, el("div", { className: "scene-top" }, el("span", { className: "scene-number" }, String(id + 1).padStart(2, "0")), el("h3", {}, `Cena ${id + 1}`), el("span", { className: "spacer" }), iconButton(`Remover cena ${id + 1}`, "trash", () => node.remove())), el("div", { className: "form-stack" }, el("div", { className: "form-grid" }, field("Título da cena", title), field("Duração estimada (segundos)", duration)), field("Narração autoral", narration), count, field("O que aparece na tela?", visual, "Descreva a função do visual e os recursos necessários para explicar a ideia.")));
    rows.push({ node, id, read: () => ({ id, heading: title.value.trim(), narration: narration.value.trim(), visualBrief: visual.value.trim(), durationHintSecs: Number(duration.value) }) });
    container.append(node);
  }
  initial.forEach(add);
  return { node: el("div", {}, el("div", { className: "editor-section-heading" }, el("h3", {}, "Roteiro cena a cena"), button("Adicionar cena", () => add(), "ghost", "plus")), container), read: () => rows.filter((row) => row.node.parentElement === container).map((row) => row.read()), write: values => { container.replaceChildren(); rows.splice(0); values.forEach(add); } };
}

function scriptsPage(): HTMLElement {
  const missing = requiredChannel(); if (missing) return missing;
  const records = scoped(data!.scripts);
  if (activeScriptId !== "__new__" && !records.some((entry) => entry.id === activeScriptId)) activeScriptId = records[0]?.id || "";
  const record = records.find((entry) => entry.id === activeScriptId);
  const list = el("aside", { className: "panel editor-list", "aria-label": "Roteiros deste canal" }, ...records.map((entry) => {
    const item = el("button", { type: "button", className: `editor-list-item ${entry.id === activeScriptId ? "active" : ""}` }, el("span", { className: "editor-list-title", title:entry.title }, entry.title), el("span", { className: "editor-list-caption" }, `${entry.format === "short" ? "Curto" : "Longo"} · ${entry.scenes.length} cena(s)`));
    item.addEventListener("click", () => protectEdits(() => { activeScriptId = entry.id; render(); })); return item;
  }));
  const editor = record || activeScriptId === "__new__" ? scriptForm(record) : el("section", { className: "panel" }, empty("Nenhum roteiro neste canal", "Escreva uma narrativa autoral, organize as cenas e conecte cada alegação às suas fontes.", "script", button("Criar roteiro", () => startScript(), "primary", "plus")));
  return el("div", {}, heading("Roteiros", "Transforme a pauta em falas, cenas e fontes que você pode conferir.", button("Novo roteiro", () => startScript(), "primary", "plus")),records.length?documentPicker('Roteiro selecionado',records,activeScriptId,id=>{activeScriptId=id;render();}):null, el("div", { className: "editor-layout" }, list, editor));
}

function scriptForm(record?: Script): HTMLElement {
  const research = scoped(data!.research);
  const startingResearch = research.find((entry) => entry.id === (record?.researchId || draftResearchId));
  const title = input("title", record?.title || startingResearch?.title || ""); title.required = true; title.setAttribute("data-testid", "script-title");
  const topicId = input("topicId", record?.topicId || `topico-${crypto.randomUUID()}`); topicId.required = true;
  const researchId = select("researchId", [["", "Sem pauta vinculada"], ...research.map((entry): [string, string] => [entry.id, entry.title])], record?.researchId || draftResearchId);
  const series = input("series", record?.series || currentChannel()?.niche || "principal"); series.required = true;
  const format = select("format", [["short", "Curto · 65 a 90 segundos"], ["long", "Longo · 7 a 12 minutos"]], record?.format || "short");
  const hook = textarea("hook", record?.hook || "", 2); hook.required = true;
  const status = statusControl(record?.status);
  const scenes = sceneEditor(record?.scenes || [{ id: 0, heading: "Abertura", narration: "", visualBrief: "", durationHintSecs: 20 }]);
  const sources = sourceEditor(record?.sources || startingResearch?.sources || []);
  const claims = claimsEditor(record?.claims || []);
  const crossed = input("crossChecked", "", "checkbox"); crossed.checked = record?.crossChecked ?? false; crossed.setAttribute("data-testid", "script-cross-checked");
  const owner = channelId;
  const readCreative = (): ScriptCreativeValues => ({title:title.value.trim(),researchId:researchId.value||undefined,series:series.value.trim(),format:format.value==='long'?'long':'short',hook:hook.value.trim(),scenes:scenes.read(),sources:sources.read(),claims:claims.read()});
  const ai = creativeEditorButton(() => ({task:'script',values:readCreative()}), result => {
    if(!form.isConnected||channelId!==owner||!('scenes' in result))throw new Error('O roteiro mudou. Abra o assistente a partir do editor atual.');
    title.value=result.title;series.value=result.series;format.value=result.format;hook.value=result.hook;scenes.write(result.scenes);sources.write(result.sources);claims.write(result.claims.map(claim=>({...claim,status:'unverified'})));status.value='draft';crossed.checked=false;
    toast('Rascunho nos campos. Confira novamente as alegações e as fontes antes de produzir.');
  },()=>form);
  const { form, fields, actions } = formWithSave("Salvar roteiro", async () => {
    const savingChannelId = channelId;
    const sceneValues = scenes.read();
    if (!sceneValues.length) throw new Error("Adicione pelo menos uma cena ao roteiro.");
    const response = await request<Script>(record ? `/api/scripts/${encodeURIComponent(record.id)}` : "/api/scripts", record ? "PUT" : "POST", { channelId, ...readCreative(), topicId: topicId.value.trim(), status: status.value, crossChecked: crossed.checked });
    if (channelId === savingChannelId) { activeScriptId = response.id || record?.id || ""; draftResearchId = ""; }
    await refresh(); toast("Roteiro salvo. A aprovação editorial continua independente do salvamento.");
  });
  const scriptTabs=editorTabs('Partes do roteiro',[
    {key:'brief',label:'Briefing',content:el('div',{className:'form-stack'},field('Título do vídeo',title),el('div',{className:'form-grid'},field('Pauta vinculada',researchId),field('Série',series),field('Formato',format),field('Estado editorial',status)),field('Gancho de abertura',hook))},
    {key:'scenes',label:'Cenas',content:scenes.node},
    {key:'review',label:'Fontes e revisão',content:el('div',{className:'form-stack'},sources.node,claims.node,el('label',{className:'checkbox-field'},crossed,'Conferi e cruzei as fontes desta pauta'),el('p',{className:'field-hint'},'Esta é uma declaração do operador. Salvar não aprova fatos, direitos ou publicação.'),el('div',{className:'accordion'},el('details',{},el('summary',{},'Identificação técnica'),el('section',{},field('ID do tópico no motor',topicId)))),record?button('Excluir roteiro',()=>deleteRecord('scripts',record.id,record.title),'danger','trash'):null)}]);
  fields.append(scriptTabs.node);
  return el("section", { className: "panel editor-body" },editorWorkspace(form,actions,ai,'Editor do roteiro'));
}

function storiesPage(): HTMLElement {
  const missing = requiredChannel(); if (missing) return missing;
  const records = scoped(data!.stories);
  if (activeStoryId !== "__new__" && !records.some((entry) => entry.id === activeStoryId)) activeStoryId = records[0]?.id || "";
  const record = records.find((entry) => entry.id === activeStoryId);
  const newStory = () => protectEdits(() => { activeStoryId = "__new__"; render(); });
  const list = el("aside", { className: "panel editor-list", "aria-label": "Histórias deste canal" }, ...records.map((entry) => {
    const node = el("button", { type: "button", className: `editor-list-item ${entry.id === activeStoryId ? "active" : ""}` }, el("span", { className: "editor-list-title", title:entry.title }, entry.title), el("span", { className: "editor-list-caption" }, entry.scriptId ? "Vinculado a um roteiro" : "Arco em desenvolvimento"));
    node.addEventListener("click", () => protectEdits(() => { activeStoryId = entry.id; render(); })); return node;
  }));
  const editor = record || activeStoryId === "__new__" ? storyForm(record) : el("section", { className: "panel" }, empty("Nenhuma narrativa neste canal", "Desenvolva a progressão da informação antes de preencher o vídeo de cenas.", "story", button("Desenvolver arco", newStory, "primary", "plus")));
  return el("div", {}, heading("Narrativas", "Dê à história uma pergunta clara e uma resolução que cumpre a promessa.", button("Novo arco narrativo", newStory, "primary", "plus")),records.length?documentPicker('Narrativa selecionada',records,activeStoryId,id=>{activeStoryId=id;render();}):null, el("div", { className: "editor-layout" }, list, editor));
}

function storyForm(record?: Story): HTMLElement {
  const title = input("title", record?.title || ""); title.required = true;
  const script = select("scriptId", [["", "Sem roteiro vinculado"], ...scoped(data!.scripts).map((entry): [string, string] => [entry.id, entry.title])], record?.scriptId || "");
  const hook = textarea("hook", record?.hook || "", 3);
  const setup = textarea("setup", record?.setup || "", 3);
  const conflict = textarea("conflict", record?.conflict || "", 3);
  const turningPoint = textarea("turningPoint", record?.turningPoint || "", 3);
  const resolution = textarea("resolution", record?.resolution || "", 3);
  const cta = textarea("cta", record?.cta || "", 2);
  const owner = channelId;
  const readCreative = (): StoryCreativeValues => ({title:title.value.trim(),scriptId:script.value||undefined,hook:hook.value.trim(),setup:setup.value.trim(),conflict:conflict.value.trim(),turningPoint:turningPoint.value.trim(),resolution:resolution.value.trim(),cta:cta.value.trim()});
  const ai = creativeEditorButton(() => ({task:'story',values:readCreative()}), result => {
    if(!form.isConnected||channelId!==owner||!('resolution' in result))throw new Error('A narrativa mudou. Abra o assistente a partir do editor atual.');
    title.value=result.title;hook.value=result.hook;setup.value=result.setup;conflict.value=result.conflict;turningPoint.value=result.turningPoint;resolution.value=result.resolution;cta.value=result.cta;
    toast('Narrativa nos campos. Revise e salve; as cenas do roteiro não foram alteradas.');
  },()=>form);
  const { form, fields, actions } = formWithSave("Salvar arco narrativo", async () => {
    const savingChannelId = channelId;
    const response = await request<Story>(record ? `/api/stories/${encodeURIComponent(record.id)}` : "/api/stories", record ? "PUT" : "POST", { channelId,...readCreative() });
    if (channelId === savingChannelId) activeStoryId = response.id || record?.id || "";
    await refresh(); toast("Arco narrativo salvo.");
  });
  const storyTabs=editorTabs('Partes da narrativa',[
    {key:'opening',label:'Abertura',content:el('div',{className:'form-stack'},field('Nome desta história',title),field('Roteiro vinculado',script),field('Gancho',hook),field('Contexto',setup))},
    {key:'arc',label:'Desenvolvimento',content:el('div',{className:'form-stack'},field('Tensão',conflict),field('Descoberta',turningPoint))},
    {key:'ending',label:'Desfecho',content:el('div',{className:'form-stack'},field('Resolução',resolution),field('Próximo passo para o espectador',cta),el('p',{className:'field-hint'},'O arco organiza a história. Para mudar a fala final, edite as cenas do roteiro.'),record?button('Excluir narrativa',()=>deleteRecord('stories',record.id,record.title),'danger','trash'):null)}]);
  fields.append(storyTabs.node);
  return el("section", { className: "panel editor-body" },editorWorkspace(form,actions,ai,'Editor da narrativa'));
}

function platformTabs(): HTMLElement {
  return el("div", { className: "network-tabs", role: "group", "aria-label": "Rede social" }, ...platforms.map((platform) => {
    const tab = button(labels[platform], () => {}, "ghost"); tab.classList.add("network-tab"); tab.setAttribute("aria-pressed", String(activePlatform === platform)); tab.dataset.testid = `platform-${platform}`;
    tab.addEventListener("click", () => { activePlatform = platform; render(); document.querySelector<HTMLButtonElement>(`[data-testid="platform-${platform}"]`)?.focus(); }); return tab;
  }));
}

function connectionsPage(): HTMLElement {
  const missing = requiredChannel(); if (missing) return missing;
  const platform = activePlatform;
  const capability = data!.capabilities.find((entry) => entry.platform === platform);
  const connection = scoped(data!.connections).find((entry) => entry.platform === platform);
  const connected = connection?.status === "connected";
  const content = el("div", { className: "panel-body" }, el("div", { className: "connection-account" }, networkMark(platform), el("div", {}, el("h3", {title:connection?.displayName || labels[platform]}, connection?.displayName || labels[platform]), el("p", { className: "field-hint" }, connection?.accountId || "Nenhuma conta vinculada neste canal")), el("span", { className: "spacer" }), badge(connection?.status || "disconnected")));
  if (connection) content.append(el("p", { className: "field-hint" }, `Conexão: ${date(connection.connectedAt)}${connection.expiresAt ? ` · Expiração: ${date(connection.expiresAt)}` : ""}`), el("div", { className: "entity-meta" }, ...connection.scopes.map((scope) => el("span", { className: "tag mono" }, scope))));
  if (connection?.message) content.append(el("div", { className: "notice" }, icon("circle"), connection.message));
  if (connected) content.append(el("div", { className: "form-actions" }, button("Consultar métricas", () => { void action(() => request(channelPath(`/connections/${platform}/sync`), "POST", {}), "Consulta concluída. Confira os dados e seus períodos em Análises."); }, "primary", "refresh"), button("Remover vínculo local", () => disconnectPlatform(platform), "secondary", "plug")));
  else if (capability) {
    const account = input("accountId", connection?.accountId || currentChannel()?.youtubeChannelId || ""); account.required = true;
    const secret = input(platform === "youtube" ? "clientSecret" : "accessToken", "", "password"); secret.required = true; secret.autocomplete = "off";
    const clientId = input("clientId"); clientId.autocomplete = "off";
    const expires = input("expiresAt", "", "datetime-local");
    const scopes = input("scopes", "");
    const result = el("div");
    const { form, fields } = formWithSave(platform === "youtube" ? "Preparar autorização OAuth" : "Salvar vínculo no servidor local", async () => {
      const secretValue = secret.value; secret.value = "";
      const clientValue = clientId.value; clientId.value = "";
      try {
        if (platform === "youtube") {
          const response = await request<{ authorizationUrl: string; expiresAt: string }>(channelPath("/connections/youtube/oauth"), "POST", { accountId: account.value.trim(), clientId: clientValue.trim(), clientSecret: secretValue });
          const url = new URL(response.authorizationUrl);
          if (url.protocol !== "https:" || url.hostname !== "accounts.google.com") throw new Error("Destino de autorização inesperado.");
          replace(result, notice("Autorize a conta correta no Google. O vínculo só será confirmado após o retorno ao servidor local."), el("p", { className: "field-hint" }, `Autorização válida até ${date(response.expiresAt)}`), externalLink("Continuar no Google", url.href));
          toast("Autorização preparada. Continue pelo link do Google.");
        } else {
          await request(channelPath(`/connections/${platform}/token`), "POST", { accountId: account.value.trim(), accessToken: secretValue, expiresAt: expires.value ? new Date(expires.value).toISOString() : undefined, scopes: scopes.value.split(/[,\n]/).map((scope) => scope.trim()).filter(Boolean) });
          await refresh(); toast("Vínculo salvo no servidor local. Consulte a rede para verificar seus dados.");
        }
      } catch { throw new Error("Não foi possível concluir a conexão. Confira o identificador, a credencial e os requisitos do provedor; o segredo foi removido do formulário."); }
    });
    fields.append(field(platform === "youtube" ? "ID do canal no YouTube" : "ID da conta no provedor", account));
    if (platform === "youtube") {
      clientId.required = true;
      fields.append(field("OAuth Client ID", clientId), field("OAuth Client Secret", secret), notice("Use o cliente OAuth configurado para esta instalação. A autorização ocorre no Google; senhas da sua conta não são solicitadas aqui."));
    } else fields.append(field("Token de acesso oficial", secret, "Enviado apenas ao servidor local e removido deste formulário após o envio."), el("div", { className: "form-grid" }, field("Expiração (se conhecida)", expires), field("Escopos concedidos", scopes, "Separe os escopos por vírgula.")));
    content.append(el("div", { className: "divider" }), form, result);
  } else content.append(notice("A capacidade desta integração não foi informada pelo servidor. Atualize o estúdio antes de configurar uma conexão."));
  const requirements = el("div", { className: "panel-body" }, el("div", { className: "capability-row" }, el("span", { className: `badge ${capability?.metricsAvailable ? "badge-green" : ""}` }, capability?.metricsAvailable ? "Métricas disponíveis" : "Métricas indisponíveis"), el("span", { className: `badge ${capability?.revenueAvailable ? "badge-violet" : ""}` }, capability?.revenueAvailable ? "Receita sujeita a escopo" : "Sem receita nesta API"), el("span", { className: "badge" }, capability?.publishingAvailable ? "Publicação exige autorização" : "Publicação não implementada")), el("div", { className: "divider" }), el("ul", { className: "requirements" }, ...(capability?.requirements || []).map((item) => el("li", {}, icon("circle"), item))), el("p", { className: "field-hint" }, capability?.revenueNote || "As informações dependem das permissões e funcionalidades do provedor."), capability?.docsUrl ? el("div", { className: "form-actions" }, externalLink("Documentação oficial", capability.docsUrl)) : null);
  return el("div", {}, heading("Contas conectadas", "Cada rede, com a conta e as permissões certas."), platformTabs(), el("div", { className: "connection-layout" }, panel(`Conectar ao ${labels[platform]}`, `Vínculo exclusivo de ${currentChannel()!.name}.`, content), panel("O que esta integração permite", "Capacidades informadas pelo servidor.", requirements)));
}

function disconnectPlatform(platform: Platform): void {
  const { dialog, body } = createDialog("Remover este vínculo local?", `${labels[platform]} · ${currentChannel()?.name}`);
  body.append(el("p", { className: "muted" }, "A credencial deste vínculo será removida da instalação. Seus vídeos na plataforma não serão excluídos. Para consultar a rede novamente, será necessário reconectar."));
  const { form } = formWithSave("Remover vínculo", async () => { await request(channelPath(`/connections/${platform}`), "DELETE"); dialog.close(); await refresh(); toast("Vínculo local removido."); }, () => dialog.close());
  body.append(form);
}

function analyticsPage(): HTMLElement {
  const missing = requiredChannel(); if (missing) return missing;
  const state = data!;
  const snapshots = scoped(state.monetization).filter((entry) => entry.platform === activePlatform).sort((a, b) => b.fetchedAt.localeCompare(a.fetchedAt));
  const latest = snapshots[0];
  const connection = scoped(state.connections).find((entry) => entry.platform === activePlatform);
  const receipts = scoped(state.receipts).filter((entry) => entry.platform === activePlatform);
  const capability = state.capabilities.find((entry) => entry.platform === activePlatform);
  const totals = (kind: "payment" | "cost") => {
    const entries = receipts.filter((entry) => entry.kind === kind);
    const summaries = cashSummary(entries, channelId);
    return !summaries.length ? "—" : summaries.length > 1 ? "Várias moedas" : recordedMoney(kind === "payment" ? summaries[0].payments : summaries[0].costs, summaries[0].currency);
  };
  const platform = activePlatform;
  const sync = button("Consultar rede", () => { void action(() => request(channelPath(`/connections/${platform}/sync`), "POST", {}), "Dados consultados no provedor."); }, "primary", "refresh");
  sync.disabled = connection?.status !== "connected" || !capability?.metricsAvailable;
  const stats = el("div", { className: "stats-grid" }, stat("Visualizações", number(latest?.stats.views), latest ? "Período informado pelo provedor" : "Aguardando dados da rede", "chart"), stat("Seguidores", number(latest?.stats.followers), latest ? "Contagem na última consulta" : "Nenhum valor presumido", "channels"), stat("Receita estimada", money(latest?.revenue.estimatedCents, latest?.revenue.currency), latest?.revenue.estimatedCents == null ? "Indisponível ou sem permissão" : "Estimativa do provedor, não pagamento", "chart"), stat("Pagamentos registrados", totals("payment"), "Registros manuais do operador", "folder"));
  const snapshotTable = el("table", { className: "table" }, el("thead", {}, el("tr", {}, ...["Consulta", "Período", "Views", "Seguidores", "Receita estimada"].map((label) => el("th", { scope: "col" }, label)))), el("tbody", {}, ...snapshots.map((entry) => el("tr", {}, el("td", {}, date(entry.fetchedAt)), el("td", {}, `${entry.periodStart} a ${entry.periodEnd}`), el("td", {}, number(entry.stats.views)), el("td", {}, number(entry.stats.followers)), el("td", { className: "amount", title: entry.revenue.reason }, money(entry.revenue.estimatedCents, entry.revenue.currency))))));
  const receiptTable = el("table", { className: "table" }, el("thead", {}, el("tr", {}, ...["Data", "Natureza", "Valor", "Observação", ""].map((label) => el("th", { scope: "col" }, label)))), el("tbody", {}, ...receipts.sort((a, b) => b.date.localeCompare(a.date)).map((entry) => el("tr", {}, el("td", {}, entry.date), el("td", {}, el("span", { className: "badge" }, entry.kind === "cost" ? "Custo manual" : entry.kind === "payment" ? "Pagamento manual" : "Estimativa manual")), el("td", { className: "amount" }, money(entry.amountCents, entry.currency)), el("td", {}, entry.note), el("td", {}, iconButton("Editar registro financeiro", "edit", () => editReceipt(entry)), iconButton("Excluir registro financeiro", "trash", () => deleteRecord("receipts", entry.id, entry.note || "Registro financeiro")))))));
  const metadata = latest ? `${labels[platform]} · Coleta: ${date(latest.fetchedAt)} · Conta: ${latest.accountId}` : "Dados desconhecidos aparecem como —. Conectar uma conta não comprova monetização.";
  return el("div", {}, heading("Resultados", "Dados de audiência e finanças com origem e contexto.", button("Registro financeiro", () => editReceipt(), "secondary", "plus"), sync), platformTabs(), stats, notice(latest?.revenue.reason || capability?.revenueNote || "A receita depende do programa, da conta e dos escopos concedidos. Nenhuma receita é presumida."), el("div", { className: "section-label" }, el("h2", {}, "Consultas ao provedor"), el("span", {}, latest ? "Snapshots preservados · Não somar contagens acumuladas" : "Sem coleta registrada")), panel("Histórico de dados", metadata, snapshots.length ? el("div", { className: "table-scroll" }, snapshotTable) : empty("Conecte a conta e consulte suas métricas", "Os dados disponíveis dependem das capacidades e permissões da API oficial de cada rede.", "chart", button("Configurar conexão", () => go("connections"), "primary", "plug"))), el("div", { className: "section-label" }, el("h2", {}, "Seu registro financeiro"), el("span", {}, `Custos registrados: ${totals("cost")}`)), panel("Histórico financeiro", "Registros manuais são identificados e não substituem extratos ou confirmação da plataforma.", receipts.length ? el("div", { className: "table-scroll" }, receiptTable) : empty("Nenhum registro financeiro neste canal e rede", "Registre somente o que você conhece, indicando se é custo, estimativa ou pagamento.", "folder", button("Adicionar registro", () => editReceipt(), "secondary", "plus"))));
}

function editReceipt(record?: RevenueEntry): void {
  const { dialog, body } = createDialog(record ? "Editar registro financeiro" : "Registrar um movimento", "Registro manual, associado à rede e ao canal selecionados.");
  const platform = select("platform", platforms.map((entry) => [entry, labels[entry]]), record?.platform || activePlatform);
  const kind = select("kind", [["cost", "Custo realizado"], ["estimate", "Estimativa manual"], ["payment", "Pagamento recebido — registro manual"]], record?.kind || "cost");
  const amount = input("amount", record ? String(record.amountCents / 100) : "", "number"); amount.min = "0"; amount.step = "0.01"; amount.required = true;
  const currency = input("currency", record?.currency || "BRL"); currency.required = true; currency.maxLength = 3; currency.pattern = "[A-Za-z]{3}";
  const when = input("date", record?.date || "", "date"); when.required = true;
  const note = textarea("note", record?.note || "", 3); note.required = true;
  const from = input("periodStart", record?.periodStart || "", "date");
  const to = input("periodEnd", record?.periodEnd || "", "date");
  const { form, fields } = formWithSave("Salvar registro", async () => {
    await save(record ? `/api/receipts/${encodeURIComponent(record.id)}` : "/api/receipts", record ? "PUT" : "POST", { channelId, platform: platform.value, kind: kind.value, amountCents: Math.round(Number(amount.value) * 100), currency: currency.value.toUpperCase(), date: when.value, note: note.value.trim(), source: "manual", periodStart: from.value || undefined, periodEnd: to.value || undefined });
    dialog.close(); toast("Registro financeiro salvo com origem manual.");
  }, () => dialog.close());
  fields.append(el("div", { className: "form-grid" }, field("Rede", platform), field("Natureza", kind), field("Valor", amount), field("Moeda", currency, "Código de três letras, como BRL ou USD."), field("Data do registro", when), field("Início do período (opcional)", from), field("Fim do período (opcional)", to)), field("Origem, motivo e observações", note), notice("Estimativa e pagamento são registros diferentes. Não informe uma previsão como dinheiro recebido; use as evidências da sua própria conta."));
  body.append(form);
}

function effectiveConfig(): WebConfig {
  return Object.hasOwn(data!.channelConfigs, channelId) ? data!.channelConfigs[channelId] : data!.config;
}

function settingsPage(globalScope = globalConfigScope): HTMLElement {
  const config = globalScope ? data!.config : effectiveConfig();
  const scope = select("config-scope", [["channel", currentChannel() ? `Canal: ${currentChannel()!.name}` : "Selecione um canal"], ["global", "Padrão desta instalação"]], globalScope || !currentChannel() ? "global" : "channel");
  if (!currentChannel()) globalScope = true;
  scope.addEventListener("change", () => {
    const selected = scope.value; scope.value = globalScope ? "global" : "channel";
    protectEdits(() => {
    globalConfigScope = selected === "global";
    const main = document.querySelector("#main-content");
    if (main) replace(main, settingsPage(globalConfigScope));
    });
  });
  const width = input("width", String(config.render.width), "number");
  const height = input("height", String(config.render.height), "number");
  for (const item of [width, height]) { item.min = "2"; item.max = "7680"; item.step = "2"; item.required = true; }
  const fps = input("fps", String(config.render.fps), "number"); fps.min = "1"; fps.max = "120"; fps.required = true;
  const crf = input("crf", String(config.render.crf), "number"); crf.min = "0"; crf.max = "51"; crf.required = true;
  const preset = select("preset", ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium", "slow", "slower", "veryslow"].map((entry) => [entry, entry]), config.render.preset);
  const python = input("pythonPath", config.tts.pythonPath ?? ""); python.required = true;
  const voiceStyles = input("voiceStyles", config.tts.voiceStyles ?? ""); voiceStyles.required = true;
  const voiceModel = input("voiceModel", config.tts.voiceModel); voiceModel.required = true;
  const voiceName = select("voiceName", commercialVoices.map(([id, label]) => [id, label]), config.tts.voiceName);
  voiceName.required = true;
  const asr = input("asr-enabled", "", "checkbox"); asr.checked = config.asr.enabled;
  const asrModel = input("asr-model", config.asr.model);
  const asrLanguage = input("asr-language", config.asr.language); asrLanguage.required = true;
  const coverage = input("minCoverage", String(config.asr.minCoverage), "number"); coverage.min = "0"; coverage.max = "1"; coverage.step = "0.01"; coverage.required = true;
  const { form, fields } = formWithSave(globalScope ? "Salvar padrão da instalação" : "Salvar configuração deste canal", async () => {
    const next: WebConfig = { dryRun: true, telemetry: false, render: { width: Number(width.value), height: Number(height.value), fps: Number(fps.value), crf: Number(crf.value), preset: preset.value, videoCodec: "libx264" }, tts: { engine: "kokoro", pythonPath: python.value.trim(), voiceStyles: voiceStyles.value.trim(), piperPath: config.tts.piperPath, voiceModel: voiceModel.value.trim(), voiceName: voiceName.value }, asr: { enabled: asr.checked, model: asrModel.value.trim(), language: asrLanguage.value.trim(), minCoverage: Number(coverage.value) } };
    await save(globalScope ? "/api/config" : channelPath("/config"), "PUT", next);
    toast(globalScope ? "Padrão da instalação atualizado. Canais com configuração própria conservam seus ajustes." : "Configuração do canal salva.");
  });
  fields.append(field("Onde aplicar estes ajustes?", scope, "A configuração do canal prevalece sobre o padrão da instalação."), el("div", { className: "divider" }), el("h3", {}, "Renderização"), el("div", { className: "form-grid" }, field("Largura em pixels", width), field("Altura em pixels", height), field("Quadros por segundo", fps), field("CRF — qualidade de compressão", crf, "Menor valor prioriza qualidade e pode aumentar o arquivo."), field("Preset do encoder", preset), field("Codec", select("videoCodec", [["libx264", "H.264 · libx264"]], "libx264"))), el("div", { className: "divider" }), el("h3", {}, "Voz & narração local"), field("Voz brasileira", voiceName, "Kokoro-82M v1.0 · Apache 2.0 · permite uso comercial, com as condições da licença."), field("Python do narrador", python, "Instalação local: npm run voices:setup. No Docker: /opt/tts/bin/python."), field("Modelo Kokoro", voiceModel, "kokoro-v1.0.onnx do catálogo. O motor confere o SHA-256 antes de narrar."), field("Arquivo das vozes", voiceStyles, "voices-v1.0.bin do mesmo catálogo. Arquivos alterados ou de outra origem são bloqueados."), ...(commercialVoiceError(config.tts) ? [notice(commercialVoiceError(config.tts)!)] : []), el("div", { className: "divider" }), el("h3", {}, "Conferência da fala com ASR"), el("label", { className: "checkbox-field" }, asr, "Usar o modelo local de transcrição no QA"), field("Arquivo do modelo ASR", asrModel), el("div", { className: "form-grid" }, field("Idioma da transcrição", asrLanguage), field("Limiar de cobertura", coverage, "De 0 a 1. Cobertura não comprova qualidade editorial.")));
  const safety = el("div", { className: "panel-body" },el("dl",{className:"operation-properties"},el("div",{},el("dt",{},"Publicação automática"),el("dd",{},"Desativada")),el("div",{},el("dt",{},"Telemetria"),el("dd",{},"Desativada")),el("div",{},el("dt",{},"Motor de produção"),el("dd",{},data!.engine?.available?"Disponível":"Não encontrado"))),el("p",{className:"field-hint"},data!.engine?.message||"Estado do motor não informado pelo servidor."));
  return el("div", {}, heading("Configurações", "Configure a produção e personalize o assistente de criação."), el("div", { className: "settings-layout" }, el("section", { className: "panel editor-body" }, form), el("div", { className: "section-stack" }, creativeSettingsPanel(currentChannel()?.id,currentChannel()?.name), panel("Operação local", "Controles de segurança desta versão.", safety))));
}

function productionPage(): HTMLElement {
  const missing = requiredChannel(); if (missing) return missing;
  const state = data!;
  const jobs = scoped(state.jobs).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const assets = scoped(state.assets);
  const startButton = button("Produzir com IA", () => startProduction(), "primary", "film");
  startButton.disabled = state.engine?.available === false;
  const jobsBody = jobs.length ? el("div", {}, ...jobs.map(jobCard)) : empty("Da sua orientação ao vídeo para revisão", "A IA desenvolve o roteiro; o motor prepara os visuais, a voz, a montagem e o QA em sequência.", "film", button("Produzir com IA", () => startProduction(), "primary", "plus"));
  const assetBody = assets.length
    ? el("div", { className: "panel-body asset-grid" }, ...assets.map((asset) => el("div", { className: "asset-row" }, icon(asset.kind === "video" ? "film" : "folder"), el("div", {}, el("div", { className: "asset-name", title:asset.name }, asset.name), el("div", { className: "asset-caption" }, `${asset.kind === "video" ? "Vídeo" : "Imagem"} · ${number(Math.round(asset.bytes / 1024))} KB · ${asset.license}`)), el("span", { className: "spacer" }), el("span", { className: "badge mono", "data-variant": "outline", title: asset.checksum }, asset.checksum.slice(0, 8)))))
    : empty("Os visuais são preparados a partir do roteiro", "As imagens explicativas entram aqui automaticamente ao preparar o vídeo. Você também pode adicionar arquivos próprios.", "folder", button("Adicionar arquivo próprio", () => uploadAsset(), "secondary", "plus"));
  return el("div", {className:"section-stack"}, heading("Produção", "Gere o vídeo, confira a qualidade e revise o resultado.", button("Adicionar arquivo próprio", () => uploadAsset(), "secondary", "plus"), startButton), state.engine?.available === false ? notice(state.engine.message) : null, panel("Fila de produção", `${jobs.length} produções neste canal. A publicação automática está desativada.`, jobsBody), panel("Biblioteca do canal", `${assets.length} recursos visuais. Confira a origem e os direitos de cada arquivo.`, assetBody));
}

function jobCard(job: WebJob): HTMLElement {
  const script = data!.scripts.find((entry) => entry.channelId === channelId && entry.id === job.scriptId);
  const started = Boolean(job.startedAt);
  const stages = el("div", { className: "job-stages" }, el("span", { className: "job-stage reached" }, "1 · Solicitação registrada"), el("span", { className: `job-stage ${started ? "reached" : ""}` }, "2 · Motor iniciado"), el("span", { className: `job-stage ${job.qa ? "reached" : ""}` }, "3 · Relatório de QA"), el("span", { className: `job-stage ${job.videoAvailable ? "reached" : ""}` }, "4 · Arquivo disponível"));
  const qa = job.qa ? el("div", { className: "entity-meta" }, el("span", { className: "field-hint" }, "Qualidade do arquivo:"), badge(job.qa.technical), el("span", { className: "field-hint" }, "Conteúdo:"), badge(job.qa.editorial)) : null;
  const diagnostic = ["failed","blocked"].includes(job.status)
    ? el("details", {}, el("summary",{},"Ver diagnóstico"), el("pre",{className:"job-diagnostic"},job.message))
    : el("p",{},job.previewOnly?job.message:job.status==="needs_review" ? "Vídeo gerado. Confira o conteúdo e os direitos de uso antes de publicar." : job.message);
  return el("article", { className: "job-card", "data-testid": `job-${job.id}` }, el("div", { className: "job-card-heading" }, mediaThumbnail(job), el("div", {}, el("h3", {title:script?.title || "Produção do canal"}, script?.title || "Produção do canal"), el("p", {}, `Solicitado em ${date(job.createdAt)}`)), el("span", { className: "spacer" }), badge(job.status)), stages, diagnostic, qa, job.videoAvailable ? el("div", { className: "job-artifacts" }, button("Revisar vídeo", () => viewJob(job), "secondary", "film")) : null);
}

function startProduction(): void {
  const channel=currentChannel();if(!channel)return;
  openAutomaticProduction({channel,scripts:scoped(data!.scripts),research:scoped(data!.research),selectedScriptId:activeScriptId,currentChannelId:()=>channelId,onStarted:async()=>{await refresh();toast('Produção iniciada. Acompanhe o roteiro, os visuais e a montagem na fila.');},onManual:scriptId=>{if(scriptId)activeScriptId=scriptId;prepareProductionManually();},onSettings:()=>go('settings')});
}

function prepareProductionManually(): void {
  const channel=currentChannel();if(!channel)return;
  const dialog=openProduction({channel,scripts:scoped(data!.scripts),assets:scoped(data!.assets),config:effectiveConfig(),selectedScriptId:activeScriptId,currentChannelId:()=>channelId,
    onStarted:async()=>{await refresh();toast("Produção adicionada à fila. Acompanhe o andamento aqui.");},
    onPrepared:prepared=>{if(data)data.assets=[...data.assets.filter(asset=>asset.channelId!==channel.id),...prepared.assets];},
    onAdaptScript:script=>openCreativeDraft('script',channel.id,channel.name,{
      context:{task:'script',values:{title:script.title,researchId:script.researchId,series:script.series,format:script.format,hook:script.hook,scenes:structuredClone(script.scenes),sources:structuredClone(script.sources),claims:structuredClone(script.claims)}},
      initialBrief:'Crie uma versão explicativa deste roteiro para um vídeo com narração e composições tipográficas geradas localmente. Preserve o assunto, o formato e a duração escolhidos. Reescreva o título, o gancho e as falas que prometem testes, comparações ou resultados ainda não realizados. Não invente resultados, fontes, experiências ou funcionalidades. Use apenas afirmações sustentadas pelas referências fornecidas e explicite o que falta verificar. Nos briefings visuais, peça composições explicativas com texto; não peça gravações, capturas de tela ou CAPTURA PENDENTE. Entregue um novo rascunho para revisão, sem aprovar alegações ou fontes.',
      applyLabel:'Salvar como novo roteiro',
      onApply:async fields=>{
        if(channelId!==channel.id||!('scenes' in fields))throw new Error('O canal mudou. Abra a adaptação novamente neste canal.');
        const response=await request<Script>('/api/scripts','POST',{channelId:channel.id,...fields,researchId:script.researchId,topicId:`topico-${crypto.randomUUID()}`,claims:fields.claims.map(claim=>({...claim,status:'unverified'})),status:'draft',crossChecked:false});
        if(channelId===channel.id){activeScriptId=response.id;await refresh();go('scripts');toast('Versão explicativa salva como novo roteiro. O original foi preservado; confira as fontes e as alegações.');}
      }
    }),
    onAddAssets:()=>uploadAsset(),onEditScript:scriptId=>{activeScriptId=scriptId;go("scripts");}
  });
  dialog.addEventListener('close',()=>{if(location.hash==='#production')render();});
}

function uploadAsset(): void {
  const { dialog, body } = createDialog("Adicionar recurso visual", "O arquivo fica no armazenamento privado deste canal, no servidor local.");
  const file = input("file", "", "file"); file.required = true; file.accept = ".png,.jpg,.jpeg,.webp,.bmp,.mp4,.mov,.m4v,.mkv,.webm,.avi";
  const kind = select("kind", [["image", "Imagem"], ["video", "Vídeo"]], "image");
  file.addEventListener("change", () => { const selected = file.files?.[0]; if (selected) kind.value = /\.(mp4|mov|m4v|mkv|webm|avi)$/i.test(selected.name) ? "video" : "image"; });
  const license = input("license"); license.required = true;
  const provenance = textarea("provenance", "", 3); provenance.required = true;
  const restrictions = textarea("restrictions", "", 2); restrictions.required = true;
  const { form, fields } = formWithSave("Enviar ao servidor local", async () => {
    const selected = file.files?.[0];
    if (!selected) throw new Error("Selecione um arquivo.");
    if (selected.size > 20 * 1024 * 1024) throw new Error("O arquivo excede o limite de 20 MB por recurso. Use um trecho ou uma versão menor.");
    const contentBase64 = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => typeof reader.result === "string" ? resolve(reader.result.split(",")[1] || "") : reject(new Error("Não foi possível ler o arquivo."));
      reader.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
      reader.readAsDataURL(selected);
    });
    await request(channelPath("/assets"), "POST", { filename: selected.name, kind: kind.value, contentBase64, license: license.value.trim(), provenance: provenance.value.trim(), restrictions: restrictions.value.trim() });
    file.value = ""; dialog.close(); await refresh(); toast("Recurso visual registrado com origem e hash.");
  }, () => dialog.close());
  fields.append(field("Arquivo de imagem ou vídeo", file, "Até 20 MB por recurso visual."), field("Tipo de recurso", kind), field("Licença ou autorização de uso", license, "Informe a condição real de uso. A licença do código não cobre mídia de terceiros."), field("Origem e autoria", provenance, "Quem criou, de onde veio e como o uso foi autorizado?"), field("Restrições e atribuição", restrictions, "Se não houver restrições, declare isso expressamente."));
  body.append(form);
}

function viewJob(job: WebJob): void {
  const { body } = createDialog(job.previewOnly?'Revisar vídeo gerado':'Revisar vídeo', `${currentChannel()?.name} · ${statusLabels[job.status] || job.status}`);
  const base = channelPath(`/jobs/${encodeURIComponent(job.id)}/files`);
  const video = el("video", { className: "video-preview", controls: true, preload: "metadata", src: `${base}/video`, "aria-label": "Vídeo produzido pelo motor Rust" }, "Seu navegador não conseguiu abrir o vídeo. Use o link do arquivo abaixo.");
  const files=job.previewOnly?[["video","Vídeo MP4"],["subtitles","Legendas"],["report","Relatório"]]:[["video", "Vídeo MP4"], ["subtitles", "Legendas"], ["thumbnail", "Thumbnail"], ["description", "Descrição"], ["sources", "Fontes"], ["metadata", "Metadados"], ["report", "Relatório"]];
  body.append(video, el("div", { className: "job-artifacts" }, ...files.map(([key, label]) => el("a", { href: `${base}/${key}`, target: "_blank", rel: "noopener noreferrer" }, label, icon("external")))), el("div", { className: "divider" }), notice(job.previewOnly?'Este vídeo foi gerado para sua revisão. Confira o conteúdo e os alertas de QA. As pendências continuam registradas e nenhuma publicação foi autorizada.':"Confira fatos, direitos, legibilidade e ritmo. O pacote é revisável e sua existência não comprova aprovação editorial ou publicação."));
}

window.addEventListener("hashchange", () => {
  if (!data || location.hash === "#main-content") return;
  const target = location.hash;
  if (hasUnsavedEdits()) {
    const url = new URL(location.href); url.hash = renderedHash; history.replaceState(null, "", url);
    protectEdits(() => { url.hash = target; history.replaceState(null, "", url); render(); window.scrollTo(0, 0); document.getElementById("main-content")?.focus({ preventScroll: true }); });
    return;
  }
  render();
  window.scrollTo(0, 0);
  document.getElementById("main-content")?.focus({ preventScroll: true });
});
window.addEventListener("session-expired", () => { if (!loading) { toast("Sua sessão terminou. Entre novamente para continuar.", true); void start(); } });

void start();
