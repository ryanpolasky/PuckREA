import { readFileSync } from 'fs';

const buf = readFileSync('dist/Ralph Engelstad Arena/ralph_engelstad.glb');
const magic = buf.readUInt32LE(0);
const version = buf.readUInt32LE(4);
const total = buf.readUInt32LE(8);
if (magic !== 0x46546c67) throw new Error('bad magic');
if (version !== 2) throw new Error('bad version');
if (total !== buf.length) throw new Error(`length mismatch: header ${total} vs file ${buf.length}`);

const jsonLen = buf.readUInt32LE(12);
const jsonType = buf.readUInt32LE(16);
if (jsonType !== 0x4e4f534a) throw new Error('chunk0 not JSON');
const gltf = JSON.parse(buf.subarray(20, 20 + jsonLen).toString('utf8'));

const binOff = 20 + jsonLen + 8;
const binLen = buf.readUInt32LE(20 + jsonLen);
if (buf.readUInt32LE(20 + jsonLen + 4) !== 0x004e4942) throw new Error('chunk1 not BIN');
if (binOff + binLen !== buf.length) throw new Error('bin length mismatch');
if (gltf.buffers[0].byteLength !== binLen) throw new Error('buffer byteLength mismatch');

let verts = 0, tris = 0;
for (const mesh of gltf.meshes) {
  for (const prim of mesh.primitives) {
    const pos = gltf.accessors[prim.attributes.POSITION];
    const uv = gltf.accessors[prim.attributes.TEXCOORD_0];
    const idx = gltf.accessors[prim.indices];
    verts += pos.count;
    tris += idx.count / 3;
    if (!pos.min || !pos.max) throw new Error('POSITION missing min/max');
    if (!uv || uv.count !== pos.count) throw new Error('TEXCOORD_0 count mismatch');
  }
}
for (const bv of gltf.bufferViews) {
  if (bv.byteOffset + bv.byteLength > binLen) throw new Error('bufferView out of range');
}
const specNodes = gltf.nodes.filter((n) => n.name && n.name.startsWith('Spectator.'));
const arenaNodeIndex = gltf.nodes.findIndex((n) => n.name === 'Arena');
if (arenaNodeIndex < 0) throw new Error('Arena node missing');
const arenaNode = gltf.nodes[arenaNodeIndex];
const boxNodeIndex = gltf.nodes.findIndex((n) => n.name === 'REA_Board_Box');
const cylinderNodeIndex = gltf.nodes.findIndex((n) => n.name === 'REA_Board_Cylinder');
if (boxNodeIndex < 0 || cylinderNodeIndex < 0) throw new Error('board nodes missing');
const boxNode = gltf.nodes[boxNodeIndex];
const cylinderNode = gltf.nodes[cylinderNodeIndex];
if (!arenaNode.children?.includes(boxNodeIndex) || !arenaNode.children?.includes(cylinderNodeIndex)) {
  throw new Error('board nodes must be children of Arena');
}
if (gltf.meshes[boxNode.mesh]?.name !== 'REA_Board_Box' || gltf.meshes[cylinderNode.mesh]?.name !== 'REA_Board_Cylinder') {
  throw new Error('board meshes missing');
}
if (JSON.stringify(cylinderNode.scale) !== '[0,0,0]') throw new Error('cylinder board must default to scale zero');
const nightSpotNodes = gltf.nodes.filter((n) => n.name && /^REA_NightSpot_[1-6]$/.test(n.name));
if (nightSpotNodes.length !== 6) throw new Error(`expected 6 night spot nodes, found ${nightSpotNodes.length}`);
for (const node of nightSpotNodes) {
  const nodeIndex = gltf.nodes.indexOf(node);
  if (!arenaNode.children?.includes(nodeIndex)) throw new Error(`${node.name} must be a child of Arena`);
  if (Object.hasOwn(node, 'mesh')) throw new Error(`${node.name} must not have a mesh`);
}
if (gltf.meshes.some((mesh) => mesh.name?.toLowerCase().includes('nightbeam'))) throw new Error('night beam mesh must be removed');
if (gltf.materials.some((material) => material.name?.toLowerCase().includes('nightbeam'))) throw new Error('night beam material must be removed');
if (gltf.extensionsUsed?.includes('KHR_materials_unlit')
  || gltf.materials.some((material) => material.extensions?.KHR_materials_unlit)) {
  throw new Error('KHR_materials_unlit must be removed');
}
for (const [boardNode, prefix] of [[boxNode, 'Box'], [cylinderNode, 'Cyl']]) {
  for (const side of ['PZ', 'NZ', 'PX', 'NX']) {
    const anchorName = `REA_ScoreAnchor_${prefix}_${side}`;
    const anchorIndex = gltf.nodes.findIndex((n) => n.name === anchorName);
    if (anchorIndex < 0 || !boardNode.children?.includes(anchorIndex)) throw new Error(`${anchorName} missing from board node`);
  }
}
const manifest = JSON.parse(readFileSync('dist/Ralph Engelstad Arena/Ralph Engelstad Arena.al.json', 'utf8'));
console.log(`GLB valid: ${gltf.meshes.length} meshes, ${verts} verts, ${tris} tris, ${gltf.materials.length} materials, ${(gltf.textures || []).length} textures, ${specNodes.length} spectator spots`);
console.log(`board nodes: ${boxNode.name} (visible), ${cylinderNode.name} (scale 0)`);
console.log('score anchors: 4 box + 4 cylinder');
console.log(`night spots: ${nightSpotNodes.length} empty anchor nodes`);
console.log(`manifest: "${manifest.name}" by ${manifest.author} -> ${manifest.model}`);
