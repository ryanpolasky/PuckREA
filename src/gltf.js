export function makeMaterial(opts = {}) {
  return {
    baseColor: opts.color ?? [1, 1, 1, 1],
    metallic: opts.metallic ?? 0,
    roughness: opts.roughness ?? 0.85,
    emissive: opts.emissive ?? null,
    doubleSided: opts.doubleSided ?? false,
    alphaMode: opts.alphaMode ?? 'OPAQUE',
    alphaCutoff: opts.alphaCutoff ?? null,
    unlit: opts.unlit ?? false,
    texture: opts.texture ?? null,
    emissiveTexture: opts.emissiveTexture ?? null,
    name: opts.name ?? 'mat',
  };
}

export function buildGLB(materials, prims, { boards = [], textures = [], spectators = [], lights = [] } = {}) {
  const binParts = [];
  const bufferViews = [];
  const accessors = [];
  let binLen = 0;

  const pushView = (buf, target) => {
    const pad = (4 - (binLen % 4)) % 4;
    if (pad) { binParts.push(Buffer.alloc(pad)); binLen += pad; }
    const view = { buffer: 0, byteOffset: binLen, byteLength: buf.length };
    if (target) view.target = target;
    bufferViews.push(view);
    binParts.push(buf);
    binLen += buf.length;
    return bufferViews.length - 1;
  };

  const pushAccessor = (buf, componentType, count, type, target, minMax) => {
    const view = pushView(buf, target);
    const acc = { bufferView: view, componentType, count, type };
    if (minMax) { acc.min = minMax.min; acc.max = minMax.max; }
    accessors.push(acc);
    return accessors.length - 1;
  };

  const images = textures.map((t) => ({
    name: t.name,
    bufferView: pushView(t.png),
    mimeType: 'image/png',
  }));
  const gltfTextures = textures.map((t, i) => ({
    name: t.name,
    source: i,
    sampler: t.clamp ? 1 : 0,
  }));

  const buildPrimitives = (sourcePrims) => sourcePrims.map((p) => {
    // Weld identical (pos, norm, uv) vertices to cut GLB size by >50%
    const rawVerts = p.positions.length / 3;
    const hasUV = p.uvs && p.uvs.length === rawVerts * 2;
    const map = new Map();
    const wPos = [], wNorm = [], wUV = [];
    const remap = new Uint32Array(rawVerts);
    let nVerts = 0;
    for (let i = 0; i < rawVerts; i++) {
      const px = Math.round(p.positions[i * 3] * 1000);
      const py = Math.round(p.positions[i * 3 + 1] * 1000);
      const pz = Math.round(p.positions[i * 3 + 2] * 1000);
      const nx = Math.round(p.normals[i * 3] * 100);
      const ny = Math.round(p.normals[i * 3 + 1] * 100);
      const nz = Math.round(p.normals[i * 3 + 2] * 100);
      const u = hasUV ? Math.round(p.uvs[i * 2] * 1000) : 0;
      const v = hasUV ? Math.round(p.uvs[i * 2 + 1] * 1000) : 0;
      const key = `${px},${py},${pz},${nx},${ny},${nz},${u},${v}`;
      let idx = map.get(key);
      if (idx === undefined) {
        idx = nVerts++;
        map.set(key, idx);
        wPos.push(p.positions[i * 3], p.positions[i * 3 + 1], p.positions[i * 3 + 2]);
        wNorm.push(p.normals[i * 3], p.normals[i * 3 + 1], p.normals[i * 3 + 2]);
        wUV.push(hasUV ? p.uvs[i * 2] : 0, hasUV ? p.uvs[i * 2 + 1] : 0);
      }
      remap[i] = idx;
    }
    const wIdx = new Uint32Array(p.indices.length);
    for (let i = 0; i < p.indices.length; i++) wIdx[i] = remap[p.indices[i]];

    const posBuf = Buffer.from(new Float32Array(wPos).buffer);
    const min = [Infinity, Infinity, Infinity];
    const max = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < nVerts; i++) {
      for (let k = 0; k < 3; k++) {
        const v = wPos[i * 3 + k];
        if (v < min[k]) min[k] = v;
        if (v > max[k]) max[k] = v;
      }
    }
    const posAcc = pushAccessor(posBuf, 5126, nVerts, 'VEC3', 34962, { min, max });
    const normAcc = pushAccessor(Buffer.from(new Float32Array(wNorm).buffer), 5126, nVerts, 'VEC3', 34962);
    const uvAcc = pushAccessor(Buffer.from(new Float32Array(wUV).buffer), 5126, nVerts, 'VEC2', 34962);
    const idxBuf = Buffer.from(wIdx.buffer);
    const idxAcc = pushAccessor(idxBuf, 5125, wIdx.length, 'SCALAR', 34963);
    return {
      attributes: { POSITION: posAcc, NORMAL: normAcc, TEXCOORD_0: uvAcc },
      indices: idxAcc,
      material: p.material,
    };
  });

  const meshes = [{ name: 'RalphEngelstadArena', primitives: buildPrimitives(prims) }];
  const nodes = [{ mesh: 0, name: 'Arena', children: [] }];

  for (const board of boards) {
    const mesh = meshes.length;
    meshes.push({ name: board.name, primitives: buildPrimitives(board.prims) });
    const node = nodes.length;
    nodes[0].children.push(node);
    nodes.push({
      name: board.name,
      mesh,
      ...(board.hidden ? { scale: [0, 0, 0] } : {}),
    });
  }

  if (spectators.length) {
    const specParentIdx = nodes.length;
    const specChildren = [];
    nodes.push({ name: 'Spectator', children: specChildren });
    nodes[0].children.push(specParentIdx);
    spectators.forEach((s, idx) => {
      const theta = Math.atan2(s.x, -s.z);
      const qy = -Math.sin(theta / 2);
      const qw = Math.cos(theta / 2);
      const cIdx = nodes.length;
      specChildren.push(cIdx);
      nodes.push({
        name: `Spectator.${String(idx + 1).padStart(3, '0')}`,
        translation: [s.x, s.y, s.z],
        rotation: [0, qy, 0, qw],
      });
    });
  }

  const gltfLights = [];
  if (lights.length) {
    lights.forEach((l, idx) => {
      const li = gltfLights.length;
      const def = {
        name: l.name ?? `Light_${idx}`,
        type: l.type ?? 'point',
        color: l.color ?? [1, 1, 1],
        intensity: l.intensity ?? 100,
      };
      if (l.range) def.range = l.range;
      if (l.type === 'spot') {
        def.spot = { innerConeAngle: l.inner ?? 0.4, outerConeAngle: l.outer ?? 0.95 };
      }
      gltfLights.push(def);
      const nIdx = nodes.length;
      nodes[0].children.push(nIdx);
      const nd = {
        name: def.name,
        translation: l.pos,
        extensions: { KHR_lights_punctual: { light: li } },
      };
      if (l.rot) nd.rotation = l.rot;
      nodes.push(nd);
    });
  }

  if (!nodes[0].children.length) delete nodes[0].children;

  const extensionsUsed = [];
  if (gltfLights.length) extensionsUsed.push('KHR_lights_punctual');

  const json = {
    asset: { version: '2.0', generator: 'puck-rea-arena' },
    scene: 0,
    scenes: [{ nodes: [0] }],
    nodes,
    meshes,
    materials: materials.map((m) => {
      const pbr = {
        baseColorFactor: m.baseColor,
        metallicFactor: m.metallic,
        roughnessFactor: m.roughness,
      };
      if (m.texture !== null) pbr.baseColorTexture = { index: m.texture };
      const out = {
        name: m.name,
        pbrMetallicRoughness: pbr,
        doubleSided: m.doubleSided,
      };
      if (m.emissive) out.emissiveFactor = m.emissive;
      if (m.emissiveTexture !== null) {
        out.emissiveTexture = { index: m.emissiveTexture };
        if (!out.emissiveFactor) out.emissiveFactor = [1, 1, 1];
      }
      if (m.alphaMode !== 'OPAQUE') out.alphaMode = m.alphaMode;
      if (m.alphaCutoff !== null) out.alphaCutoff = m.alphaCutoff;
      return out;
    }),
    bufferViews,
    accessors,
    buffers: [{ byteLength: binLen }],
  };

  if (textures.length) {
    json.samplers = [
      { magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 },
      { magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 },
    ];
    json.images = images;
    json.textures = gltfTextures;
  }
  if (extensionsUsed.length) json.extensionsUsed = extensionsUsed;
  if (gltfLights.length) json.extensions = { KHR_lights_punctual: { lights: gltfLights } };

  let jsonBuf = Buffer.from(JSON.stringify(json), 'utf8');
  const jsonPad = (4 - (jsonBuf.length % 4)) % 4;
  if (jsonPad) jsonBuf = Buffer.concat([jsonBuf, Buffer.alloc(jsonPad, 0x20)]);
  const binBuf = Buffer.concat(binParts);

  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jsonBuf.length + 8 + binBuf.length, 8);

  const jsonHead = Buffer.alloc(8);
  jsonHead.writeUInt32LE(jsonBuf.length, 0);
  jsonHead.writeUInt32LE(0x4e4f534a, 4);
  const binHead = Buffer.alloc(8);
  binHead.writeUInt32LE(binBuf.length, 0);
  binHead.writeUInt32LE(0x004e4942, 4);

  return Buffer.concat([header, jsonHead, jsonBuf, binHead, binBuf]);
}
