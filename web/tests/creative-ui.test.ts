import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { Window } from 'happy-dom';
import type { CreativeDraft, CreativeEditorContext } from '../shared/creative-types.ts';

const browser = new Window({ url: 'http://localhost:4318' });
for (const name of ['window', 'document', 'Node', 'Element', 'HTMLElement', 'HTMLFormElement', 'HTMLInputElement', 'HTMLSelectElement', 'HTMLTextAreaElement', 'HTMLDialogElement', 'Event', 'MouseEvent', 'KeyboardEvent', 'CustomEvent', 'MutationObserver'] as const) {
  Object.assign(globalThis, { [name]: name === 'window' ? browser : name === 'document' ? browser.document : browser[name] });
}
const { openCreativeDraft, clearCreativeDrafts, editCreativeSettings } = await import('../src/creative-ui.ts');
const tick = () => new Promise<void>(resolve => setImmediate(resolve));
const context: CreativeEditorContext = { task: 'story', values: { title: 'Ideia ainda não salva', hook: 'Uma pergunta concreta', setup: 'Contexto do editor', conflict: 'Dúvida real', turningPoint: '', resolution: '', cta: 'Continuar aprendendo' } };
const draft: CreativeDraft = { channelId: 'tech', task: 'story', title: 'Narrativa proposta', body: 'Uma prévia sintética para revisão humana antes de usar os campos.', model: 'fixture', createdAt: '', status: 'draft', crossChecked: false, reviewRequired: true, fields: { title: 'Narrativa proposta', hook: 'Gancho proposto', setup: 'Contexto proposto', conflict: 'Pergunta em aberto', turningPoint: 'Descoberta', resolution: 'Resposta', cta: 'Próxima pergunta' } };
const originalFetch = globalThis.fetch;
const claudeCapabilities={provider:'anthropic',available:true,selectedModel:'claude-sonnet-5-5',models:['claude-sonnet-5-5'],maxCostUsd:0.25,maxOutputTokens:4096};
const quote={id:'synthetic-quote',channelId:'tech',model:'claude-sonnet-5-5',inputTokens:1000,maxOutputTokens:4096,estimatedMaxCostUsd:0.05,costLimitUsd:0.25,expiresAt:new Date(Date.now()+300000).toISOString(),pricingCheckedAt:'2026-10-28'};
afterEach(() => { browser.document.body.replaceChildren(); clearCreativeDrafts(); globalThis.fetch = originalFetch; });

async function submit(): Promise<void> {
  const brief = document.querySelector<HTMLTextAreaElement>('[name="creative-brief"]')!;
  brief.value = 'Desenvolva esta ideia sem inventar fontes ou fatos.';
  brief.form!.dispatchEvent(new Event('submit', { cancelable: true })); await tick();
}

test('Claude counts an explicitly submitted request and waits for a separate paid authorization',async()=>{
  const calls:Array<{url:string;body:Record<string,unknown>}> = [];
  globalThis.fetch=async(url,init)=>{
    if(init?.method==='POST'){const body=JSON.parse(String(init.body));calls.push({url:String(url),body});return Response.json(String(url).endsWith('/quote')?quote:{...draft,usage:{inputTokens:1000,outputTokens:200,estimatedCostUsd:0.004,currency:'USD'}});}
    assert.match(String(url),/channel_id=tech/);return Response.json(claudeCapabilities);
  };
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();
  assert.match(document.body.textContent!,/Anthropic/);
  assert.equal(calls.length,0);
  await submit();
  assert.equal(calls.length,1);assert.match(calls[0].url,/\/quote$/);assert.equal(calls[0].body.consentToSend,true);assert.deepEqual(calls[0].body.editorContext,context);
  assert.match(document.body.textContent!,/0[,.]050/);
  const authorize=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('Autorizar e gerar'))!;
  assert.ok(authorize);authorize.click();await tick();
  assert.equal(calls.length,2);assert.match(calls[1].url,/\/draft$/);assert.equal(calls[1].body.quoteId,quote.id);assert.equal(calls[1].body.authorizePaid,true);
  assert.match(document.body.textContent!,/0[,.]004/);
  assert.equal(document.querySelectorAll('dialog').length,1);
});

