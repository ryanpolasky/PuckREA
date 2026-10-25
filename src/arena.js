import { readFileSync } from 'fs';
import { Builder, roundedRectPath, offsetPath, ringStrip, flatDisc } from './geom.js';
import { makeMaterial } from './gltf.js';
import { buildTextures } from './textures.js';

const lin = (c) => {
  const f = (v) => Math.pow((v / 255 + 0.055) / 1.055, 2.4);
  return [f(c[0]), f(c[1]), f(c[2]), c.length > 3 ? c[3] / 255 : 1];
};

function cylRing(b, y0, y1, r0, r1, segs, mat, outward = true, uvRepeat = 1) {
  for (let i = 0; i < segs; i++) {
    const a0 = (i / segs) * Math.PI * 2;
    const a1 = ((i + 1) / segs) * Math.PI * 2;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    const xm = (c0 + c1) / 2, zm = (s0 + s1) / 2;
    const hn = outward ? [xm, 0, zm] : [-xm, 0, -zm];
    const u0 = (1 - i / segs) * uvRepeat;
    const u1 = (1 - (i + 1) / segs) * uvRepeat;
    b.quad(
      [c0 * r0, y0, s0 * r0],
      [c1 * r0, y0, s1 * r0],
      [c1 * r1, y1, s1 * r1],
      [c0 * r1, y1, s0 * r1],
      mat,
      hn,
      outward ? [[u0, 1], [u1, 1], [u1, 0], [u0, 0]] : [[u1, 1], [u0, 1], [u0, 0], [u1, 0]]
    );
  }
}

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

