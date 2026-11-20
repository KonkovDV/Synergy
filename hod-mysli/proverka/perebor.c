// Сборка: gcc -O2 -fopenmp -o perebor perebor.c   Запуск: ./perebor 30   (или ./perebor 33, около 10 минут на 4 ядрах)
// Независимый перебор классов слов длины 2..LMAX для системы
// А -> БББ, Б -> АВ, В -> Б; читаем последнюю, стираем две последние, пишем в начало.
// Класс = слова с одинаковыми буквами на нечётных местах с конца (мёртвые буквы ставим Б).
// Для каждого класса: остановка (через чистое слово Б^n и формулу S(n)) или цикл (Брент + хэш).
// Цикл опознаётся по (период, минимальный хэш слов цикла).
#include <stdio.h>
#include <stdlib.h>
#include <stdint.h>
#include <string.h>
#include <omp.h>

#define CAP (1u << 22)
#define MASK (CAP - 1)
typedef unsigned __int128 u128;
static const uint64_t MOD = (1ULL << 61) - 1;
static uint64_t B, IB2; // основание и обратный к B^2

static inline uint64_t mm(uint64_t a, uint64_t b) {
  u128 z = (u128)a * b;
  uint64_t r = (uint64_t)(z >> 61) + (uint64_t)(z & MOD);
  if (r >= MOD) r -= MOD;
  if (r >= MOD) r -= MOD;
  return r;
}
static uint64_t pw(uint64_t a, uint64_t e) { uint64_t r = 1; while (e) { if (e & 1) r = mm(r, a); a = mm(a, a); e >>= 1; } return r; }

// буквы: 0=А 1=Б 2=В
static const int PL[3] = {3, 2, 1};
static const uint8_t PR[3][3] = {{1, 1, 1}, {0, 2, 0}, {1, 0, 0}};

typedef struct {
  uint8_t *buf; uint32_t head, tail; // слово = buf[head..tail-1] (по модулю CAP)
  uint32_t len; int64_t nonB; uint64_t H, Bp; // Bp = B^len
} W;

static inline void w_clear(W *w) { w->head = w->tail = CAP / 2; w->len = 0; w->nonB = 0; w->H = 0; w->Bp = 1; }
static inline void w_push_front(W *w, uint8_t c) {
  w->head = (w->head - 1) & MASK; w->buf[w->head] = c;
  w->H = w->H + mm(c + 1, w->Bp); if (w->H >= MOD) w->H -= MOD;
  w->Bp = mm(w->Bp, B); w->len++; w->nonB += (c != 1);
}
// шаг; возвращает 0, если шага нет (меньше двух букв)
static inline int w_step(W *w) {
  if (w->len < 2) return 0;
  uint8_t x = w->buf[(w->tail - 1) & MASK], y = w->buf[(w->tail - 2) & MASK];
  uint64_t sub = (uint64_t)(x + 1) + mm(y + 1, B);
  uint64_t h = w->H + 2 * MOD - sub; h %= MOD; w->H = mm(h, IB2); w->Bp = mm(w->Bp, IB2);
  w->tail = (w->tail - 2) & MASK; w->len -= 2; w->nonB -= (x != 1) + (y != 1);
  for (int j = PL[x] - 1; j >= 0; j--) w_push_front(w, PR[x][j]);
  return 1;
}
static void w_copy(W *dst, const W *src) {
  dst->head = CAP / 2 - src->len / 2; dst->tail = (dst->head + src->len) & MASK;
  for (uint32_t i = 0; i < src->len; i++) dst->buf[(dst->head + i) & MASK] = src->buf[(src->head + i) & MASK];
  dst->len = src->len; dst->nonB = src->nonB; dst->H = src->H; dst->Bp = src->Bp;
}
static int w_eq(const W *a, const W *b) {
  if (a->len != b->len || a->H != b->H) return 0;
  for (uint32_t i = 0; i < a->len; i++) if (a->buf[(a->head + i) & MASK] != b->buf[(b->head + i) & MASK]) return 0;
  return 1;
}
static void w_str(const W *w, char *out, size_t cap) { // в UTF-8
  static const char *L[3] = {"А", "Б", "В"}; size_t p = 0;
  for (uint32_t i = 0; i < w->len && p + 3 < cap; i++) { memcpy(out + p, L[w->buf[(w->head + i) & MASK]], 2); p += 2; }
  out[p] = 0;
}

