 
import * as THREE from "three";
import { OrbitControls } from "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/controls/OrbitControls.js";

const $ = id => document.getElementById(id);
const viewport = $("viewport");

if (!viewport) {
  document.body.innerHTML = "<h2>FreeForge: index.html mein #viewport nahi mila.</h2>";
  throw new Error("Missing #viewport element");
}

const scene = new THREE.Scene();
scene.background = new THREE.Color("#b8d6e8");
scene.fog = new THREE.Fog("#b8d6e8", 45, 150);

const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 1000);
camera.position.set(14, 12, 18);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.shadowMap.enabled = true;
renderer.outputColorSpace = THREE.SRGBColorSpace;
viewport.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.target.set(0, 1, 0);
controls.maxPolarAngle = Math.PI * 0.49;

scene.add(new THREE.HemisphereLight(0xffffff, 0x718096, 2.2));

const sun = new THREE.DirectionalLight(0xffffff, 2.5);
sun.position.set(12, 25, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
scene.add(sun);

const grid = new THREE.GridHelper(100, 100, 0x52708f, 0x8a9cab);
scene.add(grid);
const axes = new THREE.AxesHelper(2);
scene.add(axes);

const objects = [];
const animatedObjects = [];
let selected = null;
let playing = false;
let savedCamera = null;
let nextId = 1;

const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();

function status(message) {
  const el = $("statusMessage");
  if (el) el.textContent = message;
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

function material(color, roughness = 0.85) {
  return new THREE.MeshStandardMaterial({ color, roughness });
}

function mesh(geometry, color, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material(color));
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function group() {
  return new THREE.Group();
}

function cone(radius, height, color, x, y, z, sides = 8) {
  return mesh(new THREE.ConeGeometry(radius, height, sides), color, x, y, z);
}

/* Green or hilly snow terrain */
function makeTerrain(snow = false) {
  const geometry = new THREE.PlaneGeometry(24, 24, 48, 48);
  geometry.rotateX(-Math.PI / 2);

  const p = geometry.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i);
    const z = p.getZ(i);
    const hills =
      Math.sin(x * 0.55) * 0.65 +
      Math.cos(z * 0.5) * 0.5 +
      Math.sin((x + z) * 0.3) * 0.6;
    p.setY(i, Math.max(0, hills) * (snow ? 1.2 : 0.9));
  }

  geometry.computeVertexNormals();

  const terrain = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      color: snow ? "#eaf4ff" : "#4c8b45",
      roughness: 1,
      side: THREE.DoubleSide
    })
  );

  terrain.receiveShadow = true;
  terrain.castShadow = true;
  return terrain;
}

/* FIX: large, flat, clearly visible white snow ground */
function makeSnowGround() {
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(50, 50),
    new THREE.MeshStandardMaterial({
      color: "#ffffff",
      roughness: 1,
      metalness: 0,
      side: THREE.DoubleSide
    })
  );

  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05;
  ground.receiveShadow = true;
  ground.castShadow = false;
  return ground;
}

function makeMountain(snow = false) {
  const root = group();
  const rock = snow ? "#708294" : "#777568";

  root.add(mesh(new THREE.ConeGeometry(3, 6, 7), rock, 0, 3, 0));
  root.add(mesh(new THREE.ConeGeometry(2.3, 4.5, 7), rock, 2.1, 2.25, -1));
  root.add(mesh(new THREE.ConeGeometry(2.4, 4.8, 7), rock, -2.1, 2.4, 0.7));

  if (snow) {
    root.add(cone(1.5, 2.2, "#ffffff", 0, 4.8, 0, 7));
    root.add(cone(1.15, 1.7, "#f5f9ff", 2.1, 3.5, -1, 7));
    root.add(cone(1.2, 1.8, "#ffffff", -2.1, 3.7, 0.7, 7));
  }
  return root;
}

