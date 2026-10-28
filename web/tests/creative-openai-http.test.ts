import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createApp} from '../server/app.ts';
import {createCreativeService} from '../server/creative.ts';
import {PrivatePromptStore} from '../server/private-prompt.ts';
import {LocalStore} from '../server/store.ts';
import {AIUsageStore} from '../server/ai-usage.ts';
import type {SecretVault} from '../server/vault.ts';
import type {CreativeQuote} from '../shared/creative-types.ts';

const key='sk-OPENAI-HTTP-SYNTHETIC-ONLY-1234567890';
const anthropicKey='sk-ant-HTTP-SYNTHETIC-ONLY-1234567890';
const personal='PREFERENCIA_PRIVADA_HTTP_OPENAI_SINTETICA: seja claro e criativo.';
const password='synthetic OpenAI HTTP test password';
const editorial={task:'research',brief:'Proponha uma hipótese específica de canal com contribuição original.'};
const date=new Date('2026-10-28T12:00:00.000Z');
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'fc-openai-http-')),home=join(root,'profile');
 const store=new LocalStore(home);await store.ready;
 const settings=new PrivatePromptStore(root);await settings.save({content:personal,model:'',provider:'openai',openaiModel:'gpt-6.1-sol',maxOutputTokens:4096,maxCostUsd:.25});
 const secrets=new Map<string,string>();let writes=0,paid=0;
 const vault:SecretVault={get:async(owner,slot)=>secrets.get(`${owner}/${slot}`)??null,set:async(owner,slot,value)=>{writes++;secrets.set(`${owner}/${slot}`,value);},delete:async(owner,slot)=>{secrets.delete(`${owner}/${slot}`);}};
 const outbound:Array<{url:string;owner:string;credential:string|null}>=[];
 const usage=new AIUsageStore(join(home,'ai-usage'),{now:()=>date});
 const creative=createCreativeService({settings,vault,usage,now:()=>date,readState:()=>store.read(),fetch:async(url,init)=>{
  assert.ok(String(url).startsWith('https://api.openai.com/v1/responses'));const body=JSON.parse(String(init?.body));const owner=JSON.parse(body.input[0].content).channel.id;
  outbound.push({url:String(url),owner,credential:new Headers(init?.headers).get('Authorization')});
  if(String(url).endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:1000});
  paid++;return Response.json({object:'response',model:body.model,status:'completed',service_tier:'default',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({title:'Hipótese de canal para testar',body:'Uma hipótese sintética para apuração e revisão humana. Nenhuma pesquisa externa foi feita.'})}]}],usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:50}}});
 }});
 const app=await createApp({home,store,privatePrompt:settings,creative}),server=createServer(app.handler);await new Promise<void>(resolve=>server.listen(0,'127.0.0.1',resolve));
 const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
 type Session={cookie:string;csrf:string};
 async function session(setup=false):Promise<Session>{
  const anonymous=await fetch(origin+'/api/auth/status'),cookie=anonymous.headers.get('set-cookie')!.split(';')[0],csrf=(await anonymous.json()).csrfToken;
  const response=await fetch(origin+(setup?'/api/auth/setup':'/api/auth/login'),{method:'POST',headers:{Origin:origin,Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({password})});assert.equal(response.status,200);
  return {cookie:response.headers.get('set-cookie')!.split(';')[0],csrf:(await response.json()).csrfToken};
 }
 const primary=await session(true);
 const call=(path:string,method='GET',body?:unknown,options:{session?:Session|null;csrf?:boolean;origin?:string}={})=>{const selected=options.session===undefined?primary:options.session;return fetch(origin+path,{method,headers:{Origin:options.origin??origin,...(selected?{Cookie:selected.cookie}:{}),...(selected&&method!=='GET'&&options.csrf!==false?{'X-CSRF-Token':selected.csrf}:{}),...(body===undefined?{}:{'Content-Type':'application/json'})},...(body===undefined?{}:{body:JSON.stringify(body)})});};
 for(const id of ['tech','science'])assert.equal((await call('/api/channels','POST',{id,name:`Canal sintético ${id}`})).status,201);
 return {root,home,app,settings,usage,secrets,call,session:()=>session(),outbound,writes:()=>writes,paid:()=>paid,close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(root,{recursive:true,force:true});}};
}

