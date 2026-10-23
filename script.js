 
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TransformControls } from 'three/addons/controls/TransformControls.js';

const $ = id => document.getElementById(id);

const viewport = $('viewport');
const hierarchy = $('hierarchyList');
const count = $('objectCount');
const status = $('statusText');
const inspector = $('inspectorContent');
const emptyInspector = $('emptyInspector');
const overlay = $('playOverlay');
const fileInput = $('fileInput');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#182230');

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 500);
camera.position.set(7, 6, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.shadowMap.enabled = true;
viewport.prepend(renderer.domElement);

const orbit = new OrbitControls(camera, renderer.domElement);
orbit.enableDamping = true;
orbit.target.set(0, 0.7, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x657080, 2));

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(6, 10, 7);
sun.castShadow = true;
scene.add(sun);

const grid = new THREE.GridHelper(40, 40, 0x6b91b8, 0x34465c);
scene.add(grid);
scene.add(new THREE.AxesHelper(2));

const gizmo = new TransformControls(camera, renderer.domElement);
scene.add(gizmo.getHelper());
gizmo.addEventListener('dragging-changed', e => {
  orbit.enabled = !e.value;
});
gizmo.addEventListener('objectChange', () => {
  if (selected) updateInspector();
});

const objects = [];
let selected = null;
let playing = false;
let savedSnapshot = null;
let nextId = 1;

const fields = {
  name: $('objectName'),
  type: $('objectType'),
  px: $('posX'), py: $('posY'), pz: $('posZ'),
  rx: $('rotX'), ry: $('rotY'), rz: $('rotZ'),
  sx: $('scaleX'), sy: $('scaleY'), sz: $('scaleZ'),
  color: $('objectColor')
};

function message(text) {
  status.textContent = text;
}

function material(color) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.75
  });
}

function addMesh(name, geometry, color, position, options = {}) {
  const mesh = new THREE.Mesh(geometry, material(color));
  mesh.name = options.name || `${name} ${nextId++}`;
  mesh.userData.kind = name;
  mesh.userData.id = crypto.randomUUID
    ? crypto.randomUUID()
    : `object-${Date.now()}-${nextId}`;

  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  if (options.scale) mesh.scale.set(...options.scale);

  scene.add(mesh);
  objects.push(mesh);
  select(mesh);
  message(`${mesh.name} added`);
  return mesh;
}

function addObject(type) {
  if (playing) return;

  switch (type) {
    case 'Cube':
      return addMesh('Cube', new THREE.BoxGeometry(1.2, 1.2, 1.2),
        '#43a5ff', [0, 0.7, 0]);

    case 'Sphere':
      return addMesh('Sphere', new THREE.SphereGeometry(0.7, 32, 24),
        '#ffb454', [0, 0.7, 0]);

    case 'Cylinder':
      return addMesh('Cylinder', new THREE.CylinderGeometry(0.55, 0.55, 1.4, 32),
        '#a78bfa', [0, 0.7, 0]);

    case 'Floor':
      return addMesh('Floor', new THREE.BoxGeometry(8, 0.2, 8),
        '#64748b', [0, -0.12, 0]);

    case 'Terrain':
    case 'Snow Ground': {
      const snow = type === 'Snow Ground';
      const geo = new THREE.PlaneGeometry(20, 20, 40, 40);
      geo.rotateX(-Math.PI / 2);
      const positions = geo.attributes.position;

      for (let i = 0; i < positions.count; i++) {
        positions.setY(i, Math.random() * (snow ? 0.12 : 0.5));
      }

      geo.computeVertexNormals();
      return addMesh(type, geo, snow ? '#edf5ff' : '#558b46',
        [0, 0, 0]);
    }

    case 'Mountains':
    case 'Snow Mountains': {
      const snow = type === 'Snow Mountains';
      for (let i = 0; i < 7; i++) {
        const h = 2 + Math.random() * 3;
        const geo = new THREE.ConeGeometry(1.2 + Math.random(), h, 5);
        const m = addMesh(type, geo,
          snow ? '#e8f3ff' : '#65717e',
          [(i - 3) * 2.2, h / 2 - 0.1, -5]);
        m.rotation.y = Math.random();
      }
      return;
    }

    case 'Tree':
    case 'Snow Tree': {
      const snow = type === 'Snow Tree';
      const trunk = addMesh(type, new THREE.CylinderGeometry(0.15, 0.22, 1.5, 8),
        '#795438', [0, 0.75, 0]);
      addMesh(type, new THREE.ConeGeometry(0.9, 2, 8),
        snow ? '#e8f4ff' : '#21864a', [0, 2.1, 0]);
      return trunk;
    }

    case 'Water':
    case 'Frozen Lake':
      return addMesh(type, new THREE.CircleGeometry(4, 48),
        type === 'Water' ? '#159bd3' : '#bdeaff', [0, 0.04, 0])
        .rotateX(-Math.PI / 2);

    case 'Snowfall': {
      const points = [];
      for (let i = 0; i < 500; i++) {
        points.push((Math.random() - 0.5) * 18,
          Math.random() * 10, (Math.random() - 0.5) * 18);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3));
      const snow = new THREE.Points(geo,
        new THREE.PointsMaterial({ color: '#ffffff', size: 0.08 }));
      snow.name = 'Snowfall';
      snow.userData.kind = type;
      snow.userData.id = `object-${nextId++}`;
      scene.add(snow);
      objects.push(snow);
      select(snow);
      message('Snowfall added');
      return snow;
    }

    default: {
      const colors = {
        Wolf: '#747d8c', Deer: '#a87948', Bear: '#67442e',
        Fox: '#ed7831', Rabbit: '#ded7ce', Moose: '#795b40',
        Owl: '#a88b5a', Eagle: '#7d8a94'
      };
      const animal = addMesh(type,
        new THREE.SphereGeometry(0.55, 20, 16),
        colors[type] || '#a0aec0', [0, 0.55, 0]);
      animal.scale.set(1.4, 0.8, 0.7);

      addMesh(type, new THREE.SphereGeometry(0.3, 16, 12),
        colors[type] || '#a0aec0', [0.65, 0.85, 0]);
      return animal;
    }
  }
}

