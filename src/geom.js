const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };

export class Builder {
  constructor() { this.parts = new Map(); }

  _part(mat) {
    if (!this.parts.has(mat)) this.parts.set(mat, { pos: [], norm: [], uv: [], idx: [], n: 0 });
    return this.parts.get(mat);
  }

  quad(a, b, c, d, mat, hint, uvs) {
    let n = norm(cross(sub(b, a), sub(d, a)));
    let va = a, vb = b, vc = c, vd = d;
    let ua = uvs ? uvs[0] : [0, 1];
    let ub = uvs ? uvs[1] : [1, 1];
    let uc = uvs ? uvs[2] : [1, 0];
    let ud = uvs ? uvs[3] : [0, 0];
    if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      vb = d; vd = b;
      ub = uvs ? uvs[3] : [0, 0];
      ud = uvs ? uvs[1] : [1, 1];
      n = [-n[0], -n[1], -n[2]];
    }
    const p = this._part(mat);
    p.pos.push(...va, ...vb, ...vc, ...vd);
    for (let i = 0; i < 4; i++) p.norm.push(...n);
    p.uv.push(...ua, ...ub, ...uc, ...ud);
    const b0 = p.n;
    p.idx.push(b0, b0 + 1, b0 + 2, b0, b0 + 2, b0 + 3);
    p.n += 4;
  }

  // Upright quad facing along normal (nx, 0, nz), with U going left->right when viewed from the front in Unity
  panel(cx, cy, cz, w, h, nx, nz, mat, u0 = 0, v0 = 0, u1 = 1, v1 = 1) {
    const l = Math.hypot(nx, nz) || 1;
    const fnx = nx / l, fnz = nz / l;
    const rx = fnz * (w / 2), rz = -fnx * (w / 2);
    const hh = h / 2;
    const bl = [cx - rx, cy - hh, cz - rz];
    const br = [cx + rx, cy - hh, cz + rz];
    const tr = [cx + rx, cy + hh, cz + rz];
    const tl = [cx - rx, cy + hh, cz - rz];
    this.quad(bl, br, tr, tl, mat, [fnx, 0, fnz], [[u0, v1], [u1, v1], [u1, v0], [u0, v0]]);
  }

  tri(a, b, c, mat, hint, uvs) {
    let n = norm(cross(sub(b, a), sub(c, a)));
    let va = a, vb = b, vc = c;
    let ua = uvs ? uvs[0] : [0, 0];
    let ub = uvs ? uvs[1] : [1, 0];
    let uc = uvs ? uvs[2] : [0.5, 1];
    if (hint && n[0] * hint[0] + n[1] * hint[1] + n[2] * hint[2] < 0) {
      vb = c; vc = b;
      const t = ub; ub = uc; uc = t;
      n = [-n[0], -n[1], -n[2]];
    }
    const p = this._part(mat);
    p.pos.push(...va, ...vb, ...vc);
    for (let i = 0; i < 3; i++) p.norm.push(...n);
    p.uv.push(...ua, ...ub, ...uc);
    const b0 = p.n;
    p.idx.push(b0, b0 + 1, b0 + 2);
    p.n += 3;
  }

  box(cx, cy, cz, w, h, d, mat, rotX = 0, rotY = 0, rotZ = 0) {
    const hw = w / 2, hh = h / 2, hd = d / 2;
    const P = {};
    for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1])
      P[`${sx},${sy},${sz}`] = [cx + sx * hw, cy + sy * hh, cz + sz * hd];
    const rot = (pt) => {
      let [x, y, z] = [pt[0] - cx, pt[1] - cy, pt[2] - cz];
      if (rotZ) { const c = Math.cos(rotZ), s = Math.sin(rotZ); [x, y] = [x * c - y * s, x * s + y * c]; }
      if (rotX) { const c = Math.cos(rotX), s = Math.sin(rotX); [y, z] = [y * c - z * s, y * s + z * c]; }
      if (rotY) { const c = Math.cos(rotY), s = Math.sin(rotY); [x, z] = [x * c - z * s, x * s + z * c]; }
      return [cx + x, cy + y, cz + z];
    };
    const rDir = (v) => {
      const p = rot([cx + v[0], cy + v[1], cz + v[2]]);
      return [p[0] - cx, p[1] - cy, p[2] - cz];
    };
    const q = (k1, k2, k3, k4, hintDir) =>
      this.quad(rot(P[k1]), rot(P[k2]), rot(P[k3]), rot(P[k4]), mat, rDir(hintDir));
    q('-1,-1,-1', '-1,-1,1', '-1,1,1', '-1,1,-1', [-1, 0, 0]);
    q('1,-1,1', '1,-1,-1', '1,1,-1', '1,1,1', [1, 0, 0]);
    q('-1,-1,-1', '1,-1,-1', '1,-1,1', '-1,-1,1', [0, -1, 0]);
    q('-1,1,1', '1,1,1', '1,1,-1', '-1,1,-1', [0, 1, 0]);
    q('-1,-1,-1', '-1,1,-1', '1,1,-1', '1,-1,-1', [0, 0, -1]);
    q('-1,-1,1', '1,-1,1', '1,1,1', '-1,1,1', [0, 0, 1]);
  }

  beam(p0, p1, thickness, mat) {
    const dx = p1[0] - p0[0], dy = p1[1] - p0[1], dz = p1[2] - p0[2];
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-4) return;
    const f = [dx / len, dy / len, dz / len];
    const up = Math.abs(f[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const r = norm(cross(f, up));
    const u = norm(cross(r, f));
    const h = thickness / 2;
    const corners = (p) => [
      [p[0] - r[0] * h - u[0] * h, p[1] - r[1] * h - u[1] * h, p[2] - r[2] * h - u[2] * h],
      [p[0] + r[0] * h - u[0] * h, p[1] + r[1] * h - u[1] * h, p[2] + r[2] * h - u[2] * h],
      [p[0] + r[0] * h + u[0] * h, p[1] + r[1] * h + u[1] * h, p[2] + r[2] * h + u[2] * h],
      [p[0] - r[0] * h + u[0] * h, p[1] - r[1] * h + u[1] * h, p[2] - r[2] * h + u[2] * h],
    ];
    const A = corners(p0), B = corners(p1);
    const dirs = [[0, -1], [1, 0], [0, 1], [-1, 0]];
    for (let i = 0; i < 4; i++) {
      const j = (i + 1) % 4;
      const [dr, du] = dirs[i];
      const hn = [r[0] * dr + u[0] * du, r[1] * dr + u[1] * du, r[2] * dr + u[2] * du];
      this.quad(A[i], A[j], B[j], B[i], mat, hn);
    }
  }

  toPrims(materials) {
    const out = [];
    for (const [mat, p] of this.parts)
      out.push({ positions: p.pos, normals: p.norm, uvs: p.uv, indices: p.idx, material: materials.indexOf(mat) });
    return out;
  }
}

