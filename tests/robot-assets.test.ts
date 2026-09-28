import test from "node:test";
import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Mesh, Object3D, Quaternion, Vector3 } from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { robotModels } from "../lib/robot-catalog";
import {
  clampPose,
  forwardKinematics,
  homePose,
  robotToFactory,
} from "../lib/robot-motion";
import type { Vec3 } from "../lib/robot-types";

const directory = (id: string) =>
  fileURLToPath(new URL(`../public/models/robots/${id}/`, import.meta.url));
const converted = (p: Vec3) => new Vector3(p[0], p[2], -p[1]);
const closeVector = (
  actual: Vector3,
  expected: Vector3,
  description: string,
) => {
  assert.ok(
    actual.distanceTo(expected) < 2e-6,
    `${description}: ${actual.toArray()} != ${expected.toArray()}`,
  );
};

type GlbDocument = {
  buffers?: { uri?: string }[];
  images?: unknown[];
  meshes: {
    primitives: {
      attributes: { POSITION: number };
      indices?: number;
      mode?: number;
    }[];
  }[];
  accessors: { count: number }[];
};

for (const model of robotModels) {
  test(`${model.id}: shipped GLB contains six connected rigid joints, an accurate TCP, and bounded geometry`, async () => {
    const path = directory(model.id);
    const bytes = await readFile(`${path}/robot.glb`);
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
      "models are procedural, with no texture network dependencies",
    );
    assert.ok(
      document.buffers?.every((buffer) => !buffer.uri),
      "all geometry is packed into this GLB",
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
            "triangle mesh primitive",
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
      drawCalls > 10 && drawCalls < 100,
      `${drawCalls} batched draw calls`,
    );
    assert.ok(
      triangles > 10000 && triangles < 100000,
      `${triangles} detailed/optimized triangles`,
    );
    assert.ok(
      bytes.byteLength < 1_500_000,
      "model stays below 1.5 MB without external textures",
    );
    for (const name of ["scene.blend", "thumbnail.png", "manifest.json"])
      assert.ok((await stat(`${path}/${name}`)).size > 100, `${name} exists`);
    const sourceManifest = JSON.parse(
      await readFile(`${path}/manifest.json`, "utf8"),
    );
    assert.deepEqual(
      model.joints,
      sourceManifest.joints,
      "bundled catalog and exported model have matching rig manifests",
    );
    assert.deepEqual(model.tcp, sourceManifest.tcp);

    // Use the same glTF standard loader as the actual browser, independently of
    // the authored Blender data or production forward-kinematics implementation.
    const buffer = bytes.buffer.slice(
      bytes.byteOffset,
      bytes.byteOffset + bytes.byteLength,
    );
    const gltf = await new GLTFLoader().parseAsync(buffer, "");
    const joints: Object3D[] = [],
      tcps: Object3D[] = [];
    gltf.scene.traverse((node) => {
      if (typeof node.userData.joint_index === "number") joints.push(node);
      if (/^TCP(?:[._]?\d+)?$/.test(node.name)) tcps.push(node);
    });
    joints.sort((a, b) => a.userData.joint_index - b.userData.joint_index);
    assert.equal(joints.length, 6);
    assert.equal(tcps.length, 1, "one unambiguous named TCP");
    const tcp = tcps[0];
    assert.equal(tcp.parent, joints[5], "tool point inherits wrist rotation");
    gltf.scene.updateMatrixWorld(true);
    const identity = new Quaternion();
    joints.forEach((node, index) => {
      assert.equal(node.userData.joint_index, index + 1);
      assert.ok(
        !(node instanceof Mesh),
        "articulation lives on a joint transform",
      );
      assert.ok(
        node.getWorldQuaternion(new Quaternion()).angleTo(identity) < 1e-7,
        "reference world rotation is identity",
      );
      if (index > 0)
        assert.equal(node.parent, joints[index - 1], "serial rigid-link chain");
      closeVector(
        node.getWorldPosition(new Vector3()),
        converted(model.joints[index].pivot),
        `${node.name} reference pivot`,
      );
      const axis = node.userData.joint_axis as Vec3;
      assert.ok(Array.isArray(axis) && axis.length === 3);
      closeVector(
        new Vector3(...axis),
        new Vector3(...model.joints[index].axis),
        `${node.name} metadata axis`,
      );
      assert.equal(
        node.userData.joint_home_deg ?? node.userData.home_deg,
        model.joints[index].homeDeg,
      );
      assert.equal(
        node.userData.joint_min_deg ?? node.userData.min_deg,
        model.joints[index].minDeg,
      );
      assert.equal(
        node.userData.joint_max_deg ?? node.userData.max_deg,
        model.joints[index].maxDeg,
      );
    });
    closeVector(
      tcp.getWorldPosition(new Vector3()),
      converted(model.tcp),
      "exported reference TCP",
    );

    const home = homePose(model),
      rest = joints.map((node) => node.quaternion.clone());
    const poses = [
      home,
      clampPose(
        model,
        home.map((angle, i) => angle + [43, -23, 31, 54, -44, 75][i]),
      ),
      clampPose(
        model,
        home.map((angle, i) => angle + [-71, 31, -28, -61, 27, -81][i]),
      ),
      ...model.joints.map((_, changed) =>
        clampPose(
          model,
          home.map((angle, i) => angle + (i === changed ? 19 : 0)),
        ),
      ),
    ];
    for (const pose of poses) {
      joints.forEach((node, index) => {
        const axis = converted(model.joints[index].axis).normalize();
        node.quaternion
          .copy(rest[index])
          .multiply(
            new Quaternion().setFromAxisAngle(
              axis,
              ((pose[index] - model.joints[index].homeDeg) * Math.PI) / 180,
            ),
          );
      });
      gltf.scene.updateMatrixWorld(true);
      const fk = forwardKinematics(model, pose);
      closeVector(
        tcp.getWorldPosition(new Vector3()),
        converted(fk.tcp.toArray() as Vec3),
        `${model.id} non-home articulated TCP`,
      );
      joints.forEach((node, index) =>
        closeVector(
          node.getWorldPosition(new Vector3()),
          converted(fk.pivots[index].toArray() as Vec3),
          `${model.id} moving joint ${index + 1}`,
        ),
      );
    }
    const placement = { x: 2.3, y: -1.7 },
      yaw = 73,
      height = 0.45;
    gltf.scene.position.copy(converted([placement.x, placement.y, height]));
    gltf.scene.rotation.y = (yaw * Math.PI) / 180;
    gltf.scene.updateMatrixWorld(true);
    const finalFk = forwardKinematics(model, poses[poses.length - 1]);
    closeVector(
      tcp.getWorldPosition(new Vector3()),
      converted(
        robotToFactory(finalFk.tcp.toArray() as Vec3, placement, yaw, height),
      ),
      "placed/yawed actual GLB matches world telemetry",
    );
    gltf.scene.traverse((node) => {
      if (node instanceof Mesh) {
        node.geometry.dispose();
        for (const material of Array.isArray(node.material)
          ? node.material
          : [node.material])
          material.dispose();
      }
    });
  });
}
