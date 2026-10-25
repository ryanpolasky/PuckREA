import { readFileSync } from 'fs';
import { Builder, roundedRectPath, offsetPath, ringStrip, flatDisc, stairBowl, inGaps } from './geom.js';
import { makeMaterial } from './gltf.js';
import { buildTextures } from './textures.js';

const lin = (c) => {
  const f = (v) => Math.pow((v / 255 + 0.055) / 1.055, 2.4);
  return [f(c[0]), f(c[1]), f(c[2]), c.length > 3 ? c[3] / 255 : 1];
};

function iceDisc(b, cx, cz, y, r, segs, mat, down = false) {
  const hn = down ? [0, -1, 0] : [0, 1, 0];
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const x0 = cx + Math.cos(a0) * r, z0 = cz + Math.sin(a0) * r;
    const x1 = cx + Math.cos(a1) * r, z1 = cz + Math.sin(a1) * r;
    // At a=0 (x = cx + r, closest to the player bench at glTF +X), v=0 (TOP of Sioux logo) and u goes 0->1 from -Z to +Z (un-mirrored!)
    const u0 = 0.5 + 0.5 * Math.sin(a0), v0 = 0.5 - 0.5 * Math.cos(a0);
    const u1 = 0.5 + 0.5 * Math.sin(a1), v1 = 0.5 - 0.5 * Math.cos(a1);
    b.tri([cx, y, cz], [x0, y, z0], [x1, y, z1], mat, hn, [[0.5, 0.5], [u0, v0], [u1, v1]]);
  }
}