export function roundedRectPath(hx, hz, r, straightSegsX = 8, straightSegsZ = 14, cornerSegs = 10) {
  const pts = [];
  const push = (x, z, nx, nz) => pts.push({ x, z, nx, nz });
  const lin = (x0, z0, x1, z1, nx, nz, segs) => {
    for (let i = 0; i <= segs; i++) {
      const t = i / segs;
      if (pts.length && i === 0) continue;
      push(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, nx, nz);
    }
  };
  const arc = (cx, cz, a0, a1, segs) => {
    for (let i = 0; i <= segs; i++) {
      const a = a0 + (a1 - a0) * (i / segs);
      const nx = Math.cos(a), nz = Math.sin(a);
      if (pts.length && i === 0) { pts[pts.length - 1] = { x: cx + nx * r, z: cz + nz * r, nx, nz }; continue; }
      push(cx + nx * r, cz + nz * r, nx, nz);
    }
  };
  const cxp = hx - r, czp = hz - r;
  const halfZ = Math.max(1, Math.round(straightSegsZ / 2));
  lin(hx, 0, hx, czp, 1, 0, halfZ);
  arc(cxp, czp, 0, Math.PI / 2, cornerSegs);
  lin(cxp, hz, -cxp, hz, 0, 1, straightSegsX);
  arc(-cxp, czp, Math.PI / 2, Math.PI, cornerSegs);
  lin(-hx, czp, -hx, -czp, -1, 0, straightSegsZ);
  arc(-cxp, -czp, Math.PI, Math.PI * 1.5, cornerSegs);
  lin(-cxp, -hz, cxp, -hz, 0, -1, straightSegsX);
  arc(cxp, -czp, Math.PI * 1.5, Math.PI * 2, cornerSegs);
  lin(hx, -czp, hx, 0, 1, 0, halfZ);
  if (pts.length > 1 && Math.hypot(pts[0].x - pts[pts.length - 1].x, pts[0].z - pts[pts.length - 1].z) < 1e-4) {
    pts.pop();
  }
  // Precompute cumulative arc length for clean UV wrapping
  let s = 0;
  for (let i = 0; i < pts.length; i++) {
    pts[i].s = s;
    const q = pts[(i + 1) % pts.length];
    s += Math.hypot(q.x - pts[i].x, q.z - pts[i].z);
  }
  pts.totalLen = s;
  return pts;
}

