import http from 'http';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import path from 'path';

const { chromium } = await import('file:///C:/Projects/Marralhinha/node_modules/playwright/index.mjs');

const OUT_DIR = 'C:/Projects/PuckREA/marketing';
const FRAMES_DIR = 'C:/Projects/PuckREA/marketing/_frames';
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(FRAMES_DIR, { recursive: true });

const HTML = `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<style>
  html, body { margin: 0; padding: 0; overflow: hidden; background: #070b09; }
  canvas { display: block; }
</style>
<script type="importmap">
{
  "imports": {
    "three": "https://unpkg.com/three@0.164.1/build/three.module.js",
    "three/addons/": "https://unpkg.com/three@0.164.1/examples/jsm/"
  }
}
</script>
</head>
<body>
<script type="module">
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const W = 1920, H = 1080;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: true });
renderer.setSize(W, H);
renderer.setPixelRatio(1);
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 0.76;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x060a08);
scene.fog = new THREE.FogExp2(0x060b08, 0.0018);

const camera = new THREE.PerspectiveCamera(58, W / H, 0.5, 260);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(W, H), 0.16, 0.35, 0.92);
composer.addPass(bloom);
composer.addPass(new OutputPass());

// Balanced arena lighting so ice logo, red/blue lines, jumbotron, and dark green leather seats have rich contrast
scene.add(new THREE.AmbientLight(0xc8dcd0, 0.75));
const hemi = new THREE.HemisphereLight(0xd8efe2, 0x221e18, 0.55);
scene.add(hemi);

const dir1 = new THREE.DirectionalLight(0xf6fff9, 0.85);
dir1.position.set(18, 38, 22);
scene.add(dir1);

const dir2 = new THREE.DirectionalLight(0xd8f0e2, 0.55);
dir2.position.set(-22, 34, -26);
scene.add(dir2);

// Build Puck's rounded-rect ice sheet (X = +-22.50, Z = +-45.75, R = 12.75) with actual hockey_rink lines texture
const texLoader = new THREE.TextureLoader();
const iceTex = await new Promise((res) => texLoader.load('/ice.png', res));
iceTex.colorSpace = THREE.SRGBColorSpace;

// Build rounded-rectangle ice mesh matching Puck's exact UV mapping: u = (45.75 - z) / 91.5, v = 0.5 - x / 45.28
const iceGeo = new THREE.PlaneGeometry(45, 91.5, 32, 64);
iceGeo.rotateX(-Math.PI / 2);
const posAttr = iceGeo.attributes.position;
const uvAttr = iceGeo.attributes.uv;
for (let i = 0; i < posAttr.count; i++) {
  let x = posAttr.getX(i), z = posAttr.getZ(i);
  const cx = Math.max(0, Math.abs(x) - 9.75);
  const cz = Math.max(0, Math.abs(z) - 33.0);
  const d = Math.hypot(cx, cz);
  if (d > 12.75) {
    const s = 12.75 / d;
    x = Math.sign(x) * (9.75 + cx * s);
    z = Math.sign(z) * (33.0 + cz * s);
    posAttr.setXYZ(i, x, 0.005, z);
  } else {
    posAttr.setY(i, 0.005);
  }
  uvAttr.setXY(i, (45.75 - z) / 91.5, 0.5 + x / 45.28);
}
const iceMat = new THREE.MeshStandardMaterial({
  map: iceTex,
  color: 0xdce8e2,
  roughness: 0.38,
  metalness: 0.02,
});
scene.add(new THREE.Mesh(iceGeo, iceMat));

// Clear rink glass (skipping the player bench cutout at x > 21, |z| < 10.65)
const glassMat = new THREE.MeshPhysicalMaterial({
  color: 0xdff5ea,
  transparent: true,
  opacity: 0.16,
  roughness: 0.08,
  metalness: 0.1,
  side: THREE.DoubleSide,
  depthWrite: false,
});
function addGlassArc(cx, cz, a0, a1, segs) {
  const r = 12.76;
  for (let i = 0; i < segs; i++) {
    const t0 = a0 + (a1 - a0) * (i / segs);
    const t1 = a0 + (a1 - a0) * ((i + 1) / segs);
    const x0 = cx + Math.cos(t0) * r, z0 = cz + Math.sin(t0) * r;
    const x1 = cx + Math.cos(t1) * r, z1 = cz + Math.sin(t1) * r;
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, 1.24, z0, x1, 1.24, z1, x1, 3.35, z1,
      x0, 1.24, z0, x1, 3.35, z1, x0, 3.35, z0,
    ], 3));
    g.computeVertexNormals();
    scene.add(new THREE.Mesh(g, glassMat));
  }
}
function addGlassLine(x0, z0, x1, z1) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([
    x0, 1.24, z0, x1, 1.24, z1, x1, 3.35, z1,
    x0, 1.24, z0, x1, 3.35, z1, x0, 3.35, z0,
  ], 3));
  g.computeVertexNormals();
  scene.add(new THREE.Mesh(g, glassMat));
}
// Penalty box side (-X) has continuous glass; Bench side (+X) has cutout at z = -10.65..+10.65
addGlassLine(-22.51, -33.0, -22.51, 33.0);
addGlassLine(22.51, -33.0, 22.51, -10.65);
addGlassLine(22.51, 10.65, 22.51, 33.0);
addGlassLine(-9.75, 45.76, 9.75, 45.76);
addGlassLine(-9.75, -45.76, 9.75, -45.76);
addGlassArc(9.75, 33.0, 0, Math.PI / 2, 12);
addGlassArc(-9.75, 33.0, Math.PI / 2, Math.PI, 12);
addGlassArc(-9.75, -33.0, Math.PI, Math.PI * 1.5, 12);
addGlassArc(9.75, -33.0, Math.PI * 1.5, Math.PI * 2, 12);

// Two hockey goals at Z = +-40.95
const postMat = new THREE.MeshStandardMaterial({ color: 0xd92626, roughness: 0.35, metalness: 0.4 });
const netMat = new THREE.MeshStandardMaterial({ color: 0xeeeeee, transparent: true, opacity: 0.45, roughness: 0.8, side: THREE.DoubleSide });
for (const sz of [-1, 1]) {
  const gz = sz * 40.95;
  const grp = new THREE.Group();
  for (const gx of [-0.95, 0.95]) {
    const post = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.25, 10), postMat);
    post.position.set(gx, 0.625, gz);
    grp.add(post);
  }
  const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 1.90, 10), postMat);
  bar.rotation.z = Math.PI / 2;
  bar.position.set(0, 1.25, gz);
  grp.add(bar);
  const net = new THREE.Mesh(new THREE.BoxGeometry(1.86, 1.22, 0.85), netMat);
  net.position.set(0, 0.61, gz + sz * 0.44);
  grp.add(net);
  scene.add(grp);
}

// Load ralph_engelstad.glb and populate Spectator.* nodes with Fighting Sioux fans (kelly green, white, dark green jerseys)
const loader = new GLTFLoader();
const gltf = await new Promise((res, rej) => loader.load('/arena.glb', res, undefined, rej));
scene.add(gltf.scene);

const jerseyMats = [
  new THREE.MeshStandardMaterial({ color: 0x00883c, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0x006b30, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0xeef4f0, roughness: 0.7 }),
  new THREE.MeshStandardMaterial({ color: 0x16241c, roughness: 0.7 }),
];
const headMat = new THREE.MeshStandardMaterial({ color: 0xdcb898, roughness: 0.65 });
const hairMat = new THREE.MeshStandardMaterial({ color: 0x1e2420, roughness: 0.8 });
const torsoGeo = new THREE.CylinderGeometry(0.22, 0.25, 0.58, 8);
const headGeo = new THREE.SphereGeometry(0.16, 8, 8);
const capGeo = new THREE.SphereGeometry(0.165, 8, 6, 0, Math.PI * 2, 0, Math.PI * 0.55);

let specIdx = 0;
gltf.scene.traverse((node) => {
  if (node.isLight) {
    node.intensity *= 0.12;
  }
  if (node.isMesh && node.material && node.material.emissiveIntensity !== undefined) {
    node.material.emissiveIntensity = 0.65;
  }
  if (node.name && node.name.startsWith('Spectator') && node.name !== 'Spectator') {
    const jm = jerseyMats[specIdx % jerseyMats.length];
    const fan = new THREE.Group();
    const torso = new THREE.Mesh(torsoGeo, jm);
    torso.position.y = 0.42;
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.y = 0.84;
    const cap = new THREE.Mesh(capGeo, specIdx % 3 === 0 ? jerseyMats[0] : hairMat);
    cap.position.y = 0.85;
    fan.add(torso, head, cap);
    node.add(fan);
    specIdx++;
  }
});

window.renderView = (eye, look, fov = 58) => {
  camera.fov = fov;
  camera.updateProjectionMatrix();
  camera.position.set(eye[0], eye[1], eye[2]);
  camera.lookAt(look[0], look[1], look[2]);
  composer.render();
};
window.__READY = true;
</script>
</body>
</html>`;