// Коллатц: S(n) шагов от Б^n до Б, P(n) максимум на пути
#define NM (1u << 23)
static uint64_t *S; static uint32_t *P;
static uint64_t Tn(uint64_t n) { return (n & 1) ? (3 * n + 1) / 2 : n / 2; }
static void collatz_fill(void) {
  S = calloc(NM, 8); P = calloc(NM, 4); S[1] = 0; P[1] = 1;
  for (uint64_t n = 2; n < NM; n++) {
    // идём до числа меньше n
    uint64_t m = n, add = 0, mx = n;
    while (m >= n) { add += (m & 1) ? m + 1 : m; m = Tn(m); if (m > mx) mx = m; }
    S[n] = add + S[m]; uint64_t pm = P[m] > mx ? P[m] : mx; P[n] = (uint32_t)(pm > 0xffffffffu ? 0xffffffffu : pm);
  }
}

// таблица циклов
#define MAXC 4096
typedef struct { uint64_t key, per; uint32_t minlen, maxlen, firstL; uint64_t cnt[64]; char rep[512]; } Cyc;
static Cyc cyc[MAXC]; static int ncyc = 0;

static int cyc_find_or_add(uint64_t per, uint64_t key, uint32_t mn, uint32_t mx, int L, const char *rep) {
  int r = -1;
#pragma omp critical(cyc)
  {
    for (int i = 0; i < ncyc; i++) if (cyc[i].key == key && cyc[i].per == per) { r = i; break; }
    if (r < 0 && rep) {
      r = ncyc++; cyc[r].key = key; cyc[r].per = per; cyc[r].minlen = mn; cyc[r].maxlen = mx; cyc[r].firstL = L;
      memset(cyc[r].cnt, 0, sizeof cyc[r].cnt); strncpy(cyc[r].rep, rep, sizeof cyc[r].rep - 1);
    }
  }
  return r;
}

typedef struct { uint64_t halt, cyc, unk, recSteps, recIdx, recPeak, sumTot, sumColl, maxT0; uint64_t percyc[MAXC]; } Res;

