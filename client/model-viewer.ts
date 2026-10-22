import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
export async function mountModel(
  host: HTMLElement,
  src: string,
  onReady: () => void,
  onFailure: () => void,
) {
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: true,
    powerPreference: "low-power",
  });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  const scene = new THREE.Scene(),
    camera = new THREE.PerspectiveCamera(35, 1, 0.001, 1000),
    controls = new OrbitControls(camera, renderer.domElement);
  let disposed = false,
    model: THREE.Object3D | null = null,
    frame = 0,
    distance = 3;
  controls.enablePan = false;
  controls.enableZoom = false;
  controls.enableRotate = matchMedia("(pointer:fine)").matches;
  renderer.domElement.style.touchAction = "pan-y";
  renderer.domElement.tabIndex = 0;
  renderer.domElement.setAttribute("role", "img");
  renderer.domElement.setAttribute(
    "aria-label",
    "Interactive product model. Arrow keys rotate, plus or minus zoom, Home resets.",
  );
  host.appendChild(renderer.domElement);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x756a58, 2));
  const key = new THREE.DirectionalLight(0xfff8ed, 3);
  key.position.set(3, 4, 5);
  scene.add(key);
  const draw = () => {
    frame = 0;
    if (!disposed && !document.hidden) renderer.render(scene, camera);
  };
  const request = () => {
    if (!frame && !disposed) frame = requestAnimationFrame(draw);
  };
  const reset = () => {
    camera.position.set(distance * 0.35, distance * 0.2, distance);
    controls.target.set(0, 0, 0);
    controls.update();
    request();
  };
  const turn = (direction: number) => {
    const s = new THREE.Spherical().setFromVector3(camera.position);
    s.theta += (direction * Math.PI) / 8;
    camera.position.setFromSpherical(s);
    controls.update();
    request();
  };
  const zoom = (direction: number) => {
    camera.position
      .multiplyScalar(direction > 0 ? 0.85 : 1.18)
      .clampLength(distance * 0.35, distance * 3);
    controls.update();
    request();
  };
  const resize = new ResizeObserver(() => {
    const r = host.getBoundingClientRect();
    if (!r.width || !r.height) return;
    renderer.setSize(r.width, r.height, false);
    camera.aspect = r.width / r.height;
    camera.updateProjectionMatrix();
    request();
  });
  resize.observe(host);
  const keydown = (e: KeyboardEvent) => {
    if (["ArrowLeft", "ArrowRight", "+", "=", "-", "Home"].includes(e.key))
      e.preventDefault();
    if (e.key === "ArrowLeft") turn(-1);
    if (e.key === "ArrowRight") turn(1);
    if (["+", "="].includes(e.key)) zoom(1);
    if (e.key === "-") zoom(-1);
    if (e.key === "Home") reset();
  };
  renderer.domElement.addEventListener("keydown", keydown);
  controls.addEventListener("change", request);
  document.addEventListener("visibilitychange", request);
  const release = (root: THREE.Object3D) =>
    root.traverse((object) => {
      if (object instanceof THREE.Mesh) {
        object.geometry.dispose();
        for (const material of Array.isArray(object.material)
          ? object.material
          : [object.material]) {
          for (const value of Object.values(material))
            if (value instanceof THREE.Texture) value.dispose();
          material.dispose();
        }
      }
    });
  void new GLTFLoader()
    .loadAsync(src)
    .then((gltf) => {
      if (disposed) {
        release(gltf.scene);
        return;
      }
      model = new THREE.Group();
      model.add(gltf.scene);
      const box = new THREE.Box3().setFromObject(model),
        size = box.getSize(new THREE.Vector3()),
        center = box.getCenter(new THREE.Vector3()),
        extent = Math.max(size.x, size.y, size.z);
      if (!Number.isFinite(extent) || extent <= 0) throw Error("Empty model");
      gltf.scene.position.sub(center);
      model.scale.setScalar(1 / extent);
      distance = 2.1;
      scene.add(model);
      reset();
      onReady();
    })
    .catch(() => {
      if (!disposed) onFailure();
    });
  function dispose() {
    if (disposed) return;
    disposed = true;
    cancelAnimationFrame(frame);
    resize.disconnect();
    controls.dispose();
    document.removeEventListener("visibilitychange", request);
    renderer.domElement.removeEventListener("keydown", keydown);
    if (model) release(model);
    renderer.dispose();
    renderer.domElement.remove();
  }
  return { turn, zoom, reset, dispose };
}
