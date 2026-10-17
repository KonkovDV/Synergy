import assert from 'node:assert/strict';
import {LEVELS,MODES,createTrial,step,abort,neutralize,result,oracle,metrics,validFrame} from '../src/engine.mjs';
import {EventStore,validateEvent,canonicalId,KEY} from '../src/storage.mjs';
let checks=0;function ok(v,msg){assert.ok(v,msg);checks++;}function eq(a,b,msg){assert.deepEqual(a,b,msg);checks++;}function throws(f){assert.throws(f);checks++;}
const id='01934b70-405a-4285-a220-5465d12b071a';const rest={action:'rest',activation:[0,0],effort:0,valid:true};const close={action:'close',activation:[.5,0],effort:.5,valid:true};const sw={action:'switch',activation:[.85,.85],effort:.85,valid:true};
function win(level,mode='proportional',auto=false){const s=createTrial(level,mode,auto);for(let i=0;i<400&&!s.done;i++)step(s,oracle(s),.05);ok(s.success,`${level}/${mode} should complete`);return s;}
for(const mode of MODES)for(const l of LEVELS){const s=win(l.id,mode);eq(validateEvent(result(s,id)).event_id,id);ok(s.time>=l.hold);}
for(const mode of MODES){
 for(const l of LEVELS){for(const change of [{valid:false},{stale:true},{rejection_reason:'low_confidence'},{activation:[NaN,0]},{activation:[1.1,0]},{effort:Infinity},{action:'unknown'}]){
  const s=createTrial(l.id,mode);s.phase='release';s.force=.5;s.qualified=true;s.held=2;step(s,{...rest,...change},.05);ok(!s.success&&!s.qualified&&s.force===0&&s.held===0,'Invalid frame must not complete');
 }}
 const s=createTrial('switch',mode);step(s,sw,.05);eq(s.switches,1);for(let i=0;i<40;i++)step(s,close,.05);eq(s.force,0);eq(s.held,0);ok(!s.success);step(s,rest,.05);step(s,close,.05);ok(s.force>0);step(s,sw,.05);eq(s.switches,2);for(let i=0;i<10;i++)step(s,sw,.05);eq(s.switches,2);
 const blind=createTrial('terminal',mode);for(let i=0;i<30;i++)step(blind,close,.05);ok(blind.qualified);step(blind,{...rest,valid:false},.05);eq(blind.outcome,'aborted');eq(blind.qualified,false);
 const early=createTrial('terminal',mode);for(let i=0;i<30;i++)step(early,close,.05);ok(!early.done);for(let i=0;i<30;i++)step(early,rest,.05);ok(early.success);eq(Math.round(early.time*1000),3000);
}
let s=createTrial('carry','proportional');step(s,close,.05);step(s,rest,.5);eq(s.force,0);eq(s.phase,'grasp');throws(()=>step(s,rest,0));throws(()=>step(s,rest,NaN));
s=createTrial('fragile','proportional');step(s,{...close,activation:[.9,0],effort:.9},.05);eq(s.reason,'overload');
s=createTrial('carry','proportional');for(let i=0;i<300&&!s.done;i++)step(s,rest,.05);eq(s.reason,'timeout');
s=createTrial('carry','gesture');step(s,{action:'close',activation:[.99,0],effort:.4,valid:true},.05);eq(s.force,.4);
s=createTrial('carry','threshold');step(s,{...close,activation:[.9,0]},.05);eq(s.force,.4);
let event={...result(win('carry'),id),created_at:'2026-10-14T00:00:00Z'};
throws(()=>validateEvent({...event,duration_ms:0}));throws(()=>validateEvent({...event,clinical_transfer_measured:true}));throws(()=>validateEvent({...event,model_version:999999}));throws(()=>validateEvent({...event,model_version:1.1}));throws(()=>validateEvent({...event,success:false}));throws(()=>validateEvent({...event,source:'prosthesis'}));throws(()=>validateEvent({...event,in_band_ratio:NaN}));throws(()=>validateEvent({...event,event_id:'attack'}));
eq(canonicalId(id.toUpperCase().replaceAll('-','')),id);
const memory={data:{},getItem(k){return this.data[k]??null},setItem(k,v){this.data[k]=v},removeItem(k){delete this.data[k]}};
const store=new EventStore(memory);ok(store.add(event));ok(store.persisted);ok(!store.add({...event,event_id:id.replaceAll('-','').toUpperCase()}));throws(()=>store.add({...event,duration_ms:2000}));eq(new EventStore(memory).events.length,1);
const quota=new EventStore({...memory,setItem(){throw Error('Quota')}});quota.add({...event,event_id:'01934b70-405a-4285-a220-5465d12b071b'});ok(!quota.persisted);eq(quota.events.length,2);
let wrote=false;const corrupt=new EventStore({getItem(){return 'broken'},setItem(){wrote=true},removeItem(){}});ok(corrupt.add(event)===false);ok(!corrupt.persisted);eq(wrote,false);eq(corrupt.corruptRaw,'broken');eq(corrupt.events.length,0);
const full=new EventStore({getItem(){return null},setItem(){},removeItem(){}});full.events=Array.from({length:10000},()=>event);throws(()=>full.add({...event,event_id:'01934b70-405a-4285-a220-5465d12b071c'}));eq(full.events.length,10000);
store.clear();eq(store.events.length,0);eq(JSON.parse(memory.data[KEY]),[]);
const events=[event,{...event,autodemo:true},{...event,model_version:2},{...event,source:'external'},{...event,outcome:'aborted',success:false,reason:'cancelled',duration_ms:0}];const m=metrics(events,'carry','proportional','simulation',0);eq(m.completed,1);eq(m.aborted,1);eq(m.successRate,1);
// Reproducible fuzz of finite/non-finite and interrupted input; no invalid frame creates success.
let seed=173;function random(){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/2**32;}
for(let i=0;i<2000;i++){const l=LEVELS[Math.floor(random()*5)],mode=MODES[Math.floor(random()*3)],s=createTrial(l.id,mode);for(let j=0;j<15&&!s.done;j++){const f={action:['rest','close','open','pinch','switch'][Math.floor(random()*5)],activation:[random(),random()],effort:random(),valid:random()>.2};step(s,f,.05);if(!validFrame(f))ok(!s.success&&s.force===0);ok(Number.isFinite(s.force)&&s.force>=0&&s.force<=1);ok(s.time<=l.time);}}


