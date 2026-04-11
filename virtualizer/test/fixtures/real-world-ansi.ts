// Real-world ANSI fixture strings captured from common terminal programs.

// ls --color output (directory and file listing with SGR)
export const LS_COLOR =
  "\x1b[0m\x1b[01;34mnode_modules\x1b[0m  \x1b[01;32mpackage.json\x1b[0m  \x1b[00msrc\x1b[0m  \x1b[01;32mtsconfig.json\x1b[0m";

// git diff --color output (added/removed lines)
export const GIT_DIFF_ADD =
  "\x1b[32m+export function createDisplayWidth(): Promise<(text: string) => number> {\x1b[m";
export const GIT_DIFF_REMOVE =
  "\x1b[31m-// TODO: implement width calculation\x1b[m";
export const GIT_DIFF_HEADER =
  "\x1b[1mdiff --git a/width.ts b/width.ts\x1b[m";

// gcc diagnostics with bold and color
export const GCC_ERROR =
  "\x1b[1m\x1b[35msrc/main.c:42:5:\x1b[0m \x1b[1m\x1b[31merror:\x1b[0m \x1b[1mexpected ';' after expression\x1b[0m";

// npm output with multiple SGR parameters
export const NPM_WARN =
  "\x1b[33m\x1b[1mnpm\x1b[22m \x1b[39m\x1b[33mWARN\x1b[39m \x1b[35mdeprecated\x1b[39m request@2.88.2: request has been deprecated";

// OSC title-set (window title) followed by visible text
export const OSC_TITLE =
  "\x1b]0;user@host:~/project\x07$ ls -la";
