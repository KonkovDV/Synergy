# Проверка ожерелий: (АВ)^5 Б^3 V А, V — цепочка бусин Y, Z, D. Период 40 + 60n? Все циклы разные?
from itertools import product
from collections import deque
R = {'А': 'БББ', 'Б': 'АВ', 'В': 'Б'}

def step(w):
    if len(w) < 2: return None
    return R[w[-1]] + w[:-2]

def cycle_of(w, limit=10**6):
    """Возвращает (период, frozenset слов цикла) или None, если остановка."""
    seen = {}
    i = 0
    while w is not None and i < limit:
        if w in seen:
            per = i - seen[w]
            cyc = [w]
            x = step(w)
            while x != w:
                cyc.append(x); x = step(x)
            assert len(cyc) == per
            return per, frozenset(cyc)
        seen[w] = i
        w = step(w); i += 1
    return None

NB = {'Y': 'АВ' + 'Б'*6 + 'АВ' + 'Б'*6 + 'АВАВ',
      'Z': 'АВ' + 'Б'*6 + 'АВ' + 'БББ' + 'АВАВ' + 'БББ',
      'D': 'АВ' + 'Б'*9 + 'АВ'*5 + 'БББ'}
print({k: len(v) for k, v in NB.items()})
base = 'АВ'*5 + 'БББ'
allcyc = {}
for n in range(0, 5):
    cycles = {}
    for ch in product('YZD', repeat=n):
        w = base + ''.join(NB[c] for c in ch) + 'А'
        r = cycle_of(w)
        assert r is not None, ch
        per, words = r
        assert per == 40 + 60*n, (ch, per)
        assert w in words  # само слово лежит на цикле
        cycles.setdefault(words, []).append(''.join(ch))
    mins = [min(len(x) for x in c) for c in cycles]
    print(f'n={n}: цепочек {3**n}, разных циклов {len(cycles)}, период {40+60*n}, '
          f'самое короткое слово в цикле: от {min(mins)} до {max(mins)} букв')
    if n == 2:
        # повороты цепочки: YZ и ZY — разные циклы?
        for words, chs in cycles.items():
            if len(chs) > 1: print('  совпали:', chs)
    allcyc[n] = cycles

# Какие из ожерелий видны в переборе до длины 30 (есть слово длины <= 30 в цикле)?
for n, cycles in allcyc.items():
    for words, chs in cycles.items():
        m = min(len(x) for x in words)
        if m <= 30:
            rep = min((x for x in words if len(x) == m))
            print(f'  n={n} {chs}: самое короткое слово {m} букв, первое по алфавиту {rep}')

# Семейство X^k А
X = 'АВБАВБББ'
for k in range(1, 6):
    per, words = cycle_of(X*k + 'А')
    print(f'X^{k}А: длина {8*k+1}, период {per}, длины в цикле {sorted(set(len(x) for x in words))}')
