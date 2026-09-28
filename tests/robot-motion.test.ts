import test from "node:test";
import assert from "node:assert/strict";
import {
  robotModels,
  findRobot,
  parseRobotProgram,
} from "../lib/robot-catalog";
import {
  homePose,
  clampPose,
  createProgram,
  forwardKinematics,
  solvePosition,
  buildMotionPlan,
  sampleMotion,
  motionTrail,
  sampleWorkspace,
  robotToFactory,
  factoryToRobot,
} from "../lib/robot-motion";
import type { RobotModel, Vec3 } from "../lib/robot-types";

const close = (actual: number, expected: number, epsilon = 1e-7) =>
  assert.ok(
    Math.abs(actual - expected) <= epsilon,
    `${actual} differs from ${expected} by more than ${epsilon}`,
  );
const finiteBounded = (model: RobotModel, pose: number[]) => {
  assert.equal(pose.length, 6);
  pose.forEach((angle, i) => {
    assert.ok(Number.isFinite(angle));
    assert.ok(
      angle >= model.joints[i].minDeg - 1e-8 &&
        angle <= model.joints[i].maxDeg + 1e-8,
      `${model.id} J${i + 1}: ${angle}`,
    );
  });
};

test("catalog provides three distinct six-axis rigs and home FK reconstructs their reference TCP", () => {
  assert.equal(robotModels.length, 3);
  assert.equal(new Set(robotModels.map((m) => m.id)).size, 3);
  for (const model of robotModels) {
    assert.equal(model.joints.length, 6);
    model.joints.forEach((j) => {
      close(Math.hypot(...j.axis), 1, 1e-6);
      assert.ok(j.minDeg < j.maxDeg && j.maxSpeedDeg > 0);
    });
    finiteBounded(model, homePose(model));
    const tcp = forwardKinematics(model, homePose(model)).tcp.toArray();
    tcp.forEach((n, i) => close(n, model.tcp[i]));
  }
});

// Independent standard-DH oracle: published UR10e nominal link parameters.
// https://www.universal-robots.com/developer/hardware-and-motion/robot-motion-dh-parameters/
// This does not share the production rest-pivot/axis-angle formulation.
type M4 = number[][];
function multiply(a: M4, b: M4): M4 {
  return Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) =>
      a[i].reduce((sum, value, k) => sum + value * b[k][j], 0),
    ),
  );
}
function urNominalTcp(angles: number[]): Vec3 {
  const a = [0, -0.6127, -0.57155, 0, 0, 0];
  const d = [0.1807, 0, 0, 0.17415, 0.11985, 0.11655];
  const alpha = [Math.PI / 2, 0, 0, Math.PI / 2, -Math.PI / 2, 0];
  let transform: M4 = Array.from({ length: 4 }, (_, i) =>
    Array.from({ length: 4 }, (_, j) => +(i === j)),
  );
  angles.forEach((deg, i) => {
    const theta = (deg * Math.PI) / 180,
      c = Math.cos(theta),
      s = Math.sin(theta);
    const ca = Math.cos(alpha[i]),
      sa = Math.sin(alpha[i]);
    transform = multiply(transform, [
      [c, -s * ca, s * sa, a[i] * c],
      [s, c * ca, -c * sa, a[i] * s],
      [0, sa, ca, d[i]],
      [0, 0, 0, 1],
    ]);
  });
  // The authored example gripper's TCP is 155 mm along the tool flange axis.
  return [0, 1, 2].map(
    (i) => transform[i][3] + 0.155 * transform[i][2],
  ) as Vec3;
}

test("UR10e FK agrees with an independent manufacturer-DH calculation across diverse poses", () => {
  const model = findRobot("ur10e")!;
  const poses = [
    [0, 0, 0, 0, 0, 0],
    [180, -75, 50, -65, -90, 0],
    [45, -90, 60, -80, 30, 180],
    [-180, 20, -135, 45, -90, -30],
    [300, -210, 270, -300, 160, -250],
    [-360, 360, -360, 360, -360, 360],
  ];
  for (const pose of poses) {
    const actual = forwardKinematics(model, pose).tcp.toArray();
    const expected = urNominalTcp(pose);
    actual.forEach((n, i) => close(n, expected[i], 2e-7));
  }
});

test("joint input clamps overshoot and replaces missing/non-finite coordinates with home", () => {
  for (const model of robotModels) {
    const pose = clampPose(model, [Infinity, -1e7, 1e7, NaN]);
    finiteBounded(model, pose);
    close(pose[0], model.joints[0].homeDeg);
    close(pose[1], model.joints[1].minDeg);
    close(pose[2], model.joints[2].maxDeg);
    [3, 4, 5].forEach((i) => close(pose[i], model.joints[i].homeDeg));
  }
});

test("position IK reaches forward-generated nearby targets without violating joint limits", () => {
  for (const model of robotModels) {
    const h = homePose(model);
    for (const offset of [
      [18, -5, 8, 12, -10, 5],
      [-15, 7, -6, -9, 8, -10],
    ]) {
      const targetPose = clampPose(
        model,
        h.map((n, i) => n + offset[i]),
      );
      const target = forwardKinematics(model, targetPose).tcp.toArray() as Vec3;
      const solution = solvePosition(model, target, h);
      finiteBounded(model, solution.joints);
      assert.equal(
        solution.reached,
        true,
        `${model.id}: reachable target missed by ${solution.error} m`,
      );
      const residual = forwardKinematics(model, solution.joints).tcp.distanceTo(
        forwardKinematics(model, targetPose).tcp,
      );
      assert.ok(residual < 0.015, `${model.id}: ${residual} m`);
      close(residual, solution.error, 1e-8);
    }
  }
});

