import test, { type TestContext } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as THREE from "three";
import { GLTFLoader, type GLTF } from "three/addons/loaders/GLTFLoader.js";
import { PlacedAssetLayer } from "../components/placed-asset-layer";
import { assetCatalog, type PlacedAsset } from "../lib/placement";
import { findRobot } from "../lib/robot-catalog";
import { homePose } from "../lib/robot-motion";

const item = (overrides: Partial<PlacedAsset> = {}): PlacedAsset => ({
  id: "item-1",
  assetId: "roller-conveyor",
  name: "배치 설비",
  position: { x: 1, y: 2 },
  yawDeg: 30,
  mountHeight: 0,
  ...overrides,
});
const flush = () => new Promise<void>((resolve) => setImmediate(resolve));
const meshes = (root: THREE.Object3D) => {
  const result: THREE.Mesh[] = [];
  root.traverse((node) => {
    if (node instanceof THREE.Mesh && node.userData.placedId) result.push(node);
  });
  return result;
};
const firstMaterial = (mesh: THREE.Mesh) =>
  (Array.isArray(mesh.material)
    ? mesh.material[0]
    : mesh.material) as THREE.MeshStandardMaterial;
const fixture = () => {
  const scene = new THREE.Group(),
    geometry = new THREE.BoxGeometry(),
    texture = new THREE.Texture();
  const material = new THREE.MeshStandardMaterial({
    color: 0xeeeeee,
    map: texture,
  });
  scene.add(
    new THREE.Mesh(geometry, material),
    new THREE.Mesh(geometry, material),
  );
  const counts = { geometry: 0, material: 0, texture: 0 };
  geometry.addEventListener("dispose", () => counts.geometry++);
  material.addEventListener("dispose", () => counts.material++);
  texture.addEventListener("dispose", () => counts.texture++);
  return { scene, geometry, material, texture, counts };
};
function transport(t: TestContext) {
  const requests: {
    url: string;
    resolve: (value: GLTF) => void;
    reject: (reason?: unknown) => void;
  }[] = [];
  const mock = t.mock.method(
    GLTFLoader.prototype,
    "loadAsync",
    (url: string) =>
      new Promise<GLTF>((resolve, reject) => {
        requests.push({ url, resolve, reject });
      }),
  );
  const scene = new THREE.Scene(),
    layer = new PlacedAssetLayer(scene);
  t.after(async () => {
    layer.dispose();
    await flush();
    mock.mock.restore();
  });
  const statuses: string[] = [];
  const errors: string[] = [];
  const sync = (
    items: PlacedAsset[],
    draft: PlacedAsset | null = null,
    selected: string | null = null,
    playing = false,
  ) =>
    layer.sync({
      items,
      draft,
      selected,
      playing,
      onStatus: (status) => statuses.push(status),
      onError: (id) => errors.push(id),
    });
  const resolve = (index: number, root: THREE.Group) =>
    requests[index].resolve({ scene: root } as GLTF);
  return { layer, scene, requests, statuses, errors, sync, resolve };
}

test("a cancelled pending preview never reappears, including after another asset is selected", async (t) => {
  const h = transport(t),
    first = fixture(),
    second = fixture();
  h.sync([], item());
  h.sync([]);
  h.sync([], item({ id: "second", assetId: "amr-cart" }));
  h.resolve(0, first.scene);
  await flush();
  assert.equal(h.layer.group.children.length, 0);
  h.resolve(1, second.scene);
  await flush();
  assert.equal(h.layer.group.children.length, 1);
  assert.equal(meshes(h.layer.group)[0].userData.placedId, "second");
  assert.equal(h.statuses.at(-1), "ready");
});

test("replacing a pending asset under the same ID wins even if its older load resolves last", async (t) => {
  const h = transport(t),
    first = fixture(),
    replacement = fixture();
  h.sync([], item());
  h.sync([], item({ assetId: "amr-cart" }));
  assert.equal(h.requests.length, 2);
  h.resolve(1, replacement.scene);
  await flush();
  h.resolve(0, first.scene);
  await flush();
  assert.equal(h.layer.group.children.length, 1);
  assert.equal(meshes(h.layer.group)[0].geometry, replacement.geometry);
});

