 
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = (id) => document.getElementById(id);

const viewport = $('viewport');
const hierarchyList = $('hierarchyList');
const statusText = $('statusText');
const playOverlay = $('playOverlay');

let scene, camera, renderer, orbit, gizmo, clock;
let selected = null;
let playing = false;
let objects = [];
const keys = {};

function status(message) {
  if (statusText) statusText.textContent = message;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.()
    || `object-${Date.now()}-${Math.random()}`;
}

function init() {
  if (!viewport) throw new Error('Missing #viewport');

  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);

  camera = new THREE.PerspectiveCamera(
    55,
    Math.max(viewport.clientWidth, 1) /
      Math.max(viewport.clientHeight, 1),
    0.1,
    1000
  );
  camera.position.set(7, 6, 9);

  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(
    Math.max(viewport.clientWidth, 1),
    Math.max(viewport.clientHeight, 1)
  );
  renderer.shadowMap.enabled = true;
  viewport.appendChild(renderer.domElement);

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0.5, 0);
  orbit.update();

  scene.add(new THREE.HemisphereLight(0xffffff, 0x526078, 2));

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(5, 10, 7);
  sun.castShadow = true;
  scene.add(sun);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({
      color: 0x202b3c,
      roughness: 0.9
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.03;
  ground.receiveShadow = true;
  ground.name = 'Ground';
  scene.add(ground);

  const grid = new THREE.GridHelper(100, 100, 0x58718e, 0x334155);
  grid.position.y = 0;
  scene.add(grid);

  gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value && !playing;
  });
  gizmo.addEventListener('objectChange', updateInspector);
  scene.add(gizmo.getHelper());

  clock = new THREE.Clock();

  bindButtons();
  bindKeyboard();
  bindCanvas();

  addObject('Cube');
  resize();
  animate();

  window.addEventListener('resize', resize);
  status('Ready — Cube added to scene');
}

function createObject(type) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x55a7ff,
    roughness: 0.6
  });

  let mesh;

  switch (type) {
    case 'Sphere':
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.6, 24, 16), material
      );
      break;

    case 'Cylinder':
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1.2, 24), material
      );
      break;

    case 'Terrain':
    case 'Mountains':
    case 'Snow Mountains': {
      const geometry = new THREE.ConeGeometry(
        type === 'Terrain' ? 2 : 1.5,
        type === 'Terrain' ? 0.5 : 2.5,
        5
      );
      material.color.set(
        type.includes('Snow') ? 0xeaf4ff :
        type === 'Terrain' ? 0x478b45 : 0x667080
      );
      mesh = new THREE.Mesh(geometry, material);
      break;
    }

    case 'Tree':
    case 'Snow Tree': {
      mesh = new THREE.Group();
      const trunk = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.18, 1, 8),
        new THREE.MeshStandardMaterial({ color: 0x795234 })
      );
      trunk.position.y = 0.5;
      mesh.add(trunk);

      const leaves = new THREE.Mesh(
        new THREE.ConeGeometry(0.65, 1.7, 8),
        new THREE.MeshStandardMaterial({
          color: type === 'Snow Tree' ? 0xf1f7ff : 0x258347
        })
      );
      leaves.position.y = 1.65;
      mesh.add(leaves);
      break;
    }

    case 'Water':
    case 'Frozen Lake':
      material.color.set(type === 'Water' ? 0x168be0 : 0xaeeaff);
      mesh = new THREE.Mesh(
        new THREE.CircleGeometry(1.5, 32), material
      );
      mesh.rotation.x = -Math.PI / 2;
      break;

    case 'Snow Ground':
      material.color.set(0xeaf3ff);
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(3, 0.12, 3), material
      );
      break;

    case 'Snowfall':
      mesh = new THREE.Group();
      for (let i = 0; i < 45; i++) {
        const flake = new THREE.Mesh(
          new THREE.SphereGeometry(0.035, 6, 6),
          new THREE.MeshBasicMaterial({ color: 0xffffff })
        );
        flake.position.set(
          Math.random() * 4 - 2,
          Math.random() * 3,
          Math.random() * 4 - 2
        );
        mesh.add(flake);
      }
      break;

    case 'Wolf':
    case 'Deer':
    case 'Bear':
    case 'Fox':
    case 'Rabbit':
    case 'Moose':
    case 'Owl':
    case 'Eagle': {
      const animalColors = {
        Wolf: 0x737d8c, Deer: 0xb17b48,
        Bear: 0x543721, Fox: 0xe56e25,
        Rabbit: 0xe0d9d0, Moose: 0x65442e,
        Owl: 0x9c754d, Eagle: 0x60432f
      };
      material.color.set(animalColors[type]);
      mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.55, 16, 12), material
      );
      mesh.scale.set(1.2, 0.8, 0.8);
      break;
    }

    default:
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(1, 1, 1), material
      );
  }

  mesh.name = type;
  mesh.userData.type = type;
  mesh.userData.id = makeId();

  mesh.traverse((part) => {
    if (part.isMesh) {
      part.castShadow = true;
      part.receiveShadow = true;
    }
  });

  return mesh;
}

