import { mkdirSync, writeFileSync } from 'fs';
import { buildArena } from './src/arena.js';
import { buildGLB } from './src/gltf.js';

const { materials, prims, boards, textures, spectators, lights, suitePrims, suiteTriangles, crowdCounts, crowdDensity } = buildArena();
const allPrims = [...prims, ...boards.flatMap((board) => board.prims)];
let tris = 0, verts = 0;
for (const p of allPrims) { tris += p.indices.length / 3; verts += p.positions.length / 3; }
const boardParts = boards.map((board) => `${board.name}=${board.prims.length}`).join(', ');
console.log(`parts: ${allPrims.length} (${prims.length - suitePrims.length} arena + ${suitePrims.length} suite + ${boardParts}), verts: ${verts}, tris: ${tris}, textures: ${textures.length}, spectators: ${spectators.length}`);
console.log(`suites: ${suiteTriangles} triangles; crowd: lower=${crowdCounts.lower}, upper=${crowdCounts.upper}, suites=${crowdCounts.suite}, total=${spectators.length}, lower-row density=${crowdDensity.toFixed(3)}`);

const glb = buildGLB(materials, prims, { boards, textures, spectators, lights });
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
