import { request } from './api.ts';
import { createDialog, formWithSave, notice, statusLabels } from './components.ts';
import { protectEdits } from './edit-protection.ts';
import {editorTabs} from './ui-tabs.ts';
import {createAIUsagePanel} from './ai-usage-ui.ts';
import { button, el, field, input, replace, select, setButtonLabel, textarea } from './dom.ts';
import type { CreativeCapabilities, CreativeDraft, CreativeSettings, CreativeTask, CreativeEditorContext, CreativeFields, CreativeQuote } from '../shared/creative-types.ts';

const titles:Record<CreativeTask,string>={research:'Investigar um nicho',script:'Desenvolver um roteiro',story:'Construir uma narrativa'};
const hints:Record<CreativeTask,string>={research:'Descreva o público, a pergunta e o que você quer investigar. Peça hipóteses e um plano de apuração.',script:'Informe a pergunta do vídeo, formato, duração e o que já foi apurado. Defina o tom e o que o roteiro deve entregar.',story:'Descreva a ideia central, o conflito e a descoberta que sustentam a história. Informe o público e a resposta que você pode demonstrar.'};
const drafts=new Map<string,{draft:CreativeDraft;brief:string;includeReferences:boolean}>();
let draftSession=0;
export function clearCreativeDrafts():void {draftSession++;drafts.clear();}

export interface CreativeEditorOptions { context: CreativeEditorContext; onApply: (fields: CreativeFields) => void|Promise<void>; initialBrief?:string; applyLabel?:string; mount?:{host:HTMLElement;onClose:()=>void} }
const objectives:Record<CreativeTask,string>={research:'Desenvolva esta hipótese a partir dos campos preenchidos e indique o que falta apurar.',script:'Desenvolva o roteiro a partir dos campos, da pauta e das fontes fornecidas. Preserve o formato escolhido e explicite o que falta verificar.',story:'Desenvolva a narrativa a partir dos campos e do roteiro vinculado. Entregue a promessa e mantenha os limites das evidências.'};
function describeValues(values:object):string {
  const labels:Record<string,string>={title:'Título',niche:'Nicho',audience:'Público',hypothesis:'Hipótese de interesse',differentiation:'Contribuição original',keywords:'Palavras-chave',sources:'Fontes fornecidas',notes:'Notas e próximos passos',series:'Série',format:'Formato',hook:'Gancho',scenes:'Cenas',claims:'Alegações',setup:'Contexto',conflict:'Tensão',turningPoint:'Descoberta',resolution:'Resolução',cta:'Próximo passo'};
  const lines:string[]=[];
  for(const [key,value] of Object.entries(values)) {
    if(key==='researchId'||key==='scriptId'){if(value)lines.push(key==='researchId'?'Referência: a pauta selecionada deste canal será incluída.':'Referência: o roteiro selecionado deste canal será incluído.');continue;}
    let text=typeof value==='string'?value:'';
    if(key==='format')text=value==='long'?'Longo':value==='short'?'Curto':text;
    if(Array.isArray(value))text=value.map(item=>{
      if(typeof item==='string')return item;
      if('narration' in item)return `${item.heading}\nFala: ${item.narration}\nVisual: ${item.visualBrief}\nDuração sugerida: ${item.durationHintSecs}s`;
      if('url' in item)return `${item.title} — ${item.publisher}\n${item.url}\nConsulta: ${item.retrievedAt}. Condição de uso: ${item.license}`;
      if('text' in item)return `${item.text}\nEvidências: ${item.sourceUrls.join(', ')||'Não fornecidas'}. Estado: ${statusLabels[item.status]||item.status}`;
      return '';
    }).join('\n\n');
    lines.push(`${labels[key]||key}: ${text||'Não informado'}`);
  }
  return lines.join('\n\n');
}
function fieldsMatch(task:CreativeTask,fields:CreativeFields):boolean {
  if(!fields||typeof fields!=='object'||typeof fields.title!=='string')return false;
  return task==='research'?'hypothesis' in fields&&Array.isArray(fields.keywords):task==='script'?'scenes' in fields&&Array.isArray(fields.scenes)&&Array.isArray(fields.sources)&&Array.isArray(fields.claims):'resolution' in fields&&typeof fields.resolution==='string';
}

