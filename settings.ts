import {
  ALTSCREEN,
  CSI,
  ESC,
  HIDECURSOR,
  MAINSCREEN,
  SHOWCURSOR,
} from "./termcodes.ts";

export interface Setting {
  apply: Uint8Array;
  revert: Uint8Array;
}

export function settings(...sequence: Setting[]): Setting {
  return {
    apply: concat(sequence.map((s) => s.apply)),
    revert: concat(sequence.map((s) => s.revert).reverse()),
  };
}

export function alternateBuffer(
  options?: { clear?: boolean },
): Setting {
  return {
    apply: ALTSCREEN(options),
    revert: MAINSCREEN(),
  };
}

export function cursor(visible: boolean): Setting {
  if (visible) {
    return {
      apply: SHOWCURSOR(),
      revert: HIDECURSOR(),
    };
  } else {
    return {
      apply: HIDECURSOR(),
      revert: SHOWCURSOR(),
    };
  }
}

/**
 * Save and restore cursor position using DECSC (`ESC 7`) / DECRC (`ESC 8`).
 *
 * @see {@link https://vt100.net/docs/vt510-rm/DECSC.html | VT510 DECSC}
 * @see {@link https://vt100.net/docs/vt510-rm/DECRC.html | VT510 DECRC}
 */
export function saveCursorPosition(): Setting {
  return {
    apply: ESC("7"),
    revert: ESC("8"),
  };
}

export function progressiveInput(level: number): Setting {
  return {
    apply: CSI(`>${level}u`),
    revert: CSI("<u"),
  };
}

export function mouseTracking(): Setting {
  return {
    apply: concat([CSI("?1003h"), CSI("?1006h")]),
    revert: concat([CSI("?1006l"), CSI("?1003l")]),
  };
}

function concat(arrays: Uint8Array[]): Uint8Array {
  let length = arrays.reduce((sum, a) => sum + a.length, 0);
  let result = new Uint8Array(length);
  let offset = 0;
  for (let a of arrays) {
    result.set(a, offset);
    offset += a.length;
  }
  return result;
}