function makeTree(snow = false) {
  const root = group();

  root.add(mesh(
    new THREE.CylinderGeometry(0.16, 0.24, 1.8, 7),
    "#725039", 0, 0.9, 0
  ));

  for (let i = 0; i < 3; i++) {
    const h = 2 - i * 0.25;
    root.add(cone(
      1.15 - i * 0.19,
      h,
      "#245c38",
      0,
      1.7 + i * 0.8,
      0
    ));

    if (snow) {
      root.add(cone(
        0.93 - i * 0.17,
        h * 0.72,
        "#f5f8ff",
        0,
        1.88 + i * 0.8,
        0
      ));
    }
  }

  return root;
}

function makeWater(ice = false) {
  const water = mesh(
    new THREE.BoxGeometry(12, 0.08, 9),
    ice ? "#c9efff" : "#168fd0",
    0, 0.02, 0
  );

  water.material.transparent = true;
  water.material.opacity = ice ? 0.96 : 0.8;
  water.material.roughness = ice ? 0.22 : 0.12;
  return water;
}

function makeSnowfall() {
  const count = 600;
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    positions[i * 3] = (Math.random() - 0.5) * 30;
    positions[i * 3 + 1] = Math.random() * 18;
    positions[i * 3 + 2] = (Math.random() - 0.5) * 30;
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    "position",
    new THREE.BufferAttribute(positions, 3)
  );

  const points = new THREE.Points(
    geometry,
    new THREE.PointsMaterial({
      color: "#ffffff",
      size: 0.12,
      transparent: true,
      opacity: 0.95
    })
  );

  animatedObjects.push({ type: "snowfall", object: points });
  return points;
}

/* Simple procedural low-poly wildlife */
function makeAnimal(type) {
  const root = group();

  const palette = {
    wolf: ["#737b82", "#d6dce0"],
    deer: ["#a76b38", "#f0d9ad"],
    bear: ["#68452f", "#956744"],
    fox: ["#d76b2e", "#fff0d9"],
    rabbit: ["#c4c8ce", "#f5f5f5"],
    moose: ["#684832", "#b18b5c"],
    owl: ["#9a7651", "#e4d3b1"],
    eagle: ["#65462d", "#c5a77c"]
  };

  const [fur, lightFur] = palette[type] || ["#888888", "#dddddd"];
  const add = obj => root.add(obj);

  if (type === "owl" || type === "eagle") {
    add(mesh(new THREE.SphereGeometry(0.43, 10, 8), fur, 0, 1, 0));
    add(mesh(new THREE.SphereGeometry(0.27, 10, 8), lightFur, 0, 0.8, 0.25));
    add(cone(0.12, 0.3, "#d8a52c", 0, 0.85, 0.48, 5));

    for (const side of [-1, 1]) {
      add(mesh(new THREE.BoxGeometry(0.16, 0.65, 0.65),
        fur, side * 0.42, 0.9, 0));

      add(mesh(new THREE.SphereGeometry(0.075, 8, 6),
        "#f6df83", side * 0.15, 1.13, 0.34));

      add(mesh(new THREE.SphereGeometry(0.035, 6, 6),
        "#171717", side * 0.15, 1.13, 0.4));
    }

    if (type === "eagle") {
      add(mesh(new THREE.BoxGeometry(1.4, 0.08, 0.25),
        fur, 0, 1.05, -0.1));
    }
  } else {
    add(mesh(new THREE.SphereGeometry(0.55, 10, 8),
      fur, 0, 0.72, 0));

    add(mesh(new THREE.SphereGeometry(0.31, 10, 8),
      fur, 0, 1.03, 0.48));

    add(mesh(new THREE.SphereGeometry(0.2, 8, 7),
      lightFur, 0, 0.98, 0.68));

    if (type === "wolf" || type === "fox") {
      add(cone(0.15, 0.48, fur, -0.17, 1.35, 0.45, 5));
      add(cone(0.15, 0.48, fur, 0.17, 1.35, 0.45, 5));
      add(mesh(new THREE.SphereGeometry(0.07, 8, 6),
        "#171717", 0, 0.98, 0.85));
    }

    if (type === "deer" || type === "moose") {
      for (const side of [-1, 1]) {
        const antler = mesh(
          new THREE.CylinderGeometry(0.035, 0.07, 0.7, 5),
          "#d5c09b",
          side * 0.17, 1.68, 0.37
        );
        antler.rotation.z = side * -0.45;
        add(antler);

        add(mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.32, 5),
          "#d5c09b", side * 0.35, 1.82, 0.37));
      }
    }

    if (type === "bear") {
      for (const side of [-1, 1]) {
        add(mesh(new THREE.SphereGeometry(0.16, 8, 6),
          fur, side * 0.26, 1.25, 0.35));
      }
    }

    if (type === "rabbit") {
      for (const side of [-1, 1]) {
        const ear = mesh(new THREE.SphereGeometry(0.11, 8, 8),
          fur, side * 0.13, 1.47, 0.4);
        ear.scale.set(0.65, 2.5, 0.6);
        add(ear);
      }
    }

    for (const x of [-0.32, 0.32]) {
      for (const z of [-0.28, 0.28]) {
        add(mesh(new THREE.CylinderGeometry(0.085, 0.1, 0.48, 7),
          fur, x, 0.27, z));
      }
    }

    add(mesh(new THREE.SphereGeometry(0.1, 8, 6),
      lightFur, 0, 0.72, -0.52));
  }

  root.traverse(child => {
    if (child.isMesh) {
      child.castShadow = true;
      child.receiveShadow = true;
    }
  });

  animatedObjects.push({
    type: "animal",
    object: root,
    baseY: 0,
    phase: Math.random() * Math.PI * 2
  });

  return root;
}

