import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { createHash } from "node:crypto";
import { factories, factoryBounds, isFactoryCompatible } from "../lib/factory-scenario";
import { analyzeAll, validateScenario, computeRoi } from "../lib/engine";
import { readScenario, scenarioStorageKey } from "../lib/scenario-storage";
import { Box3, Matrix4, Quaternion, Vector3 } from "three";

function readGlb(path: string) {
  const bytes = fs.readFileSync(`public${path}`);
  assert.equal(bytes.toString("utf8", 0, 4), "glTF");
  assert.equal(bytes.readUInt32LE(8), bytes.length);
  return JSON.parse(bytes.toString("utf8", 20, 20 + bytes.readUInt32LE(12)));
}

test("four factories have independent assets, geometry, process inputs and valid candidate analyses", () => {
  assert.equal(factories.length, 4);
  assert.equal(new Set(factories.map(f => f.scenario.id)).size, 4);
  const hashes = new Set();
  for (const f of factories) {
    const result = validateScenario(f.scenario);
    assert.equal(result.valid, true, f.slug + JSON.stringify(result));
    assert.ok(isFactoryCompatible(f.scenario), f.slug);
    assert.ok(result.valid && isFactoryCompatible(result.scenario), `${f.slug} survives JSON validation`);
    hashes.add(createHash("sha256").update(fs.readFileSync(`public${f.assets.factory}`)).digest("hex"));
    for (const asset of Object.values(f.assets)) assert.ok(fs.statSync(`public${asset}`).size > 100, asset);
    const results = analyzeAll(f.scenario);
    const a = results.find(r => r.candidateId === "A")!;
    const c = results.find(r => r.candidateId === "C")!;
    assert.ok(a.allTargetsReachable, `${f.slug} A must reach both work points`);
    assert.equal(a.footprintCollisions.length, 0, `${f.slug} A has free base`);
    assert.ok(a.withinCell && a.withinFactory, f.slug);
    assert.ok(c.footprintCollisions.length > 0, `${f.slug} C represents a real obstacle`);
    assert.ok(a.score > c.score, f.slug);
    assert.ok(Number.isFinite(computeRoi(f.scenario.roi).annualSavings));
  }
  assert.equal(hashes.size, 4, "assets must not be copies of one factory");
});

test("each new collider matches the exported equipment mesh bounds in world coordinates", () => {
  const mismatches: string[] = [];
  for (const f of factories.slice(1)) {
    const gltf = readGlb(f.assets.factory);
    assert.equal(gltf.scenes.length, 1, `${f.slug} must export only its own scene`);
    assert.ok(gltf.materials.every((m: {name:string}) => !m.name.startsWith("RS_")), `${f.slug} contains no food-factory materials`);
    const boxes = new Map<string, Box3>();
    const visit = (index: number, parent: Matrix4) => {
      const node = gltf.nodes[index];
      const local = node.matrix ? new Matrix4().fromArray(node.matrix) : new Matrix4().compose(
        new Vector3().fromArray(node.translation ?? [0, 0, 0]),
        new Quaternion().fromArray(node.rotation ?? [0, 0, 0, 1]),
        new Vector3().fromArray(node.scale ?? [1, 1, 1]),
      );
      const world = parent.clone().multiply(local);
      const id = node.extras?.equipment_id;
      if (id && node.mesh !== undefined) {
        const b = boxes.get(id) ?? new Box3();
        for (const prim of gltf.meshes[node.mesh].primitives) {
          const a = gltf.accessors[prim.attributes.POSITION];
          b.union(new Box3(new Vector3().fromArray(a.min), new Vector3().fromArray(a.max)).applyMatrix4(world));
        }
        boxes.set(id, b);
      }
      for (const child of node.children ?? []) visit(child, world);
    };
    for (const index of gltf.scenes[gltf.scene ?? 0].nodes) visit(index, new Matrix4());
    for (const equipment of f.scenario.equipment) {
      const box = boxes.get(equipment.id);
      assert.ok(box, `${f.slug}: missing exported collider ${equipment.id}`);
      const p = equipment.footprint;
      assert.equal(p.kind, "rect");
      if (p.kind !== "rect") continue;
      const measured = [box.min.x, box.max.x, -box.max.z, -box.min.z];
      const declared = [p.center.x - p.width / 2, p.center.x + p.width / 2, p.center.y - p.depth / 2, p.center.y + p.depth / 2];
      measured.forEach((n, i) => { if (Math.abs(n - declared[i]) >= 0.035) mismatches.push(`${f.slug}/${equipment.id}: actual ${n}, declared ${declared[i]}`); });
    }
  }
  assert.deepEqual(mismatches, []);
});

test("distinct robots export six-axis, SCARA with vertical quill, and four-axis palletizer hierarchies", () => {
  const jointCounts = [6, 6, 4, 4];
  factories.forEach((f, i) => {
    const robot = readGlb(f.assets.robot);
    const joints = robot.nodes.filter((n: any) => typeof n.extras?.joint_index === "number");
    assert.equal(joints.length, jointCounts[i], f.slug);
    assert.ok(joints.every((n: any) => n.mesh === undefined && n.children?.length), f.slug);
    if (f.slug === "electronics-assembly") assert.ok(joints.some((n: any) => n.extras.joint_motion === "linear" && n.extras.joint_axis_blender === "Z"));
  });
});

test("saved edits stay isolated and a factory cannot import another factory's geometry", () => {
  const store = new Map<string, string>();
  const storage = { getItem: (key: string) => store.get(key) ?? null };
  factories.forEach((f, i) => {
    const scenario = structuredClone(f.scenario);
    scenario.roi.investment = 50000000 + i * 1000000;
    scenario.candidates[0].position.x += 0.05;
    store.set(scenarioStorageKey(scenario.id), JSON.stringify({ ...scenario, selectedCandidateId: "B" }));
  });
  factories.forEach((f, i) => {
    const saved = readScenario(storage, f.scenario.id)!;
    assert.equal(saved.scenario.roi.investment, 50000000 + i * 1000000);
    assert.equal(saved.selected, "B");
    assert.ok(saved.saved);
  });
  const foreign = structuredClone(factories[1].scenario);
  foreign.id = factories[2].scenario.id;
  assert.equal(isFactoryCompatible(foreign), false);
  store.set(scenarioStorageKey(factories[1].scenario.id), JSON.stringify(foreign));
  assert.equal(readScenario(storage, factories[1].scenario.id), undefined);
  store.set("robospace-fit:scenario:v2", JSON.stringify({ ...factories[0].scenario, selectedCandidateId: "C" }));
  store.delete(scenarioStorageKey(factories[0].scenario.id));
  assert.equal(readScenario(storage, factories[0].scenario.id)?.selected, "C");
  assert.equal(readScenario(storage, "unknown"), undefined);
});

test("editing bounds derive from the selected factory and robot base diameter", () => {
  for (const f of factories) {
    const b = factoryBounds(f.scenario, f.scenario.robot.footprintDiameter / 2);
    assert.equal(b.maxX - b.minX, f.scenario.factory.width - f.scenario.robot.footprintDiameter);
    assert.equal(b.maxY - b.minY, f.scenario.factory.depth - f.scenario.robot.footprintDiameter);
  }
});
