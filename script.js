 
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = (id) => document.getElementById(id);

const viewport = $('viewport');
const hierarchyList = $('hierarchyList');
const inspectorContent = $('inspectorContent');
const emptyInspector = $('emptyInspector');
const statusText = $('statusText');
const playOverlay = $('playOverlay');

if (!viewport) {
  throw new Error('Viewport element not found. Check index.html.');
}

let scene, camera, renderer, orbit, gizmo, clock;
let selected = null;
let playing = false;
let objectCount = 0;
const objects = [];
const keys = {};

function status(message) {
  if (statusText) statusText.textContent = message;
}

function makeId() {
  return globalThis.crypto?.randomUUID?.()
    ?? `object-${Date.now()}-${++objectCount}`;
}

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x111827);

  camera = new THREE.PerspectiveCamera(
    55,
    Math.max(viewport.clientWidth, 1) /
      Math.max(viewport.clientHeight, 1),
    0.1,
    1000
  );
  camera.position.set(6, 5, 8);
  camera.lookAt(0, 0, 0);

  renderer = new THREE.WebGLRenderer({
    antialias: true,
    alpha: false
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.setSize(
    Math.max(viewport.clientWidth, 1),
    Math.max(viewport.clientHeight, 1)
  );
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  viewport.appendChild(renderer.domElement);

  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true;
  orbit.target.set(0, 0.5, 0);
  orbit.update();

  const ambient = new THREE.HemisphereLight(0xffffff, 0x536078, 2);
  scene.add(ambient);

  const sun = new THREE.DirectionalLight(0xffffff, 2.5);
  sun.position.set(5, 10, 7);
  sun.castShadow = true;
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(200, 200),
    new THREE.MeshStandardMaterial({
      color: 0x202b3c,
      roughness: 0.9
    })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -0.03;
  floor.receiveShadow = true;
  floor.name = 'Ground';
  floor.userData.isGround = true;
  scene.add(floor);

  const grid = new THREE.GridHelper(100, 100, 0x58718e, 0x334155);
  grid.position.y = 0;
  scene.add(grid);

  gizmo = new TransformControls(camera, renderer.domElement);
  gizmo.addEventListener('dragging-changed', (event) => {
    orbit.enabled = !event.value;
  });
  gizmo.addEventListener('objectChange', () => {
    if (selected) renderInspector();
  });
  scene.add(gizmo.getHelper());

  clock = new THREE.Clock();

  addObject('Cube');
  select(null);

  bindButtons();
  bindKeyboard();
  bindCanvas();
  resize();
  animate();

  status('Ready — Cube added to scene');
}

function createMesh(type) {
  const material = new THREE.MeshStandardMaterial({
    color: 0x55a7ff,
    roughness: 0.55,
    metalness: 0.05
  });

  let geometry;

  switch (type) {
    case 'Cube':
      geometry = new THREE.BoxGeometry(1, 1, 1);
      break;
    case 'Sphere':
      geometry = new THREE.SphereGeometry(0.6, 32, 20);
      break;
    case 'Cylinder':
      geometry = new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32);
      break;
    case 'Cone':
      geometry = new THREE.ConeGeometry(0.6, 1.2, 32);
      break;
    case 'Torus':
      geometry = new THREE.TorusGeometry(0.5, 0.18, 16, 48);
      break;
    case 'Plane':
      geometry = new THREE.PlaneGeometry(1.5, 1.5);
      material.side = THREE.DoubleSide;
      break;
    default:
      geometry = new THREE.BoxGeometry(1, 1, 1);
  }

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

function addObject(type = 'Cube') {
  if (playing) {
    status('Stop Preview before adding objects.');
    return;
  }

  const mesh = createMesh(type);
  mesh.name = `${type}_${objects.length + 1}`;
  mesh.userData.id = makeId();
  mesh.position.set(
    (Math.random() - 0.5) * 2,
    type === 'Plane' ? 0.02 : 0.6,
    (Math.random() - 0.5) * 2
  );

  scene.add(mesh);
  objects.push(mesh);
  select(mesh);
  renderHierarchy();
  status(`${type} added`);
}

function select(mesh) {
  selected = mesh;

  if (gizmo) {
    if (mesh && mesh.isMesh && !mesh.userData.isGround) {
      gizmo.attach(mesh);
    } else {
      gizmo.detach();
    }
  }

  renderHierarchy();
  renderInspector();
}

function renderHierarchy() {
  if (!hierarchyList) return;

  hierarchyList.replaceChildren();

  if (!objects.length) {
    const empty = document.createElement('div');
    empty.className = 'empty-inspector';
    empty.textContent = 'No objects in scene';
    hierarchyList.appendChild(empty);
    return;
  }

  for (const mesh of objects) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'object-row' +
      (selected === mesh ? ' selected' : '');
    row.textContent = `▣ ${mesh.name}`;
    row.addEventListener('click', () => select(mesh));
    hierarchyList.appendChild(row);
  }
}