export function creativeSettingsPanel(channelId?:string,channelName?:string):HTMLElement {
  return el('section',{className:'panel creative-panel'},el('div',{className:'panel-header'},el('div',{},el('h2',{},'Assistente de criação'),el('p',{},'Modelos, direção criativa e consumo.'))),el('div',{className:'panel-body section-stack'},el('p',{},'Conecte Claude ou OpenAI para desenvolver pautas, roteiros e narrativas a partir do seu trabalho.'),button('Configurar assistente',()=>{void editCreativeSettings(channelId,channelName);},'secondary','settings'),el('p',{className:'field-hint'},'Suas instruções ficam fora do Git. Cada geração por API exige confirmação; a proposta continua sendo um rascunho para revisão.')));
}

export async function editCreativeSettings(channelId?:string,channelName?:string):Promise<void> {
  const {dialog,body}=createDialog('Assistente de criação',channelId?`Chave deste canal: ${channelName||channelId}. Modelo e direção criativa valem para esta instalação.`:'Selecione um canal para conectar sua chave. Modelo e direção criativa valem para esta instalação.');
  dialog.classList.add('dialog-wide');body.append(el('p',{role:'status'},'Carregando suas instruções…'));
  try {
    const settings=await request<CreativeSettings>('/api/creative/settings');
    if(!dialog.isConnected)return;
    let capabilities:CreativeCapabilities|undefined;
    try {capabilities=await request<CreativeCapabilities>(`/api/creative/capabilities${channelId?`?channel_id=${encodeURIComponent(channelId)}`:''}`);}catch{/* Editing the private file remains available without a model. */}
    if(!dialog.isConnected)return;
    const content=textarea('personal-prompt',settings.prompt.content,16);content.classList.add('prompt-editor');content.maxLength=20_000;
    const modelOptions:Array<[string,string]>=[['','Selecione um modelo local']];
    for(const name of new Set([...(capabilities?.provider==='ollama'?capabilities.models:[]),settings.model].filter(Boolean)))modelOptions.push([name,name]);
    const model=select('creative-model',modelOptions,settings.model);
    const provider=select('creative-provider',[['anthropic','Claude · API Anthropic'],['openai','OpenAI · API'],['ollama','Ollama · neste computador']],settings.provider||'ollama');
    const anthropicModel=select('anthropic-model',[['claude-sonnet-5-5','Claude Sonnet 5.5'],['claude-haiku-5-5','Claude Haiku 5.5']],settings.anthropicModel||'claude-sonnet-5-5');
    const openaiModel=select('openai-model',[['gpt-6.1-sol','GPT-6.1 Sol'],['gpt-6-luna','GPT-6 Luna']],settings.openaiModel||'gpt-6.1-sol');
    const maxTokens=input('creative-max-tokens',String(settings.maxOutputTokens??4096),'number');maxTokens.min='512';maxTokens.max='8192';maxTokens.step='1';maxTokens.required=true;
    const maxCost=input('creative-max-cost',String(settings.maxCostUsd??0.25),'number');maxCost.min='0.001';maxCost.max='5';maxCost.step='any';maxCost.required=true;
    const feedback=el('p',{role:'status',className:'field-hint'});
    const {form,fields}=formWithSave('Salvar preferências',async()=>{
      await request('/api/creative/settings','PUT',{content:content.value,model:model.value,provider:provider.value,anthropicModel:anthropicModel.value,openaiModel:openaiModel.value,maxOutputTokens:Number(maxTokens.value),maxCostUsd:Number(maxCost.value)});
      feedback.textContent='Preferências salvas. Elas serão usadas no próximo pedido.';
    });
    const localFields=field('Modelo de IA local',model,'Use um modelo instalado no Ollama com licença compatível. Nenhum modelo é baixado automaticamente.');
    const anthropicField=field('Modelo Claude',anthropicModel),openaiField=field('Modelo OpenAI',openaiModel);
    const transmission=notice('');
    const cloudFields=el('div',{className:'section-stack'},anthropicField,openaiField,el('div',{className:'form-grid'},field('Limite da estimativa por geração (USD)',maxCost,'Estimativas acima deste valor são bloqueadas. A cobrança final pode variar; confira também os controles de gasto no provedor.'),field('Máximo de tokens de resposta',maxTokens,'Uma resposta mais longa pode custar mais. Respostas interrompidas são descartadas.')),transmission);
    const showProvider=()=>{const cloud=provider.value!=='ollama';cloudFields.hidden=!cloud;localFields.hidden=cloud;anthropicField.hidden=provider.value!=='anthropic';openaiField.hidden=provider.value!=='openai';anthropicModel.disabled=provider.value!=='anthropic';openaiModel.disabled=provider.value!=='openai';maxTokens.disabled=!cloud;maxCost.disabled=!cloud;model.disabled=cloud;transmission.querySelector('p')!.textContent=`Ao calcular o custo, suas instruções, o perfil do canal e os campos usados no pedido são enviados ${provider.value==='openai'?'à OpenAI':'à Anthropic'}. A geração usa sua chave de API. Assinatura do aplicativo e acesso/consumo da API seguem cobranças próprias. Consulte créditos no provedor.`;};
    provider.addEventListener('change',showProvider);showProvider();
    fields.append(field('Provedor',provider),cloudFields,localFields,el('p',{className:'field-hint'},capabilities?.reason||'Você pode salvar as preferências antes de conectar o assistente.'),field('Sua direção criativa',content,'Defina estilo, público e limites. Não inclua senhas ou tokens. Estas preferências não concedem acesso a contas, arquivos ou ferramentas.'),el('p',{className:'field-hint mono'},settings.prompt.fileName));
    const connection=el('section',{className:'section-stack'},el('h3',{},'Chaves de API deste canal'));
    if(channelId){
      const keyProvider=select('creative-key-provider',[['anthropic','Anthropic'],['openai','OpenAI']],settings.provider==='openai'?'openai':'anthropic');
      const key=input('creative-api-key','','password');key.autocomplete='off';key.minLength=20;key.maxLength=512;key.pattern='[A-Za-z0-9_-]{20,512}';key.required=true;key.spellcheck=false;
      const keyStatus=el('p',{className:'field-hint',role:'status'},'Consultando o cofre local…');
      const keyPath=()=>`/api/channels/${encodeURIComponent(channelId)}/creative/keys/${keyProvider.value}`;
      let keyRevision=0;
      const removeKey=button('Remover chave',()=>{void (async()=>{keyRevision++;removeKey.disabled=true;keyProvider.disabled=true;try{await request(keyPath(),'DELETE');keyStatus.textContent='Nenhuma chave conectada a este canal para este provedor.';key.value='';removeKey.hidden=true;}catch(error){keyStatus.textContent=error instanceof Error?error.message:'Não foi possível remover a chave.';}finally{removeKey.disabled=false;keyProvider.disabled=false;}})();},'ghost','trash');
      removeKey.hidden=true;
      const keyForm=formWithSave('Salvar chave no cofre',async()=>{keyRevision++;keyProvider.disabled=true;removeKey.disabled=true;try{await request(keyPath(),'PUT',{key:key.value});key.value='';keyStatus.textContent='Chave guardada no cofre local deste canal. Ela não é exibida novamente.';removeKey.hidden=false;}finally{keyProvider.disabled=false;removeKey.disabled=false;}});
      keyForm.fields.append(field('Chave de API deste canal',key,'Guardada no cofre do sistema operacional. Não entra no prompt, nas preferências nem no Git.'));
      connection.append(field('Provedor da chave',keyProvider),keyStatus,keyForm.form,removeKey);
      const readKeyStatus=async()=>{const revision=++keyRevision;keyStatus.textContent='Consultando o cofre local…';removeKey.hidden=true;try{const stored=await request<{configured:boolean}>(keyPath());if(!dialog.isConnected||revision!==keyRevision)return;keyStatus.textContent=stored.configured?'Há uma chave guardada para este canal e provedor. Preencha o campo apenas para substituí-la.':'Nenhuma chave conectada a este canal para este provedor.';removeKey.hidden=!stored.configured;}catch{if(dialog.isConnected&&revision===keyRevision)keyStatus.textContent='Não foi possível consultar o cofre. Você pode tentar salvar a chave novamente.';}};
      keyProvider.addEventListener('change',()=>{key.value='';void readKeyStatus();});
      await readKeyStatus();if(!dialog.isConnected)return;
    }else connection.append(el('p',{className:'field-hint'},'Selecione um canal no cabeçalho para conectar sua chave.'));
    const usage=createAIUsagePanel(channelId,channelName);let usageLoaded=false;
    const tabs=editorTabs('Configuração do assistente',[{key:'preferences',label:'Modelo e direção',content:el('section',{className:'section-stack'},form,feedback)},{key:'connection',label:'Chave do canal',content:connection},{key:'usage',label:'Consumo',content:usage.node}],key=>{if(key==='usage'&&!usageLoaded){usageLoaded=true;void usage.refresh();}});
    replace(body,tabs.node);
  }catch(error){replace(body,el('div',{className:'form-error',role:'alert'},error instanceof Error?error.message:'Não foi possível carregar as instruções pessoais.'));}
}

