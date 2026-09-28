import test from "node:test";
import assert from "node:assert/strict";
import { defaultScenario, validateScenario } from "../lib/engine";
import { findRobot } from "../lib/robot-catalog";
import {
  assetCatalog,
  findAsset,
  parsePlacedAssets,
  placementContext,
  placementIssues,
  suggestPlacement,
  type PlacedAsset,
} from "../lib/placement";
import type { Equipment, Scenario } from "../lib/engine";

const emptyFactory = (): Scenario => ({
  ...structuredClone(defaultScenario),
  factory: { center: { x: 0, y: 0 }, width: 12, depth: 10 },
  cell: { kind: "rect", center: { x: 0, y: 0 }, width: 4, depth: 4 },
  equipment: [],
});
const placed = (overrides: Partial<PlacedAsset> = {}): PlacedAsset => ({
  id: "placed-1",
  assetId: "roller-conveyor",
  name: "롤러 1",
  position: { x: 0, y: 0 },
  yawDeg: 0,
  mountHeight: 0,
  ...overrides,
});
const obstacle = (footprint: Equipment["footprint"]): Equipment => ({
  id: "static",
  name: "고정 설비",
  category: "test",
  blocksBase: true,
  sweepPolicy: "advisory",
  footprint,
});

test("the placement catalog contains three rigged arms and five distinct equipment types", () => {
  assert.equal(assetCatalog.length, 8);
  assert.equal(new Set(assetCatalog.map((a) => a.id)).size, 8);
  assert.equal(assetCatalog.filter((a) => a.category === "robot").length, 3);
  assert.equal(assetCatalog.filter((a) => !a.robotModelId).length, 5);
  for (const asset of assetCatalog) {
    assert.ok(asset.width > 0 && asset.depth > 0 && asset.height > 0);
    assert.ok(asset.modelUrl.endsWith(".glb"));
    assert.ok(
      asset.thumbnailUrl.endsWith(
        asset.robotModelId ? "thumbnail.png" : "thumbnail.webp",
      ),
    );
    if (asset.robotModelId) assert.ok(findRobot(asset.robotModelId));
  }
});

test("import preserves multiple independent assets and clones mutable values", () => {
  const model = findRobot("ur10e")!;
  const input = [
    placed(),
    placed({
      id: "robot-2",
      assetId: model.id,
      yawDeg: 90,
      mountHeight: 0.5,
      joints: model.joints.map((j) => j.homeDeg),
    }),
  ];
  const output = parsePlacedAssets(input);
  assert.deepEqual(output, input);
  output[0].position.x = 20;
  output[1].joints![0] = 0;
  assert.equal(input[0].position.x, 0);
  assert.equal(input[1].joints![0], model.joints[0].homeDeg);
  assert.deepEqual(parsePlacedAssets([]), []);
});

test("import rejects duplicate IDs, unknown models, malformed coordinates, and excessive instances", () => {
  const invalid: unknown[] = [
    undefined,
    {},
    [null],
    [[placed()]],
    [placed(), placed()],
    [placed({ id: " " })],
    [placed({ name: " " })],
    [placed({ assetId: "untrusted-model" })],
    [placed({ position: { x: NaN, y: 0 } })],
    [placed({ position: { x: 0, y: Infinity } })],
    [placed({ position: { x: 1000.1, y: 0 } })],
    [placed({ yawDeg: 181 })],
    [placed({ mountHeight: -0.1 })],
    [placed({ mountHeight: 1.51 })],
    Array.from({ length: 61 }, (_, i) => placed({ id: `item-${i}` })),
  ];
  for (const input of invalid) assert.throws(() => parsePlacedAssets(input));
  assert.equal(
    parsePlacedAssets(
      Array.from({ length: 60 }, (_, i) => placed({ id: `item-${i}` })),
    ).length,
    60,
  );
});

test("persisted joint angles are accepted only for known robot rigs and within individual limits", () => {
  const model = findRobot("abb-irb1200")!;
  const joints = model.joints.map((j) => j.homeDeg);
  assert.throws(() => parsePlacedAssets([placed({ joints })]));
  assert.throws(() =>
    parsePlacedAssets([placed({ assetId: model.id, joints: [0] })]),
  );
  assert.throws(() =>
    parsePlacedAssets([
      placed({
        assetId: model.id,
        joints: joints.map((n, i) =>
          i === 1 ? model.joints[i].maxDeg + 0.01 : n,
        ),
      }),
    ]),
  );
  assert.throws(() =>
    parsePlacedAssets([
      placed({
        assetId: model.id,
        joints: joints.map((n, i) => (i === 2 ? NaN : n)),
      }),
    ]),
  );
  assert.equal(
    parsePlacedAssets([placed({ assetId: model.id, joints })])[0].joints!
      .length,
    6,
  );
});

