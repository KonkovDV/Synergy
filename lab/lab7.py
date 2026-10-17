"""Seven-gesture synthetic EMG lab: 4-channel raw sEMG → band-pass → time-domain features → LDA.
Extends the team's v3 pipeline (signals.py: Preprocessor, features) from 5 classes to the
7 gestures of the game (rest + 6 active, as Omni Hand recognizes up to six phantom gestures).
Synthetic data only — never a patient model."""
import numpy as np
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from signals import Preprocessor, features

GESTURES = ('rest', 'fist', 'open', 'pinch', 'point', 'key', 'thumb')
# Relative amplitude on 4 forearm sites [flexor, extensor, radial, ulnar] per gesture (synthetic).
PROFILES = np.array([
    [.01, .01, .01, .01],   # rest
    [1.0, .15, .55, .35],   # fist
    [.12, 1.0, .25, .45],   # open
    [.55, .30, 1.0, .15],   # pinch
    [.35, .75, .20, 1.0],   # point
    [.75, .20, .30, .95],   # key
    [.20, .55, .95, .70],   # thumb
])


class Emulator7:
    def __init__(self, seed=7, noise=.025):
        self.rng = np.random.default_rng(seed)
        self.noise = noise
        self.sample = 0
        self.prev = np.zeros(4)

    def read(self, gesture='rest', effort=.6, n=20, fs=1000):
        if gesture not in GESTURES or not 0 <= effort <= 1:
            raise ValueError('Unknown gesture or effort')
        t = (np.arange(n) + self.sample) / fs
        self.sample += n
        z = self.rng.normal(size=(n, 8))
        base = z[:, :4]
        carrier = .75 * base + .25 * np.vstack([self.prev, base[:-1]])
        self.prev = base[-1].copy()
        amp = PROFILES[GESTURES.index(gesture)] * (effort if gesture != 'rest' else 1.)
        return carrier * amp + z[:, 4:] * self.noise + .006 * np.sin(2 * np.pi * 50 * t[:, None])


def recording(gesture, seed, effort=.6, windows=30):
    emu, pre, rows = Emulator7(seed), Preprocessor(), []
    for i in range(windows * 5 + 20):
        w = pre.push(emu.read(gesture, effort))
        if i >= 20 and i % 5 == 0:
            rows.append(features(w))
    return np.array(rows)


class Classifier7:
    def __init__(self):
        self.model = make_pipeline(StandardScaler(), LinearDiscriminantAnalysis(solver='lsqr', shrinkage='auto'))
        self.rest_ref = np.ones(4) * .02
        self.max_ref = np.ones(4)

    def bootstrap(self, seed=100):
        X, y = [], []
        for c, g in enumerate(GESTURES):
            for rep in range(3):
                for effort in (.4, .6, .8):
                    rows = recording(g, seed + c * 31 + rep * 7 + int(effort * 10), effort=effort, windows=8)
                    X.extend(rows); y.extend([g] * len(rows))
        X = np.array(X); y = np.array(y)
        self.model.fit(X, y)
        self.rest_ref = np.median(X[y == 'rest', :4], axis=0)
        self.max_ref = np.maximum(np.percentile(X[:, :4], 95, axis=0), self.rest_ref + 1e-3)
        return self

    def predict(self, window):
        f = features(window)
        p = self.model.predict_proba([f])[0]
        i = int(np.argmax(p))
        rms = np.clip((f[:4] - self.rest_ref) / (self.max_ref - self.rest_ref), 0, 1)
        return {'gesture': str(self.model.classes_[i]), 'confidence': float(p[i]),
                'a': float(rms[0]), 'b': float(rms[1]), 'effort': float(np.max(rms))}
