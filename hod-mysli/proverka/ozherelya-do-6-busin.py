# Сколько ожерелий видно у слов не длиннее L букв: проверка n = 5, 6 и границ длины.
from itertools import product
R = {'А': 'БББ', 'Б': 'АВ', 'В': 'Б'}
def step(w): return R[w[-1]] + w[:-2] if len(w) >= 2 else None
def cyc(w, per):
    # слово лежит на цикле периода per? вернуть минимальное слово цикла
    words = [w]; x = step(w)
    for _ in range(per - 1): words.append(x); x = step(x)
    assert x == w, 'не цикл'
    m = min(len(y) for y in words)
    return m, min(y for y in words if len(y) == m)
NB = {'Y': 'АВ' + 'Б'*6 + 'АВ' + 'Б'*6 + 'АВАВ', 'Z': 'АВ' + 'Б'*6 + 'АВ' + 'БББ' + 'АВАВ' + 'БББ', 'D': 'АВ' + 'Б'*9 + 'АВ'*5 + 'БББ'}
base = 'АВ'*5 + 'БББ'
total = 0
for n in range(0, 7):
    reps = set(); lens = []
    for ch in product('YZD', repeat=n):
        w = base + ''.join(NB[c] for c in ch) + 'А'
        m, rep = cyc(w, 40 + 60*n)
        reps.add(rep); lens.append(m)
    total += len(reps)
    print(f'n={n}: цепочек {3**n}, разных циклов {len(reps)}, период {40+60*n}, кратчайшее слово {min(lens)}…{max(lens)} букв '
          f'(9+16n={9+16*n}, 9+20n={9+20*n}); всего ожерелий до n: {total}')
