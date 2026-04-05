/* clayterm.h — WASM terminal rendering engine for Clay UI */

#ifndef CLAYTERM_H
#define CLAYTERM_H

#include <stdint.h>

#include "cell.h"

struct Clayterm;

/* WASM exports */
int clayterm_size(int w, int h);
struct Clayterm *init(void *mem, int w, int h, int row);
void reduce(struct Clayterm *ct, uint32_t *buf, int len, float dt);
char *output(struct Clayterm *ct);
int length(struct Clayterm *ct);
void measure(int ret, int txt);

int pointer_over_count(void);
int pointer_over_id_string_length(int index);
int pointer_over_id_string_ptr(int index);
int has_active_transitions(void);

#endif
