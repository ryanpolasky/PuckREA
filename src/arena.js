import { readFileSync } from 'fs';
import { Builder, roundedRectPath, offsetPath, ringStrip, flatDisc, stairBowl, inGaps } from './geom.js';
import { makeMaterial } from './gltf.js';
import { buildTextures } from './textures.js';

const CROWD = { lower: 0.5, upper: 0.12, suite: 3 };
const SUITE = { width: 3.8, spacing: 4.2, front: 0.02, floorY: 10.62, ceilingY: 13.08 };

const lin = (c) => {
  const f = (v) => Math.pow((v / 255 + 0.055) / 1.055, 2.4);
  return [f(c[0]), f(c[1]), f(c[2]), c.length > 3 ? c[3] / 255 : 1];
};

function suiteCenters(path) {
  const centers = [];
  const sides = [
    { nx: 1, nz: 0, fixedAxis: 'x', tangentAxis: 'z', fixed: Math.max(...path.map((p) => p.x)) },
    { nx: -1, nz: 0, fixedAxis: 'x', tangentAxis: 'z', fixed: Math.min(...path.map((p) => p.x)) },
    { nx: 0, nz: 1, fixedAxis: 'z', tangentAxis: 'x', fixed: Math.max(...path.map((p) => p.z)) },
    { nx: 0, nz: -1, fixedAxis: 'z', tangentAxis: 'x', fixed: Math.min(...path.map((p) => p.z)) },
  ];
  for (const side of sides) {
    const segment = path.filter((p) => Math.abs(p[side.fixedAxis] - side.fixed) < 1e-4
      && Math.abs(p.nx - side.nx) < 1e-4 && Math.abs(p.nz - side.nz) < 1e-4);
    if (segment.length < 2) continue;
    const min = Math.min(...segment.map((p) => p[side.tangentAxis]));
    const max = Math.max(...segment.map((p) => p[side.tangentAxis]));
    const span = max - min;
    const count = Math.floor((span - SUITE.width) / SUITE.spacing) + 1;
    if (count < 1) continue;
    const used = SUITE.width + (count - 1) * SUITE.spacing;
    const first = min + (span - used) / 2 + SUITE.width / 2;
    for (let i = 0; i < count; i++) {
      const p = { [side.fixedAxis]: side.fixed, [side.tangentAxis]: first + i * SUITE.spacing, nx: side.nx, nz: side.nz };
      centers.push({ x: p.x, z: p.z, nx: p.nx, nz: p.nz });
    }
  }
  return centers;
}

function mixWallVertex(a, b, t) {
  return {
    position: a.position.map((v, i) => v + (b.position[i] - v) * t),
    normal: a.normal.map((v, i) => v + (b.normal[i] - v) * t),
    uv: a.uv.map((v, i) => v + (b.uv[i] - v) * t),
  };
}

function clipWallPolygon(poly, value, edge, keepGreater) {
  const result = [];
  for (let i = 0; i < poly.length; i++) {
    const current = poly[i], previous = poly[(i + poly.length - 1) % poly.length];
    const currentValue = value(current), previousValue = value(previous);
    const currentInside = keepGreater ? currentValue >= edge - 1e-8 : currentValue <= edge + 1e-8;
    const previousInside = keepGreater ? previousValue >= edge - 1e-8 : previousValue <= edge + 1e-8;
    if (currentInside !== previousInside) {
      const t = (edge - previousValue) / (currentValue - previousValue);
      result.push(mixWallVertex(previous, current, t));
    }
    if (currentInside) result.push(current);
  }
  const clean = [];
  for (const vertex of result) {
    const prior = clean[clean.length - 1];
    if (!prior || Math.hypot(...vertex.position.map((v, i) => v - prior.position[i])) > 1e-7) clean.push(vertex);
  }
  if (clean.length > 2 && Math.hypot(...clean[0].position.map((v, i) => v - clean[clean.length - 1].position[i])) <= 1e-7) clean.pop();
  return clean;
}

