import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, request as httpRequest } from 'node:http';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createApp } from '../server/app.ts';
import type { ServerOptions } from '../server/app.ts';
import type { RunnerApi, SocialApi, SocialSnapshot } from '../shared/types.ts';
import { localPort } from '../server/index.ts';
import { SocialError } from '../server/social.ts';
import type {CreativeApi} from '../server/creative.ts';

async function fixture(options: ServerOptions = {}) {
  const home = await mkdtemp(join(tmpdir(),'fc-api-fixture-')); const app = await createApp({ ...options, home }); const server = createServer(app.handler);
  await new Promise<void>(resolve => server.listen(0,'127.0.0.1',resolve)); const address = server.address(); assert.ok(address && typeof address !== 'string'); const origin = `http://127.0.0.1:${address.port}`;
  const status = await fetch(origin+'/api/auth/status'); let cookie = status.headers.get('set-cookie')!.split(';')[0]; let csrf = (await status.json()).csrfToken;
  const setup = await fetch(origin+'/api/auth/setup',{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json','X-CSRF-Token':csrf},body:JSON.stringify({password:'synthetic password for server tests'})});
  assert.equal(setup.status,200); cookie=setup.headers.get('set-cookie')!.split(';')[0]; csrf=(await setup.json()).csrfToken;
  return { home,app,origin,call:(path:string,method='GET',body?:unknown,headers:Record<string,string>={}) => fetch(origin+path,{method,headers:{Origin:origin,Cookie:cookie,...(method!=='GET'?{'X-CSRF-Token':csrf}:{}),...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},...(body!==undefined?{body:JSON.stringify(body)}:{})}),close:async()=>{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(home,{recursive:true,force:true});} };
}

test('HTTP setup, CSRF, channels and channel-owned content persist without config credentials', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-http-'));
  const app = await createApp({ home });
  const server = createServer(app.handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address(); assert.ok(address && typeof address !== 'string');
  const origin = `http://127.0.0.1:${address.port}`;
  let cookie = ''; let csrf = '';
  const call = (path: string, method = 'GET', body?: unknown, headers: Record<string,string> = {}) => fetch(origin + path, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body !== undefined ? { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf } : {}), ...headers }, ...(body !== undefined ? { body: JSON.stringify(body) } : {}) });
  try {
    assert.equal((await call('/api/bootstrap')).status, 401);
    const status = await call('/api/auth/status');
    cookie = status.headers.get('set-cookie')!.split(';')[0];
    csrf = (await status.json()).csrfToken;
    assert.equal((await call('/api/auth/setup', 'POST', { password: 'a synthetic local password' }, { Origin: 'https://foreign.example' })).status, 403);
    assert.equal((await call('/api/auth/setup', 'POST', { password: 'a synthetic local password' }, { 'X-CSRF-Token': 'wrong' })).status, 403);
    const setup = await call('/api/auth/setup', 'POST', { password: 'a synthetic local password' });
    assert.equal(setup.status, 200);
    cookie = setup.headers.get('set-cookie')!.split(';')[0]; csrf = (await setup.json()).csrfToken;
    const bootstrap = await call('/api/bootstrap'); assert.equal(bootstrap.status, 200);
    assert.match(bootstrap.headers.get('content-security-policy')!, /frame-ancestors 'none'/);
    const initial = await bootstrap.json(); assert.equal(initial.config.dryRun, true); assert.deepEqual(initial.monetization, []);
    const created = await Promise.all(['tech','science'].map(id => call('/api/channels', 'POST', { id, name: id })));
    assert.ok(created.every(response => response.status === 201));
    const research = await call('/api/research', 'POST', { channelId: 'tech', title: 'Uma hipótese verificável' }); assert.equal(research.status, 201);
    const item = await research.json();
    assert.equal((await call(`/api/research/${item.id}`, 'PUT', { channelId: 'science', title: 'mistura' })).status, 409);
    assert.equal((await call(`/api/research/${item.id}?channel_id=science`, 'DELETE', undefined, { 'X-CSRF-Token': csrf })).status, 404);
    assert.equal((await call('/api/config', 'PUT', { accessToken: 'synthetic-not-a-token' })).status, 400);
    assert.equal((await call('/api/config', 'PUT', { dryRun: false })).status, 400);
    assert.equal((await call('/api/research', 'POST', { channelId: 'tech', title: 'large', notes: 'x'.repeat(1024 * 1024) })).status, 413);
    const state = await (await call('/api/bootstrap')).json();
    assert.equal(state.channels.length, 2); assert.equal(state.research[0].channelId, 'tech');
    const persisted = await readFile(join(home, 'state.json'), 'utf8');
    assert.equal(persisted.includes('synthetic-not-a-token'), false);
    assert.equal(persisted.includes('a synthetic local password'), false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); }
});

