let timer=null,seq=0,action='rest';const game=document.getElementById('game');
function api(){return game.contentWindow.SynergyMVP;}
document.getElementById('connect').onclick=()=>{clearInterval(timer);api().setSource('external');seq=0;timer=setInterval(()=>{const a=action==='switch'?.85:action==='close'?.5:0;api().feed({seq:++seq,model_version:1,model_id:'host-demo-1',age_ms:0,valid:true,action,activation:action==='switch'?[a,a]:[a,0],effort:a});},50);document.getElementById('note').textContent='Синтетический поток 20 Гц. Управляйте внешними кнопками. Это не ЭМГ человека.';};
document.getElementById('stop').onclick=()=>{clearInterval(timer);document.getElementById('note').textContent='Поток остановлен. Игра должна сбросить удержание при watchdog 300 мс.';};
for(const x of ['neutral','close','switch'])document.getElementById(x).onclick=()=>action=x==='neutral'?'rest':x;
window.addEventListener('pagehide',()=>{clearInterval(timer);api()?.unmount();});
