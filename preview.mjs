import { writeFileSync, copyFileSync } from 'fs';
import { buildArena } from './src/arena.js';
import { encodePNG } from './src/textures.js';

const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const normv = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };

const arenaData = buildArena();

function sampleTex(tex, u, v) {
  let uu = tex.clamp ? Math.min(0.9999, Math.max(0, u)) : ((u % 1) + 1) % 1;
  let vv = tex.clamp ? Math.min(0.9999, Math.max(0, v)) : ((v % 1) + 1) % 1;
  const x = Math.min(tex.w - 1, Math.floor(uu * tex.w));
  const y = Math.min(tex.h - 1, Math.floor(vv * tex.h));
  const o = (y * tex.w + x) * 4;
  return [tex.rgba[o], tex.rgba[o + 1], tex.rgba[o + 2], tex.rgba[o + 3]];
}

function render(path, { eye, look, up = [0, 1, 0], fov = 62, w = 1280, h = 720, bg = [10, 14, 12], drawRink = true }) {
  const { materials, prims, textures } = arenaData;
  const f = normv(sub(look, eye));
  const r = normv(cross(f, up));
  const u = cross(r, f);
  const fl = (h / 2) / Math.tan((fov * Math.PI) / 360);
  const L = normv([0.35, 0.92, 0.28]);

  const fb = Buffer.alloc(w * h * 4);
  for (let i = 0; i < w * h; i++) fb.set([...bg, 255], i * 4);
  const zbuf = new Float32Array(w * h).fill(Infinity);

  // Add a reference ice sheet in preview so we see the rink + center logo together
  const allPrims = [...prims];
  const allMats = [...materials];
  if (drawRink) {
    const iceMatIdx = allMats.length;
    allMats.push({
      baseColor: [0.68, 0.84, 0.76, 1],
      emissive: null,
      unlit: false,
      doubleSided: true,
      texture: null,
      emissiveTexture: null,
      name: '_refIce',
    });
    const icePos = [], iceNorm = [], iceUv = [], iceIdx = [];
    const nx = 6, nz = 12;
    for (let iz = 0; iz < nz; iz++) {
      for (let ix = 0; ix < nx; ix++) {
        const x0 = -22.5 + (45 * ix) / nx, x1 = -22.5 + (45 * (ix + 1)) / nx;
        const z0 = -45.75 + (91.5 * iz) / nz, z1 = -45.75 + (91.5 * (iz + 1)) / nz;
        const b0 = icePos.length / 3;
        icePos.push(x0, 0, z0, x1, 0, z0, x1, 0, z1, x0, 0, z1);
        iceNorm.push(0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0);
        iceUv.push(0, 0, 1, 0, 1, 1, 0, 1);
        iceIdx.push(b0, b0 + 2, b0 + 1, b0, b0 + 3, b0 + 2);
      }
    }
    allPrims.push({
      positions: icePos,
      normals: iceNorm,
      uvs: iceUv,
      indices: iceIdx,
      material: iceMatIdx,
    });
  }

  const tris = [];
  for (const p of allPrims) {
    const mat = allMats[p.material];
    for (let i = 0; i < p.indices.length; i += 3) {
      const pts = [];
      let depth = 0, ok = true;
      for (let k = 0; k < 3; k++) {
        const vi = p.indices[i + k] * 3;
        const v = [p.positions[vi] - eye[0], p.positions[vi + 1] - eye[1], p.positions[vi + 2] - eye[2]];
        const z = dot(v, f);
        if (z < 0.4) { ok = false; break; }
        const x = dot(v, r), y = dot(v, u);
        pts.push([(x / z) * fl + w / 2, h / 2 - (y / z) * fl, z]);
        depth += z;
      }
      if (!ok) continue;
      const idx0 = p.indices[i], idx1 = p.indices[i + 1], idx2 = p.indices[i + 2];
      tris.push({
        pts,
        depth: depth / 3,
        mat,
        i0: idx0 * 3, i1: idx1 * 3, i2: idx2 * 3,
        uv0: [p.uvs[idx0 * 2], p.uvs[idx0 * 2 + 1]],
        uv1: [p.uvs[idx1 * 2], p.uvs[idx1 * 2 + 1]],
        uv2: [p.uvs[idx2 * 2], p.uvs[idx2 * 2 + 1]],
        pos: p.positions,
      });
    }
  }
  tris.sort((a, b) => b.depth - a.depth);

  const lin2srgb = (v) => Math.round(Math.min(1, Math.max(0, Math.pow(v, 1 / 2.2))) * 255);
  for (const t of tris) {
    const [a, b2, c] = t.pts;
    const e1 = sub(t.pos.slice(t.i1, t.i1 + 3), t.pos.slice(t.i0, t.i0 + 3));
    const e2 = sub(t.pos.slice(t.i2, t.i2 + 3), t.pos.slice(t.i0, t.i0 + 3));
    const n = normv(cross(e1, e2));
    if (!t.mat.doubleSided) {
      const vp = sub(t.pos.slice(t.i0, t.i0 + 3), eye);
      if (dot(n, vp) >= 0) continue;
    }

    const isSelfLit = Boolean(t.mat.emissive || t.mat.emissiveTexture !== null);
    const shade = isSelfLit ? 1.0 : (0.42 + 0.58 * Math.abs(dot(n, L)));
    const tex = t.mat.texture !== null && t.mat.texture !== undefined ? textures[t.mat.texture] : null;
    const c_ = t.mat.baseColor;
    let flatR = 0, flatG = 0, flatB = 0, flatA = c_[3];
    if (!tex) {
      if (t.mat.emissive) {
        flatR = lin2srgb(t.mat.emissive[0]);
        flatG = lin2srgb(t.mat.emissive[1]);
        flatB = lin2srgb(t.mat.emissive[2]);
      } else {
        flatR = lin2srgb(c_[0] * shade);
        flatG = lin2srgb(c_[1] * shade);
        flatB = lin2srgb(c_[2] * shade);
      }
    }

    const minX = Math.max(0, Math.floor(Math.min(a[0], b2[0], c[0])));
    const maxX = Math.min(w - 1, Math.ceil(Math.max(a[0], b2[0], c[0])));
    const minY = Math.max(0, Math.floor(Math.min(a[1], b2[1], c[1])));
    const maxY = Math.min(h - 1, Math.ceil(Math.max(a[1], b2[1], c[1])));
    const d = (b2[0] - a[0]) * (c[1] - a[1]) - (b2[1] - a[1]) * (c[0] - a[0]);
    if (Math.abs(d) < 1e-9) continue;
    const invZ0 = 1 / a[2], invZ1 = 1 / b2[2], invZ2 = 1 / c[2];

    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const w0 = ((b2[0] - x) * (c[1] - y) - (b2[1] - y) * (c[0] - x)) / d;
        const w1 = ((c[0] - x) * (a[1] - y) - (c[1] - y) * (a[0] - x)) / d;
        const w2 = 1 - w0 - w1;
        if (w0 < 0 || w1 < 0 || w2 < 0) continue;
        const invZ = w0 * invZ0 + w1 * invZ1 + w2 * invZ2;
        const zi = 1 / invZ;
        const bi = y * w + x;
        if (zi >= zbuf[bi]) continue;

        let R = flatR, G = flatG, B = flatB, alpha = flatA;
        if (tex) {
          const p0 = w0 * invZ0, p1 = w1 * invZ1, p2 = w2 * invZ2;
          const u = (p0 * t.uv0[0] + p1 * t.uv1[0] + p2 * t.uv2[0]) * zi;
          const v = (p0 * t.uv0[1] + p1 * t.uv1[1] + p2 * t.uv2[1]) * zi;
          const [tr, tg, tb, ta] = sampleTex(tex, u, v);
          alpha = (ta / 255) * c_[3];
          if (alpha < 0.04) continue;
          const s = isSelfLit ? 1.0 : (0.62 + 0.38 * Math.abs(dot(n, L)));
          R = Math.min(255, Math.round(tr * s));
          G = Math.min(255, Math.round(tg * s));
          B = Math.min(255, Math.round(tb * s));
        }

        if (alpha >= 0.98) zbuf[bi] = zi;
        const o = bi * 4;
        if (alpha >= 0.98) {
          fb[o] = R; fb[o + 1] = G; fb[o + 2] = B; fb[o + 3] = 255;
        } else {
          fb[o] = Math.round(fb[o] * (1 - alpha) + R * alpha);
          fb[o + 1] = Math.round(fb[o + 1] * (1 - alpha) + G * alpha);
          fb[o + 2] = Math.round(fb[o + 2] * (1 - alpha) + B * alpha);
        }
      }
    }
  }

  writeFileSync(path, encodePNG(w, h, fb));
  console.log(`wrote ${path}`);
}

// Camera 1: Photo 1 angle (corner lower bowl looking across center ice & cylindrical scoreboard toward end video board)
render('preview_bowl.png', { eye: [24, 9.5, -36], look: [-4, 11.5, 10], fov: 64 });
// Camera 2: Center ice looking toward the North end (+Z) and scoreboard
render('preview_ice.png', { eye: [0, 3.2, -26], look: [0, 12.5, 30], fov: 68 });
copyFileSync('preview_bowl.png', 'dist/preview.png');
copyFileSync('preview_bowl.png', 'dist/Ralph Engelstad Arena/preview.png');
