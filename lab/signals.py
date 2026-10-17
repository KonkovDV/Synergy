"""Synthetic sEMG, causal filter, time-domain baseline. Never a patient model."""
from collections import deque
import hashlib
import numpy as np
from scipy.signal import butter, sosfilt
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler

CLASSES = ('rest', 'close', 'open', 'pinch', 'switch')
PROFILES = np.array([[.01,.01,.01,.01],[1,.12,.5,.2],[.12,1,.2,.5],[.55,.30,1,.2],[1,1,.4,.4]])

class Emulator:
    def __init__(self, seed=42, gain=1., shift=0., noise=.025):
        self.rng = np.random.default_rng(seed)
        self.gain, self.shift, self.noise = gain, shift, noise
        self.sample = 0
        self.previous_carrier = np.zeros(4)
    def read(self, action='rest', strength=.6, n=50, fs=1000):
        if action not in CLASSES or not np.isfinite(strength) or not 0 <= strength <= 1 or not isinstance(n,int) or not 1<=n<=10000 or not np.isfinite(fs) or fs<=0:
            raise ValueError('Invalid action or strength')
        t = (np.arange(n) + self.sample) / fs
        self.sample += n
        # Broad-band stochastic carrier, not a 50 Hz mains sine disguised as EMG.
        z = self.rng.normal(size=(n,8))
        base = z[:,:4]
        previous = np.vstack([self.previous_carrier,base[:-1]])
        carrier = .75*base + .25*previous
        self.previous_carrier = base[-1].copy()
        amp = PROFILES[CLASSES.index(action)] * (strength if action != 'rest' else 1.)
        amp = (1-self.shift)*amp + self.shift*np.roll(amp,1)
        return self.gain*carrier*amp + z[:,4:]*self.noise + .006*np.sin(2*np.pi*50*t[:,None])

class Preprocessor:
    def __init__(self, fs=1000, channels=4):
        if not np.isfinite(fs) or fs < 200: raise ValueError('Raw EMG sampling rate too low for this adapter')
        self.sos = butter(4,[20,min(450,.45*fs)],btype='bandpass',fs=fs,output='sos')
        self.zi = np.zeros((len(self.sos),2,channels))
        self.buffer = deque(maxlen=int(.1*fs))
        self.channels = channels
    def push(self, raw):
        raw = np.asarray(raw,float)
        if raw.ndim != 2 or raw.shape[1] != self.channels or len(raw)==0 or not np.isfinite(raw).all() or np.max(np.abs(raw))>1e6:
            raise ValueError('Expected finite samples × channels')
        filtered,self.zi = sosfilt(self.sos,raw,axis=0,zi=self.zi)
        self.buffer.extend(filtered)
        return np.asarray(self.buffer)

def features(x):
    x = np.asarray(x,float)
    if x.ndim != 2 or x.shape[1]!=4 or len(x)<20 or not np.isfinite(x).all() or np.max(np.abs(x))>1e6: raise ValueError('Invalid window')
    d = np.diff(x,axis=0)
    rms = np.sqrt(np.mean(x*x,axis=0))
    mav = np.mean(np.abs(x),axis=0)
    wl = np.mean(np.abs(d),axis=0)
    zc = np.mean((x[1:]*x[:-1]<0)&(np.abs(d)>.02),axis=0)
    ssc = np.mean((d[1:]*d[:-1]<0)&(np.abs(d[1:])>.02),axis=0)
    return np.concatenate([rms,mav,wl,zc,ssc])

def recording(action, seed, strength=.6, gain=1., shift=0., windows=20):
    emu=Emulator(seed,gain,shift); pre=Preprocessor(); rows=[]
    for i in range(windows+4):
        w=pre.push(emu.read(action,strength))
        if i>=4: rows.append(features(w))
    return np.array(rows)

class Classifier:
    def __init__(self):
        self.model = make_pipeline(StandardScaler(),LinearDiscriminantAnalysis(solver='lsqr',shrinkage='auto'))
        self.version = 0
        self.references = np.ones(2)*.3
        self.effort_refs = {}
    def fit(self, X, y):
        x=np.asarray(X,float); labels=np.asarray(y)
        if x.ndim!=2 or x.shape[1]!=20 or len(x)!=len(labels) or not np.isfinite(x).all():
            raise ValueError('Finite X[n,20] and aligned labels required')
        if set(labels)!=set(CLASSES) or min(np.sum(labels==c) for c in CLASSES)<12:
            raise ValueError('All five classes, >=12 windows per class required')
        # Transactional refit: invalid data never corrupts the live model.
        candidate=make_pipeline(StandardScaler(),LinearDiscriminantAnalysis(solver='lsqr',shrinkage='auto'))
        candidate.fit(x,labels)
        refs=np.maximum([np.median(x[labels=='close',0])/.6,np.median(x[labels=='open',1])/.6],.05)
        effort_refs={c:np.maximum(np.median(x[labels==c,:4],axis=0)/.6,.05) for c in CLASSES}
        if not np.isfinite(candidate.predict_proba(x[:1])).all():raise ValueError('Invalid model fit')
        self.model,self.references,self.effort_refs=candidate,refs,effort_refs
        self.version+=1
        scaler=candidate.steps[0][1];lda=candidate.steps[1][1]
        arrays=[scaler.mean_,scaler.scale_,lda.coef_,lda.intercept_,refs]+[effort_refs[c] for c in CLASSES]
        self.model_id="lda-"+hashlib.sha256(b"".join(np.asarray(a,dtype="<f8").tobytes() for a in arrays)).hexdigest()[:24]
        return self
    def bootstrap(self):
        X=[]; y=[]
        for c,action in enumerate(CLASSES):
            for rep in range(4):
                rows=recording(action,100+c*20+rep,windows=15)
                X.extend(rows); y.extend([action]*len(rows))
        return self.fit(X,y)
    def predict_features(self, f):
        f=np.asarray(f,float)
        if f.shape!=(20,) or not np.isfinite(f).all():raise ValueError('Invalid feature vector')
        p=self.model.predict_proba([f])[0];i=int(np.argmax(p));confidence=float(p[i])
        raw_action=str(self.model.classes_[i]);reason=None
        if confidence<.65: reason='low_confidence'
        elif float(np.max(f[:4]))<.04: reason='low_activity'
        action='rest' if reason else raw_action
        activation=np.clip((f[:2]-.015)/self.references,0,1)
        effort=0. if action=='rest' else float(np.clip(np.median(f[:4]/self.effort_refs[action]),0,1))
        valid = reason is None or (reason == 'low_activity' and raw_action == 'rest')
        return {'valid':valid,'action':action,'raw_action':raw_action,'confidence':confidence,'rejection_reason':reason,'effort':effort,'activation':activation.tolist(),'model_version':self.version,'model_id':self.model_id}
    def predict(self, window):
        return self.predict_features(features(window))