test('HTTP rejects foreign Host and static traversal while serving the local app', async () => {
  const home = await mkdtemp(join(tmpdir(), 'fc-static-'));
  const dist = join(home, 'dist'); await mkdir(dist); await writeFile(join(dist, 'index.html'), '<h1>Local studio</h1>'); await writeFile(join(home, 'private.txt'), 'synthetic private fixture');
  const app = await createApp({ home: join(home, 'state'), distDir: dist }); const server = createServer(app.handler);
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve)); const address = server.address(); assert.ok(address && typeof address !== 'string');
  const send = (path: string, host: string) => new Promise<{status:number;body:string}>(resolve => {
    const req = httpRequest({ host: '127.0.0.1', port: address.port, path, headers: { Host: host } }, response => { let body = ''; response.on('data', chunk => { body += chunk; }); response.on('end', () => resolve({ status: response.statusCode!, body })); }); req.end();
  });
  try {
    assert.equal((await send('/', `127.0.0.1:${address.port}`)).status, 200);
    assert.equal((await send('/api/auth/status', `foreign.example:${address.port}`)).status, 403);
    const response = await send('/%2e%2e/private.txt', `127.0.0.1:${address.port}`);
    assert.equal(response.status, 403); assert.equal(response.body.includes('synthetic private fixture'), false);
  } finally { await new Promise<void>(resolve => server.close(() => resolve())); await rm(home, { recursive: true, force: true }); }
});

