import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { findAsset, type PlacedAsset } from "@/lib/placement";
import { findRobot } from "@/lib/robot-catalog";
import {
  buildMotionPlan,
  createProgram,
  homePose,
  sampleMotion,
} from "@/lib/robot-motion";

type Entry = {
  root: THREE.Group;
  materials: Set<THREE.Material>;
  helpers: THREE.Object3D[];
  pedestal: THREE.Mesh | null;
  joints: THREE.Object3D[];
  item: PlacedAsset;
  ghost: boolean;
  time: number;
};
type Snapshot = {
  items: PlacedAsset[];
  draft: PlacedAsset | null;
  selected: string | null;
  playing: boolean;
  onStatus: (status: "loading" | "ready" | "error") => void;
  onError?: (id: string) => void;
};
type Request = { assetId: string };
const entryKey = (id: string, ghost: boolean) =>
  `${ghost ? "ghost" : "solid"}:${id}`;

/** Templates own shared geometry; instances own materials and helper geometry. */
export class PlacedAssetLayer {
  readonly group = new THREE.Group();
  private templates = new Map<string, Promise<THREE.Group>>();
  private entries = new Map<string, Entry>();
  private disposed = false;
  private snapshot: Snapshot | null = null;
  private requested = new Map<string, Request>();
  private failed = new Map<string, string>();
  private disposedGeometries = new WeakSet<THREE.BufferGeometry>();
  private disposedMaterials = new WeakSet<THREE.Material>();
  private disposedTextures = new WeakSet<THREE.Texture>();
  private plans = new Map<string, ReturnType<typeof buildMotionPlan>>();
  constructor(scene: THREE.Scene) {
    this.group.name = "User placed equipment";
    scene.add(this.group);
  }

  sync(snapshot: Snapshot) {
    if (this.disposed) return;
    this.snapshot = snapshot;
    const desired = snapshot.items
      .filter((i) => i.id !== snapshot.draft?.id)
      .map((item) => ({ item, ghost: false }));
    if (snapshot.draft) desired.push({ item: snapshot.draft, ghost: true });
    const desiredAssets = new Map(
      desired.map((v) => [entryKey(v.item.id, v.ghost), v.item.assetId]),
    );
    for (const [key, entry] of this.entries)
      if (desiredAssets.get(key) !== entry.item.assetId) {
        this.release(entry);
        this.entries.delete(key);
      }
    for (const [key, request] of this.requested)
      if (desiredAssets.get(key) !== request.assetId)
        this.requested.delete(key);
    for (const [key, assetId] of this.failed)
      if (desiredAssets.get(key) !== assetId) this.failed.delete(key);
    for (const { item, ghost } of desired) {
      const key = entryKey(item.id, ghost);
      const existing = this.entries.get(key);
      if (existing) {
        existing.item = item;
        this.update(existing);
        continue;
      }
      if (this.failed.has(key)) {
        if (ghost) snapshot.onStatus("error");
        continue;
      }
      if (this.requested.has(key)) continue;
      const request = { assetId: item.assetId };
      this.requested.set(key, request);
      if (ghost) snapshot.onStatus("loading");
      this.load(item.assetId)
        .then((template) => {
          // A removed/replaced request can still resolve; identity guards prevent
          // stale loads from resurrecting a cancelled preview or removing a newer request.
          if (this.requested.get(key) !== request) return;
          if (this.disposed || !this.snapshot) return;
          const current = ghost
            ? this.snapshot.draft
            : this.snapshot.items.find(
                (i) => i.id === item.id && i.id !== this.snapshot!.draft?.id,
              );
          if (
            !current ||
            current.assetId !== item.assetId ||
            (ghost && current.id !== item.id)
          ) {
            this.requested.delete(key);
            return;
          }
          const entry = this.clone(template, current, ghost);
          this.entries.set(key, entry);
          this.group.add(entry.root);
          this.update(entry);
          this.requested.delete(key);
          if (ghost) this.snapshot.onStatus("ready");
        })
        .catch(() => {
          if (this.requested.get(key) !== request) return;
          this.requested.delete(key);
          this.failed.set(key, item.assetId);
          if (
            !this.disposed &&
            ghost &&
            this.snapshot?.draft?.id === item.id &&
            this.snapshot.draft.assetId === item.assetId
          )
            this.snapshot.onStatus("error");
          if (!this.disposed && !ghost) this.snapshot?.onError?.(item.id);
        });
    }
    if (snapshot.draft && this.entries.has(entryKey(snapshot.draft.id, true)))
      snapshot.onStatus("ready");
  }