function renderInspector() {
  if (!inspectorContent) return;

  inspectorContent.replaceChildren();

  if (!selected) {
    if (emptyInspector) emptyInspector.hidden = false;
    return;
  }

  if (emptyInspector) emptyInspector.hidden = true;

  const section = document.createElement('section');
  section.className = 'property-section';

  const heading = document.createElement('h3');
  heading.textContent = 'OBJECT';
  section.appendChild(heading);

  const nameLabel = document.createElement('label');
  nameLabel.textContent = 'Name';

  const nameInput = document.createElement('input');
  nameInput.value = selected.name;
  nameInput.addEventListener('change', () => {
    const name = nameInput.value.trim();
    if (name) {
      selected.name = name;
      renderHierarchy();
      status('Object renamed');
    }
  });

  nameLabel.appendChild(nameInput);
  section.appendChild(nameLabel);

  addVectorFields(section, 'Position', selected.position, 0.1);
  addVectorFields(section, 'Rotation', selected.rotation, 0.1);
  addVectorFields(section, 'Scale', selected.scale, 0.1);

  inspectorContent.appendChild(section);
}

function addVectorFields(parent, title, vector, step) {
  const label = document.createElement('label');
  label.textContent = title;

  const row = document.createElement('div');
  row.className = 'vector-inputs';

  for (const axis of ['x', 'y', 'z']) {
    const input = document.createElement('input');
    input.type = 'number';
    input.step = String(step);
    input.setAttribute('aria-label', `${title} ${axis}`);
    input.value = Number(vector[axis].toFixed(2));

    input.addEventListener('change', () => {
      const value = Number(input.value);
      if (!Number.isFinite(value)) return;

      vector[axis] = value;
      if (selected) gizmo.updateMatrixWorld();
      status(`${title} updated`);
    });

    row.appendChild(input);
  }

  label.appendChild(row);
  parent.appendChild(label);
}

function bindButtons() {
  const actions = {
    addCube: () => addObject('Cube'),
    addSphere: () => addObject('Sphere'),
    addCylinder: () => addObject('Cylinder'),
    addCone: () => addObject('Cone'),
    addTorus: () => addObject('Torus'),
    addPlane: () => addObject('Plane'),
    toolMove: () => setTransformMode('translate'),
    toolRotate: () => setTransformMode('rotate'),
    toolScale: () => setTransformMode('scale'),
    playButton: startPreview,
    stopButton: stopPreview,
    stopPreviewButton: stopPreview,
    deleteButton: deleteSelected,
    deleteObject: deleteSelected,
    saveButton: saveScene,
    loadButton: loadScene
  };

  for (const [id, action] of Object.entries(actions)) {
    const element = $(id);
    if (element) {
      element.addEventListener('click', action);
    }
  }

  document.querySelectorAll('[data-add-object]').forEach((button) => {
    button.addEventListener('click', () => {
      addObject(button.dataset.addObject || 'Cube');
    });
  });

  document.querySelectorAll('[data-action]').forEach((button) => {
    button.addEventListener('click', () => {
      const action = button.dataset.action;
      if (action === 'play') startPreview();
      if (action === 'stop') stopPreview();
      if (action === 'delete') deleteSelected();
      if (action === 'save') saveScene();
      if (action === 'load') loadScene();
    });
  });
}

