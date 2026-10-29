"""Seven-state synthetic EMG lab: 4-channel raw sEMG → band-pass → time-domain features → LDA.
Extends the team's v3 pipeline (signals.py: Preprocessor, features) from 5 classes to the
7 states of the СПППР in the organizers' task of 28.10.2026 (neutral + 6 wrist movements; the game calls neutral
'rest'). Synthetic data only — never a patient model.
Do not fit this classifier on the Skillfactory/Motorica cuff set: those sensors are optomyography, not EMG,
and a retest after the cuff is taken off and put back on was not published (docs/RESEARCH.md §16)."""
import numpy as np
from sklearn.discriminant_analysis import LinearDiscriminantAnalysis
from sklearn.pipeline import make_pipeline
from sklearn.preprocessing import StandardScaler
from signals import Preprocessor, features

GESTURES = ('rest', 'flexion', 'extension', 'pronation', 'supination', 'adduction', 'abduction')
# The wire names of the task's packet (`dist` keys): the game's 'rest' is the task's 'neutral'.
WIRE = ('neutral', 'flexion', 'extension', 'pronation', 'supination', 'adduction', 'abduction')
# Relative amplitude on 4 forearm sites [volar (flexors), dorsal (extensors), radial, ulnar] per state (synthetic).
# 6.0 — shaped by the anatomy, not measured: flexion — FCR, FCU, FDS on the volar side; extension — ECRL/ECRB, EDC, ECU
# dorsally; pronation — pronator teres (volar, radial); supination — supinator (deep, dorsal-radial); a deviation needs
# its flexor and extensor together (adduction: FCU + ECU on the ulnar side; abduction: FCR + ECRL on the radial side).
PROFILES = np.array([
    [.01, .01, .01, .01],   # rest (neutral)
    [1.0, .12, .45, .45],   # flexion
    [.12, 1.0, .45, .40],   # extension
    [.55, .10, .85, .20],   # pronation
    [.10, .60, .55, .15],   # supination
    [.45, .45, .10, 1.0],   # adduction (ulnar deviation)
    [.45, .45, 1.0, .10],   # abduction (radial deviation)
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


def recording_mark(mirror=False):
    """Label of a take where the person copies with the intact hand. Not a gesture class and not a score."""
    return 'зеркально' if mirror else ''


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
        # 5.30 — the СППР stream of the meetup of 21.10.2026: the decision and the probability of every class, by name
        # (the game aligns names to its own class order; src/input/bridge.js decodeProbabilities).
        return {'gesture': str(self.model.classes_[i]), 'confidence': float(p[i]),
                'probs': {str(c): round(float(q), 4) for c, q in zip(self.model.classes_, p)},
                'a': float(rms[0]), 'b': float(rms[1]), 'effort': float(np.max(rms))}

    def packet(self, window, timestamp_ms):
        """6.0 — the same decision as the packet of the task: {"timestamp_ms": MCU time, "dist": {7 wire names}}."""
        p = self.model.predict_proba([features(window)])[0]
        by = {str(c): float(q) for c, q in zip(self.model.classes_, p)}
        dist = {w: round(by.get(g, 0.0), 4) for g, w in zip(GESTURES, WIRE)}
        top = max(dist, key=dist.get)
        dist[top] = round(dist[top] + 1 - sum(dist.values()), 4)  # rounding never moves the sum off 1
        return {'timestamp_ms': int(timestamp_ms), 'dist': dist}