test('changing a Claude briefing or references invalidates the quote before any paid call',async()=>{
  let paid=0;
  globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/draft'))paid++;return Response.json(init?.method==='POST'?quote:claudeCapabilities);};
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();await submit();
  const brief=document.querySelector<HTMLTextAreaElement>('[name="creative-brief"]')!;
  brief.value+=' Uma nova solicitação.';brief.dispatchEvent(new Event('input',{bubbles:true}));await tick();
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent?.includes('Autorizar e gerar')&&!button.hidden),false);
  assert.equal(paid,0);
  await submit();
  const references=document.querySelector<HTMLInputElement>('[name="creative-references"]')!;references.checked=true;references.dispatchEvent(new Event('change',{bubbles:true}));
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent?.includes('Autorizar e gerar')&&!button.hidden),false);assert.equal(paid,0);
});

test('a failed paid request requires a new quote and never retries automatically',async()=>{
  let paid=0;
  globalThis.fetch=async(url,init)=>{
    if(String(url).endsWith('/draft')){paid++;return Response.json({error:'Falha na geração. Confira o consumo antes de repetir.'},{status:503});}
    return Response.json(init?.method==='POST'?quote:claudeCapabilities);
  };
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();await submit();
  [...document.querySelectorAll('button')].find(button=>button.textContent?.includes('Autorizar e gerar'))!.click();await tick();await tick();
  assert.equal(paid,1);assert.match(document.body.textContent!,/Confira o consumo/);
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent?.includes('Autorizar e gerar')&&!button.hidden),false);
});

test('an expired quote or quote for another channel never reaches paid generation',async()=>{
  for(const invalid of [{...quote,channelId:'science'},{...quote,expiresAt:'2020-01-01T00:00:00Z'}]){
    let paid=0;
    globalThis.fetch=async(url,init)=>{if(String(url).endsWith('/draft'))paid++;return Response.json(init?.method==='POST'?invalid:claudeCapabilities);};
    openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();await submit();
    assert.equal(paid,0);assert.match(document.body.textContent!,/Calcule novamente/);
    assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent?.includes('Autorizar e gerar')&&!button.hidden),false);
    browser.document.body.replaceChildren();clearCreativeDrafts();
  }
});

test('Claude settings save a channel key without reading it back or persisting it in preferences',async()=>{
  const writes:Array<{url:string;body:Record<string,unknown>}> = [];
  globalThis.fetch=async(url,init)=>{
    if(init?.method==='PUT'){writes.push({url:String(url),body:JSON.parse(String(init.body))});return Response.json({configured:true});}
    if(String(url).endsWith('/settings'))return Response.json({prompt:{content:'Direção editorial sintética.',fileName:'.framechester/system-prompt.personal.md'},model:'',provider:'anthropic',anthropicModel:'claude-sonnet-5-5',maxOutputTokens:4096,maxCostUsd:0.25});
    if(String(url).includes('/keys/'))return Response.json({configured:false});
    return Response.json(claudeCapabilities);
  };
  await editCreativeSettings('tech','Canal de teste');
  const secret=document.querySelector<HTMLInputElement>('[name="creative-api-key"]')!;assert.ok(secret);assert.equal(secret.type,'password');assert.equal(secret.value,'');
  secret.value='synthetic-key-only-123456';secret.form!.dispatchEvent(new Event('submit',{cancelable:true}));await tick();
  assert.equal(writes.length,1);assert.match(writes[0].url,/channels\/tech\/creative\/keys\/anthropic$/);assert.deepEqual(writes[0].body,{key:'synthetic-key-only-123456'});assert.equal(secret.value,'');
  assert.equal(document.body.textContent!.includes('synthetic-key-only-123456'),false);
});

test('OpenAI uses its own transmission notice and the same separate quote and paid authorization',async()=>{
  const calls:Array<{url:string;body:Record<string,unknown>}>=[];
  globalThis.fetch=async(url,init)=>{
    if(init?.method==='POST'){calls.push({url:String(url),body:JSON.parse(String(init.body))});return Response.json(String(url).endsWith('/quote')?{...quote,model:'gpt-6.1-sol'}:{...draft,model:'gpt-6.1-sol'});}
    return Response.json({provider:'openai',available:true,selectedModel:'gpt-6.1-sol',models:['gpt-6.1-sol']});
  };
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();
  assert.match(document.body.textContent!,/envia.*OpenAI/);assert.doesNotMatch(document.body.textContent!,/envia à Anthropic/);
  await submit();assert.equal(calls.length,1);assert.match(calls[0].url,/quote$/);
  [...document.querySelectorAll('button')].find(button=>button.textContent?.includes('Autorizar e gerar'))!.click();await tick();assert.equal(calls.length,2);assert.equal(calls[1].body.authorizePaid,true);
});