const server = http.createServer((req, res) => {
  if (req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end(HTML);
  } else if (req.url === '/arena.glb') {
    res.writeHead(200, { 'Content-Type': 'model/gltf-binary' });
    res.end(readFileSync('C:/Projects/PuckREA/dist/Ralph Engelstad Arena/ralph_engelstad.glb'));
  } else if (req.url === '/ice.png') {
    res.writeHead(200, { 'Content-Type': 'image/png' });
    res.end(readFileSync('C:/Projects/PuckREA/assets/generated/puck_ice_surface.png'));
  } else {
    res.writeHead(404);
    res.end();
  }
});

await new Promise((r) => server.listen(0, '127.0.0.1', r));
const port = server.address().port;
console.log('Server listening on port', port);

const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=angle', '--enable-webgl', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
await page.waitForFunction(() => window.__READY === true, { timeout: 30000 });

const shots = [
  {
    file: 'shot_1_bowl.png',
    eye: [24, 9.2, -35],
    look: [-2, 11.2, 8],
    fov: 58,
  },
  {
    file: 'shot_2_center_ice.png',
    eye: [0, 4.6, -28],
    look: [0, 11.8, 22],
    fov: 60,
  },
  {
    file: 'shot_3_upper_deck.png',
    eye: [-30, 14.5, 38],
    look: [3, 8.5, -6],
    fov: 62,
  },
  {
    file: 'shot_4_endzone.png',
    eye: [0, 11.5, 52],
    look: [0, 9.0, -10],
    fov: 58,
  },
];

