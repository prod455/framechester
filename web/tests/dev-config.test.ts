import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('the development proxy follows the same configured local port as the backend', async () => {
  const previous=process.env.FRAMECHESTER_WEB_PORT;
  process.env.FRAMECHESTER_WEB_PORT='48231';
  try {
    const config=await resolveConfig({root:fileURLToPath(new URL('..',import.meta.url)),configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url))},'serve');
    const proxy=config.server.proxy?.['/api'];
    assert.ok(proxy && typeof proxy==='object');
    assert.equal(proxy.target,'http://127.0.0.1:48231');
  } finally {if(previous===undefined)delete process.env.FRAMECHESTER_WEB_PORT;else process.env.FRAMECHESTER_WEB_PORT=previous;}
});

test('the default development proxy remains local on port 4317', async () => {
  const previous=process.env.FRAMECHESTER_WEB_PORT; delete process.env.FRAMECHESTER_WEB_PORT;
  try {
    const config=await resolveConfig({root:fileURLToPath(new URL('..',import.meta.url)),configFile:fileURLToPath(new URL('../vite.config.ts',import.meta.url))},'serve');
    const proxy=config.server.proxy?.['/api'];assert.ok(proxy && typeof proxy==='object');
    assert.equal(proxy.target,'http://127.0.0.1:4317');assert.equal(config.server.host,'127.0.0.1');
  } finally {if(previous===undefined)delete process.env.FRAMECHESTER_WEB_PORT;else process.env.FRAMECHESTER_WEB_PORT=previous;}
});

test('invalid development configuration exits before starting tools or touching the private profile', async () => {
  const home=await mkdtemp(join(tmpdir(),'fc-dev-preflight-'));
  const webRoot=fileURLToPath(new URL('..',import.meta.url));
  try {
    const result=await new Promise<{code:number|null;stdout:string;stderr:string}>((resolve,reject)=>{
      const child=spawn(process.execPath,[join(webRoot,'node_modules/tsx/dist/cli.mjs'),'scripts/dev.ts'],{cwd:webRoot,env:{...process.env,FRAMECHESTER_WEB_HOME:home,FRAMECHESTER_WEB_PORT:'synthetic-private-port'},windowsHide:true,shell:false,stdio:['ignore','pipe','pipe']});
      let stdout='';let stderr='';const timer=setTimeout(()=>{child.kill();reject(new Error('Development preflight did not exit.'));},5000);
      child.stdout.on('data',data=>{stdout+=String(data);});child.stderr.on('data',data=>{stderr+=String(data);});
      child.once('error',error=>{clearTimeout(timer);reject(error);});child.once('close',code=>{clearTimeout(timer);resolve({code,stdout,stderr});});
    });
    assert.equal(result.code,1);assert.equal(result.stdout,'');assert.match(result.stderr,/FRAMECHESTER_WEB_PORT.*1024.*65535/);
    assert.equal(result.stderr.includes('synthetic-private-port'),false);assert.equal(result.stderr.includes(home),false);
    assert.deepEqual(await readdir(home),[]);
  } finally {await rm(home,{recursive:true,force:true});}
});
