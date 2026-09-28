export type Vec3 = [number, number, number];
export type RobotJoint = {
  name: string;
  label: string;
  pivot: Vec3;
  axis: Vec3;
  minDeg: number;
  maxDeg: number;
  maxSpeedDeg: number;
  homeDeg: number;
};
export type RobotModel = {
  id: string;
  name: string;
  manufacturer: string;
  category: string;
  description: string;
  reach: number;
  payloadKg: number;
  footprintDiameter: number;
  massKg: number;
  joints: RobotJoint[];
  tcp: Vec3;
  sources: { title: string; url: string }[];
  note: string;
};
export type RobotWaypoint = { id: string; name: string; joints: number[] };
export type RobotProgram = {
  modelId: string;
  joints: number[];
  mode: "sweep" | "transfer" | "teach";
  speed: number;
  showTrail: boolean;
  showWorkspace: boolean;
  waypoints: RobotWaypoint[];
};
export type RobotTelemetry = {
  modelId: string;
  joints: number[];
  tcp: Vec3;
  progress: number;
  elapsed: number;
  duration: number;
  belowFloor: boolean;
};