test("factory boundaries use the rotated footprint, not just the asset centre", () => {
  const scenario = emptyFactory();
  scenario.factory = { center: { x: 4, y: -2 }, width: 3.2, depth: 1.2 };
  const item = placed({ position: { x: 4, y: -2 } });
  assert.equal(placementIssues(item, scenario, []).outside, false);
  assert.equal(
    placementIssues({ ...item, yawDeg: 45 }, scenario, []).outside,
    true,
  );
  assert.equal(
    placementIssues({ ...item, position: { x: 4.11, y: -2 } }, scenario, [])
      .outside,
    true,
  );
  assert.equal(
    placementIssues({ ...item, position: { x: 4.1, y: -2 } }, scenario, [])
      .outside,
    false,
  );
});

test("visible reference robot contributes a temporary blocking footprint without mutating saved equipment", () => {
  const scenario = emptyFactory();
  const candidate = scenario.candidates[0];
  const before = structuredClone(scenario);
  const context = placementContext(scenario, candidate.id);
  const item = placed({
    assetId: "amr-cart",
    position: { ...candidate.position },
  });
  assert.notEqual(context, scenario);
  assert.equal(context.equipment.length, 1);
  assert.deepEqual(placementIssues(item, scenario, []).overlaps, []);
  assert.deepEqual(placementIssues(item, context, []).overlaps, [
    "분석 기준 로봇",
  ]);
  assert.deepEqual(context.equipment[0].footprint, {
    kind: "circle",
    center: candidate.position,
    radius: scenario.robot.footprintDiameter / 2,
  });
  assert.deepEqual(scenario, before);
  context.equipment[0].footprint.center.x += 10;
  assert.equal(candidate.position.x, before.candidates[0].position.x);
});

test("hidden or invalid reference robot leaves the original collision context unchanged", () => {
  const scenario = emptyFactory();
  const candidate = scenario.candidates[0];
  assert.equal(placementContext(scenario, "missing"), scenario);
  assert.equal(placementContext(scenario), scenario);
  scenario.showReferenceRobot = false;
  const context = placementContext(scenario, candidate.id);
  assert.equal(context, scenario);
  assert.deepEqual(
    placementIssues(placed({ position: candidate.position }), context, [])
      .overlaps,
    [],
  );
});

test("temporary reference robot IDs remain unique even with colliding imported equipment IDs", () => {
  const scenario = emptyFactory();
  const staticEquipment = obstacle({
    kind: "circle",
    center: { x: 5, y: 5 },
    radius: 0.1,
  });
  scenario.equipment = [
    { ...staticEquipment, id: "__layout_reference_robot__" },
    { ...staticEquipment, id: "__layout_reference_robot__1" },
  ];
  const context = placementContext(scenario, scenario.candidates[0].id);
  assert.equal(context.equipment.length, 3);
  assert.equal(new Set(context.equipment.map((item) => item.id)).size, 3);
  assert.equal(scenario.equipment.length, 2);
});

test("oriented SAT separates diagonally aligned conveyors whose axis-aligned bounds overlap", () => {
  const scenario = emptyFactory();
  const item = placed({ yawDeg: 45 });
  const separate = placed({
    id: "other",
    yawDeg: 45,
    position: { x: -0.8, y: 0.8 },
  });
  assert.deepEqual(placementIssues(item, scenario, [separate]).overlaps, []);
  const overlapping = { ...separate, position: { x: -0.5, y: 0.5 } };
  assert.deepEqual(placementIssues(item, scenario, [overlapping]).overlaps, [
    overlapping.name,
  ]);
  assert.deepEqual(placementIssues(item, scenario, [item]).overlaps, []);
});

test("static rectangles respect rotation and nonblocking equipment remains advisory-free", () => {
  const scenario = emptyFactory();
  const fixed = obstacle({
    kind: "rect",
    center: { x: 1.1, y: 0 },
    width: 0.4,
    depth: 0.4,
  });
  scenario.equipment = [fixed];
  assert.deepEqual(placementIssues(placed(), scenario, []).overlaps, [
    fixed.name,
  ]);
  assert.deepEqual(
    placementIssues(placed({ yawDeg: 90 }), scenario, []).overlaps,
    [],
  );
  fixed.blocksBase = false;
  assert.deepEqual(placementIssues(placed(), scenario, []).overlaps, []);
});