function makeObject(type) {
  switch (type) {
    case "terrain": return makeTerrain(false);
    case "mountains": return makeMountain(false);
    case "tree": return makeTree(false);
    case "water": return makeWater(false);
    case "snow": return makeSnowGround();
    case "snowmountains": return makeMountain(true);
    case "snowtree": return makeTree(true);
    case "ice": return makeWater(true);
    case "snowfall": return makeSnowfall();

    case "wolf":
    case "deer":
    case "bear":
    case "fox":
    case "rabbit":
    case "moose":
    case "owl":
    case "eagle":
      return makeAnimal(type);

    case "sphere":
      return mesh(new THREE.SphereGeometry(0.65, 24, 16), "#43a5ff");

    case "cylinder":
      return mesh(new THREE.CylinderGeometry(0.55, 0.55, 1.2, 24), "#43a5ff");

    case "floor":
      return mesh(new THREE.BoxGeometry(8, 0.15, 8), "#687d65");

    default:
      return mesh(new THREE.BoxGeometry(1, 1, 1), "#43a5ff");
  }
}

const names = {
  box: "Cube",
  sphere: "Sphere",
  cylinder: "Cylinder",
  floor: "Floor",
  terrain: "Green Terrain",
  mountains: "Mountains",
  tree: "Pine Tree",
  water: "Water",
  snow: "Snow Ground",
  snowmountains: "Snow Mountains",
  snowtree: "Snow Pine Tree",
  ice: "Frozen Lake",
  snowfall: "Snowfall",
  wolf: "Wolf",
  deer: "Deer",
  bear: "Bear",
  fox: "Fox",
  rabbit: "Rabbit",
  moose: "Moose",
  owl: "Owl",
  eagle: "Eagle"
};

function getColor(obj) {
  let found = null;
  obj.traverse(child => {
    if (!found && child.isMesh && child.material && child.material.color) {
      found = child.material.color;
    }
  });
  return found || new THREE.Color("#43a5ff");
}

function setColor(obj, color) {
  obj.traverse(child => {
    if (child.isMesh && child.material?.color) {
      child.material.color.set(color);
    }
  });
}