test("confirm replaces ghost materials with solid materials while retaining template geometry until teardown", async (t) => {
  const h = transport(t),
    source = fixture();
  h.sync([], item());
  h.resolve(0, source.scene);
  await flush();
  const ghostMaterial = firstMaterial(meshes(h.layer.group)[0]);
  assert.equal(ghostMaterial.opacity, 0.32);
  assert.equal(ghostMaterial.depthWrite, false);
  assert.notEqual(ghostMaterial, source.material);
  let ghostDisposed = 0;
  ghostMaterial.addEventListener("dispose", () => ghostDisposed++);
  h.sync([item()]);
  await flush();
  const solid = meshes(h.layer.group)[0],
    material = firstMaterial(solid);
  assert.equal(h.layer.group.children.length, 1);
  assert.equal(h.requests.length, 1);
  assert.equal(ghostDisposed, 1);
  assert.equal(material.opacity, 1);
  assert.equal(material.depthWrite, true);
  assert.equal(solid.geometry, source.geometry);
  assert.deepEqual(source.counts, { geometry: 0, material: 0, texture: 0 });
  h.layer.dispose();
  await flush();
  assert.deepEqual(source.counts, { geometry: 1, material: 1, texture: 1 });
});

test("pending-load teardown disposes each shared resource exactly once and is idempotent", async (t) => {
  const h = transport(t),
    source = fixture();
  h.sync([], item());
  h.layer.dispose();
  h.layer.dispose();
  h.resolve(0, source.scene);
  await flush();
  assert.deepEqual(source.counts, { geometry: 1, material: 1, texture: 1 });
  assert.equal(h.layer.group.children.length, 0);
  assert.equal(h.scene.children.length, 0);
  h.sync([], item({ id: "later" }));
  assert.equal(h.requests.length, 1);
});

test("a failed transport can be retried after cancelling without poisoning the template cache", async (t) => {
  const h = transport(t),
    source = fixture();
  h.sync([], item());
  h.requests[0].reject(new Error("temporary network failure"));
  await flush();
  assert.equal(h.statuses.at(-1), "error");
  h.sync([]);
  h.sync([], item());
  assert.equal(h.requests.length, 2);
  h.resolve(1, source.scene);
  await flush();
  assert.equal(h.statuses.at(-1), "ready");
  assert.equal(h.layer.group.children.length, 1);
});

test("sixty independent instances share at most one loaded template per catalog asset", async (t) => {
  const h = transport(t),
    sources = assetCatalog.map(() => fixture());
  const items = Array.from({ length: 60 }, (_, i) =>
    item({
      id: `instance-${i}`,
      assetId: assetCatalog[i % assetCatalog.length].id,
      position: { x: i, y: -i },
      yawDeg: i,
    }),
  );
  h.sync(items, null, items[0].id);
  assert.equal(h.requests.length, 8);
  sources.forEach((source, i) => h.resolve(i, source.scene));
  await flush();
  assert.equal(h.layer.group.children.length, 60);
  h.layer.group.children.forEach((root) => {
    const expected = items.find(
      (candidate) => candidate.id === meshes(root)[0].userData.placedId,
    )!;
    assert.equal(root.position.x, expected.position.x);
    assert.equal(root.position.z, -expected.position.y);
  });
  h.sync([], item({ id: "instance-0" }));
  await flush();
  assert.equal(h.layer.group.children.length, 1);
  sources.forEach((source) => assert.equal(source.counts.geometry, 0));
  h.layer.dispose();
  await flush();
  sources.forEach((source) =>
    assert.deepEqual(source.counts, { geometry: 1, material: 1, texture: 1 }),
  );
});

test("ghost and solid keys cannot collide with imported instance IDs containing ghost suffixes", async (t) => {
  const h = transport(t),
    source = fixture();
  h.sync([item({ id: "item-1:ghost" })], item());
  h.resolve(0, source.scene);
  await flush();
  assert.equal(h.layer.group.children.length, 2);
  assert.deepEqual(
    new Set(meshes(h.layer.group).map((mesh) => mesh.userData.placedId)),
    new Set(["item-1", "item-1:ghost"]),
  );
});

test("actual robot GLB instances animate independently without mutating template or other instance poses", async (t) => {
  const bytes = await readFile(
    new URL("../public/models/robots/ur10e/robot.glb", import.meta.url),
  );
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  );
  const gltf = await new GLTFLoader().parseAsync(buffer, "");
  const h = transport(t),
    robot = findRobot("ur10e")!,
    joints = homePose(robot);
  const a = item({ id: "robot-a", assetId: robot.id, joints });
  const b = item({
    id: "robot-b",
    assetId: robot.id,
    joints,
    position: { x: 4, y: -3 },
  });
  h.sync([a, b], null, a.id, true);
  h.resolve(0, gltf.scene);
  await flush();
  const jointNodes = (root: THREE.Object3D) => {
    const nodes: THREE.Object3D[] = [];
    root.traverse((node) => {
      if (!(node instanceof THREE.Mesh) && node.userData.joint_index)
        nodes.push(node);
    });
    return nodes;
  };
  const [rootA, rootB] = h.layer.group.children;
  const nodesA = jointNodes(rootA),
    nodesB = jointNodes(rootB),
    original = jointNodes(gltf.scene);
  assert.equal(nodesA.length, 6);
  assert.equal(nodesB.length, 6);
  const beforeA = nodesA.map((node) => node.quaternion.clone());
  const beforeB = nodesB.map((node) => node.quaternion.clone());
  const beforeOriginal = original.map((node) => node.quaternion.clone());
  for (let frame = 0; frame < 120; frame++) h.layer.animate(1 / 60);
  assert.ok(
    nodesA.some((node, i) => node.quaternion.angleTo(beforeA[i]) > 1e-4),
  );
  nodesB.forEach((node, i) =>
    assert.ok(node.quaternion.angleTo(beforeB[i]) < 1e-7),
  );
  original.forEach((node, i) =>
    assert.ok(node.quaternion.angleTo(beforeOriginal[i]) < 1e-7),
  );
});

