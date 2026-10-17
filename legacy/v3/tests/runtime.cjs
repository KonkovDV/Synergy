const fs=require('fs'),path=require('path'),{pathToFileURL}=require('url');
function chromiumPath(){
 if(process.env.CHROMIUM_PATH&&fs.existsSync(process.env.CHROMIUM_PATH))return process.env.CHROMIUM_PATH;
 const local=process.env.LOCALAPPDATA;
 const found=['/usr/local/bin/chromium','C:/Program Files/Google/Chrome/Application/chrome.exe','C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',local&&path.join(local,'Google/Chrome/Application/chrome.exe')].filter(Boolean).find(p=>fs.existsSync(p));
 return found||'';
}
function evidenceDir(root){
 if(process.env.SYNERGY_ARTIFACTS==='1')return path.join(root,'artifacts');
 const dir=process.env.SYNERGY_EVIDENCE_DIR||path.join(root,'evidence',new Date().toISOString().slice(0,10));
 fs.mkdirSync(dir,{recursive:true});
 return dir;
}
function pageUrl(root){return pathToFileURL(path.join(root,'index.html')).href;}
module.exports={chromiumPath,evidenceDir,pageUrl};
