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
        for _ in range(6): w = pre.push(emu.read('pronation', .6))
        f = self.clf.predict(w)
        self.assertIn(f['gesture'], GESTURES)
        for k in ('a', 'b', 'effort', 'confidence'): self.assertTrue(0 <= f[k] <= 1)
        # 5.30 — the probability stream (СППР): every class by name, a distribution, its argmax is the decision
        self.assertEqual(sorted(f['probs']), sorted(GESTURES))
        self.assertAlmostEqual(sum(f['probs'].values()), 1, delta=0.01)
        self.assertEqual(max(f['probs'], key=f['probs'].get), f['gesture'])
    def test_task_packet(self):
        # 6.0 — the packet of the task: an integer MCU time and the seven wire names, a distribution that sums to 1
        from lab7 import Emulator7, WIRE
        from signals import Preprocessor
        emu, pre = Emulator7(5), Preprocessor()
        for _ in range(6): w = pre.push(emu.read('flexion', .7))
        pk = self.clf.packet(w, 1720000000123)
        self.assertEqual(pk['timestamp_ms'], 1720000000123)
        self.assertEqual(list(pk['dist']), list(WIRE))
        self.assertAlmostEqual(sum(pk['dist'].values()), 1, delta=1e-6)
        self.assertEqual(max(pk['dist'], key=pk['dist'].get), 'flexion')
    def test_mirror_mark(self):
        from lab7 import recording_mark
        self.assertEqual(recording_mark(True), 'зеркально')
        self.assertEqual(recording_mark(False), '')

if __name__ == '__main__': unittest.main()