test('settings preserve both model choices, clear key input on provider change and load consumption only when requested',async()=>{
 const requests:Array<{url:string;method:string;body?:Record<string,unknown>}>=[];
 globalThis.fetch=async(url,init)=>{
   const target=String(url);requests.push({url:target,method:init?.method||'GET',...(init?.body?{body:JSON.parse(String(init.body))}:{})});
   if(target.endsWith('/settings'))return Response.json({prompt:{content:'',fileName:'.framechester/system-prompt.personal.md'},model:'',provider:'openai',anthropicModel:'claude-haiku-5-5',openaiModel:'gpt-6-luna',maxOutputTokens:4096,maxCostUsd:.25});
   if(target.includes('/keys/'))return Response.json({configured:target.endsWith('anthropic')});
   if(target.includes('/usage'))return Response.json({scope:'studio',channelId:'tech',from:'2026-10-01',to:'2026-10-28',events:[],byCredential:[],totals:{generationRequests:0,estimateRequests:0}});
   return Response.json({provider:'openai',available:false,selectedModel:'gpt-6-luna',models:['gpt-6.1-sol','gpt-6-luna']});
 };
 await editCreativeSettings('tech','Canal de teste');
 const openaiModel=document.querySelector<HTMLSelectElement>('[name="openai-model"]')!;assert.equal(openaiModel.value,'gpt-6-luna');
 const personal=document.querySelector<HTMLTextAreaElement>('[name="personal-prompt"]')!;assert.equal(personal.required,false);
 assert.equal(personal.form!.checkValidity(),true,[...personal.form!.elements].filter(item=>'validity' in item&&!(item as HTMLInputElement).validity.valid).map(item=>(item as HTMLInputElement).name).join(','));
 personal.form!.dispatchEvent(new Event('submit',{cancelable:true}));await tick();
 const preference=requests.find(item=>item.method==='PUT'&&item.url.endsWith('/settings'))!.body!;assert.equal(preference.openaiModel,'gpt-6-luna');assert.equal(preference.anthropicModel,'claude-haiku-5-5');assert.equal('key' in preference,false);
 const key=document.querySelector<HTMLInputElement>('[name="creative-api-key"]')!;key.value='synthetic-unsubmitted-key-1234';
 const keyProvider=document.querySelector<HTMLSelectElement>('[name="creative-key-provider"]')!;assert.equal(keyProvider.value,'openai');keyProvider.value='anthropic';keyProvider.dispatchEvent(new Event('change'));await tick();assert.equal(key.value,'');
 assert.equal(requests.some(item=>item.url.includes('/usage')),false);
 [...document.querySelectorAll<HTMLButtonElement>('[role="tab"]')].find(item=>item.textContent==='Consumo')!.click();await tick();
 assert.equal(requests.filter(item=>item.url.includes('/usage')).length,1);
});

test('a failed cost estimate reports that generation never started',async()=>{
  globalThis.fetch=async(_url,init)=>init?.method==='POST'?Response.json({error:'A contagem falhou.'},{status:503}):Response.json(claudeCapabilities);
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();await submit();
  assert.match(document.querySelector('.assistant-status')!.textContent!,/não foi iniciada|não foi solicitada/);
  assert.doesNotMatch(document.querySelector('.assistant-status')!.textContent!,/Pode haver cobrança/);
});

test('counting tokens does not mark an edited briefing as saved or discard it on back',async()=>{
  globalThis.fetch=async(_url,init)=>Response.json(init?.method==='POST'?quote:claudeCapabilities);
  const host=document.createElement('section');document.body.append(host);let closed=false;
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{},mount:{host,onClose:()=>{closed=true;}}});await tick();
  await submit();
  [...host.querySelectorAll('button')].find(item=>item.textContent?.includes('Voltar ao editor'))!.click();await tick();
  assert.equal(closed,false);assert.match(document.body.textContent!,/Há alterações não salvas/);
});

