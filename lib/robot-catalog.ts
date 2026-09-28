import ur from "./robot-data/ur10e.json";
import abb from "./robot-data/abb-irb1200.json";
import fanuc from "./robot-data/fanuc-m20id25.json";
import type { RobotModel, RobotProgram } from "./robot-types";

export const robotModels = [ur, abb, fanuc] as unknown as RobotModel[];
export const findRobot = (id?: string) => robotModels.find((m) => m.id === id);
export const robotAsset = (
  model: RobotModel,
  name: "robot.glb" | "thumbnail.png" | "scene.blend",
) => `/models/robots/${model.id}/${name}`;

/** A strict boundary for persisted/imported programs; legacy scenes may omit it. */
export function parseRobotProgram(input: unknown): RobotProgram | undefined {
  if (!input || typeof input !== "object") return;
  const p = input as RobotProgram,
    model = findRobot(p.modelId);
  if (!model) return;
  const poseValid = (pose: unknown) =>
    Array.isArray(pose) &&
    pose.length === 6 &&
    pose.every(
      (n, i) =>
        typeof n === "number" &&
        Number.isFinite(n) &&
        n >= model.joints[i].minDeg &&
        n <= model.joints[i].maxDeg,
    );
  if (
    !poseValid(p.joints) ||
    !["sweep", "transfer", "teach"].includes(p.mode) ||
    !Number.isFinite(p.speed) ||
    p.speed < 0.1 ||
    p.speed > 1 ||
    typeof p.showTrail !== "boolean" ||
    typeof p.showWorkspace !== "boolean" ||
    !Array.isArray(p.waypoints) ||
    p.waypoints.length > 12
  )
    return;
  const ids = new Set<string>();
  for (const w of p.waypoints) {
    if (
      !w ||
      typeof w.id !== "string" ||
      !w.id ||
      w.id.length > 80 ||
      ids.has(w.id) ||
      typeof w.name !== "string" ||
      !w.name.trim() ||
      w.name.length > 80 ||
      !poseValid(w.joints)
    )
      return;
    ids.add(w.id);
  }
  return {
    modelId: model.id,
    joints: [...p.joints],
    mode: p.mode,
    speed: p.speed,
    showTrail: p.showTrail,
    showWorkspace: p.showWorkspace,
    waypoints: p.waypoints.map((w) => ({
      id: w.id,
      name: w.name,
      joints: [...w.joints],
    })),
  };
}
