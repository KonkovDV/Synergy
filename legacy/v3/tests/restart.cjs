const {chromium}=require('playwright');
const assert=require('assert/strict');
const {spawn}=require('child_process');
const path=require('path');
const {chromiumPath}=require('./runtime.cjs');
const root=path.resolve(__dirname,'..');
const port=8871;
const py=path.join(root,'.venv','Scripts','python.exe');
let checks=0;
function ok(v,m){assert.ok(v,m);checks++;}
function startLab(){
 const child=spawn(py,['server.py','--port',String(port)],{cwd:root,stdio:['ignore','pipe','pipe']});
 child.stdout.resume();child.stderr.resume();
 return child;
}
function stopLab(child){if(child&&child.pid)spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{stdio:'ignore'});}
async function waitHealth(){
 const deadline=Date.now()+8000;
 while(Date.now()<deadline){
  try{const r=await fetch('http://127.0.0.1:'+port+'/api/health');if(r.ok)return;}catch{}
  await new Promise(r=>setTimeout(r,150));
 }
 throw Error('lab did not start');
}
(async()=>{
 let child=startLab();
 await waitHealth();
 const browser=await chromium.launch({executablePath:chromiumPath()||chromium.executablePath(),headless:true,args:['--no-sandbox']});
 const page=await browser.newPage();
 const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 try{
  await page.goto('http://127.0.0.1:'+port);
  await page.selectOption('#source','synthetic_emg');
  await page.waitForFunction(()=>!document.getElementById('start').disabled,{},{timeout:10000});
  await page.selectOption('#level','carry');
  await page.click('#start');
  await page.click('.controls [data-action="close"]');
  await page.waitForFunction(()=>window.SynergyMVP.getState().trial.phase==='release',{},{timeout:15000});
  await page.click('.controls [data-action="rest"]');
  await page.waitForFunction(()=>window.SynergyMVP.getState().trial?.done&&window.SynergyMVP.getState().trial.success,{timeout:8000});
  const saved=await page.evaluate(()=>window.SynergyMVP.getState().events.map(e=>({id:e.event_id,model:e.model_id,success:e.success})));
  ok(saved.length===1&&saved[0].success&&saved[0].model.startsWith('lda-'));
  let once=true;
  await page.route('**/api/frame',async route=>{if(once){once=false;await route.fulfill({status:503,contentType:'text/plain',body:'<'});}else await route.continue();});
  await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('недоступна'),{},{timeout:8000});
  await page.waitForFunction(()=>!document.getElementById('start').disabled,{},{timeout:12000});
  await page.unroute('**/api/frame');
  let after=await page.evaluate(()=>window.SynergyMVP.getState());
  ok(after.events.length===1&&after.events[0].event_id===saved[0].id&&after.events[0].model_id===saved[0].model);
  ok((await page.locator('#storageStatus').textContent()).includes('локально'));
  let release,seen;
  const held=new Promise(r=>{release=r;});
  const hit=new Promise(r=>{seen=r;});
  let poisoned=false;
  await page.route('**/api/frame',async route=>{
   if(!poisoned){poisoned=true;seen();await held;try{await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ready:true,seq:99999,valid:true,action:'close',activation:[1,0],effort:1,model_version:9,model_id:'stale-injected',confidence:1})});}catch{}}
   else await route.continue();
  });
  await Promise.race([hit,new Promise((_,reject)=>setTimeout(()=>reject(Error('no frame request')),5000))]);
  await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('недоступна'),{},{timeout:8000});
  release();
  await page.waitForTimeout(400);
  ok(!(await page.evaluate(()=>window.SynergyMVP.getState().modelId)).includes('stale-injected'));
  ok((await page.evaluate(()=>window.SynergyMVP.getState().events[0].model_id))===saved[0].model);
  await page.unroute('**/api/frame');
  await page.waitForFunction(()=>!document.getElementById('start').disabled,{},{timeout:12000});
  await page.click('#start');
  await page.click('.controls [data-action="close"]');
  await page.waitForFunction(()=>window.SynergyMVP.getState().trial.phase==='carry',{},{timeout:15000});
  for(let pass=0;pass<2;pass++){
   stopLab(child);child=null;
   await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('недоступна'),{},{timeout:8000});
   let mid=await page.evaluate(()=>window.SynergyMVP.getState());
   ok(mid.paused&&mid.trial&&mid.trial.success===false&&mid.trial.phase==='grasp');
   ok(mid.events.length===1&&mid.events[0].event_id===saved[0].id&&mid.events[0].model_id===saved[0].model);
   ok((await page.locator('#storageStatus').textContent()).includes('локально'));
   child=startLab();await waitHealth();
   await page.waitForFunction(()=>document.getElementById('connection').textContent.includes('request-clock'),{},{timeout:12000});
   mid=await page.evaluate(()=>window.SynergyMVP.getState());
   ok(mid.trial.success===false&&mid.events.length===1&&mid.events[0].model_id===saved[0].model);
  }
  await page.click('#pause');
  await page.waitForTimeout(300);
  after=await page.evaluate(()=>window.SynergyMVP.getState());
  ok(after.trial&&after.trial.success===false&&after.trial.phase==='grasp'&&after.events.length===1&&after.events[0].model_id===saved[0].model);
  ok(errors.length===0,errors.join('\n'));
  console.log(JSON.stringify({suite:'lab-restart',status:'PASS',assertions:checks}));
 }finally{stopLab(child);await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