function addObject(type = "box", data = {}) {
  const obj = makeObject(type);
  obj.userData.type = type;
  obj.userData.editorId = nextId++;

  obj.name = data.name || `${names[type] || "Object"} ${obj.userData.editorId}`;

  obj.traverse(child => {
    child.userData.editorRoot = obj;
  });

  obj.position.fromArray(data.position || [
    (Math.random() - 0.5) * 4,
    type === "floor" ? -0.08 : 0,
    (Math.random() - 0.5) * 4
  ]);

  if (data.rotation) obj.rotation.fromArray(data.rotation);
  if (data.scale) obj.scale.fromArray(data.scale);

  scene.add(obj);
  objects.push(obj);
  selectObject(obj);
  status(obj.name + " added");
  return obj;
}

function renderHierarchy() {
  const list = $("hierarchy");
  if (!list) return;

  list.replaceChildren();

  objects.forEach(obj => {
    const row = document.createElement("button");
    row.type = "button";
    row.className = "object-row" + (obj === selected ? " selected" : "");

    const icon = document.createElement("span");
    icon.className = "object-icon";

    const icons = {
      terrain: "🌿", mountains: "🏔️", tree: "🌲",
      water: "🌊", snow: "❄️", snowmountains: "🏔️",
      snowtree: "🌲", ice: "🧊", snowfall: "❄️",
      wolf: "🐺", deer: "🦌", bear: "🐻", fox: "🦊",
      rabbit: "🐇", moose: "🫎", owl: "🦉", eagle: "🦅",
      sphere: "◉", cylinder: "▤", floor: "▱", box: "◇"
    };

    icon.textContent = icons[obj.userData.type] || "◇";

    const label = document.createElement("span");
    label.textContent = obj.name;

    row.append(icon, label);
    row.addEventListener("click", () => selectObject(obj));
    list.appendChild(row);
  });

  const count = $("objectCount");
  if (count) count.textContent = objects.length;
}

function selectObject(obj) {
  selected = obj;
  renderHierarchy();
  updateInspector();
}

function updateInspector() {
  const empty = $("inspectorEmpty");
  const form = $("inspector");
  if (!empty || !form) return;

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

  $("objectColor").value = "#" + getColor(selected).getHexString();
}

$("objectName")?.addEventListener("change", () => {
  if (!selected) return;
  selected.name = $("objectName").value.trim() || "Object";
  renderHierarchy();
});

function bindVectorInput(id, property, axis, convert = v => v, min = -Infinity) {
  const input = $(id);
  if (!input) return;

  input.addEventListener("change", () => {
    if (!selected) return;
    const value = Number(input.value);
    if (!Number.isFinite(value)) return updateInspector();

    selected[property].setComponent(axis, convert(Math.max(min, value)));
    status("Properties updated");
  });
}

["X", "Y", "Z"].forEach((axis, i) => {
  bindVectorInput("pos" + axis, "position", i);
  bindVectorInput("rot" + axis, "rotation", i, THREE.MathUtils.degToRad);
  bindVectorInput("scale" + axis, "scale", i, v => v, 0.1);
});

$("objectColor")?.addEventListener("input", () => {
  if (selected) setColor(selected, $("objectColor").value);
});

document.querySelectorAll("[data-add]").forEach(button => {
  button.addEventListener("click", () => addObject(button.dataset.add));
});

function disposeObject(obj) {
  obj.traverse(child => {
    if (child.geometry) child.geometry.dispose();
    if (child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(mat => mat.dispose());
    }
  });

  for (let i = animatedObjects.length - 1; i >= 0; i--) {
    if (animatedObjects[i].object === obj) {
      animatedObjects.splice(i, 1);
    }
  }
}

function deleteObject(obj) {
  if (!obj) return;
  scene.remove(obj);
  disposeObject(obj);

  const index = objects.indexOf(obj);
  if (index !== -1) objects.splice(index, 1);

  if (selected === obj) selected = null;
  renderHierarchy();
  updateInspector();
}

