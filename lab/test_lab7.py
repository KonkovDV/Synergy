"""Lab sanity: the 7-gesture LDA separates synthetic gestures on unseen seeds (run: python -m unittest lab/test_lab7.py)."""
import sys, unittest
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import numpy as np
from lab7 import GESTURES, Classifier7, recording

class Lab7(unittest.TestCase):
    @classmethod
    def setUpClass(cls): cls.clf = Classifier7().bootstrap()
    def test_heldout_accuracy(self):
        correct = total = 0
        confusion = {g: {} for g in GESTURES}
        for i, g in enumerate(GESTURES):
            for w in recording(g, 9000 + i, effort=.55, windows=10):
                p = self.clf.model.predict([w])[0]
                confusion[g][p] = confusion[g].get(p, 0) + 1
                correct += p == g; total += 1
        acc = correct / total
        print(f'held-out accuracy {acc:.3f}', confusion)
        self.assertGreater(acc, 0.85)
    def test_frame_shape(self):
        from lab7 import Emulator7
        from signals import Preprocessor
        emu, pre = Emulator7(3), Preprocessor()
        for _ in range(6): w = pre.push(emu.read('pinch', .6))
        f = self.clf.predict(w)
        self.assertIn(f['gesture'], GESTURES)
        for k in ('a', 'b', 'effort', 'confidence'): self.assertTrue(0 <= f[k] <= 1)

if __name__ == '__main__': unittest.main()