function addObject(type = 'Cube') {
  if (playing) {
    status('Stop Preview before adding objects');
    return;
  }

  const mesh = createObject(type);
  mesh.name = `${type}_${objects.length + 1}`;
  mesh.position.set(
    (Math.random() - 0.5) * 2,
    ['Water', 'Frozen Lake'].includes(type) ? 0.03 :
    type === 'Snowfall' ? 0 : 0.6,
    (Math.random() - 0.5) * 2
  );

  scene.add(mesh);
  objects.push(mesh);
  selectObject(mesh);
  status(`${type} added`);
}

function selectObject(mesh) {
  selected = mesh;
  if (gizmo) {
    if (mesh) gizmo.attach(mesh);
    else gizmo.detach();
  }
  renderHierarchy();
  updateInspector();
}

function renderHierarchy() {
  if (!hierarchyList) return;

  hierarchyList.replaceChildren();

  objects.forEach((mesh) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'object-row' +
      (mesh === selected ? ' selected' : '');
    row.textContent = `▣ ${mesh.name}`;
    row.addEventListener('click', () => selectObject(mesh));
    hierarchyList.appendChild(row);
  });

  const count = $('objectCount');
  if (count) count.textContent = String(objects.length);
}

function updateInspector() {
  const empty = $('emptyInspector');
  const content = $('inspectorContent');

  if (!selected) {
    if (empty) empty.hidden = false;
    if (content) content.hidden = true;
    return;
  }

  if (empty) empty.hidden = true;
  if (content) content.hidden = false;

  const name = $('objectName');
  const type = $('objectType');

  if (name && name !== document.activeElement) name.value = selected.name;
  if (type) type.textContent = selected.userData.type || 'Object';

  const fields = [
    ['posX', selected.position.x],
    ['posY', selected.position.y],
    ['posZ', selected.position.z],
    ['rotX', THREE.MathUtils.radToDeg(selected.rotation.x)],
    ['rotY', THREE.MathUtils.radToDeg(selected.rotation.y)],
    ['rotZ', THREE.MathUtils.radToDeg(selected.rotation.z)],
    ['scaleX', selected.scale.x],
    ['scaleY', selected.scale.y],
    ['scaleZ', selected.scale.z]
  ];

  fields.forEach(([id, value]) => {
    const input = $(id);
    if (input && input !== document.activeElement) {
      input.value = Number(value.toFixed(2));
    }
  });

  const color = $('objectColor');
  if (color && selected.isMesh) {
    color.value = '#' + selected.material.color.getHexString();
  }
}

