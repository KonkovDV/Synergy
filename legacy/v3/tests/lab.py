import json, threading, unittest, urllib.request, urllib.error, sys, pathlib
from http.server import ThreadingHTTPServer
sys.path.insert(0,str(pathlib.Path(__file__).resolve().parents[1]))
import numpy as np
from core.signals import Emulator,Preprocessor,Classifier,features,CLASSES,recording
BASE='http://127.0.0.1:8765'
class Signals(unittest.TestCase):
    def test_seed(self):np.testing.assert_array_equal(Emulator(17).read(),Emulator(17).read())
    def test_feature_shape(self):self.assertEqual(features(Emulator().read(n=100)).shape,(20,))
    def test_no_invalid(self):
        for x in [np.ones((100,3)),np.full((100,4),np.nan),np.full((100,4),1e9)]:
            with self.assertRaises(ValueError):Preprocessor().push(x)
    def test_chunk_continuity(self):
        raw=Emulator().read(n=200);a=Preprocessor();b=Preprocessor();wa=a.push(raw);b.push(raw[:100]);wb=b.push(raw[100:]);np.testing.assert_allclose(wa,wb)
    def test_transaction(self):
        c=Classifier().bootstrap();old=c.model;version=c.version
        with self.assertRaises(ValueError):c.fit(np.zeros((20,20)),['rest']*20)
        self.assertIs(c.model,old);self.assertEqual(c.version,version)
    def test_model_identity(self):
        c=Classifier().bootstrap();other=Classifier().bootstrap();old=c.model_id
        self.assertEqual(old,other.model_id)
        X=[];y=[]
        for i,action in enumerate(CLASSES):
            rows=recording(action,500+i,windows=15);X.extend(rows);y.extend([action]*len(rows))
        c.fit(X,y);self.assertNotEqual(old,c.model_id);self.assertEqual(c.version,2)
    def test_low_confidence(self):
        c=Classifier().bootstrap()
        class Uncertain:
            classes_=np.array(CLASSES)
            def predict_proba(self,x):return np.array([[.2]*5])
        c.model=Uncertain();f=c.predict_features(np.ones(20)*.2);self.assertFalse(f['valid']);self.assertEqual(f['rejection_reason'],'low_confidence')
class Gateway(unittest.TestCase):
    @classmethod
    def setUpClass(cls):cls.token=cls.request('/api/bootstrap')[1]['token'];cls.sid=cls.request('/api/session',{},cls.token)[1]['session']
    @staticmethod
    def request(path,data=None,token=None,headers=None):
        h={'Content-Type':'application/json',**({'X-Demo-Token':token} if token else {}),**(headers or {})}
        raw=json.dumps(data).encode() if data is not None else None;r=urllib.request.Request(BASE+path,data=raw,headers=h)
        try:
            with urllib.request.urlopen(r,timeout=5) as response:
                b=response.read();return response.status,json.loads(b) if response.headers.get('Content-Type','').startswith('application/json') else b
        except urllib.error.HTTPError as e:return e.code,json.loads(e.read()) if e.headers.get('Content-Type','').startswith('application/json') else None
    def test_health(self):self.assertEqual(self.request('/api/health')[1]['version'],'3.1.0')
    def test_permissions_policy(self):
        r=urllib.request.Request(BASE+'/api/health')
        with urllib.request.urlopen(r,timeout=5) as response:
            self.assertEqual(response.headers.get('Permissions-Policy'),'camera=(), microphone=(), geolocation=(), usb=()')
    def test_capability(self):self.assertEqual(self.request('/api/frame',{'session':self.sid})[0],403)
    def test_host(self):self.assertEqual(self.request('/api/bootstrap',headers={'Host':'attacker.test'})[0],403)
    def test_origin(self):self.assertEqual(self.request('/api/bootstrap',headers={'Origin':'https://attacker.test'})[0],403)
    def test_static_allowlist(self):self.assertEqual(self.request('/core/signals.py')[0],404);self.assertEqual(self.request('/index.html')[0],200)
    def test_unknown_session(self):self.assertEqual(self.request('/api/frame',{'session':'bad'},self.token)[0],404)
    def test_strength(self):
        for v in [-1,2,True,float('nan')]:self.assertEqual(self.request('/api/frame',{'session':self.sid,'strength':v},self.token)[0],400)
    def test_calibration_guard(self):self.assertEqual(self.request('/api/frame',{'session':self.sid,'action':'close','strength':.6,'calibration_label':'close'},self.token)[0],400)
    def test_insufficient_fit(self):self.request('/api/calibration/reset',{'session':self.sid},self.token);self.assertEqual(self.request('/api/calibration/finish',{'session':self.sid},self.token)[0],400);self.request('/api/calibration/cancel',{'session':self.sid},self.token)
    def test_frame(self):
        for i in range(6):status,f=self.request('/api/frame',{'session':self.sid,'action':'close','strength':.5},self.token)
        self.assertEqual(status,200);self.assertTrue(f['ready']);self.assertIsInstance(f['valid'],bool);self.assertEqual(f['source'],'synthetic_emg');self.assertEqual(len(f['activation']),2)
class StaticLaunch(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        from launch import Handler
        cls.http=ThreadingHTTPServer(('127.0.0.1',0),Handler)
        cls.port=cls.http.server_address[1]
        cls.thread=threading.Thread(target=cls.http.serve_forever,daemon=True);cls.thread.start()
    @classmethod
    def tearDownClass(cls):cls.http.shutdown();cls.http.server_close()
    def headers(self,path,host=None):
        url=f'http://127.0.0.1:{self.port}{path}'
        extra={} if host is None else {'Host':host}
        r=urllib.request.Request(url,headers=extra)
        try:
            with urllib.request.urlopen(r,timeout=3) as response:return response.status,response.headers
        except urllib.error.HTTPError as e:return e.code,e.headers
    def test_error_keeps_demo_policy(self):
        code,headers=self.headers('/core/signals.py')
        self.assertEqual(code,404)
        self.assertEqual(headers.get('Permissions-Policy'),'camera=(), microphone=(), geolocation=(), usb=()')
        self.assertIn("default-src 'self'",headers.get('Content-Security-Policy',''))
        self.assertEqual(headers.get('X-Content-Type-Options'),'nosniff')
        ok,page=self.headers('/index.html')
        self.assertEqual(ok,200)
        self.assertEqual(page.get('Permissions-Policy'),headers.get('Permissions-Policy'))
if __name__=='__main__':unittest.main(verbosity=2)
