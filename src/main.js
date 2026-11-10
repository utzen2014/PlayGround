import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import './style.css';

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);
const root = $('#game-root');
const canvas = $('#game-canvas');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;

const scene = new THREE.Scene();
scene.background = new THREE.Color('#a9c5d1');
scene.fog = new THREE.FogExp2('#a9c5d1', 0.0085);
const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.1, 400);
const clock = new THREE.Clock();
const ambient = new THREE.HemisphereLight('#d9f1ff', '#42513c', 2.15);
scene.add(ambient);
const sun = new THREE.DirectionalLight('#fff0d6', 3.2);
sun.position.set(-35, 60, 25);
scene.add(sun);
const fill = new THREE.DirectionalLight('#7dcfff', 1.25);
fill.position.set(26, 22, -30);
scene.add(fill);
const loader = new GLTFLoader();

const tracks = [
  { id: 'harbor', name: 'NEON LİMANI', label: 'NEON HARBOR', location: 'İSTANBUL · GECE', icon: '◉', color: '#47e1d2', sky: '#102d37', fog: '#15333a', ground: '#244c43', road: '#242e31', light: '#37cfba', scenery: 'harbor', difficulty: 'ORTA' },
  { id: 'alpine', name: 'ALP DAĞI', label: 'ALPINE PASS', location: 'İSVİÇRE · GÜN BATIMI', icon: '⌁', color: '#ffc16b', sky: '#b5c8dc', fog: '#b5c8dc', ground: '#637b6c', road: '#40454a', light: '#ffcb79', scenery: 'alpine', difficulty: 'ZOR' },
  { id: 'desert', name: 'KIZIL VADİ', label: 'RED CANYON', location: 'ARİZONA · GÜNDÜZ', icon: '△', color: '#ff815c', sky: '#e9b083', fog: '#e9b083', ground: '#a66d4c', road: '#47423f', light: '#ff9468', scenery: 'desert', difficulty: 'KOLAY' },
];
const cars = [
  { id: 'sprint', name: 'SPRINT GT', class: 'STREET CLASS · 280 HP', model: '/models/sprint.glb', cost: 0, speed: 76, handling: 68, boost: 54, color: '#ff712f', scale: 1.15, rotate: Math.PI },
  { id: 'shadow', name: 'SHADOW R', class: 'JDM CLASS · 320 HP', model: '/models/shadow.glb', cost: 250, speed: 72, handling: 87, boost: 68, color: '#8faaff', scale: 1.45, rotate: 0 },
  { id: 'gtx', name: 'GTX TURBO', class: 'RACE CLASS · 410 HP', model: '/models/gtx.glb', cost: 600, speed: 94, handling: 72, boost: 82, color: '#fa4b49', scale: 1.15, rotate: Math.PI },
];
const saveDefaults = { coins: 250, owned: ['sprint'], selectedCar: 'sprint', selectedTrack: 'harbor', bestLap: {} };
let save;
try { save = { ...saveDefaults, ...JSON.parse(localStorage.getItem('apex-drive-save') || '{}') }; } catch { save = { ...saveDefaults }; }
save.owned = Array.isArray(save.owned) ? [...new Set(['sprint', ...save.owned])] : ['sprint'];
let selectedCar = Math.max(0, cars.findIndex((car) => car.id === save.selectedCar));
let selectedTrack = Math.max(0, tracks.findIndex((track) => track.id === save.selectedTrack));
let currentCarRoot = null;
let loadedModels = new Map();
let world = new THREE.Group();
scene.add(world);
let carPivot = new THREE.Group();
scene.add(carPivot);
let carModelHolder = new THREE.Group();
carPivot.add(carModelHolder);
let isRacing = false;
let isPaused = false;
let raceStarted = false;
let countdownTimer = null;
let playerT = 0;
let lateral = 0;
let steering = 0;
let speed = 0;
let totalDistance = 0;
let collected = 0;
let lap = 1;
let previousT = 0;
let rewardClaimed = false;
let particles = [];
let objects = [];
let pickups = [];
let raceStartTime = 0;
const keys = new Set();
const touchKeys = new Set();
const TRACK_A = 47;
const TRACK_B = 28;
const RACE_PACE = 18;
const lanes = [-8.4, 0, 8.4];

