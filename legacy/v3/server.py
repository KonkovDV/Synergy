"""Loopback-only synthetic EMG laboratory. No hardware commands or patient data."""
import argparse, json, time, secrets, threading, mimetypes, webbrowser
from pathlib import Path
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler
from urllib.parse import urlparse
import numpy as np
from core.signals import Emulator, Preprocessor, Classifier, CLASSES, features
ROOT = Path(__file__).resolve().parent
STATIC = {'/': 'index.html', '/index.html':'index.html', '/host-example.html':'host-example.html', '/assets/host-example.js':'assets/host-example.js', '/assets/style.css':'assets/style.css','/assets/app.bundle.js':'assets/app.bundle.js','/assets/app.bundle.js.map':'assets/app.bundle.js.map','/assets/icon.svg':'assets/icon.svg','/manifest.webmanifest':'manifest.webmanifest','/sw.js':'sw.js'}
class Session:
    def __init__(self):
        self.emulator=Emulator(seed=secrets.randbelow(100000)); self.pre=Preprocessor(); self.classifier=Classifier().bootstrap()
        self.calibration=[]; self.calibration_active=False; self.seq=0; self.last=time.monotonic()
class Handler(BaseHTTPRequestHandler):
    sessions={}; lock=threading.RLock(); capability=secrets.token_urlsafe(32)
    def log_message(self,*args): pass
    def setup(self): super().setup(); self.connection.settimeout(5)
    def end_headers(self):
        for k,v in [('X-Content-Type-Options','nosniff'),('Referrer-Policy','no-referrer'),('Permissions-Policy','camera=(), microphone=(), geolocation=(), usb=()'),('Cache-Control','no-store'),('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' blob:; object-src 'none'; base-uri 'none'; frame-ancestors 'self'")]: self.send_header(k,v)
        super().end_headers()
    def send(self,body,ctype,code=200):
        self.send_response(code); self.send_header('Content-Type',ctype);self.send_header('Content-Length',str(len(body))); self.end_headers()
        try: self.wfile.write(body)
        except (BrokenPipeError,ConnectionResetError): pass
    def reply(self,data,code=200):self.send(json.dumps(data,ensure_ascii=False,allow_nan=False).encode(),'application/json; charset=utf-8',code)
    def boundary(self,token=False):
        host=self.headers.get('Host','').lower();port=self.server.server_address[1]
        if host not in {f'localhost:{port}',f'127.0.0.1:{port}'}: return False
        origin=self.headers.get('Origin')
        if origin and origin!=f'http://{host}': return False
        if self.headers.get('Sec-Fetch-Site')=='cross-site': return False
        return not token or secrets.compare_digest(self.headers.get('X-Demo-Token',''),self.capability)
    def do_GET(self):
        if not self.boundary(): return self.reply({'error':'Request boundary rejected'},403)
        path=urlparse(self.path).path
        if path=='/api/health':return self.reply({'status':'ok','version':'3.1.0','demo':True,'sensor':'synthetic_emg','actuator_connected':False})
        if path=='/api/bootstrap':return self.reply({'token':self.capability,'version':'3.1.0'})
        if path in STATIC:
            file=ROOT/STATIC[path];ctype=mimetypes.guess_type(str(file))[0] or 'application/octet-stream'
            if file.suffix=='.js':ctype='text/javascript'
            if not file.is_file():return self.reply({'error':'Missing asset'},404)
            return self.send(file.read_bytes(),ctype+'; charset=utf-8')
        return self.reply({'error':'Not found'},404)
    def do_POST(self):
        try:
            if not self.boundary(True):return self.reply({'error':'Request boundary rejected'},403)
            if self.headers.get('Transfer-Encoding'):raise ValueError('Unsupported transfer encoding')
            if self.headers.get('Content-Type','').split(';')[0].strip()!='application/json':return self.reply({'error':'application/json required'},415)
            length=int(self.headers.get('Content-Length','0'))
            if not 0<length<=65536:return self.reply({'error':'Body size invalid'},413)
            def invalid(value):raise ValueError('Non-finite JSON literal')
            body=json.loads(self.rfile.read(length),parse_constant=invalid)
            if not isinstance(body,dict):raise ValueError('Object required')
            path=urlparse(self.path).path
            with self.lock:
                if path=='/api/session':
                    if body:raise ValueError('Empty payload required')
                    now=time.monotonic()
                    for sid in list(self.sessions):
                        if now-self.sessions[sid].last>3600:del self.sessions[sid]
                    if len(self.sessions)>=16:return self.reply({'error':'Session limit'},429)
                    sid=secrets.token_urlsafe(24);self.sessions[sid]=Session();return self.reply({'session':sid,'source':'synthetic_emg'})
                if path=='/api/erase':
                    if body:raise ValueError('Empty payload required')
                    self.sessions.clear();return self.reply({'erased':True,'scope':'in_memory_synthetic_lab_sessions_only'})
                sid=body.get('session');s=self.sessions.get(sid)
                if s is None:return self.reply({'error':'Unknown session'},404)
                s.last=time.monotonic()
                if path=='/api/frame':
                    if not set(body)<=set(('session','action','strength','calibration_label')):raise ValueError('Unknown frame property')
                    action=body.get('action','rest');strength=body.get('strength',.5)
                    if action not in CLASSES or isinstance(strength,bool) or not isinstance(strength,(int,float)) or not np.isfinite(strength) or not 0<=strength<=1:raise ValueError('Invalid control')
                    label=body.get('calibration_label')
                    if label is not None and (not s.calibration_active or label!=action or abs(strength-.6)>1e-9):raise ValueError('Synthetic prompt mismatch')
                    begin=time.perf_counter();window=s.pre.push(s.emulator.read(action,strength));s.seq+=1
                    base={'seq':s.seq,'source':'synthetic_emg','signal_clock':'request_driven','sample_end':s.emulator.sample,'signal_time_s':s.emulator.sample/1000}
                    if len(window)<100:return self.reply({**base,'ready':False})
                    prediction=s.classifier.predict(window)
                    if label is not None:
                        if len(s.calibration)>=4000:raise ValueError('Calibration buffer full')
                        s.calibration.append((features(window),label))
                    return self.reply({**base,**prediction,'ready':True,'window_ms':100,'hop_ms':50,'processing_ms':(time.perf_counter()-begin)*1000})
                if set(body)!={'session'}:raise ValueError('Session-only payload required')
                if path=='/api/calibration/reset':
                    s.calibration=[];s.pre=Preprocessor();s.calibration_active=True;return self.reply({'reset':True})
                if path=='/api/calibration/cancel':
                    s.calibration=[];s.calibration_active=False;return self.reply({'cancelled':True})
                if path=='/api/calibration/finish':
                    counts={c:sum(y==c for _,y in s.calibration) for c in CLASSES}
                    if not s.calibration_active or min(counts.values())<12:raise ValueError('Active calibration and >=12 windows/class required')
                    X,y=zip(*s.calibration);s.classifier.fit(X,y);s.calibration=[];s.calibration_active=False
                    return self.reply({'samples':counts,'model_version':s.classifier.version,'model_id':s.classifier.model_id,'synthetic':True})
                return self.reply({'error':'Not found'},404)
        except (ValueError,TypeError,KeyError) as e:self.reply({'error':str(e)},400)
        except (TimeoutError,ConnectionResetError):self.close_connection=True
        except Exception as e:print('Internal:',type(e).__name__,flush=True);self.reply({'error':'Internal error'},500)
if __name__=='__main__':
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--open',action='store_true');a=p.parse_args()
    if not 1024<=a.port<=65535:p.error('Port must be 1024..65535')
    http=ThreadingHTTPServer(('127.0.0.1',a.port),Handler);url=f'http://127.0.0.1:{a.port}'
    print(f'Synergy 3 synthetic EMG lab: {url}',flush=True)
    if a.open:webbrowser.open(url)
    try:http.serve_forever()
    except KeyboardInterrupt:pass
    finally:http.server_close()