function refreshHierarchy() {
  hierarchy.replaceChildren();

  for (const obj of objects) {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'object-row' + (obj === selected ? ' selected' : '');
    row.textContent = obj.name;
    row.addEventListener('click', () => select(obj));
    hierarchy.appendChild(row);
  }

  count.textContent = `${objects.length} objects`;
}

function select(obj) {
  selected = obj;
  gizmo.detach();

  if (obj && obj.isMesh) gizmo.attach(obj);

  inspector.hidden = !obj;
  emptyInspector.hidden = !!obj;

  if (obj) updateInspector();
  refreshHierarchy();
}

function updateInspector() {
  if (!selected) return;

  fields.name.value = selected.name;
  fields.type.value = selected.userData.kind || 'Object';

  fields.px.value = selected.position.x.toFixed(2);
  fields.py.value = selected.position.y.toFixed(2);
  fields.pz.value = selected.position.z.toFixed(2);

  fields.rx.value = THREE.MathUtils.radToDeg(selected.rotation.x).toFixed(0);
  fields.ry.value = THREE.MathUtils.radToDeg(selected.rotation.y).toFixed(0);
  fields.rz.value = THREE.MathUtils.radToDeg(selected.rotation.z).toFixed(0);

  fields.sx.value = selected.scale.x.toFixed(2);
  fields.sy.value = selected.scale.y.toFixed(2);
  fields.sz.value = selected.scale.z.toFixed(2);

  if (selected.material && selected.material.color) {
    fields.color.value = '#' + selected.material.color.getHexString();
  }
}

function updateSelected() {
  if (!selected || playing) return;

  selected.name = fields.name.value.trim() || 'Object';

  selected.position.set(
    Number(fields.px.value) || 0,
    Number(fields.py.value) || 0,
    Number(fields.pz.value) || 0
  );

  selected.rotation.set(
    THREE.MathUtils.degToRad(Number(fields.rx.value) || 0),
    THREE.MathUtils.degToRad(Number(fields.ry.value) || 0),
    THREE.MathUtils.degToRad(Number(fields.rz.value) || 0)
  );

  selected.scale.set(
    Math.max(0.01, Number(fields.sx.value) || 1),
    Math.max(0.01, Number(fields.sy.value) || 1),
    Math.max(0.01, Number(fields.sz.value) || 1)
  );

  if (selected.material && selected.material.color) {
    selected.material.color.set(fields.color.value);
  }

  refreshHierarchy();
}

Object.entries(fields).forEach(([key, input]) => {
  if (key !== 'type') {
    input.addEventListener('change', updateSelected);
  }
});

document.querySelectorAll('[data-add]').forEach(button => {
  button.addEventListener('click', () => addObject(button.dataset.add));
});

document.querySelectorAll('[data-transform]').forEach(button => {
  button.addEventListener('click', () => {
    gizmo.setMode(button.dataset.transform);
    document.querySelectorAll('[data-transform]').forEach(b =>
      b.classList.toggle('active', b === button)
    );
    message(`Transform: ${button.dataset.transform}`);
  });
});