function persist() { localStorage.setItem('apex-drive-save', JSON.stringify(save)); }
function setCoinsUI() { $('#coin-balance').textContent = Math.floor(save.coins).toLocaleString('tr-TR'); }
function disposeGroup(group) {
  group.traverse((object) => {
    if (object.geometry && object.geometry !== sharedGeometry) object.geometry.dispose();
    if (object.material) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => {
      if (material.map && !material.userData.shared) material.map.dispose();
    });
  });
}
const sharedGeometry = new THREE.BufferGeometry();

function roundedRectShape(w, h, r) {
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + r, -h / 2); shape.lineTo(w / 2 - r, -h / 2); shape.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  shape.lineTo(w / 2, h / 2 - r); shape.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2); shape.lineTo(-w / 2 + r, h / 2); shape.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r); shape.lineTo(-w / 2, -h / 2 + r); shape.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  return shape;
}
function mat(color, roughness = 0.8, metalness = 0) { return new THREE.MeshStandardMaterial({ color, roughness, metalness }); }
function mesh(geometry, material, position, parent = world) { const item = new THREE.Mesh(geometry, material); item.position.set(...position); parent.add(item); return item; }
function ellipsePoint(t, offset = 0) { const a = TRACK_A + Math.cos(t) * offset; const b = TRACK_B + Math.cos(t) * offset * 0.55; return new THREE.Vector3(Math.cos(t) * a, 0, Math.sin(t) * b); }
function ellipseTangent(t) { return new THREE.Vector3(-Math.sin(t) * TRACK_A, 0, Math.cos(t) * TRACK_B).normalize(); }

