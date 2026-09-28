import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  Box3,
  Camera,
  Color,
  Light,
  Mesh,
  MeshStandardMaterial,
  Vector3,
} from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { assetCatalog } from "../lib/placement";

const equipment = assetCatalog.filter((asset) => !asset.robotModelId);
const directory = (id: string) =>
  fileURLToPath(new URL(`../public/models/equipment/${id}/`, import.meta.url));
const EPS = 1e-5;

type GlbDocument = {
  buffers?: { uri?: string }[];
  images?: unknown[];
  cameras?: unknown[];
  extensionsUsed?: string[];
  meshes: {
    primitives: {
      attributes: { POSITION: number };
      indices?: number;
      mode?: number;
    }[];
  }[];
  accessors: { count: number }[];
};

function checkPalette(color: Color, description: string) {
  assert.ok([color.r, color.g, color.b].every(Number.isFinite), description);
  assert.ok(
    !(color.g > 0.04 && color.g > color.r * 1.15 && color.g > color.b * 1.15),
    `${description} must stay neutral or blue, not green`,
  );
}

test("equipment library ships five distinct non-arm equipment types", () => {
  assert.deepEqual(equipment.map((asset) => asset.id).sort(), [
    "amr-cart",
    "cnc-mill",
    "pallet-rack",
    "roller-conveyor",
    "vision-station",
  ]);
  assert.equal(new Set(equipment.map((asset) => asset.modelUrl)).size, 5);
  assert.equal(new Set(equipment.map((asset) => asset.thumbnailUrl)).size, 5);
});

