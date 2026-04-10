/**
 * Encode a plain escape sequence.
 *
 * Prepends `ESC` (`\x1b`) to the given string and returns the result as bytes.
 *
 * @see {@link https://www.ecma-international.org/publications-and-standards/standards/ecma-48/ | ECMA-48}
 */
export function ESC(str: string): Uint8Array {
  return encode(`\x1b${str}`);
}

/**
 * Encode a Control Sequence Introducer (CSI) command.
 *
 * Prepends `ESC[` to the given string and returns the result as bytes.
 *
 * @see {@link https://www.ecma-international.org/publications-and-standards/standards/ecma-48/ | ECMA-48}
 */
export function CSI(str: string): Uint8Array {
  return ESC(`[${str}`);
}

/**
 * Request the cursor position via Device Status Report (DSR).
 *
 * Sends `CSI 6n`. The terminal responds with a Cursor Position Report
 * (`CSI row ; column R`) where row and column are 1-based.
 *
 * @see {@link https://www.ecma-international.org/publications-and-standards/standards/ecma-48/ | ECMA-48}
 */
export function DSR(): Uint8Array {
  return CSI("6n");
}

/**
 * Show the cursor (DECTCEM set).
 *
 * DEC private mode 25. Not part of ECMA-48; originates from the VT220.
 *
 * @see {@link https://vt100.net/docs/vt510-rm/DECTCEM.html | VT510 DECTCEM}
 */
export function SHOWCURSOR(): Uint8Array {
  return CSI("?25h");
}

/**
 * Hide the cursor (DECTCEM reset).
 *
 * DEC private mode 25. Not part of ECMA-48; originates from the VT220.
 *
 * @see {@link https://vt100.net/docs/vt510-rm/DECTCEM.html | VT510 DECTCEM}
 */
export function HIDECURSOR(): Uint8Array {
  return CSI("?25l");
}

/**
 * Switch to the alternate screen buffer (xterm private mode 1049).
 *
 * Saves the cursor and switches to a clean alternate screen. Use
 * {@link MAINSCREEN} to switch back.
 *
 * @see {@link https://invisible-island.net/xterm/ctlseqs/ctlseqs.html | xterm control sequences}
 */
export function ALTSCREEN(): Uint8Array {
  return CSI("?1049h");
}

/**
 * Switch back to the main screen buffer (xterm private mode 1049).
 *
 * Restores the cursor and returns to the main screen with scrollback intact.
 *
 * @see {@link https://invisible-island.net/xterm/ctlseqs/ctlseqs.html | xterm control sequences}
 */
export function MAINSCREEN(): Uint8Array {
  return CSI("?1049l");
}

const encoder = new TextEncoder();

function encode(str: string): Uint8Array {
  return encoder.encode(str);
}
