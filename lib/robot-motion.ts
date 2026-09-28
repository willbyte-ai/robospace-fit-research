import { Matrix4, Vector3 } from "three";
import type {
  RobotModel,
  RobotProgram,
  RobotWaypoint,
  Vec3,
} from "./robot-types";

const RAD = Math.PI / 180;
const clamp = (n: number, lo: number, hi: number) =>
  Math.max(lo, Math.min(hi, n));
export const homePose = (model: RobotModel) =>
  model.joints.map((j) => j.homeDeg);
export const clampPose = (model: RobotModel, pose: number[]) =>
  model.joints.map((j, i) =>
    clamp(Number.isFinite(pose[i]) ? pose[i] : j.homeDeg, j.minDeg, j.maxDeg),
  );
export function createProgram(model: RobotModel): RobotProgram {
  return {
    modelId: model.id,
    joints: homePose(model),
    mode: "sweep",
    speed: 0.5,
    showTrail: true,
    showWorkspace: false,
    waypoints: [],
  };
}

/** Bind pivots and axes are expressed in the same metre/Z-up frame as the Blender rig.
 * Every local reference rotation is identity; only the change from home is applied. */
export function forwardKinematics(model: RobotModel, input: number[]) {
  const pose = clampPose(model, input);
  const transform = new Matrix4();
  const pivots: Vector3[] = [],
    axes: Vector3[] = [];
  let previous = new Vector3();
  model.joints.forEach((joint, i) => {
    const pivot = new Vector3(...joint.pivot);
    transform.multiply(
      new Matrix4().makeTranslation(
        ...(pivot.clone().sub(previous).toArray() as Vec3),
      ),
    );
    pivots.push(new Vector3().setFromMatrixPosition(transform));
    axes.push(new Vector3(...joint.axis).transformDirection(transform));
    transform.multiply(
      new Matrix4().makeRotationAxis(
        new Vector3(...joint.axis).normalize(),
        (pose[i] - joint.homeDeg) * RAD,
      ),
    );
    previous = pivot;
  });
  const tcp = new Vector3(...model.tcp).sub(previous).applyMatrix4(transform);
  return { tcp, pivots, axes, transform };
}

/** Position-only CCD: no claim about tool orientation, obstacles or dynamics. */
export function solvePosition(
  model: RobotModel,
  target: Vec3,
  initial = homePose(model),
) {
  let best = clampPose(model, initial),
    bestError = Infinity;
  const goal = new Vector3(...target);
  const seeds = [
    best,
    homePose(model),
    clampPose(
      model,
      homePose(model).map((n, i) => n + (i === 1 ? 35 : i === 2 ? -45 : 0)),
    ),
  ];
  for (const seed of seeds) {
    const pose = [...seed];
    for (let iteration = 0; iteration < 90; iteration++) {
      for (let i = model.joints.length - 1; i >= 0; i--) {
        const fk = forwardKinematics(model, pose);
        const a = fk.tcp.clone().sub(fk.pivots[i]),
          b = goal.clone().sub(fk.pivots[i]);
        const axis = fk.axes[i];
        a.addScaledVector(axis, -a.dot(axis));
        b.addScaledVector(axis, -b.dot(axis));
        if (a.lengthSq() < 1e-12 || b.lengthSq() < 1e-12) continue;
        a.normalize();
        b.normalize();
        const angle =
          Math.atan2(axis.dot(a.clone().cross(b)), clamp(a.dot(b), -1, 1)) /
          RAD;
        pose[i] = clamp(
          pose[i] + clamp(angle, -22, 22),
          model.joints[i].minDeg,
          model.joints[i].maxDeg,
        );
      }
      const error = forwardKinematics(model, pose).tcp.distanceTo(goal);
      if (error < bestError) {
        bestError = error;
        best = [...pose];
      }
      if (error < 0.004) return { joints: best, error, reached: true };
    }
  }
  return { joints: best, error: bestError, reached: bestError < 0.015 };
}

