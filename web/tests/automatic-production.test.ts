import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {LocalStore} from '../server/store.ts';
import {createAutomaticProduction} from '../server/automatic-production.ts';
import type {CreativeApi,CreativeInput} from '../server/creative.ts';
import type {RunnerApi,Script} from '../shared/types.ts';

test('one authorized AI call saves a new channel draft and delegates all local production stages',async()=>{
 const home=await mkdtemp(join(tmpdir(),'fc-automatic-service-'));const store=new LocalStore(home);await store.ready;
 await store.saveChannel({id:'tech',name:'Teste'});await store.saveChannel({id:'science',name:'Outro'});
 const original=await store.saveResource('scripts',{channelId:'tech',title:'Original',series:'Teste',format:'short',hook:'Pergunta',scenes:[{id:42,heading:'Cena',narration:'Uma explicação.',visualBrief:'Composição',durationHintSecs:20}],sources:[],claims:[],crossChecked:false}) as Script;
 let calls=0;let quoted:CreativeInput|undefined;let preparedId='';
 const creative:CreativeApi={capabilities:async()=>({provider:'anthropic',available:true,models:[],selectedModel:'fixture',reason:'',endpoint:'fixture',supports:['script']}),quote:async(owner,input,scope)=>{assert.equal(owner,'tech');assert.equal(scope,'synthetic-session');quoted=input;return {id:'quote-one',channelId:owner,model:'fixture',inputTokens:100,maxOutputTokens:100,estimatedMaxCostUsd:.01,costLimitUsd:.1,expiresAt:'2099-01-01',pricingCheckedAt:'2026-10-28'};},draft:async(owner,input,scope)=>{calls++;assert.equal(scope,'synthetic-session');assert.equal(input.brief,quoted!.brief);assert.deepEqual(input.editorContext,quoted!.editorContext);assert.equal(input.authorizePaid,true);return {channelId:owner,task:'script',title:'Proposta',body:'Texto explicativo para revisão humana.',model:'fixture',createdAt:'2026-10-28',status:'draft',crossChecked:false,reviewRequired:true,guides:[],fields:{title:'Versão explicativa',series:'Teste',format:'short',hook:'Pergunta',scenes:original.scenes,sources:[],claims:[]}};}};
 const runner:RunnerApi={list:async()=>[],assets:async()=>[],assetFile:async()=>undefined,file:async()=>undefined,upload:async()=>{throw Error('not used');},start:async()=>{throw Error('not used');},prepareVisuals:async()=>{throw Error('not used');},engineStatus:()=>({available:true,message:''}),startAutomated:async(owner,seed,prepare)=>{assert.equal(owner,'tech');assert.equal(seed,original.id);preparedId=await prepare();return {id:'auto-job',channelId:owner,scriptId:preparedId,status:'queued',createdAt:'2026-10-28',message:'Fila',videoAvailable:false,automated:true};}};
 const service=createAutomaticProduction({store,creative,runner});const input={brief:'Explique esta skill de forma prática',format:'short',scriptId:original.id};
 try{
  await assert.rejects(service.quote('science',input,'synthetic-session'),/referência/);assert.equal(calls,0);
  await service.quote('tech',input,'synthetic-session');assert.equal(calls,0);
  await assert.rejects(service.start('tech',input,'synthetic-session'),/autorize/);assert.equal(calls,0);
  const job=await service.start('tech',{...input,quoteId:'quote-one',authorizePaid:true},'synthetic-session');assert.equal(job.automated,true);assert.equal(calls,1);
  const state=await store.read();const saved=state.scripts.find(script=>script.id===preparedId)!;
  assert.notEqual(saved.id,original.id);assert.equal(saved.channelId,'tech');assert.equal(saved.crossChecked,false);assert.equal(saved.status,'draft');assert.equal(state.scripts.find(script=>script.id===original.id)!.title,'Original');
 }finally{await rm(home,{recursive:true,force:true});}
});
