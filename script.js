 
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { TransformControls } from "three/addons/controls/TransformControls.js";

/* ========================================
   FREEFORGE ENGINE
   3D EDITOR + WORLD BUILDER
======================================== */

const viewport = document.getElementById("viewport");
const statusText = document.getElementById("statusText");
const hierarchyList = document.getElementById("hierarchyList");
const objectCount = document.getElementById("objectCount");
const emptyInspector = document.getElementById("emptyInspector");
const inspectorContent = document.getElementById("inspectorContent");
const playOverlay = document.getElementById("playOverlay");
const fileInput = document.getElementById("fileInput");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#171d2a");
scene.fog = new THREE.Fog("#171d2a", 35, 100);

const camera = new THREE.PerspectiveCamera(
  60,
  viewport.clientWidth / Math.max(viewport.clientHeight, 1),
  0.1,
  1000
);
camera.position.set(10, 9, 13);

const renderer = new THREE.WebGLRenderer({
  antialias: true,
  alpha: false
});
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.prepend(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.49;

const transformControls = new TransformControls(camera, renderer.domElement);
transformControls.setMode("translate");
transformControls.setSize(0.8);
scene.add(transformControls);

const ambientLight = new THREE.HemisphereLight("#dceaff", "#4b5362", 2);
scene.add(ambientLight);

const sun = new THREE.DirectionalLight("#ffffff", 3);
sun.position.set(10, 18, 8);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const grid = new THREE.GridHelper(100, 100, "#53647d", "#303b50");
scene.add(grid);

const axes = new THREE.AxesHelper(3);
scene.add(axes);

const objects = [];
const animatedObjects = [];
let selected = null;
let playing = false;
let savedCameraPosition = null;
let savedTarget = null;
let snowParticles = null;
let snowTime = 0;
let objectId = 1;

function status(message) {
  if (statusText) statusText.textContent = message;
}

function makeMaterial(color, extra = {}) {
  return new THREE.MeshStandardMaterial({
    color,
    roughness: 0.8,
    metalness: 0.05,
    ...extra
  });
}

function registerObject(obj, type, name) {
  obj.userData.editorObject = true;
  obj.userData.objectType = type;
  obj.userData.objectName = name || `${type} ${objectId++}`;

  scene.add(obj);
  objects.push(obj);

  selectObject(obj);
  renderHierarchy();
  status(`${obj.userData.objectName} added`);
  return obj;
}

function makeMesh(geometry, color, name, position = [0, 0.5, 0]) {
  const mesh = new THREE.Mesh(geometry, makeMaterial(color));
  mesh.position.set(...position);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.name = name;
  return mesh;
}

function addCube() {
  return registerObject(
    makeMesh(new THREE.BoxGeometry(1, 1, 1), "#69a7ff", "Cube"),
    "Cube",
    "Cube"
  );
}

function addSphere() {
  return registerObject(
    makeMesh(new THREE.SphereGeometry(0.65, 32, 24), "#69d6a6", "Sphere"),
    "Sphere",
    "Sphere"
  );
}

function addCylinder() {
  return registerObject(
    makeMesh(new THREE.CylinderGeometry(0.5, 0.5, 1.2, 32), "#f4b860", "Cylinder"),
    "Cylinder",
    "Cylinder"
  );
}

function addFloor() {
  const floor = makeMesh(
    new THREE.BoxGeometry(10, 0.2, 10),
    "#697386",
    "Floor",
    [0, -0.1, 0]
  );
  return registerObject(floor, "Floor", "Floor");
}

function addTerrain() {
  const geometry = new THREE.PlaneGeometry(24, 24, 48, 48);
  geometry.rotateX(-Math.PI / 2);

  const positions = geometry.attributes.position;
  for (let i = 0; i < positions.count; i++) {
    const x = positions.getX(i);
    const z = positions.getZ(i);
    const y =
      Math.sin(x * 0.4) * 0.25 +
      Math.cos(z * 0.35) * 0.2 +
      Math.sin((x + z) * 0.2) * 0.15;
    positions.setY(i, y);
  }
  geometry.computeVertexNormals();

  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: "#4b8650",
      roughness: 1,
      side: THREE.DoubleSide
    })
  );
  terrain.position.y = -0.1;
  terrain.receiveShadow = true;

  return registerObject(terrain, "Terrain", "Terrain");
}