test('YouTube OAuth can return through a cross-site document navigation without opening API access',async()=>{
  const dist=await mkdtemp(join(tmpdir(),'fc-oauth-return-'));await writeFile(join(dist,'index.html'),'<h1>Local Studio fixture</h1>');
  let accepted=0;
  const social:SocialApi={capabilities:()=>[],listConnections:async()=>[],connectToken:async()=>{throw Error('not used');},startYoutubeOAuth:async()=>{throw Error('not used');},sync:async()=>{throw Error('not used');},disconnect:async()=>{},callbackYoutubeOAuth:async({state,code})=>{
    if(state!=='fixture-state'||code!=='fixture-code'||accepted)throw new SocialError('invalid_state','Autorização OAuth ausente, expirada ou já utilizada. Inicie novamente.');
    accepted++;return {channelId:'tech',platform:'youtube',accountId:`UC${'a'.repeat(22)}`,displayName:'Fixture',status:'connected',connectedAt:'2026-10-28T00:00:00Z',expiresAt:null,scopes:[]};
  }};
  const context=await fixture({social,distDir:dist});const base=new URL(context.origin);
  const navigation={'Sec-Fetch-Site':'cross-site','Sec-Fetch-Mode':'navigate','Sec-Fetch-Dest':'document'};
  const send=(path:string,headers:Record<string,string>=navigation,method='GET')=>new Promise<{status:number;headers:import('node:http').IncomingHttpHeaders;body:string}>((resolve,reject)=>{
    const request=httpRequest({hostname:base.hostname,port:base.port,path,method,headers},response=>{let body='';response.on('data',chunk=>{body+=chunk;});response.on('end',()=>resolve({status:response.statusCode!,headers:response.headers,body}));});request.on('error',reject);request.end();
  });
  try{
    // A Strict session cookie may be absent on the return from Google.
    const callback=await send('/api/oauth/youtube/callback?state=fixture-state&code=fixture-code');
    assert.equal(callback.status,303);assert.equal(accepted,1);
    const studio=await send(String(callback.headers.location));
    assert.equal(studio.status,200,'The redirect chain still carries cross-site Fetch Metadata at the Studio entry');
    assert.match(studio.body,/Local Studio fixture/);assert.equal(studio.headers['referrer-policy'],'no-referrer');
    for(const path of ['/api/bootstrap','/api/auth/status','/api/channels/tech/jobs','/api/oauth/youtube/callback/other'])assert.equal((await send(path)).status,403);
    assert.equal((await send('/',{...navigation,'Sec-Fetch-Dest':'iframe'})).status,403);
    assert.equal((await send('/',{...navigation,'Sec-Fetch-Mode':'cors','Sec-Fetch-Dest':'empty'})).status,403);
    assert.equal((await send('/api/oauth/youtube/callback?state=fixture-state&code=fixture-code',{...navigation,Origin:context.origin},'POST')).status,403);
    assert.equal((await send('/api/oauth/youtube/callback?state=fixture-state&code=fixture-code',{...navigation,Host:'foreign.example'})).status,403);
    const replay=await send('/api/oauth/youtube/callback?state=fixture-state&code=fixture-code');assert.equal(replay.status,400);assert.equal(accepted,1);
    assert.equal((await send('/api/oauth/youtube/callback?state=unknown&code=fixture-code')).status,400);
    assert.equal((await send('/api/oauth/youtube/callback?code=fixture-code')).status,400);
    assert.equal(replay.body.includes('fixture-code'),false);
  }finally{await context.close();await rm(dist,{recursive:true,force:true});}
});

test('production files require the correct channel and support bounded byte ranges', async () => {
  let mediaPath = '';
  const runner: RunnerApi = {
    list: async owner => owner === 'tech' ? [{id:'job-1',channelId:owner,scriptId:'script-1',status:'completed',createdAt:'2026-10-27T12:00:00Z',message:'synthetic fixture',videoAvailable:true}] : [],
    assets:async()=>[],start:async()=>{throw new Error('not used');},upload:async()=>{throw new Error('not used');},
    prepareVisuals:async()=>{throw new Error('not used');},assetFile:async()=>undefined,
    file:async(owner,job,file)=>owner==='tech'&&job==='job-1'&&file==='video'?{path:mediaPath,contentType:'video/mp4'}:undefined,
    engineStatus:()=>({available:true,message:'synthetic test engine'}),
  };
  const context = await fixture({runner}); mediaPath=join(context.home,'fixture.mp4'); await writeFile(mediaPath,'12345678');
  try {
    for(const id of ['tech','science']) assert.equal((await context.call('/api/channels','POST',{id,name:id})).status,201);
    assert.equal((await fetch(context.origin+'/api/channels/tech/jobs/job-1/files/video')).status,401);
    const partial=await context.call('/api/channels/tech/jobs/job-1/files/video','GET',undefined,{Range:'bytes=2-4'});
    assert.equal(partial.status,206);assert.equal(partial.headers.get('content-range'),'bytes 2-4/8');assert.equal(await partial.text(),'345');
    assert.equal((await context.call('/api/channels/tech/jobs/job-1/files/video','GET',undefined,{Range:'bytes=99-100'})).status,416);
    assert.equal((await context.call('/api/channels/science/jobs/job-1/files/video')).status,404);
    assert.equal((await context.call('/api/channels/tech/jobs/job-1/files/private.json')).status,404);
    assert.equal((await context.call('/api/channels/tech','DELETE')).status,409);
  } finally {await context.close();}
});

