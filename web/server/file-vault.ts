import {constants} from 'node:fs';
import {chmod,lstat,mkdir,open,rename,unlink} from 'node:fs/promises';
import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';
import {dirname,join,parse,relative,resolve,sep} from 'node:path';
import {VaultError} from './vault.ts';
import type {SecretVault} from './vault.ts';

export interface FileVaultOptions {directory:string;keyFile:string}
const limit=128*1024;
const fields=['version','channelId','slot','nonce','tag','ciphertext'];
interface Envelope {version:1;channelId:string;slot:string;nonce:string;tag:string;ciphertext:string}
function unavailable():VaultError{return new VaultError('Cofre criptografado indisponível ou inválido. Preserve os dados e confira a chave externa e as permissões; nenhum segredo foi salvo em texto puro.');}
function missing(error:unknown):boolean{return !!error&&typeof error==='object'&&'code' in error&&error.code==='ENOENT';}
function scope(channelId:string,slot:string):void {
 const reserved=/^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
 if(typeof channelId!=='string'||typeof slot!=='string'||!/^[a-z0-9](?:[a-z0-9-]{0,62}[a-z0-9])?$/.test(channelId)||!/^[a-z][a-z0-9-]{0,63}$/.test(slot)||reserved.test(channelId)||reserved.test(slot))throw unavailable();
}
function aad(channelId:string,slot:string):Buffer{return Buffer.from(JSON.stringify(['framechester-file-vault',1,channelId,slot]),'utf8');}

/** Explicit opt-in vault for local containers. The independent master-key file must
 * be mounted read-only and kept out of images/backups shared without authorization.
 * Compose file-backed secrets can be 0644. Writable permission bits are accepted
 * only when a write-open probe fails with EROFS (a read-only mount/filesystem).
 * The probe never creates, truncates or writes the file; EACCES is not sufficient.
 * Host file ACLs and access to the Docker daemon remain the operator's boundary.
 * This implementation does not migrate or overwrite Windows DPAPI records.
 */
class FileVault implements SecretVault {
 private readonly directory:string;
 private readonly keyFile:string;
 private pending:Promise<unknown>=Promise.resolve();
 constructor(options:FileVaultOptions){this.directory=resolve(options.directory);this.keyFile=resolve(options.keyFile);}