function addMountains(snowy = false) {
  const group = new THREE.Group();
  const count = 7;

  for (let i = 0; i < count; i++) {
    const height = 2.5 + Math.random() * 4;
    const radius = 1.5 + Math.random() * 1.8;
    const mountain = makeMesh(
      new THREE.ConeGeometry(radius, height, 7),
      snowy ? "#71869d" : "#5a6c55",
      "Mountain",
      [
        (i - (count - 1) / 2) * 2.8,
        height / 2 - 0.15,
        -5 - Math.random() * 3
      ]
    );
    group.add(mountain);

    if (snowy) {
      const cap = makeMesh(
        new THREE.ConeGeometry(radius * 0.47, height * 0.42, 7),
        "#f1f7ff",
        "Snow Cap",
        [0, height * 0.31, 0]
      );
      mountain.add(cap);
      cap.position.y = height * 0.31;
    }
  }

  return registerObject(
    group,
    snowy ? "Snow Mountains" : "Mountains",
    snowy ? "Snow Mountains" : "Mountains"
  );
}

function addTree(snowy = false) {
  const group = new THREE.Group();

  const trunk = makeMesh(
    new THREE.CylinderGeometry(0.15, 0.22, 1.3, 8),
    "#795238",
    "Trunk",
    [0, 0.65, 0]
  );
  group.add(trunk);

  for (let i = 0; i < 3; i++) {
    const leaves = makeMesh(
      new THREE.ConeGeometry(0.8 - i * 0.14, 1.25, 9),
      snowy ? "#dbe7f2" : "#287447",
      "Leaves",
      [0, 1.35 + i * 0.55, 0]
    );
    group.add(leaves);
  }

  return registerObject(
    group,
    snowy ? "Snow Tree" : "Tree",
    snowy ? "Snow Tree" : "Tree"
  );
}

function addWater(frozen = false) {
  const water = makeMesh(
    new THREE.BoxGeometry(12, 0.12, 8),
    frozen ? "#a9dff5" : "#208ed1",
    frozen ? "Frozen Lake" : "Water",
    [0, 0.02, 0]
  );

  water.material.transparent = true;
  water.material.opacity = frozen ? 0.88 : 0.78;
  water.material.roughness = frozen ? 0.2 : 0.3;
  water.material.metalness = frozen ? 0.15 : 0.2;

  return registerObject(water, frozen ? "Frozen Lake" : "Water",
    frozen ? "Frozen Lake" : "Water");
}

function addSnowGround() {
  const ground = makeMesh(
    new THREE.BoxGeometry(24, 0.2, 24),
    "#e8f2ff",
    "Snow Ground",
    [0, -0.1, 0]
  );
  ground.material.roughness = 0.95;
  return registerObject(ground, "Snow Ground", "Snow Ground");
}

function addSnowfall() {
  if (snowParticles) {
    scene.remove(snowParticles);
    snowParticles.geometry.dispose();
    snowParticles.material.dispose();
  }

  const count = 1200;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = Math.random() * 18;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));

  const material = new THREE.PointsMaterial({
    color: "#ffffff",
    size: 0.09,
    transparent: true,
    opacity: 0.85
  });

  snowParticles = new THREE.Points(geometry, material);
  snowParticles.userData.objectType = "Snowfall";
  snowParticles.userData.objectName = "Snowfall";
  snowParticles.userData.editorObject = true;
  scene.add(snowParticles);
  objects.push(snowParticles);

  selectObject(snowParticles);
  renderHierarchy();
  status("Snowfall added");
  return snowParticles;
}