const roadMaterial = new THREE.MeshStandardMaterial({ color: '#30383b', roughness: 0.94, metalness: 0.02 });
const grassMaterial = mat('#6c876e');
const curbRed = mat('#ed5a4d'); const curbWhite = mat('#e9e9df');
const markingMaterial = new THREE.MeshBasicMaterial({ color: '#f5f0d7' });
function makeLoopRibbon(innerA, innerB, outerA, outerB, y, material, segments = 256) {
  const positions = [], indices = [];
  for (let i = 0; i <= segments; i++) {
    const t = (i / segments) * Math.PI * 2;
    positions.push(Math.cos(t) * innerA, y, Math.sin(t) * innerB, Math.cos(t) * outerA, y, Math.sin(t) * outerB);
    if (i < segments) { const j = i * 2; indices.push(j, j + 2, j + 1, j + 1, j + 2, j + 3); }
  }
  const geometry = new THREE.BufferGeometry(); geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3)); geometry.setIndex(indices); geometry.computeVertexNormals();
  return mesh(geometry, material, [0, 0, 0]);
}
function createTree(position, scale, palette, pine = false) {
  const group = new THREE.Group(); group.position.copy(position); group.scale.setScalar(scale); world.add(group);
  const trunk = mesh(new THREE.CylinderGeometry(0.13, 0.2, 1.1, 7), mat(palette.trunk), [0, 0.55, 0], group);
  trunk.castShadow = true;
  if (pine) {
    for (let i = 0; i < 3; i++) { const leaf = mesh(new THREE.ConeGeometry(0.72 - i * 0.12, 1.15, 7), mat(palette.leaf), [0, 1.25 + i * 0.58, 0], group); leaf.castShadow = true; }
  } else {
    const crown = mesh(new THREE.IcosahedronGeometry(0.78, 1), mat(palette.leaf), [0, 1.45, 0], group); crown.castShadow = true;
    const crown2 = mesh(new THREE.IcosahedronGeometry(0.55, 0), mat(palette.leaf2 || palette.leaf, 0.95), [0.35, 1.75, 0.12], group); crown2.castShadow = true;
  }
  objects.push(group); return group;
}
function createTrackWorld(trackIndex) {
  world.traverse((item) => { if (item.geometry && item.geometry !== sharedGeometry) item.geometry.dispose(); if (item.material) (Array.isArray(item.material) ? item.material : [item.material]).forEach((m) => { if (m !== roadMaterial && m !== grassMaterial && m !== curbRed && m !== curbWhite && m !== markingMaterial) m.dispose(); }); });
  scene.remove(world); world = new THREE.Group(); scene.add(world); objects = []; pickups = [];
  const track = tracks[trackIndex];
  scene.background.set(track.sky); scene.fog.color.set(track.fog); scene.fog.density = trackIndex === 0 ? 0.0065 : 0.008;
  grassMaterial.color.set(track.ground); roadMaterial.color.set(track.road);
  sun.color.set(trackIndex === 1 ? '#ffd6aa' : trackIndex === 2 ? '#fff1cb' : '#dcf8ff');
  ambient.color.set(trackIndex === 0 ? '#bce7ed' : '#d9efff');
  const ground = mesh(new THREE.PlaneGeometry(500, 500), grassMaterial, [0, -0.5, 0]); ground.rotation.x = -Math.PI / 2;
  makeLoopRibbon(TRACK_A - 11.5, TRACK_B - 11.5, TRACK_A + 11.5, TRACK_B + 11.5, 0, roadMaterial);
  makeLoopRibbon(TRACK_A - 12.05, TRACK_B - 12.05, TRACK_A - 10.1, TRACK_B - 10.1, 0.015, curbWhite);
  makeLoopRibbon(TRACK_A + 10.1, TRACK_B + 10.1, TRACK_A + 12.05, TRACK_B + 12.05, 0.015, curbWhite);
  const segments = 256;
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    if (i % 2 === 0) {
      const p1 = ellipsePoint(a, 11.15), p2 = ellipsePoint(a + Math.PI / 64, 11.15);
      const stripe = mesh(new THREE.BoxGeometry(1.15, 0.035, 0.42), i % 4 === 0 ? curbRed : curbWhite, [(p1.x + p2.x) / 2, 0.055, (p1.z + p2.z) / 2]); stripe.rotation.y = Math.atan2(p2.x - p1.x, p2.z - p1.z); stripe.rotation.y += Math.PI / 2;
      const p3 = ellipsePoint(a, -11.15), p4 = ellipsePoint(a + Math.PI / 64, -11.15);
      const stripe2 = mesh(new THREE.BoxGeometry(1.15, 0.035, 0.42), i % 4 === 0 ? curbWhite : curbRed, [(p3.x + p4.x) / 2, 0.055, (p3.z + p4.z) / 2]); stripe2.rotation.y = Math.atan2(p4.x - p3.x, p4.z - p3.z) + Math.PI / 2;
    }
  }
  for (let i = 0; i < 40; i++) {
    const p = ellipsePoint(i / 40 * Math.PI * 2, 0);
    const marker = mesh(new THREE.BoxGeometry(0.12, 0.03, 1.15), markingMaterial, [p.x, 0.025, p.z]);
    marker.rotation.y = Math.atan2(-p.z / (TRACK_B * TRACK_B), -p.x / (TRACK_A * TRACK_A)) + Math.PI / 2;
  }
  // Start/finish stripe on the southern straight.
  for (let i = 0; i < 12; i++) {
    mesh(new THREE.BoxGeometry(2.2, 0.04, 1.05), i % 2 ? curbWhite : mat('#22282a'), [-3.3 + i * 0.6, 0.06, TRACK_B + 0.2]);
  }
  createTrackScenery(track);
  createPickups();
  renderer.render(scene, camera);
}
function createTrackScenery(track) {
  const palette = track.id === 'alpine' ? { trunk: '#574434', leaf: '#38584b', leaf2: '#547762' } : track.id === 'desert' ? { trunk: '#80573d', leaf: '#477651', leaf2: '#679458' } : { trunk: '#4c4a3e', leaf: '#52714f', leaf2: '#78915c' };
  for (let i = 0; i < 46; i++) {
    const t = i / 46 * Math.PI * 2 + 0.08;
    const side = i % 2 === 0 ? 1 : -1;
    const p = ellipsePoint(t, side * (19 + (i % 4) * 2.4));
    if (track.id === 'desert') {
      const cacti = new THREE.Group(); cacti.position.copy(p); world.add(cacti);
      const body = mesh(new THREE.CylinderGeometry(0.3, 0.38, 2.8 + (i % 3) * 0.3, 7), mat('#568256'), [0, 1.4, 0], cacti); body.castShadow = true;
      const arm = mesh(new THREE.CylinderGeometry(0.19, 0.22, 1.05, 7), mat('#568256'), [0.55, 1.45, 0], cacti); arm.rotation.z = -0.8;
      mesh(new THREE.CylinderGeometry(0.18, 0.2, 0.75, 7), mat('#568256'), [0.72, 1.95, 0], cacti); objects.push(cacti);
    } else createTree(p, track.id === 'alpine' ? 1.2 + (i % 4) * 0.16 : 0.8 + (i % 4) * 0.17, palette, track.id === 'alpine');
  }
  if (track.id === 'harbor') {
    const buildingMat = [mat('#23454c'), mat('#31535a'), mat('#41636a')];
    for (let i = 0; i < 15; i++) {
      const x = -67 + i * 9.5;
      const height = 8 + ((i * 13) % 17);
      const building = mesh(new THREE.BoxGeometry(7.5, height, 7), buildingMat[i % 3], [x, height / 2 - 0.4, -63 - (i % 3) * 4]); building.castShadow = true; building.receiveShadow = true;
      for (let row = 0; row < Math.floor(height / 2); row++) for (let col = 0; col < 2; col++) {
        const window = mesh(new THREE.PlaneGeometry(0.7, 0.7), new THREE.MeshBasicMaterial({ color: i % 4 === 0 ? '#f5bb78' : '#82ded6' }), [x - 1.8 + col * 3.5, 1 + row * 2, -59.45 - (i % 3) * 4]);
        window.material.transparent = true; window.material.opacity = 0.54;
      }
    }
  }
  if (track.id === 'alpine') {
    const mountain = mat('#8293a0');
    for (let i = 0; i < 13; i++) {
      const angle = i / 13 * Math.PI * 2;
      const peak = mesh(new THREE.ConeGeometry(14 + i % 3 * 3, 30 + i % 5 * 4, 5), mountain, [Math.cos(angle) * 102, 14, Math.sin(angle) * 75]); peak.rotation.y = i * 0.7;
    }
  }
  if (track.id === 'desert') {
    for (let i = 0; i < 12; i++) {
      const angle = i / 12 * Math.PI * 2;
      const rock = mesh(new THREE.ConeGeometry(17 + i % 4 * 3, 18 + i % 3 * 5, 5), mat(i % 2 ? '#a66c4e' : '#bd8058'), [Math.cos(angle) * 104, 7, Math.sin(angle) * 82]); rock.rotation.y = i * 0.8; rock.rotation.z = 0.04;
    }
  }
  // Decorative glowing track-side gates and lamps.
  for (let i = 0; i < 14; i++) {
    const t = i / 14 * Math.PI * 2;
    const p = ellipsePoint(t, 16.8);
    const post = mesh(new THREE.CylinderGeometry(0.08, 0.08, 5.3, 8), mat('#212b30', 0.35, 0.7), [p.x, 2.65, p.z]);
    const glow = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.18, 0.22), new THREE.MeshBasicMaterial({ color: track.light })); glow.position.set(p.x, 5.35, p.z); world.add(glow);
    if (track.id === 'harbor') { const lamp = new THREE.PointLight(track.light, 9, 14, 2); lamp.position.copy(glow.position); world.add(lamp); }
  }
  const sign = makeBillboard(track.label, track.light);
  const p = ellipsePoint(0.45, 23); sign.position.set(p.x, 7, p.z); sign.rotation.y = Math.PI;
}
function makeBillboard(text, color) {
  const canvas = document.createElement('canvas'); canvas.width = 512; canvas.height = 128;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#09171b'; ctx.fillRect(0, 0, 512, 128); ctx.strokeStyle = color; ctx.lineWidth = 6; ctx.strokeRect(4, 4, 504, 120);
  ctx.fillStyle = color; ctx.font = '800 48px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 256, 66);
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
  const board = mesh(new THREE.PlaneGeometry(12, 3), new THREE.MeshBasicMaterial({ map: texture, side: THREE.DoubleSide }), [0, 0, 0]);
  const postMaterial = mat('#38434a');
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), postMaterial, [-4.6, -2.2, 0], board);
  mesh(new THREE.CylinderGeometry(0.15, 0.15, 5, 8), postMaterial, [4.6, -2.2, 0], board);
  world.add(board); objects.push(board); return board;
}
function createPickups() {
  const gold = new THREE.MeshStandardMaterial({ color: '#ffd45c', emissive: '#b06d0c', emissiveIntensity: 0.55, metalness: 0.78, roughness: 0.22 });
  for (let i = 0; i < 21; i++) {
    const t = (i / 21 * Math.PI * 2 + 0.55) % (Math.PI * 2);
    const lane = lanes[(i + 1) % lanes.length];
    const p = ellipsePoint(t, lane);
    const coin = new THREE.Mesh(new THREE.TorusGeometry(0.47, 0.12, 8, 20), gold);
    coin.position.set(p.x, 1.28, p.z); coin.rotation.x = Math.PI / 2; coin.userData.t = t; coin.userData.lane = lane; coin.userData.collected = false;
    const core = new THREE.Mesh(new THREE.CylinderGeometry(0.2, 0.2, 0.1, 12), gold); core.rotation.x = Math.PI / 2; coin.add(core); world.add(coin); pickups.push(coin);
  }
}