export function offsetPath(path, d) {
  const out = path.map((p) => ({ x: p.x + p.nx * d, z: p.z + p.nz * d, nx: p.nx, nz: p.nz }));
  let s = 0;
  for (let i = 0; i < out.length; i++) {
    out[i].s = s;
    const q = out[(i + 1) % out.length];
    s += Math.hypot(q.x - out[i].x, q.z - out[i].z);
  }
  out.totalLen = s;
  return out;
}

const angleOf = (p) => Math.atan2(p.z, p.x);
export const inGaps = (gaps, ang) => gaps && gaps.some(([a0, a1]) => {
  let d = ang - a0;
  while (d < -Math.PI) d += Math.PI * 2;
  while (d > Math.PI) d -= Math.PI * 2;
  return d >= 0 && d <= (a1 - a0);
});

export function ringStrip(builder, pathA, yA, pathB, yB, mat, hintDir, gaps, gapMat, uvRepeat = 1) {
  const n = pathA.length;
  const total = pathA.totalLen || n;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    const mid = { x: (pathA[i].x + pathA[j].x) / 2, z: (pathA[i].z + pathA[j].z) / 2 };
    const m = inGaps(gaps, angleOf(mid)) ? (gapMat ?? null) : mat;
    if (m === null) continue;
    const s0 = ((pathA[i].s ?? i) / total) * uvRepeat;
    const s1 = j === 0 ? uvRepeat : ((pathA[j].s ?? j) / total) * uvRepeat;
    // Path goes CCW in (x,z), so for inward-facing surfaces viewer's left->right is j->i
    const hn = hintDir(mid);
    const inward = hn[0] * mid.x + hn[2] * mid.z < 0;
    const uA = inward ? s0 : s1;
    const uB = inward ? s1 : s0;
    builder.quad(
      [pathA[i].x, yA, pathA[i].z],
      [pathA[j].x, yA, pathA[j].z],
      [pathB[j].x, yB, pathB[j].z],
      [pathB[i].x, yB, pathB[i].z],
      m,
      hn,
      [[uA, 1], [uB, 1], [uB, 0], [uA, 0]]
    );
  }
}