int main(int argc, char **argv) {
  int LMAX = argc > 1 ? atoi(argv[1]) : 20; int LMIN = argc > 2 ? atoi(argv[2]) : 2;
  uint64_t LIMIT = 200000000ULL;
  B = 1000003ULL * 7919ULL + 12345ULL; IB2 = pw(mm(B, B), MOD - 2);
  collatz_fill();
  printf("L  classes  halt  cycle  unk  cyc%%  record_steps  record_peak  coll_share  max_t0  new_cycles\n");
  for (int L = LMIN; L <= LMAX; L++) {
    int m = (L + 1) / 2; uint64_t N = 1; for (int i = 0; i < m; i++) N *= 3;
    Res tot; memset(&tot, 0, sizeof tot);
    int before = ncyc;
#pragma omp parallel
    {
      W w, t, c; w.buf = malloc(CAP); t.buf = malloc(CAP); c.buf = malloc(CAP);
      Res r; memset(&r, 0, sizeof r);
#pragma omp for schedule(dynamic, 4096)
      for (uint64_t idx = 0; idx < N; idx++) {
        // строим слово: места с конца p = L-i; живые при нечётном p
        uint8_t word[64]; uint64_t v = idx;
        for (int i = L - 1; i >= 0; i--) { int p = L - i; if (p & 1) { word[i] = v % 3; v /= 3; } else word[i] = 1; }
        w_clear(&w); for (int i = L - 1; i >= 0; i--) w_push_front(&w, word[i]);
        uint64_t steps = 0, peak = w.len; int done = 0;
        if (w.nonB == 0) { // уже чистое
          r.halt++; uint64_t tt = S[w.len]; r.sumTot += tt; r.sumColl += tt;
          uint64_t pk = P[w.len]; if (tt > r.recSteps) { r.recSteps = tt; r.recIdx = idx; } if (pk > r.recPeak) r.recPeak = pk;
          continue;
        }
        w_copy(&t, &w); uint64_t power = 1, lam = 0;
        while (!done) {
          if (!w_step(&w)) { // остановка без чистого слова (короткие слова)
            r.halt++; r.sumTot += steps; if (steps > r.recSteps) { r.recSteps = steps; r.recIdx = idx; } if (peak > r.recPeak) r.recPeak = peak; done = 1; break; }
          steps++; lam++; if (w.len > peak) peak = w.len;
          if (w.nonB == 0) { // чистое слово Б^n: дальше Коллатц
            uint32_t n = w.len; if (n >= NM) { fprintf(stderr, "n too big %u\n", n); exit(1); }
            uint64_t tt = steps + S[n], pk = P[n] > peak ? P[n] : peak;
            r.halt++; r.sumTot += tt; r.sumColl += S[n]; if (steps > r.maxT0) r.maxT0 = steps;
            if (tt > r.recSteps) { r.recSteps = tt; r.recIdx = idx; } if (pk > r.recPeak) r.recPeak = pk; done = 1; break;
          }
          if (w.len == t.len && w.H == t.H && w_eq(&w, &t)) { // цикл периода lam
            uint64_t per = lam, key = w.H; uint32_t mn = w.len, mx = w.len;
            w_copy(&c, &w);
            for (uint64_t k = 0; k < per; k++) { w_step(&c); if (c.H < key) key = c.H; if (c.len < mn) mn = c.len; if (c.len > mx) mx = c.len; }
            int id = cyc_find_or_add(per, key, mn, mx, L, NULL);
            if (id < 0) { // новый: найдём представителя (самое короткое, затем первое по алфавиту)
              char best[512] = "", cur[512]; w_copy(&c, &w);
              for (uint64_t k = 0; k < per; k++) { w_step(&c); if (c.len == mn) { w_str(&c, cur, sizeof cur); if (!best[0] || strcmp(cur, best) < 0) strcpy(best, cur); } }
              id = cyc_find_or_add(per, key, mn, mx, L, best);
            }
            r.cyc++; r.percyc[id]++; done = 1; break;
          }
          if (lam == power) { w_copy(&t, &w); power <<= 1; lam = 0; }
          if (steps > LIMIT || w.len > CAP - 64) { r.unk++; done = 1; break; }
        }
      }
#pragma omp critical(red)
      {
        tot.halt += r.halt; tot.cyc += r.cyc; tot.unk += r.unk; tot.sumTot += r.sumTot; tot.sumColl += r.sumColl;
        if (r.recSteps > tot.recSteps || (r.recSteps == tot.recSteps && r.recIdx < tot.recIdx)) { tot.recSteps = r.recSteps; tot.recIdx = r.recIdx; }
        if (r.recPeak > tot.recPeak) tot.recPeak = r.recPeak; if (r.maxT0 > tot.maxT0) tot.maxT0 = r.maxT0;
        for (int i = 0; i < MAXC; i++) tot.percyc[i] += r.percyc[i];
      }
      free(w.buf); free(t.buf); free(c.buf);
    }
    for (int i = 0; i < ncyc; i++) cyc[i].cnt[L] = tot.percyc[i];
    printf("%2d %9llu %9llu %7llu %llu %6.2f %9llu %7llu %6.3f %7llu  ", L, (unsigned long long)N, (unsigned long long)tot.halt,
           (unsigned long long)tot.cyc, (unsigned long long)tot.unk, 100.0 * tot.cyc / N, (unsigned long long)tot.recSteps,
           (unsigned long long)tot.recPeak, tot.sumTot ? (double)tot.sumColl / tot.sumTot : 0.0, (unsigned long long)tot.maxT0);
    for (int i = before; i < ncyc; i++) printf("[per %llu] ", (unsigned long long)cyc[i].per);
    printf(" total_cycles=%d\n", ncyc); fflush(stdout);
  }
  printf("\nЦиклы (в порядке появления): период, мин. длина слова, макс. длина, длина первого старта, представитель\n");
  for (int i = 0; i < ncyc; i++) {
    printf("#%d per=%llu minlen=%u maxlen=%u firstL=%u rep=%s\n   classes by L:", i + 1, (unsigned long long)cyc[i].per, cyc[i].minlen,
           cyc[i].maxlen, cyc[i].firstL, cyc[i].rep);
    for (int L = LMIN; L <= LMAX; L++) if (cyc[i].cnt[L]) printf(" %d:%llu", L, (unsigned long long)cyc[i].cnt[L]);
    printf("\n");
  }
  return 0;
}