$('deleteBtn').addEventListener('click', () => {
  if (!selected || playing) return;

  scene.remove(selected);
  const index = objects.indexOf(selected);
  if (index >= 0) objects.splice(index, 1);

  selected = null;
  select(null);
  message('Object deleted');
});

$('duplicateBtn').addEventListener('click', () => {
  if (!selected || playing || !selected.isMesh) return;

  const copy = selected.clone();
  copy.name = `${selected.name} Copy`;
  copy.userData = { ...selected.userData, id: `object-${nextId++}` };
  copy.position.x += 1.2;

  scene.add(copy);
  objects.push(copy);
  select(copy);
  message('Object duplicated');
});

function snapshot() {
  return objects.filter(o => o.isMesh && o.geometry).map(o => ({
    name: o.name,
    kind: o.userData.kind,
    position: o.position.toArray(),
    rotation: o.rotation.toArray().slice(0, 3),
    scale: o.scale.toArray(),
    color: o.material.color ? '#' + o.material.color.getHexString() : '#ffffff',
    geometry: o.geometry.type
  }));
}

$('saveBtn').addEventListener('click', () => {
  const data = JSON.stringify({ format: 'FreeForgeScene', objects: snapshot() }, null, 2);
  const url = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = 'freeforge-project.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  message('Project saved');
});

$('loadBtn').addEventListener('click', () => fileInput.click());

fileInput.addEventListener('change', async () => {
  const file = fileInput.files?.[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (data.format !== 'FreeForgeScene' || !Array.isArray(data.objects)) {
      throw new Error('Invalid project');
    }

    clearObjects();

    for (const item of data.objects) {
      let geometry;
      if (item.geometry === 'SphereGeometry') {
        geometry = new THREE.SphereGeometry(0.7, 32, 24);
      } else if (item.geometry === 'CylinderGeometry') {
        geometry = new THREE.CylinderGeometry(0.55, 0.55, 1.4, 32);
      } else {
        geometry = new THREE.BoxGeometry(1.2, 1.2, 1.2);
      }

      const obj = addMesh(item.kind || 'Cube', geometry,
        item.color || '#43a5ff', item.position || [0, 0.7, 0],
        { name: item.name, scale: item.scale });

      if (item.rotation) obj.rotation.set(...item.rotation);
    }

    message('Project loaded');
  } catch (err) {
    alert('Could not load this FreeForge project file.');
  }

  fileInput.value = '';
});

function clearObjects() {
  for (const obj of objects) scene.remove(obj);
  objects.length = 0;
  selected = null;
  select(null);
}

function setPlay(enable) {
  if (enable === playing) return;

  if (enable) {
    savedSnapshot = snapshot();
    playing = true;
    gizmo.detach();
    overlay.hidden = false;
    $('playBtn').disabled = true;
    $('stopBtn').disabled = false;
    message('Preview running');
  } else {
    playing = false;
    overlay.hidden = true;
    $('playBtn').disabled = false;
    $('stopBtn').disabled = true;

    clearObjects();
    for (const item of savedSnapshot || []) {
      let geo = item.geometry === 'SphereGeometry'
        ? new THREE.SphereGeometry(0.7, 32, 24)
        : item.geometry === 'CylinderGeometry'
          ? new THREE.CylinderGeometry(0.55, 0.55, 1.4, 32)
          : new THREE.BoxGeometry(1.2, 1.2, 1.2);

      const obj = addMesh(item.kind || 'Cube', geo, item.color,
        item.position, { name: item.name, scale: item.scale });
      obj.rotation.set(...item.rotation);
    }

    select(null);
    message('Editor ready');
  }

  document.querySelectorAll('[data-add], [data-transform], #deleteBtn, #duplicateBtn')
    .forEach(button => button.disabled = playing);
}

$('playBtn').addEventListener('click', () => setPlay(true));
$('stopBtn').addEventListener('click', () => setPlay(false));
$('overlayStopBtn').addEventListener('click', () => setPlay(false));

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener('pointerdown', event => {
  if (playing || gizmo.dragging) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objects.filter(o => o.isMesh), false);

  if (hits.length) select(hits[0].object);
});

function resize() {
  const width = Math.max(1, viewport.clientWidth);
  const height = Math.max(1, viewport.clientHeight);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

new ResizeObserver(resize).observe(viewport);
window.addEventListener('resize', resize);

function animate() {
  requestAnimationFrame(animate);
  orbit.update();
  renderer.render(scene, camera);
}

resize();
animate();

addObject('Floor');
addObject('Cube');
select(null);
message('Ready — select an object to edit');