function renderValues(values:object):HTMLElement {
  const list=el('dl',{className:'creative-values'});
  for(const [key,value] of Object.entries(values)) {
    const description=describeValues({[key]:value});if(!description)continue;
    const separator=description.indexOf(':');
    list.append(el('div',{},el('dt',{},description.slice(0,separator)),el('dd',{},description.slice(separator+1).trim())));
  }
  return list;
}

export function openCreativeDraft(task:CreativeTask,channelId:string,channelName:string,editor?:CreativeEditorOptions):void {
  const session=draftSession;
  const modal=editor?.mount?undefined:createDialog(titles[task],`${channelName} · rascunho para revisão`);
  modal?.dialog.classList.add('dialog-wide');
  const body=editor?.mount?.host??modal!.body;
  body.classList.add('assistant-workspace');
  const close=()=>{if(editor?.mount)editor.mount.onClose();else modal?.dialog.close();};
  const active=()=>body.isConnected&&session===draftSession;
  const brief=textarea('creative-brief',editor?.initialBrief??(editor?objectives[task]:''),4);brief.required=true;brief.minLength=12;brief.maxLength=6000;brief.placeholder=hints[task];
  const references=input('creative-references','','checkbox');
  const status=el('p',{className:'assistant-status',role:'status'},'Consultando o assistente…');
  let provider:'ollama'|'anthropic'|'openai'='ollama';let quote:CreativeQuote|undefined;
  const cloud=()=>provider!=='ollama';const providerName=()=>provider==='openai'?'OpenAI':'Anthropic';
  const costDetails=el('div',{className:'section-stack','aria-live':'polite',hidden:true});
  const transferNotice=notice('Calcular o custo envia à Anthropic suas instruções pessoais, o perfil deste canal, os campos do editor e as referências selecionadas. A geração paga só começa após você conferir a estimativa e autorizar.');transferNotice.hidden=true;
  const output=el('section',{className:'creative-output','aria-live':'polite'},el('p',{className:'field-hint'},'A proposta aparece aqui depois de gerar. Nenhum campo será alterado antes de você aplicar.'));
  const resultActions=el('div',{className:'assistant-result-actions'});
  const feedback=el('p',{className:'alert form-error',role:'alert',hidden:true});
  const key=`${channelId}:${task}:${editor?JSON.stringify(editor.context):'free'}:${editor?.initialBrief??''}`;
  function show(draft:CreativeDraft):void {
    const content=editor&&draft.fields?renderValues(draft.fields):textarea('creative-result',draft.body,12);
    if(content instanceof HTMLTextAreaElement){content.readOnly=true;content.setAttribute('aria-label','Rascunho gerado pela IA');}
    replace(output,el('h3',{},draft.title),el('p',{className:'field-hint'},`Rascunho · ${draft.model} · revisão pendente`),draft.usage?el('p',{className:'field-hint'},`${draft.usage.inputTokens.toLocaleString('pt-BR')} tokens de entrada · ${draft.usage.outputTokens.toLocaleString('pt-BR')} de resposta · custo calculado: ${usd(draft.usage.estimatedCostUsd)}. Confira a cobrança no provedor.`):null,el('p',{className:'creative-draft-summary'},draft.body),content);
    replace(resultActions);
    if(editor&&draft.fields) {
      const apply=button(editor.applyLabel??'Usar nos campos',async()=>{
        if(apply.disabled)return;apply.disabled=true;feedback.hidden=true;
        try{if(!active())throw new Error('Abra novamente o editor nesta sessão.');const applying=editor.onApply(draft.fields!);if(applying)await applying;if(active())close();}
        catch(error){if(active()){feedback.textContent=error instanceof Error?error.message:'Não foi possível preencher o editor.';feedback.hidden=false;}}
        finally{apply.disabled=false;}
      },'primary','check');
      resultActions.append(apply);
    }
    else resultActions.append(button('Copiar rascunho',()=>{void navigator.clipboard.writeText(draft.body).catch(()=>{if(content instanceof HTMLTextAreaElement){content.focus();content.select();}});},'secondary'));
  }
  const submitLabel=()=>cloud()?(quote?'Autorizar e gerar':'Calcular custo'):'Gerar rascunho';
  const resetQuote=()=>{quote=undefined;costDetails.hidden=true;replace(costDetails);};
  const payload=()=>({task,brief:brief.value.trim(),includeReferences:references.checked,...(editor?{editorContext:editor.context}:{})});
  const {form,fields,actions}=formWithSave(submitLabel,async()=>{
    let paidAttempt=false;
    output.inert=true;resultActions.inert=true;resultActions.setAttribute('aria-busy','true');
    try {
      if(cloud()&&!quote){
        status.textContent=`Calculando a estimativa ${provider==='openai'?'na OpenAI':'na Anthropic'}. A geração ainda não começou…`;
        const estimated=await request<CreativeQuote>(`/api/channels/${encodeURIComponent(channelId)}/creative/quote`,'POST',{...payload(),consentToSend:true});
        if(!active())return;
        if(estimated.channelId!==channelId||!estimated.id||!Number.isFinite(estimated.estimatedMaxCostUsd)||estimated.estimatedMaxCostUsd<0||!Number.isFinite(estimated.costLimitUsd)||estimated.estimatedMaxCostUsd>estimated.costLimitUsd||Date.parse(estimated.expiresAt)<=Date.now()||!Number.isFinite(Date.parse(estimated.expiresAt)))throw new Error('A estimativa não corresponde a este pedido. Calcule novamente antes de autorizar.');
        quote=estimated;
        replace(costDetails,el('h3',{},'Confira antes de gerar'),el('p',{},`${estimated.model} · ${estimated.inputTokens.toLocaleString('pt-BR')} tokens de entrada · até ${estimated.maxOutputTokens.toLocaleString('pt-BR')} de resposta.`),el('p',{},`Estimativa máxima com margem: ${usd(estimated.estimatedMaxCostUsd)}. Limite configurado: ${usd(estimated.costLimitUsd)}.`),el('p',{className:'field-hint'},`Preços consultados em ${estimated.pricingCheckedAt}. A cobrança final pode variar. A autorização vale para este pedido por até cinco minutos. Alterar o pedido exige novo cálculo.`));
        costDetails.hidden=false;status.textContent='Estimativa pronta. Confira os valores e use Autorizar e gerar para iniciar a chamada paga.';return false;
      }
      const authorization=quote;
      if(cloud()&&(!authorization||Date.parse(authorization.expiresAt)<=Date.now())){resetQuote();throw new Error('A estimativa expirou. Calcule novamente antes de autorizar a geração.');}
      resetQuote();status.textContent=cloud()?`Gerando a proposta ${provider==='openai'?'com OpenAI':'com Claude'}…`:'Gerando a proposta no modelo local…';
      paidAttempt=cloud();
      const draft=await request<CreativeDraft>(`/api/channels/${encodeURIComponent(channelId)}/creative/draft`,'POST',{...payload(),...(cloud()?{quoteId:authorization!.id,authorizePaid:true}:{})});
      if(draft.channelId!==channelId||draft.task!==task)throw new Error('O rascunho não corresponde ao canal e à tarefa solicitados.');
      if(editor&&(!draft.fields||!fieldsMatch(task,draft.fields)||draft.status!=='draft'||draft.crossChecked!==false||draft.reviewRequired!==true))throw new Error('A resposta não contém campos válidos para este editor. Nenhuma alteração foi aplicada.');
      if(session!==draftSession)return;
      drafts.delete(key);drafts.set(key,{draft,brief:brief.value.trim(),includeReferences:references.checked});while(drafts.size>12)drafts.delete(drafts.keys().next().value!);
      if(active()){show(draft);tabs.activate('result');status.textContent='Proposta pronta para revisão. Aplicar preenche o editor, sem salvar.';}
    } catch(error) {resetQuote();if(active())status.textContent=cloud()?(paidAttempt?`O pedido não foi concluído. Pode haver cobrança; confira o consumo ${provider==='openai'?'na OpenAI':'na Anthropic'} antes de tentar novamente.`:'A geração não foi iniciada. Confira o erro e calcule novamente.'):'A proposta não foi gerada. Confira o erro e tente novamente.';throw error;}
    finally {output.inert=false;resultActions.inert=false;resultActions.removeAttribute('aria-busy');}
  },undefined,()=>cloud()&&!quote?'Calculando…':'Gerando…');
  form.id=`creative-form-${crypto.randomUUID()}`;
  const submit=form.querySelector<HTMLButtonElement>('button[type="submit"]')!;submit.setAttribute('form',form.id);submit.disabled=true;
  const invalidateQuote=()=>{if(!quote)return;resetQuote();setButtonLabel(submit,submitLabel(),'check');status.textContent='Pedido alterado. Calcule o custo novamente antes de autorizar.';};
  brief.addEventListener('input',invalidateQuote);references.addEventListener('change',invalidateQuote);
  fields.append(field('O que desenvolver?',brief,editor?'O pedido usa os campos atuais do editor.':hints[task]),el('label',{className:'checkbox-field'},references,'Acrescentar outras pesquisas revisadas do canal'),el('p',{className:'field-hint'},'Opcional: até seis pesquisas. As referências não são verificadas automaticamente.'),transferNotice,costDetails);
  const context=editor?renderValues(editor.context.values):el('p',{className:'field-hint'},'Este pedido usa o perfil do canal e as instruções pessoais.');
  const tabs=editorTabs('Assistente de criação',[{key:'request',label:'Pedido',content:form},{key:'context',label:'Dados usados',content:context},{key:'result',label:'Proposta',content:output}],key=>{actions.hidden=key!=='request';resultActions.hidden=key!=='result';});
  const back=button(editor?.mount?'Voltar ao editor':'Fechar',()=>protectEdits(close,body),'ghost','chevron');back.classList.add('assistant-back');
  const toolbar=el('div',{className:'assistant-actionbar'},back,el('span',{className:'spacer'}),actions,resultActions);
  const configuration=button('Configurar assistente',()=>protectEdits(()=>{close();void editCreativeSettings(channelId,channelName);},body),'ghost','settings');
  configuration.hidden=true;
  const setupHint=editor?.mount?el('p',{className:'field-hint'},'Configure o modelo em Configurações → Assistente de criação. Você pode voltar e continuar escrevendo.'):configuration;
  setupHint.hidden=true;
  body.append(el('div',{className:'assistant-heading'},el('h2',{},titles[task]),el('p',{className:'field-hint'},channelName)),toolbar,tabs.node,status,feedback,setupHint);
  const existing=drafts.get(key);if(existing){brief.value=existing.brief;references.checked=existing.includeReferences;show(existing.draft);queueMicrotask(()=>tabs.activate('result'));}
  else queueMicrotask(()=>{if(active())tabs.node.querySelector<HTMLButtonElement>('[aria-selected="true"]')?.focus({preventScroll:true});});
  void request<CreativeCapabilities>(`/api/creative/capabilities?channel_id=${encodeURIComponent(channelId)}`).then(capabilities=>{
    if(!active())return;
    provider=capabilities.provider==='openai'?'openai':capabilities.provider==='anthropic'?'anthropic':'ollama';transferNotice.hidden=!cloud();transferNotice.querySelector('p')!.textContent=`Calcular o custo envia ${provider==='openai'?'à OpenAI':'à Anthropic'} suas instruções pessoais, o perfil deste canal, os campos do editor e as referências selecionadas. A geração paga só começa após você conferir a estimativa e autorizar.`;setButtonLabel(submit,submitLabel(),'check');
    status.textContent=capabilities.available?(cloud()?`${providerName()}: ${capabilities.selectedModel}. Calcule a estimativa antes de autorizar a geração.`:`Modelo local: ${capabilities.selectedModel}. A geração começa ao enviar o pedido.`):capabilities.reason;
    status.className=capabilities.available?'assistant-status':'assistant-status alert';
    submit.disabled=!capabilities.available;setupHint.hidden=capabilities.available;
  }).catch(error=>{if(active()){status.textContent=error instanceof Error?error.message:'O assistente não respondeu.';status.className='assistant-status alert';submit.disabled=true;setupHint.hidden=false;}});
}

function usd(value:number):string {return new Intl.NumberFormat('pt-BR',{style:'currency',currency:'USD',minimumFractionDigits:3,maximumFractionDigits:4}).format(value);}