function cylArcScreen(b, y0, y1, r, centerAngle, arcSpan, segs, mat) {
  const aStart = centerAngle + arcSpan / 2;
  const aEnd = centerAngle - arcSpan / 2;
  for (let i = 0; i < segs; i++) {
    const t0 = i / segs, t1 = (i + 1) / segs;
    const a0 = aStart + (aEnd - aStart) * t0;
    const a1 = aStart + (aEnd - aStart) * t1;
    const c0 = Math.cos(a0), s0 = Math.sin(a0);
    const c1 = Math.cos(a1), s1 = Math.sin(a1);
    b.quad(
      [c0 * r, y0, s0 * r],
      [c1 * r, y0, s1 * r],
      [c1 * r, y1, s1 * r],
      [c0 * r, y1, s0 * r],
      mat,
      [(c0 + c1) / 2, 0, (s0 + s1) / 2],
      [[t0, 1], [t1, 1], [t1, 0], [t0, 0]]
    );
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
    seatFrame: makeMaterial({ color: lin([28, 32, 30]), roughness: 0.55, metallic: 0.35, doubleSided: true, name: 'seatFrame' }),
    stairs: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('stairs_rea'),
      roughness: 0.65,
      doubleSided: true,
      name: 'stairs',
    }),
    tier: makeMaterial({ color: lin([162, 148, 126]), roughness: 0.78, doubleSided: true, name: 'tier' }),
    concrete: makeMaterial({ color: lin([176, 162, 140]), roughness: 0.78, doubleSided: true, name: 'concrete' }),
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
      color: [1, 1, 1, 1],
      texture: texIdx('wall_brick'),
      emissiveTexture: texIdx('wall_brick'),
      emissive: [0.38, 0.34, 0.28],
      roughness: 0.72,
      doubleSided: true,
      name: 'creamWall',
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
    sbHeader: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('scoreboard_header'),
      emissiveTexture: texIdx('scoreboard_header'),
      emissive: [1.3, 1.3, 1.3],
      roughness: 0.3,
      doubleSided: true,
      name: 'sbHeader',
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
    endVideo: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('end_video'),
      emissiveTexture: texIdx('end_video'),
      emissive: [1.2, 1.2, 1.2],
      roughness: 0.3,
      doubleSided: true,
      name: 'endVideo',
    }),
    bannerChamp: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('banner_champ'),
      emissiveTexture: texIdx('banner_champ'),
      emissive: [0.45, 0.45, 0.45],
      roughness: 0.5,
      doubleSided: true,
      name: 'bannerChamp',
    }),
    trussWhite: makeMaterial({ color: lin([210, 216, 222]), roughness: 0.55, metallic: 0.25, name: 'trussWhite' }),
    roofDeck: makeMaterial({ color: lin([148, 156, 164]), roughness: 0.75, doubleSided: true, name: 'roofDeck' }),
    speakerBlack: makeMaterial({ color: lin([14, 16, 18]), roughness: 0.6, doubleSided: true, name: 'speakerBlack' }),
    greenGlow: makeMaterial({
      color: lin([20, 255, 110]),
      emissive: lin([0, 240, 100]).slice(0, 3),
      roughness: 0.2,
      name: 'greenGlow',
    }),
  };
  const mats = Object.values(M);
  const b = new Builder();
  const deg = Math.PI / 180;

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
    WallWin: M.creamWall,
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
    if (pm.mat === 'Net' || pm.mat === 'RedPaint') continue;
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
    // Flip WallWin U horizontally so the Fighting Sioux head in every brick square looks LEFT!
    if (pm.mat === 'WallWin') {
      for (let i = 0; i < uv.length; i += 2) uv[i] = 38.0 - uv[i];
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

    // Clone Fascia_Ribbon (+7.65m up) to create the upper 360-degree electric LED banner right at the top of the wall!
    if (pm.mat === 'Ribbon1') {
      const upPos = new Array(pos.length);
      for (let i = 0; i < pos.length; i += 3) {
        const vx = pos[i], vy = pos[i + 1], vz = pos[i + 2];
        const l = Math.hypot(vx, vz) || 1;
        upPos[i] = vx - (vx / l) * 0.04;
        upPos[i + 1] = vy + 7.65;
        upPos[i + 2] = vz - (vz / l) * 0.04;
      }
      importedPrims.push({
        positions: upPos,
        normals: [...norm],
        uvs: [...uv],
        indices: [...idx],
        material: mats.indexOf(M.ledRibbon),
      });
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

  // 3. ARCHED WHITE STEEL ROOF TRUSSES + CEILING + CATWALKS + GREEN FLOODLIGHTS (seated on the y=22.05m wall)
  const roofY = 22.05;
  const roofOuter = roundedRectPath(42.2, 65.4, 24.0, 10, 16, 10);
  flatDisc(b, roofOuter, roofY + 2.4, M.roofDeck, true);
  flatDisc(b, roofOuter, roofY + 2.6, M.roofDeck, false);
  ringStrip(b, roofOuter, roofY - 0.1, roofOuter, roofY + 2.6, M.dark, (m) => [-m.x, 0, -m.z]);

  const trussZs = [-50, -37.5, -25, -12.5, 0, 12.5, 25, 37.5, 50];
  for (const tz of trussZs) {
    const halfSpan = Math.abs(tz) > 40 ? 35 : 41.2;
    const segs = 12;
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

    if (Math.abs(tz) <= 38) {
      const lightXs = Math.abs(tz) > 30 ? [-20, -10, 10, 20] : [-18, -8, 8, 18];
      for (const lx of lightXs) {
        const u = lx / halfSpan;
        const ly = roofY - 0.6 + (1 - u * u) * 1.9;
        b.box(lx, ly, tz, 0.85, 0.32, 0.65, M.speakerBlack);
        b.box(lx, ly - 0.18, tz, 0.72, 0.08, 0.52, M.greenGlow);
      }
    }
  }

  for (const px of [-28, -16, -7.5, 7.5, 16, 28]) {
    b.box(px, roofY + 1.15, 0, 0.30, 0.30, 104, M.trussWhite);
  }
  for (const cx of [-12.0, 12.0]) {
    b.box(cx, roofY - 0.05, 0, 1.3, 0.14, 100, M.trussWhite);
    b.box(cx - 0.6, roofY + 0.45, 0, 0.08, 0.85, 100, M.trussWhite);
    b.box(cx + 0.6, roofY + 0.45, 0, 0.08, 0.85, 100, M.trussWhite);
  }

  // 4. END-ZONE FIGHTING SIOUX VIDEO BOARDS (no extra wall banners on the far walls)
  for (const sz of [-1, 1]) {
    const ez = sz * 64.2;
    const ey = 17.6;
    b.box(0, ey, ez, 13.8, 4.4, 0.45, M.speakerBlack);
    b.panel(0, ey, ez - sz * 0.28, 13.2, 4.0, 0, -sz, M.endVideo);
  }

  // Hanging rafter championship banners: one clean row over each end on the z = +-37.5 steel trusses, strictly inside x = [-6.8..+6.8] (clears catwalks at +-12, purlins at +-7.5, and lights at +-10!)
  for (const bz of [-37.5, 37.5]) {
    const sz = Math.sign(bz);
    const halfSpan = 41.2;
    const xs = [-5.7, -3.4, -1.1, 1.1, 3.4, 5.7];
    for (const bx of xs) {
      const u = bx / halfSpan;
      const chordY = roofY - 0.5 + (1 - u * u) * 1.9;
      const banH = 3.8, banW = 1.85;
      const topY = chordY - 0.55;
      const cy = topY - banH / 2;
      b.box(bx, topY + 0.04, bz, banW + 0.14, 0.07, 0.07, M.trussWhite);
      b.box(bx - banW * 0.42, (chordY + topY) / 2, bz, 0.05, chordY - topY + 0.12, 0.05, M.trussWhite);
      b.box(bx + banW * 0.42, (chordY + topY) / 2, bz, 0.05, chordY - topY + 0.12, 0.05, M.trussWhite);
      b.panel(bx, cy, bz, banW, banH, 0, -sz, M.bannerChamp);
    }
  }

  // 5. CENTER-HUNG CYLINDRICAL JUMBOTRON (#45 RYAN POLASKY SPOTLIGHT)
  const sbSegs = 32;
  const sbR = 6.85;
  // Top glowing green marquee ring: "RALPH ENGELSTAD ARENA"
  cylRing(b, 17.15, 17.95, sbR, sbR, sbSegs, M.sbHeader, true, 4);
  // Upper full-color electric LED ad ring (uvRepeat=1 on 4096x128 32:1 texture = 43m / 1.05m -> exact 1:1 aspect ratio!)
  cylRing(b, 16.10, 17.15, sbR, sbR, sbSegs, M.ledRibbon, true, 1);
  // Middle band (y = 12.55 .. 16.10): 4 curved 78-deg Ryan Polasky screens + 4 curved 12-deg dark corner struts
  for (const ang of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    cylArcScreen(b, 12.55, 16.10, sbR, ang, 78 * deg, 8, M.sbMain);
    cylArcScreen(b, 12.55, 16.10, sbR, ang + Math.PI / 4, 12 * deg, 2, M.speakerBlack);
  }
  // Lower full-color electric LED ad ring (uvRepeat=1 on 4096x128 32:1 texture!)
  cylRing(b, 11.50, 12.55, sbR, sbR, sbSegs, M.ledRibbon, true, 1);
  iceDisc(b, 0, 0, 17.95, sbR, sbSegs, M.speakerBlack, false);
  iceDisc(b, 0, 0, 11.50, sbR, sbSegs, M.speakerBlack, true);
  cylRing(b, 11.32, 11.50, 5.6, 6.7, sbSegs, M.greenGlow, true, 1);

  for (const [hx, hz] of [[-3.6, -3.6], [3.6, -3.6], [-3.6, 3.6], [3.6, 3.6]]) {
    b.box(hx, (roofY + 17.95) / 2, hz, 0.20, roofY - 17.95, 0.20, M.speakerBlack);
  }
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 8;
    const sx = Math.cos(a) * 9.0, sz = Math.sin(a) * 9.0;
    b.box(sx, 18.8, sz, 0.72, 2.1, 0.90, M.speakerBlack, 0, -a, 0.18);
    b.box(sx, (roofY + 19.8) / 2, sz, 0.12, roofY - 19.8, 0.12, M.speakerBlack);
  }

  const lights = [
    { name: 'GreenSpill_Center', type: 'point', pos: [0, 10.9, 0], color: [0.05, 0.95, 0.42], intensity: 35, range: 48 },
    { name: 'GreenSpill_North', type: 'point', pos: [0, 19.5, 26], color: [0.08, 0.9, 0.4], intensity: 28, range: 55 },
    { name: 'GreenSpill_South', type: 'point', pos: [0, 19.5, -26], color: [0.08, 0.9, 0.4], intensity: 28, range: 55 },
    { name: 'WarmBowl_East', type: 'point', pos: [32, 14.5, 0], color: [1.0, 0.84, 0.58], intensity: 24, range: 55 },
    { name: 'WarmBowl_West', type: 'point', pos: [-32, 14.5, 0], color: [1.0, 0.84, 0.58], intensity: 24, range: 55 },
  ];

  const filteredSpectators = bowlMeta.spectators.filter(
    (s) => !(s.x < -24.0 && s.y < 2.55 && Math.abs(s.z) < 8.28)
  );
  const allPrims = [...importedPrims, ...b.toPrims(mats)];
  return { materials: mats, prims: allPrims, textures, spectators: filteredSpectators, lights };
}