export function presetWaypoints(
  model: RobotModel,
  mode: RobotProgram["mode"],
  taught: RobotWaypoint[],
): number[][] {
  if (mode === "teach" && taught.length >= 2)
    return taught.map((p) => clampPose(model, p.joints));
  const h = homePose(model);
  const offsets =
    mode === "transfer"
      ? [
          [-45, 8, -12, 0, 8, -20],
          [-45, -12, 8, 0, -8, -20],
          [45, -12, 8, 0, -8, 20],
          [45, 8, -12, 0, 8, 20],
        ]
      : [
          [-70, -12, 18, -28, 15, -40],
          [0, 14, -18, 28, -18, 0],
          [70, -12, 18, -28, 15, 40],
          [0, -20, 5, 28, 8, 0],
        ];
  return offsets.map((offset) =>
    clampPose(
      model,
      h.map((v, i) => v + offset[i]),
    ),
  );
}
export type MotionPlan = {
  poses: number[][];
  segments: number[];
  duration: number;
};
export function buildMotionPlan(
  model: RobotModel,
  program: RobotProgram,
): MotionPlan {
  if (program.mode === "teach" && program.waypoints.length < 2)
    return {
      poses: [clampPose(model, program.joints)],
      segments: [1],
      duration: 1,
    };
  const poses = presetWaypoints(model, program.mode, program.waypoints);
  // Quintic smoothstep has maximum derivative 1.875. Even at 100% playback,
  // every displayed axis stays within the published nominal speed bound.
  const speed = clamp(program.speed, 0.1, 1);
  const segments = poses.map(
    (pose, k) =>
      Math.max(
        2.4,
        ...pose.map(
          (v, i) =>
            (1.875 * Math.abs(poses[(k + 1) % poses.length][i] - v)) /
            model.joints[i].maxSpeedDeg,
        ),
      ) / speed,
  );
  return { poses, segments, duration: segments.reduce((a, b) => a + b, 0) };
}
export function sampleMotion(plan: MotionPlan, seconds: number) {
  let time = ((seconds % plan.duration) + plan.duration) % plan.duration;
  let k = 0;
  while (k < plan.segments.length - 1 && time >= plan.segments[k])
    time -= plan.segments[k++];
  const t = clamp(time / plan.segments[k], 0, 1),
    ease = t * t * t * (10 + t * (-15 + 6 * t));
  return plan.poses[k].map(
    (v, i) => v + (plan.poses[(k + 1) % plan.poses.length][i] - v) * ease,
  );
}
export function motionTrail(
  model: RobotModel,
  plan: MotionPlan,
  count = 200,
): Vec3[] {
  return Array.from(
    { length: count + 1 },
    (_, i) =>
      forwardKinematics(
        model,
        sampleMotion(plan, (plan.duration * i) / count),
      ).tcp.toArray() as Vec3,
  );
}
function halton(index: number, base: number) {
  let f = 1,
    r = 0;
  while (index > 0) {
    f /= base;
    r += f * (index % base);
    index = Math.floor(index / base);
  }
  return r;
}
export function sampleWorkspace(model: RobotModel, count = 800): Vec3[] {
  const primes = [2, 3, 5, 7, 11, 13];
  return Array.from({ length: count }, (_, k) => {
    const pose = model.joints.map(
      (j, i) => j.minDeg + halton(k + 1, primes[i]) * (j.maxDeg - j.minDeg),
    );
    return forwardKinematics(model, pose).tcp.toArray() as Vec3;
  }).filter((p) => p[2] >= 0);
}
export function robotToFactory(
  p: Vec3,
  position: { x: number; y: number },
  yawDeg: number,
  mountHeight: number,
): Vec3 {
  const angle = yawDeg * RAD,
    c = Math.cos(angle),
    s = Math.sin(angle);
  return [
    position.x + p[0] * c - p[1] * s,
    position.y + p[0] * s + p[1] * c,
    p[2] + mountHeight,
  ];
}
export function factoryToRobot(
  p: Vec3,
  position: { x: number; y: number },
  yawDeg: number,
  mountHeight: number,
): Vec3 {
  const angle = -yawDeg * RAD,
    c = Math.cos(angle),
    s = Math.sin(angle),
    x = p[0] - position.x,
    y = p[1] - position.y;
  return [x * c - y * s, x * s + y * c, p[2] - mountHeight];
}
