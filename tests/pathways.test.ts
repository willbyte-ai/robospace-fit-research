import test from "node:test";
import assert from "node:assert/strict";
import {
  analyzePathways,
  defaultScenario,
  segmentRectDistance,
  sweptSegmentIntersectsRect,
  segmentIntersection,
  segmentSegmentDistance,
} from "../lib/engine";
import type { Scenario, Rect } from "../lib/engine";
const rect: Rect = { kind: "rect", center: { x: 0, y: 0 }, width: 2, depth: 2 };
const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-8, `${a} != ${b}`);
function scenario(): Scenario {
  const s = structuredClone(defaultScenario);
  s.equipment = [];
  s.pathways = [];
  s.targets = s.targets.map(({ equipmentId, ...target }) => target);
  return s;
}
test("segment to rectangle uses Euclidean rounded corners, not axis-inflated AABB", () => {
  const a = { x: 1.8, y: 1.8 },
    b = { x: 2.8, y: 1.8 };
  close(segmentRectDistance(a, b, rect), Math.hypot(0.8, 0.8));
  assert.equal(sweptSegmentIntersectsRect(a, b, 1, rect), false);
  assert.equal(
    sweptSegmentIntersectsRect(a, b, Math.hypot(0.8, 0.8), rect),
    true,
  );
  assert.equal(segmentRectDistance({ x: -3, y: 0 }, { x: 3, y: 0 }, rect), 0);
});
test("segment to rectangle finds interior projection to corner and handles point segments", () => {
  close(
    segmentRectDistance({ x: 0, y: 3 }, { x: 3, y: 0 }, rect),
    Math.SQRT1_2,
  );
  close(segmentRectDistance({ x: 2, y: 2 }, { x: 2, y: 2 }, rect), Math.SQRT2);
});
test("segment intersections distinguish crossing, shared, touching and parallel separated", () => {
  assert.deepEqual(
    segmentIntersection(
      { x: -1, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: -1 },
      { x: 0, y: 1 },
    ),
    { kind: "point", point: { x: 0, y: 0 } },
  );
  assert.equal(
    segmentIntersection(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      { x: 3, y: 0 },
      { x: 1, y: 0 },
    )?.kind,
    "overlap",
  );
  assert.equal(
    segmentIntersection(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 1, y: 0 },
      { x: 2, y: 0 },
    )?.kind,
    "point",
  );
  assert.equal(
    segmentIntersection(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ),
    null,
  );
  close(
    segmentSegmentDistance(
      { x: 0, y: 0 },
      { x: 1, y: 0 },
      { x: 0, y: 1 },
      { x: 1, y: 1 },
    ),
    1,
  );
  assert.equal(
    segmentIntersection(
      { x: 0, y: 0 },
      { x: 0, y: 0 },
      { x: -1, y: 0 },
      { x: 1, y: 0 },
    )?.kind,
    "point",
  );
});
test("configurable minimum is a width assumption, with finite range checks", () => {
  const s = scenario();
  s.pathways = [
    {
      id: "w",
      name: "w",
      kind: "worker",
      width: 1,
      points: [
        { x: -2, y: 0 },
        { x: 2, y: 0 },
      ],
    },
  ];
  const defaultResult = analyzePathways(s);
  assert.equal(defaultResult.routes[0].status, "review");
  close(defaultResult.routes[0].widthDeficit, 0.2);
  assert.equal(defaultResult.routes[0].bottlenecks.length, 1);
  assert.equal(analyzePathways(s, 0.9).routes[0].status, "clear");
  assert.throws(() => analyzePathways(s, NaN), RangeError);
  assert.throws(() => analyzePathways(s, -1), RangeError);
});
test("work target exclusions do not let routes pass through equipment", () => {
  const s = scenario();
  s.equipment = [
    {
      id: "target",
      name: "target",
      category: "conveyor",
      blocksBase: true,
      sweepPolicy: "work-target",
      footprint: rect,
    },
  ];
  s.pathways = [
    {
      id: "w",
      name: "w",
      kind: "worker",
      width: 1.2,
      points: [
        { x: -3, y: 0 },
        { x: 3, y: 0 },
      ],
    },
  ];
  const result = analyzePathways(s).routes[0];
  assert.equal(result.status, "obstructed");
  assert.equal(result.obstacleIntersections[0].equipmentId, "target");
  assert.equal(result.minCenteredClearWidth, 0);
  close(result.minClearance!, -0.6);
});
test("narrow obstacle-free centred strip is reported as a bottleneck", () => {
  const s = scenario();
  s.equipment = [
    {
      id: "rect",
      name: "rect",
      category: "rack",
      blocksBase: true,
      sweepPolicy: "advisory",
      footprint: rect,
    },
  ];
  s.pathways = [
    {
      id: "w",
      name: "w",
      kind: "worker",
      width: 1.2,
      points: [
        { x: -3, y: 1.4 },
        { x: 3, y: 1.4 },
      ],
    },
  ];
  const result = analyzePathways(s).routes[0];
  close(result.minCenteredClearWidth, 0.8);
  close(result.minClearance!, -0.2);
  assert.deepEqual(result.bottlenecks[0].obstacleIds, ["rect"]);
});
test("circular equipment is included in swept route collision", () => {
  const s = scenario();
  s.equipment = [
    {
      id: "tank",
      name: "tank",
      category: "tank",
      blocksBase: true,
      sweepPolicy: "advisory",
      footprint: { kind: "circle", center: { x: 0, y: 0 }, radius: 1 },
    },
  ];
  s.pathways = [
    {
      id: "w",
      name: "w",
      kind: "worker",
      width: 1.2,
      points: [
        { x: -3, y: 1.6 },
        { x: 3, y: 1.6 },
      ],
    },
  ];
  const result = analyzePathways(s).routes[0];
  assert.equal(result.status, "obstructed");
  close(result.minClearance!, 0);
});
test("worker/cart centreline crossing identifies segment and world point", () => {
  const s = scenario();
  s.pathways = [
    {
      id: "w",
      name: "worker",
      kind: "worker",
      width: 1.2,
      points: [
        { x: -2, y: 0 },
        { x: 2, y: 0 },
      ],
    },
    {
      id: "c",
      name: "cart",
      kind: "cart",
      width: 1.2,
      points: [
        { x: 0, y: -2 },
        { x: 0, y: 2 },
      ],
    },
  ];
  const result = analyzePathways(s);
  assert.equal(result.crossings.length, 1);
  assert.equal(result.crossings[0].kind, "crossing");
  assert.equal(result.crossings[0].centerlinesIntersect, true);
  assert.deepEqual(result.crossings[0].segmentPairs[0].intersection, {
    kind: "point",
    point: { x: 0, y: 0 },
  });
  assert.equal(result.routes[0].status, "review");
  assert.equal(result.reviewCount, 2);
});
test("worker/cart shared segment differs from width-only proximity", () => {
  const s = scenario();
  s.pathways = [
    {
      id: "w",
      name: "worker",
      kind: "worker",
      width: 1.2,
      points: [
        { x: -2, y: 0 },
        { x: 2, y: 0 },
      ],
    },
    {
      id: "c",
      name: "cart",
      kind: "cart",
      width: 1.2,
      points: [
        { x: -1, y: 0 },
        { x: 1, y: 0 },
      ],
    },
  ];
  assert.equal(analyzePathways(s).crossings[0].kind, "shared");
  s.pathways[1].points = [
    { x: -1, y: 1.1 },
    { x: 1, y: 1.1 },
  ];
  const nearby = analyzePathways(s).crossings[0];
  assert.equal(nearby.kind, "proximity");
  assert.equal(nearby.centerlinesIntersect, false);
  close(nearby.corridorClearance, -0.1);
  s.pathways[1].points = [
    { x: -1, y: 1.3 },
    { x: 1, y: 1.3 },
  ];
  assert.equal(analyzePathways(s).crossings.length, 0);
});
test("corridor half width is included in factory-boundary check", () => {
  const s = scenario();
  s.pathways = [
    {
      id: "w",
      name: "worker",
      kind: "worker",
      width: 1.2,
      points: [
        { x: 11.8, y: -2 },
        { x: 11.8, y: 2 },
      ],
    },
  ];
  const result = analyzePathways(s).routes[0];
  assert.equal(result.withinFactory, false);
  assert.equal(result.status, "obstructed");
});
test("default scenario reports shared worker/cart section without changing candidate analysis", () => {
  const result = analyzePathways(defaultScenario);
  assert.equal(result.crossings[0].kind, "shared");
  assert.equal(
    result.routes.find((r) => r.kind === "cart")!.meetsMinimumWidth,
    false,
  );
  assert.equal(result.routes.length, 2);
  assert.equal(Number.isFinite(result.routes[0].length), true);
});
test("crossing detail arrays are capped while retaining the full count", () => {
  const s = scenario();
  const points = Array.from({ length: 20 }, (_, i) => ({
    x: i % 2 ? 1 : -1,
    y: 0,
  }));
  s.pathways = [
    { id: "w", name: "worker", kind: "worker", width: 1.2, points },
    { id: "c", name: "cart", kind: "cart", width: 1.2, points },
  ];
  const result = analyzePathways(s).crossings[0];
  assert.equal(result.segmentPairs.length, 100);
  assert.equal(result.segmentPairCount, 361);
  assert.equal(result.detailsTruncated, true);
});