for (const s of shots) {
  await page.evaluate(({ eye, look, fov }) => window.renderView(eye, look, fov), s);
  const outPath = path.join(OUT_DIR, s.file);
  await page.screenshot({ path: outPath });
  console.log('Captured', outPath);
}

// Render 180 frames (6 seconds @ 30fps) of a smooth wide-angle arena sweep for the video & GIF
const totalFrames = 180;
for (let f = 0; f < totalFrames; f++) {
  const t = f / totalFrames;
  const ang = -0.85 + t * 2.1;
  const radX = 27 + 4 * Math.sin(t * Math.PI);
  const radZ = 38 + 5 * Math.cos(t * Math.PI);
  const eye = [Math.sin(ang) * radX, 8.2 + 3.5 * Math.sin(t * Math.PI), -Math.cos(ang) * radZ];
  const look = [0, 10.5 - 1.5 * Math.sin(t * Math.PI), 0];
  await page.evaluate(({ eye, look }) => window.renderView(eye, look, 58), { eye, look });
  const framePath = path.join(FRAMES_DIR, `frame_${String(f).padStart(4, '0')}.jpg`);
  await page.screenshot({ path: framePath, type: 'jpeg', quality: 92 });
}
console.log('Captured', totalFrames, 'animation frames');

await browser.close();
server.close();