async function getCarModel(car) {
  if (loadedModels.has(car.id)) return loadedModels.get(car.id);
  const gltf = await loader.loadAsync(car.model);
  const model = gltf.scene;
  model.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const max = Math.max(size.x, size.y, size.z);
  const scale = 5.6 / max * car.scale;
  model.scale.setScalar(scale);
  model.updateMatrixWorld(true);
  const normalized = new THREE.Box3().setFromObject(model);
  const center = normalized.getCenter(new THREE.Vector3());
  model.position.sub(center);
  model.position.y += normalized.getSize(new THREE.Vector3()).y * 0.16;
  model.rotation.y = car.rotate;
  model.traverse((item) => { if (item.isMesh) { item.castShadow = true; item.receiveShadow = true; if (item.material) { const materials = Array.isArray(item.material) ? item.material : [item.material]; materials.forEach((m) => { if ('envMapIntensity' in m) m.envMapIntensity = 1.1; }); } } });
  loadedModels.set(car.id, model);
  return model;
}
async function showCar(carIndex = selectedCar) {
  selectedCar = (carIndex + cars.length) % cars.length;
  const car = cars[selectedCar];
  $('#car-name').textContent = car.name; $('#car-class').textContent = car.class;
  $('#garage-count').textContent = `${String(selectedCar + 1).padStart(2, '0')} / 03`;
  $('#car-price').innerHTML = save.owned.includes(car.id) ? '' : `◆ ${car.cost}`;
  const bars = [['HIZ', car.speed], ['KONTROL', car.handling], ['NİTRO', car.boost]];
  $('#car-stats').innerHTML = bars.map(([name, value]) => `<div class="stat"><div><span>${name}</span><b>${value}</b></div><i><em style="width:${value}%"></em></i></div>`).join('');
  $('#car-dots').innerHTML = cars.map((_, i) => `<button class="car-dot ${i === selectedCar ? 'active' : ''}" data-car-dot="${i}" aria-label="${cars[i].name}"></button>`).join('');
  $$('.car-dot').forEach((button) => button.addEventListener('click', () => showCar(Number(button.dataset.carDot))));
  const owned = save.owned.includes(car.id);
  $('#buy-car').classList.toggle('hidden', owned);
  $('#garage-note').classList.toggle('hidden', !owned);
  $('#buy-car').disabled = save.coins < car.cost;
  $('#buy-car').innerHTML = save.coins < car.cost ? `◆ <span>${car.cost - save.coins} COIN EKSİK</span>` : `◆ <span>ARACI AL · ${car.cost}</span>`;
  $('#garage-count').style.color = car.color;
  $('#car-name').style.textShadow = `0 0 32px ${car.color}55`;
  try {
    const loaded = await getCarModel(car);
    carModelHolder.clear(); currentCarRoot = loaded;
    // Shared prototypes cannot be attached to both preview and race. Clone keeps authored glTF materials and details intact.
    currentCarRoot = loaded.clone(true); carModelHolder.add(currentCarRoot);
  } catch (error) { console.error('Araç modeli yüklenemedi:', error); }
}
function drawTrackCards() {
  $('#track-list').innerHTML = tracks.map((track, i) => `<button class="track-card ${i === selectedTrack ? 'selected' : ''}" data-track="${i}" style="--track-accent:${track.color}"><span class="track-icon">${track.icon}</span><span class="track-meta"><b>${track.name}</b><small>${track.location}</small></span><span class="track-diff">${track.difficulty}</span><span class="track-check">✓</span></button>`).join('');
  $$('.track-card').forEach((button) => button.addEventListener('click', () => chooseTrack(Number(button.dataset.track))));
}
function chooseTrack(index) { selectedTrack = index; save.selectedTrack = tracks[index].id; persist(); drawTrackCards(); createTrackWorld(selectedTrack); }