test("position IK returns a finite bounded failure for a distant unreachable target", () => {
  for (const model of robotModels) {
    const solution = solvePosition(model, [100, 100, 100]);
    assert.equal(solution.reached, false);
    assert.ok(Number.isFinite(solution.error) && solution.error > 100);
    finiteBounded(model, solution.joints);
  }
});

test("preset and taught cycles join continuously and obey each model's speed limits", () => {
  for (const model of robotModels) {
    for (const mode of ["sweep", "transfer", "teach"] as const) {
      const program = { ...createProgram(model), mode, speed: 1 };
      if (mode === "teach")
        program.waypoints = [
          {
            id: "minimum",
            name: "관절 하한",
            joints: model.joints.map((j) => j.minDeg),
          },
          {
            id: "maximum",
            name: "관절 상한",
            joints: model.joints.map((j) => j.maxDeg),
          },
          { id: "home", name: "홈", joints: homePose(model) },
        ];
      const plan = buildMotionPlan(model, program);
      assert.ok(plan.duration > 0 && Number.isFinite(plan.duration));
      close(
        plan.duration,
        plan.segments.reduce((a, b) => a + b, 0),
      );
      let start = 0;
      plan.segments.forEach((duration, segment) => {
        const atStart = sampleMotion(plan, start);
        atStart.forEach((n, i) => close(n, plan.poses[segment][i], 1e-6));
        const epsilon = 0.0001;
        const before = sampleMotion(plan, start - epsilon),
          after = sampleMotion(plan, start + epsilon);
        before.forEach((n, i) => close(n, after[i], 1e-5));
        for (let sample = 0; sample <= 100; sample++) {
          const time = start + (duration * sample) / 100;
          const pose = sampleMotion(plan, time);
          finiteBounded(model, pose);
          const next = sampleMotion(plan, time + epsilon);
          next.forEach((angle, i) => {
            const degreesPerSecond = Math.abs(angle - pose[i]) / epsilon;
            assert.ok(
              degreesPerSecond <= model.joints[i].maxSpeedDeg + 1e-3,
              `${model.id} ${mode} J${i + 1}: ${degreesPerSecond}°/s`,
            );
          });
        }
        start += duration;
      });
      sampleMotion(plan, 0).forEach((angle, i) =>
        close(angle, sampleMotion(plan, plan.duration)[i]),
      );
      const slow = buildMotionPlan(model, { ...program, speed: 0.25 });
      close(slow.duration, plan.duration * 4);
    }
  }
});

test("a teaching program with fewer than two waypoints holds its edited pose", () => {
  for (const model of robotModels) {
    const program = createProgram(model);
    program.mode = "teach";
    program.joints = clampPose(
      model,
      program.joints.map((n, i) => n + (i === 0 ? 10 : 0)),
    );
    const plan = buildMotionPlan(model, program);
    for (const seconds of [-100, 0, 0.5, 100])
      assert.deepEqual(sampleMotion(plan, seconds), program.joints);
  }
});

test("TCP trail closes and sampled workspaces contain finite above-floor points", () => {
  for (const model of robotModels) {
    const plan = buildMotionPlan(model, createProgram(model));
    const trail = motionTrail(model, plan, 48);
    assert.equal(trail.length, 49);
    trail[0].forEach((n, i) => close(n, trail[48][i]));
    const workspace = sampleWorkspace(model, 100);
    assert.ok(workspace.length > 0 && workspace.length <= 100);
    workspace.forEach((p) => {
      assert.equal(p.length, 3);
      assert.ok(p.every(Number.isFinite) && p[2] >= 0);
    });
  }
});

test("base translation, mounting height and yaw convert targets both ways without drift", () => {
  const point: Vec3 = [0.42, -0.33, 0.87];
  for (const yaw of [-180, -90, 0, 37, 90, 180, 360]) {
    const position = { x: 2.8, y: -1.2 },
      height = 0.45;
    const global = robotToFactory(point, position, yaw, height);
    const restored = factoryToRobot(global, position, yaw, height);
    restored.forEach((n, i) => close(n, point[i]));
  }
  const rotated = robotToFactory([1, 0, 0], { x: 2, y: 3 }, 90, 0.5);
  rotated.forEach((n, i) => close(n, [2, 4, 0.5][i]));
});

test("saved robot programs round-trip while unknown models, duplicate points and illegal angles are rejected", () => {
  for (const model of robotModels) {
    const program = createProgram(model);
    program.waypoints = [{ id: "p1", name: "픽업", joints: homePose(model) }];
    assert.deepEqual(
      parseRobotProgram(JSON.parse(JSON.stringify(program))),
      program,
    );
    assert.equal(
      parseRobotProgram({ ...program, modelId: "unknown" }),
      undefined,
    );
    assert.equal(
      parseRobotProgram({
        ...program,
        joints: [9999, ...program.joints.slice(1)],
      }),
      undefined,
    );
    assert.equal(
      parseRobotProgram({
        ...program,
        waypoints: [...program.waypoints, ...program.waypoints],
      }),
      undefined,
    );
    assert.equal(parseRobotProgram({ ...program, speed: NaN }), undefined);
    assert.equal(parseRobotProgram({ ...program, speed: 1.1 }), undefined);
  }
});