function applyInspectorChanges() {
  if (!selected) return;

  const name = $('objectName');
  if (name && name.value.trim()) selected.name = name.value.trim();

  const fields = [
    ['posX', selected.position, 'x', false],
    ['posY', selected.position, 'y', false],
    ['posZ', selected.position, 'z', false],
    ['rotX', selected.rotation, 'x', true],
    ['rotY', selected.rotation, 'y', true],
    ['rotZ', selected.rotation, 'z', true],
    ['scaleX', selected.scale, 'x', false],
    ['scaleY', selected.scale, 'y', false],
    ['scaleZ', selected.scale, 'z', false]
  ];

  fields.forEach(([id, target, axis, degrees]) => {
    const input = $(id);
    if (!input || input.value === '') return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return;
    target[axis] = degrees ? THREE.MathUtils.degToRad(value) : value;
  });

  renderHierarchy();
  updateInspector();
  status('Object updated');
}

function bindButtons() {
  document.querySelectorAll('[data-add]').forEach((button) => {
    button.addEventListener('click', () => addObject(button.dataset.add));
  });

  document.querySelectorAll('[data-transform]').forEach((button) => {
    button.addEventListener('click', () => {
      if (!selected) {
        status('Select an object first');
        return;
      }
      gizmo.setMode(button.dataset.transform);
      document.querySelectorAll('[data-transform]').forEach((item) => {
        item.classList.toggle('active', item === button);
      });
    });
  });

  $('playBtn')?.addEventListener('click', startPreview);
  $('stopBtn')?.addEventListener('click', stopPreview);
  $('overlayStopBtn')?.addEventListener('click', stopPreview);
  $('deleteBtn')?.addEventListener('click', deleteSelected);
  $('duplicateBtn')?.addEventListener('click', duplicateSelected);
  $('saveBtn')?.addEventListener('click', saveScene);
  $('loadBtn')?.addEventListener('click', loadScene);

  const name = $('objectName');
  if (name) name.addEventListener('change', applyInspectorChanges);

  [
    'posX', 'posY', 'posZ', 'rotX', 'rotY', 'rotZ',
    'scaleX', 'scaleY', 'scaleZ'
  ].forEach((id) => {
    $(id)?.addEventListener('change', applyInspectorChanges);
  });

  $('objectColor')?.addEventListener('input', (event) => {
    if (selected?.isMesh) {
      selected.material.color.set(event.target.value);
    }
  });

  $('fileInput')?.addEventListener('change', importSceneFile);
}

function bindCanvas() {
  renderer.domElement.addEventListener('pointerdown', (event) => {
    if (playing) return;

    const rect = renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(
      ((event.clientX - rect.left) / rect.width) * 2 - 1,
      -((event.clientY - rect.top) / rect.height) * 2 + 1
    );

    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(pointer, camera);

    const hits = raycaster.intersectObjects(objects, true);
    if (hits.length) {
      let target = hits[0].object;
      while (target.parent && !objects.includes(target)) {
        target = target.parent;
      }
      if (objects.includes(target)) selectObject(target);
    }
  });
}

function deleteSelected() {
  if (!selected || playing) {
    status(playing ? 'Stop Preview first' : 'Select an object to delete');
    return;
  }

  const target = selected;
  gizmo.detach();
  scene.remove(target);
  objects = objects.filter((item) => item !== target);
  disposeObject(target);
  selected = null;
  renderHierarchy();
  updateInspector();
  status('Object deleted');
}

function duplicateSelected() {
  if (!selected || playing) {
    status('Select an object first');
    return;
  }

  const copy = selected.clone(true);
  copy.name = `${selected.name}_copy`;
  copy.userData = { ...selected.userData, id: makeId() };
  copy.position.x += 1;
  scene.add(copy);
  objects.push(copy);
  selectObject(copy);
  status('Object duplicated');
}

function disposeObject(object) {
  object.traverse((part) => {
    if (part.geometry) part.geometry.dispose();
    if (part.material) {
      const materials = Array.isArray(part.material)
        ? part.material : [part.material];
      materials.forEach((material) => material.dispose());
    }
  });
}

function startPreview() {
  if (playing) return;
  playing = true;
  gizmo.detach();
  orbit.enabled = false;
  if (playOverlay) playOverlay.hidden = false;
  if ($('stopBtn')) $('stopBtn').disabled = false;
  if ($('playBtn')) $('playBtn').disabled = true;
  status('Preview Running — use WASD keys');
}