test('OpenAI key and usage HTTP routes require authentication/CSRF and keep provider secrets out of state',async()=>{
 const f=await fixture();try{
  const path='/api/channels/tech/creative/keys/openai';
  assert.equal((await f.call(path,'GET',undefined,{session:null})).status,401);
  assert.equal((await f.call('/api/channels/tech/creative/usage','GET',undefined,{session:null})).status,401);
  assert.equal((await f.call(path,'PUT',{key},{csrf:false})).status,403);
  assert.equal((await f.call(path,'PUT',{key},{origin:'https://foreign.example'})).status,403);
  assert.equal((await f.call(path,'PUT',{key,endpoint:'https://foreign.example'})).status,400);assert.equal(f.writes(),0);assert.equal(f.outbound.length,0);
  const saved=await f.call(path,'PUT',{key});assert.equal(saved.status,200);assert.deepEqual(await saved.json(),{configured:true});
  assert.equal((await f.call('/api/channels/tech/creative/key','PUT',{key:anthropicKey})).status,200);
  assert.equal(f.secrets.get('tech/openai'),key);assert.equal(f.secrets.get('tech/anthropic'),anthropicKey);
  for(const url of [path,'/api/channels/tech/creative/key','/api/creative/settings','/api/bootstrap','/api/channels/tech/creative/usage?days=30&provider=openai']){const response=await f.call(url);assert.equal(response.status,200);const text=await response.text();assert.equal(text.includes(key),false);assert.equal(text.includes(anthropicKey),false);if(url!=='/api/creative/settings')assert.equal(text.includes(personal),false);}
  const caps=await(await f.call('/api/creative/capabilities?channel_id=tech')).json();assert.equal(caps.provider,'openai');assert.equal(caps.available,true);assert.equal(f.outbound.length,0);
  assert.equal((await f.call('/api/channels/tech/creative/usage?days=0')).status,400);
  assert.equal((await f.call('/api/channels/tech/creative/usage?provider=foreign')).status,400);
  assert.equal((await f.call('/api/channels/missing/creative/usage')).status,404);
  assert.equal((await f.call(path,'DELETE',undefined,{csrf:false})).status,403);assert.equal((await f.call(path,'DELETE')).status,200);
  assert.equal(f.secrets.has('tech/openai'),false);assert.equal(f.secrets.get('tech/anthropic'),anthropicKey);
 }finally{await f.close();}
});

test('OpenAI HTTP generation needs consent and authorization, persists usage and leaves editorial state unchanged',async()=>{
 const f=await fixture();try{
  await f.call('/api/channels/tech/creative/keys/openai','PUT',{key});const before=await f.app.store.read();
  assert.equal((await f.call('/api/channels/tech/creative/quote','POST',{...editorial,consentToSend:true},{csrf:false})).status,403);
  assert.equal((await f.call('/api/channels/tech/creative/quote','POST',editorial)).status,400);
  assert.equal((await f.call('/api/channels/tech/creative/draft','POST',editorial)).status,409);assert.equal(f.outbound.length,0);
  const estimated=await f.call('/api/channels/tech/creative/quote','POST',{...editorial,consentToSend:true});assert.equal(estimated.status,200);const quote=await estimated.json() as CreativeQuote;assert.equal(quote.model,'gpt-6.1-sol');assert.equal(f.paid(),0);
  const paid={...editorial,quoteId:quote.id,authorizePaid:true};assert.equal((await f.call('/api/channels/tech/creative/draft','POST',paid,{csrf:false})).status,403);assert.equal(f.paid(),0);
  const generated=await f.call('/api/channels/tech/creative/draft','POST',paid);assert.equal(generated.status,200);const draft=await generated.json();assert.equal(draft.model,'gpt-6.1-sol');assert.equal(draft.reviewRequired,true);assert.equal(draft.status,'draft');assert.equal(draft.usage.inputTokens,1000);assert.equal(f.paid(),1);
  assert.deepEqual(await f.app.store.read(),before);assert.equal((await f.call('/api/channels/tech/creative/draft','POST',paid)).status,409);assert.equal(f.paid(),1);
  const snapshot=await(await f.call('/api/channels/tech/creative/usage?days=30&provider=openai')).json();assert.equal(snapshot.scope,'studio');assert.equal(snapshot.totals.generationRequests,1);assert.equal(snapshot.totals.inputTokens,1000);assert.equal(snapshot.totals.outputTokens,200);assert.equal(snapshot.totals.estimatedCostUsd,.004);
  assert.ok(f.outbound.every(row=>row.credential===`Bearer ${key}`&&row.owner==='tech'));
  const persisted=await readFile(join(f.home,'ai-usage','usage.json'),'utf8');for(const value of [key,personal,editorial.brief])assert.equal(persisted.includes(value),false);
 }finally{await f.close();}
});

test('OpenAI HTTP quotes cannot cross channel or login session and usage remains isolated',async()=>{
 const f=await fixture();try{
  await f.call('/api/channels/tech/creative/keys/openai','PUT',{key});await f.call('/api/channels/science/creative/keys/openai','PUT',{key:key+'science'});
  const quote=await(await f.call('/api/channels/tech/creative/quote','POST',{...editorial,consentToSend:true})).json() as CreativeQuote,paid={...editorial,quoteId:quote.id,authorizePaid:true};
  assert.equal((await f.call('/api/channels/science/creative/draft','POST',paid)).status,409);
  assert.equal((await f.call('/api/channels/tech/creative/draft','POST',paid,{session:await f.session()})).status,409);assert.equal(f.paid(),0);
  assert.equal((await f.call('/api/channels/tech/creative/draft','POST',paid)).status,200);assert.equal(f.paid(),1);
  const tech=await(await f.call('/api/channels/tech/creative/usage')).json(),science=await(await f.call('/api/channels/science/creative/usage')).json();assert.equal(tech.totals.generationRequests,1);assert.equal(science.events.length,0);assert.equal(science.totals.generationRequests,0);
 }finally{await f.close();}
});
