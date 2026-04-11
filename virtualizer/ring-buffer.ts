export interface LineEntry {
  text: string;
  displayWidth: number;
  lineIndex: number;
}

export interface AppendResult {
  lineIndex: number;
  evicted?: { displayWidth: number; lineIndex: number };
}

export class RingBuffer {
  private _items: (LineEntry | undefined)[];
  private _capacity: number;
  private _head: number;
  private _count: number;
  private _nextIndex: number;

  constructor(capacity: number) {
    this._capacity = capacity;
    this._items = new Array(capacity);
    this._head = 0;
    this._count = 0;
    this._nextIndex = 0;
  }

  get capacity(): number {
    return this._capacity;
  }

  get lineCount(): number {
    return this._count;
  }

  get baseIndex(): number {
    if (this._count === 0) return this._nextIndex;
    return this._items[this._head]!.lineIndex;
  }

  append(text: string, displayWidth: number): AppendResult {
    let lineIndex = this._nextIndex++;
    let evicted: { displayWidth: number; lineIndex: number } | undefined;

    if (this._count === this._capacity) {
      let evictedEntry = this._items[this._head]!;
      evicted = {
        displayWidth: evictedEntry.displayWidth,
        lineIndex: evictedEntry.lineIndex,
      };
      this._head = (this._head + 1) % this._capacity;
      this._count--;
    }

    let slot = (this._head + this._count) % this._capacity;
    this._items[slot] = { text, displayWidth, lineIndex };
    this._count++;

    return { lineIndex, evicted };
  }

  get(lineIndex: number): LineEntry | undefined {
    if (this._count === 0) return undefined;
    let base = this._items[this._head]!.lineIndex;
    let offset = lineIndex - base;
    if (offset < 0 || offset >= this._count) return undefined;
    return this._items[(this._head + offset) % this._capacity];
  }
}
