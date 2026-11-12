// Décodeur UTF-8 minimal, à la place de TextDecoder quand le moteur JS ne l'a pas (GLTFLoader en a besoin).
export class DecodeurUtf8 {
  decode(v?: ArrayBufferView | ArrayBuffer): string {
    if (!v) return "";
    const o = v instanceof ArrayBuffer ? new Uint8Array(v) : new Uint8Array(v.buffer, v.byteOffset, v.byteLength);
    const points: number[] = [];
    for (let i = 0; i < o.length; ) {
      const b = o[i++]!;
      const n = b >= 0xf0 ? 3 : b >= 0xe0 ? 2 : b >= 0xc0 ? 1 : 0;
      let c = n ? b & (0x3f >> n) : b;
      for (let k = 0; k < n; k++) c = (c << 6) | (o[i++]! & 0x3f);
      points.push(c);
    }
    let s = "";
    for (let i = 0; i < points.length; i += 4096) s += String.fromCodePoint(...points.slice(i, i + 4096));
    return s;
  }
}
