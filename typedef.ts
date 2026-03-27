export type Attrs<T> = {
  [K in keyof T]: TypeDef<T[K]>;
};

export type Alignment = 1 | 2 | 4 | 8;

export type LayoutElement<T> = {
  type: "padding";
  byteLength: number;
} | {
  type: "field";
  name: string;
  offset: number;
  typedef: Attrs<T>[keyof Attrs<T>];
};

export type Struct<T> = {
  type: "struct";
  byteLength: number;
  byteAlign: Alignment;
  layout: LayoutElement<T>[];
};

export type Num<T> = {
  type: "i32" | "f32" | "f64" | "uint8" | "uint16" | "uint32" | "int16" | "int32";
  byteAlign: Alignment;
  byteLength: number;
  T?: T;
};

export type TypeDef<T> = Num<T> | Struct<T>;

export const int32 = (): TypeDef<number> => ({
  type: "int32",
  byteLength: 4,
  byteAlign: 4,
});
export const uint8 = (): TypeDef<number> => ({
  type: "uint8",
  byteLength: 1,
  byteAlign: 1,
});
export const uint16 = (): TypeDef<number> => ({
  type: "uint16",
  byteLength: 2,
  byteAlign: 2,
});
export const uint32 = (): TypeDef<number> => ({
  type: "uint32",
  byteAlign: 4,
  byteLength: 4,
});

export function struct<T extends object>(
  attrs: Attrs<T>,
): Struct<T> {
  let entries = Object.entries(attrs) as [
    keyof Attrs<T>,
    Attrs<T>[keyof Attrs<T>],
  ][];

  let acc = {
    layout: [] as Struct<T>["layout"],
    offset: 0,
  };

  let byteAlign = Math.max(
    ...entries.map(([, typedef]) => typedef.byteAlign),
  ) as Alignment;

  for (let [name, typedef] of entries) {
    let padding = pad(acc.offset, typedef.byteAlign);
    if (padding > 0) {
      acc.layout.push({ type: "padding", byteLength: padding });
      acc.offset += padding;
    }

    acc.layout.push({
      type: "field",
      name: name as string,
      offset: acc.offset,
      typedef,
    });
    acc.offset += typedef.byteLength;
  }

  let padding = pad(acc.offset, byteAlign);
  if (padding > 0) {
    acc.layout.push({ type: "padding", byteLength: padding });
    acc.offset += padding;
  }

  return {
    type: "struct",
    layout: acc.layout,
    byteLength: acc.offset,
    byteAlign,
  };
}

export function offsets<T extends object>(
  def: Struct<T>,
): { [K in keyof T]: number } {
  let result = {} as { [K in keyof T]: number };
  for (let element of def.layout) {
    if (element.type === "field") {
      result[element.name as keyof T] = element.offset;
    }
  }
  return result;
}

export function pad(offset: number, alignment: number): number {
  if ((offset % alignment) !== 0) {
    return alignment - (offset % alignment);
  } else {
    return 0;
  }
}
