/* buffer.c — fixed-capacity byte buffer */

#include "buffer.h"
#include "utf8.h"

typedef __SIZE_TYPE__ size_t;

void *memcpy(void *dst, const void *src, size_t n) {
  return __builtin_memcpy(dst, src, n);
}

void *memset(void *dst, int c, size_t n) { return __builtin_memset(dst, c, n); }

static size_t strlen(const char *s) {
  size_t n = 0;
  while (s[n])
    n++;
  return n;
}

void buf_put(Buffer *b, const char *s, int n) {
  if (b->length + n > b->capacity)
    return;
  memcpy(b->data + b->length, s, n);
  b->length += n;
}

void buf_str(Buffer *b, const char *s) { buf_put(b, s, strlen(s)); }

void buf_num(Buffer *b, int n) {
  char tmp[12];
  int i = 0;
  if (n < 0) {
    buf_put(b, "-", 1);
    n = -n;
  }
  if (n == 0) {
    buf_put(b, "0", 1);
    return;
  }
  while (n > 0) {
    tmp[i++] = '0' + (n % 10);
    n /= 10;
  }
  for (int j = i - 1; j >= 0; j--)
    buf_put(b, &tmp[j], 1);
}

void buf_char(Buffer *b, uint32_t ch) {
  char u[8];
  int n = utf8_encode(u, ch);
  buf_put(b, u, n);
}
