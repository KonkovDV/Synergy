# Независимая проверка простых чисел страницы.
R = {'А': 'БББ', 'Б': 'АВ', 'В': 'Б'}

def step(w):
    if len(w) < 2:
        return None
    return R[w[-1]] + w[:-2]

def T(n):
    return n // 2 if n % 2 == 0 else (3 * n + 1) // 2

def run_pure(n):
    """Прогон слова Б^n: шаги до остановки, максимум длины, длины чистых слов."""
    w = 'Б' * n
    steps, mx, pures = 0, len(w), [n]
    while True:
        nx = step(w)
        if nx is None:
            break
        w = nx
        steps += 1
        mx = max(mx, len(w))
        if set(w) == {'Б'}:
            pures.append(len(w))
    return steps, mx, pures

def collatz_classic(n):
    st, mx, odd = 0, n, 0
    while n != 1:
        if n % 2:
            n = 3 * n + 1; odd += 1
        else:
            n //= 2
        st += 1
        mx = max(mx, n)
    return st, mx, odd

def collatz_T(n):
    seq = [n]
    while seq[-1] != 1:
        seq.append(T(seq[-1]))
    return seq

# 1. Теорема: Б^n -> Б^T(n) за n (чётное) или n+1 (нечётное) шагов, для n = 2..400
for n in range(2, 401):
    w = 'Б' * n
    k = 0
    while True:
        w = step(w); k += 1
        if set(w) == {'Б'}:
            break
    assert len(w) == T(n), n
    assert k == (n if n % 2 == 0 else n + 1), n
print('теорема Б^n -> Б^T(n): ок для n = 2..400')

for n in (3, 7, 27):
    s, mx, pures = run_pure(n)
    seq = collatz_T(n)
    assert pures == seq
    cs, cmx, codd = collatz_classic(n)
    print(f'n={n}: тэг-шагов {s}, макс. длина {mx}, превращений {len(seq)-1}; '
          f'классический Коллатц: шагов {cs} (из них 3n+1: {codd}, делений: {cs-codd}), максимум {cmx}')

# 2. Почему /2 встроено: длины слов в нечётном превращении Б^(2k+1)
n = 7
w = 'Б' * n
trace = [w]
while True:
    w = step(w); trace.append(w)
    if set(w) == {'Б'}:
        break
print('трасса Б^7:', ' → '.join(trace))
print('длины:', [len(x) for x in trace])
# сколько букв прочитано и сколько стёрто непрочитанными