test('generation uses the current editor values and applies fields only after the operator chooses', async () => {
  let sent: Record<string, unknown> | undefined; let applied = 0;
  const destination = document.createElement('input'); destination.value = 'Original'; document.body.append(destination);
  globalThis.fetch = async (_url, init) => {
    if (init?.method === 'POST') { sent = JSON.parse(String(init.body)); return Response.json(draft); }
    return Response.json({ available: true, selectedModel: 'fixture', models: ['fixture'] });
  };
  openCreativeDraft('story', 'tech', 'Canal de teste', { context, onApply: fields => { destination.value = fields.title; applied++; } }); await tick();
  assert.match(document.body.textContent!, /Ideia ainda não salva/);
  await submit();
  assert.deepEqual(sent?.editorContext, context);
  assert.equal(destination.value, 'Original'); assert.equal(applied, 0);
  const apply = [...document.querySelectorAll('button')].find(button => button.textContent?.includes('Usar nos campos'))!;
  assert.ok(apply); apply.click();
  assert.equal(destination.value, 'Narrativa proposta'); assert.equal(applied, 1);
  assert.equal(document.querySelectorAll('dialog').length, 0);
});

test('a response from another channel or without structured fields cannot overwrite the editor', async () => {
  for (const response of [{ ...draft, channelId: 'other' }, { ...draft, fields: undefined }]) {
    let applied = false;
    globalThis.fetch = async (_url, init) => Response.json(init?.method === 'POST' ? response : { available: true, selectedModel: 'fixture' });
    openCreativeDraft('story', 'tech', 'Canal de teste', { context, onApply: () => { applied = true; } }); await tick(); await submit();
    assert.equal([...document.querySelectorAll('button')].some(button => button.textContent?.includes('Usar nos campos')), false);
    assert.equal(applied, false);
    assert.ok(document.querySelector('[role="alert"]')?.textContent);
    document.body.replaceChildren(); clearCreativeDrafts();
  }
});

test('opening settings for an unavailable model cannot silently discard the edited briefing', async () => {
  let settingsReads=0;
  globalThis.fetch=async url=>{if(String(url).includes('/settings'))settingsReads++;return Response.json({available:false,reason:'Configure o modelo local.'});};
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();
  const brief=document.querySelector<HTMLTextAreaElement>('[name="creative-brief"]')!;brief.value='Um pedido alterado que precisa ser preservado.';
  [...document.querySelectorAll('button')].find(button=>button.textContent==='Configurar assistente')!.click();await tick();
  assert.equal(settingsReads,0);assert.equal(brief.isConnected,true);
  assert.match(document.body.textContent!,/Há alterações não salvas/);
});

test('inline assistance uses the existing editing surface and returns only after explicit application', async () => {
  globalThis.fetch = async (_url, init) => Response.json(init?.method === 'POST' ? draft : { available: true, selectedModel: 'fixture' });
  const dialog = document.createElement('dialog'), editor = document.createElement('input'), host = document.createElement('section');
  editor.value = 'Edição ainda não salva'; dialog.append(editor, host); document.body.append(dialog); dialog.showModal();
  let applied = 0, closed = 0;
  openCreativeDraft('story', 'tech', 'Canal de teste', {
    context, onApply: fields => { editor.value = fields.title; applied++; },
    mount: { host, onClose: () => { closed++; host.remove(); } },
  }); await tick();
  assert.equal(document.querySelectorAll('dialog').length, 1);
  const brief = host.querySelector<HTMLTextAreaElement>('[name="creative-brief"]')!;
  brief.value = 'Meu pedido em andamento';
  [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Voltar ao editor'))!.click(); await tick();
  assert.equal(closed, 0); assert.equal(brief.value, 'Meu pedido em andamento');
  [...document.querySelectorAll('button')].find(button => button.textContent === 'Continuar editando')!.click();
  assert.equal(document.querySelectorAll('dialog').length, 1);
  await submit();
  assert.equal(editor.value, 'Edição ainda não salva'); assert.equal(applied, 0);
  assert.equal(document.querySelector('[aria-selected="true"]')?.textContent, 'Proposta');
  [...host.querySelectorAll('button')].find(button => button.textContent?.includes('Usar nos campos'))!.click();
  assert.equal(applied, 1); assert.equal(closed, 1); assert.equal(editor.value, 'Narrativa proposta');
  assert.equal(document.querySelectorAll('dialog').length, 1);
});

test('a generated editor draft is retained for its exact context and is not reused for another idea', async () => {
  globalThis.fetch=async (_url,init)=>Response.json(init?.method==='POST'?draft:{available:true,selectedModel:'fixture'});
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();await submit();
  document.querySelector('dialog')!.close();
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent?.includes('Usar nos campos')),true);
  assert.equal(document.querySelector<HTMLTextAreaElement>('[name="creative-brief"]')!.value,'Desenvolva esta ideia sem inventar fontes ou fatos.');
  document.querySelector('dialog')!.close();
  openCreativeDraft('story','tech','Canal de teste',{context:{task:'story',values:{...context.values,title:'Outra ideia'}},onApply:()=>{}});await tick();
  assert.equal([...document.querySelectorAll('button')].some(button=>button.textContent?.includes('Usar nos campos')),false);
});

