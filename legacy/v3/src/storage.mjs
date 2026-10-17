export const KEY='synergy-v3-records';
export function uuid(){
 if(globalThis.crypto?.randomUUID)return crypto.randomUUID();
 const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;const h=Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
}
export function canonicalId(s){if(typeof s!=='string')throw Error('UUID string required');const h=s.replaceAll('-','').toLowerCase();if(!/^[a-f0-9]{32}$/.test(h))throw Error('UUID invalid');return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;}
export function validateEvent(e){
 if(!e||e.type!=='trial'||!['carry','fragile','pinch','switch','terminal','rhythm'].includes(e.level)||!['threshold','proportional','gesture'].includes(e.mode)||!['simulation','synthetic_emg','external'].includes(e.source)||![3,4].includes(e.level_version)||e.protocol_version!==e.level_version)throw Error('Event schema mismatch');
 if(e.level==='rhythm'&&e.level_version!==4)throw Error('Rhythm requires protocol 4');
 const event={...e,event_id:canonicalId(e.event_id)};
 if(typeof e.success!=='boolean'||typeof e.autodemo!=='boolean'||!['success','failure','aborted'].includes(e.outcome)||e.success!==(e.outcome==='success'))throw Error('Outcome invalid');
 if(e.feedback!==(e.level==='terminal'?'terminal':'concurrent')||e.clinical_transfer_measured!==false)throw Error('Provenance invalid');
 if(typeof e.model_id!=='string'||! /^[a-zA-Z0-9_.:-]{1,128}$/.test(e.model_id))throw Error('Model identity invalid');
 if(!Number.isInteger(e.model_version)||e.model_version<0||e.model_version>100000)throw Error('Model version invalid');
 for(const k of ['switch_count','invalid_frames'])if(!Number.isInteger(e[k])||e[k]<0||e[k]>100000)throw Error('Counter invalid');
 if(!Number.isFinite(e.duration_ms)||e.duration_ms<0||e.duration_ms>3600000||!Number.isFinite(e.in_band_ratio)||e.in_band_ratio<0||e.in_band_ratio>1.000001)throw Error('Metric invalid');
 const aborted=['cancelled','connection_lost'].includes(e.reason);if(aborted!==(e.outcome==='aborted'))throw Error('Abort invalid');
 if(e.outcome==='failure'&&!['timeout','overload','target_not_held'].includes(e.reason))throw Error('Failure invalid');
 if(e.level_version===4){
  if(!['left','right'].includes(e.layout))throw Error('Layout invalid');
  if(!Number.isInteger(e.invalid_ms)||e.invalid_ms<0||e.invalid_ms>3600000)throw Error('Invalid time invalid');
  for(const k of ['rhythm_hits','rhythm_misses','rhythm_voided'])if(!Number.isInteger(e[k])||e[k]<0||e[k]>1000)throw Error('Rhythm counter invalid');
  if(e.level==='rhythm'&&e.success&&e.rhythm_hits<6)throw Error('Implausible rhythm success');
 }
 if(e.success&&(e.reason!=='completed'||e.duration_ms<(e.level==='terminal'?2999:e.level==='rhythm'?1499:1499)||e.in_band_ratio<=0||(e.level==='switch'&&e.switch_count<1)))throw Error('Implausible success');
 return event;
}
export class EventStore{
 constructor(storage){this.storage=storage;this.events=[];this.persisted=false;this.message='';this.corruptRaw=null;this.read();}
 read(){let raw;try{raw=this.storage.getItem(KEY);}catch{this.persisted=false;this.readFailed=true;this.corruptRaw=null;this.message='Хранилище недоступно или повреждено. Экспортируйте текущие результаты; старые данные не перезаписываются.';return;}if(!raw){this.events=[];this.persisted=true;this.readFailed=false;this.corruptRaw=null;return;}try{const parsed=JSON.parse(raw);if(!Array.isArray(parsed)||parsed.length>10000)throw Error('Archive invalid');this.events=parsed.map(validateEvent);this.persisted=true;this.readFailed=false;this.corruptRaw=null;}catch{this.events=[];this.persisted=false;this.readFailed=true;this.corruptRaw=raw;this.message='Хранилище повреждено. Скачайте резервную копию: исходные байты не перезаписываются и не исполняются.';}}
 add(e){e=validateEvent(e);if(this.readFailed){this.persisted=false;return false;}const old=this.events.find(x=>x.event_id===e.event_id);if(old){if(JSON.stringify(old)!==JSON.stringify(e))throw Error('Conflicting UUID');return false;}if(this.events.length>=10000)throw Error('Лимит истории. Экспортируйте результаты и очистите данные.');this.events.push(e);this.save();return true;}
 save(){if(this.readFailed){this.persisted=false;return;}try{this.storage.setItem(KEY,JSON.stringify(this.events));this.persisted=true;this.message='';}catch{this.persisted=false;this.message='Не сохранено на устройстве. Результаты в памяти: экспортируйте JSON до закрытия.';}}
 clear(){this.storage.removeItem(KEY);this.events=[];this.corruptRaw=null;this.readFailed=false;this.save();}
}
