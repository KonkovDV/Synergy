// Deterministic pedagogical model, not physiology or firmware.
export const VERSION=4;
export const MODES=['threshold','proportional','gesture'];
export const ACTIONS=['rest','close','open','pinch','switch'];
// Demo parameters, not a clinical dose and not a Motorica specification.
export const INVALID_PAUSE_S=3;
export const INVALID_ABORT_S=10;
export function rhythmCues(){
 // Eight alternating cues. Tolerance stays wider than two 50 ms frames.
 const holds=[.2,.5,1,2];const cues=[];let t=.8;
 for(let i=0;i<8;i++){
  const hold=holds[i%4];
  const tol=+(0.25-(0.25-0.16)*(i/7)).toFixed(3);
  const gap=1.15-0.45*(i/7);
  cues.push({channel:i%2?'b':'a',hold,at:+t.toFixed(3),tol});
  t+=hold+gap;
 }
 return cues;
}
export const LEVELS=[
 {id:'carry',title:'Доставить посылку',object:'Посылка',story:'Возьмите посылку, удержите её по пути к получателю и спокойно отпустите.',skill:'Захват → удержание → отпускание',grip:'power',min:.3,max:.8,breakAt:.97,hold:1.5,time:14},
 {id:'fragile',title:'Сохранить растение',object:'Растение',story:'Перенесите маленькое растение. Слишком сильное сжатие повредит горшок.',skill:'Точность условного усилия',grip:'power',min:.25,max:.5,breakAt:.7,hold:1.5,time:14},
 {id:'pinch',title:'Собрать деталь',object:'Деталь',story:'Выберите щипковый схват и доставьте деталь на рабочий стол.',skill:'Выбор щипкового схвата',grip:'pinch',min:.3,max:.75,breakAt:.95,hold:1.5,time:16},
 {id:'switch',title:'Сменить инструмент',object:'Инструмент',story:'Переключите схват коактивацией, вернитесь в покой и только затем захватите инструмент.',skill:'Переключение → покой → захват',grip:'pinch',requiresSwitch:true,min:.3,max:.75,breakAt:.95,hold:1.5,time:16},
 {id:'terminal',title:'Повторить без подсказки',object:'Маяк',story:'В течение трёх секунд удержите умеренную активацию хотя бы 1,2 секунды подряд. Оценка появится после завершения.',skill:'Без текущей обратной связи',grip:'power',min:.3,max:.6,breakAt:.95,hold:1.2,time:3,terminal:true},
 {id:'rhythm',title:'Ритм захвата',object:'Ритм',story:'Два сенсора: сжатие и разжатие. Повторите короткие нажатия и удержания. Это учебный тайминг, не официальное задание конкурса.',skill:'Начало, длительность и отпускание',grip:'power',min:.3,max:.8,breakAt:.97,hold:2,time:20,rhythm:true,minHits:6}
];
export function levelFor(id,mode){
 const base=LEVELS.find(x=>x.id===id);if(!base)throw Error('Unknown level');
 const level={...base,skill:mode==='threshold'&&id==='fragile'?'Пороговое удержание; дозирование силы доступно в пропорциональном режиме':base.skill};
 if(base.rhythm)level.cues=rhythmCues();
 return level;
}
export function createTrial(id,mode,auto=false,modelVersion=0,source='simulation',modelId='simulation-v3',layout='right'){
 if(!MODES.includes(mode))throw Error('Unknown mode');
 if(!['left','right'].includes(layout))throw Error('Unknown layout');
 return {level:levelFor(id,mode),mode,autodemo:!!auto,source,modelVersion,modelId,layout,time:0,force:0,grip:'power',phase:id==='terminal'?'attempt':id==='rhythm'?'rhythm':'grasp',held:0,totalInBand:0,switches:0,switchArmed:true,awaitRest:false,qualified:false,done:false,success:false,outcome:null,reason:null,invalidFrames:0,invalidMs:0,invalidRunMs:0,requestPause:false,onA:false,onB:false,hits:0,misses:0,voided:0,trajectory:[]};
}
export function abort(s,reason='cancelled'){
 if(s.done)return s;s.force=0;s.held=0;s.qualified=false;s.done=true;s.success=false;s.outcome='aborted';s.reason=reason;return s;
}
export function neutralize(s,reason='invalid'){
 if(s.done)return s;s.force=0;s.held=0;s.qualified=false;s.switchArmed=false;s.awaitRest=s.switches>0;s.invalidFrames++;s.onA=false;s.onB=false;
 if(s.level.terminal)return abort(s,'connection_lost');s.phase=s.level.rhythm?'rhythm':'grasp';return s;
}
export function validFrame(f){
 return !!f&&f.valid===true&&!f.stale&&f.rejection_reason!=='low_confidence'&&ACTIONS.includes(f.action)&&Array.isArray(f.activation)&&f.activation.length===2&&f.activation.every(x=>Number.isFinite(x)&&x>=0&&x<=1)&&Number.isFinite(f.effort)&&f.effort>=0&&f.effort<=1;
}
// Structural validity is not semantic agreement. Contradictory frames are not rest or release.
export function coherentFrame(f){
 if(!validFrame(f))return false;
 const [a,b]=f.activation;
 if(f.action==='rest')return a<.25&&b<.25;
 if(f.action==='switch')return a>.55&&b>.55;
 if(f.action==='close'||f.action==='pinch')return a>=.25&&a>b;
 if(f.action==='open')return b>=.25&&b>a;
 return false;
}
function chargeInvalid(s,dt){
 const spent=Math.min(dt,.3);
 s.invalidMs+=spent*1000;s.invalidRunMs+=spent*1000;
 if(s.level.rhythm){const cue=s.level.cues.find(c=>!c.settled&&s.time>=c.at-c.tol&&s.time<=c.at+c.hold+c.tol);if(cue){cue.settled='void';s.voided++;}}
 if(s.invalidMs+1e-9>=INVALID_ABORT_S*1000)return abort(s,'connection_lost');
 if(s.invalidRunMs+1e-9>=INVALID_PAUSE_S*1000)s.requestPause=true;
 return s;
}
function noteInvalid(s,dt){
 chargeInvalid(s,dt);
 if(s.done)return s;
 neutralize(s);
 return s;
}
// Label and activation disagree. Do not apply the label, and do not erase a carry already earned.
function noteContradiction(s,dt){
 s.force=0;s.held=0;s.onA=false;s.onB=false;s.invalidFrames++;
 return chargeInvalid(s,dt);
}
function complete(s,ok,reason){s.done=true;s.success=ok;s.outcome=ok?'success':'failure';s.reason=reason;}
function hysteresis(prev,x){return prev?x>=.2:x>=.3;}
function stepRhythm(s,f,dt){
 dt=Math.min(dt,s.level.time-s.time);s.time+=dt;
 s.onA=hysteresis(s.onA,f.activation[0]);s.onB=hysteresis(s.onB,f.activation[1]);
 const both=s.onA&&s.onB;
 for(const cue of s.level.cues){
  if(cue.settled)continue;
  const end=cue.at+cue.hold+cue.tol;
  if(s.time+1e-9<cue.at-cue.tol)continue;
  const want=cue.channel==='a'?s.onA:s.onB;
  const other=cue.channel==='a'?s.onB:s.onA;
  if(!cue.seen&&s.time<=end+1e-9){
   if(want&&!other){cue.seen=true;cue.onset=s.time;}
   else if(both){cue.settled='miss';s.misses++;}
  }
  if(cue.seen&&!cue.settled&&!want){
   const onsetOk=Math.abs(cue.onset-cue.at)<=cue.tol+1e-6;
   const releaseOk=Math.abs(s.time-(cue.at+cue.hold))<=cue.tol+1e-6;
   cue.settled=onsetOk&&releaseOk?'hit':'miss';
   if(cue.settled==='hit')s.hits++;else s.misses++;
  }
  if(!cue.settled&&s.time>end+1e-9){cue.settled='miss';s.misses++;}
 }
 s.force=both?0:s.onA?f.activation[0]:s.onB?f.activation[1]:0;
 if((s.onA||s.onB)&&!both)s.totalInBand+=dt;
 s.trajectory.push({t:+s.time.toFixed(4),force:+s.force.toFixed(4),grip:s.grip});
 if(s.time+1e-9>=s.level.time){const ok=s.hits>=s.level.minHits;complete(s,ok,ok?'completed':'target_not_held');}
 return s;
}
export function step(s,f,dt){
 if(s.done)return s;
 if(!Number.isFinite(dt)||dt<=0)throw Error('Invalid timestep');
 if(dt>.3||!validFrame(f))return noteInvalid(s,dt);
 if(!coherentFrame(f))return noteContradiction(s,dt);
 s.invalidRunMs=0;s.requestPause=false;
 if(s.level.rhythm)return stepRhythm(s,f,dt);
 dt=Math.min(dt,s.level.time-s.time);s.time+=dt;
 const [a,b]=f.activation;
 const co=s.mode==='gesture'?f.action==='switch':a>.55&&b>.55;
 const rest=f.action==='rest';
 if(rest){s.switchArmed=true;s.awaitRest=false;}
 if(co&&s.switchArmed){s.grip=s.grip==='power'?'pinch':'power';s.switches++;s.switchArmed=false;s.awaitRest=true;s.held=0;s.phase=s.level.terminal?'attempt':'grasp';}
 if(s.mode==='gesture'&&f.action==='pinch'&&!s.level.requiresSwitch&&!s.awaitRest)s.grip='pinch';
 const analog=Math.max(0,a-b);
 s.force=s.awaitRest||co?0:s.mode==='threshold'?(a>.3&&a>b?.4:0):s.mode==='proportional'?analog:(['close','pinch'].includes(f.action)?f.effort:0);
 const good=!s.awaitRest&&s.grip===s.level.grip&&s.force>=s.level.min&&s.force<=s.level.max&&(!s.level.requiresSwitch||s.switches>0);
 if(good)s.totalInBand+=dt;
 s.trajectory.push({t:+s.time.toFixed(4),force:+s.force.toFixed(4),grip:s.grip});
 if(s.level.terminal){
  s.held=good?s.held+dt:0;if(s.held+1e-9>=s.level.hold)s.qualified=true;
  if(s.time+1e-9>=s.level.time)complete(s,s.qualified,s.qualified?'completed':'target_not_held');return s;
 }
 if(s.force>s.level.breakAt){complete(s,false,'overload');return s;}
 if(s.phase==='grasp'&&good){s.phase='carry';s.held=0;}
 if(s.phase==='carry'){
  if(!good){s.phase='grasp';s.held=0;}else{s.held+=dt;if(s.held+1e-9>=s.level.hold)s.phase='release';}
 }else if(s.phase==='release'){
  if(s.grip!==s.level.grip||s.awaitRest){s.phase='grasp';s.held=0;}
  else if(s.force<.1&&['rest','open'].includes(f.action))complete(s,true,'completed');
 }
 if(!s.done&&s.time+1e-9>=s.level.time)complete(s,false,'timeout');return s;
}
export function result(s,id){
 if(!s.done)throw Error('Unfinished trial');
 const ratio=s.level.rhythm?s.hits/s.level.cues.length:s.totalInBand/Math.max(s.time,.001);
 return {event_id:id,type:'trial',level:s.level.id,mode:s.mode,feedback:s.level.terminal?'terminal':'concurrent',source:s.source,model_version:s.modelVersion,model_id:s.modelId,layout:s.layout,level_version:VERSION,protocol_version:VERSION,outcome:s.outcome,success:s.success,reason:s.reason,duration_ms:Math.round(s.time*1000),in_band_ratio:ratio,switch_count:s.switches,invalid_frames:s.invalidFrames,invalid_ms:Math.round(s.invalidMs),rhythm_hits:s.hits,rhythm_misses:s.misses,rhythm_voided:s.voided,autodemo:s.autodemo,clinical_transfer_measured:false};
}
export function metrics(events,id,mode,source,modelVersion,modelId){
 const scope=events.filter(e=>e.type==='trial'&&e.level===id&&e.mode===mode&&e.source===source&&e.model_version===modelVersion&&(modelId===undefined||e.model_id===modelId)&&e.level_version===VERSION&&!e.autodemo);
 const completed=scope.filter(e=>['success','failure'].includes(e.outcome));const times=completed.filter(e=>e.success).map(e=>e.duration_ms).sort((a,b)=>a-b);
 return {completed:completed.length,aborted:scope.filter(e=>e.outcome==='aborted').length,successRate:completed.length?completed.filter(e=>e.success).length/completed.length:null,medianMs:times.length?(times[Math.floor((times.length-1)/2)]+times[Math.floor(times.length/2)])/2:null};
}
export function oracle(s){
 if(s.level.rhythm){
  const cue=s.level.cues.find(c=>!c.settled&&s.time+1e-9>=c.at&&s.time+1e-9<c.at+c.hold);
  if(!cue)return {action:'rest',activation:[0,0],effort:0,valid:true};
  return cue.channel==='a'?{action:'close',activation:[.5,0],effort:.5,valid:true}:{action:'open',activation:[0,.5],effort:.5,valid:true};
 }
 if(s.awaitRest||s.phase==='release')return {action:'rest',activation:[0,0],effort:0,valid:true};
 if(s.grip!==s.level.grip)return s.mode==='gesture'&&!s.level.requiresSwitch?{action:'pinch',activation:[.5,.05],effort:.45,valid:true}:{action:'switch',activation:[.8,.8],effort:.8,valid:true};
 return {action:s.grip==='pinch'&&s.mode==='gesture'&&!s.level.requiresSwitch?'pinch':'close',activation:[.5,.05],effort:s.level.id==='fragile'?.4:.45,valid:true};
}
