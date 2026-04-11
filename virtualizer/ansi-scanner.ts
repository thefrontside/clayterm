/**
 * If text[pos] starts an ESC-initiated CSI or OSC sequence, return the
 * byte length of the full sequence (inclusive). Otherwise return 0.
 *
 * CSI: ESC [ ... <final byte 0x40–0x7E>
 * OSC: ESC ] ... <BEL (0x07) or ST (ESC \)>
 */
export function skipAnsiSequence(text: string, pos: number): number {
  if (text.charCodeAt(pos) !== 0x1b) return 0;
  if (pos + 1 >= text.length) return 0;

  let next = text.charCodeAt(pos + 1);

  // CSI: ESC [
  if (next === 0x5b) {
    let i = pos + 2;
    while (i < text.length) {
      let ch = text.charCodeAt(i);
      if (ch >= 0x40 && ch <= 0x7e) {
        return i - pos + 1;
      }
      i++;
    }
    // Unterminated CSI — consume what we have
    return i - pos;
  }

  // OSC: ESC ]
  if (next === 0x5d) {
    let i = pos + 2;
    while (i < text.length) {
      let ch = text.charCodeAt(i);
      // BEL terminator
      if (ch === 0x07) {
        return i - pos + 1;
      }
      // ST terminator: ESC backslash
      if (ch === 0x1b && i + 1 < text.length && text.charCodeAt(i + 1) === 0x5c) {
        return i - pos + 2;
      }
      i++;
    }
    // Unterminated OSC — consume what we have
    return i - pos;
  }

  return 0;
}
