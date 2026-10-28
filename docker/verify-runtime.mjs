import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readdir,readFile,stat} from 'node:fs/promises';
import {join} from 'node:path';

// Piped to node inside the disposable smoke container; never part of its startup.
assert.ok(process.getuid()!==0,'runtime must not run as root');
for(const [binary,args]of [['framechester',['--version']],['ffmpeg',['-version']],['ffprobe',['-version']],['piper',['--help']]]){
 const result=spawnSync(binary,args,{stdio:'pipe',timeout:20_000});assert.equal(result.status,0,`${binary} is unavailable`);
}
assert.ok(!(await stat('/app/web/node_modules').catch(()=>null)),'development dependencies reached runtime');
const syntheticKey='synthetic-container-api-key-only-20261028';
async function inspect(directory){
 for(const entry of await readdir(directory,{withFileTypes:true})){
  const path=join(directory,entry.name);
  if(entry.isDirectory())await inspect(path);
  else {const bytes=await readFile(path);assert.ok(!bytes.includes(Buffer.from(syntheticKey)),'credential stored in plaintext');}
 }
}
await inspect('/data/studio/vault');
const rendered=spawnSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','color=c=black:s=160x90:r=1:d=1','-vf','drawtext=text=Framechester:fontcolor=white:fontsize=14','-c:v','libx264','-pix_fmt','yuv420p','-y','/tmp/container-smoke.mp4'],{stdio:'pipe',timeout:20_000});
assert.equal(rendered.status,0,'FFmpeg H.264/font smoke failed');
assert.ok((await stat('/tmp/container-smoke.mp4')).size>0);
console.log('Container non-root, tools, encrypted-vault and FFmpeg smoke passed.');