function setTransformMode(mode) {
  if (!selected) {
    status('Select an object first.');
    return;
  }

  gizmo.setMode(mode);
  status(`Transform mode: ${mode}`);
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

    const hits = raycaster.intersectObjects(objects, false);
    if (hits.length) select(hits[0].object);
  });
}

function deleteSelected() {
  if (playing) {
    status('Stop Preview before deleting objects.');
    return;
  }

  if (!selected) {
    status('Select an object to delete.');
    return;
  }

  const target = selected;
  gizmo.detach();
  scene.remove(target);

  const index = objects.indexOf(target);
  if (index !== -1) objects.splice(index, 1);

  target.geometry?.dispose();
  target.material?.dispose();

  selected = null;
  renderHierarchy();
  renderInspector();
  status('Object deleted');
}

function startPreview() {
  if (playing) return;

  playing = true;
  gizmo.detach();
  orbit.enabled = false;

  if (playOverlay) playOverlay.hidden = false;
  status('Preview Running');
}

function stopPreview() {
  if (!playing) {
    if (playOverlay) playOverlay.hidden = true;
    status('Ready');
    return;
  }

  playing = false;
  orbit.enabled = true;

  if (playOverlay) playOverlay.hidden = true;

  if (selected) gizmo.attach(selected);
  status('Preview stopped');
}

function saveScene() {
  const data = objects.map((mesh) => ({
    type: mesh.geometry.type,
    name: mesh.name,
    position: mesh.position.toArray(),
    rotation: mesh.rotation.toArray(),
    scale: mesh.scale.toArray(),
    color: mesh.material.color.getHex()
  }));

  try {
    localStorage.setItem('freeforge-scene', JSON.stringify(data));
    status('Scene saved on this device');
  } catch (error) {
    console.error(error);
    status('Could not save scene in browser storage');
  }
}

function loadScene() {
  if (playing) stopPreview();

  let data;

  try {
    const saved = localStorage.getItem('freeforge-scene');
    if (!saved) {
      status('No saved scene found on this device');
      return;
    }
    data = JSON.parse(saved);
  } catch (error) {
    console.error(error);
    status('Could not read saved scene');
    return;
  }

  for (const mesh of [...objects]) {
    scene.remove(mesh);
    mesh.geometry?.dispose();
    mesh.material?.dispose();
  }

  objects.length = 0;
  selected = null;

  const typeMap = {
    BoxGeometry: 'Cube',
    SphereGeometry: 'Sphere',
    CylinderGeometry: 'Cylinder',
    ConeGeometry: 'Cone',
    TorusGeometry: 'Torus',
    PlaneGeometry: 'Plane'
  };

  for (const item of data) {
    const type = typeMap[item.type] || 'Cube';
    const mesh = createMesh(type);

    mesh.name = item.name || type;
    mesh.position.fromArray(item.position || [0, 0.6, 0]);
    mesh.rotation.fromArray(item.rotation || [0, 0, 0, 'XYZ']);
    mesh.scale.fromArray(item.scale || [1, 1, 1]);

    if (Number.isFinite(item.color)) {
      mesh.material.color.setHex(item.color);
    }

    mesh.userData.id = makeId();
    scene.add(mesh);
    objects.push(mesh);
  }

  select(null);
  status('Scene loaded');
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
  if (!renderer || !camera) return;

  const width = Math.max(viewport.clientWidth, 1);
  const height = Math.max(viewport.clientHeight, 1);

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);

  if (playing && selected) {
    const speed = 2 * delta;

    if (keys.w) selected.position.z -= speed;
    if (keys.s) selected.position.z += speed;
    if (keys.a) selected.position.x -= speed;
    if (keys.d) selected.position.x += speed;
  }

  orbit.update();
  renderer.render(scene, camera);
}

window.addEventListener('resize', resize);

try {
  init();
} catch (error) {
  console.error('FreeForge initialization error:', error);
  status('Engine error — refresh and check script.js imports');
}