function buildBoxBoard(b, M, roofY) {
  const sides = ['+z', '-z', '+x', '-x'];
  const addFrustumFace = (side, topHalf, bottomHalf, topY, bottomY, mat) => {
    const slope = (topHalf - bottomHalf) / (topY - bottomY);
    let bl, br, tr, tl, hint;
    if (side === '+z') {
      bl = [-bottomHalf, bottomY, bottomHalf];
      br = [bottomHalf, bottomY, bottomHalf];
      tr = [topHalf, topY, topHalf];
      tl = [-topHalf, topY, topHalf];
      hint = [0, -slope, 1];
    } else if (side === '-z') {
      bl = [bottomHalf, bottomY, -bottomHalf];
      br = [-bottomHalf, bottomY, -bottomHalf];
      tr = [-topHalf, topY, -topHalf];
      tl = [topHalf, topY, -topHalf];
      hint = [0, -slope, -1];
    } else if (side === '+x') {
      bl = [bottomHalf, bottomY, bottomHalf];
      br = [bottomHalf, bottomY, -bottomHalf];
      tr = [topHalf, topY, -topHalf];
      tl = [topHalf, topY, topHalf];
      hint = [1, -slope, 0];
    } else {
      bl = [-bottomHalf, bottomY, -bottomHalf];
      br = [-bottomHalf, bottomY, bottomHalf];
      tr = [-topHalf, topY, topHalf];
      tl = [-topHalf, topY, -topHalf];
      hint = [-1, -slope, 0];
    }
    b.quad(bl, br, tr, tl, mat, hint);
  };
  const addFrustum = (topHalf, bottomHalf, topY, bottomY, mat) => {
    for (const side of sides) addFrustumFace(side, topHalf, bottomHalf, topY, bottomY, mat);
  };
  const addScreen = (side, width, height, centerY, topHalf, bottomHalf, topY, bottomY, mat) => {
    const slope = (topHalf - bottomHalf) / (topY - bottomY);
    const q = Math.sqrt(1 + slope * slope);
    const radius = bottomHalf + slope * (centerY - bottomY);
    let center, normal, horizontal, vertical;
    if (side === '+z') {
      center = [0, centerY, radius];
      normal = [0, -slope / q, 1 / q];
      horizontal = [1, 0, 0];
      vertical = [0, 1 / q, slope / q];
    } else if (side === '-z') {
      center = [0, centerY, -radius];
      normal = [0, -slope / q, -1 / q];
      horizontal = [-1, 0, 0];
      vertical = [0, 1 / q, -slope / q];
    } else if (side === '+x') {
      center = [radius, centerY, 0];
      normal = [1 / q, -slope / q, 0];
      horizontal = [0, 0, -1];
      vertical = [slope / q, 1 / q, 0];
    } else {
      center = [-radius, centerY, 0];
      normal = [-1 / q, -slope / q, 0];
      horizontal = [0, 0, 1];
      vertical = [-slope / q, 1 / q, 0];
    }
    const corner = (h, v) => center.map((c, i) =>
      c + normal[i] * 0.02 + horizontal[i] * h * width / 2 + vertical[i] * v * height / 2
    );
    b.quad(corner(-1, -1), corner(1, -1), corner(1, 1), corner(-1, 1), mat, normal);
  };

  addFrustum(6.4, 5.3, 20.6, 15.2, M.speakerBlack);
  for (const side of sides) addScreen(side, 9.8, 4.9, 17.9, 6.4, 5.3, 20.6, 15.2, M.sbMain);
  addFrustum(5.3, 4.4, 15.2, 14.6, M.speakerBlack);
  addFrustum(4.4, 3.73, 14.6, 11.3, M.speakerBlack);
  for (const side of sides) addScreen(side, 6.6, 3.3, 12.95, 4.4, 3.73, 14.6, 11.3, M.sbScore);
  b.box(0, 20.74, 0, 12.8, 0.28, 12.8, M.speakerBlack);
  b.box(0, 11.10, 0, 7.5, 0.40, 7.5, M.speakerBlack);
  const bandRadius = (y) => 4.4 + ((y - 14.6) / 0.6) * 0.9 + 0.02;
  for (const side of sides) addFrustumFace(side, bandRadius(14.98), bandRadius(14.82), 14.98, 14.82, M.ledRibbon);
  for (const s of [-1, 1]) {
    b.panel(0, 20.94, s * 6.42, 11.8, 0.12, 0, s, M.ledRibbon, 0, 0, 3.1, 1);
    b.panel(s * 6.42, 20.94, 0, 11.8, 0.12, s, 0, M.ledRibbon, 0, 0, 3.1, 1);
  }
  for (const hx of [-5.7, 5.7]) {
    for (const hz of [-5.7, 5.7]) {
      b.box(hx, (20.88 + roofY) / 2, hz, 0.18, roofY - 20.88, 0.18, M.trussWhite);
    }
  }
  const ringPath = roundedRectPath(3.75, 3.75, 0.22, 4, 4, 6);
  ringStrip(b, ringPath, 10.82, offsetPath(ringPath, 0.16), 10.82, M.lampGlow, () => [0, -1, 0]);
  ringStrip(b, offsetPath(ringPath, -0.22), 10.84, offsetPath(ringPath, -0.14), 10.84, M.greenGlow, () => [0, -1, 0]);
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const sx = Math.cos(a) * 10.8, sz = Math.sin(a) * 10.8;
    b.box(sx, 19.15, sz, 0.88, 2.4, 1.05, M.speakerBlack, 0, -a, 0.18);
    b.box(sx, (roofY + 20.35) / 2, sz, 0.14, roofY - 20.35, 0.14, M.speakerBlack);
  }
}