$("deleteBtn")?.addEventListener("click", () => {
  if (!selected) return status("Select an object first");
  const name = selected.name;
  deleteObject(selected);
  status(name + " deleted");
});

$("duplicateBtn")?.addEventListener("click", () => {
  if (!selected) return;

  const source = selected;
  const copy = addObject(source.userData.type, {
    name: source.name + " Copy",
    position: [source.position.x + 2, source.position.y, source.position.z + 2],
    rotation: source.rotation.toArray().slice(0, 3),
    scale: source.scale.toArray()
  });

  setColor(copy, "#" + getColor(source).getHexString());
  selectObject(copy);
});

function projectData() {
  return {
    format: "FreeForge",
    version: 3,
    objects: objects.map(obj => ({
      name: obj.name,
      type: obj.userData.type,
      color: "#" + getColor(obj).getHexString(),
      position: obj.position.toArray(),
      rotation: obj.rotation.toArray().slice(0, 3),
      scale: obj.scale.toArray()
    })),
    camera: {
      position: camera.position.toArray(),
      target: controls.target.toArray()
    }
  };
}

$("saveBtn")?.addEventListener("click", () => {
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

$("loadBtn")?.addEventListener("click", () => $("fileInput")?.click());

$("fileInput")?.addEventListener("change", async event => {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const data = JSON.parse(await file.text());

    if (data.format !== "FreeForge" || !Array.isArray(data.objects)) {
      throw new Error("Invalid project");
    }

    [...objects].forEach(deleteObject);

    data.objects.forEach(item => {
      const type = Object.prototype.hasOwnProperty.call(names, item.type)
        ? item.type : "box";

      const obj = addObject(type, item);
      if (item.color) setColor(obj, item.color);
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

  if ($("playBtn")) $("playBtn").disabled = value;
  if ($("stopBtn")) $("stopBtn").disabled = !value;
  $("playOverlay")?.classList.toggle("hidden", !value);

  if ($("sceneStatus")) {
    $("sceneStatus").textContent = value ? "Play Mode" : "Ready";
  }

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

$("playBtn")?.addEventListener("click", () => setPlay(true));
$("stopBtn")?.addEventListener("click", () => setPlay(false));
$("overlayStopBtn")?.addEventListener("click", () => setPlay(false));

renderer.domElement.addEventListener("pointerdown", event => {
  if (playing) return;

  const rect = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(objects, true);

  if (hits.length) {
    const root = hits[0].object.userData.editorRoot || hits[0].object;
    if (objects.includes(root)) selectObject(root);
  }
});

function animate() {
  requestAnimationFrame(animate);
  const time = performance.now() * 0.001;

  animatedObjects.forEach(item => {
    if (item.type === "snowfall") {
      const positions = item.object.geometry.attributes.position;

      for (let i = 0; i < positions.count; i++) {
        let y = positions.getY(i) - 0.035;
        if (y < 0) y = 18;
        positions.setY(i, y);
        positions.setX(
          i,
          positions.getX(i) + Math.sin(time + i) * 0.0015
        );
      }

      positions.needsUpdate = true;
    } else if (item.type === "animal") {
      item.object.position.y =
        item.baseY + Math.sin(time * 2 + item.phase) * 0.025;
    }
  });

  controls.update();
  renderer.render(scene, camera);
}

/* Starter world: visible white ground + snowy mountains + tree + wolf */
addObject("snow", {
  name: "Starter Snow Ground",
  position: [0, -0.05, 0]
});

addObject("snowmountains", {
  name: "Snowy Mountains",
  position: [0, 0, -8]
});

addObject("snowtree", {
  name: "Snow Pine Tree",
  position: [-5, 0, 0]
});

addObject("wolf", {
  name: "Forest Wolf",
  position: [3, 0, 1]
});

selectObject(null);
resize();
animate();

if ($("sceneStatus")) $("sceneStatus").textContent = "Ready";
status("Ready — snow ground, mountains, trees and wildlife available");
