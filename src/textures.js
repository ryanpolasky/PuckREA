import { deflateSync, inflateSync } from 'zlib';
import { readFileSync } from 'fs';

const crcTable = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = crcTable[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};

const pngChunk = (type, data) => {
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, 'ascii');
  data.copy(out, 8);
  out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length);
  return out;
};

export function encodePNG(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const raw = Buffer.alloc(h * (1 + w * 4));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0;
    rgba.copy(raw, y * (1 + w * 4) + 1, y * w * 4, (y + 1) * w * 4);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function decodePNG(buf) {
  let off = 8, w = 0, h = 0;
  const idat = [];
  while (off < buf.length) {
    const len = buf.readUInt32BE(off);
    const type = buf.subarray(off + 4, off + 8).toString('ascii');
    const data = buf.subarray(off + 8, off + 8 + len);
    if (type === 'IHDR') {
      w = data.readUInt32BE(0);
      h = data.readUInt32BE(4);
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    off += 12 + len;
  }
  const raw = inflateSync(Buffer.concat(idat));
  const rgba = Buffer.alloc(w * h * 4);
  const stride = w * 4;
  const paeth = (a, b, c) => {
    const p = a + b - c;
    const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
    return pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
  };
  for (let y = 0; y < h; y++) {
    const ft = raw[y * (stride + 1)];
    const rowOff = y * (stride + 1) + 1;
    const dstOff = y * stride;
    for (let i = 0; i < stride; i++) {
      const x = raw[rowOff + i];
      const a = i >= 4 ? rgba[dstOff + i - 4] : 0;
      const b = y > 0 ? rgba[dstOff - stride + i] : 0;
      const c = y > 0 && i >= 4 ? rgba[dstOff - stride + i - 4] : 0;
      let v = x;
      if (ft === 1) v = (x + a) & 0xff;
      else if (ft === 2) v = (x + b) & 0xff;
      else if (ft === 3) v = (x + ((a + b) >> 1)) & 0xff;
      else if (ft === 4) v = (x + paeth(a, b, c)) & 0xff;
      rgba[dstOff + i] = v;
    }
  }
  return { w, h, rgba };
}

export function buildTextures() {
  const specs = [
    ['scoreboard_header', 'assets/generated/scoreboard_header.png', false],
    ['scoreboard_main', 'assets/generated/scoreboard_main.png', true],
    ['scoreboard_score', 'assets/generated/scoreboard_score.png', true],
    ['led_ribbon', 'assets/generated/led_ribbon.png', false],
    ['center_ice', 'assets/generated/center_ice.png', true],
    ['ice_sioux', 'assets/generated/ice_sioux.png', true],
    ['banners', 'assets/generated/banners.png', true],
    ['suite_band', 'assets/generated/suite_band.png', false],
    ['seat_row_upper', 'assets/generated/seat_row_upper.png', false],
    ['seat_dark_green', 'assets/generated/seat_dark_green.png', false],
    ['seat_kelly_green', 'assets/generated/seat_kelly_green.png', false],
    ['stairs_rea', 'assets/generated/stairs_rea.png', false],
    ['concourse_rea', 'assets/generated/concourse_rea.png', false],
    ['signs_rea', 'assets/generated/signs_rea.png', false],
    ['boards_ads', 'assets/generated/boards_ads.png', false],
  ];
  return specs.map(([name, file, clamp]) => {
    const png = readFileSync(file);
    const { w, h, rgba } = decodePNG(png);
    return { name, png, w, h, rgba, clamp };
  });
}