test("raised robot has a selectable pedestal contacting floor and base while footprint stays at ground level", async (t) => {
  const h = transport(t),
    source = fixture();
  let robot = item({
    assetId: "ur10e",
    mountHeight: 1.2,
    position: { x: 0, y: 0 },
    yawDeg: 0,
  });
  h.sync([], robot);
  h.resolve(0, source.scene);
  await flush();
  const root = h.layer.group.children[0];
  const pedestal = root.getObjectByName("Mounting pedestal") as THREE.Mesh;
  const outline = root.getObjectByName("Placement footprint")!;
  assert.ok(pedestal?.visible);
  assert.equal(pedestal.userData.placedId, robot.id);
  assert.equal(pedestal.userData.placementGhost, true);
  assert.equal(firstMaterial(pedestal).opacity, 0.32);
  const contact = (height: number) => {
    h.layer.group.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(pedestal);
    const footprint = new THREE.Box3().setFromObject(outline);
    assert.ok(Math.abs(bounds.min.y) < 1e-7);
    assert.ok(Math.abs(bounds.max.y - (height + 0.005)) < 1e-7);
    assert.ok(Math.abs(bounds.max.x - bounds.min.x - 0.19) < 1e-7);
    assert.ok(Math.abs(footprint.min.y - 0.04) < 1e-7);
    assert.ok(Math.abs(footprint.max.y - 0.04) < 1e-7);
  };
  contact(1.2);
  const hit = h.layer.hit(
    new THREE.Raycaster(
      new THREE.Vector3(2, 0.3, 0),
      new THREE.Vector3(-1, 0, 0),
    ),
  );
  assert.equal(hit?.object, pedestal);
  robot = { ...robot, mountHeight: 0.4 };
  h.sync([], robot);
  contact(0.4);
  assert.equal(root.getObjectByName("Mounting pedestal"), pedestal);
  let geometryDisposed = 0,
    materialDisposed = 0;
  pedestal.geometry.addEventListener("dispose", () => geometryDisposed++);
  firstMaterial(pedestal).addEventListener("dispose", () => materialDisposed++);
  h.sync([], { ...robot, mountHeight: 0 });
  assert.equal(pedestal.visible, false);
  h.sync([robot]);
  await flush();
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
  const solidPedestal = h.layer.group.children[0].getObjectByName(
    "Mounting pedestal",
  ) as THREE.Mesh;
  assert.equal(solidPedestal.visible, true);
  assert.equal(solidPedestal.userData.placementGhost, false);
  assert.equal(firstMaterial(solidPedestal).opacity, 1);
  assert.equal(firstMaterial(solidPedestal).transparent, false);
  h.layer.dispose();
  await flush();
  assert.equal(geometryDisposed, 1);
  assert.equal(materialDisposed, 1);
});

test("confirmed load failure reports the instance once while cancelled requests and ghosts do not raise duplicate toasts", async (t) => {
  const h = transport(t);
  const confirmed = item();
  h.sync([confirmed]);
  h.requests[0].reject(new Error("unavailable"));
  await flush();
  assert.deepEqual(h.errors, [confirmed.id]);
  h.sync([confirmed]);
  h.sync([confirmed]);
  assert.deepEqual(h.errors, [confirmed.id]);
  h.sync([], item({ id: "ghost", assetId: "amr-cart" }));
  h.requests[1].reject(new Error("unavailable"));
  await flush();
  assert.equal(h.statuses.at(-1), "error");
  assert.deepEqual(h.errors, [confirmed.id]);
  h.sync([item({ id: "cancelled", assetId: "cnc-mill" })]);
  h.sync([]);
  h.requests[2].reject(new Error("unavailable"));
  await flush();
  assert.deepEqual(h.errors, [confirmed.id]);
});