test('automatic visual preparation and image previews preserve authentication, CSRF and script ownership',async()=>{
  let calls=0,previewPath='';
  const runner:RunnerApi={
    list:async()=>[],assets:async()=>[],upload:async()=>{throw new Error('not used');},start:async()=>{throw new Error('not used');},file:async()=>undefined,
    engineStatus:()=>({available:true,message:'Synthetic engine'}),
    prepareVisuals:async(owner,scriptId)=>{calls++;assert.equal(owner,'tech');return {scriptId,assets:[],bindings:{},pending:[]};},
    assetFile:async(owner,asset)=>owner==='tech'&&asset==='asset-one'?{path:previewPath,contentType:'image/png'}:undefined,
  };
  const context=await fixture({runner});previewPath=join(context.home,'preview.png');await writeFile(previewPath,'synthetic-image');
  try {
    await context.app.store.update(state=>{
      const date='2026-10-28T00:00:00Z';
      state.channels=['tech','science'].map(id=>({id,name:id,niche:'',audience:'',description:'',language:'pt-BR',createdAt:date,updatedAt:date}));
      state.scripts.push({id:'script-one',channelId:'tech',topicId:'topic-one',title:'Demo',series:'tecnologia',format:'long',hook:'Pergunta',crossChecked:false,status:'draft',createdAt:date,updatedAt:date,sources:[],claims:[],scenes:[{id:42,heading:'Conceito',narration:'Texto do roteiro.',visualBrief:'Diagrama',durationHintSecs:10}]});
    });
    assert.equal((await fetch(context.origin+'/api/channels/tech/assets/asset-one/preview')).status,401);
    assert.equal((await context.call('/api/channels/tech/visuals/prepare','POST',{scriptId:'script-one'},{'X-CSRF-Token':''})).status,403);
    assert.equal((await context.call('/api/channels/science/visuals/prepare','POST',{scriptId:'script-one'})).status,400);
    assert.equal(calls,0);
    assert.equal((await context.call('/api/channels/tech/visuals/prepare','POST',{scriptId:'script-one'})).status,200);assert.equal(calls,1);
    assert.equal((await context.call('/api/channels/tech/assets/asset-one/preview')).status,200);
    assert.equal((await context.call('/api/channels/science/assets/asset-one/preview')).status,404);
  }finally{await context.close();}
});