function sameWallPolygon(a, b) {
  return a.length === b.length && a.every((v, i) => v.position.every((c, j) => Math.abs(c - b[i].position[j]) < 1e-7));
}

function subtractSuiteOpening(poly, center) {
  const along = (v) => (v.position[0] - center.x) * -center.nz + (v.position[2] - center.z) * center.nx;
  const conditions = [
    [along, -SUITE.width / 2, true],
    [along, SUITE.width / 2, false],
    [(v) => v.position[1], SUITE.floorY, true],
    [(v) => v.position[1], SUITE.ceilingY, false],
  ];
  let inside = poly;
  const outside = [];
  for (const [value, edge, keepGreater] of conditions) {
    const piece = clipWallPolygon(inside, value, edge, !keepGreater);
    if (piece.length >= 3) outside.push(piece);
    inside = clipWallPolygon(inside, value, edge, keepGreater);
    if (inside.length < 3) break;
  }
  return outside;
}

function clipWallTriangle(vertices, centers, targetDepth = SUITE.front) {
  let polygons = [vertices];
  let changed = false;
  for (const center of centers) {
    const along = (v) => (v.position[0] - center.x) * -center.nz + (v.position[2] - center.z) * center.nx;
    const depth = (v) => (v.position[0] - center.x) * center.nx + (v.position[2] - center.z) * center.nz;
    const candidate = polygons.some((poly) => {
      const depths = poly.map(depth), alongs = poly.map(along), ys = poly.map((v) => v.position[1]);
      return Math.max(...depths) - Math.min(...depths) < 1e-3
        && Math.abs(depths[0] - targetDepth) < 5e-3
        && Math.max(...alongs) >= -SUITE.width / 2 && Math.min(...alongs) <= SUITE.width / 2
        && Math.max(...ys) >= SUITE.floorY && Math.min(...ys) <= SUITE.ceilingY;
    });
    if (!candidate) continue;
    const next = [];
    let cut = false;
    for (const poly of polygons) {
      const pieces = subtractSuiteOpening(poly, center);
      if (pieces.length !== 1 || !sameWallPolygon(pieces[0], poly)) cut = true;
      next.push(...pieces);
    }
    if (cut) {
      changed = true;
      polygons = next;
    }
    if (!polygons.length) break;
  }
  return changed ? polygons : null;
}

function distanceToPath(x, z, path) {
  let closest = Infinity;
  for (let i = 0; i < path.length; i++) {
    const a = path[i], b = path[(i + 1) % path.length];
    const dx = b.x - a.x, dz = b.z - a.z;
    const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.z) * dz) / (dx * dx + dz * dz || 1)));
    closest = Math.min(closest, Math.hypot(x - a.x - t * dx, z - a.z - t * dz));
  }
  return closest;
}

function clipPrimsToSuiteOpenings(prims, centers, targetDepth) {
  return prims.map((prim) => {
    const positions = [...prim.positions], normals = [...prim.normals], uvs = [...prim.uvs], indices = [];
    for (let i = 0; i < prim.indices.length; i += 3) {
      const ids = prim.indices.slice(i, i + 3);
      const vertices = ids.map((vertex) => ({
        position: [positions[vertex * 3], positions[vertex * 3 + 1], positions[vertex * 3 + 2]],
        normal: [normals[vertex * 3], normals[vertex * 3 + 1], normals[vertex * 3 + 2]],
        uv: [uvs[vertex * 2], uvs[vertex * 2 + 1]],
      }));
      const pieces = clipWallTriangle(vertices, centers, targetDepth);
      if (!pieces) {
        indices.push(...ids);
        continue;
      }
      for (const polygon of pieces) {
        for (let j = 1; j + 1 < polygon.length; j++) {
          const triangle = [polygon[0], polygon[j], polygon[j + 1]];
          const ab = triangle[1].position.map((v, k) => v - triangle[0].position[k]);
          const ac = triangle[2].position.map((v, k) => v - triangle[0].position[k]);
          const area = Math.hypot(
            ab[1] * ac[2] - ab[2] * ac[1],
            ab[2] * ac[0] - ab[0] * ac[2],
            ab[0] * ac[1] - ab[1] * ac[0],
          ) / 2;
          if (area < 1e-8) continue;
          const base = positions.length / 3;
          for (const vertex of triangle) {
            const length = Math.hypot(...vertex.normal) || 1;
            positions.push(...vertex.position);
            normals.push(...vertex.normal.map((v) => v / length));
            uvs.push(...vertex.uv);
          }
          indices.push(base, base + 1, base + 2);
        }
      }
    }
    return { ...prim, positions, normals, uvs, indices };
  });
}