function addAnimal(type) {
  const group = new THREE.Group();
  const colorMap = {
    Wolf: "#777d88",
    Deer: "#a66b3f",
    Bear: "#5b4030",
    Fox: "#d46d2f",
    Rabbit: "#d9d9d9",
    Moose: "#79553b",
    Owl: "#b6a17c",
    Eagle: "#8a6546"
  };
  const color = colorMap[type] || "#a0a0a0";

  const body = makeMesh(
    new THREE.SphereGeometry(0.65, 20, 16),
    color,
    `${type} Body`,
    [0, 0.85, 0]
  );
  body.scale.set(1.25, 0.75, 0.7);
  group.add(body);

  const head = makeMesh(
    new THREE.SphereGeometry(0.34, 18, 14),
    color,
    `${type} Head`,
    [0.62, 1.18, 0]
  );
  group.add(head);

  if (type === "Owl" || type === "Eagle") {
    const wingMaterial = makeMaterial(color);
    for (const side of [-1, 1]) {
      const wing = new THREE.Mesh(
        new THREE.SphereGeometry(0.42, 12, 10),
        wingMaterial
      );
      wing.position.set(0, 0.95, side * 0.58);
      wing.scale.set(0.8, 0.18, 1.1);
      wing.castShadow = true;
      group.add(wing);
    }
  } else {
    for (const x of [-0.35, 0.38]) {
      for (const z of [-0.32, 0.32]) {
        const leg = makeMesh(
          new THREE.CylinderGeometry(0.08, 0.09, 0.6, 8),
          color,
          `${type} Leg`,
          [x, 0.3, z]
        );
        group.add(leg);
      }
    }
  }

  if (type === "Deer" || type === "Moose") {
    for (const side of [-1, 1]) {
      const antler = makeMesh(
        new THREE.CylinderGeometry(0.035, 0.06, 0.65, 6),
        "#d7c6a1",
        "Antler",
        [0.58, 1.7, side * 0.18]
      );
      antler.rotation.z = -0.35;
      group.add(antler);

      const branch = makeMesh(
        new THREE.CylinderGeometry(0.025, 0.04, 0.35, 6),
        "#d7c6a1",
        "Antler Branch",
        [0.58, 1.9, side * 0.3]
      );
      branch.rotation.z = 0.6;
      group.add(branch);
    }
  }

  if (type === "Rabbit") {
    for (const side of [-1, 1]) {
      const ear = makeMesh(
        new THREE.BoxGeometry(0.12, 0.5, 0.12),
        color,
        "Rabbit Ear",
        [0.62, 1.62, side * 0.14]
      );
      group.add(ear);
    }
  }

  group.position.set(
    (Math.random() - 0.5) * 4,
    0,
    (Math.random() - 0.5) * 4
  );

  const animal = registerObject(group, type, type);
  animatedObjects.push({
    object: animal,
    baseY: animal.position.y,
    phase: Math.random() * Math.PI * 2
  });
  return animal;
}

function addObject(type) {
  switch (type) {
    case "Cube": return addCube();
    case "Sphere": return addSphere();
    case "Cylinder": return addCylinder();
    case "Floor": return addFloor();
    case "Terrain": return addTerrain();
    case "Mountains": return addMountains(false);
    case "Snow Mountains": return addMountains(true);
    case "Tree": return addTree(false);
    case "Snow Tree": return addTree(true);
    case "Water": return addWater(false);
    case "Frozen Lake": return addWater(true);
    case "Snow Ground": return addSnowGround();
    case "Snowfall": return addSnowfall();
    case "Wolf":
    case "Deer":
    case "Bear":
    case "Fox":
    case "Rabbit":
    case "Moose":
    case "Owl":
    case "Eagle":
      return addAnimal(type);
    default:
      status(`Unknown object: ${type}`);
  }
}

