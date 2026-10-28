import assert from 'node:assert/strict';

// For a disposable CI profile only. There is no inference, publication or real credential.
const origin=new URL(process.env.FRAMECHESTER_SMOKE_ORIGIN||'http://127.0.0.1:4317');
assert.ok(origin.protocol==='http:'&&['127.0.0.1','localhost'].includes(origin.hostname)&&!origin.username&&!origin.password&&origin.pathname==='/');
const password='synthetic-container-smoke-password-only';
const secret='synthetic-container-api-key-only-20261028';
let cookie='',csrf='';
async function call(path,method='GET',body,expected=200){
 const response=await fetch(new URL(path,origin),{method,headers:{Origin:origin.origin,...(cookie?{Cookie:cookie}:{}),...(method!=='GET'?{'X-CSRF-Token':csrf}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(10_000),redirect:'error'});
 assert.equal(response.status,expected,`${method} ${path}: unexpected HTTP status`);
 const setCookie=response.headers.get('set-cookie');if(setCookie)cookie=setCookie.split(';')[0];
 return response.json();
}
async function run(){
 assert.equal((await call('/healthz')).status,'ok');
 const anonymous=await call('/api/auth/status');csrf=anonymous.csrfToken;
 const verify=process.argv.includes('--verify-persisted');
 if(verify)assert.equal(anonymous.configured,true,'profile was not preserved');
 else assert.equal(anonymous.configured,false,'smoke requires an empty disposable profile');
 const authenticated=await call(verify?'/api/auth/login':'/api/auth/setup','POST',{password});csrf=authenticated.csrfToken;
 if(!verify){
  await call('/api/channels','POST',{id:'ci-smoke',name:'Synthetic container smoke channel'},201);
  await call('/api/creative/settings','PUT',{content:'Synthetic container smoke preferences only.',model:'',provider:'openai',openaiModel:'gpt-6.1-sol'});
  await call('/api/channels/ci-smoke/creative/keys/openai','PUT',{key:secret});
 }
 const channels=await call('/api/channels');assert.ok(channels.some(channel=>channel.id==='ci-smoke'));
 assert.equal((await call('/api/channels/ci-smoke/creative/keys/openai')).configured,true);
 const settings=await call('/api/creative/settings');assert.equal(settings.prompt.content,'Synthetic container smoke preferences only.');
 const bootstrap=await call('/api/bootstrap');assert.equal(bootstrap.engine.available,true);assert.ok(!JSON.stringify(bootstrap).includes(secret));
 const monitoring=await call('/api/channels/ci-smoke/creative/usage?days=30');assert.equal(monitoring.totals.generationRequests,0);
 const protectedResponse=await fetch(new URL('/api/channels',origin),{signal:AbortSignal.timeout(5000)});assert.equal(protectedResponse.status,401);
 const invalidOrigin=await fetch(new URL('/api/channels',origin),{method:'POST',headers:{Origin:'https://example.invalid',Cookie:cookie,'X-CSRF-Token':csrf,'Content-Type':'application/json'},body:JSON.stringify({id:'blocked',name:'Blocked'})});assert.equal(invalidOrigin.status,403);
 console.log(verify?'Container persistence smoke passed.':'Container HTTP/auth/vault smoke passed.');
}
try{await run();}catch{console.error('Container smoke failed; inspect the failed contract without printing credentials or private response bodies.');process.exitCode=1;}
