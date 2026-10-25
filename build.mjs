import { mkdirSync, writeFileSync } from 'fs';
import { buildArena } from './src/arena.js';
import { buildGLB } from './src/gltf.js';

const { materials, prims, textures, spectators, lights } = buildArena();
let tris = 0, verts = 0;
for (const p of prims) { tris += p.indices.length / 3; verts += p.positions.length / 3; }
console.log(`parts: ${prims.length}, verts: ${verts}, tris: ${tris}, textures: ${textures.length}, spectators: ${spectators.length}`);

const glb = buildGLB(materials, prims, { textures, spectators, lights });
const outDir = 'dist/Ralph Engelstad Arena';
mkdirSync(outDir, { recursive: true });
writeFileSync(`${outDir}/ralph_engelstad.glb`, glb);
writeFileSync(`${outDir}/Ralph Engelstad Arena.al.json`, JSON.stringify({
  name: 'Ralph Engelstad Arena',
  author: 'ryanp',
  model: 'ralph_engelstad.glb',
}, null, 2));
writeFileSync(`${outDir}/AssetInformation.json`, JSON.stringify({
  UseGlass: true,
  KeepGameLights: true,
  UseGameDirectional: true,
  GameDirectionalIntensity: 0.9,
  GameDirectionalShadowStrength: 0.65,
  PropsCastShadows: false,
  KeepReflections: true,
  UseCustomAmbient: true,
  AmbientMultiplier: 1.15,
  GoalCrowdNoiseVolume: 0.55,
}, null, 2));
console.log(`wrote ${outDir} (${(glb.length / 1024).toFixed(0)} KB glb)`);