/* ========================================
   SELECT + HIERARCHY
======================================== */

function selectObject(obj) {
  selected = obj || null;

  if (selected && !playing) {
    transformControls.attach(selected);
  } else {
    transformControls.detach();
  }

  renderHierarchy();
  updateInspector();
}

function renderHierarchy() {
  hierarchyList.innerHTML = "";
  objectCount.textContent = `${objects.length} object${objects.length === 1 ? "" : "s"}`;

  for (const obj of objects) {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "hierarchy-item";
    if (obj === selected) row.classList.add("active");

    const icon = document.createElement("span");
    icon.textContent = getObjectIcon(obj.userData.objectType);

    const label = document.createElement("span");
    label.textContent = obj.userData.objectName || obj.userData.objectType || "Object";

    row.append(icon, label);
    row.addEventListener("click", () => selectObject(obj));
    hierarchyList.appendChild(row);
  }
}

function getObjectIcon(type) {
  const icons = {
    Cube: "◼", Sphere: "●", Cylinder: "▰", Floor: "▱",
    Terrain: "🌱", Mountains: "⛰️", "Snow Mountains": "🏔️",
    Tree: "🌲", "Snow Tree": "🌲", Water: "🌊",
    "Snow Ground": "❄️", "Frozen Lake": "🧊", Snowfall: "🌨️",
    Wolf: "🐺", Deer: "🦌", Bear: "🐻", Fox: "🦊",
    Rabbit: "🐇", Moose: "🫎", Owl: "🦉", Eagle: "🦅"
  };
  return icons[type] || "◈";
}

/* ========================================
   INSPECTOR
======================================== */

function updateInspector() {
  if (!selected) {
    emptyInspector.hidden = false;
    inspectorContent.hidden = true;
    return;
  }

  emptyInspector.hidden = true;
  inspectorContent.hidden = false;

  document.getElementById("objectName").value =
    selected.userData.objectName || "Object";
  document.getElementById("objectType").value =
    selected.userData.objectType || "Object";

  setVectorInputs("pos", selected.position, false);
  setVectorInputs("rot", selected.rotation, true);
  setVectorInputs("scale", selected.scale, false);

  const color = getObjectColor(selected);
  if (color) document.getElementById("objectColor").value = `#${color.getHexString()}`;
}

function setVectorInputs(prefix, vector, isRotation) {
  const factor = isRotation ? 180 / Math.PI : 1;
  for (const axis of ["X", "Y", "Z"]) {
    const value = vector[axis.toLowerCase()] * factor;
    document.getElementById(prefix + axis).value = Number(value.toFixed(3));
  }
}

function getObjectColor(obj) {
  let found = null;
  obj.traverse(child => {
    if (!found && child.isMesh && child.material && child.material.color) {
      found = child.material.color;
    }
  });
  return found;
}

function setObjectColor(obj, hex) {
  obj.traverse(child => {
    if (!child.isMesh || !child.material) return;
    if (child.material.color) child.material.color.set(hex);
  });
}

function attachVectorInput(prefix, vector, isRotation = false) {
  for (const axis of ["X", "Y", "Z"]) {
    const input = document.getElementById(prefix + axis);
    input.addEventListener("change", () => {
      if (!selected) return;
      let value = Number(input.value);
      if (!Number.isFinite(value)) value = 0;
      if (isRotation) value *= Math.PI / 180;
      vector[axis.toLowerCase()] = value;
      status(`${selected.userData.objectName} updated`);
    });
  }
}

attachVectorInput("pos", new THREE.Vector3(), false);
attachVectorInput("rot", new THREE.Euler(), true);
attachVectorInput("scale", new THREE.Vector3(1, 1, 1), false);

