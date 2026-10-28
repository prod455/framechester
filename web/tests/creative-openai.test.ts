import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {PrivatePromptStore} from '../server/private-prompt.ts';
import {createCreativeService} from '../server/creative.ts';
import {AIUsageStore} from '../server/ai-usage.ts';
import {defaultConfig} from '../server/store.ts';
import type {AppState} from '../shared/types.ts';
import type {SecretVault} from '../server/vault.ts';

const request={task:'story',brief:'Desenvolva a descoberta com uma comparação visual original.',editorContext:{task:'story',values:{title:'Uma ideia do operador',hook:'Uma pergunta concreta',setup:'Um exemplo original',conflict:'Uma dúvida',turningPoint:'Uma comparação revela a diferença',resolution:'Uma explicação fundamentada',cta:'Que outra pergunta você investigaria?'}}};
const key='sk-OPENAI-SYNTHETIC-ONLY-1234567890';
const personal='PREFERENCIA_OPENAI_PRIVADA_SINTETICA. Use criatividade com evidências.';
const time=new Date('2026-10-28T12:00:00.000Z');
async function fixture(){
 const root=await mkdtemp(join(tmpdir(),'fc-openai-creative-')),directory=join(root,'usage');
 const settings=new PrivatePromptStore(root);
 await settings.save({content:personal,model:'',provider:'openai',openaiModel:'gpt-6.1-sol',maxOutputTokens:4096,maxCostUsd:.25});
 const state:AppState={schemaVersion:1,config:defaultConfig(),channelConfigs:{},channels:['tech','science'].map(id=>({id,name:id,description:'',niche:'Ciência',audience:'Curiosos',language:'pt-BR',createdAt:'',updatedAt:''})),research:[],scripts:[],stories:[],monetization:[],receipts:[]};
 const keys=new Map<string,string>();
 const vault:SecretVault={get:async(id,slot)=>keys.get(`${id}/${slot}`)??null,set:async(id,slot,value)=>{keys.set(`${id}/${slot}`,value);},delete:async(id,slot)=>{keys.delete(`${id}/${slot}`);}};
 const usage=new AIUsageStore(directory,{now:()=>time});let mode:'valid'|'refusal'|'invalid'|'timeout'='valid',calls=0,paid=0;
 const fetcher:typeof fetch=async(url,init)=>{
  calls++;assert.ok(String(url).startsWith('https://api.openai.com/v1/responses'));assert.equal(init?.redirect,'error');
  const body=JSON.parse(String(init?.body));assert.ok(body.instructions.includes(personal));
  const payload=JSON.parse(body.input[0].content);assert.ok(['tech','science'].includes(payload.channel.id));assert.equal(payload.editorContext.values.title,'Uma ideia do operador');
  if(String(url).endsWith('/input_tokens'))return Response.json({object:'response.input_tokens',input_tokens:1000});
  paid++;if(mode==='timeout')throw new Error('private upstream secret '+key);
  return Response.json({object:'response',model:body.model,status:'completed',service_tier:'default',output:[{type:'message',role:'assistant',status:'completed',content:mode==='refusal'?[{type:'refusal',refusal:'synthetic private refusal'}]:[{type:'output_text',text:JSON.stringify({title:'A descoberta explicada',body:'Uma proposta sintética para revisão humana antes de aplicar ao editor.',fields:{...request.editorContext.values,title:'A descoberta explicada',...(mode==='invalid'?{foreign:'not allowed'}:{})}})}]}],usage:{input_tokens:1000,output_tokens:200,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:80}}});
 };
 const service=createCreativeService({settings,readState:async()=>structuredClone(state),vault,usage,fetch:fetcher,now:()=>time});
 await service.saveKey!('tech',key,'openai');await service.saveKey!('science',key+'science','openai');
 return {root,directory,settings,state,keys,usage,service,calls:()=>calls,paid:()=>paid,setMode:(value:typeof mode)=>{mode=value;},close:()=>rm(root,{recursive:true,force:true})};
}

