LLVM_CLANG := $(shell if [ -x /opt/homebrew/opt/llvm/bin/clang ]; then printf %s /opt/homebrew/opt/llvm/bin/clang; elif [ -x /opt/homebrew/bin/clang ]; then printf %s /opt/homebrew/bin/clang; else command -v clang; fi)
CC = $(LLVM_CLANG)
LLVM_BIN_DIR := $(shell dirname "$(LLVM_CLANG)")
WASM_LD_DIR ?= $(shell if command -v wasm-ld >/dev/null 2>&1; then dirname "$$(command -v wasm-ld)"; elif [ -x /opt/homebrew/bin/wasm-ld ]; then printf %s /opt/homebrew/bin; fi)
TARGET = clayterm.wasm
SRC = src/module.c

CFLAGS = --target=wasm32 -nostdlib -O2 \
         -DCLAY_IMPLEMENTATION -DCLAY_WASM \
         -Isrc -I.

LDFLAGS = -Wl,--no-entry \
          -Wl,--import-memory \
          -Wl,--stack-first \
          -Wl,--export-all \
          -Wl,--undefined=Clay__MeasureText \
          -Wl,--undefined=Clay__QueryScrollOffset

all: $(TARGET)
	@echo "Built $(TARGET) ($$(wc -c < $(TARGET)) bytes)"

DEPS = $(wildcard src/*.c src/*.h)

$(TARGET): $(DEPS)
	PATH="$(LLVM_BIN_DIR):$(WASM_LD_DIR):$$PATH" $(CC) $(CFLAGS) $(LDFLAGS) -o $@ $(SRC)

clean:
	rm -f $(TARGET)

.PHONY: all clean