function bindInspectorInputs() {
  for (const axis of ["X", "Y", "Z"]) {
    document.getElementById("pos" + axis).addEventListener("change", () => {
      if (!selected) return;
      selected.position[axis.toLowerCase()] =
        Number(document.getElementById("pos" + axis).value) || 0;
    });

    document.getElementById("rot" + axis).addEventListener("change", () => {
      if (!selected) return;
      selected.rotation[axis.toLowerCase()] =
        (Number(document.getElementById("rot" + axis).value) || 0) * Math.PI / 180;
    });

    document.getElementById("scale" + axis).addEventListener("change", () => {
      if (!selected) return;
      selected.scale[axis.toLowerCase()] =
        Math.max(0.01, Number(document.getElementById("scale" + axis).value) || 1);
    });
  }

  document.getElementById("objectName").addEventListener("change", event => {
    if (!selected) return;
    selected.userData.objectName = event.target.value.trim() || "Object";
    renderHierarchy();
    status("Object renamed");
  });

  document.getElementById("objectColor").addEventListener("input", event => {
    if (!selected) return;
    setObjectColor(selected, event.target.value);
  });
}
bindInspectorInputs();

/* ========================================
   TRANSFORM CONTROLS
======================================== */

transformControls.addEventListener("dragging-changed", event => {
  controls.enabled = !event.value && !playing;
});

transformControls.addEventListener("objectChange", () => {
  if (selected) updateInspector();
});

document.querySelectorAll("[data-transform]").forEach(button => {
  button.addEventListener("click", () => {
    const mode = button.dataset.transform;
    transformControls.setMode(mode);

    document.querySelectorAll("[data-transform]").forEach(item => {
      item.classList.toggle("active", item === button);
    });

    status(`${mode.charAt(0).toUpperCase() + mode.slice(1)} mode selected`);
  });
});

/* ========================================
   DELETE + DUPLICATE
======================================== */

function removeObject(obj) {
  if (!obj) return;

  transformControls.detach();
  scene.remove(obj);

  const index = objects.indexOf(obj);
  if (index !== -1) objects.splice(index, 1);

  const animIndex = animatedObjects.findIndex(item => item.object === obj);
  if (animIndex !== -1) animatedObjects.splice(animIndex, 1);

  if (obj === snowParticles) snowParticles = null;

  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      if (Array.isArray(child.material)) {
        child.material.forEach(material => material.dispose());
      } else {
        child.material.dispose();
      }
    }
  });

  selected = null;
  renderHierarchy();
  updateInspector();
  status("Object deleted");
}

document.getElementById("deleteBtn").addEventListener("click", () => {
  if (!selected) {
    status("Select an object first");
    return;
  }
  removeObject(selected);
});

document.getElementById("duplicateBtn").addEventListener("click", () => {
  if (!selected) {
    status("Select an object first");
    return;
  }

  const copy = selected.clone(true);
  copy.position.x += 1.5;
  copy.userData.editorObject = true;
  copy.userData.objectType = selected.userData.objectType;
  copy.userData.objectName = `${selected.userData.objectName} Copy`;

  copy.traverse(child => {
    if (child.isMesh) {
      if (child.geometry) child.geometry = child.geometry.clone();
      if (child.material) {
        child.material = Array.isArray(child.material)
          ? child.material.map(m => m.clone())
          : child.material.clone();
      }
    }
  });

  scene.add(copy);
  objects.push(copy);
  selectObject(copy);
  status("Object duplicated");
});

/* ========================================
   VIEWPORT OBJECT PICKING
======================================== */

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

renderer.domElement.addEventListener("pointerdown", event => {
  if (playing || transformControls.dragging) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objects, true);

  if (!hits.length) {
    selectObject(null);
    return;
  }

  let target = hits[0].object;
  while (target && !objects.includes(target)) target = target.parent;
  selectObject(target || null);
});

/* ========================================
   SAVE + LOAD PROJECT
======================================== */

function serializeObject(obj) {
  const data = {
    type: obj.userData.objectType,
    name: obj.userData.objectName,
    position: obj.position.toArray(),
    rotation: [obj.rotation.x, obj.rotation.y, obj.rotation.z],
    scale: obj.scale.toArray()
  };

  const color = getObjectColor(obj);
  if (color) data.color = `#${color.getHexString()}`;
  return data;
}