test('automatic production routes bind the quote and generated draft to the authenticated channel',async()=>{
 let generations=0,queued=0;const date='2026-10-28';
 const creative:CreativeApi={capabilities:async()=>({available:true,provider:'anthropic',models:[],selectedModel:'fixture',reason:'',endpoint:'fixture',supports:['script']}),quote:async(owner,input,scope)=>{assert.ok(scope);assert.equal(input.consentToSend,true);return {id:'quote-one',channelId:owner,model:'fixture',inputTokens:100,maxOutputTokens:100,estimatedMaxCostUsd:.01,costLimitUsd:.1,expiresAt:'2099-01-01',pricingCheckedAt:date};},draft:async(owner,input,scope)=>{generations++;assert.ok(scope);assert.equal(input.authorizePaid,true);return {channelId:owner,task:'script',title:'Fixture',body:'Uma explicação para revisão do operador.',model:'fixture',createdAt:date,status:'draft',crossChecked:false,reviewRequired:true,guides:[],fields:{title:'Roteiro automático',series:'Teste',format:'short',hook:'Pergunta',scenes:[{id:42,heading:'Explicação',narration:'Fala original de teste.',visualBrief:'Composição explicativa',durationHintSecs:20}],sources:[],claims:[]}};}};
 const runner:RunnerApi={list:async()=>[],assets:async()=>[],file:async()=>undefined,assetFile:async()=>undefined,upload:async()=>{throw Error('not used');},start:async()=>{throw Error('not used');},prepareVisuals:async()=>{throw Error('not used');},engineStatus:()=>({available:true,message:''}),startAutomated:async(owner,_seed,prepare)=>{queued++;const scriptId=await prepare();return {id:'job-auto',channelId:owner,scriptId,status:'queued',createdAt:date,message:'Fila',videoAvailable:false,automated:true,previewOnly:true};}};
 const context=await fixture({creative,runner});
 try{
  for(const id of ['tech','science'])await context.call('/api/channels','POST',{id,name:id});
  const research=await(await context.call('/api/research','POST',{channelId:'tech',title:'Uma pauta'})).json();
  const input={brief:'Explique o assunto da pauta',format:'short',researchId:research.id};
  assert.equal((await context.call('/api/channels/tech/automatic/quote','POST',input,{'X-CSRF-Token':''})).status,403);
  assert.equal((await context.call('/api/channels/science/automatic/quote','POST',input)).status,400);assert.equal(queued,0);assert.equal(generations,0);
  assert.equal((await context.call('/api/channels/tech/automatic/quote','POST',input)).status,200);assert.equal(generations,0);
  assert.equal((await context.call('/api/channels/tech/automatic/jobs','POST',input)).status,400);
  const response=await context.call('/api/channels/tech/automatic/jobs','POST',{...input,quoteId:'quote-one',authorizePaid:true});assert.equal(response.status,202);assert.equal(generations,1);assert.equal(queued,1);
  const state=await context.app.store.read();assert.equal(state.scripts.length,1);assert.equal(state.scripts[0].crossChecked,false);assert.equal(state.scripts[0].researchId,research.id);assert.equal(state.scripts[0].channelId,'tech');
 }finally{await context.close();}
});

test('social metadata omits secrets, sync keeps unknown revenue null and connected channels cannot be removed',async()=>{
  const snapshot:SocialSnapshot={id:'snapshot-1',channelId:'tech',platform:'tiktok',accountId:'synthetic-account',fetchedAt:'2026-10-27T12:00:00Z',periodStart:'2026-10-27',periodEnd:'2026-10-27',stats:{views:null,followers:12,watchMinutes:null},revenue:{estimatedCents:null,paidCents:null,currency:'BRL',availability:'unavailable',reason:'not provided by fixture'}};
  const social:SocialApi={capabilities:()=>[],listConnections:async owner=>[{channelId:owner,platform:'tiktok',accountId:'synthetic-account',displayName:'Synthetic',status:'connected',connectedAt:'2026-10-27T12:00:00Z',expiresAt:null,scopes:[],accessToken:'synthetic-hidden-token'}],connectToken:async()=>{throw new Error('not used');},startYoutubeOAuth:async()=>{throw new Error('not used');},callbackYoutubeOAuth:async()=>{throw new Error('not used');},sync:async()=>structuredClone(snapshot),disconnect:async()=>{}};
  const context=await fixture({social});
  try {
    await context.call('/api/channels','POST',{id:'tech',name:'Tech'});
    const bootstrap=await context.call('/api/bootstrap');assert.equal((await bootstrap.text()).includes('synthetic-hidden-token'),false);
    const synced=await context.call('/api/channels/tech/connections/tiktok/sync','POST',{});assert.equal(synced.status,200);assert.equal((await synced.json()).revenue.estimatedCents,null);
    assert.equal((await context.call('/api/channels/tech','DELETE')).status,409);
    await context.call('/api/receipts','POST',{channelId:'tech',platform:'tiktok',kind:'payment',amountCents:123,currency:'BRL',date:'2026-10-27',note:'synthetic manual record'});
    const state=await(await context.call('/api/bootstrap')).json();assert.equal(state.monetization[0].revenue.paidCents,null);assert.equal(state.receipts[0].amountCents,123);assert.equal(state.receipts[0].source,'manual');
    assert.equal((await readFile(join(context.home,'state.json'),'utf8')).includes('synthetic-hidden-token'),false);
  }finally{await context.close();}
});

