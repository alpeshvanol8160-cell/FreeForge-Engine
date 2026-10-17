
import * as THREE from "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const $ = (id) => document.getElementById(id);

const viewport = $("viewport");
const hierarchy = $("hierarchy");
const countLabel = $("objectCount");
const statusMessage = $("statusMessage");
const sceneStatus = $("sceneStatus");

const scene = new THREE.Scene();
scene.background = new THREE.Color("#182330");

const camera = new THREE.PerspectiveCamera(
  55,
  viewport.clientWidth / Math.max(viewport.clientHeight, 1),
  0.1,
  1000
);
camera.position.set(7, 6, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.setSize(viewport.clientWidth, viewport.clientHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);
controls.update();

scene.add(new THREE.HemisphereLight(0xdceaff, 0x384152, 2));

const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(5, 10, 6);
sun.castShadow = true;
scene.add(sun);

const grid = new THREE.GridHelper(100, 100, 0x52708f, 0x34465c);
grid.position.y = 0.001;
scene.add(grid);

const axes = new THREE.AxesHelper(2);
scene.add(axes);

const objects = [];
let selected = null;
let playing = false;
let savedCamera = null;
let nextId = 1;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function setStatus(message) {
  statusMessage.textContent = message;
}

function resizeRenderer() {
  const width = viewport.clientWidth;
  const height = viewport.clientHeight;

  if (!width || !height) return;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
}

if ("ResizeObserver" in window) {
  new ResizeObserver(resizeRenderer).observe(viewport);
} else {
  window.addEventListener("resize", resizeRenderer);
}

function createGeometry(type) {
  switch (type) {
    case "sphere":
      return new THREE.SphereGeometry(0.65, 32, 24);
    case "cylinder":
      return new THREE.CylinderGeometry(0.55, 0.55, 1.2, 32);
    case "floor":
      return new THREE.BoxGeometry(8, 0.15, 8);
    default:
      return new THREE.BoxGeometry(1, 1, 1);
  }
}

function defaultName(type) {
  const names = {
    box: "Cube",
    sphere: "Sphere",
    cylinder: "Cylinder",
    floor: "Floor"
  };

  return names[type] || "Object";
}

function addObject(type = "box", data = {}) {
  const geometry = createGeometry(type);
  const material = new THREE.MeshStandardMaterial({
    color: data.color || "#43a5ff",
    roughness: 0.65,
    metalness: 0.05
  });

  const mesh = new THREE.Mesh(geometry, material);
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  mesh.userData.editorId = nextId++;
  mesh.userData.type = type;
  mesh.name = data.name || defaultName(type) + " " + mesh.userData.editorId;

  if (data.position) {
    mesh.position.set(...data.position);
  } else {
    mesh.position.set(
      (Math.random() - 0.5) * 3,
      type === "floor" ? -0.08 : 0.6,
      (Math.random() - 0.5) * 3
    );
  }

  if (data.rotation) {
    mesh.rotation.set(...data.rotation);
  }

  if (data.scale) {
    mesh.scale.set(...data.scale);
  }

  scene.add(mesh);
  objects.push(mesh);

  selectObject(mesh);
  renderHierarchy();
  setStatus(mesh.name + " added");

  return mesh;
}

function removeObject(mesh) {
  if (!mesh) return;

  scene.remove(mesh);
  mesh.geometry.dispose();

  if (Array.isArray(mesh.material)) {
    mesh.material.forEach((material) => material.dispose());
  } else {
    mesh.material.dispose();
  }

  const index = objects.indexOf(mesh);
  if (index !== -1) objects.splice(index, 1);

  if (selected === mesh) selected = null;

  renderHierarchy();
  updateInspector();
}

function renderHierarchy() {
  hierarchy.innerHTML = "";

  objects.forEach((mesh) => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "object-row" + (mesh === selected ? " selected" : "");

    const icon = document.createElement("span");
    icon.className = "object-icon";
    icon.textContent = mesh.userData.type === "sphere" ? "◉"
      : mesh.userData.type === "cylinder" ? "▤"
      : mesh.userData.type === "floor" ? "▱" : "◇";

    const name = document.createElement("span");
    name.textContent = mesh.name;

    row.append(icon, name);
    row.addEventListener("click", () => selectObject(mesh));
    hierarchy.appendChild(row);
  });

  countLabel.textContent = String(objects.length);
}

function selectObject(mesh) {
  selected = mesh;
  renderHierarchy();
  updateInspector();
}

function updateInspector() {
  const empty = $("inspectorEmpty");
  const form = $("inspector");

  if (!selected) {
    empty.classList.remove("hidden");
    form.classList.add("hidden");
    return;
  }

  empty.classList.add("hidden");
  form.classList.remove("hidden");

  $("objectName").value = selected.name;
  $("objectType").value = selected.userData.type;

  $("posX").value = selected.position.x.toFixed(2);
  $("posY").value = selected.position.y.toFixed(2);
  $("posZ").value = selected.position.z.toFixed(2);

  $("rotX").value = THREE.MathUtils.radToDeg(selected.rotation.x).toFixed(1);
  $("rotY").value = THREE.MathUtils.radToDeg(selected.rotation.y).toFixed(1);
  $("rotZ").value = THREE.MathUtils.radToDeg(selected.rotation.z).toFixed(1);

  $("scaleX").value = selected.scale.x.toFixed(2);
  $("scaleY").value = selected.scale.y.toFixed(2);
  $("scaleZ").value = selected.scale.z.toFixed(2);

  $("objectColor").value = "#" +
    selected.material.color.getHexString();
}