function resize() {
  const width = window.innerWidth, height = window.innerHeight;
  renderer.setSize(width, height); renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, width < 700 ? 1.35 : 1.8));
  camera.aspect = width / height; camera.fov = width < 600 ? 50 : 42; camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

function placeCar(t, side = 0) {
  const p = ellipsePoint(t, side); const tangent = ellipseTangent(t);
  carPivot.position.set(p.x, 0.08, p.z);
  carPivot.rotation.y = Math.atan2(tangent.x, tangent.z);
  carPivot.rotation.y += steering * 0.07;
  carModelHolder.rotation.z = -steering * 0.08;
}
function updateCamera(delta) {
  const p = ellipsePoint(playerT, lateral); const tangent = ellipseTangent(playerT);
  const facing = Math.atan2(tangent.x, tangent.z);
  const behind = new THREE.Vector3(-Math.sin(facing) * 11, 6.5, -Math.cos(facing) * 11);
  const target = new THREE.Vector3(p.x, 1.3, p.z);
  const desired = target.clone().add(behind);
  camera.position.lerp(desired, 1 - Math.exp(-delta * 4.2));
  camera.lookAt(target.clone().add(tangent.clone().multiplyScalar(5)));
}
function updateMenuCamera(time) {
  const car = cars[selectedCar];
  const target = new THREE.Vector3(8, 1.1, 0);
  const radius = 15.5;
  const angle = time * 0.09;
  camera.position.lerp(new THREE.Vector3(target.x + Math.cos(angle) * radius, 6.7, target.z + Math.sin(angle) * radius), 0.04);
  camera.lookAt(target);
  carPivot.position.set(7.7, 0.16, 0);
  carPivot.rotation.y = -0.5 + Math.sin(time * 0.24) * 0.09;
  carModelHolder.rotation.z = Math.sin(time * 0.75) * 0.016;
}
function getInput() {
  return {
    left: keys.has('a') || keys.has('arrowleft') || touchKeys.has('left') || touchKeys.has('steer-left'),
    right: keys.has('d') || keys.has('arrowright') || touchKeys.has('right') || touchKeys.has('steer-right'),
    up: keys.has('w') || keys.has('arrowup') || touchKeys.has('up') || touchKeys.has('accelerate'),
    down: keys.has('s') || keys.has('arrowdown') || touchKeys.has('down') || touchKeys.has('brake'),
  };
}
function collectPickups() {
  for (const coin of pickups) {
    if (coin.userData.collected) continue;
    let diff = Math.abs(((coin.userData.t - playerT + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
    if (diff < 0.065 && Math.abs(coin.userData.lane - lateral) < 3.1) {
      coin.userData.collected = true; coin.visible = false; collected += 1; $('#race-coins').textContent = collected; showToast('+10 COIN'); playCoinSound();
    }
  }
}
function tickRace(delta) {
  if (!isRacing || isPaused || !raceStarted) return;
  const input = getInput();
  const maxSpeed = input.up ? RACE_PACE : RACE_PACE * 0.72;
  if (input.up) speed = Math.min(maxSpeed, speed + delta * 0.82);
  else speed = Math.max(RACE_PACE * 0.32, speed - delta * 0.34);
  if (input.down) speed = Math.max(RACE_PACE * 0.2, speed - delta * 1.15);
  const steerInput = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  steering += (steerInput - steering) * Math.min(1, delta * 6);
  lateral = THREE.MathUtils.clamp(lateral + steering * delta * (speed * 0.18), -10.2, 10.2);
  const pace = speed * (0.9 + cars[selectedCar].speed / 380);
  previousT = playerT;
  const distanceStep = pace * delta / (TRACK_A * 0.92);
  playerT = (playerT + distanceStep) % (Math.PI * 2);
  totalDistance += distanceStep;
  placeCar(playerT, lateral); updateCamera(delta); collectPickups();
  const completedLaps = Math.floor(totalDistance / (Math.PI * 2));
  if (completedLaps >= lap) {
    lap = completedLaps + 1;
    if (lap > 3) finishRace(); else { $('#lap-count').textContent = lap; showToast(`TUR ${lap} / 3`); }
  }
  const progress = (totalDistance % (Math.PI * 2)) / (Math.PI * 2);
  $('#lap-progress').style.width = `${Math.max(3, progress * 100)}%`;
  const kmh = Math.round(speed * 6.5);
  $('#speed-value').textContent = String(kmh).padStart(3, '0'); $('#speed-meter-fill').style.width = `${Math.min(100, kmh / 2.8)}%`;
}
function animate() {
  requestAnimationFrame(animate);
  const delta = Math.min(clock.getDelta(), 0.05); const time = clock.elapsedTime;
  if (isRacing && raceStarted && !isPaused) tickRace(delta); else if (!isRacing) updateMenuCamera(time);
  for (const coin of pickups) if (coin.visible) { coin.rotation.z += delta * 1.7; coin.position.y = 1.25 + Math.sin(time * 3 + coin.userData.t * 8) * 0.16; }
  renderer.render(scene, camera);
}

function showToast(message) { const toast = $('#toast'); toast.textContent = message; toast.classList.remove('hidden'); clearTimeout(showToast.timeout); showToast.timeout = setTimeout(() => toast.classList.add('hidden'), 1050); }
function playCoinSound() {
  try { const context = new AudioContext(); const oscillator = context.createOscillator(); const gain = context.createGain(); oscillator.type = 'sine'; oscillator.frequency.setValueAtTime(930, context.currentTime); oscillator.frequency.exponentialRampToValueAtTime(1520, context.currentTime + 0.09); gain.gain.setValueAtTime(0.085, context.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, context.currentTime + 0.16); oscillator.connect(gain); gain.connect(context.destination); oscillator.start(); oscillator.stop(context.currentTime + 0.16); oscillator.onended = () => context.close(); } catch { /* Audio is an optional reward cue. */ }
}
function startRace() {
  if (!save.owned.includes(cars[selectedCar].id)) { showToast('ÖNCE ARACI SATIN AL'); return; }
  save.selectedCar = cars[selectedCar].id; save.selectedTrack = tracks[selectedTrack].id; persist();
  isRacing = true; isPaused = false; raceStarted = false; rewardClaimed = false; speed = 0; playerT = 0; totalDistance = 0; lateral = 0; steering = 0; collected = 0; lap = 1; raceStartTime = performance.now();
  $('#menu-screen').classList.add('hidden'); $('#race-hud').classList.remove('hidden'); $('#race-track-name').textContent = tracks[selectedTrack].name; $('#lap-count').textContent = '1'; $('#race-coins').textContent = '0'; $('#lap-progress').style.width = '0%'; $('#speed-value').textContent = '000';
  pickups.forEach((coin) => { coin.visible = true; coin.userData.collected = false; });
  placeCar(playerT, 0); updateCamera(1); runCountdown();
}
function runCountdown() {
  const element = $('#countdown'); const number = $('#countdown-number'); element.classList.remove('hidden'); let count = 3; number.textContent = count;
  clearInterval(countdownTimer); countdownTimer = setInterval(() => {
    if (!isRacing || isPaused) return;
    count -= 1;
    if (count > 0) number.textContent = count;
    else if (count === 0) number.textContent = 'GO!';
    else { clearInterval(countdownTimer); element.classList.add('hidden'); raceStarted = true; }
  }, 720);
}
function finishRace() {
  if (rewardClaimed) return; rewardClaimed = true; isRacing = false; raceStarted = false;
  const bonus = 90 + collected * 10; save.coins += bonus; save.bestLap[tracks[selectedTrack].id] = Math.min(save.bestLap[tracks[selectedTrack].id] || Infinity, performance.now() - raceStartTime); persist(); setCoinsUI();
  $('#race-hud').classList.add('hidden'); $('#result-overlay').classList.remove('hidden'); $('#reward-amount').textContent = bonus;
  $('#result-title').textContent = collected > 8 ? 'PODYUM SENİN!' : 'GÜZEL SÜRÜŞ!'; $('#result-copy').textContent = `${tracks[selectedTrack].name} pistinde ${collected} coin topladın.`;
}
function pauseRace() {
  if (!isRacing || isPaused) return;
  isPaused = true; $('#pause-overlay').classList.remove('hidden');
}
function resumeRace() {
  if (!isRacing || !isPaused) return;
  isPaused = false; $('#pause-overlay').classList.add('hidden');
}
function backToGarage() {
  isRacing = false; isPaused = false; raceStarted = false; clearInterval(countdownTimer);
  keys.clear(); touchKeys.clear();
  document.querySelectorAll('[data-control]').forEach((button) => button.classList.remove('pressed'));
  $('#countdown').classList.add('hidden'); $('#pause-overlay').classList.add('hidden'); $('#result-overlay').classList.add('hidden'); $('#race-hud').classList.add('hidden'); $('#menu-screen').classList.remove('hidden');
  save.selectedTrack = tracks[selectedTrack].id; persist(); createTrackWorld(selectedTrack); showCar(selectedCar);
}

$('#car-prev').addEventListener('click', () => showCar(selectedCar - 1)); $('#car-next').addEventListener('click', () => showCar(selectedCar + 1));
$('#buy-car').addEventListener('click', () => {
  const car = cars[selectedCar]; if (save.owned.includes(car.id)) return;
  if (save.coins < car.cost) { showToast('DAHA FAZLA COIN TOPLA'); return; }
  save.coins -= car.cost; save.owned.push(car.id); save.selectedCar = car.id; persist(); setCoinsUI(); showCar(selectedCar); showToast('ARAÇ GARAJINA EKLENDİ');
});
$('#start-race').addEventListener('click', startRace); $('#pause-button').addEventListener('click', pauseRace); $('#resume-race').addEventListener('click', resumeRace); $('#exit-race').addEventListener('click', backToGarage); $('#back-to-garage').addEventListener('click', backToGarage);
window.addEventListener('keydown', (event) => {
  const key = event.key.toLowerCase();
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(key)) event.preventDefault();
  keys.add(key);
  if ((key === 'escape' || key === 'p') && isRacing) isPaused ? resumeRace() : pauseRace();
  if (key === 'enter' && !isRacing) startRace();
});
window.addEventListener('keyup', (event) => keys.delete(event.key.toLowerCase()));
document.querySelectorAll('[data-control]').forEach((button) => {
  const control = button.dataset.control;
  const release = (event) => {
    if (event?.pointerId !== undefined && button.dataset.pointerId !== String(event.pointerId)) return;
    const pointerId = button.dataset.pointerId;
    delete button.dataset.pointerId; touchKeys.delete(control); button.classList.remove('pressed');
    if (pointerId && button.hasPointerCapture?.(Number(pointerId))) {
      try { button.releasePointerCapture(Number(pointerId)); } catch { /* Pointer may already have been canceled. */ }
    }
  };
  button.addEventListener('pointerdown', (event) => {
    event.preventDefault();
    if (button.dataset.pointerId) return;
    button.dataset.pointerId = String(event.pointerId);
    try { button.setPointerCapture?.(event.pointerId); } catch { /* Synthetic or already-canceled pointer. */ }
    touchKeys.add(control); button.classList.add('pressed');
  });
  button.addEventListener('pointerup', release); button.addEventListener('pointercancel', release); button.addEventListener('lostpointercapture', release);
});

setCoinsUI(); drawTrackCards(); selectedTrack = tracks.findIndex((track) => track.id === save.selectedTrack); if (selectedTrack < 0) selectedTrack = 0;
createTrackWorld(selectedTrack); showCar(selectedCar);
Promise.all([loader.loadAsync('/models/sprint.glb')]).finally(() => { $('#loading-screen').classList.add('fade-out'); setTimeout(() => $('#loading-screen').remove(), 500); });
animate();
