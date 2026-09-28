"use client";
import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import { PlacedAssetLayer } from "./placed-asset-layer";
import { findAsset, type PlacedAsset } from "@/lib/placement";
import type { Scenario, Point2 } from "@/lib/engine";
import { factoryBounds, type FactoryDefinition } from "@/lib/factory-scenario";
import { robotAsset } from "@/lib/robot-catalog";
import {
  forwardKinematics,
  motionTrail,
  sampleMotion,
  sampleWorkspace,
  robotToFactory,
  type MotionPlan,
} from "@/lib/robot-motion";
import type { RobotModel, RobotTelemetry, Vec3 } from "@/lib/robot-types";
import type { TourRect } from "@/lib/tour-layout";
export type Layers = {
  factory: boolean;
  equipment: boolean;
  reach: boolean;
  safety: boolean;
  paths: boolean;
  labels: boolean;
};
export type ViewerHandle = {
  capture: () => string | undefined;
  focus: (mode: "overview" | "cell" | "top") => void;
  zoom: (direction: number) => void;
  seek: (progress: number) => void;
  focusAsset: (item: PlacedAsset) => void;
  tourCamera: (options: { mode: "cell" | "range" | "overview"; duration: number; reset: boolean; onArrive: () => void }) => void;
  stopTour: () => void;
  tourBounds: (mode: "cell" | "range") => TourRect | null;
};
type Props = {
  definition: FactoryDefinition;
  scenario: Scenario;
  candidateId: string;
  layers: Layers;
  view: "3d" | "2d";
  placing: boolean;
  playing: boolean;
  onSelect: (id: string) => void;
  onPlace: (p: Point2) => void;
  onLoaded: (v: boolean) => void;
  model?: RobotModel;
  motionPlan?: MotionPlan;
  snap?: number;
  studioOpen?: boolean;
  onTelemetry?: (v: RobotTelemetry) => void;
  placementDraft?: PlacedAsset | null;
  selectedAsset?: string | null;
  assetPlaying?: boolean;
  tourActive?: boolean;
  tourPaused?: boolean;
  onDraftMove?: (p: Point2) => void;
  onAssetSelect?: (id: string) => void;
  onAssetError?: (id: string) => void;
  onAssetStatus?: (status: "loading" | "ready" | "error") => void;
};
type Runtime = {
  scene: THREE.Scene;
  assets: PlacedAssetLayer;
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  ortho: THREE.OrthographicCamera;
  controls: OrbitControls;
  factory: THREE.Group | null;
  robot: THREE.Group | null;
  overlay: THREE.Group;
  targetPosition: THREE.Vector3 | null;
  targetLook: THREE.Vector3 | null;
  cameraFlight: { from: THREE.Vector3; lookFrom: THREE.Vector3; to: THREE.Vector3; lookTo: THREE.Vector3; elapsed: number; duration: number; onArrive: () => void } | null;
  view: "3d" | "2d";
  animNodes: THREE.Object3D[];
  selected: THREE.BoxHelper | null;
  reframe: () => void;
  motionTime: number;
  playbackPose: number[] | null;
  motionOverlay: THREE.Group;
  tcpMarker: THREE.Mesh;
  wasPlaying: boolean;
  transition: {
    from: number[];
    to: number[];
    elapsed: number;
    duration: number;
  } | null;
};
function neutralizeMaterial(material: THREE.MeshStandardMaterial) {
  // Keep every reflected panel backdrop neutral, including status lights.
  const c = material.color;
  const grey = 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
  c.setRGB(grey, grey, grey);
  const e = material.emissive;
  const glow = 0.2126 * e.r + 0.7152 * e.g + 0.0722 * e.b;
  e.setRGB(glow, glow, glow);
}
const world = (p: Point2, h = 0.12) => new THREE.Vector3(p.x, h, -p.y);
const dispose = (root: THREE.Object3D) => {
  root.traverse((o) => {
    if (
      o instanceof THREE.Mesh ||
      o instanceof THREE.Line ||
      o instanceof THREE.Points ||
      o instanceof THREE.Sprite
    ) {
      if (!(o instanceof THREE.Sprite)) o.geometry.dispose();
      const m = Array.isArray(o.material) ? o.material : [o.material];
      m.forEach((x) => {
        if ((x as THREE.MeshBasicMaterial).map)
          (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      });
    }
  });
};
function label(text: string, color = "#e1e1e1", scale = 1) {
  const compact = text.length <= 3;
  const cv = document.createElement("canvas");
  cv.width = compact ? 128 : 512;
  cv.height = compact ? 128 : 104;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "rgba(24,24,24,.94)";
  ctx.beginPath();
  ctx.roundRect(6, 6, cv.width - 12, cv.height - 12, 22);
  ctx.fill();
  ctx.strokeStyle = color + "66";
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.font = compact
    ? "600 68px -apple-system, sans-serif"
    : "500 30px -apple-system, sans-serif";
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, cv.width / 2, cv.height / 2 + 2);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: tex,
      transparent: true,
      depthTest: false,
      toneMapped: false,
      sizeAttenuation: !compact,
    }),
  );
  sprite.scale.set(
    compact ? 0.023 : 2.5 * scale,
    compact ? 0.023 : 0.51 * scale,
    1,
  );
  sprite.renderOrder = 5;
  return sprite;
}
function line(points: THREE.Vector3[], color: number, dashed = false) {
  const g = new THREE.BufferGeometry().setFromPoints(points);
  const m = dashed
    ? new THREE.LineDashedMaterial({
        color,
        transparent: true,
        opacity: 0.9,
        dashSize: 0.2,
        gapSize: 0.13,
      })
    : new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.85 });
  const l = new THREE.Line(g, m);
  if (dashed) l.computeLineDistances();
  return l;
}
function ring(center: Point2, radius: number, color: number, fill = false) {
  const group = new THREE.Group();
  const ps = Array.from({ length: 129 }, (_, i) =>
    world(
      {
        x: center.x + Math.cos((i / 128) * Math.PI * 2) * radius,
        y: center.y + Math.sin((i / 128) * Math.PI * 2) * radius,
      },
      0.14,
    ),
  );
  group.add(line(ps, color, !fill));
  if (fill) {
    const mesh = new THREE.Mesh(
      new THREE.CircleGeometry(radius, 100),
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.025,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.copy(world(center, 0.13));
    group.add(mesh);
  }
  return group;
}
export const FactoryViewer = forwardRef<ViewerHandle, Props>(
  function FactoryViewer(props, ref) {
    const host = useRef<HTMLDivElement>(null);
    const rt = useRef<Runtime | null>(null);
    const current = useRef(props);
    const previousCandidate = useRef(props.candidateId);
    current.current = props;
    const [state, setState] = useState<"loading" | "ready" | "error">(
      "loading",
    );
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState("");
    const focus = (mode: "overview" | "cell" | "top") => {
      const r = rt.current;
      if (!r) return;
      const c = current.current.scenario.candidates.find(
        (c) => c.id === current.current.candidateId,
      )!;
      if (r.view === "2d") {
        const target =
          mode === "cell" ? world(c.position, 0) : new THREE.Vector3(0, 0, 0);
        r.targetPosition = null;
        r.targetLook = null;
        r.controls.target.copy(target);
        r.ortho.position.set(target.x, 40, target.z + 0.001);
        r.ortho.zoom = mode === "cell" ? 2.5 : 1;
        r.ortho.lookAt(target);
        r.ortho.updateProjectionMatrix();
        r.controls.update();
        return;
      }
      if (mode === "overview") {
        r.targetPosition = new THREE.Vector3(
          ...current.current.definition.camera.overviewPosition,
        );
        r.targetLook = new THREE.Vector3(0, 0, 0);
      } else if (mode === "cell") {
        const { cellOffset, targetHeight } = current.current.definition.camera;
        const model = current.current.model,
          height = c.mountHeight ?? 0;
        if (model) {
          const reach = Math.max(1, model.reach);
          r.targetPosition = new THREE.Vector3(
            c.position.x + reach * 1.85,
            height + reach * 1.65,
            -c.position.y + reach * 2.35,
          );
          r.targetLook = world(c.position, height + model.tcp[2] * 0.8);
        } else {
          r.targetPosition = new THREE.Vector3(
            c.position.x + cellOffset[0],
            cellOffset[1],
            -c.position.y + cellOffset[2],
          );
          r.targetLook = world(c.position, targetHeight);
        }
      } else {
        r.targetPosition = new THREE.Vector3(0, 32, 0.001);
        r.targetLook = new THREE.Vector3(0, 0, 0);
      }
    };
    useImperativeHandle(
      ref,
      () => ({
        capture: () => {
          const r = rt.current;
          if (!r || !r.factory || !r.robot) return;
          r.renderer.render(r.scene, r.view === "2d" ? r.ortho : r.camera);
          return r.renderer.domElement.toDataURL("image/png");
        },
        focus,
        tourCamera: ({ mode, duration, reset, onArrive }) => {
          const r = rt.current;
          if (!r) return;
          r.controls.enabled = false;
          if (reset) {
            r.camera.position.set(...current.current.definition.camera.overviewPosition);
            r.controls.target.set(0, 0, 0);
            r.controls.update();
          }
          focus(mode === "range" ? "cell" : mode);
          const to = r.targetPosition?.clone() ?? r.camera.position.clone();
          const lookTo = r.targetLook?.clone() ?? r.controls.target.clone();
          if (mode === "range") to.sub(lookTo).multiplyScalar(1.8).add(lookTo);
          r.targetPosition = null;
          r.targetLook = null;
          r.cameraFlight = { from: r.camera.position.clone(), lookFrom: r.controls.target.clone(), to, lookTo, elapsed: 0, duration, onArrive };
        },
        stopTour: () => {
          if (!rt.current) return;
          rt.current.cameraFlight = null;
          rt.current.controls.enabled = true;
        },
        tourBounds: (mode) => {
          const r = rt.current, el = host.current, p = current.current;
          if (!r || !el) return null;
          const c = p.scenario.candidates.find(c => c.id === p.candidateId);
          if (!c) return null;
          const reach = p.model?.reach ?? p.scenario.robot.reach;
          const radius = mode === "range" ? reach * 1.2 : reach * .7;
          const height = mode === "range" ? .2 : reach * 1.7;
          const box = el.getBoundingClientRect();
          const points: THREE.Vector3[] = [];
          for (const x of [-radius, radius]) for (const y of [0, height]) for (const z of [-radius, radius]) {
            const point = new THREE.Vector3(c.position.x + x, (c.mountHeight ?? 0) + y, -c.position.y + z).project(r.camera);
            if (![point.x, point.y, point.z].every(Number.isFinite) || point.z > 1) return null;
            points.push(point);
          }
          const xs = points.map(p => box.left + (p.x + 1) * box.width / 2);
          const ys = points.map(p => box.top + (1 - p.y) * box.height / 2);
          const x = Math.max(box.left + box.width * .12, Math.min(...xs) - 16);
          const y = Math.max(box.top + 30, Math.min(...ys) - 16);
          return { x, y, width: Math.min(box.right - x - box.width * .12, Math.max(...xs) - x + 16), height: Math.min(box.bottom - y - 80, Math.max(...ys) - y + 16) };
        },
        focusAsset: (item) => {
          const r = rt.current,
            asset = findAsset(item.assetId);
          if (!r || !asset) return;
          const size = Math.max(1.5, asset.width, asset.depth, asset.height);
          r.targetLook = world(
            item.position,
            item.mountHeight + asset.height * 0.45,
          );
          r.targetPosition = world(
            item.position,
            item.mountHeight + size * 1.6,
          ).add(new THREE.Vector3(size * 1.6, 0, size * 2.1));
        },
        seek: (progress) => {
          const r = rt.current,
            plan = current.current.motionPlan;
          if (!r || !plan) return;
          r.motionTime =
            Math.min(0.999999, Math.max(0, progress)) * plan.duration;
          r.playbackPose = sampleMotion(plan, r.motionTime);
          r.transition = null;
        },
        zoom: (dir) => {
          const r = rt.current;
          if (!r) return;
          if (r.view === "2d") {
            r.ortho.zoom = THREE.MathUtils.clamp(
              r.ortho.zoom * (dir > 0 ? 1.2 : 0.8),
              0.4,
              5,
            );
            r.ortho.updateProjectionMatrix();
          } else
            r.camera.position
              .sub(r.controls.target)
              .multiplyScalar(dir > 0 ? 0.8 : 1.2)
              .add(r.controls.target);
        },
      }),
      [],
    );
    useEffect(() => {
      if (!host.current) return;
      const el = host.current;
      current.current.onLoaded(false);
      const definition = current.current.definition;
      let cancelled = false;
      let frame = 0;
      const scene = new THREE.Scene();
      scene.background = new THREE.Color("#262626");
      scene.fog = new THREE.Fog("#262626", 55, 110);
      const camera = new THREE.PerspectiveCamera(
        35,
        el.clientWidth / el.clientHeight,
        0.1,
        160,
      );
      const initialCandidate =
        current.current.scenario.candidates.find(
          (candidate) => candidate.id === current.current.candidateId,
        ) ?? current.current.scenario.candidates[0];
      camera.position.set(
        initialCandidate.position.x + definition.camera.cellOffset[0],
        definition.camera.cellOffset[1],
        -initialCandidate.position.y + definition.camera.cellOffset[2],
      );
      const ortho = new THREE.OrthographicCamera(-18, 18, 14, -14, 0.1, 120);
      ortho.position.set(0, 40, 0.001);
      ortho.lookAt(0, 0, 0);
      let renderer: THREE.WebGLRenderer;
      try {
        renderer = new THREE.WebGLRenderer({
          antialias: true,
          alpha: false,
          preserveDrawingBuffer: true,
          powerPreference: "high-performance",
        });
      } catch {
        setError(
          "3D 렌더러를 시작하지 못했습니다. WebGL을 지원하는 브라우저에서 열어주세요.",
        );
        setState("error");
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.75));
      renderer.setSize(el.clientWidth, el.clientHeight);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 0.86;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFShadowMap;
      renderer.domElement.setAttribute(
        "aria-label",
        `${definition.title} 3D 모델. 드래그로 회전, 스크롤로 확대, 우클릭으로 이동`,
      );
      renderer.domElement.setAttribute("role", "img");
      el.appendChild(renderer.domElement);
      const pmrem = new THREE.PMREMGenerator(renderer);
      const env = new RoomEnvironment();
      scene.environment = pmrem.fromScene(env, 0.04).texture;
      env.dispose();
      pmrem.dispose();
      scene.environmentIntensity = 0.82;
      scene.add(new THREE.HemisphereLight(0xededed, 0x545454, 1.05));
      const sun = new THREE.DirectionalLight(0xf5f5f5, 2.9);
      sun.position.set(-8, 22, 14);
      sun.castShadow = true;
      sun.shadow.mapSize.set(2048, 2048);
      sun.shadow.camera.left = -17;
      sun.shadow.camera.right = 17;
      sun.shadow.camera.top = 17;
      sun.shadow.camera.bottom = -17;
      sun.shadow.normalBias = 0.025;
      sun.shadow.bias = -0.0002;
      sun.shadow.radius = 3;
      scene.add(sun);
      const rim = new THREE.DirectionalLight(0xc8c8c8, 1.55);
      rim.position.set(10, 8, -12);
      scene.add(rim);
      const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(150, 150),
        new THREE.MeshStandardMaterial({ color: 0x262626, roughness: 0.88 }),
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = -0.24;
      floor.receiveShadow = true;
      scene.add(floor);
      const grid = new THREE.GridHelper(80, 80, 0x555555, 0x363636);
      grid.position.y = -0.22;
      scene.add(grid);
      const controls = new OrbitControls(camera, renderer.domElement);
      controls.enableDamping = true;
      controls.dampingFactor = 0.07;
      controls.maxPolarAngle = Math.PI / 2.04;
      controls.minDistance = 3;
      controls.maxDistance = 70;
      controls.target.copy(
        world(initialCandidate.position, definition.camera.targetHeight),
      );
      controls.update();
      const overlay = new THREE.Group();
      scene.add(overlay);
      const motionOverlay = new THREE.Group();
      scene.add(motionOverlay);
      const tcpMarker = new THREE.Mesh(
        new THREE.SphereGeometry(0.023, 16, 10),
        new THREE.MeshBasicMaterial({ color: 0x2385ff, depthTest: false }),
      );
      tcpMarker.renderOrder = 4;
      tcpMarker.visible = false;
      scene.add(tcpMarker);
      const runtime: Runtime = {
        scene,
        assets: new PlacedAssetLayer(scene),
        renderer,
        camera,
        ortho,
        controls,
        factory: null,
        robot: null,
        overlay,
        targetPosition: null,
        targetLook: null,
        cameraFlight: null,
        view: "3d",
        animNodes: [],
        selected: null,
        reframe: () => {},
        motionTime: 0,
        playbackPose: null,
        motionOverlay,
        tcpMarker,
        wasPlaying: false,
        transition: null,
      };
      rt.current = runtime;
      controls.addEventListener("start", () => {
        runtime.targetPosition = null;
        runtime.targetLook = null;
      });
      const loader = new GLTFLoader();
      Promise.all([
        loader.loadAsync(definition.assets.factory, (e) => {
          if (!cancelled && e.total)
            setProgress(Math.round((e.loaded / e.total) * 80));
        }),
        loader.loadAsync(
          current.current.model
            ? robotAsset(current.current.model, "robot.glb")
            : definition.assets.robot,
        ),
      ])
        .then(([factory, robot]) => {
          if (cancelled) {
            dispose(factory.scene);
            dispose(robot.scene);
            return;
          }
          runtime.factory = factory.scene;
          runtime.robot = robot.scene;
          factory.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              const materials = Array.isArray(o.material)
                ? o.material
                : [o.material];
              for (const material of materials) {
                if (!(material instanceof THREE.MeshStandardMaterial)) continue;
                neutralizeMaterial(material);
                const neutralPalette: Record<string, string> = {
                  RS_epoxy: "#737373",
                  RS_floor_alt: "#696969",
                  RS_wall: "#bcbcbc",
                  RS_darksteel: "#303030",
                };
                if (neutralPalette[material.name])
                  material.color.set(neutralPalette[material.name]);
              }
            }
            o.userData.originalVisible = o.visible;
          });
          robot.scene.traverse((o) => {
            if (o instanceof THREE.Mesh) {
              o.castShadow = true;
              o.receiveShadow = true;
              const materials = Array.isArray(o.material)
                ? o.material
                : [o.material];
              for (const material of materials) {
                if (!(material instanceof THREE.MeshStandardMaterial)) continue;
                neutralizeMaterial(material);
                if (current.current.model && /blue/i.test(material.name)) {
                  material.color.set("#176af2");
                  material.metalness = 0.72;
                  material.roughness = 0.28;
                }
                if (material.name === "RS_blue") {
                  material.color.set("#777777");
                  material.metalness = 0.8;
                  material.roughness = 0.28;
                } else if (material.name === "RS_cyan") {
                  material.color.set("#0969ef");
                  material.metalness = 0.78;
                  material.roughness = 0.25;
                } else if (material.name === "RS_darksteel") {
                  material.color.set("#292929");
                }
              }
            }
            if (
              typeof o.userData.joint_index === "number" &&
              !(o instanceof THREE.Mesh)
            ) {
              o.userData.restQuaternion = o.quaternion.clone();
              o.userData.restPosition = o.position.clone();
              const axis =
                current.current.model?.joints[o.userData.joint_index - 1]?.axis;
              o.userData.motionAxis = new THREE.Vector3(
                ...(axis
                  ? ([axis[0], axis[2], -axis[1]] as Vec3)
                  : ((o.userData.joint_axis_blender === "Z"
                      ? [0, 1, 0]
                      : o.userData.joint_axis_blender === "Y"
                        ? [0, 0, -1]
                        : [1, 0, 0]) as [number, number, number])),
              );
              runtime.animNodes.push(o);
            }
          });
          scene.add(factory.scene, robot.scene);
          const c = current.current.scenario.candidates.find(
            (c) => c.id === current.current.candidateId,
          )!;
          robot.scene.position.copy(
            world(c.position, (c.mountHeight ?? 0) + 0.035),
          );
          robot.scene.rotation.y = ((c.yawDeg ?? 0) * Math.PI) / 180;
          setProgress(100);
          setState("ready");
          current.current.onLoaded(true);
          if (current.current.model) focus("cell");
        })
        .catch((e) => {
          if (!cancelled) {
            setError(
              "공장 모델을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.",
            );
            setState("error");
            console.error("Factory model load", e);
          }
        });
      const ray = new THREE.Raycaster();
      const mouse = new THREE.Vector2();
      let down = { x: 0, y: 0 };
      let draggingGhost = false;
      let ghostDragged = false;
      let grabFloor = new THREE.Vector3();
      let grabPosition: Point2 = { x: 0, y: 0 };
      const aim = (e: PointerEvent) => {
        const rect = el.getBoundingClientRect();
        mouse.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          -((e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(mouse, runtime.view === "2d" ? ortho : camera);
      };
      const moveDraft = (e: PointerEvent) => {
        aim(e);
        const point = new THREE.Vector3();
        if (
          ray.ray.intersectPlane(
            new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
            point,
          )
        ) {
          if (draggingGhost) {
            point.x = grabPosition.x + point.x - grabFloor.x;
            point.z = -grabPosition.y + point.z - grabFloor.z;
          }
          const b = factoryBounds(current.current.scenario),
            snap = current.current.snap ?? 0.05;
          const round = (v: number) =>
            Number((snap > 0 ? Math.round(v / snap) * snap : v).toFixed(3));
          current.current.onDraftMove?.({
            x: THREE.MathUtils.clamp(round(point.x), b.minX, b.maxX),
            y: THREE.MathUtils.clamp(round(-point.z), b.minY, b.maxY),
          });
        }
      };
      const pointermove = (e: PointerEvent) => {
        if (
          draggingGhost &&
          Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6
        ) {
          ghostDragged = true;
          moveDraft(e);
        }
      };
      const pointercancel = () => {
        draggingGhost = false;
        controls.enabled = true;
      };
      const pointerdown = (e: PointerEvent) => {
        if (current.current.tourActive) return;
        down = { x: e.clientX, y: e.clientY };
        if (e.button === 0 && current.current.placementDraft) {
          aim(e);
          const hit = runtime.assets.hit(ray);
          if (hit?.object.userData.placementGhost) {
            runtime.targetPosition = null;
            runtime.targetLook = null;
            const intersection = ray.ray.intersectPlane(
              new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
              grabFloor,
            );
            if (!intersection) return;
            grabPosition = { ...current.current.placementDraft.position };
            draggingGhost = true;
            ghostDragged = false;
            controls.enabled = false;
            el.setPointerCapture(e.pointerId);
            e.preventDefault();
          }
        }
      };
      const pointerup = (e: PointerEvent) => {
        if (current.current.tourActive) return;
        if (draggingGhost) {
          if (ghostDragged) moveDraft(e);
          draggingGhost = false;
          controls.enabled = true;
          if (el.hasPointerCapture(e.pointerId))
            el.releasePointerCapture(e.pointerId);
          return;
        }
        if (
          Math.hypot(e.clientX - down.x, e.clientY - down.y) > 6 ||
          e.button !== 0
        )
          return;
        const rect = el.getBoundingClientRect();
        mouse.set(
          ((e.clientX - rect.left) / rect.width) * 2 - 1,
          (-(e.clientY - rect.top) / rect.height) * 2 + 1,
        );
        ray.setFromCamera(mouse, runtime.view === "2d" ? ortho : camera);
        if (current.current.placementDraft) {
          moveDraft(e);
          return;
        }
        const placedHit = runtime.assets.hit(ray);
        if (placedHit) {
          current.current.onAssetSelect?.(placedHit.object.userData.placedId);
          return;
        }
        if (current.current.placing) {
          const point = new THREE.Vector3();
          if (
            ray.ray.intersectPlane(
              new THREE.Plane(new THREE.Vector3(0, 1, 0), 0),
              point,
            )
          ) {
            const s = current.current.scenario;
            const b = factoryBounds(s, s.robot.footprintDiameter / 2);
            const snap = current.current.snap ?? 0.05;
            const snapped = (value: number) =>
              snap > 0
                ? Number((Math.round(value / snap) * snap).toFixed(4))
                : Math.round(value * 1000) / 1000;
            current.current.onPlace({
              x: THREE.MathUtils.clamp(snapped(point.x), b.minX, b.maxX),
              y: THREE.MathUtils.clamp(snapped(-point.z), b.minY, b.maxY),
            });
          }
        } else {
          const hits = ray.intersectObjects(overlay.children, true);
          const hit = hits.find((h) => h.object.userData.candidateId);
          if (hit) current.current.onSelect(hit.object.userData.candidateId);
          else if (runtime.factory) {
            const objects = ray.intersectObject(runtime.factory, true);
            const first = objects.find((h) => {
              let o: THREE.Object3D | null = h.object;
              while (o) {
                if (!o.visible) return false;
                o = o.parent;
              }
              return !["floor", "hall", "traffic", "drain"].includes(
                String(
                  h.object.userData.equipment_id ??
                    h.object.name.split("__")[0],
                ),
              );
            });
            if (first) {
              current.current.onSelect(
                "equipment:" +
                  (first.object.userData.equipment_id ?? first.object.name),
              );
              if (runtime.selected) {
                scene.remove(runtime.selected);
                runtime.selected.dispose();
              }
              runtime.selected = new THREE.BoxHelper(first.object, 0x087aff);
              scene.add(runtime.selected);
            }
          }
        }
      };
      el.addEventListener("pointerdown", pointerdown, true);
      el.addEventListener("pointermove", pointermove);
      el.addEventListener("pointercancel", pointercancel);
      el.addEventListener("pointerup", pointerup);
      const resize = () => {
        const w = el.clientWidth,
          h = el.clientHeight;
        if (!w || !h) return;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        // Frame the scene in the unobstructed area between overlay panels.
        const xOffset = current.current.studioOpen
          ? w > 1100
            ? 204
            : w > 760
              ? 184
              : 0
          : w > 1350
            ? 150
            : w > 1000
              ? 138
              : w > 760
                ? 21
                : 0;
        const yOffset =
          w <= 760
            ? current.current.studioOpen
              ? h * 0.3
              : Math.min(120, h * 0.15)
            : 0;
        camera.setViewOffset(w, h, xOffset, yOffset, w, h);
        camera.updateProjectionMatrix();
        const halfSpan = Math.max(
          definition.scenario.factory.depth / 2 + 2,
          ((definition.scenario.factory.width / 2 + 2) * h) / w,
        );
        ortho.left = (-halfSpan * w) / h;
        ortho.right = (halfSpan * w) / h;
        ortho.top = halfSpan;
        ortho.bottom = -halfSpan;
        ortho.updateProjectionMatrix();
      };
      const ro = new ResizeObserver(resize);
      runtime.reframe = resize;
      ro.observe(el);
      resize();
      let previousFrameTime = performance.now();
      let motionTime = 0;
      let lastTelemetry = 0;
      const motionQuaternion = new THREE.Quaternion();
      const animate = () => {
        frame = requestAnimationFrame(animate);
        const now = performance.now();
        const dt = Math.min((now - previousFrameTime) / 1000, 0.1);
        previousFrameTime = now;
        if (
          current.current.playing &&
          !document.hidden &&
          !el.closest(".scene-hidden")
        ) {
          motionTime += dt;
        }
        const t = motionTime;
        controls.enabled = !current.current.tourActive && !draggingGhost;
        if (runtime.cameraFlight && !document.hidden && !current.current.tourPaused) {
          const flight = runtime.cameraFlight;
          flight.elapsed += dt;
          const progress = flight.duration ? Math.min(1, flight.elapsed / flight.duration) : 1;
          const ease = progress * progress * progress * (10 + progress * (-15 + 6 * progress));
          camera.position.lerpVectors(flight.from, flight.to, ease);
          controls.target.lerpVectors(flight.lookFrom, flight.lookTo, ease);
          if (progress === 1) { runtime.cameraFlight = null; flight.onArrive(); }
        } else if (!current.current.tourActive && runtime.targetPosition) {
          camera.position.lerp(runtime.targetPosition, 0.065);
          if (runtime.targetLook)
            controls.target.lerp(runtime.targetLook, 0.065);
          if (camera.position.distanceTo(runtime.targetPosition) < 0.02) {
            runtime.targetPosition = null;
            runtime.targetLook = null;
          }
        }
        const p = current.current;
        if (!document.hidden && !el.closest(".scene-hidden"))
          runtime.assets.animate(dt);
        if (
          runtime.robot &&
          p.model &&
          p.scenario.robotProgram &&
          p.motionPlan
        ) {
          if (p.playing && !runtime.wasPlaying) {
            const from = runtime.playbackPose ?? p.scenario.robotProgram.joints;
            const to = sampleMotion(p.motionPlan, runtime.motionTime);
            if (from.some((v, i) => Math.abs(v - to[i]) > 0.01)) {
              const duration =
                Math.max(
                  1.2,
                  ...from.map(
                    (v, i) =>
                      (1.875 * Math.abs(to[i] - v)) /
                      p.model!.joints[i].maxSpeedDeg,
                  ),
                ) / p.scenario.robotProgram.speed;
              runtime.transition = {
                from: [...from],
                to,
                elapsed: 0,
                duration,
              };
            }
          }
          if (p.playing && !document.hidden && !el.closest(".scene-hidden")) {
            if (runtime.transition) {
              const tr = runtime.transition;
              tr.elapsed = Math.min(tr.duration, tr.elapsed + dt);
              const t = tr.elapsed / tr.duration,
                ease = t * t * t * (10 + t * (-15 + 6 * t));
              runtime.playbackPose = tr.from.map(
                (v, i) => v + (tr.to[i] - v) * ease,
              );
              if (tr.elapsed >= tr.duration) runtime.transition = null;
            } else {
              runtime.motionTime += dt;
              runtime.playbackPose = sampleMotion(
                p.motionPlan,
                runtime.motionTime,
              );
            }
          }
          runtime.wasPlaying = p.playing;
          const pose = runtime.playbackPose ?? p.scenario.robotProgram.joints;
          runtime.animNodes.forEach((node) => {
            const index = node.userData.joint_index - 1;
            node.quaternion
              .copy(node.userData.restQuaternion)
              .multiply(
                motionQuaternion.setFromAxisAngle(
                  node.userData.motionAxis,
                  ((pose[index] - p.model!.joints[index].homeDeg) * Math.PI) /
                    180,
                ),
              );
          });
          if (now - lastTelemetry > 100) {
            const active = p.scenario.candidates.find(
              (c) => c.id === p.candidateId,
            )!;
            const local = forwardKinematics(
              p.model,
              pose,
            ).tcp.toArray() as Vec3;
            const tcp = robotToFactory(
              local,
              active.position,
              active.yawDeg ?? 0,
              active.mountHeight ?? 0,
            );
            runtime.tcpMarker.position.set(tcp[0], tcp[2] + 0.035, -tcp[1]);
            runtime.tcpMarker.visible =
              p.scenario.robotProgram.showTrail &&
              p.scenario.showReferenceRobot !== false;
            p.onTelemetry?.({
              modelId: p.model.id,
              joints: [...pose],
              tcp,
              elapsed: runtime.motionTime % p.motionPlan.duration,
              duration: p.motionPlan.duration,
              progress:
                (runtime.motionTime % p.motionPlan.duration) /
                p.motionPlan.duration,
              belowFloor: tcp[2] < 0,
            });
            lastTelemetry = now;
          }
        } else if (runtime.robot && p.playing) {
          runtime.animNodes.forEach((node) => {
            const i = node.userData.joint_index;
            if (node.userData.joint_motion === "linear") {
              node.position
                .copy(node.userData.restPosition)
                .addScaledVector(
                  node.userData.motionAxis,
                  Math.sin(t * 0.9) * (node.userData.motion_amplitude ?? 0.06),
                );
              return;
            }
            const angle =
              typeof node.userData.motion_amplitude === "number"
                ? Math.sin(t * 0.75 + i) * node.userData.motion_amplitude
                : i === 1
                  ? Math.sin(t * 0.65) * 0.42
                  : Math.sin(t * 0.9 + i) *
                    (i === 2 ? 0.13 : i === 3 ? 0.18 : 0.065);
            node.quaternion
              .copy(node.userData.restQuaternion)
              .multiply(
                motionQuaternion.setFromAxisAngle(
                  node.userData.motionAxis,
                  angle,
                ),
              );
          });
        }
        controls.update();
        if (!document.hidden && !el.closest(".scene-hidden"))
          renderer.render(scene, runtime.view === "2d" ? ortho : camera);
      };
      animate();
      return () => {
        cancelled = true;
        cancelAnimationFrame(frame);
        ro.disconnect();
        el.removeEventListener("pointerdown", pointerdown, true);
        el.removeEventListener("pointermove", pointermove);
        el.removeEventListener("pointercancel", pointercancel);
        runtime.assets.dispose();
        el.removeEventListener("pointerup", pointerup);
        controls.dispose();
        dispose(scene);
        scene.environment?.dispose();
        renderer.dispose();
        renderer.domElement.remove();
        rt.current = null;
      };
    }, []);
    useEffect(() => {
      const r = rt.current;
      if (!r) return;
      r.assets.sync({
        items: props.scenario.placedAssets ?? [],
        draft: props.placementDraft ?? null,
        selected: props.selectedAsset ?? null,
        playing: props.assetPlaying ?? false,
        onStatus: (status) => current.current.onAssetStatus?.(status),
        onError: (id) => current.current.onAssetError?.(id),
      });
      if (r.robot)
        r.robot.visible = props.scenario.showReferenceRobot !== false;
      r.overlay.visible = props.scenario.showReferenceRobot !== false;
      r.motionOverlay.visible = props.scenario.showReferenceRobot !== false;
    }, [
      props.scenario.placedAssets,
      props.scenario.showReferenceRobot,
      props.placementDraft,
      props.selectedAsset,
      props.assetPlaying,
      state,
    ]);
    useEffect(() => {
      rt.current?.reframe();
    }, [props.studioOpen]);
    useEffect(() => {
      const r = rt.current;
      if (!r) return;
      if (previousCandidate.current !== props.candidateId) {
        previousCandidate.current = props.candidateId;
        focus("cell");
      }
      const active = props.scenario.candidates.find(
        (c) => c.id === props.candidateId,
      );
      if (!active) return;
      if (r.robot) {
        r.robot.position.copy(
          world(active.position, (active.mountHeight ?? 0) + 0.035),
        );
        r.robot.rotation.y = ((active.yawDeg ?? 0) * Math.PI) / 180;
      }
      dispose(r.overlay);
      r.overlay.clear();
      const { scenario, layers } = props;
      const color = 0x087aff;
      if ((active.mountHeight ?? 0) > 0) {
        const h = active.mountHeight!,
          radius = scenario.robot.footprintDiameter / 2;
        const pedestal = new THREE.Mesh(
          new THREE.CylinderGeometry(radius, radius, h, 48),
          new THREE.MeshStandardMaterial({
            color: 0x555555,
            metalness: 0.8,
            roughness: 0.3,
          }),
        );
        pedestal.position.copy(world(active.position, h / 2 + 0.03));
        pedestal.castShadow = true;
        pedestal.receiveShadow = true;
        r.overlay.add(pedestal);
        for (const y of [0.03, h + 0.015]) {
          const plate = new THREE.Mesh(
            new THREE.CylinderGeometry(radius, radius, 0.025, 48),
            new THREE.MeshStandardMaterial({
              color: 0x929292,
              metalness: 0.85,
              roughness: 0.25,
            }),
          );
          plate.position.copy(world(active.position, y));
          r.overlay.add(plate);
        }
      }
      if (layers.reach)
        r.overlay.add(ring(active.position, scenario.robot.reach, color, true));
      if (layers.safety)
        r.overlay.add(
          ring(
            active.position,
            scenario.robot.reach + scenario.robot.safetyBuffer,
            0xa4a4a4,
          ),
        );
      for (const c of scenario.candidates) {
        const selected = c.id === props.candidateId;
        const circle = new THREE.Mesh(
          new THREE.CylinderGeometry(0.19, 0.19, 0.04, 32),
          new THREE.MeshBasicMaterial({
            color: selected ? 0x087aff : 0xaaaaaa,
          }),
        );
        circle.position.copy(world(c.position, 0.12));
        circle.userData.candidateId = c.id;
        r.overlay.add(circle);
        const l = label(c.id, selected ? "#e6e6e6" : "#c0c0c0", 0.35);
        l.position.copy(world(c.position, 0.55));
        l.userData.candidateId = c.id;
        r.overlay.add(l);
      }
      if (layers.reach)
        for (const target of scenario.targets) {
          const l = line(
            [world(active.position, 0.18), world(target.position, 0.18)],
            0xb0b0b0,
            true,
          );
          r.overlay.add(l);
          const m = new THREE.Mesh(
            new THREE.SphereGeometry(0.095, 12, 8),
            new THREE.MeshBasicMaterial({ color: 0xcbcbcb }),
          );
          m.position.copy(world(target.position, 1));
          r.overlay.add(m);
          if (layers.labels) {
            const text = label(
              `${target.id.toUpperCase()} · ${target.name}`,
              "#dadada",
              0.75,
            );
            text.position.copy(world(target.position, 1.55));
            r.overlay.add(text);
          }
        }
      if (layers.paths)
        for (const p of scenario.pathways) {
          r.overlay.add(
            line(
              p.points.map((v) => world(v, 0.16)),
              p.kind === "worker" ? 0xa5a5a5 : 0xb0b0b0,
              true,
            ),
          );
          if (layers.labels) {
            const l = label(
              p.kind === "worker" ? "작업자 이동 동선" : "대차 이동 동선",
              p.kind === "worker" ? "#cecece" : "#dbdbdb",
              0.9,
            );
            l.position.copy(world(p.points[0], 0.8));
            r.overlay.add(l);
          }
        }
      if (r.selected) {
        r.scene.remove(r.selected);
        r.selected.dispose();
        r.selected = null;
      }
      if (r.factory) {
        r.factory.traverse((o) => {
          if (o instanceof THREE.Mesh) {
            const structure = [
              "hall",
              "floor",
              "envelope",
              "structure",
              "windows",
              "hvac",
              "utilities",
              "lighting",
              "traffic",
              "drain",
            ].includes(
              String(o.userData.equipment_id ?? o.name.split("__")[0]),
            );
            o.visible = structure ? layers.factory : layers.equipment;
          }
        });
      }
      if (r.view !== props.view) {
        r.view = props.view;
        if (props.view === "2d") {
          r.controls.object = r.ortho;
          r.controls.enableRotate = false;
          r.controls.target.set(0, 0, 0);
          r.ortho.position.set(0, 40, 0.001);
          r.ortho.lookAt(0, 0, 0);
        } else {
          r.controls.object = r.camera;
          r.controls.enableRotate = true;
          r.controls.target.set(0, 0, 0);
          focus("overview");
        }
        r.controls.update();
      }
    }, [
      props.scenario,
      props.candidateId,
      props.layers,
      props.view,
      state,
      props.playing,
    ]);
    useEffect(() => {
      const r = rt.current;
      if (!r) return;
      r.playbackPose = null;
      r.motionTime = 0;
      r.transition = null;
      r.wasPlaying = false;
    }, [props.scenario.robotProgram?.joints, props.motionPlan]);
    useEffect(() => {
      const r = rt.current,
        model = props.model,
        plan = props.motionPlan,
        program = props.scenario.robotProgram;
      if (!r) return;
      dispose(r.motionOverlay);
      r.motionOverlay.clear();
      if (!model || !plan || !program) return;
      const active = props.scenario.candidates.find(
        (c) => c.id === props.candidateId,
      )!;
      r.motionOverlay.position.copy(
        world(active.position, (active.mountHeight ?? 0) + 0.035),
      );
      r.motionOverlay.rotation.y = ((active.yawDeg ?? 0) * Math.PI) / 180;
      if (program.showTrail) {
        const points = motionTrail(model, plan).map(
          (p) => new THREE.Vector3(p[0], p[2], -p[1]),
        );
        const trail = line(points, 0x2685ff);
        r.motionOverlay.add(trail);
        plan.poses.forEach((pose, i) => {
          const p = forwardKinematics(model, pose).tcp;
          const dot = new THREE.Mesh(
            new THREE.SphereGeometry(0.03, 12, 8),
            new THREE.MeshBasicMaterial({ color: 0x7eb5ff }),
          );
          dot.position.set(p.x, p.z, -p.y);
          r.motionOverlay.add(dot);
          const tag = label(String(i + 1), "#85b9ff");
          tag.scale.multiplyScalar(0.65);
          tag.position.copy(dot.position).add(new THREE.Vector3(0, 0.1, 0));
          r.motionOverlay.add(tag);
        });
      }
      if (program.showWorkspace) {
        const points = sampleWorkspace(model).map(
          (p) => new THREE.Vector3(p[0], p[2], -p[1]),
        );
        r.motionOverlay.add(
          new THREE.Points(
            new THREE.BufferGeometry().setFromPoints(points),
            new THREE.PointsMaterial({
              color: 0x559dff,
              size: 0.025,
              transparent: true,
              opacity: 0.38,
              depthWrite: false,
            }),
          ),
        );
      }
    }, [
      props.model,
      props.motionPlan,
      props.candidateId,
      props.scenario.candidates,
      props.scenario.robotProgram?.showTrail,
      props.scenario.robotProgram?.showWorkspace,
      state,
    ]);
    return (
      <div
        ref={host}
        className={"factory-canvas " + (props.placing ? "placing" : "")}
      >
        {state === "loading" && (
          <div className="model-loading glass">
            <span className="loader-orbit" />
            <b>공간을 불러오는 중</b>
            <p>{props.definition.title} · 상세 3D 모델</p>
            <div>
              <i style={{ width: progress + "%" }} />
            </div>
          </div>
        )}
        {state === "error" && (
          <div className="model-loading glass">
            <b>3D 모델을 열 수 없습니다</b>
            <p>{error}</p>
            <button className="button" onClick={() => window.location.reload()}>
              다시 불러오기
            </button>
          </div>
        )}
      </div>
    );
  },
);
