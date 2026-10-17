import {LEVELS,MODES,ACTIONS,VERSION,createTrial,step,abort,neutralize,result,metrics,oracle,validFrame,coherentFrame} from './engine.mjs';
import {EventStore,uuid} from './storage.mjs';
const $=id=>document.getElementById(id);
const NAMES={rest:'Покой',close:'Закрыть',open:'Открыть',pinch:'Щипок',switch:'Коактивация'};
let backendToken=null,backendSession=null,backendAvailable=false,backendBusy=false,backendInit=false;
let action='rest',strength=.5,trial=null,running=false,paused=false,source='simulation',modelVersion=0,modelId='simulation-v3',layout='right',lastHoldMs=0,holdBegan=0;
let lastFrame=null,lastFrameAt=0,lastSeq=-1,seq=0,lastTick=performance.now(),epoch=0,cal=null,replay=null,disposed=false,requests=new AbortController(),lab=new AbortController(),recoverTimer=0,recoverDelay=250;
let store;try{store=new EventStore(localStorage);}catch{store=new EventStore({getItem(){throw Error('Unavailable')},setItem(){throw Error('Unavailable')},removeItem(){throw Error('Unavailable')}});}
const TAB=uuid(),TAB_KEY='synergy-v3-tab';let leader=true,leaving=false;
function readTab(){try{return JSON.parse(localStorage.getItem(TAB_KEY)||'null');}catch{return null;}}
function releaseLeader(){try{const current=readTab();if(current&&current.id===TAB)localStorage.removeItem(TAB_KEY);}catch{}}
function refreshLeader(){
 if(disposed||leaving)return;const current=readTab(),foreign=current&&current.id!==TAB&&Date.now()-current.at<10000,was=leader;
 if(foreign){leader=false;if(was&&active()){abort(trial,'cancelled');trial.recorded=true;running=false;paused=false;setStatus('Запись открыта в другой вкладке. Эта попытка не сохранена.');}}
 else{leader=true;try{localStorage.setItem(TAB_KEY,JSON.stringify({id:TAB,at:Date.now()}));}catch{}}
 if(was!==leader){controls();render();renderHistory();}
}
const timers=[];
function selectedLevel(){return $('level').value;}
function active(){return trial&&!trial.done;}
function protectedFeedback(){return active()&&trial.level.terminal;}
function setAction(x){if(!ACTIONS.includes(x))return;action=x;document.querySelectorAll('[data-action]').forEach(b=>{b.classList.toggle('selected',b.dataset.action===x);b.setAttribute('aria-pressed',String(b.dataset.action===x));});}
function setStrength(x){strength=Math.max(0,Math.min(1,x));$('strength').value=Math.round(strength*100);$('strengthLabel').textContent=`${Math.round(strength*100)}%`;}
function controls(){
 const busy=!!active()||!!cal;const streamReady=validFrame(lastFrame)&&lastFrame.model_version===modelVersion&&lastFrame.model_id===modelId&&performance.now()-lastFrameAt<300;const ready=source==='simulation'||(source==='synthetic_emg'&&backendAvailable||source==='external')&&streamReady;
 for(const id of ['mode','level','source'])$(id).disabled=busy;
 $('start').disabled=busy||!ready||!leader||store.events.length>=10000;
 $('auto').disabled=busy||!ready||!leader||source==='external'||store.events.length>=10000;
 $('erase').disabled=!leader||busy;
 $('calibrate').disabled=busy||source==='external'||source==='synthetic_emg'&&!backendAvailable;
 $('pause').disabled=!active();$('abort').disabled=!active();$('pause').textContent=paused?'Продолжить':'Пауза';
 const unavailable=source==='external'||!!cal;for(const b of document.querySelectorAll('[data-action]'))b.disabled=unavailable||trial?.autodemo&&active();
 $('strength').disabled=unavailable||trial?.autodemo&&active();
 for(const id of ['gentle','moderate','coactivate'])$(id).disabled=unavailable||trial?.autodemo&&active();
 for(const b of document.querySelectorAll('[data-strength]'))b.disabled=unavailable||trial?.autodemo&&active();
}
function feedback(){const hidden=!!protectedFeedback();$('feedback').hidden=hidden;$('decoder').hidden=hidden;$('grip').hidden=hidden;$('feedbackCover').hidden=!hidden;$('scene').querySelector('svg').setAttribute('aria-hidden',String(hidden));}
function cancelReplay(){if(replay){clearInterval(replay);replay=null;}}
function setStatus(text,kind=''){if($('status').textContent!==text)$('status').textContent=text;$('status').className='status'+(kind?' '+kind:'');}
function mission(){
 cancelReplay();trial=null;running=false;paused=false;epoch++;setAction('rest');$('after').hidden=true;
 const l=LEVELS.find(x=>x.id===selectedLevel());$('missionIndex').textContent=`МИССИЯ ${String(LEVELS.indexOf(l)+1).padStart(2,'0')} / ${String(LEVELS.length).padStart(2,'0')}`;$('title').textContent=l.title;$('story').textContent=l.story;$('skill').textContent=`Учебный навык: ${l.skill}. Перенос навыка на протез не измерен.`;$('objectName').textContent=l.object;
 $('parcel').toggleAttribute('hidden',l.id==='fragile'||['pinch','switch','rhythm'].includes(l.id));$('plant').toggleAttribute('hidden',l.id!=='fragile');$('component').toggleAttribute('hidden',!['pinch','switch'].includes(l.id));
 $('scene').classList.remove('damaged');$('band').textContent=l.rhythm?'Подсказки: короткое нажатие и удержания 0,5 / 1 / 2 с. Допуск 160–250 мс — параметр демо, шире двух кадров по 50 мс.':$('mode').value==='threshold'?'После пересечения порога усилие фиксировано: 40%. Для дозирования выберите пропорциональное управление.':`Целевой диапазон: ${Math.round(l.min*100)}–${Math.round(l.max*100)}%. ${l.terminal?'Удержание 1,2 с; результат после 3 с.':'После доставки вернитесь в покой.'}`;
 $('instruction').textContent=l.rhythm?'«Закрыть» — сжатие, «Открыть» — разжатие. Держите кнопку ровно столько, сколько просит подсказка, затем отпустите.':l.grip==='pinch'?'Щипок: коактивация 85% → покой → закрыть 50%. В режиме жестов для миссии 3 можно выбрать «Щипок».':'Закройте при 50%, удержите и отпустите. Для растения используйте 40%.';
 setStatus('Начните миссию. Кнопка «Автодемо» покажет последовательность.');feedback();render();renderHistory();controls();
}
function rhythmCue(s){const cue=s.level.cues.find(c=>!c.settled);if(!cue)return 'Подсказки закончились';return `Канал ${cue.channel==='a'?'сжатия':'разжатия'}: ${cue.hold<=.3?'короткое нажатие':`удержание ${cue.hold.toFixed(1)} с`}`;}
function rhythmLive(){return active()&&trial.level.rhythm&&!trial.autodemo&&source!=='external';}
function render(){
 if(protectedFeedback())return;
 const f=trial?.force||0;$('force').textContent=`${Math.round(f*100)}%`;$('forceBar').value=f;
 $('grip').textContent=trial?.grip==='pinch'?'Щипковый схват':'Обычный схват';
 const x=trial?(trial.phase==='release'||trial.success?1:trial.held/trial.level.hold):0;$('carriage').setAttribute('transform',`translate(${Math.max(0,Math.min(1,x))*422} 0)`);
 $('phase').textContent=trial?.done?(trial.success?'Миссия завершена':trial.outcome==='aborted'?'Завершено без оценки':'Можно повторить'):trial?.level.rhythm?rhythmCue(trial):trial?.awaitRest?'Вернитесь в покой':trial?.phase==='carry'?'Доставка: удерживайте':trial?.phase==='release'?'Доставлено: отпустите':'Готовы к захвату';
 $('remaining').textContent=active()?`${Math.max(0,trial.level.time-trial.time).toFixed(1)} с`:'';
 $('decoded').textContent=lastFrame?.valid===false?'Неуверенная команда — прогресс сброшен':NAMES[lastFrame?.action||action];$('model').textContent=`${source} / ${modelVersion} · ${modelId}`;
}
function renderHistory(){
 const m=metrics(store.events,selectedLevel(),$('mode').value,source,modelVersion,modelId);$('attempts').textContent=m.completed;$('success').textContent=m.successRate===null?'—':`${Math.round(m.successRate*100)}%`;$('median').textContent=m.medianMs===null?'—':`${(m.medianMs/1000).toFixed(1)} с`;
 const successes=store.events.filter(e=>e.success&&!e.autodemo&&e.mode===$('mode').value&&e.source===source&&e.model_version===modelVersion&&e.model_id===modelId&&e.level_version===VERSION);
 $('missions').textContent=`${new Set(successes.map(e=>e.level)).size} / ${LEVELS.length}`;
 $('scope').textContent=`${$('mode').selectedOptions[0].textContent} · ${source} · модель ${modelVersion} / ${modelId} · ручные попытки выбранной миссии. Прервано без оценки: ${m.aborted}. Автодемо исключено.`;
 $('storageStatus').textContent=!leader&&store.persisted?'Эта вкладка только смотрит: запись открыта в другой. Закройте её и обновите страницу. Результаты остаются локальными, не на сервере.':store.persisted?'Сохранено локально в этом браузере. Экспорт JSON — ваша резервная копия. Удаление результатов не удаляет кэш страницы.':store.message;
 $('storageStatus').className='storage-note'+(!store.persisted?' warning':'');
 const items=store.events.slice(-8).reverse().map(e=>{const li=document.createElement('li');li.textContent=`${e.autodemo?'[Автодемо] ':''}${LEVELS.find(l=>l.id===e.level).title} · ${e.outcome==='aborted'?'прервано без оценки':e.success?'готово':e.reason==='overload'?'слишком сильное сжатие':'попробуйте снова'} · ${(e.duration_ms/1000).toFixed(1)} с · ${e.source} / v${e.model_version}`;return li;});
 if(!items.length){const li=document.createElement('li');li.textContent='Начните первую миссию — результаты появятся здесь.';items.push(li);}$('history').replaceChildren(...items);
}
function start(auto=false){
 if(disposed||!leader||active()||cal||$('start').disabled)return;
 cancelReplay();epoch++;trial=createTrial(selectedLevel(),$('mode').value,auto,modelVersion,source,modelId,layout);trial.eventId=uuid();running=true;paused=false;lastTick=performance.now();setAction('rest');$('after').hidden=true;$('scene').classList.remove('damaged');setStatus(trial.level.terminal?'Умеренная активация. Текущая обратная связь скрыта.':trial.level.rhythm?'Ждите подсказку и повторите длительность нажатия.':'Закройте кисть умеренно. После доставки — покой.');feedback();controls();
}
function finish(){
 if(!trial?.done||trial.recorded)return;if(!leader){trial.recorded=true;running=false;paused=false;setStatus('Запись открыта в другой вкладке. Эта попытка не сохранена.');render();renderHistory();controls();return;}trial.recorded=true;running=false;paused=false;epoch++;feedback();setAction('rest');
 try{store.add({...result(trial,trial.eventId),created_at:new Date().toISOString()});}catch(e){store.persisted=false;store.message=e.message;}
 if(trial.success)setStatus('✓ Миссия выполнена. Спокойное удержание и контроль засчитаны.','success');else if(trial.outcome==='aborted')setStatus('Попытка завершена без оценки. Прогресс удержания сброшен.');else if(trial.reason==='overload'){setStatus('Слишком сильное сжатие. Попробуйте мягче — здесь важна точность.','failure');$('scene').classList.add('damaged');}else setStatus('Пока не получилось. Можно повторить без спешки.','failure');
 $('after').hidden=false;$('next').textContent=selectedLevel()==='terminal'?'Начать новый круг →':'Следующая миссия →';$('resultNote').textContent=trial.autodemo?'Это автодемо — не результат пользователя.':trial.success?'Результат сохранён с источником и версией.':'Неуспех и прерывание учитываются отдельно.';
 render();renderHistory();controls();
 if(trial.level.terminal&&trial.outcome!=='aborted'){
  const captured=trial,begin=performance.now();let i=0;replay=setInterval(()=>{if(active()||disposed)return cancelReplay();const elapsed=(performance.now()-begin)/1000;while(i+1<captured.trajectory.length&&captured.trajectory[i+1].t<=elapsed)i++;const p=captured.trajectory[i];if(p){$('force').textContent=`${Math.round(p.force*100)}%`;$('forceBar').value=p.force;}if(elapsed>=captured.time)cancelReplay();},30);
 }
}
function pause(reason='pause'){
 if(!active())return;epoch++;running=false;paused=true;trial.requestPause=false;setAction('rest');
 if(trial.level.terminal){abort(trial,reason==='pause'?'cancelled':'connection_lost');finish();return;}
 neutralize(trial);setStatus(reason==='invalid'?'Нет уверенного сигнала 3 с. Пауза: удержание сброшено, это не ошибка навыка.':reason==='pause'?'Пауза. Удержание сброшено. Для продолжения вернитесь в покой.':'Нет свежего валидного потока. Удержание сброшено; продолжите после восстановления.');controls();render();
}
function resume(){if(!paused||!active())return;if(source!=='simulation'&&(!validFrame(lastFrame)||performance.now()-lastFrameAt>300))return;epoch++;paused=false;running=true;lastTick=performance.now();setAction('rest');feedback();controls();}
function simFrame(){
 const a=strength;const map={rest:[0,0],close:[a,0],open:[0,a],pinch:[a,0],switch:[a,a]};return {action,activation:map[action],effort:action==='rest'?0:a,valid:true,seq:++seq,model_version:0,model_id:'simulation-v3'};
}
function stopRecover(){if(recoverTimer){clearTimeout(recoverTimer);recoverTimer=0;}recoverDelay=250;}
function scheduleRecover(){
 if(recoverTimer||disposed||source!=='synthetic_emg'||backendAvailable)return;
 const wait=recoverDelay;recoverDelay=Math.min(recoverDelay*2,2000);
 recoverTimer=setTimeout(()=>{recoverTimer=0;if(!disposed&&source==='synthetic_emg'&&!backendAvailable)setupBackend();},wait);
}
function failLab(){
 if(disposed||source!=='synthetic_emg')return;
 const down=!backendAvailable&&!backendSession;
 lastFrame=null;lastFrameAt=0;if(cal)cancelCal();if(active()&&!paused)pause('stale');
 if(down){controls();return;}
 backendAvailable=false;backendSession=null;backendToken=null;lab.abort();lab=new AbortController();
 $('connection').textContent='Лаборатория недоступна. Повтор через паузу.';
 if(String(modelId).startsWith('pending-'))$('sourceNote').textContent='LDA требует Python server.py и зависимостей. Автономная симуляция работает без сервера.';
 scheduleRecover();controls();
}
async function api(path,data){
 const c=new AbortController(),timer=setTimeout(()=>c.abort(),2000),stop=()=>c.abort(),generation=lab;
 requests.signal.addEventListener('abort',stop,{once:true});generation.signal.addEventListener('abort',stop,{once:true});
 if(requests.signal.aborted||generation.signal.aborted)c.abort();
 try{const r=await fetch('/api/'+path,{method:data?'POST':'GET',headers:{...(data?{'Content-Type':'application/json'}:{}),...(backendToken?{'X-Demo-Token':backendToken}:{})},...(data?{body:JSON.stringify(data)}:{}),signal:c.signal});const b=await r.json();if(!r.ok){const e=Error(b.error||String(r.status));e.status=r.status;throw e;}return b;}finally{clearTimeout(timer);requests.signal.removeEventListener('abort',stop);generation.signal.removeEventListener('abort',stop);}
}
async function setupBackend(){
 if(backendInit||location.protocol==='file:'||disposed||source!=='synthetic_emg')return;backendInit=true;const generation=lab;
 try{const token=(await api('bootstrap')).token;if(disposed||generation!==lab||source!=='synthetic_emg')return;backendToken=token;const session=(await api('session',{})).session;if(disposed||generation!==lab||source!=='synthetic_emg'){backendToken=null;return;}backendSession=session;backendAvailable=true;lastSeq=-1;recoverDelay=250;$('connection').textContent='LDA лаборатория подключена';}
 catch{if(generation===lab&&!disposed&&source==='synthetic_emg'){backendAvailable=false;backendSession=null;backendToken=null;$('connection').textContent='Лаборатория недоступна. Повтор через паузу.';if(String(modelId).startsWith('pending-'))$('sourceNote').textContent='LDA требует Python server.py и зависимостей. Автономная симуляция работает без сервера.';scheduleRecover();}}
 finally{backendInit=false;controls();}
}
async function pollBackend(){
 if(disposed||source!=='synthetic_emg'||backendBusy||!backendAvailable)return;backendBusy=true;const captured=epoch,sid=backendSession,generation=lab;
 try{
  let label=null;
  if(cal&&!cal.pending){const t=(performance.now()-cal.begin)/1000;const counts=cal.counts||(cal.counts={rest:0,close:0,open:0,pinch:0,switch:0});const enough=Math.min(...Object.values(counts))>=12;
   if((t>=30&&enough)||t>=45){const pendingCal=cal;const r=await api('calibration/finish',{session:sid});if(disposed||cal!==pendingCal||generation!==lab)return;if(captured===epoch){epoch++;lastFrame=null;lastFrameAt=0;modelVersion=r.model_version;if(typeof r.model_id==='string')modelId=r.model_id;}cal=null;$('calibrationDialog').close();setAction('rest');$('sourceNote').textContent=`Синтетическая калибровка завершена: модель v${modelVersion}. Пациентские данные не записывались.`;renderHistory();controls();return;}
   const step=Math.floor(t/3);setAction(['rest','close','open','pinch','switch'][step%5]);setStrength(.6);$('calPrompt').textContent=`${step+1} / 10 · ${NAMES[action]}`;$('calProgress').value=Math.min(t,30);$('calCount').textContent=t<30?`${Math.ceil(30-t)} с до завершения`:'Добрать окна классов';if(t%3>=1)label=action;
  }
  const f=await api('frame',{session:sid,action,strength,calibration_label:label});
  if(generation!==lab||disposed||source!=='synthetic_emg'||sid!==backendSession||captured!==epoch)return;
  if(label&&cal&&!cal.pending&&f.ready)cal.counts[label]=(cal.counts[label]||0)+1;
  if(f.ready&&f.seq>lastSeq){lastSeq=f.seq;modelVersion=f.model_version;modelId=f.model_id;lastFrame={...f,valid:f.valid===true,effort:f.effort};lastFrameAt=performance.now();$('connection').textContent='Синтетическая raw ЭМГ · request-clock';controls();}
 }catch(e){if(disposed)return;failLab();}finally{backendBusy=false;}
}
function autoIntent(){const f=oracle(trial);setAction(f.action);setStrength(f.action==='switch'?.85:f.action==='pinch'?.6:trial.level.id==='fragile'?.4:.5);}
function tick(){
 if(disposed)return;const now=performance.now(),dt=(now-lastTick)/1000;lastTick=now;
 if(running){
  if(trial.autodemo)autoIntent();const frame=source==='simulation'?simFrame():lastFrame;
  if(source==='simulation'){lastFrame=frame;lastFrameAt=now;}
  if(source!=='simulation'&&(!frame||now-lastFrameAt>300)){pause('stale');}
  else if(frame.model_version!==trial.modelVersion||frame.model_id!==trial.modelId){abort(trial,'connection_lost');finish();}
  else{
   // The blind mission starts at the first real grip. Onset residue is not a dropout.
   if(trial.level.terminal&&!trial.attempt&&(!coherentFrame(frame)||frame.action==='rest')){if(coherentFrame(frame))step(trial,frame,dt);else lastTick=now;}
   else{if(trial.level.terminal)trial.attempt=true;step(trial,frame,dt);}
   if(trial.requestPause&&!trial.done)pause('invalid');else if(trial.done)finish();else if(!protectedFeedback())setStatus(!validFrame(frame)?'Неуверенный сигнал: прогресс сброшен. Вернитесь в покой.':trial.level.rhythm?rhythmCue(trial):trial.awaitRest?'Переключение выполнено. Теперь обязательно вернитесь в покой.':trial.phase==='release'?'Доставлено! Нажмите «Покой» или «Открыть».':trial.phase==='carry'?'Удерживайте активацию. Предмет движется к точке доставки.':trial.grip!==trial.level.grip?'Выберите щипковый схват.':'Захватите предмет в целевом диапазоне.');
  }
 }
 if(!replay)render();controls();
}
async function calibrate(){
 if(active()||cal)return;
 if(source==='simulation'){$('calTitle').textContent='Учебное управление';$('calDescription').textContent='Это проверка кнопок и игрового контура, не калибровка мышц. Для первой миссии: закрыть 50% → удержать → покой.';$('calPrompt').textContent='Симуляция готова';$('calProgress').value=30;$('calCount').textContent='Управляйте кнопками или клавишами 0–4.';openDialog($('calibrationDialog'));return;}
 if(!backendAvailable)return;
 cal={begin:performance.now(),pending:true};const startingCal=cal;controls();$('calTitle').textContent='Калибровка на синтетике';$('calDescription').textContent='10 предъявлений × 3 с. Генератор автоматически играет команды. Это не сигнал человека.';$('calPrompt').textContent='Подготовка…';$('calProgress').value=0;openDialog($('calibrationDialog'));
 try{await api('calibration/reset',{session:backendSession});if(cal===startingCal&&!disposed){cal.begin=performance.now();cal.pending=false;cal.counts={rest:0,close:0,open:0,pinch:0,switch:0};}}catch(e){cancelCal();setStatus(e.message);}
}
async function cancelCal(){const had=!!cal;cal=null;if(disposed)return;setAction('rest');$('calibrationDialog').close();controls();if(had&&backendAvailable)try{await api('calibration/cancel',{session:backendSession});}catch{} }
function changeSource(value){
 if(disposed||!['simulation','synthetic_emg','external'].includes(value))return false;
 stopRecover();if(active()){abort(trial,'cancelled');finish();}if(cal)cancelCal();source=value;backendAvailable=false;backendSession=null;backendToken=null;lab.abort();lab=new AbortController();$('source').value=value;modelVersion=value==='simulation'?0:1;modelId=value==='simulation'?'simulation-v3':'pending-'+value;lastFrame=null;lastFrameAt=0;lastSeq=-1;epoch++;mission();
 $('controlNote').textContent=value==='external'?'Команды приходят только от host. Подключите window.SynergyMVP.feed(frame); до потока старт недоступен.':value==='synthetic_emg'?'Кнопки задают намерение → 4-channel raw synthetic EMG → фильтр → LDA → игра. Не аппаратный SDK.':'Кнопки задают учебное намерение. Это не сигнал мышц человека.';
 $('calibrate').textContent=value==='synthetic_emg'?'Калибровка синтетики · 30 с':'Проверить управление';
 $('connection').textContent=value==='simulation'?'Автономная симуляция':value==='external'?'Ожидаем внешний поток':'Подключаем лабораторию…';if(value==='synthetic_emg'){if(location.protocol==='file:')$('sourceNote').textContent='Для LDA откройте адрес Python-сервера. Через file:// доступна автономная игра.';else setupBackend();}controls();renderHistory();
}
function exportData(){const corrupt=typeof store.corruptRaw==='string';const body=corrupt?store.corruptRaw:JSON.stringify({app:'Synergy',version:'3.1.0',exported_at:new Date().toISOString(),clinical_transfer_measured:false,persisted:store.persisted,events:store.events},null,2);const url=URL.createObjectURL(new Blob([body],{type:corrupt?'text/plain':'application/json'}));const a=document.createElement('a');a.href=url;a.download=corrupt?'synergy-v3-corrupt-backup.txt':'synergy-v3-results.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);return corrupt?{corrupt:true,bytes:store.corruptRaw.length}:{app:'Synergy',version:'3.1.0',events:store.events};}
function feed(f){
 if(source!=='external')return false;
 if(disposed)return false;
 if(!f||typeof f.model_id!=='string'||! /^[a-zA-Z0-9_.:-]{1,128}$/.test(f.model_id)||!Number.isInteger(f.seq)||f.seq<=lastSeq||!Number.isInteger(f.model_version)||f.model_version<0||f.model_version>100000){lastFrame=null;lastFrameAt=0;if(active())pause('stale');controls();return false;}
 if(!Number.isFinite(f.age_ms)||f.age_ms<0||f.age_ms>300){lastFrame=null;lastFrameAt=0;if(active())pause('stale');controls();return false;}
 lastSeq=f.seq;lastFrame={...f,valid:f.valid===true};lastFrameAt=performance.now()-f.age_ms;modelVersion=f.model_version;modelId=f.model_id;$('connection').textContent='Внешний поток · без актуации';controls();renderHistory();return true;
}
$('level').replaceChildren(...LEVELS.map((l,i)=>{const o=document.createElement('option');o.value=l.id;o.textContent=`${i+1}. ${l.title}`;return o;}));
$('mode').onchange=mission;$('level').onchange=mission;$('source').onchange=()=>changeSource($('source').value);
$('start').onclick=()=>start();$('auto').onclick=()=>start(true);$('pause').onclick=()=>running?pause():resume();$('abort').onclick=()=>{if(active()){abort(trial);finish();}};
function applyLayout(side){
 layout=side==='left'?'left':'right';
 document.documentElement.dataset.layout=layout;
 if($('layout'))$('layout').value=layout;
 for(const root of document.querySelectorAll('.gestures, .mobile-gestures')){
  const by=Object.fromEntries([...root.querySelectorAll('[data-action]')].map(b=>[b.dataset.action,b]));
  for(const name of layout==='left'?['rest','open','close','pinch','switch']:['rest','close','open','pinch','switch'])if(by[name])root.appendChild(by[name]);
 }
 try{localStorage.setItem('synergy-prefs',JSON.stringify({layout}));}catch{}
}
for(const b of document.querySelectorAll('[data-action]')){
 b.onclick=()=>{if(rhythmLive())return;setAction(b.dataset.action);};
 b.addEventListener('pointerdown',e=>{if(!rhythmLive()||e.button>0)return;b.setPointerCapture?.(e.pointerId);holdBegan=performance.now();setAction(b.dataset.action);});
 const endHold=()=>{if(!holdBegan)return;lastHoldMs=performance.now()-holdBegan;holdBegan=0;setAction('rest');};
 b.addEventListener('pointerup',endHold);b.addEventListener('pointercancel',endHold);b.addEventListener('lostpointercapture',endHold);
}
for(const b of document.querySelectorAll('[data-strength]'))b.onclick=()=>setStrength(Number(b.dataset.strength));
$('strength').oninput=e=>setStrength(Number(e.target.value)/100);$('gentle').onclick=()=>setStrength(.4);$('moderate').onclick=()=>setStrength(.5);$('coactivate').onclick=()=>{setStrength(.85);setAction('switch');};
$('next').onclick=()=>{if(active())return;const n=(LEVELS.findIndex(x=>x.id===selectedLevel())+1)%LEVELS.length;$('level').value=LEVELS[n].id;mission();};
let dialogReturn=null;
function openDialog(dialog){if(dialog.open)return;const from=document.activeElement;dialogReturn=from instanceof HTMLElement&&!dialog.contains(from)?from:null;dialog.showModal();}
function rememberDialog(dialog){dialog.addEventListener('close',()=>{const back=dialogReturn;dialogReturn=null;if(back&&document.contains(back))back.focus();});}
rememberDialog($('helpDialog'));rememberDialog($('calibrationDialog'));
$('help').onclick=()=>openDialog($('helpDialog'));$('closeHelp').onclick=()=>$('helpDialog').close();$('calibrate').onclick=calibrate;$('cancelCal').onclick=cancelCal;$('calibrationDialog').addEventListener('cancel',e=>{e.preventDefault();cancelCal();});
$('export').onclick=exportData;$('erase').onclick=()=>{if(!leader){setStatus('Эта вкладка только смотрит. Закройте другую вкладку и обновите страницу.');return;}if(active()||cal){setStatus('Сначала завершите текущую попытку или калибровку.');return;}if(confirm('Удалить все результаты MVP 3 в этом браузере? Кэш страницы и серверная лаборатория не очищаются.'))try{store.clear();renderHistory();setStatus('Локальная история удалена. Кэш страницы остался.');}catch(e){store.persisted=false;store.message='Удаление не удалось: '+e.message;renderHistory();}};
function onKey(e){if(['INPUT','SELECT','BUTTON','TEXTAREA'].includes(e.target.tagName)||cal||source==='external'||trial?.autodemo&&active()||e.repeat)return;if(/^[0-4]$/.test(e.key)){e.preventDefault();if(rhythmLive())holdBegan=performance.now();setAction(ACTIONS[Number(e.key)]);}}
function onKeyUp(e){if(!rhythmLive()||!/^[0-4]$/.test(e.key))return;if(holdBegan){lastHoldMs=performance.now()-holdBegan;holdBegan=0;}setAction('rest');}
function onVisibility(){if(document.hidden){if(holdBegan){lastHoldMs=performance.now()-holdBegan;holdBegan=0;setAction('rest');}if(running)pause();if(cal)cancelCal();}}
function onPageHide(){leaving=true;releaseLeader();}
function onPageShow(e){leaving=false;lastTick=performance.now();if(e.persisted&&running)pause('stale');refreshLeader();}
function onStorage(e){if(e.key===TAB_KEY){refreshLeader();return;}if(e.key==='synergy-v3-records'&&!leader){store=new EventStore(localStorage);renderHistory();controls();}}
window.addEventListener('keydown',onKey);window.addEventListener('keyup',onKeyUp);window.addEventListener('blur',()=>{if(holdBegan){lastHoldMs=performance.now()-holdBegan;holdBegan=0;setAction('rest');}});document.addEventListener('visibilitychange',onVisibility);window.addEventListener('pagehide',onPageHide);window.addEventListener('pageshow',onPageShow);window.addEventListener('storage',onStorage);
try{const saved=JSON.parse(localStorage.getItem('synergy-prefs')||'{}');if(saved.layout==='left')layout='left';}catch{}
if($('layout')){$('layout').value=layout;$('layout').onchange=()=>applyLayout($('layout').value);}applyLayout(layout);
window.SynergyMVP={version:'3.1.0',feed,setSource:changeSource,start,pause,resume,abort(){if(active()){abort(trial);finish();}},getState(){return JSON.parse(JSON.stringify({source,modelVersion,modelId,layout,lastHoldMs,running,paused,leader,trial,events:store.events,persisted:store.persisted}));},exportData,unmount(){disposed=true;stopRecover();if(active()){abort(trial);finish();}releaseLeader();requests.abort();lab.abort();timers.forEach(clearInterval);cancelReplay();cal=null;try{$('calibrationDialog').close();}catch{}window.removeEventListener('keydown',onKey);window.removeEventListener('keyup',onKeyUp);document.removeEventListener('visibilitychange',onVisibility);window.removeEventListener('pagehide',onPageHide);window.removeEventListener('pageshow',onPageShow);window.removeEventListener('storage',onStorage);}};
refreshLeader();mission();setAction('rest');setStrength(.5);timers.push(setInterval(tick,50));timers.push(setInterval(()=>{if(!cal?.pending)pollBackend();},50));timers.push(setInterval(refreshLeader,2000));
if(location.protocol==='https:'||location.hostname==='localhost'||location.hostname==='127.0.0.1'){if('serviceWorker'in navigator)navigator.serviceWorker.register('sw.js').catch(()=>{});}
