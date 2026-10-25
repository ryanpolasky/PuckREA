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
for (const prim of gltf.meshes[0].primitives) {
  const pos = gltf.accessors[prim.attributes.POSITION];
  const uv = gltf.accessors[prim.attributes.TEXCOORD_0];
  const idx = gltf.accessors[prim.indices];
  verts += pos.count;
  tris += idx.count / 3;
  if (!pos.min || !pos.max) throw new Error('POSITION missing min/max');
  if (!uv || uv.count !== pos.count) throw new Error('TEXCOORD_0 count mismatch');
}
for (const bv of gltf.bufferViews) {
  if (bv.byteOffset + bv.byteLength > binLen) throw new Error('bufferView out of range');
}
const specNodes = gltf.nodes.filter((n) => n.name && n.name.startsWith('Spectator.'));
const manifest = JSON.parse(readFileSync('dist/Ralph Engelstad Arena/Ralph Engelstad Arena.al.json', 'utf8'));
console.log(`GLB valid: ${verts} verts, ${tris} tris, ${gltf.materials.length} materials, ${(gltf.textures || []).length} textures, ${specNodes.length} spectator spots`);
console.log(`manifest: "${manifest.name}" by ${manifest.author} -> ${manifest.model}`);