test('an earlier result is inert while a replacement generation is in flight', async () => {
  globalThis.fetch=async (_url,init)=>Response.json(init?.method==='POST'?draft:{available:true,selectedModel:'fixture'});
  openCreativeDraft('story','tech','Canal de teste',{context,onApply:()=>{}});await tick();await submit();
  let finish:((response:Response)=>void)|undefined;
  globalThis.fetch=async ()=>new Promise<Response>(resolve=>{finish=resolve;});
  const brief=document.querySelector<HTMLTextAreaElement>('[name="creative-brief"]')!;
  brief.form!.dispatchEvent(new Event('submit',{cancelable:true}));
  assert.equal(document.querySelector<HTMLElement>('.creative-output')!.inert,true);
  finish!(Response.json(draft));await tick();
  assert.equal(document.querySelector<HTMLElement>('.creative-output')!.inert,false);
});

test('a generation failure releases the actions and reports a recoverable error instead of remaining busy', async () => {
  globalThis.fetch = async (_url, init) => init?.method === 'POST'
    ? Response.json({ error: 'O modelo local demorou demais. Tente novamente.' }, { status: 504 })
    : Response.json({ available: true, selectedModel: 'fixture' });
  const host = document.createElement('section'); document.body.append(host);
  openCreativeDraft('story', 'tech', 'Canal de teste', { context, onApply: () => {}, mount: { host, onClose: () => {} } }); await tick();
  await submit();
  assert.match(host.querySelector('.form-error')!.textContent!, /Tente novamente/);
  assert.doesNotMatch(host.querySelector('.assistant-status')!.textContent!, /Gerando/);
  assert.equal(host.querySelector<HTMLButtonElement>('button[type="submit"]')!.disabled, false);
  assert.equal(host.querySelector<HTMLElement>('.creative-output')!.inert, false);
  assert.equal(document.querySelectorAll('dialog').length, 0);
});

test('adaptation presets await saving a new script and never generate automatically',async()=>{
  let generations=0;let complete!:()=>void;
  const saved=new Promise<void>(resolve=>{complete=resolve;});
  globalThis.fetch=async(_url,init)=>{if(init?.method==='POST')generations++;return Response.json(init?.method==='POST'?draft:{available:true,selectedModel:'fixture'});};
  const initialBrief='Adapte para uma explicação com visuais locais, sem afirmar testes não realizados.';
  openCreativeDraft('story','tech','Canal de teste',{context,initialBrief,applyLabel:'Salvar como novo roteiro',onApply:async()=>{await saved;}});
  await tick();assert.equal(generations,0);
  assert.equal(document.querySelector<HTMLTextAreaElement>('[name="creative-brief"]')!.value,initialBrief);
  await submit();
  const apply=[...document.querySelectorAll('button')].find(button=>button.textContent?.includes('Salvar como novo roteiro'))!;
  assert.ok(apply);apply.click();await tick();assert.equal(apply.disabled,true);assert.ok(document.querySelector('dialog'));
  complete();await tick();await tick();assert.equal(document.querySelector('dialog'),null);
});