function updateNumber(id, callback, min = -Infinity, max = Infinity) {
  const input = $(id);

  input.addEventListener("change", () => {
    if (!selected) return;

    const value = Number(input.value);
    if (!Number.isFinite(value)) {
      updateInspector();
      return;
    }

    callback(Math.min(max, Math.max(min, value)));
    renderHierarchy();
    setStatus("Object properties updated");
  });
}

$("objectName").addEventListener("change", () => {
  if (!selected) return;

  const name = $("objectName").value.trim();
  selected.name = name || defaultName(selected.userData.type);
  renderHierarchy();
  updateInspector();
});

[
  ["posX", "position", 0],
  ["posY", "position", 1],
  ["posZ", "position", 2]
].forEach(([id, property, axis]) => {
  updateNumber(id, (value) => {
    selected[property].setComponent(axis, value);
  });
});

[
  ["rotX", 0],
  ["rotY", 1],
  ["rotZ", 2]
].forEach(([id, axis]) => {
  updateNumber(id, (value) => {
    selected.rotation.setComponent(
      axis,
      THREE.MathUtils.degToRad(value)
    );
  });
});

[
  ["scaleX", 0],
  ["scaleY", 1],
  ["scaleZ", 2]
].forEach(([id, axis]) => {
  updateNumber(id, (value) => {
    selected.scale.setComponent(axis, value);
  }, 0.1, 100);
});

$("objectColor").addEventListener("input", () => {
  if (!selected) return;

  selected.material.color.set($("objectColor").value);
});

document.querySelectorAll("[data-add]").forEach((button) => {
  button.addEventListener("click", () => {
    addObject(button.dataset.add);
  });
});

$("deleteBtn").addEventListener("click", () => {
  if (!selected) {
    setStatus("Select an object first");
    return;
  }

  const name = selected.name;
  removeObject(selected);
  setStatus(name + " deleted");
});

$("duplicateBtn").addEventListener("click", () => {
  if (!selected) return;

  const original = selected;

  const copy = addObject(original.userData.type, {
    name: original.name + " Copy",
    color: "#" + original.material.color.getHexString(),
    position: [
      original.position.x + 1,
      original.position.y,
      original.position.z + 1
    ],
    rotation: [
      original.rotation.x,
      original.rotation.y,
      original.rotation.z
    ],
    scale: [
      original.scale.x,
      original.scale.y,
      original.scale.z
    ]
  });

  selectObject(copy);
  setStatus("Object duplicated");
});

function serializeScene() {
  return {
    format: "FreeForge",
    version: 1,
    objects: objects.map((mesh) => ({
      name: mesh.name,
      type: mesh.userData.type,
      color: "#" + mesh.material.color.getHexString(),
      position: mesh.position.toArray(),
      rotation: mesh.rotation.toArray().slice(0, 3),
      scale: mesh.scale.toArray()
    })),
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray()
    }
  };
}

$("saveBtn").addEventListener("click", () => {
  try {
    const data = JSON.stringify(serializeScene(), null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = "freeforge-project.json";
    link.click();

    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Project JSON downloaded");
  } catch (error) {
    console.error(error);
    setStatus("Could not save project");
  }
});

$("loadBtn").addEventListener("click", () => {
  $("fileInput").click();
});

$("fileInput").addEventListener("change", async (event) => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const text = await file.text();
    const data = JSON.parse(text);

    if (data.format !== "FreeForge" || !Array.isArray(data.objects)) {
      throw new Error("Invalid FreeForge project file");
    }

    objects.slice().forEach(removeObject);

    data.objects.forEach((item) => {
      const validTypes = ["box", "sphere", "cylinder", "floor"];
      const type = validTypes.includes(item.type) ? item.type : "box";

      addObject(type, item);
    });

    if (data.camera?.position?.length === 3) {
      camera.position.fromArray(data.camera.position);
    }

    if (data.camera?.target?.length === 3) {
      controls.target.fromArray(data.camera.target);
    }

    controls.update();
    selectObject(null);
    setStatus("Project loaded successfully");
  } catch (error) {
    console.error(error);
    setStatus("Load failed: choose a valid FreeForge JSON file");
    alert("यह FreeForge की सही JSON project file नहीं है।");
  } finally {
    event.target.value = "";
  }
});

function setPlayMode(value) {
  playing = value;

  $("playBtn").disabled = value;
  $("stopBtn").disabled = !value;
  $("playOverlay").classList.toggle("hidden", !value);

  sceneStatus.textContent = value ? "Play Mode" : "Ready";
  setStatus(value ? "Preview running" : "Preview stopped");

  controls.enabled = !value;
  grid.visible = !value;
  axes.visible = !value;

  if (value) {
    savedCamera = {
      position: camera.position.clone(),
      target: controls.target.clone()
    };
  } else if (savedCamera) {
    camera.position.copy(savedCamera.position);
    controls.target.copy(savedCamera.target);
    controls.update();
    savedCamera = null;
  }
}

$("playBtn").addEventListener("click", () => setPlayMode(true));
$("stopBtn").addEventListener("click", () => setPlayMode(false));
$("overlayStopBtn").addEventListener("click", () => setPlayMode(false));

renderer.domElement.addEventListener("pointerdown", (event) => {
  if (playing) return;

  const rect = renderer.domElement.getBoundingClientRect();

  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);

  const hits = raycaster.intersectObjects(objects, false);

  if (hits.length) {
    selectObject(hits[0].object);
  }
});

function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}

addObject("box", {
  name: "Starter Cube",
  color: "#43a5ff",
  position: [0, 0.5, 0]
});

addObject("floor", {
  name: "Ground",
  color: "#687d65",
  position: [0, -0.08, 0],
  scale: [1, 1, 1]
});

selectObject(null);
resizeRenderer();
animate();

setStatus("Ready — add an object to start building");
