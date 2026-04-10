/* cell.c — cell buffer operations */

#include "cell.h"

void cells_fill(Cell *buf, int w, int h, uint32_t ch, uint32_t fg,
                uint32_t bg) {
  for (int i = 0; i < w * h; i++) {
    buf[i].ch = ch;
    buf[i].fg = fg;
    buf[i].bg = bg;
  }
}

int cell_cmp(Cell *a, Cell *b) {
  return a->ch != b->ch || a->fg != b->fg || a->bg != b->bg;
}
