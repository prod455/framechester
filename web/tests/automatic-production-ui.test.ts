import test,{afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {Window} from 'happy-dom';
import type {Channel,Script,WebJob} from '../shared/types.ts';
const browser=new Window({url:'http://127.0.0.1:4318'});
for(const name of ['window','document','Node','Element','HTMLElement','HTMLFormElement','HTMLInputElement','HTMLSelectElement','HTMLTextAreaElement','HTMLDialogElement','Event','MouseEvent','MutationObserver'] as const)Object.assign(globalThis,{[name]:name==='window'?browser:name==='document'?browser.document:browser[name]});
const {openAutomaticProduction}=await import('../src/automatic-production-ui.ts');
const tick=()=>new Promise<void>(resolve=>setImmediate(resolve));afterEach(()=>document.body.replaceChildren());
const date='2026-10-28',channel:Channel={id:'tech',name:'Teste',niche:'Tecnologia',audience:'',description:'',language:'pt-BR',createdAt:date,updatedAt:date};
const script:Script={id:'script-one',channelId:'tech',topicId:'topic-one',title:'Explique esta skill',series:'Teste',format:'short',hook:'Pergunta',scenes:[],sources:[],claims:[],crossChecked:false,status:'draft',createdAt:date,updatedAt:date};
const quote={id:'quote-one',channelId:'tech',model:'fixture',estimatedMaxCostUsd:.01,costLimitUsd:.1,expiresAt:'2099-01-01',inputTokens:100,maxOutputTokens:100,pricingCheckedAt:date};
const job:WebJob={id:'job-one',channelId:'tech',scriptId:'script-one',status:'queued',createdAt:date,message:'Fila',videoAvailable:false,automated:true};
test('the operator authorizes one cost and the server receives one complete automatic production request',async()=>{
 const calls:Array<{path:string;body:unknown}>=[];let started=false;
 const dialog=openAutomaticProduction({channel,scripts:[script],research:[],selectedScriptId:script.id,currentChannelId:()=>channel.id,onStarted:async()=>{started=true;},onManual:()=>{},onSettings:()=>{},api:async<T>(path:string,_method='GET',body?:unknown)=>{calls.push({path,body});return (path.includes('capabilities')?{available:true,provider:'anthropic',selectedModel:'fixture'}:path.endsWith('/quote')?quote:job) as T;}});
 await tick();assert.equal(calls.length,1);assert.equal(dialog.querySelector('input[type=file]'),null);assert.equal(dialog.querySelector('input[type=checkbox]'),null);
 const submit=dialog.querySelector<HTMLButtonElement>('button[type=submit]')!;submit.click();await tick();await tick();assert.equal(calls.length,2);assert.equal(started,false);assert.match(submit.textContent!,/Autorizar e produzir/);
 submit.click();await tick();await tick();assert.equal(started,true);assert.equal(calls[2].path,'/api/channels/tech/automatic/jobs');
 assert.deepEqual(calls[2].body,{brief:script.title,format:'short',scriptId:script.id,quoteId:'quote-one',authorizePaid:true});
});
test('an estimate for another channel cannot authorize production',async()=>{
 let jobs=0;const dialog=openAutomaticProduction({channel,scripts:[script],research:[],currentChannelId:()=>channel.id,onStarted:async()=>{},onManual:()=>{},onSettings:()=>{},api:async<T>(path:string)=>{if(path.endsWith('/jobs'))jobs++;return (path.includes('capabilities')?{available:true,provider:'anthropic',selectedModel:'fixture'}:{...quote,channelId:'science'}) as T;}});
 await tick();dialog.querySelector<HTMLButtonElement>('button[type=submit]')!.click();await tick();await tick();assert.equal(jobs,0);assert.match(dialog.textContent!,/estimativa/i);
});