test("circle tests distinguish corner clearance, contact, penetration, and interior points", () => {
  const scenario = emptyFactory();
  const check = (x: number, y: number, radius: number) => {
    scenario.equipment = [
      obstacle({ kind: "circle", center: { x, y }, radius }),
    ];
    return placementIssues(placed(), scenario, []).overlaps.length;
  };
  assert.equal(check(1.58, 0.52, 0.1), 0);
  assert.equal(check(1.55, 0.475, 0.1), 1);
  assert.equal(check(1.6, 0, 0.1), 0);
  assert.equal(check(1.59, 0, 0.1), 1);
  assert.equal(check(0, 0, 0.1), 1);
  scenario.equipment = [
    obstacle({ kind: "circle", center: { x: 0, y: 1.59 }, radius: 0.1 }),
  ];
  assert.equal(
    placementIssues(placed({ yawDeg: 90 }), scenario, []).overlaps.length,
    1,
  );
});

test("suggested placement deterministically finds nearest free floor and includes existing instances", () => {
  const scenario = emptyFactory();
  const item = placed({ assetId: "amr-cart" });
  assert.deepEqual(suggestPlacement(item.assetId, scenario, []), {
    x: 0,
    y: 0,
  });
  const others = [placed({ id: "existing", assetId: "cnc-mill" })];
  const point = suggestPlacement(item.assetId, scenario, others);
  assert.deepEqual(point, suggestPlacement(item.assetId, scenario, others));
  assert.equal(point.x, 0);
  assert.equal(Math.abs(point.y), 1.5);
  assert.deepEqual(
    placementIssues({ ...item, position: point }, scenario, others),
    {
      outside: false,
      overlaps: [],
    },
  );
  scenario.equipment = [
    obstacle({ kind: "rect", center: point, width: 1, depth: 1 }),
  ];
  const next = suggestPlacement(item.assetId, scenario, others);
  assert.notDeepEqual(next, point);
  assert.deepEqual(
    placementIssues({ ...item, position: next }, scenario, others),
    {
      outside: false,
      overlaps: [],
    },
  );
});

test("full and undersized factories return an honest fallback for subsequent issue display", () => {
  const scenario = emptyFactory();
  scenario.factory = { center: { x: 0, y: 0 }, width: 3, depth: 3 };
  scenario.equipment = [
    obstacle({ kind: "rect", center: { x: 0, y: 0 }, width: 3, depth: 3 }),
  ];
  const point = suggestPlacement("amr-cart", scenario, []);
  assert.deepEqual(point, { x: 0, y: 0 });
  assert.equal(
    placementIssues(
      placed({ assetId: "amr-cart", position: point }),
      scenario,
      [],
    ).overlaps.length,
    1,
  );
  scenario.factory.width = 1;
  const oversizedPoint = suggestPlacement("cnc-mill", scenario, []);
  assert.equal(
    placementIssues(
      placed({ assetId: "cnc-mill", position: oversizedPoint }),
      scenario,
      [],
    ).outside,
    true,
  );
  assert.equal(findAsset("missing"), undefined);
  assert.throws(() => suggestPlacement("missing", scenario, []));
});

test("scenario JSON roundtrip retains equipment placements, independent robot poses, and reference visibility", () => {
  const scenario = structuredClone(defaultScenario);
  const model = findRobot("fanuc-m20id25")!;
  scenario.placedAssets = [
    placed(),
    placed({
      id: "robot-2",
      assetId: model.id,
      joints: model.joints.map((joint) => joint.homeDeg),
      mountHeight: 0.25,
    }),
  ];
  scenario.showReferenceRobot = false;
  const imported = validateScenario(JSON.parse(JSON.stringify(scenario)));
  assert.equal(imported.valid, true);
  if (!imported.valid) return;
  assert.deepEqual(imported.scenario.placedAssets, scenario.placedAssets);
  assert.equal(imported.scenario.showReferenceRobot, false);
  imported.scenario.placedAssets![1].joints![0] += 1;
  assert.equal(scenario.placedAssets[1].joints![0], model.joints[0].homeDeg);
  const legacy = validateScenario(structuredClone(defaultScenario));
  assert.equal(legacy.valid, true);
  if (legacy.valid) {
    assert.equal(legacy.scenario.placedAssets, undefined);
    assert.equal(legacy.scenario.showReferenceRobot, undefined);
  }
});

test("scenario import rejects invalid optional layout fields without silently stripping them", () => {
  const scenario = structuredClone(defaultScenario);
  for (const invalid of [
    null,
    {},
    [placed({ assetId: "missing" })],
    [placed(), placed()],
  ]) {
    const parsed = validateScenario({ ...scenario, placedAssets: invalid });
    assert.equal(parsed.valid, false);
    assert.ok(parsed.errors.length > 0);
  }
  assert.equal(
    validateScenario({ ...scenario, showReferenceRobot: "false" }).valid,
    false,
  );
  const empty = validateScenario({
    ...scenario,
    placedAssets: [],
    showReferenceRobot: true,
  });
  assert.equal(empty.valid, true);
  if (empty.valid) {
    assert.deepEqual(empty.scenario.placedAssets, []);
    assert.equal(empty.scenario.showReferenceRobot, true);
  }
});