test('Vite origin is accepted only with the explicit development option and ports are constrained',async()=>{
  for(const dev of [false,true]){const context=await fixture({dev});try{const response=await context.call('/api/auth/status','GET',undefined,{Origin:'http://127.0.0.1:5173'});assert.equal(response.status,dev?200:403);if(dev)assert.equal(response.headers.get('access-control-allow-origin'),'http://127.0.0.1:5173');}finally{await context.close();}}
  assert.equal(localPort('4317'),4317);for(const port of ['0','4317x','65536','-1'])assert.throws(()=>localPort(port));
});

test('official estimated adjustments retain their sign and only controlled service errors are returned',async()=>{
  let generic=false;
  const social:SocialApi={capabilities:()=>[],listConnections:async()=>[],connectToken:async()=>{throw new Error('not used');},startYoutubeOAuth:async()=>{throw new Error('not used');},callbackYoutubeOAuth:async()=>{throw new Error('not used');},disconnect:async()=>{},sync:async()=>({id:'adjustment-1',channelId:'tech',platform:'youtube',accountId:'synthetic-channel',fetchedAt:'2026-10-27T12:00:00Z',periodStart:'2026-10-01',periodEnd:'2026-10-27',stats:{views:100,followers:10,watchMinutes:20},revenue:{estimatedCents:-25,paidCents:null,currency:'BRL',availability:'available',reason:'synthetic signed adjustment'}}),discoverYoutube:async()=>{if(generic)throw new Error('synthetic-private-token must never be returned');throw new SocialError('not_connected','Conecte a conta YouTube deste canal antes de pesquisar.');}};
  const context=await fixture({social});
  try{
    await context.call('/api/channels','POST',{id:'tech',name:'Tech'});
    const sync=await context.call('/api/channels/tech/connections/youtube/sync','POST',{});assert.equal(sync.status,200);
    const state=await(await context.call('/api/bootstrap')).json();assert.equal(state.monetization[0].revenue.estimatedCents,-25);assert.equal(state.monetization[0].revenue.paidCents,null);
    const controlled=await context.call('/api/channels/tech/research/discover','POST',{query:'tecnologia'});assert.equal(controlled.status,400);assert.match((await controlled.json()).error,/Conecte a conta YouTube/);
    generic=true;const failure=await context.call('/api/channels/tech/research/discover','POST',{query:'tecnologia'});assert.equal(failure.status,500);assert.equal((await failure.text()).includes('synthetic-private-token'),false);
  }finally{await context.close();}
});

test('deleting an empty channel clears pending authorizations first and cleanup failure preserves the channel',async()=>{
  const cleaned:string[]=[];let rejectCleanup=false;let context:Awaited<ReturnType<typeof fixture>>;
  const social:SocialApi={capabilities:()=>[],listConnections:async()=>[],connectToken:async()=>{throw new Error('not used');},startYoutubeOAuth:async()=>{throw new Error('not used');},callbackYoutubeOAuth:async()=>{throw new Error('not used');},sync:async()=>{throw new Error('not used');},disconnect:async(owner,network)=>{assert.equal((await context.app.store.requireChannel(owner)).id,owner);if(rejectCleanup)throw new Error('synthetic cleanup failure');cleaned.push(network);}};
  context=await fixture({social});
  try{
    await context.call('/api/channels','POST',{id:'pending',name:'Pending authorization fixture'});
    assert.equal((await context.call('/api/channels/pending','DELETE')).status,200);
    assert.deepEqual(cleaned,['youtube','tiktok','instagram','facebook']);
    await assert.rejects(context.app.store.requireChannel('pending'));
    await context.call('/api/channels','POST',{id:'retained',name:'Retained fixture'});rejectCleanup=true;
    assert.equal((await context.call('/api/channels/retained','DELETE')).status,500);
    assert.equal((await context.app.store.requireChannel('retained')).id,'retained');
  }finally{await context.close();}
});