for (const asset of equipment) {
  test(`${asset.id}: shipped GLB fits its planning footprint, has no studio geometry, and meets the instance budget`, async (t) => {
    const path = directory(asset.id);
    const bytes = await readFile(`${path}/asset.glb`);
    assert.equal(bytes.readUInt32LE(0), 0x46546c67, "GLB magic");
    assert.equal(bytes.readUInt32LE(4), 2, "glTF 2.0");
    assert.equal(
      bytes.readUInt32LE(8),
      bytes.byteLength,
      "complete binary payload",
    );
    assert.equal(bytes.readUInt32LE(16), 0x4e4f534a, "first chunk is JSON");
    const document = JSON.parse(
      bytes.subarray(20, 20 + bytes.readUInt32LE(12)).toString(),
    ) as GlbDocument;
    assert.equal(
      document.images?.length ?? 0,
      0,
      "procedural materials need no network textures",
    );
    assert.ok(
      document.buffers?.every((buffer) => !buffer.uri),
      "self-contained geometry",
    );
    assert.equal(
      document.cameras?.length ?? 0,
      0,
      "thumbnail camera is excluded",
    );
    assert.ok(
      !document.extensionsUsed?.includes("KHR_lights_punctual"),
      "thumbnail lights are excluded",
    );
    const drawCalls = document.meshes.reduce(
      (n, mesh) => n + mesh.primitives.length,
      0,
    );
    const triangles = document.meshes.reduce(
      (total, mesh) =>
        total +
        mesh.primitives.reduce((sum, primitive) => {
          assert.ok(
            primitive.mode === undefined || primitive.mode === 4,
            "triangle primitive",
          );
          return (
            sum +
            document.accessors[
              primitive.indices ?? primitive.attributes.POSITION
            ].count /
              3
          );
        }, 0),
      0,
    );
    assert.ok(
      drawCalls > 1 && drawCalls <= 12,
      `${drawCalls} material batches`,
    );
    assert.ok(
      triangles >= 10000 && triangles <= 35000,
      `${triangles} detailed, bounded triangles`,
    );
    assert.ok(
      bytes.byteLength <= 2_000_000,
      "model remains below 2 MB per reusable asset",
    );
    const manifest = JSON.parse(
      await readFile(`${path}/manifest.json`, "utf8"),
    );
    assert.equal(manifest.id, asset.id);
    assert.equal(manifest.units, "meters");
    assert.deepEqual(manifest.dimensions, {
      width: asset.width,
      depth: asset.depth,
      height: asset.height,
    });
    assert.equal(
      manifest.geometry.meshes ?? manifest.geometry.meshCount,
      document.meshes.length,
    );
    assert.equal(
      manifest.geometry.triangles ?? manifest.geometry.triangleCount,
      triangles,
    );
    for (const name of ["scene.blend", "thumbnail.png"])
      assert.ok(
        (await stat(`${path}/${name}`)).size > 100,
        `${name} is shipped`,
      );
    const thumbnail = await readFile(`${path}/thumbnail.png`);
    assert.equal(thumbnail.readUInt32BE(16), 1200, "thumbnail width");
    assert.equal(thumbnail.readUInt32BE(20), 1000, "thumbnail height");

    // Load the actual exported artifact independently of Blender metadata. Bounds
    // must match the coordinates used by floor placement and collision guidance.
    const gltf = await new GLTFLoader().parseAsync(
      bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
      "",
    );
    gltf.scene.updateMatrixWorld(true);
    let meshes = 0;
    let translucentMaterials = 0;
    gltf.scene.traverse((node) => {
      assert.ok(
        !(node instanceof Camera || node instanceof Light),
        "asset has no studio cameras/lights",
      );
      assert.ok(
        !/studio|_floor(?:[._]|$)/i.test(node.name),
        `${node.name} is asset geometry`,
      );
      if (!(node instanceof Mesh)) return;
      meshes++;
      assert.equal(
        node.userData.asset_id,
        asset.id,
        "no meshes from another scene",
      );
      const positions = node.geometry.getAttribute("position");
      assert.ok(positions.count > 0);
      for (let i = 0; i < positions.count; i++)
        assert.ok(
          [positions.getX(i), positions.getY(i), positions.getZ(i)].every(
            Number.isFinite,
          ),
          "finite vertices",
        );
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material]) {
        assert.ok(
          material instanceof MeshStandardMaterial,
          "PBR metal material",
        );
        checkPalette(material.color, `${node.name} base color`);
        checkPalette(material.emissive, `${node.name} emissive color`);
        if (material.transparent && material.opacity < 1)
          translucentMaterials++;
      }
    });
    assert.equal(meshes, document.meshes.length);
    if (["cnc-mill", "vision-station"].includes(asset.id))
      assert.ok(
        translucentMaterials > 0,
        "safety glazing retains transparency after export",
      );
    const box = new Box3().setFromObject(gltf.scene, true);
    const size = box.getSize(new Vector3());
    assert.ok(
      Math.abs(box.min.y) < EPS,
      `ground plane is Y=0, actual ${box.min.y}`,
    );
    assert.ok(
      box.min.x >= -asset.width / 2 - EPS && box.max.x <= asset.width / 2 + EPS,
      "width fits the centered X footprint",
    );
    assert.ok(
      box.min.z >= -asset.depth / 2 - EPS && box.max.z <= asset.depth / 2 + EPS,
      "depth fits the centered Z footprint",
    );
    assert.ok(
      box.max.y <= asset.height + EPS,
      "height fits the catalog envelope",
    );
    for (const [actual, nominal] of [
      [size.x, asset.width],
      [size.z, asset.depth],
      [size.y, asset.height],
    ])
      assert.ok(
        actual > nominal * 0.9,
        "meter units and Y-up conversion match the catalog",
      );
    // Compare source bounds after Blender Z-up -> glTF Y-up transformation.
    const source = manifest.geometry.bounds;
    const expectedMin = new Vector3(
      source.min[0],
      source.min[2],
      -source.max[1],
    );
    const expectedMax = new Vector3(
      source.max[0],
      source.max[2],
      -source.min[1],
    );
    assert.ok(
      box.min.distanceTo(expectedMin) < EPS &&
        box.max.distanceTo(expectedMax) < EPS,
      "actual GLB bounds agree with source manifest",
    );
    t.diagnostic(
      `${size.x.toFixed(4)} × ${size.z.toFixed(4)} × ${size.y.toFixed(4)} m; ${meshes} meshes; ${triangles} triangles; ${bytes.byteLength} bytes`,
    );
    gltf.scene.traverse((node) => {
      if (!(node instanceof Mesh)) return;
      node.geometry.dispose();
      for (const material of Array.isArray(node.material)
        ? node.material
        : [node.material])
        material.dispose();
    });
  });
}