test('OpenAI drafts use current editorial fields and persist only channel/key usage metadata',async()=>{
 const f=await fixture();try{
  const before=structuredClone(f.state);
  const caps=await f.service.capabilities('tech');assert.equal(caps.provider,'openai');assert.equal(caps.available,true);assert.equal(f.calls(),0);
  const quote=await f.service.quote!('tech',{...request,consentToSend:true},'session-a');assert.equal(f.paid(),0);
  const draft=await f.service.draft('tech',{...request,quoteId:quote.id,authorizePaid:true},'session-a');
  assert.equal(draft.model,'gpt-6.1-sol');assert.equal(draft.channelId,'tech');assert.equal(draft.status,'draft');assert.equal(draft.reviewRequired,true);assert.equal(draft.fields?.title,'A descoberta explicada');assert.deepEqual(f.state,before);
  const snapshot=await f.usage.snapshot('tech',{provider:'openai'});assert.equal(snapshot.totals.estimateRequests,1);assert.equal(snapshot.totals.generationRequests,1);assert.equal(snapshot.totals.inputTokens,1000);assert.equal(snapshot.totals.outputTokens,200);assert.equal(snapshot.totals.reasoningTokens,80);assert.equal(snapshot.totals.estimatedCostUsd,.004);
  assert.equal((await f.usage.snapshot('science')).events.length,0);
  const persisted=await readFile(join(f.directory,'usage.json'),'utf8');for(const value of [key,personal,request.brief,request.editorContext.values.title])assert.equal(persisted.includes(value),false);
  const restored=await new AIUsageStore(f.directory,{now:()=>time}).snapshot('tech');assert.equal(restored.totals.generationRequests,1);assert.equal(restored.totals.estimatedCostUsd,.004);
 }finally{await f.close();}
});

test('refused or invalid generated content retains measured usage without becoming an accepted draft',async()=>{
 const f=await fixture();try{
  for(const mode of ['refusal','invalid'] as const){f.setMode(mode);const quote=await f.service.quote!('tech',{...request,consentToSend:true},'a');await assert.rejects(f.service.draft('tech',{...request,quoteId:quote.id,authorizePaid:true},'a'),/resposta|formato|compatível/i);}
  const snapshot=await f.usage.snapshot('tech',{provider:'openai'});assert.equal(snapshot.totals.generationRequests,2);assert.equal(snapshot.totals.failedGenerations,2);assert.equal(snapshot.totals.inputTokens,2000);assert.equal(snapshot.totals.outputTokens,400);assert.equal(snapshot.totals.estimatedCostUsd,.008);
  assert.equal(snapshot.events.filter(row=>row.operation==='generation').every(row=>row.status==='rejected'),true);assert.equal(f.state.stories.length,0);
 }finally{await f.close();}
});

test('an unconfirmed OpenAI request has unknown cost and cannot reuse its authorization',async()=>{
 const f=await fixture();try{
  f.setMode('timeout');const quote=await f.service.quote!('tech',{...request,consentToSend:true},'a');
  await assert.rejects(f.service.draft('tech',{...request,quoteId:quote.id,authorizePaid:true},'a'),error=>error instanceof Error&&!error.message.includes(key));
  const snapshot=await f.usage.snapshot('tech');const event=snapshot.events.find(row=>row.operation==='generation')!;
  assert.equal(event.status,'unknown');assert.equal(event.estimatedCostUsd,null);assert.equal(event.inputTokens,null);assert.equal(snapshot.totals.unknownGenerations,1);assert.equal(snapshot.totals.unknownCostRequests,1);
  await assert.rejects(f.service.draft('tech',{...request,quoteId:quote.id,authorizePaid:true},'a'),/estimativa|autoriza/i);assert.equal(f.paid(),1);
 }finally{await f.close();}
});

test('provider, channel and session changes cannot spend an OpenAI quote or mix credentials/history',async()=>{
 const f=await fixture();try{
  await f.service.saveKey!('tech','sk-ant-SYNTHETIC-ONLY-1234567890','anthropic');
  assert.deepEqual(await f.service.keyStatus!('tech','openai'),{configured:true});assert.deepEqual(await f.service.keyStatus!('tech','anthropic'),{configured:true});
  const quote=await f.service.quote!('tech',{...request,consentToSend:true},'a'),paid={...request,quoteId:quote.id,authorizePaid:true};
  await assert.rejects(f.service.draft('science',paid,'a'),/estimativa|canal|autoriza/i);
  await assert.rejects(f.service.draft('tech',paid,'other-session'),/estimativa|sessão|autoriza/i);assert.equal(f.paid(),0);
  await f.settings.save({content:personal,model:'',provider:'anthropic'});await assert.rejects(f.service.draft('tech',paid,'a'),/estimativa|provedor|mudou|autoriza/i);assert.equal(f.paid(),0);
  await f.service.deleteKey!('tech','openai');assert.deepEqual(await f.service.keyStatus!('tech','openai'),{configured:false});assert.deepEqual(await f.service.keyStatus!('tech','anthropic'),{configured:true});
  assert.equal((await f.usage.snapshot('tech',{provider:'anthropic'})).events.length,0);assert.equal((await f.usage.snapshot('tech',{provider:'openai'})).totals.estimateRequests,1);
 }finally{await f.close();}
});