function saveProject() {
  const project = {
    app: "FreeForge Engine",
    version: 2,
    objects: objects
      .filter(obj => obj !== snowParticles)
      .map(serializeObject)
  };

  const blob = new Blob([JSON.stringify(project, null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "freeforge-project.json";
  link.click();
  URL.revokeObjectURL(url);
  status("Project downloaded");
}

function loadProjectFile(file) {
  const reader = new FileReader();
  reader.onload = () => {
    try {
      const project = JSON.parse(reader.result);
      if (!project || !Array.isArray(project.objects)) {
        throw new Error("Invalid project file");
      }

      [...objects].forEach(obj => removeObject(obj));
      selected = null;

      for (const data of project.objects) {
        const obj = addObject(data.type);
        if (!obj) continue;

        obj.userData.objectName = data.name || data.type;
        if (Array.isArray(data.position)) obj.position.fromArray(data.position);
        if (Array.isArray(data.rotation)) {
          obj.rotation.set(data.rotation[0], data.rotation[1], data.rotation[2]);
        }
        if (Array.isArray(data.scale)) obj.scale.fromArray(data.scale);
        if (data.color) setObjectColor(obj, data.color);
      }

      selectObject(null);
      renderHierarchy();
      status("Project loaded");
    } catch (error) {
      console.error(error);
      status("Could not load project JSON");
    }
  };
  reader.readAsText(file);
}

document.getElementById("saveBtn").addEventListener("click", saveProject);

document.getElementById("loadBtn").addEventListener("click", () => {
  fileInput.click();
});

fileInput.addEventListener("change", () => {
  if (fileInput.files && fileInput.files[0]) {
    loadProjectFile(fileInput.files[0]);
    fileInput.value = "";
  }
});

/* ========================================
   PLAY / STOP PREVIEW
======================================== */

function setPlay(value) {
  playing = value;

  document.getElementById("playBtn").disabled = value;
  document.getElementById("stopBtn").disabled = !value;
  playOverlay.hidden = !value;

  controls.enabled = !value;
  transformControls.enabled = !value;
  grid.visible = !value;
  axes.visible = !value;

  if (value) {
    savedCameraPosition = camera.position.clone();
    savedTarget = controls.target.clone();
    transformControls.detach();
    status("Preview running");
  } else {
    if (savedCameraPosition) camera.position.copy(savedCameraPosition);
    if (savedTarget) controls.target.copy(savedTarget);
    if (selected) transformControls.attach(selected);
    status("Preview stopped");
  }
}

document.getElementById("playBtn").addEventListener("click", () => setPlay(true));
document.getElementById("stopBtn").addEventListener("click", () => setPlay(false));
document.getElementById("overlayStopBtn").addEventListener("click", () => setPlay(false));

/* ========================================
   RESIZE + ANIMATION
======================================== */

function resizeRenderer() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (!width || !height) return;
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
}

window.addEventListener("resize", resizeRenderer);

const clock = new THREE.Clock();

function animate() {
  requestAnimationFrame(animate);

  const delta = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  controls.update();

  if (snowParticles) {
    const positions = snowParticles.geometry.attributes.position;
    for (let i = 0; i < positions.count; i++) {
      let y = positions.getY(i) - delta * 2.5;
      if (y < 0) y = 18;
      positions.setY(i, y);
    }
    positions.needsUpdate = true;
  }

  for (const item of animatedObjects) {
    if (item.object.parent) {
      item.object.position.y =
        item.baseY + Math.sin(elapsed * 2 + item.phase) * 0.035;
    }
  }

  renderer.render(scene, camera);
}

/* ========================================
   STARTUP
======================================== */

renderHierarchy();
updateInspector();
resizeRenderer();
animate();
status("FreeForge Engine ready");