function stopPreview() {
  playing = false;
  orbit.enabled = true;
  if (playOverlay) playOverlay.hidden = true;
  if ($('stopBtn')) $('stopBtn').disabled = true;
  if ($('playBtn')) $('playBtn').disabled = false;
  if (selected) gizmo.attach(selected);
  status('Preview stopped');
}

function sceneData() {
  return objects.map((mesh) => ({
    type: mesh.userData.type || 'Cube',
    name: mesh.name,
    position: mesh.position.toArray(),
    rotation: mesh.rotation.toArray(),
    scale: mesh.scale.toArray(),
    color: mesh.isMesh ? mesh.material.color.getHex() : 0x55a7ff
  }));
}

function saveScene() {
  try {
    const data = JSON.stringify(sceneData());
    localStorage.setItem('freeforge-scene', data);

    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'freeforge-scene.json';
    link.click();
    URL.revokeObjectURL(url);
    status('Scene saved and JSON exported');
  } catch (error) {
    console.error(error);
    status('Save failed — browser storage unavailable');
  }
}

function restoreScene(data) {
  if (!Array.isArray(data)) throw new Error('Invalid scene file');

  objects.forEach((object) => {
    scene.remove(object);
    disposeObject(object);
  });

  objects = [];
  selected = null;

  data.forEach((item) => {
    const mesh = createObject(item.type || 'Cube');
    mesh.name = item.name || item.type || 'Object';
    mesh.position.fromArray(item.position || [0, 0.6, 0]);
    mesh.rotation.set(
      item.rotation?.[0] || 0,
      item.rotation?.[1] || 0,
      item.rotation?.[2] || 0
    );
    mesh.scale.fromArray(item.scale || [1, 1, 1]);

    if (mesh.isMesh && Number.isFinite(item.color)) {
      mesh.material.color.setHex(item.color);
    }

    scene.add(mesh);
    objects.push(mesh);
  });

  renderHierarchy();
  updateInspector();
}

function loadScene() {
  try {
    const saved = localStorage.getItem('freeforge-scene');
    if (!saved) {
      $('fileInput')?.click();
      status('Choose a FreeForge JSON scene file');
      return;
    }
    restoreScene(JSON.parse(saved));
    status('Scene loaded');
  } catch (error) {
    console.error(error);
    status('Load failed — invalid saved scene');
  }
}

function importSceneFile(event) {
  const file = event.target.files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      restoreScene(JSON.parse(reader.result));
      status('Scene imported');
    } catch (error) {
      console.error(error);
      status('Could not import this JSON file');
    }
  };
  reader.onerror = () => status('File read failed');
  reader.readAsText(file);
  event.target.value = '';
}

function bindKeyboard() {
  window.addEventListener('keydown', (event) => {
    keys[event.key.toLowerCase()] = true;

    if (event.key === 'Escape') stopPreview();

    if (
      !playing &&
      (event.key === 'Delete' || event.key === 'Backspace') &&
      !['INPUT', 'TEXTAREA'].includes(document.activeElement?.tagName)
    ) {
      deleteSelected();
    }
  });

  window.addEventListener('keyup', (event) => {
    keys[event.key.toLowerCase()] = false;
  });
}

function resize() {
  if (!renderer || !camera || !viewport) return;

  const width = Math.max(viewport.clientWidth, 1);
  const height = Math.max(viewport.clientHeight, 1);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);
  if (!renderer || !clock) return;

  const delta = Math.min(clock.getDelta(), 0.05);

  if (playing && selected) {
    const speed = 3 * delta;
    if (keys.w) selected.position.z -= speed;
    if (keys.s) selected.position.z += speed;
    if (keys.a) selected.position.x -= speed;
    if (keys.d) selected.position.x += speed;
  }

  orbit.update();
  renderer.render(scene, camera);
}

try {
  init();
} catch (error) {
  console.error('FreeForge Engine error:', error);
  status('Engine error — check internet and refresh');
}