export function buildArena() {
  const textures = buildTextures();
  const texIdx = (name) => textures.findIndex((t) => t.name === name);

  const M = {
    seatDarkGreen: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('seat_dark_green'),
      roughness: 0.48,
      doubleSided: true,
      name: 'seatDarkGreen',
    }),
    seatKellyGreen: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('seat_kelly_green'),
      roughness: 0.48,
      doubleSided: true,
      name: 'seatKellyGreen',
    }),
    seatFrame: makeMaterial({ color: lin([10, 12, 11]), roughness: 0.55, metallic: 0.35, doubleSided: true, name: 'seatFrame' }),
    upperSeatRow: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('seat_row_upper'),
      roughness: 0.48,
      doubleSided: true,
      name: 'upperSeatRow',
    }),
    stairs: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('stairs_rea'),
      roughness: 0.65,
      doubleSided: true,
      name: 'stairs',
    }),
    tier: makeMaterial({ color: lin([190, 178, 154]), roughness: 0.78, doubleSided: true, name: 'tier' }),
    concrete: makeMaterial({ color: lin([200, 188, 164]), roughness: 0.78, doubleSided: true, name: 'concrete' }),
    rail: makeMaterial({ color: lin([32, 36, 34]), roughness: 0.4, metallic: 0.6, doubleSided: true, name: 'rail' }),
    railGlass: makeMaterial({ color: lin([24, 48, 36]), roughness: 0.15, metallic: 0.7, doubleSided: true, name: 'railGlass' }),
    signs: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('signs_rea'),
      emissiveTexture: texIdx('signs_rea'),
      emissive: [0.45, 0.45, 0.45],
      roughness: 0.4,
      doubleSided: true,
      name: 'signs',
    }),
    wall: makeMaterial({ color: lin([192, 174, 144]), roughness: 0.78, doubleSided: true, name: 'wall' }),
    concourse: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('concourse_rea'),
      emissiveTexture: texIdx('concourse_rea'),
      emissive: [0.35, 0.35, 0.35],
      roughness: 0.65,
      doubleSided: true,
      name: 'concourse',
    }),
    creamWall: makeMaterial({
      color: lin([229, 220, 201]),
      emissive: lin([229, 220, 201]).slice(0, 3).map((v) => v * 0.10),
      roughness: 0.78,
      doubleSided: true,
      name: 'creamWall',
    }),
    suiteBand: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('suite_band'),
      emissive: [0.12, 0.08, 0.04],
      roughness: 0.32,
      doubleSided: true,
      name: 'suiteBand',
    }),
    suiteWarm: makeMaterial({
      color: lin([245, 198, 125]),
      emissive: lin([235, 175, 88]).slice(0, 3),
      roughness: 0.4,
      doubleSided: true,
      name: 'suiteWarm',
    }),
    dark: makeMaterial({ color: lin([16, 20, 18]), roughness: 0.9, doubleSided: true, name: 'dark' }),
    tunnel: makeMaterial({ color: lin([8, 10, 9]), roughness: 0.95, doubleSided: true, name: 'tunnel' }),
    kellyCap: makeMaterial({ color: lin([0, 136, 60]), roughness: 0.45, doubleSided: true, name: 'kellyCap' }),
    boardAds: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('boards_ads'),
      emissiveTexture: texIdx('boards_ads'),
      emissive: [0.18, 0.18, 0.18],
      roughness: 0.4,
      name: 'boardAds',
    }),
    centerIce: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('center_ice'),
      emissiveTexture: texIdx('center_ice'),
      emissive: [0.22, 0.22, 0.22],
      roughness: 0.25,
      name: 'centerIce',
    }),
    iceSioux: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('ice_sioux'),
      emissiveTexture: texIdx('ice_sioux'),
      emissive: [0.22, 0.22, 0.22],
      roughness: 0.25,
      name: 'iceSioux',
    }),
    ledRibbon: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('led_ribbon'),
      emissiveTexture: texIdx('led_ribbon'),
      emissive: [1.25, 1.25, 1.25],
      roughness: 0.3,
      doubleSided: true,
      name: 'ledRibbon',
    }),
    sbMain: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('scoreboard_main'),
      emissiveTexture: texIdx('scoreboard_main'),
      emissive: [1.25, 1.25, 1.25],
      roughness: 0.25,
      doubleSided: true,
      name: 'sbMain',
    }),
    sbScore: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('scoreboard_score'),
      emissiveTexture: texIdx('scoreboard_score'),
      emissive: [1.1, 1.1, 1.1],
      roughness: 0.25,
      doubleSided: true,
      name: 'sbScore',
    }),
    bannerAtlas: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('banners'),
      emissiveTexture: texIdx('banners'),
      emissive: [0.12, 0.12, 0.12],
      roughness: 0.5,
      doubleSided: true,
      name: 'bannerAtlas',
    }),
    trussWhite: makeMaterial({
      color: lin([244, 241, 232]),
      emissive: lin([244, 241, 232]).slice(0, 3).map((v) => v * 0.08),
      roughness: 0.55,
      metallic: 0.25,
      name: 'trussWhite',
    }),
    roofDeck: makeMaterial({
      color: lin([222, 216, 200]),
      emissive: lin([222, 216, 200]).slice(0, 3).map((v) => v * 0.18),
      roughness: 0.75,
      doubleSided: true,
      name: 'roofDeck',
    }),
    speakerBlack: makeMaterial({ color: lin([14, 16, 18]), roughness: 0.6, doubleSided: true, name: 'speakerBlack' }),
    lampGlow: makeMaterial({
      color: [1, 1, 1, 1],
      emissive: [2.5, 2.5, 2.5],
      roughness: 0.15,
      doubleSided: true,
      name: 'lampGlow',
    }),
    sconceGlow: makeMaterial({
      color: lin([255, 218, 145]),
      emissive: lin([255, 213, 140]).slice(0, 3),
      roughness: 0.2,
      doubleSided: true,
      name: 'sconceGlow',
    }),
    greenGlow: makeMaterial({
      color: lin([20, 255, 110]),
      emissive: lin([0, 240, 100]).slice(0, 3),
      roughness: 0.2,
      name: 'greenGlow',
    }),
  };
  const mats = Object.values(M);
  const b = new Builder();

  // 1. LOAD EXTRACTED BOWL, STAIRS, RAILINGS, 3,000+ 3D STADIUM CHAIRS, BENCHES, AND SPECTATORS
  const bowlMeta = JSON.parse(readFileSync('assets/bowl.json', 'utf8'));
  const bowlBin = readFileSync('assets/bowl.bin');
  const matMap = {
    Ribbon1: M.ledRibbon,
    SeatShell: M.seatDarkGreen,
    SeatShellY: M.seatKellyGreen,
    SeatFrame: M.seatFrame,
    Stairs: M.stairs,
    Tier: M.tier,
    Concrete: M.concrete,
    Rail: M.rail,
    Glass: M.railGlass,
    Signs: M.signs,
    Wall: M.wall,
    TunnelDark: M.tunnel,
    Dark: M.dark,
    RedPaint: M.kellyCap,
    Rubber: M.dark,
    PortalBlue: M.kellyCap,
    Soffit: M.tier,
    LedWarm: M.suiteWarm,
    Concourse: M.concourse,
    BenchSeat: M.seatDarkGreen,
    Steel: M.trussWhite,
    Speaker: M.speakerBlack,
  };

  const importedPrims = [];
  for (const pm of bowlMeta.prims) {
    if (pm.mat === 'Net' || pm.mat === 'RedPaint' || pm.mat === 'WallWin') continue;
    const targetMat = matMap[pm.mat] ?? M.dark;
    const matIndex = mats.indexOf(targetMat);
    let off = pm.offset;
    const pos = Array.from(new Float32Array(bowlBin.buffer, bowlBin.byteOffset + off, pm.vcount * 3));
    off += pm.posLen;
    const norm = Array.from(new Float32Array(bowlBin.buffer, bowlBin.byteOffset + off, pm.vcount * 3));
    off += pm.normLen;
    const uv = Array.from(new Float32Array(bowlBin.buffer, bowlBin.byteOffset + off, pm.vcount * 2));
    off += pm.uvLen;
    const idx = Array.from(new Uint32Array(bowlBin.buffer, bowlBin.byteOffset + off, pm.icount));

    // Clamp Rubber floor mats to |z| <= 10.34 and lift by +1.5cm so they never Z-fight with Concrete at y=0.000 or poke into the staircases
    if (pm.mat === 'Rubber') {
      for (let i = 0; i < pos.length; i += 3) {
        pos[i + 1] += 0.015;
        if (pos[i + 2] > 10.34) pos[i + 2] = 10.34;
        if (pos[i + 2] < -10.34) pos[i + 2] = -10.34;
      }
    }

    // Restore UnityPy's exported CCW triangle winding; strip low Glass panels (y < 4.0) and strip Rail bars that cross stairways
    const filteredIdx = [];
    for (let i = 0; i < idx.length; i += 3) {
      const i0 = idx[i], i1 = idx[i + 2], i2 = idx[i + 1];
      const x0 = pos[i0 * 3], x1 = pos[i1 * 3], x2 = pos[i2 * 3];
      const y0 = pos[i0 * 3 + 1], y1 = pos[i1 * 3 + 1], y2 = pos[i2 * 3 + 1];
      const z0 = pos[i0 * 3 + 2], z1 = pos[i1 * 3 + 2], z2 = pos[i2 * 3 + 2];
      const cx = (x0 + x1 + x2) / 3;
      const cy = (y0 + y1 + y2) / 3;
      const cz = (z0 + z1 + z2) / 3;
      const maxY = Math.max(y0, y1, y2);
      if (pm.mat === 'Glass' && maxY < 4.0) continue;
      // Remove the 2 cols x 2 rows of floating chairs on each side of the penalty box (x < -24, y < 2.55, |z| < 8.28) where there is no concrete tier beneath them
      if ((pm.mat === 'SeatShell' || pm.mat === 'SeatShellY' || pm.mat === 'SeatFrame') && cx < -24.0 && cy < 2.55 && Math.abs(cz) < 8.28) {
        continue;
      }
      if (pm.mat === 'Rail') {
        // Strip the unbroken Row-0 front perimeter rail (maxY < 2.25) that crosses every stairway mouth around the rink
        if (maxY < 2.25) continue;
        // Strip the bench/penalty-box back-rail segments at |x| = 26.85..26.90 (keep |x| >= 27.05 so the vertical stair handrail posts at |x| = 27.23 stay intact!)
        const minAbsZ = Math.min(Math.abs(z0), Math.abs(z1), Math.abs(z2));
        const maxAbsZ = Math.max(Math.abs(z0), Math.abs(z1), Math.abs(z2));
        if (Math.abs(cx) < 27.05 && maxY < 3.65) {
          if (minAbsZ < 2.75) continue;
          if (cx > 0 && maxAbsZ > 8.25) continue;
        }
      }
      filteredIdx.push(i0, i1, i2);
    }
    importedPrims.push({ positions: pos, normals: norm, uvs: uv, indices: filteredIdx, material: matIndex });

    // Close the far back end (r = 45.12..68.36, y = 5.08..7.18) of each of the 13 fan tunnels with a single exact back-wall quad (zero clipping!)
    if (pm.mat === 'TunnelDark') {
      for (let q = 14; q < 53; q += 3) {
        const t0 = (q + 0) * 6, t1 = (q + 1) * 6;
        const outerEnd = (t) => {
          const vs = [...new Set(idx.slice(t, t + 6))].map((v) => [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
          vs.sort((a, b2) => Math.hypot(a[0], a[2]) - Math.hypot(b2[0], b2[2]));
          const outPt = vs[vs.length - 1];
          return { x: outPt[0], z: outPt[2] };
        };
        const pA = outerEnd(t0), pB = outerEnd(t1);
        b.quad(
          [pA.x, 5.08, pA.z],
          [pB.x, 5.08, pB.z],
          [pB.x, 7.18, pB.z],
          [pA.x, 7.18, pA.z],
          M.tunnel,
          [-pA.x, 0, -pA.z]
        );
      }
    }

  }

  // 2. RINK DETAILS: Real Fighting Sioux center-ice logo (TOP of logo at +X closest to the player bench!) + 4 neutral-zone logos
  const iceY = 0.018;
  iceDisc(b, 0, 0, iceY, 6.25, 48, M.centerIce, false);
  for (const [lx, lz] of [[-9.5, 8.2], [9.5, 8.2], [-9.5, -8.2], [9.5, -8.2]]) {
    iceDisc(b, lx, lz, iceY, 2.15, 32, M.iceSioux, false);
  }

  // Real sponsor dasher board ads (4096x128 32:1 texture with uvRepeat=8 -> true 1:1 aspect ratio!) + kelly-green cap rail
  const boardIn = roundedRectPath(22.492, 45.742, 12.742, 16, 32, 16);
  ringStrip(b, boardIn, 0.31, boardIn, 1.19, M.boardAds, (m) => [-m.x, 0, -m.z], null, null, 8);
  const capIn = roundedRectPath(22.48, 45.73, 12.73, 12, 24, 12);
  const capOut = offsetPath(capIn, 0.14);
  ringStrip(b, capIn, 1.24, capOut, 1.24, M.kellyCap, () => [0, 1, 0]);
  ringStrip(b, capIn, 1.19, capIn, 1.24, M.kellyCap, (m) => [-m.x, 0, -m.z]);
  ringStrip(b, capOut, 1.19, capOut, 1.24, M.kellyCap, (m) => [m.x, 0, m.z]);

  // Include filtered Barrier Pillars (all rink glass pillars except the 5 in front of the player bench!)
  const pillars = JSON.parse(readFileSync('assets/pillars.json', 'utf8'));
  importedPrims.push({
    positions: pillars.pos,
    normals: pillars.norm,
    uvs: new Array((pillars.pos.length / 3) * 2).fill(0),
    indices: pillars.idx,
    material: mats.indexOf(M.rail),
  });

  // Player bench back walls on +X (z = [-10.38, -0.65] and [0.65, 10.38]) and narrower penalty-box back walls on -X (z = [-8.27, -0.65] and [0.65, 8.27] so seats at |z|=8.27..10.38 never clip!)
  const backWallSpans = [
    [1, [[-10.38, -0.65], [0.65, 10.38]]],
    [-1, [[-8.27, -0.65], [0.65, 8.27]]],
  ];
  for (const [sx, spans] of backWallSpans) {
    for (const [z0, z1] of spans) {
      b.quad([sx * 26.825, 0.0, z0], [sx * 26.825, 0.0, z1], [sx * 26.825, 2.59, z1], [sx * 26.825, 2.59, z0], M.kellyCap, [-sx, 0, 0]);
      b.quad([sx * 26.80, 0.0, z0], [sx * 26.85, 0.0, z0], [sx * 26.85, 2.59, z0], [sx * 26.80, 2.59, z0], M.kellyCap, [0, 0, 1]);
      b.quad([sx * 26.80, 0.0, z1], [sx * 26.85, 0.0, z1], [sx * 26.85, 2.59, z1], [sx * 26.80, 2.59, z1], M.kellyCap, [0, 0, -1]);
      // Clean top handrail along each bench/penalty-box back wall segment that stops strictly at the stairway edges (z0..z1)
      b.box(sx * 26.87, 3.50, (z0 + z1) / 2, 0.06, 0.06, (z1 - z0) - 0.08, M.rail);
      b.box(sx * 26.87, 3.05, z0 + 0.06, 0.05, 0.90, 0.05, M.rail);
      b.box(sx * 26.87, 3.05, z1 - 0.06, 0.05, 0.90, 0.05, M.rail);
    }
  }

  // Perpendicular divider walls between the two player benches (z = +-1.25) and outer bench ends (z = +-10.35, stopping at x=24.25 so the stairway entry at x=24.3..25.0 stays open!)
  for (const pz of [-10.35, -1.25, 1.25, 10.35]) {
    b.box(23.40, 0.62, pz, 1.72, 1.24, 0.14, M.wall);
    b.box(23.40, 1.22, pz, 1.74, 0.07, 0.16, M.kellyCap);
  }
  for (const pz of [-5.70, -1.50, 1.50, 5.70]) {
    b.box(-23.75, 0.62, pz, 2.42, 1.24, 0.14, M.wall);
    b.box(-23.75, 1.22, pz, 2.44, 0.07, 0.16, M.kellyCap);
  }

  // Stepped side faces strictly under the audience stands (x = 24.36..26.84); Concrete in bowl.bin already provides the x = +-24.36 front riser so we don't duplicate it!
  const standSideSteps = [
    [24.36, 25.18, 1.20],
    [25.18, 26.00, 1.66],
    [26.00, 26.84, 2.13],
    [26.50, 27.25, 2.60],
  ];
  for (const [sx, zCut] of [[1, 11.68], [1, -11.68], [-1, 11.68], [-1, -11.68], [-1, 8.27], [-1, -8.27], [-1, 10.38], [-1, -10.38]]) {
    for (const [x0, x1, yTop] of standSideSteps) {
      b.quad([sx * x0, 0.0, zCut], [sx * x1, 0.0, zCut], [sx * x1, yTop, zCut], [sx * x0, yTop, zCut], M.tier, [0, 0, -Math.sign(zCut)]);
    }
  }

  const roofY = 25.5;
  const suitePath = roundedRectPath(41.52, 64.76, 31.58, 16, 28, 16);
  const fasciaPath = offsetPath(suitePath, -0.02);
  ringStrip(b, fasciaPath, 10.60, fasciaPath, 13.15, M.suiteBand, (m) => [-m.x, 0, -m.z], null, null, fasciaPath.totalLen / 3);

  ringStrip(b, fasciaPath, 14.25, fasciaPath, 15.10, M.concrete, (m) => [-m.x, 0, -m.z]);
  const parapetPath = offsetPath(fasciaPath, 0.15);
  ringStrip(b, fasciaPath, 15.10, parapetPath, 15.10, M.concrete, () => [0, 1, 0]);
  ringStrip(b, parapetPath, 15.10, parapetPath, 15.45, M.railGlass, (m) => [-m.x, 0, -m.z]);
  ringStrip(b, offsetPath(parapetPath, -0.10), 15.45, offsetPath(parapetPath, 0.10), 15.45, M.rail, () => [0, 1, 0]);

  const upperGaps = Array.from({ length: 12 }, (_, i) => {
    const center = Math.PI / 4 + i * (Math.PI / 6);
    return [center - 0.018, center + 0.018];
  });
  const upperSteps = stairBowl(b, {
    path: fasciaPath,
    y: 15.10,
    rows: 13,
    tread: 0.85,
    riser: 0.55,
    seatMat: M.tier,
    riserMat: M.tier,
    gaps: upperGaps,
    gapMat: M.stairs,
    uvRepeat: 48,
  });
  let seatPath = fasciaPath;
  let seatY = 15.10;
  for (let row = 0; row < 13; row++) {
    const seatBase = offsetPath(seatPath, 0.25);
    const seatTop = offsetPath(seatPath, 0.33);
    for (let i = 0; i < seatPath.length; i++) {
      const j = (i + 1) % seatPath.length;
      const midX = (seatPath[i].x + seatPath[j].x) * 0.5;
      const midZ = (seatPath[i].z + seatPath[j].z) * 0.5;
      if (inGaps(upperGaps, Math.atan2(midZ, midX))) continue;
      const u0 = (seatPath[i].s ?? i) / 0.52;
      const u1 = (j === 0 ? seatPath.totalLen : (seatPath[j].s ?? j)) / 0.52;
      const bottomY = seatY + 0.58;
      b.quad(
        [seatBase[i].x, bottomY, seatBase[i].z],
        [seatBase[j].x, bottomY, seatBase[j].z],
        [seatTop[j].x, bottomY + 0.50, seatTop[j].z],
        [seatTop[i].x, bottomY + 0.50, seatTop[i].z],
        M.upperSeatRow,
        [-midX, 0, -midZ],
        [[u0, 1], [u1, 1], [u1, 0], [u0, 0]]
      );
    }
    seatPath = offsetPath(seatPath, 0.85);
    seatY += 0.55;
  }

  const backWallPath = offsetPath(upperSteps.path, 0.65);
  ringStrip(b, backWallPath, upperSteps.y, backWallPath, upperSteps.y + 0.85, M.dark, (m) => [-m.x, 0, -m.z]);
  ringStrip(b, backWallPath, upperSteps.y + 0.85, backWallPath, roofY, M.creamWall, (m) => [-m.x, 0, -m.z]);
  for (let i = 0; i < 20; i++) {
    const p = backWallPath[Math.floor(i * backWallPath.length / 20)];
    b.panel(p.x - p.nx * 0.03, 23.65, p.z - p.nz * 0.03, 0.24, 0.40, -p.nx, -p.nz, M.sconceGlow);
  }

  const roofOuter = roundedRectPath(54, 77, 43, 14, 22, 16);
  flatDisc(b, roofOuter, roofY + 2.4, M.roofDeck, true);
  flatDisc(b, roofOuter, roofY + 2.6, M.roofDeck, false);
  ringStrip(b, roofOuter, roofY - 0.1, roofOuter, roofY + 2.6, M.dark, (m) => [-m.x, 0, -m.z]);

  const roofCenterX = 54 - 43;
  const roofCornerZ = 77 - 43;
  const halfSpanAt = (z) => {
    const dz = Math.max(0, Math.abs(z) - roofCornerZ);
    return dz === 0 ? 54 : roofCenterX + Math.sqrt(Math.max(0, 43 * 43 - dz * dz));
  };
  const trussZs = [-67, -54, -41, -28, -15, 0, 15, 28, 41, 54, 67];
  const purlinXs = Array.from({ length: 21 }, (_, i) => (i - 10) * 5);
  for (const tz of trussZs) {
    const halfSpan = halfSpanAt(tz);
    const segs = 16;
    const topPts = [], botPts = [];
    for (let i = 0; i <= segs; i++) {
      const u = (i / segs) * 2 - 1;
      const x = u * halfSpan;
      const arch = (1 - u * u) * 1.9;
      topPts.push([x, roofY + 2.2, tz]);
      botPts.push([x, roofY - 0.5 + arch, tz]);
    }
    for (let i = 0; i < segs; i++) {
      b.beam(topPts[i], topPts[i + 1], 0.34, M.trussWhite);
      b.beam(botPts[i], botPts[i + 1], 0.36, M.trussWhite);
      b.beam(botPts[i], topPts[i], 0.22, M.trussWhite);
      b.beam(botPts[i], topPts[i + 1], 0.20, M.trussWhite);
    }
    b.beam(botPts[segs], topPts[segs], 0.22, M.trussWhite);

    for (const lx of purlinXs) {
      if (Math.abs(lx) > halfSpan - 0.7) continue;
      const u = lx / halfSpan;
      const ly = roofY - 0.5 + (1 - u * u) * 1.9;
      b.box(lx, ly - 0.17, tz, 1.05, 0.28, 0.72, M.speakerBlack);
      b.box(lx, ly - 0.34, tz, 1.0, 0.06, 0.60, M.lampGlow);
    }
  }

  for (const px of purlinXs) {
    const dx = Math.max(0, Math.abs(px) - roofCenterX);
    const endZ = roofCornerZ + Math.sqrt(Math.max(0, 43 * 43 - dx * dx));
    b.box(px, roofY + 2.05, 0, 0.22, 0.22, endZ * 2, M.trussWhite);
  }
  for (const cx of [-12, 12]) {
    b.box(cx, roofY - 0.05, 0, 1.3, 0.14, 60, M.trussWhite);
    b.box(cx - 0.6, roofY + 0.45, 0, 0.08, 0.85, 60, M.trussWhite);
    b.box(cx + 0.6, roofY + 0.45, 0, 0.08, 0.85, 60, M.trussWhite);
  }

  const bannerAnchorX = (x) => {
    for (let distance = 0; distance <= 2; distance += 0.05) {
      for (const direction of [1, -1]) {
        const candidate = x + direction * distance;
        if (purlinXs.every((px) => Math.abs(candidate - px) >= 0.8)) return candidate;
      }
    }
    return x;
  };

  for (let i = 0; i < 7; i++) {
    const bx = (i - 3) * 3.1;
    const bz = 24;
    const banW = 2.6, banH = 5.4, topY = 23;
    const index = i, col = index % 8, row = Math.floor(index / 8);
    for (const dx of [-0.85, 0.85]) {
      const hx = bx + dx;
      b.beam([bannerAnchorX(hx), roofY + 2.2, 28], [hx, topY, bz], 0.05, M.trussWhite);
    }
    b.panel(bx, topY - banH / 2, bz, banW, banH, 0, -1, M.bannerAtlas, col / 8, row / 3, (col + 1) / 8, (row + 1) / 3);
    b.panel(bx, topY - banH / 2, bz + 0.015, banW, banH, 0, 1, M.bannerAtlas, col / 8, row / 3, (col + 1) / 8, (row + 1) / 3);
  }
  for (let i = 0; i < 14; i++) {
    const bx = (i - 6.5) * 2.9;
    const bz = 45;
    const banW = 2.6, banH = 5.4, topY = 23;
    const index = 7 + i, col = index % 8, row = Math.floor(index / 8);
    for (const dx of [-0.85, 0.85]) {
      const hx = bx + dx;
      b.beam([bannerAnchorX(hx), roofY + 2.2, 41], [hx, topY, bz], 0.05, M.trussWhite);
    }
    b.panel(bx, topY - banH / 2, bz, banW, banH, 0, -1, M.bannerAtlas, col / 8, row / 3, (col + 1) / 8, (row + 1) / 3);
    b.panel(bx, topY - banH / 2, bz + 0.015, banW, banH, 0, 1, M.bannerAtlas, col / 8, row / 3, (col + 1) / 8, (row + 1) / 3);
  }

  buildBoxBoard(b, M, roofY);

  const lights = [
    { name: 'BowlFill_Center', type: 'point', pos: [0, 10.9, 0], color: [1, 0.95, 0.86], intensity: 35, range: 48 },
    { name: 'BowlFill_North', type: 'point', pos: [0, 19.5, 26], color: [1, 0.95, 0.86], intensity: 28, range: 55 },
    { name: 'BowlFill_South', type: 'point', pos: [0, 19.5, -26], color: [1, 0.95, 0.86], intensity: 28, range: 55 },
    { name: 'WarmBowl_East', type: 'point', pos: [32, 14.5, 0], color: [1.0, 0.84, 0.58], intensity: 24, range: 55 },
    { name: 'WarmBowl_West', type: 'point', pos: [-32, 14.5, 0], color: [1.0, 0.84, 0.58], intensity: 24, range: 55 },
  ];

  const filteredSpectators = bowlMeta.spectators.filter(
    (s) => !(s.x < -24.0 && s.y < 2.55 && Math.abs(s.z) < 8.28)
  );
  const allPrims = [...importedPrims, ...b.toPrims(mats)];
  return { materials: mats, prims: allPrims, textures, spectators: filteredSpectators, lights };
}