 private async directories(path:string,create=false):Promise<boolean>{
  const absolute=resolve(path),root=parse(absolute).root;
  let current=root;
  for(const part of ['',...relative(root,absolute).split(sep).filter(Boolean)]){
   if(part)current=join(current,part);
   let info;
   try{info=await lstat(current);}
   catch(error){
    if(!missing(error))throw unavailable();
    if(!create)return false;
    try{await mkdir(current,{mode:0o700});}catch(error){if(!error||typeof error!=='object'||!('code'in error)||error.code!=='EEXIST')throw unavailable();}
    info=await lstat(current);
   }
   if(!info.isDirectory()||info.isSymbolicLink())throw unavailable();
  }
  return true;
 }
 private async inspect(path:string,maxBytes:number):Promise<Awaited<ReturnType<typeof lstat>>|undefined>{
  let info;
  try{info=await lstat(path);}catch(error){if(missing(error))return undefined;throw unavailable();}
  if(!info.isFile()||info.isSymbolicLink()||info.nlink!==1||info.size>maxBytes)throw unavailable();
  return info;
 }
 private async masterPermissions(path:string,mode:number):Promise<void>{
  if(process.platform==='win32'||(mode&0o022)===0)return;
  let probe;
  try{probe=await open(path,constants.O_WRONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));}
  catch(error){
   if(error&&typeof error==='object'&&'code'in error&&error.code==='EROFS')return;
   // EACCES may be an ACL denial on a writable filesystem. Do not mistake it
   // for an immutable Docker secret mount or weaken the host ACL boundary.
   throw unavailable();
  }
  await probe.close();throw unavailable();
 }
 private async read(path:string,maxBytes:number,master=false):Promise<Buffer|undefined>{
  if(!await this.directories(dirname(path)))return undefined;
  const expected=await this.inspect(path,maxBytes);if(!expected)return undefined;
  const file=await open(path,constants.O_RDONLY|(constants.O_NOFOLLOW??0)|(constants.O_NONBLOCK??0));
  try{
   const info=await file.stat();
   if(!info.isFile()||info.nlink!==1||info.dev!==expected.dev||info.ino!==expected.ino||info.size>maxBytes)throw unavailable();
   if(master)await this.masterPermissions(path,info.mode);
   const buffer=Buffer.alloc(maxBytes+1);let bytes=0;
   while(bytes<buffer.length){const part=await file.read(buffer,bytes,buffer.length-bytes,null);if(!part.bytesRead)break;bytes+=part.bytesRead;}
   if(bytes>maxBytes)throw unavailable();return buffer.subarray(0,bytes);
  }finally{await file.close();}
 }
 private async key():Promise<Buffer>{
  const input=await this.read(this.keyFile,127,true);
  if(!input)throw unavailable();
  try{const text=input.toString('ascii');if(!/^[a-fA-F0-9]{64}(?:\r?\n)?$/.test(text)||!Buffer.from(text,'ascii').equals(input))throw unavailable();return Buffer.from(text.trim(),'hex');}
  finally{input.fill(0);}
 }
 private filename(channelId:string,slot:string):string {return join(this.directory,'channels',channelId,`${slot}.aesgcm`);}
 private decrypt(input:Buffer,channelId:string,slot:string,key:Buffer):string{
  const value:unknown=JSON.parse(input.toString('utf8'));
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).length!==fields.length||Object.keys(value).some(name=>!fields.includes(name)))throw unavailable();
  const envelope=value as Envelope;
  if(envelope.version!==1||envelope.channelId!==channelId||envelope.slot!==slot||typeof envelope.nonce!=='string'||!/^[a-f0-9]{24}$/.test(envelope.nonce)||typeof envelope.tag!=='string'||!/^[a-f0-9]{32}$/.test(envelope.tag)||typeof envelope.ciphertext!=='string'||!envelope.ciphertext||!/^[A-Za-z0-9+/]+={0,2}$/.test(envelope.ciphertext))throw unavailable();
  const ciphertext=Buffer.from(envelope.ciphertext,'base64');
  if(ciphertext.length>limit/2||ciphertext.toString('base64')!==envelope.ciphertext)throw unavailable();
  const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.nonce,'hex'));
  cipher.setAAD(aad(channelId,slot));cipher.setAuthTag(Buffer.from(envelope.tag,'hex'));
  const plain=Buffer.concat([cipher.update(ciphertext),cipher.final()]);
  try{if(!plain.length)throw unavailable();return new TextDecoder('utf-8',{fatal:true}).decode(plain);}
  finally{plain.fill(0);}
 }
 private work<T>(action:()=>Promise<T>):Promise<T>{
  const operation=this.pending.then(async()=>{try{return await action();}catch{throw unavailable();}});
  this.pending=operation.catch(()=>undefined);return operation;
 }
 async get(channelId:string,slot:string):Promise<string|null>{
  scope(channelId,slot);
  return this.work(async()=>{
   const key=await this.key();
   try{const input=await this.read(this.filename(channelId,slot),limit);return input?this.decrypt(input,channelId,slot,key):null;}
   finally{key.fill(0);}
  });
 }
 async set(channelId:string,slot:string,value:string):Promise<void>{
  scope(channelId,slot);
  if(typeof value!=='string'||!value||Buffer.byteLength(value,'utf8')>limit/2)throw unavailable();
  return this.work(async()=>{
   const key=await this.key();
   try{
    const path=this.filename(channelId,slot),existing=await this.read(path,limit);
    // A lost/wrong key cannot overwrite an existing protected credential.
    if(existing)this.decrypt(existing,channelId,slot,key);
    const nonce=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,nonce);cipher.setAAD(aad(channelId,slot));
    const plaintext=Buffer.from(value,'utf8');let ciphertext:Buffer;
    try{ciphertext=Buffer.concat([cipher.update(plaintext),cipher.final()]);}finally{plaintext.fill(0);}
    const envelope:Envelope={version:1,channelId,slot,nonce:nonce.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('base64')};
    await this.directories(dirname(path),true);await this.inspect(path,limit);
    const temporary=`${path}.${randomBytes(12).toString('hex')}.tmp`;
    try{
     const file=await open(temporary,'wx',0o600);
     try{await file.writeFile(JSON.stringify(envelope),'utf8');await file.sync();}finally{await file.close();}
     await this.directories(dirname(path));await this.inspect(path,limit);
     await rename(temporary,path);await chmod(path,0o600);
    }finally{await unlink(temporary).catch(()=>undefined);}
   }finally{key.fill(0);}
  });
 }
 async delete(channelId:string,slot:string):Promise<void>{
  scope(channelId,slot);
  return this.work(async()=>{
   const key=await this.key();
   try{
    const path=this.filename(channelId,slot),existing=await this.read(path,limit);if(!existing)return;
    this.decrypt(existing,channelId,slot,key);await this.directories(dirname(path));await this.inspect(path,limit);await unlink(path);
   }finally{key.fill(0);}
  });
 }
}

export function createFileVault(options:FileVaultOptions):SecretVault{return new FileVault(options);}