  private load(assetId: string) {
    if (!this.templates.has(assetId)) {
      const asset = findAsset(assetId);
      if (!asset) return Promise.reject(new Error(`Unknown asset: ${assetId}`));
      const p = new GLTFLoader()
        .loadAsync(asset.modelUrl)
        .then((gltf) => gltf.scene);
      this.templates.set(assetId, p);
      // A transient transport failure must not poison the asset cache forever.
      void p.catch(() => {
        if (this.templates.get(assetId) === p) this.templates.delete(assetId);
      });
    }
    return this.templates.get(assetId)!;
  }

  private clone(
    template: THREE.Group,
    item: PlacedAsset,
    ghost: boolean,
  ): Entry {
    const root = new THREE.Group(),
      model = template.clone(true),
      materials = new Set<THREE.Material>(),
      joints: THREE.Object3D[] = [];
    const materialClones = new Map<THREE.Material, THREE.Material>();
    root.add(model);
    const robot = findRobot(findAsset(item.assetId)?.robotModelId);
    model.traverse((o) => {
      o.userData.placedId = item.id;
      o.userData.placementGhost = ghost;
      if (o instanceof THREE.Mesh) {
        const mapped = (
          Array.isArray(o.material) ? o.material : [o.material]
        ).map((source) => {
          const existing = materialClones.get(source);
          if (existing) return existing;
          const m = source.clone() as THREE.MeshStandardMaterial;
          materials.add(m);
          materialClones.set(source, m);
          if (ghost) {
            if (m.color) m.color.set("#4495ff");
            if (m.emissive) {
              m.emissive.set("#0754c9");
              m.emissiveIntensity = 0.25;
            }
            m.transparent = true;
            m.opacity = 0.32;
            m.depthWrite = false;
          }
          return m;
        });
        o.material = Array.isArray(o.material) ? mapped : mapped[0];
        o.castShadow = !ghost;
        o.receiveShadow = !ghost;
      }
      if (
        robot &&
        Number.isInteger(o.userData.joint_index) &&
        o.userData.joint_index >= 1 &&
        o.userData.joint_index <= robot.joints.length &&
        !(o instanceof THREE.Mesh)
      ) {
        const j = robot.joints[o.userData.joint_index - 1];
        o.userData.restQuaternion = o.quaternion.clone();
        o.userData.motionAxis = new THREE.Vector3(
          j.axis[0],
          j.axis[2],
          -j.axis[1],
        );
        joints.push(o);
      }
    });
    const asset = findAsset(item.assetId)!,
      w = asset.width / 2,
      d = asset.depth / 2;
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-w, 0.035, -d),
      new THREE.Vector3(w, 0.035, -d),
      new THREE.Vector3(w, 0.035, d),
      new THREE.Vector3(-w, 0.035, d),
      new THREE.Vector3(-w, 0.035, -d),
    ]);
    const outline = new THREE.Line(
      geo,
      new THREE.LineBasicMaterial({
        color: 0x3285ff,
        depthTest: false,
        transparent: true,
        opacity: 0.95,
      }),
    );
    outline.name = "Placement footprint";
    outline.userData.groundY = 0;
    outline.renderOrder = 8;
    const arrow = new THREE.ArrowHelper(
      new THREE.Vector3(1, 0, 0),
      new THREE.Vector3(0, 0.04, 0),
      Math.max(0.45, w),
      0x65a6ff,
      0.18,
      0.1,
    );
    // ArrowHelper uses module-level shared geometry; make these helpers own theirs.
    arrow.line.geometry = arrow.line.geometry.clone();
    arrow.cone.geometry = arrow.cone.geometry.clone();
    arrow.userData.groundY = arrow.position.y;
    root.add(outline, arrow);
    let pedestal: THREE.Mesh | null = null;
    if (robot) {
      const material = new THREE.MeshStandardMaterial({
        color: ghost ? 0x4495ff : 0x92969c,
        metalness: 0.82,
        roughness: 0.3,
        transparent: ghost,
        opacity: ghost ? 0.32 : 1,
        depthWrite: !ghost,
        emissive: ghost ? 0x0754c9 : 0x000000,
        emissiveIntensity: ghost ? 0.25 : 0,
      });
      pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(w, w, 1, 32),
        material,
      );
      pedestal.name = "Mounting pedestal";
      pedestal.userData.placedId = item.id;
      pedestal.userData.placementGhost = ghost;
      pedestal.userData.placementPedestal = true;
      pedestal.castShadow = !ghost;
      pedestal.receiveShadow = !ghost;
      materials.add(material);
      root.add(pedestal);
    }
    return {
      root,
      materials,
      helpers: [outline, arrow],
      pedestal,
      joints,
      item,
      ghost,
      time: 0,
    };
  }

  private update(entry: Entry) {
    const { item, root } = entry;
    root.position.set(
      item.position.x,
      item.mountHeight + 0.005,
      -item.position.y,
    );
    root.rotation.y = (item.yawDeg * Math.PI) / 180;
    for (const h of entry.helpers) {
      h.visible = entry.ghost || item.id === this.snapshot?.selected;
      h.position.y = h.userData.groundY - item.mountHeight;
    }
    if (entry.pedestal) {
      const height = item.mountHeight + 0.005;
      entry.pedestal.visible = item.mountHeight > 0;
      entry.pedestal.scale.y = height;
      entry.pedestal.position.y = -height / 2;
    }
    if (
      entry.ghost ||
      !this.snapshot?.playing ||
      item.id !== this.snapshot.selected
    ) {
      entry.time = 0;
      const model = findRobot(findAsset(item.assetId)?.robotModelId);
      if (model) this.pose(entry, item.joints ?? homePose(model));
    }
  }

  private pose(entry: Entry, angles: number[]) {
    const model = findRobot(findAsset(entry.item.assetId)?.robotModelId)!;
    for (const node of entry.joints) {
      const i = node.userData.joint_index - 1;
      node.quaternion
        .copy(node.userData.restQuaternion)
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            node.userData.motionAxis,
            ((angles[i] - model.joints[i].homeDeg) * Math.PI) / 180,
          ),
        );
    }
  }

  animate(dt: number) {
    if (
      this.disposed ||
      !this.snapshot?.playing ||
      !Number.isFinite(dt) ||
      dt <= 0
    )
      return;
    const entry = this.entries.get(
      entryKey(this.snapshot.selected ?? "", false),
    );
    if (!entry || entry.ghost || !entry.joints.length) return;
    const model = findRobot(findAsset(entry.item.assetId)?.robotModelId)!;
    if (!this.plans.has(model.id)) {
      const program = createProgram(model);
      program.speed = 0.35;
      this.plans.set(model.id, buildMotionPlan(model, program));
    }
    const plan = this.plans.get(model.id)!;
    const from = entry.item.joints ?? homePose(model),
      to = sampleMotion(plan, 0);
    // Respect joint speed limits even when starting from a manually edited pose.
    const ramp = Math.max(
      2,
      ...from.map(
        (v, i) =>
          (1.875 * Math.abs(to[i] - v)) / (model.joints[i].maxSpeedDeg * 0.35),
      ),
    );
    entry.time += Math.min(dt, 0.1);
    const t = Math.min(1, entry.time / ramp),
      ease = t * t * t * (10 + t * (-15 + 6 * t));
    this.pose(
      entry,
      entry.time < ramp
        ? from.map((v, i) => v + (to[i] - v) * ease)
        : sampleMotion(plan, entry.time - ramp),
    );
  }

  hit(ray: THREE.Raycaster) {
    return ray.intersectObject(this.group, true).find((h) => {
      if (!h.object.userData.placedId) return false;
      for (let node: THREE.Object3D | null = h.object; node; node = node.parent)
        if (!node.visible) return false;
      return true;
    });
  }
  private release(entry: Entry) {
    this.group.remove(entry.root);
    entry.materials.forEach((m) => m.dispose());
    entry.pedestal?.geometry.dispose();
    entry.helpers.forEach((o) =>
      o.traverse((n) => {
        if (n instanceof THREE.Line || n instanceof THREE.Mesh) {
          n.geometry.dispose();
          (Array.isArray(n.material) ? n.material : [n.material]).forEach((m) =>
            m.dispose(),
          );
        }
      }),
    );
  }
  private disposeTemplate(root: THREE.Group) {
    const geometries = new Set<THREE.BufferGeometry>(),
      materials = new Set<THREE.Material>(),
      textures = new Set<THREE.Texture>();
    root.traverse((o) => {
      if (o instanceof THREE.Mesh) {
        geometries.add(o.geometry);
        (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) =>
          materials.add(m),
        );
      }
    });
    materials.forEach((m) => {
      Object.values(m).forEach((v) => {
        if (v instanceof THREE.Texture) textures.add(v);
      });
      if (!this.disposedMaterials.has(m)) {
        this.disposedMaterials.add(m);
        m.dispose();
      }
    });
    geometries.forEach((g) => {
      if (!this.disposedGeometries.has(g)) {
        this.disposedGeometries.add(g);
        g.dispose();
      }
    });
    textures.forEach((t) => {
      if (!this.disposedTextures.has(t)) {
        this.disposedTextures.add(t);
        t.dispose();
      }
    });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.snapshot = null;
    this.requested.clear();
    this.failed.clear();
    this.plans.clear();
    this.entries.forEach((e) => this.release(e));
    this.entries.clear();
    this.group.removeFromParent();
    this.templates.forEach((p) =>
      p.then((t) => this.disposeTemplate(t)).catch(() => {}),
    );
    this.templates.clear();
  }
}
