import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzeAll,
  analyzeCandidate,
  computeRoi,
  defaultScenario,
  validateScenario,
  pointSegmentDistance,
  pointRectDistance,
  signedPointRectDistance,
  segmentIntersectsCircle,
  segmentCircleIntersections,
  segmentIntersectsRect,
  circleIntersectsRect,
  polylineDistance,
} from "../lib/engine";
import type { Rect, Scenario } from "../lib/engine";
const rect: Rect = { kind: "rect", center: { x: 0, y: 0 }, width: 2, depth: 2 };
const clone = (): Scenario => structuredClone(defaultScenario);
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);

test("default scenario validates and strips unknown fields from imports", () => {
  const value = { ...clone(), unexpected: "not retained" };
  const result = validateScenario(value);
  assert.equal(result.valid, true);
  if (result.valid) assert.equal("unexpected" in result.scenario, false);
});
test("A meets target reach and clearance; B needs review; C has real base collision", () => {
  const [a, b, c] = analyzeAll(defaultScenario);
  assert.equal(a.status, "recommended");
  assert.equal(a.score, 100);
  assert.equal(a.allTargetsReachable, true);
  close(a.reach[0].distance, 1.6);
  assert.ok(a.safetyMargin! > 0);
  assert.equal(a.footprintCollisions.length, 0);
  assert.equal(b.status, "review");
  assert.equal(b.allTargetsReachable, false);
  assert.ok(
    b.pathways.find((item) => item.kind === "worker")!.envelopeIntersects,
  );
  assert.equal(c.status, "blocked");
  assert.ok(
    c.footprintCollisions.some((item) => item.equipmentId === "cell-cabinet"),
  );
  assert.ok(a.score > b.score && b.score > c.score);
});
test("intentional work-target sweep overlaps are excluded but base collision is still detected", () => {
  const scenario = clone();
  scenario.robot.reach = 5;
  const a = analyzeCandidate(scenario, scenario.candidates[0]);
  assert.equal(
    a.envelopeAdvisories.some((item) => item.equipmentId === "infeed"),
    false,
  );
  const onConveyor = analyzeCandidate(scenario, {
    id: "test",
    name: "test",
    position: { x: -0.8, y: 0 },
  });
  assert.ok(
    onConveyor.footprintCollisions.some(
      (item) => item.equipmentId === "infeed",
    ),
  );
});
test("segment distances handle endpoint, projected point and degenerate segments", () => {
  close(
    pointSegmentDistance({ x: 1, y: 3 }, { x: 0, y: 0 }, { x: 2, y: 0 }),
    3,
  );
  close(
    pointSegmentDistance({ x: -1, y: 0 }, { x: 0, y: 0 }, { x: 2, y: 0 }),
    1,
  );
  close(
    pointSegmentDistance({ x: 3, y: 4 }, { x: 0, y: 0 }, { x: 0, y: 0 }),
    5,
  );
});
test("rectangle clearance is Euclidean at corners and signed inside", () => {
  close(pointRectDistance({ x: 2, y: 2 }, rect), Math.sqrt(2));
  close(signedPointRectDistance({ x: 0, y: 0 }, rect), -1);
  assert.ok(circleIntersectsRect({ x: 2, y: 0 }, 1, rect));
  assert.equal(circleIntersectsRect({ x: 2.01, y: 0 }, 1, rect), false);
});
test("circle segment tangency gives one point and inclusive overlap", () => {
  const a = { x: -2, y: 1 },
    b = { x: 2, y: 1 },
    center = { x: 0, y: 0 };
  assert.equal(segmentIntersectsCircle(a, b, center, 1), true);
  assert.deepEqual(segmentCircleIntersections(a, b, center, 1), [
    { x: 0, y: 1 },
  ]);
  assert.deepEqual(
    segmentCircleIntersections({ x: -2, y: 0 }, { x: 2, y: 0 }, center, 1),
    [
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    ],
  );
  assert.equal(
    segmentIntersectsCircle({ x: 0, y: 0 }, { x: 0, y: 0 }, center, 1),
    true,
  );
  assert.deepEqual(segmentCircleIntersections(center, center, center, 1), []);
});
test("rectangle segment tangency, parallel outside, and zero length", () => {
  assert.equal(
    segmentIntersectsRect({ x: -2, y: 1 }, { x: 2, y: 1 }, rect),
    true,
  );
  assert.equal(
    segmentIntersectsRect({ x: -2, y: 1.01 }, { x: 2, y: 1.01 }, rect),
    false,
  );
  assert.equal(
    segmentIntersectsRect({ x: 0, y: 0 }, { x: 0, y: 0 }, rect),
    true,
  );
  assert.equal(
    segmentIntersectsRect({ x: 2, y: 0 }, { x: 2, y: 0 }, rect),
    false,
  );
});
test("polyline handles bends and repeated points", () => {
  close(
    polylineDistance({ x: 1, y: 1 }, [
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: 2, y: 0 },
      { x: 2, y: 2 },
    ]),
    1,
  );
  assert.equal(polylineDistance({ x: 0, y: 0 }, []), Infinity);
});
test("factory boundary includes entire robot base; out of bounds is a blocker", () => {
  const scenario = clone();
  const result = analyzeCandidate(scenario, {
    id: "outside",
    name: "outside",
    position: { x: 11.8, y: 0 },
  });
  assert.equal(result.withinFactory, false);
  assert.equal(result.status, "blocked");
});
test("changing radius recomputes target reach rather than retaining preset classifications", () => {
  const scenario = clone();
  scenario.robot.reach = 3.5;
  const result = analyzeCandidate(scenario, scenario.candidates[1]);
  assert.equal(result.allTargetsReachable, true);
  assert.equal(result.reach.length, scenario.targets.length);
});
test("ROI uses per-day hours, days/month, before-after workers, and maintenance", () => {
  const roi = computeRoi(defaultScenario.roi);
  assert.equal(roi.monthlyHours, 176);
  assert.equal(roi.annualHours, 2112);
  assert.equal(roi.annualLaborBefore, 92928000);
  assert.equal(roi.annualLaborAfter, 46464000);
  assert.equal(roi.annualSavings, 42264000);
  close(roi.paybackMonths!, 65000000 / 3522000);
});
test("zero or negative savings means no finite simple payback", () => {
  const zero = computeRoi({
    ...defaultScenario.roi,
    workersAfter: 2,
    monthlyMaintenance: 0,
  });
  assert.equal(zero.annualSavings, 0);
  assert.equal(zero.paybackMonths, null);
  const negative = computeRoi({ ...defaultScenario.roi, workersAfter: 3 });
  assert.ok(negative.annualSavings < 0);
  assert.equal(negative.paybackYears, null);
});
test("zero capex with positive savings has immediate payback, and invalid ROI is rejected", () => {
  assert.equal(
    computeRoi({ ...defaultScenario.roi, investment: 0 }).paybackMonths,
    0,
  );
  assert.throws(
    () => computeRoi({ ...defaultScenario.roi, hoursPerDay: 25 }),
    RangeError,
  );
  assert.throws(
    () => computeRoi({ ...defaultScenario.roi, hourlyWage: NaN }),
    RangeError,
  );
});
test("unknown input validation rejects invalid schema, numeric strings, infinite coordinates and duplicates", () => {
  assert.equal(validateScenario(null).valid, false);
  assert.equal(validateScenario({}).valid, false);
  for (const mutate of [
    (s: any) => (s.schemaVersion = "2.0"),
    (s: any) => (s.robot.reach = "1.85"),
    (s: any) => (s.candidates[0].position.x = Infinity),
    (s: any) => s.equipment.push(s.equipment[0]),
    (s: any) => (s.robot.safetyBuffer = -1),
    (s: any) => (s.targets[0].equipmentId = "missing"),
    (s: any) => (s.pathways[0].points = [{ x: 0, y: 0 }]),
    (s: any) => (s.roi.hoursPerDay = 25),
  ]) {
    const s = clone();
    mutate(s);
    assert.equal(validateScenario(s).valid, false);
  }
});
test("bounded arrays prevent importing oversized workloads", () => {
  const scenario = clone();
  scenario.equipment = Array.from({ length: 201 }, (_, i) => ({
    ...scenario.equipment[0],
    id: `e${i}`,
  }));
  const result = validateScenario(scenario);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("0~200")));
});
test("empty equipment and routes are valid and produce finite serializable analysis", () => {
  const scenario = clone();
  scenario.equipment = [];
  scenario.pathways = [];
  scenario.targets = scenario.targets.map(
    ({ equipmentId, ...target }) => target,
  );
  assert.equal(validateScenario(scenario).valid, true);
  const result = analyzeCandidate(scenario, scenario.candidates[0]);
  assert.equal(result.minClearance, null);
  assert.equal(result.safetyMargin, null);
  assert.equal(result.status, "recommended");
  assert.ok(JSON.stringify(result).includes('"minClearance":null'));
});
