 
import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const $ = id => document.getElementById(id);
const viewport = $("viewport");
const scene = new THREE.Scene();
scene.background = new THREE.Color("#182330");

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
camera.position.set(7, 6, 9);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 0.5, 0);

scene.add(new THREE.HemisphereLight(0xffffff, 0x384152, 2));

const light = new THREE.DirectionalLight(0xffffff, 2);
light.position.set(5, 10, 6);
light.castShadow = true;
scene.add(light);

const grid = new THREE.GridHelper(100, 100, 0x52708f, 0x34465c);
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

function status(message) {
  $("statusMessage").textContent = message;
}

function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  if (!w || !h) return;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
}

window.addEventListener("resize", resize);
if ("ResizeObserver" in window) {
  new ResizeObserver(resize).observe(viewport);
}

function geometry(type) {
  if (type === "sphere") return new THREE.SphereGeometry(0.65, 32, 24);
  if (type === "cylinder") return new THREE.CylinderGeometry(0.55, 0.55, 1.2, 32);
  if (type === "floor") return new THREE.BoxGeometry(8, 0.15, 8);
  return new THREE.BoxGeometry(1, 1, 1);
}

function addObject(type = "box", data = {}) {
  const mesh = new THREE.Mesh(
    geometry(type),
    new THREE.MeshStandardMaterial({
      color: data.color || "#43a5ff",
      roughness: 0.65
    })
  );

  mesh.userData.type = type;
  mesh.userData.editorId = nextId++;
  mesh.name = data.name || ({
    box: "Cube",
    sphere: "Sphere",
    cylinder: "Cylinder",
    floor: "Floor"
  }[type] || "Object") + " " + mesh.userData.editorId;

  mesh.position.fromArray(data.position || [
    (Math.random() - 0.5) * 3,
    type === "floor" ? -0.08 : 0.6,
    (Math.random() - 0.5) * 3
  ]);

  if (data.rotation) mesh.rotation.fromArray(data.rotation);
  if (data.scale) mesh.scale.fromArray(data.scale);

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  scene.add(mesh);
  objects.push(mesh);
  selectObject(mesh);
  status(mesh.name + " added");
  return mesh;
}

function renderHierarchy() {
  const list = $("hierarchy");
  list.replaceChildren();

  objects.forEach(mesh => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "object-row" + (mesh === selected ? " selected" : "");

    const icon = document.createElement("span");
    icon.className = "object-icon";
    icon.textContent = mesh.userData.type === "sphere" ? "◉" :
      mesh.userData.type === "cylinder" ? "▤" :
      mesh.userData.type === "floor" ? "▱" : "◇";

    const name = document.createElement("span");
    name.textContent = mesh.name;
    row.append(icon, name);
    row.addEventListener("click", () => selectObject(mesh));
    list.appendChild(row);
  });

  $("objectCount").textContent = objects.length;
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
  ["X", "Y", "Z"].forEach((axis, i) => {
    $("pos" + axis).value = selected.position.getComponent(i).toFixed(2);
    $("rot" + axis).value = THREE.MathUtils.radToDeg(
      selected.rotation.getComponent(i)
    ).toFixed(1);
    $("scale" + axis).value = selected.scale.getComponent(i).toFixed(2);
  });
  $("objectColor").value = "#" + selected.material.color.getHexString();
}

$("objectName").addEventListener("change", () => {
  if (!selected) return;
  selected.name = $("objectName").value.trim() || "Object";
  renderHierarchy();
});

function bindVectorInput(id, property, axis, convert = v => v, min = -Infinity) {
  $(id).addEventListener("change", () => {
    if (!selected) return;
    const value = Number($(id).value);
    if (!Number.isFinite(value)) {
      updateInspector();
      return;
    }
    selected[property].setComponent(axis, convert(Math.max(min, value)));
    status("Properties updated");
  });
}

["X", "Y", "Z"].forEach((axis, i) => {
  bindVectorInput("pos" + axis, "position", i);
  bindVectorInput("rot" + axis, "rotation", i, THREE.MathUtils.degToRad);
  bindVectorInput("scale" + axis, "scale", i, v => v, 0.1);
});

$("objectColor").addEventListener("input", () => {
  if (selected) selected.material.color.set($("objectColor").value);
});

document.querySelectorAll("[data-add]").forEach(button => {
  button.addEventListener("click", () => addObject(button.dataset.add));
});

function deleteObject(mesh) {
  if (!mesh) return;
  scene.remove(mesh);
  mesh.geometry.dispose();
  mesh.material.dispose();
  const index = objects.indexOf(mesh);
  if (index >= 0) objects.splice(index, 1);
  if (selected === mesh) selected = null;
  renderHierarchy();
  updateInspector();
}

$("deleteBtn").addEventListener("click", () => {
  if (!selected) return status("Select an object first");
  const name = selected.name;
  deleteObject(selected);
  status(name + " deleted");
});

$("duplicateBtn").addEventListener("click", () => {
  if (!selected) return;
  const source = selected;
  const copy = addObject(source.userData.type, {
    name: source.name + " Copy",
    color: "#" + source.material.color.getHexString(),
    position: [source.position.x + 1, source.position.y, source.position.z + 1],
    rotation: source.rotation.toArray().slice(0, 3),
    scale: source.scale.toArray()
  });
  selectObject(copy);
});

function projectData() {
  return {
    format: "FreeForge",
    version: 1,
    objects: objects.map(mesh => ({
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
  const blob = new Blob([JSON.stringify(projectData(), null, 2)], {
    type: "application/json"
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "freeforge-project.json";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  status("Project downloaded as JSON");
});

$("loadBtn").addEventListener("click", () => $("fileInput").click());

$("fileInput").addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());
    if (data.format !== "FreeForge" || !Array.isArray(data.objects)) {
      throw new Error("Invalid project");
    }

    [...objects].forEach(deleteObject);

    data.objects.forEach(item => {
      const allowed = ["box", "sphere", "cylinder", "floor"];
      addObject(allowed.includes(item.type) ? item.type : "box", item);
    });

    if (data.camera?.position?.length === 3) {
      camera.position.fromArray(data.camera.position);
    }
    if (data.camera?.target?.length === 3) {
      controls.target.fromArray(data.camera.target);
    }

    controls.update();
    selectObject(null);
    status("Project loaded");
  } catch (error) {
    console.error(error);
    alert("Valid FreeForge JSON file select karo.");
    status("Could not load project");
  }

  event.target.value = "";
});

function setPlay(value) {
  playing = value;
  $("playBtn").disabled = value;
  $("stopBtn").disabled = !value;
  $("playOverlay").classList.toggle("hidden", !value);
  $("sceneStatus").textContent = value ? "Play Mode" : "Ready";
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

  status(value ? "Preview running" : "Preview stopped");
}

$("playBtn").addEventListener("click", () => setPlay(true));
$("stopBtn").addEventListener("click", () => setPlay(false));
$("overlayStopBtn").addEventListener("click", () => setPlay(false));

renderer.domElement.addEventListener("pointerdown", event => {
  if (playing) return;
  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objects, false);
  if (hits.length) selectObject(hits[0].object);
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
  position: [0, -0.08, 0]
});

selectObject(null);
resize();
animate();
$("sceneStatus").textContent = "Ready";
status("Ready — add an object to begin");