function quatFromAxes(x, y, z) {
  const m00 = x[0], m01 = y[0], m02 = z[0];
  const m10 = x[1], m11 = y[1], m12 = z[1];
  const m20 = x[2], m21 = y[2], m22 = z[2];
  const trace = m00 + m11 + m22;
  let qx, qy, qz, qw;
  if (trace > 0) {
    const s = Math.sqrt(trace + 1) * 2;
    qw = 0.25 * s;
    qx = (m21 - m12) / s;
    qy = (m02 - m20) / s;
    qz = (m10 - m01) / s;
  } else if (m00 > m11 && m00 > m22) {
    const s = Math.sqrt(1 + m00 - m11 - m22) * 2;
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = Math.sqrt(1 + m11 - m00 - m22) * 2;
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = Math.sqrt(1 + m22 - m00 - m11) * 2;
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  return [qx, qy, qz, qw];
}

function triangleArea(positions, a, b, c) {
  const ax = positions[b * 3] - positions[a * 3];
  const ay = positions[b * 3 + 1] - positions[a * 3 + 1];
  const az = positions[b * 3 + 2] - positions[a * 3 + 2];
  const bx = positions[c * 3] - positions[a * 3];
  const by = positions[c * 3 + 1] - positions[a * 3 + 1];
  const bz = positions[c * 3 + 2] - positions[a * 3 + 2];
  return Math.hypot(ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx) * 0.5;
}

function clusterSeatQuads(bowlMeta, bowlBin) {
  const quads = [];
  for (const pm of bowlMeta.prims) {
    if (pm.mat !== 'SeatShell' && pm.mat !== 'SeatShellY') continue;
    let off = pm.offset;
    const positions = new Float32Array(bowlBin.buffer, bowlBin.byteOffset + off, pm.vcount * 3);
    off += pm.posLen + pm.normLen + pm.uvLen;
    const indices = new Uint32Array(bowlBin.buffer, bowlBin.byteOffset + off, pm.icount);
    for (let i = 0; i + 5 < indices.length; i += 6) {
      const ids = [...new Set(indices.subarray(i, i + 6))];
      if (ids.length !== 4) continue;
      const center = [0, 0, 0];
      let minY = Infinity, maxY = -Infinity;
      for (const id of ids) {
        for (let axis = 0; axis < 3; axis++) center[axis] += positions[id * 3 + axis] / 4;
        minY = Math.min(minY, positions[id * 3 + 1]);
        maxY = Math.max(maxY, positions[id * 3 + 1]);
      }
      const area = triangleArea(positions, ...indices.subarray(i, i + 3))
        + triangleArea(positions, ...indices.subarray(i + 3, i + 6));
      quads.push({ center, area, flat: maxY - minY <= 0.025 });
    }
  }

  const cellSize = 0.75;
  const seats = quads
    .filter((quad) => quad.flat && quad.area >= 0.16 && quad.area <= 0.22)
    .map((quad) => ({ center: quad.center, quads: [] }));
  const grid = new Map();
  const cellKey = (point) => point.map((v) => Math.floor(v / cellSize)).join(',');
  for (const seat of seats) {
    const key = cellKey(seat.center);
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push(seat);
  }
  const findNearest = (point, maxDistance) => {
    const cell = point.map((v) => Math.floor(v / cellSize));
    const radius = Math.ceil(maxDistance / cellSize);
    let nearest = null, nearestD2 = maxDistance * maxDistance;
    for (let x = -radius; x <= radius; x++) {
      for (let y = -radius; y <= radius; y++) {
        for (let z = -radius; z <= radius; z++) {
          for (const seat of grid.get(`${cell[0] + x},${cell[1] + y},${cell[2] + z}`) ?? []) {
            const d2 = point.reduce((sum, v, axis) => sum + (v - seat.center[axis]) ** 2, 0);
            if (d2 <= nearestD2) {
              nearest = seat;
              nearestD2 = d2;
            }
          }
        }
      }
    }
    return nearest;
  };
  for (const quad of quads) {
    const seat = findNearest(quad.center, 0.65);
    if (seat) seat.quads.push(quad);
  }
  return { seats, findNearest };
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function buildLowerCrowd(seatData, existing) {
  const matched = [];
  for (const spot of existing) {
    const seat = seatData.findNearest([spot.x, spot.y, spot.z], 0.7);
    if (seat) matched.push({ seat, spot });
  }
  if (matched.length !== existing.length) {
    throw new Error(`Matched ${matched.length} of ${existing.length} existing spectator spots to seats`);
  }
  const offset = [0, 1, 2].map((axis) => median(matched.map(({ seat, spot }) => spot[['x', 'y', 'z'][axis]] - seat.center[axis])));
  const rows = new Map();
  const rowKey = (y) => Math.round(y * 100);
  for (const seat of seatData.seats) {
    const key = rowKey(seat.center[1]);
    if (!rows.has(key)) rows.set(key, []);
    rows.get(key).push(seat);
  }
  const populatedRows = new Set(matched.map(({ seat }) => rowKey(seat.center[1])));
  const baselineSeatCount = [...populatedRows].reduce((sum, key) => sum + (rows.get(key)?.length ?? 0), 0);
  const density = matched.length / baselineSeatCount;
  const highestPopulatedRow = Math.max(...[...populatedRows].map(Number));
  const added = [];
  for (const [key, row] of rows) {
    if (key <= highestPopulatedRow) continue;
    const eligible = row
      .map((seat) => ({
        x: seat.center[0] + offset[0],
        y: seat.center[1] + offset[1],
        z: seat.center[2] + offset[2],
      }))
      .filter((spot) => !(spot.x < -24.0 && spot.y < 2.55 && Math.abs(spot.z) < 8.28))
      .sort((a, b) => Math.atan2(a.x, -a.z) - Math.atan2(b.x, -b.z));
    const count = Math.round(eligible.length * density * CROWD.lower);
    if (!count) continue;
    for (let i = 0; i < count; i++) {
      added.push(eligible[Math.floor((i + 0.5) * eligible.length / count)]);
    }
  }
  return { offset, added, density, matched: matched.length };
}

function buildSuites(builder, M, centerPoints, seatOffset, spectatorsPerSuite) {
  const centers = [];
  const spectators = [];
  const width = SUITE.width, halfWidth = width / 2;
  const frontD = SUITE.front, backD = 1.58;
  const floorY = SUITE.floorY, ceilingY = SUITE.ceilingY, stepY = 10.86, seatH = 0.55;

  for (const p of centerPoints) {
    const tx = -p.nz, tz = p.nx;
    const angle = Math.atan2(p.nx, -p.nz);
    const point = (u, d, y) => [p.x + tx * u + p.nx * d, y, p.z + tz * u + p.nz * d];
    const quad = (coords, mat, hint, uvs) => builder.quad(...coords, mat, hint, uvs);

    quad([
      point(-halfWidth, frontD, floorY),
      point(halfWidth, frontD, floorY),
      point(halfWidth, backD, floorY),
      point(-halfWidth, backD, floorY),
    ], M.dark, [0, 1, 0]);
    quad([
      point(-halfWidth, frontD, ceilingY),
      point(halfWidth, frontD, ceilingY),
      point(halfWidth, backD, ceilingY),
      point(-halfWidth, backD, ceilingY),
    ], M.tier, [0, -1, 0]);
    quad([
      point(-halfWidth, backD, floorY),
      point(halfWidth, backD, floorY),
      point(halfWidth, backD, ceilingY),
      point(-halfWidth, backD, ceilingY),
    ], M.suiteInterior, [-p.nx, 0, -p.nz]);
    for (const side of [-1, 1]) {
      const u = side * halfWidth;
      quad([
        point(u, frontD, floorY),
        point(u, backD, floorY),
        point(u, backD, ceilingY),
        point(u, frontD, ceilingY),
      ], M.tier, [side * tx, 0, side * tz]);
    }
    for (const d of [0.58, 1.18]) {
      const u = d < 1 ? -0.85 : 0.85;
      quad([
        point(u - 0.08, d - 0.05, ceilingY - 0.01),
        point(u + 0.08, d - 0.05, ceilingY - 0.01),
        point(u + 0.08, d + 0.05, ceilingY - 0.01),
        point(u - 0.08, d + 0.05, ceilingY - 0.01),
      ], M.suiteWarm, [0, -1, 0]);
    }
    quad([
      point(-1.15, 0.84, stepY),
      point(1.15, 0.84, stepY),
      point(1.15, 1.42, stepY),
      point(-1.15, 1.42, stepY),
    ], M.speakerBlack, [0, 1, 0]);
    quad([
      point(-1.15, 0.84, floorY),
      point(1.15, 0.84, floorY),
      point(1.15, 0.84, stepY),
      point(-1.15, 0.84, stepY),
    ], M.speakerBlack, [-p.nx, 0, -p.nz]);
    builder.box(...point(0, 0.18, 11.98), width - 0.02, 0.14, 0.20, M.suiteWood, 0, angle, 0);

    const seatSpecs = [
      { u: -0.65, d: 0.48, y: floorY + seatH / 2 },
      { u: 0.65, d: 0.48, y: floorY + seatH / 2 },
      { u: -0.65, d: 1.10, y: stepY + seatH / 2 },
      { u: 0.65, d: 1.10, y: stepY + seatH / 2 },
    ];
    for (const seat of seatSpecs) {
      builder.box(...point(seat.u, seat.d, seat.y), 0.54, seatH, 0.42, M.seatDarkGreen, 0, angle, 0);
    }
    for (let i = 0; i < Math.min(spectatorsPerSuite, seatSpecs.length); i++) {
      const seat = seatSpecs[i];
      const pos = point(seat.u, seat.d, seat.y + seatH / 2);
      spectators.push({ x: pos[0] + seatOffset[0], y: pos[1] + seatOffset[1], z: pos[2] + seatOffset[2] });
    }
    centers.push({ index: centers.length, x: p.x, z: p.z, nx: p.nx, nz: p.nz });
  }

  const triangles = [...builder.parts.values()].reduce((sum, part) => sum + part.idx.length / 3, 0);
  if (triangles > 4000) throw new Error(`Suite geometry exceeds 4,000 triangles: ${triangles}`);
  return { centers, spectators, triangles };
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
  const slope = (4.4 - 3.73) / (14.6 - 11.3);
  const q = Math.sqrt(1 + slope * slope);
  const centerY = 12.95;
  const radius = 3.73 + slope * (centerY - 11.3);
  const label = { '+z': 'PZ', '-z': 'NZ', '+x': 'PX', '-x': 'NX' };
  return sides.map((side) => {
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
    return {
      name: `REA_ScoreAnchor_Box_${label[side]}`,
      translation: center.map((v, i) => v + normal[i] * 0.03),
      rotation: quatFromAxes(horizontal, vertical, normal),
      scale: [6.6, 3.3, 1],
    };
  });
}

function buildCylinderBoard(b, M, roofY) {
  const deg = Math.PI / 180;
  const sbSegs = 32;
  const sbR = 6.85;
  cylRing(b, 17.15, 17.95, sbR, sbR, sbSegs, M.sbHeader, true, 4);
  cylRing(b, 16.10, 17.15, sbR, sbR, sbSegs, M.ledRibbon, true, 1);
  for (const ang of [0, Math.PI / 2, Math.PI, Math.PI * 1.5]) {
    cylArcScreen(b, 12.55, 16.10, sbR, ang, 78 * deg, 8, M.sbMain);
    cylArcScreen(b, 12.55, 16.10, sbR, ang + Math.PI / 4, 12 * deg, 2, M.speakerBlack);
  }
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
  return ['PZ', 'NZ', 'PX', 'NX'].map((side) => ({
    name: `REA_ScoreAnchor_Cyl_${side}`,
    translation: [0, 0, 0],
    scale: [0, 0, 1],
  }));
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
    suiteInterior: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('suite_interior'),
      emissiveTexture: texIdx('suite_interior'),
      emissive: [0.45, 0.32, 0.18],
      roughness: 0.62,
      doubleSided: true,
      name: 'suiteInterior',
    }),
    suiteWood: makeMaterial({ color: lin([110, 48, 30]), roughness: 0.58, doubleSided: true, name: 'suiteWood' }),
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
    sbScore: makeMaterial({
      color: [1, 1, 1, 1],
      texture: texIdx('scoreboard_score_live'),
      emissiveTexture: texIdx('scoreboard_score_live'),
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
  const boxBoardBuilder = new Builder();
  const cylinderBoardBuilder = new Builder();
  const suiteBuilder = new Builder();
  const suitePath = roundedRectPath(41.52, 64.76, 31.58, 16, 28, 16);
  const fasciaPath = offsetPath(suitePath, -0.02);
  const suiteOpeningCenters = suiteCenters(fasciaPath);
  ringStrip(b, fasciaPath, 10.60, fasciaPath, 13.15, M.suiteBand, (m) => [-m.x, 0, -m.z], null, null, fasciaPath.totalLen / 3);

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
      if ((pm.mat === 'Wall' || pm.mat === 'TunnelDark')
        && cy >= 10.60 && cy <= 13.15
        && distanceToPath(cx, cz, fasciaPath) < 0.11) continue;
      if (pm.mat === 'Wall' || pm.mat === 'TunnelDark') {
        const vertices = [i0, i1, i2].map((vertex) => ({
          position: [pos[vertex * 3], pos[vertex * 3 + 1], pos[vertex * 3 + 2]],
          normal: [norm[vertex * 3], norm[vertex * 3 + 1], norm[vertex * 3 + 2]],
          uv: [uv[vertex * 2], uv[vertex * 2 + 1]],
        }));
        const pieces = clipWallTriangle(vertices, suiteOpeningCenters);
        if (pieces) {
          for (const polygon of pieces) {
            for (let j = 1; j + 1 < polygon.length; j++) {
              const triangle = [polygon[0], polygon[j], polygon[j + 1]];
              const ab = triangle[1].position.map((v, k) => v - triangle[0].position[k]);
              const ac = triangle[2].position.map((v, k) => v - triangle[0].position[k]);
              const area = Math.hypot(
                ab[1] * ac[2] - ab[2] * ac[1],
                ab[2] * ac[0] - ab[0] * ac[2],
                ab[0] * ac[1] - ab[1] * ac[0],
              ) / 2;
              if (area < 1e-8) continue;
              const base = pos.length / 3;
              for (const vertex of triangle) {
                const length = Math.hypot(...vertex.normal) || 1;
                pos.push(...vertex.position);
                norm.push(...vertex.normal.map((v) => v / length));
                uv.push(...vertex.uv);
              }
              filteredIdx.push(base, base + 1, base + 2);
            }
          }
          continue;
        }
      }
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
    importedPrims.push({ positions: pos, normals: norm, uvs: uv, indices: filteredIdx, material: matIndex, sourceMaterial: pm.mat });

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

  const benchFilter = (s) => !(s.x < -24.0 && s.y < 2.55 && Math.abs(s.z) < 8.28);
  const filteredSpectators = bowlMeta.spectators.filter(benchFilter);
  const seatData = clusterSeatQuads(bowlMeta, bowlBin);
  const lowerCrowd = buildLowerCrowd(seatData, filteredSpectators);

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
    sourceMaterial: 'Pillars',
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
  const suiteData = buildSuites(suiteBuilder, M, suiteOpeningCenters, lowerCrowd.offset, CROWD.suite);

  ringStrip(b, fasciaPath, 14.25, fasciaPath, 15.10, M.concrete, (m) => [-m.x, 0, -m.z]);
  const parapetPath = offsetPath(fasciaPath, 0.15);
  ringStrip(b, fasciaPath, 15.10, parapetPath, 15.10, M.concrete, () => [0, 1, 0]);
  ringStrip(b, parapetPath, 15.10, parapetPath, 15.45, M.railGlass, (m) => [-m.x, 0, -m.z]);
  ringStrip(b, offsetPath(parapetPath, -0.10), 15.45, offsetPath(parapetPath, 0.10), 15.45, M.rail, () => [0, 1, 0]);

  const upperGaps = Array.from({ length: 12 }, (_, i) => {
    const center = Math.PI / 4 + i * (Math.PI / 6);
    return [center - 0.018, center + 0.018];
  });
  const upperCrowd = [];
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
    spectatorOut: upperCrowd,
    spectatorDensity: CROWD.upper,
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

  const boxAnchors = buildBoxBoard(boxBoardBuilder, M, roofY);
  const cylinderAnchors = buildCylinderBoard(cylinderBoardBuilder, M, roofY);

  const lights = [
    { name: 'BowlFill_Center', type: 'point', pos: [0, 10.9, 0], color: [1, 0.95, 0.86], intensity: 35, range: 48 },
    { name: 'BowlFill_North', type: 'point', pos: [0, 19.5, 26], color: [1, 0.95, 0.86], intensity: 28, range: 55 },
    { name: 'BowlFill_South', type: 'point', pos: [0, 19.5, -26], color: [1, 0.95, 0.86], intensity: 28, range: 55 },
    { name: 'WarmBowl_East', type: 'point', pos: [32, 14.5, 0], color: [1.0, 0.84, 0.58], intensity: 24, range: 55 },
    { name: 'WarmBowl_West', type: 'point', pos: [-32, 14.5, 0], color: [1.0, 0.84, 0.58], intensity: 24, range: 55 },
  ];

  const suiteBuilderPrims = suiteBuilder.toPrims(mats);
  const arenaPrims = b.toPrims(mats);
  const suiteBandIndex = mats.indexOf(M.suiteBand);
  const suiteBandPrims = clipPrimsToSuiteOpenings(
    arenaPrims.filter((prim) => prim.material === suiteBandIndex),
    suiteOpeningCenters,
    0,
  );
  const suiteBasePrims = arenaPrims.filter((prim) => prim.material !== suiteBandIndex);
  const suitePrims = [...suiteBuilderPrims, ...suiteBandPrims];
  const suiteTriangles = suiteData.triangles + suiteBandPrims.reduce((sum, prim) => sum + prim.indices.length / 3, 0);
  if (suiteTriangles > 4000) throw new Error(`Suite geometry exceeds 4,000 triangles: ${suiteTriangles}`);
  const allPrims = [...importedPrims, ...suiteBasePrims, ...suitePrims];
  const spectators = [...filteredSpectators, ...lowerCrowd.added, ...upperCrowd, ...suiteData.spectators];
  const crowdCounts = {
    lower: filteredSpectators.length + lowerCrowd.added.length,
    upper: upperCrowd.length,
    suite: suiteData.spectators.length,
  };
  const boards = [
    { name: 'REA_Board_Box', prims: boxBoardBuilder.toPrims(mats), anchors: boxAnchors },
    { name: 'REA_Board_Cylinder', prims: cylinderBoardBuilder.toPrims(mats), anchors: cylinderAnchors, hidden: true },
  ];
  return {
    materials: mats,
    prims: allPrims,
    boards,
    textures,
    spectators,
    lights,
    importedPrims,
    suitePrims,
    suiteCenters: suiteData.centers,
    suiteTriangles,
    crowdCounts,
    crowdDensity: lowerCrowd.density,
  };
}
