import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {mkdtemp,rm,readFile,link} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {AIUsageStore} from '../server/ai-usage.ts';
import {PrivatePromptStore} from '../server/private-prompt.ts';
import {createCreativeService} from '../server/creative.ts';
import {createApp} from '../server/app.ts';
import {LocalStore} from '../server/store.ts';
import type {SecretVault} from '../server/vault.ts';
import type {AIUsageRecord} from '../shared/ai-usage-types.ts';

const editorial={task:'research',brief:'Investigue uma hipótese editorial com contribuição original e evidências.'};
const key='sk-ONLY-SYNTHETIC-USAGE-GUARD-123456789';
async function fixture(monitoring=true){
 const root=await mkdtemp(join(tmpdir(),'fc-usage-guard-')),home=join(root,'profile'),directory=join(home,'ai-usage');
 const store=new LocalStore(home);await store.ready;await store.saveChannel({id:'tech',name:'Canal sintético'});
 const settings=new PrivatePromptStore(root);await settings.save({content:'Preferência sintética exclusiva dos testes de integração.',model:'',provider:'openai'});
 const keys=new Map<string,string>();
 const vault:SecretVault={get:async(owner,slot)=>keys.get(`${owner}/${slot}`)??null,set:async(owner,slot,value)=>{keys.set(`${owner}/${slot}`,value);},delete:async(owner,slot)=>{keys.delete(`${owner}/${slot}`);}};
 let time=new Date('2026-10-28T12:00:00.000Z'),calls=0,paid=0;
 const usage=new AIUsageStore(directory,{now:()=>time});
 const creative=createCreativeService({settings,readState:()=>store.read(),vault,...(monitoring?{usage}:{}),now:()=>time,fetch:async(url,init)=>{
  calls++;
  const counting=String(url).endsWith('/input_tokens');
  // Public network effect is reached only after the pending record is on disk.
  const disk=JSON.parse(await readFile(join(directory,'usage.json'),'utf8')) as {records:AIUsageRecord[]};
  assert.equal(disk.records.filter(record=>record.status==='pending'&&record.operation===(counting?'estimate':'generation')).length,1);
  if(counting)return Response.json({object:'response.input_tokens',input_tokens:1000});
  paid++;const body=JSON.parse(String(init?.body));
  return Response.json({object:'response',status:'completed',model:body.model,service_tier:'default',output:[{type:'message',role:'assistant',status:'completed',content:[{type:'output_text',text:JSON.stringify({title:'Uma hipótese específica',body:'Uma proposta editorial sintética para apuração e revisão humana antes do uso.'})}]}],usage:{input_tokens:1000,output_tokens:100,input_tokens_details:{cached_tokens:0},output_tokens_details:{reasoning_tokens:10}}});
 }});
 await creative.saveKey!('tech',key,'openai');
 return {root,home,directory,store,settings,usage,creative,calls:()=>calls,paid:()=>paid,now:(value:Date)=>{time=value;},close:()=>rm(root,{recursive:true,force:true})};
}

test('no remote counting or generation starts without a durable usage store',async()=>{
 const f=await fixture(false);try{
  await assert.rejects(f.creative.quote!('tech',{...editorial,consentToSend:true}),/registro|consumo/i);
  await assert.rejects(f.creative.draft('tech',{...editorial,authorizePaid:true,quoteId:'unissued'}),/estimativa|autoriz/i);
  assert.equal(f.calls(),0);
 }finally{await f.close();}
});

test('both token counting and paid generation observe their pending event persisted before fetch',async()=>{
 const f=await fixture();try{
  const quote=await f.creative.quote!('tech',{...editorial,consentToSend:true},'a');
  const draft=await f.creative.draft('tech',{...editorial,quoteId:quote.id,authorizePaid:true},'a');
  assert.equal(draft.status,'draft');assert.equal(f.calls(),2);assert.equal(f.paid(),1);
  assert.equal((await f.usage.snapshot('tech')).events.every(record=>record.status==='succeeded'),true);
 }finally{await f.close();}
});

test('a storage failure after quoting consumes authorization but blocks every paid effect',async()=>{
 const f=await fixture();try{
  const quote=await f.creative.quote!('tech',{...editorial,consentToSend:true},'a');
  const alias=join(f.root,'history-alias.json');await link(join(f.directory,'usage.json'),alias);
  await assert.rejects(f.creative.draft('tech',{...editorial,quoteId:quote.id,authorizePaid:true},'a'),/armazenamento|consumo/i);assert.equal(f.paid(),0);assert.equal(f.calls(),1);
  await rm(alias);
  await assert.rejects(f.creative.draft('tech',{...editorial,quoteId:quote.id,authorizePaid:true},'a'),/estimativa|autoriz/i);assert.equal(f.paid(),0);
  assert.equal((await f.usage.snapshot('tech')).totals.generationRequests,0);
 }finally{await f.close();}
});

test('channel deletion preserves usage attribution even after its records leave the 90 day display window',async()=>{
 const f=await fixture();let server:ReturnType<typeof createServer>|undefined;try{
  f.now(new Date('2026-05-01T12:00:00.000Z'));
  const row=await f.usage.begin({channelId:'tech',provider:'openai',key,task:'research',model:'gpt-6.1-sol',operation:'generation',pricingCheckedAt:'2026-05-01'});
  await f.usage.finish(row.id,{status:'succeeded',inputTokens:1,outputTokens:1,estimatedCostUsd:.000012});
  f.now(new Date('2026-10-28T12:00:00.000Z'));
  assert.equal((await f.usage.snapshot('tech',{days:90})).events.length,0);
  const app=await createApp({home:f.home,store:f.store,privatePrompt:f.settings,creative:f.creative});
  const anonymous=await app.auth.status();const session=await app.auth.setup('synthetic-guard-http-password-only',anonymous.cookie,anonymous.status.csrfToken);
  server=createServer(app.handler);await new Promise<void>(resolve=>server!.listen(0,'127.0.0.1',resolve));
  const address=server.address();assert.ok(address&&typeof address!=='string');const origin=`http://127.0.0.1:${address.port}`;
  const response=await fetch(origin+'/api/channels/tech',{method:'DELETE',headers:{Origin:origin,Cookie:session.cookie,'X-CSRF-Token':session.status.csrfToken}});
  assert.equal(response.status,409);assert.match((await response.json()).error,/histórico de consumo/i);
  assert.equal((await f.store.requireChannel('tech')).id,'tech');assert.equal(await f.usage.hasHistory('tech'),true);assert.equal(f.calls(),0);
 }finally{if(server)await new Promise<void>(resolve=>server!.close(()=>resolve()));await f.close();}
});