export function stairBowl(builder, { path, y, rows, tread, riser, seatMat, riserMat, gaps, gapMat, spectatorOut, spectatorRows, uvRepeat = 48 }) {
  let cur = path;
  let cy = y;
  for (let i = 0; i < rows; i++) {
    const next = offsetPath(cur, tread);
    const midPath = offsetPath(cur, tread * 0.5);
    const n = cur.length;
    const total = cur.totalLen || n;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const mid = { x: (cur[k].x + cur[j].x) / 2, z: (cur[k].z + cur[j].z) / 2 };
      const inGap = inGaps(gaps, angleOf(mid));
      const l = Math.hypot(mid.x, mid.z) || 1;
      const segLen = Math.hypot(cur[j].x - cur[k].x, cur[j].z - cur[k].z);
      const u0 = ((cur[k].s ?? k) / total) * uvRepeat;
      const u1 = j === 0 ? uvRepeat : ((cur[j].s ?? j) / total) * uvRepeat;
      if (inGap && gapMat) {
        // Two half-riser / half-tread concrete steps per seating row so aisles look like real stadium stairs
        const h2 = riser * 0.5;
        builder.quad([cur[k].x, cy, cur[k].z], [cur[k].x, cy + h2, cur[k].z], [cur[j].x, cy + h2, cur[j].z], [cur[j].x, cy, cur[j].z], gapMat, [-mid.x / l, 0.1, -mid.z / l]);
        builder.quad([cur[k].x, cy + h2, cur[k].z], [cur[j].x, cy + h2, cur[j].z], [midPath[j].x, cy + h2, midPath[j].z], [midPath[k].x, cy + h2, midPath[k].z], gapMat, [0, 1, 0]);
        builder.quad([midPath[k].x, cy + h2, midPath[k].z], [midPath[k].x, cy + riser, midPath[k].z], [midPath[j].x, cy + riser, midPath[j].z], [midPath[j].x, cy + h2, midPath[j].z], gapMat, [-mid.x / l, 0.1, -mid.z / l]);
        builder.quad([midPath[k].x, cy + riser, midPath[k].z], [midPath[j].x, cy + riser, midPath[j].z], [next[j].x, cy + riser, next[j].z], [next[k].x, cy + riser, next[k].z], gapMat, [0, 1, 0]);
        continue;
      }
      if (riserMat !== null) {
        builder.quad(
          [cur[k].x, cy, cur[k].z],
          [cur[k].x, cy + riser, cur[k].z],
          [cur[j].x, cy + riser, cur[j].z],
          [cur[j].x, cy, cur[j].z],
          riserMat,
          [-mid.x / l, 0.1, -mid.z / l],
          [[u0, 1], [u0, 0], [u1, 0], [u1, 1]]
        );
      }
      if (seatMat !== null) {
        builder.quad(
          [cur[k].x, cy + riser, cur[k].z],
          [cur[j].x, cy + riser, cur[j].z],
          [next[j].x, cy + riser, next[j].z],
          [next[k].x, cy + riser, next[k].z],
          seatMat,
          [0, 1, 0],
          [[u0, 1], [u1, 1], [u1, 0], [u0, 0]]
        );
        if (spectatorOut && (!spectatorRows || spectatorRows.includes(i))) {
          const count = Math.max(1, Math.floor(segLen / 1.95));
          for (let s = 0; s < count; s++) {
            const t = (s + 0.5) / count;
            const sx = (cur[k].x * (1 - t) + cur[j].x * t) * 0.45 + (next[k].x * (1 - t) + next[j].x * t) * 0.55;
            const sz = (cur[k].z * (1 - t) + cur[j].z * t) * 0.45 + (next[k].z * (1 - t) + next[j].z * t) * 0.55;
            spectatorOut.push({ x: sx, y: cy + riser, z: sz });
          }
        }
      }
    }
    cur = next;
    cy += riser;
  }
  return { path: cur, y: cy };
}

export function flatDisc(builder, path, y, mat, down = false) {
  const n = path.length;
  const hint = down ? [0, -1, 0] : [0, 1, 0];
  const rings = [0.25, 0.55, 0.8, 1.0];
  let prev = path.map((p) => ({ x: p.x * rings[0], z: p.z * rings[0] }));
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    builder.tri([0, y, 0], [prev[i].x, y, prev[i].z], [prev[j].x, y, prev[j].z], mat, hint);
  }
  for (let r = 1; r < rings.length; r++) {
    const cur = path.map((p) => ({ x: p.x * rings[r], z: p.z * rings[r] }));
    for (let i = 0; i < n; i++) {
      const j = (i + 1) % n;
      builder.quad([prev[i].x, y, prev[i].z], [prev[j].x, y, prev[j].z], [cur[j].x, y, cur[j].z], [cur[i].x, y, cur[i].z], mat, hint);
    }
    prev = cur;
  }
}