// Distinct fitted models cannot share a success denominator, even at equal version counter.
const isolated=metrics([event,{...event,model_id:'different-fit'}],'carry','proportional','simulation',0,'simulation-v3');eq(isolated.completed,1);
// B2: a fresh invalid stream must end. It is an interruption, not a failed skill.
s=createTrial('carry','proportional');
for(let i=0;i<60;i++)step(s,{...close,valid:false},.05);
ok(s.requestPause&&!s.done&&!s.success&&s.force===0,'three seconds of invalid input pauses');
for(let i=0;i<200;i++)step(s,{...close,valid:false},.05);
eq(s.outcome,'aborted');eq(s.reason,'connection_lost');ok(s.invalidMs>=10000);
// B3: contradictory frames are not rest, release or switch.
s=createTrial('carry','proportional');s.phase='release';s.force=.5;s.grip='power';
step(s,{action:'rest',activation:[.5,.5],effort:0,valid:true},.05);ok(!s.success&&s.force===0);
s=createTrial('switch','gesture');step(s,{action:'switch',activation:[.1,.1],effort:.1,valid:true},.05);eq(s.switches,0);
s=createTrial('carry','proportional');step(s,{action:'open',activation:[.8,0],effort:.8,valid:true},.05);eq(s.force,0);
// One contradictory frame at the release boundary must not wipe the carry.
s=createTrial('carry','proportional');for(let i=0;i<40&&s.phase!=='release';i++)step(s,close,.05);eq(s.phase,'release');
step(s,{action:'rest',activation:[.26,0],effort:0,valid:true},.05);ok(!s.success&&s.phase==='release'&&s.force===0);
step(s,rest,.05);ok(s.success,'coherent rest after a contradictory frame still releases');
// Protocol 3 archives stay readable and do not mix into protocol 4 metrics.
const v3={...event,level_version:3,protocol_version:3};delete v3.layout;delete v3.invalid_ms;delete v3.rhythm_hits;delete v3.rhythm_misses;delete v3.rhythm_voided;
ok(validateEvent(v3).level_version===3);
const mixed=new EventStore({data:{},getItem(){return JSON.stringify([v3,event]);},setItem(){},removeItem(){}});
eq(mixed.events.length,2);eq(metrics(mixed.events,'carry','proportional','simulation',0,'simulation-v3').completed,1);
console.log(JSON.stringify({suite:'engine-storage',assertions:checks,status:'PASS',fuzzTrials:2000},null,2));
