import test from "node:test";
import assert from "node:assert/strict";
import { defaultScenario, isFactoryCompatible } from "../lib/factory-scenario";
import {
  analyzeAll,
  analyzePathways,
  computeRoi,
  validateScenario,
} from "../lib/engine";
import fs from "node:fs";
test("Blender-derived factory has 27 colliders, exact targets and expected three candidate outcomes", () => {
  assert.equal(defaultScenario.equipment.length, 27);
  assert.equal(validateScenario(defaultScenario).valid, true);
  const [a, b, c] = analyzeAll(defaultScenario);
  assert.equal(a.status, "recommended");
  assert.equal(a.allTargetsReachable, true);
  assert.ok(a.minClearance! > 0.45);
  assert.equal(b.status, "review");
  assert.equal(c.status, "blocked");
  assert.equal(c.footprintCollisions[0].equipmentId, "robot_controller");
  assert.deepEqual([a.score, b.score, c.score], [100, 35, 0]);
});
test("model compatibility preserves editable parameters but rejects foreign geometry", () => {
  const edit = structuredClone(defaultScenario);
  edit.candidates[0].position.x = 0.7;
  edit.roi.investment = 120000000;
  assert.equal(isFactoryCompatible(edit), true);
  edit.factory.width = 25;
  assert.equal(isFactoryCompatible(edit), false);
  const footprint = structuredClone(defaultScenario);
  footprint.equipment[0].footprint.center.x += 0.1;
  assert.equal(isFactoryCompatible(footprint), false);
});
test("default routes expose actual pallet/rack occupancy and shared corridor", () => {
  const paths = analyzePathways(defaultScenario);
  assert.equal(paths.obstructedCount, 2);
  assert.equal(paths.crossings[0].kind, "shared");
  assert.ok(
    paths.routes.some((p) =>
      p.obstacleIntersections.some((o) => o.equipmentId === "warehouse_rack"),
    ),
  );
});
test("current factory scenario round-trips JSON including editable minimum path width", () => {
  const clone = structuredClone(defaultScenario);
  clone.minimumPathwayWidth = 1.6;
  const restored = validateScenario(JSON.parse(JSON.stringify(clone)));
  assert.equal(restored.valid, true);
  if (restored.valid) {
    assert.equal(restored.scenario.minimumPathwayWidth, 1.6);
    assert.equal(isFactoryCompatible(restored.scenario), true);
    assert.deepEqual(analyzeAll(restored.scenario), analyzeAll(clone));
  }
  assert.equal(
    validateScenario({ ...clone, minimumPathwayWidth: -1 }).valid,
    false,
  );
});
test("GLB has exactly six joint groups, intact hierarchy, and factory excludes robot", () => {
  const glb = (path: string) => {
    const b = fs.readFileSync(path);
    assert.equal(b.toString("utf8", 0, 4), "glTF");
    return JSON.parse(b.toString("utf8", 20, 20 + b.readUInt32LE(12)));
  };
  const robot = glb("public/models/robot.glb");
  const joints = robot.nodes.filter(
    (n: { extras?: { joint_index?: number } }) =>
      typeof n.extras?.joint_index === "number",
  );
  assert.equal(joints.length, 6);
  assert.ok(
    joints.every(
      (n: { mesh?: number; children?: number[] }) =>
        n.mesh === undefined && n.children?.length,
    ),
  );
  const factory = glb("public/models/factory.glb");
  assert.ok(
    factory.nodes.every(
      (n: { name: string }) =>
        !["Robot_Root", "Cube", "Camera", "Light"].includes(n.name),
    ),
  );
});
test("factory baseline economic result stays consistent with report", () => {
  const r = computeRoi(defaultScenario.roi);
  assert.equal(r.annualSavings, 42264000);
  assert.ok(Math.abs(r.paybackMonths! - 18.455422) < 0.00001);
});
