import {request} from './api.ts';
import {button,el,externalLink,field,replace,select,setButtonLabel} from './dom.ts';
import type {AIUsageSnapshot,AIUsageRecord} from '../shared/ai-usage-types.ts';

const providers={anthropic:'Anthropic',openai:'OpenAI'};
const statuses:Record<AIUsageRecord['status'],string>={pending:'Em andamento',succeeded:'Concluída',rejected:'Resposta descartada',failed:'Falhou',unknown:'Sem confirmação'};
const tasks={research:'Pesquisa',script:'Roteiro',story:'Narrativa'};
const count=(value:number|null)=>value===null?'Não informado':value.toLocaleString('pt-BR');
const money=(value:number|null)=>value===null?'Não informado':new Intl.NumberFormat('pt-BR',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:6}).format(value);
function date(value:string):string {const timestamp=Date.parse(value);return Number.isFinite(timestamp)?new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short',timeZone:'UTC'}).format(timestamp):'Data indisponível';}
function table(label:string,columns:string[],rows:HTMLElement[][]):HTMLElement {
  return el('div',{className:'table-scroll',role:'region','aria-label':label,tabindex:0},el('table',{className:'table ai-usage-table','aria-label':label},el('thead',{},el('tr',{},...columns.map(column=>el('th',{scope:'col'},column)))),el('tbody',{},...rows.map(cells=>el('tr',{},...cells)))));
}
function valueCell(value:string,unbroken=false):HTMLTableCellElement {return el('td',{className:unbroken?'ai-usage-unbroken':undefined},value);}

/** A local ledger view. It never queries an inference provider or contains credentials. */
export function createAIUsagePanel(channelId?:string,channelName?:string):{node:HTMLElement;refresh:()=>Promise<void>} {
  const node=el('section',{className:'section-stack','aria-label':'Consumo no Studio'},el('div',{},el('h3',{},'Consumo no Studio'),el('p',{className:'field-hint'},channelId?`${channelName||channelId} · chamadas feitas pelo Framechester.`:'Selecione um canal para consultar o consumo.')));
  if(!channelId)return {node,refresh:async()=>{}};
  const days=select('ai-usage-days',[['7','Últimos 7 dias'],['30','Últimos 30 dias'],['90','Últimos 90 dias']],'30');
  const provider=select('ai-usage-provider',[['','Todos os provedores'],['anthropic','Anthropic'],['openai','OpenAI']]);
  const status=el('p',{className:'field-hint',role:'status'},'Consulte o registro local deste canal.');
  const content=el('div',{className:'section-stack','aria-live':'polite'});
  let revision=0;
  const refreshButton=button('Atualizar consumo',()=>{void refresh();},'secondary','refresh');refreshButton.setAttribute('data-usage-refresh','');
  async function refresh():Promise<void> {
    const requestRevision=++revision;
    if(!node.isConnected)return;
    refreshButton.disabled=true;setButtonLabel(refreshButton,'Consultando…');node.setAttribute('aria-busy','true');status.textContent='Consultando o registro local…';replace(content);
    try {
      const snapshot=await request<AIUsageSnapshot>(`/api/channels/${encodeURIComponent(channelId!)}/creative/usage?days=${days.value}${provider.value?`&provider=${provider.value}`:''}`);
      if(!node.isConnected||requestRevision!==revision)return;
      if(snapshot.scope!=='studio'||snapshot.channelId!==channelId||!Array.isArray(snapshot.events)||!Array.isArray(snapshot.byCredential)||snapshot.events.some(event=>event.channelId!==channelId))throw new Error('O registro não corresponde a este canal. Atualize o consumo novamente.');
      render(snapshot);status.textContent=`Período: ${date(snapshot.from)} a ${date(snapshot.to)} (UTC).`;
    }catch(error){if(node.isConnected&&requestRevision===revision){status.textContent='Não foi possível consultar o consumo.';replace(content,el('p',{className:'alert form-error',role:'alert'},error instanceof Error?error.message:'Tente atualizar o registro local.'));}}
    finally{if(node.isConnected&&requestRevision===revision){refreshButton.disabled=false;setButtonLabel(refreshButton,'Atualizar consumo','refresh');node.removeAttribute('aria-busy');}}
  }
  function render(snapshot:AIUsageSnapshot):void {
    const totals=snapshot.totals;
    if(!totals.generationRequests&&!totals.estimateRequests){replace(content,el('p',{},'Nenhuma chamada registrada neste período. O histórico começa com as chamadas feitas pelo Studio após a ativação do monitoramento.'));return;}
    const summary=el('dl',{className:'operation-properties'},...[
      ['Gerações',count(totals.generationRequests)],
      ['Tokens de entrada reportados',count(totals.inputTokens)],
      ['Tokens de resposta reportados',count(totals.outputTokens)],
      ['Custo calculado (USD)',money(totals.estimatedCostUsd)],
    ].map(([label,value])=>el('div',{},el('dt',{},label),el('dd',{},value))));
    replace(content,summary,el('p',{className:'field-hint'},`Concluídas: ${count(totals.successfulGenerations)} · Com falha ou resposta descartada: ${count(totals.failedGenerations)} · Sem confirmação: ${count(totals.unknownGenerations)}. Estimativas: ${count(totals.estimateRequests)}; os tokens dessas contagens não são somados às gerações.`));
    content.append(el('p',{className:'field-hint'},`Cache de entrada informado: ${count(totals.cachedInputTokens)} tokens, já incluídos na entrada. Raciocínio informado: ${count(totals.reasoningTokens)} tokens, já incluídos na resposta.`));
    if(totals.unknownCostRequests)content.append(el('p',{className:'field-hint'},`${count(totals.unknownCostRequests)} ${totals.unknownCostRequests===1?'geração sem custo confirmado':'gerações sem custo confirmado'}. O total considera somente o uso informado; uma falha ou interrupção pode ter cobrança no provedor.`));
    if(totals.unknownUsageRequests)content.append(el('p',{className:'field-hint'},`${count(totals.unknownUsageRequests)} ${totals.unknownUsageRequests===1?'geração sem contagem de tokens':'gerações sem contagem de tokens'}. Campos não informados permanecem desconhecidos.`));
    content.append(el('section',{className:'section-stack'},el('h3',{},'Por chave'),table('Consumo por chave',['Provedor e identificação local','Gerações','Entrada / resposta','Custo calculado'],snapshot.byCredential.map(item=>[
      el('td',{},el('div',{},providers[item.provider]),el('div',{className:'field-hint',title:item.credentialId},`Chave ${item.credentialId.slice(0,12)}`)),valueCell(count(item.generationRequests),true),valueCell(`${count(item.inputTokens)} / ${count(item.outputTokens)}`),valueCell(money(item.estimatedCostUsd),true),
    ])),el('p',{className:'field-hint'},'A identificação é criada pelo Studio e não é um trecho da chave. A troca ou remoção de uma chave conserva seu histórico.')));
    content.append(el('section',{className:'section-stack'},el('h3',{},'Chamadas recentes'),table('Chamadas recentes',['Início (UTC)','Provedor e tarefa','Estado','Entrada / resposta','Custo calculado'],snapshot.events.map(event=>[
      valueCell(date(event.startedAt),true),el('td',{},el('div',{},`${providers[event.provider]} · ${event.operation==='estimate'?'Estimativa':tasks[event.task]}`),el('div',{className:'field-hint'},event.model)),valueCell(statuses[event.status],true),valueCell(`${count(event.inputTokens)} / ${count(event.outputTokens)}`),valueCell(money(event.estimatedCostUsd),true),
    ])),el('p',{className:'field-hint'},'Até 100 chamadas recentes. Os totais usam todas as chamadas do período e os preços registrados na geração.')));
  }
  days.addEventListener('change',()=>{void refresh();});provider.addEventListener('change',()=>{void refresh();});
  node.append(el('div',{className:'form-grid'},field('Período do consumo',days),field('Provedor do consumo',provider)),el('div',{className:'form-actions'},refreshButton),status,content,el('p',{className:'field-hint'},'Este registro cobre somente o uso feito pelo Studio. Ele não representa o saldo da conta, a fatura oficial ou chamadas feitas por outros aplicativos. Assinatura do aplicativo e acesso/consumo da API seguem cobranças próprias. Consulte créditos no provedor.'),el('div',{className:'form-actions'},externalLink('Consumo oficial OpenAI','https://platform.openai.com/usage'),externalLink('Consumo oficial Anthropic','https://platform.claude.com/usage')));
  return {node,refresh};
}
