/** Robospace Fit — explainable concept-stage spatial analysis, never a safety certification. */
import { parseRobotProgram } from "./robot-catalog";
import { parsePlacedAssets, type PlacedAsset } from "./placement";
import type { RobotProgram } from "./robot-types";
export const SCHEMA_VERSION = "1.0" as const;
const EPSILON = 1e-9;
export type Point2 = { x: number; y: number };
export type Rect = {
  kind: "rect";
  center: Point2;
  width: number;
  depth: number;
};
export type Circle = { kind: "circle"; center: Point2; radius: number };
export type Footprint = Rect | Circle;
export type Equipment = {
  id: string;
  name: string;
  category: string;
  footprint: Footprint;
  /** Target equipment still blocks the base, but is an intentional work-envelope overlap. */
  sweepPolicy: "advisory" | "work-target";
  blocksBase: boolean;
};
export type Candidate = {
  id: string;
  name: string;
  position: Point2;
  description?: string;
  yawDeg?: number;
  mountHeight?: number;
};
export type RobotSpec = {
  name: string;
  reach: number;
  footprintDiameter: number;
  safetyBuffer: number;
  /** Informational; this engine does not calculate robot dynamics. */
  payloadKg: number;
};
export type WorkTarget = {
  id: string;
  name: string;
  position: Point2;
  equipmentId?: string;
};
export type Pathway = {
  id: string;
  name: string;
  kind: "worker" | "cart";
  width: number;
  points: Point2[];
};
export type RoiInputs = {
  investment: number;
  workersBefore: number;
  workersAfter: number;
  hoursPerDay: number;
  daysPerMonth: number;
  hourlyWage: number;
  monthlyMaintenance: number;
};
export type Scenario = {
  schemaVersion: typeof SCHEMA_VERSION;
  id: string;
  name: string;
  minimumPathwayWidth?: number;
  factory: { width: number; depth: number; center: Point2 };
  cell: Rect;
  robot: RobotSpec;
  targets: WorkTarget[];
  equipment: Equipment[];
  candidates: Candidate[];
  pathways: Pathway[];
  roi: RoiInputs;
  robotProgram?: RobotProgram;
  placedAssets?: PlacedAsset[];
  showReferenceRobot?: boolean;
};
export type ReachResult = {
  targetId: string;
  name: string;
  distance: number;
  reachable: boolean;
  margin: number;
};
export type CollisionResult = {
  equipmentId: string;
  name: string;
  clearance: number;
};
export type PathwayResult = {
  pathwayId: string;
  name: string;
  kind: "worker" | "cart";
  distance: number;
  clearance: number;
  safetyMargin: number;
  footprintIntersects: boolean;
  safetyIntersects: boolean;
  envelopeIntersects: boolean;
  intersectingSegments: number[];
};
export type Analysis = {
  candidateId: string;
  candidateName: string;
  position: Point2;
  score: number;
  status: "recommended" | "review" | "blocked";
  reach: ReachResult[];
  allTargetsReachable: boolean;
  footprintCollisions: CollisionResult[];
  envelopeAdvisories: CollisionResult[];
  minClearance: number | null;
  nearestObstacle: { id: string; name: string } | null;
  safetyMargin: number | null;
  pathways: PathwayResult[];
  withinFactory: boolean;
  withinCell: boolean;
  recommendations: string[];
  reasons: { label: string; penalty: number }[];
  disclaimer: string;
};
export type RoiResult = {
  monthlyHours: number;
  annualHours: number;
  workersReduced: number;
  monthlyLaborBefore: number;
  monthlyLaborAfter: number;
  annualLaborBefore: number;
  annualLaborAfter: number;
  monthlyGrossSavings: number;
  annualGrossSavings: number;
  monthlyNetSavings: number;
  annualSavings: number;
  paybackMonths: number | null;
  paybackYears: number | null;
  threeYearNetBenefit: number;
  assumptions: string[];
};
export const ANALYSIS_DISCLAIMER =
  "개념 설계용 2D 추정입니다. 높이·자세·가반하중·관절 운동·센서·정지거리·로봇 안전을 검증하지 않으며, 실제 설치 전 전문 엔지니어의 3D 간섭 검토와 위험성 평가가 필요합니다.";

export function distance(a: Point2, b: Point2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
export function pointSegmentDistance(p: Point2, a: Point2, b: Point2): number {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    len2 = dx * dx + dy * dy;
  if (len2 <= EPSILON * EPSILON) return distance(p, a);
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2),
  );
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}
export function pointRectDistance(p: Point2, rect: Rect): number {
  return Math.hypot(
    Math.max(Math.abs(p.x - rect.center.x) - rect.width / 2, 0),
    Math.max(Math.abs(p.y - rect.center.y) - rect.depth / 2, 0),
  );
}
export function signedPointRectDistance(p: Point2, rect: Rect): number {
  const dx = Math.abs(p.x - rect.center.x) - rect.width / 2;
  const dy = Math.abs(p.y - rect.center.y) - rect.depth / 2;
  return (
    Math.hypot(Math.max(dx, 0), Math.max(dy, 0)) + Math.min(Math.max(dx, dy), 0)
  );
}
export function signedPointFootprintDistance(
  p: Point2,
  footprint: Footprint,
): number {
  return footprint.kind === "circle"
    ? distance(p, footprint.center) - footprint.radius
    : signedPointRectDistance(p, footprint);
}
export function circleIntersectsRect(
  center: Point2,
  radius: number,
  rect: Rect,
): boolean {
  return pointRectDistance(center, rect) <= radius + EPSILON;
}
/** Inclusive tangency. A zero-length segment intersects if its point lies in the circle. */
export function segmentIntersectsCircle(
  a: Point2,
  b: Point2,
  center: Point2,
  radius: number,
): boolean {
  return pointSegmentDistance(center, a, b) <= radius + EPSILON;
}
/** Circle boundary intersections; a tangent has one result. Points wholly inside have none. */
export function segmentCircleIntersections(
  a: Point2,
  b: Point2,
  center: Point2,
  radius: number,
): Point2[] {
  const dx = b.x - a.x,
    dy = b.y - a.y,
    fx = a.x - center.x,
    fy = a.y - center.y;
  const A = dx * dx + dy * dy;
  if (A <= EPSILON * EPSILON)
    return Math.abs(distance(a, center) - radius) <= EPSILON ? [{ ...a }] : [];
  const B = 2 * (fx * dx + fy * dy),
    C = fx * fx + fy * fy - radius * radius;
  const discriminant = B * B - 4 * A * C;
  if (discriminant < -EPSILON) return [];
  const root = Math.sqrt(Math.max(0, discriminant));
  const ts =
    root <= EPSILON
      ? [-B / (2 * A)]
      : [(-B - root) / (2 * A), (-B + root) / (2 * A)];
  return ts
    .filter((t) => t >= -EPSILON && t <= 1 + EPSILON)
    .map((t) => ({
      x: a.x + Math.min(1, Math.max(0, t)) * dx,
      y: a.y + Math.min(1, Math.max(0, t)) * dy,
    }));
}
/** Slab clipping, including parallel segments and tangencies. */
export function segmentIntersectsRect(
  a: Point2,
  b: Point2,
  rect: Rect,
): boolean {
  let low = 0,
    high = 1;
  const axes: [number, number, number, number][] = [
    [
      a.x,
      b.x - a.x,
      rect.center.x - rect.width / 2,
      rect.center.x + rect.width / 2,
    ],
    [
      a.y,
      b.y - a.y,
      rect.center.y - rect.depth / 2,
      rect.center.y + rect.depth / 2,
    ],
  ];
  for (const [origin, delta, min, max] of axes) {
    if (Math.abs(delta) <= EPSILON) {
      if (origin < min - EPSILON || origin > max + EPSILON) return false;
    } else {
      let t1 = (min - origin) / delta,
        t2 = (max - origin) / delta;
      if (t1 > t2) [t1, t2] = [t2, t1];
      low = Math.max(low, t1);
      high = Math.min(high, t2);
      if (low > high + EPSILON) return false;
    }
  }
  return true;
}
/** Empty routes are invalid scenario input; utility returns Infinity for an empty route. */
export function polylineDistance(p: Point2, points: readonly Point2[]): number {
  if (!points.length) return Infinity;
  if (points.length === 1) return distance(p, points[0]);
  let min = Infinity;
  for (let i = 1; i < points.length; i++)
    min = Math.min(min, pointSegmentDistance(p, points[i - 1], points[i]));
  return min;
}
function circleWithinRect(p: Point2, radius: number, rect: Rect): boolean {
  return (
    Math.abs(p.x - rect.center.x) + radius <= rect.width / 2 + EPSILON &&
    Math.abs(p.y - rect.center.y) + radius <= rect.depth / 2 + EPSILON
  );
}
export const geometry = {
  distance,
  pointSegmentDistance,
  pointRectDistance,
  signedPointRectDistance,
  signedPointFootprintDistance,
  circleIntersectsRect,
  segmentIntersectsCircle,
  segmentCircleIntersections,
  segmentIntersectsRect,
  polylineDistance,
  segmentIntersection,
  segmentSegmentDistance,
  segmentRectDistance,
  segmentFootprintDistance,
  sweptSegmentIntersectsRect,
};

export function analyzeCandidate(
  scenario: Scenario,
  candidate: Candidate,
): Analysis {
  const { robot } = scenario,
    radius = robot.footprintDiameter / 2,
    position = candidate.position;
  const reach = scenario.targets.map((target) => {
    const d = distance(position, target.position);
    return {
      targetId: target.id,
      name: target.name,
      distance: d,
      reachable: d <= robot.reach + EPSILON,
      margin: robot.reach - d,
    };
  });
  const obstacles = scenario.equipment
    .filter((item) => item.blocksBase)
    .map((item) => ({
      equipmentId: item.id,
      name: item.name,
      clearance:
        signedPointFootprintDistance(position, item.footprint) - radius,
    }))
    .sort((a, b) => a.clearance - b.clearance);
  const footprintCollisions = obstacles.filter(
    (item) => item.clearance <= EPSILON,
  );
  const envelopeAdvisories = scenario.equipment
    .filter((item) => item.sweepPolicy === "advisory")
    .map((item) => ({
      equipmentId: item.id,
      name: item.name,
      clearance:
        signedPointFootprintDistance(position, item.footprint) - robot.reach,
    }))
    .filter((item) => item.clearance <= EPSILON);
  const pathways = scenario.pathways.map((path) => {
    const d = polylineDistance(position, path.points),
      clearance = d - path.width / 2 - radius;
    const envelopeRadius = robot.reach + robot.safetyBuffer + path.width / 2;
    const intersectingSegments: number[] = [];
    for (let i = 1; i < path.points.length; i++)
      if (
        segmentIntersectsCircle(
          path.points[i - 1],
          path.points[i],
          position,
          envelopeRadius,
        )
      )
        intersectingSegments.push(i - 1);
    return {
      pathwayId: path.id,
      name: path.name,
      kind: path.kind,
      distance: d,
      clearance,
      safetyMargin: clearance - robot.safetyBuffer,
      footprintIntersects: clearance <= EPSILON,
      safetyIntersects: clearance - robot.safetyBuffer <= EPSILON,
      envelopeIntersects: intersectingSegments.length > 0,
      intersectingSegments,
    };
  });
  const withinFactory = circleWithinRect(position, radius, {
    kind: "rect",
    ...scenario.factory,
  });
  const withinCell = circleWithinRect(position, radius, scenario.cell);
  const minClearance = obstacles[0]?.clearance ?? null;
  const safetyMargin =
    minClearance === null ? null : minClearance - robot.safetyBuffer;
  const reasons: Analysis["reasons"] = [];
  const recommend: string[] = [];
  if (footprintCollisions.length) {
    reasons.push({
      label: "베이스와 설비 외곽의 겹침",
      penalty: Math.min(70, footprintCollisions.length * 55),
    });
    recommend.push(
      `${footprintCollisions.map((item) => item.name).join(", ")}: 베이스가 겹칩니다. 설치 위치를 이동하세요.`,
    );
  }
  const missed = reach.filter((item) => !item.reachable);
  if (missed.length) {
    reasons.push({
      label: `작업점 ${missed.length}개 도달 범위 밖`,
      penalty: Math.min(40, missed.length * 20),
    });
    recommend.push(
      `${missed.map((item) => `${item.name} ${Math.abs(item.margin).toFixed(2)}m`).join(", ")} 부족: 로봇 위치 또는 도달 반경을 조정하세요.`,
    );
  }
  if (!withinFactory) {
    reasons.push({ label: "공장 외곽을 벗어난 베이스", penalty: 70 });
    recommend.push("공장 경계 안쪽으로 베이스를 이동하세요.");
  }
  if (!withinCell) {
    reasons.push({ label: "검토 셀 밖 설치", penalty: 10 });
    recommend.push("검토 셀 안에서 설치 위치를 검토하세요.");
  }
  if (
    safetyMargin !== null &&
    safetyMargin < -EPSILON &&
    !footprintCollisions.length
  ) {
    reasons.push({ label: "설정한 설비 이격 여유 부족", penalty: 15 });
    recommend.push(
      `가장 가까운 설비와 ${Math.abs(safetyMargin).toFixed(2)}m 추가 이격이 필요합니다.`,
    );
  }
  if (envelopeAdvisories.length) {
    reasons.push({
      label: "비작업 설비와 작업 포락선 겹침",
      penalty: Math.min(15, envelopeAdvisories.length * 5),
    });
    recommend.push(
      "작업 포락선과 주변 설비가 겹칩니다. 실제 관절 궤적과 높이별 간섭을 검토하세요.",
    );
  }
  const pathwayBase = pathways.filter((item) => item.footprintIntersects);
  const pathwaySafety = pathways.filter(
    (item) => item.safetyIntersects && !item.footprintIntersects,
  );
  const pathwayEnvelope = pathways.filter((item) => item.envelopeIntersects);
  if (pathwayBase.length)
    reasons.push({ label: "통로와 베이스 겹침", penalty: 55 });
  else if (pathwaySafety.length)
    reasons.push({ label: "통로 이격 여유 부족", penalty: 15 });
  else if (pathwayEnvelope.length)
    reasons.push({ label: "작업 포락선과 통로 겹침", penalty: 10 });
  if (pathwayEnvelope.length)
    recommend.push(
      `${pathwayEnvelope.map((item) => item.name).join(", ")}: 포락선이 겹칩니다. 동선 분리와 방호 설계를 검토하세요.`,
    );
  const edgeReach = reach.some(
    (item) => item.reachable && item.margin < 0.15 - EPSILON,
  );
  if (edgeReach) {
    reasons.push({ label: "작업점 도달 여유 0.15m 미만", penalty: 5 });
    recommend.push(
      "작업점이 최대 도달 범위에 가깝습니다. 툴 길이와 자세 제한을 확인하세요.",
    );
  }
  const blocked =
    footprintCollisions.length > 0 || !withinFactory || pathwayBase.length > 0;
  const review =
    missed.length > 0 ||
    !withinCell ||
    (safetyMargin !== null && safetyMargin < -EPSILON) ||
    envelopeAdvisories.length > 0 ||
    pathwayEnvelope.length > 0 ||
    edgeReach;
  if (!recommend.length)
    recommend.push(
      "평면 기준 배치 조건을 충족합니다. 실제 관절 궤적, 툴 간섭, 방호 및 정지거리 검증을 진행하세요.",
    );
  return {
    candidateId: candidate.id,
    candidateName: candidate.name,
    position: { ...position },
    score: Math.max(
      0,
      Math.min(
        100,
        Math.round(100 - reasons.reduce((sum, item) => sum + item.penalty, 0)),
      ),
    ),
    status: blocked ? "blocked" : review ? "review" : "recommended",
    reach,
    allTargetsReachable: missed.length === 0,
    footprintCollisions,
    envelopeAdvisories,
    minClearance,
    nearestObstacle: obstacles[0]
      ? { id: obstacles[0].equipmentId, name: obstacles[0].name }
      : null,
    safetyMargin,
    pathways,
    withinFactory,
    withinCell,
    recommendations: recommend,
    reasons,
    disclaimer: ANALYSIS_DISCLAIMER,
  };
}
export function analyzeAll(scenario: Scenario): Analysis[] {
  return scenario.candidates.map((candidate) =>
    analyzeCandidate(scenario, candidate),
  );
}
export function computeRoi(inputs: RoiInputs): RoiResult {
  const errors: string[] = [];
  const roi = readRoi(inputs, "roi", errors);
  if (!roi || errors.length) throw new RangeError(errors.join("; "));
  const monthlyHours = roi.hoursPerDay * roi.daysPerMonth;
  const annualHours = monthlyHours * 12;
  const workersReduced = roi.workersBefore - roi.workersAfter;
  const monthlyLaborBefore = roi.workersBefore * monthlyHours * roi.hourlyWage;
  const monthlyLaborAfter = roi.workersAfter * monthlyHours * roi.hourlyWage;
  const monthlyGrossSavings = monthlyLaborBefore - monthlyLaborAfter;
  const monthlyNetSavings = monthlyGrossSavings - roi.monthlyMaintenance;
  const annualSavings = monthlyNetSavings * 12;
  const paybackMonths =
    monthlyNetSavings > 0 ? roi.investment / monthlyNetSavings : null;
  return {
    monthlyHours,
    annualHours,
    workersReduced,
    monthlyLaborBefore,
    monthlyLaborAfter,
    annualLaborBefore: monthlyLaborBefore * 12,
    annualLaborAfter: monthlyLaborAfter * 12,
    monthlyGrossSavings,
    annualGrossSavings: monthlyGrossSavings * 12,
    monthlyNetSavings,
    annualSavings,
    paybackMonths,
    paybackYears: paybackMonths === null ? null : paybackMonths / 12,
    threeYearNetBenefit: annualSavings * 3 - roi.investment,
    assumptions: [
      "월 근로시간 = 일 근로시간 × 월 근무일수",
      "연간 순절감 = (감소 인원 × 월 근로시간 × 시간당 인건비 − 월 유지비) × 12",
      "단순 회수기간이며 세금, 금융비용, 감가상각, 가동률 변동, 생산량 증가 효과는 제외",
    ],
  };
}

const rect = (x: number, y: number, width: number, depth: number): Rect => ({
  kind: "rect",
  center: { x, y },
  width,
  depth,
});
export const defaultScenario: Scenario = {
  schemaVersion: SCHEMA_VERSION,
  id: "metalworks-pick-place-01",
  name: "정밀 금속가공 공장 · CNC 후공정 이송 셀",
  factory: { width: 24, depth: 18, center: { x: 0, y: 0 } },
  cell: rect(1.6, 0, 6.4, 6),
  robot: {
    name: "R-1850 · 6축 산업용 로봇 (검토용 가상 모델)",
    reach: 1.85,
    footprintDiameter: 0.6,
    safetyBuffer: 0.45,
    payloadKg: 20,
  },
  targets: [
    {
      id: "pick",
      name: "소재 픽업",
      position: { x: -0.8, y: 0 },
      equipmentId: "infeed",
    },
    {
      id: "place",
      name: "검사 지그 적재",
      position: { x: 2, y: 0.5 },
      equipmentId: "inspection-jig",
    },
  ],
  equipment: [
    {
      id: "infeed",
      name: "소재 인피드 컨베이어",
      category: "conveyor",
      footprint: rect(-0.8, 0, 0.75, 1.2),
      sweepPolicy: "work-target",
      blocksBase: true,
    },
    {
      id: "inspection-jig",
      name: "비전 검사 지그",
      category: "workstation",
      footprint: rect(2, 0.5, 0.8, 0.8),
      sweepPolicy: "work-target",
      blocksBase: true,
    },
    {
      id: "cell-cabinet",
      name: "셀 제어반",
      category: "cabinet",
      footprint: rect(-1.5, -2.15, 0.8, 1.1),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "cnc-01",
      name: "CNC 머시닝센터 01",
      category: "cnc",
      footprint: rect(-7.4, 1.2, 3.2, 3.1),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "cnc-02",
      name: "CNC 머시닝센터 02",
      category: "cnc",
      footprint: rect(-7.4, 5.6, 3.2, 3.1),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "tool-bench",
      name: "공구 프리셋 작업대",
      category: "workbench",
      footprint: rect(-3.8, 5.5, 1.8, 0.8),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "outfeed",
      name: "완제품 아웃피드",
      category: "conveyor",
      footprint: rect(3.9, 1.4, 0.9, 2.4),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "pallet-a",
      name: "소재 팔레트 A",
      category: "pallet",
      footprint: rect(-7.7, -6.4, 1.2, 1.0),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "pallet-b",
      name: "소재 팔레트 B",
      category: "pallet",
      footprint: rect(-5.9, -6.4, 1.2, 1.0),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "rack-01",
      name: "완제품 적재 랙",
      category: "rack",
      footprint: rect(9.8, 3.6, 1.8, 5.8),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "compressor",
      name: "에어 컴프레서",
      category: "utility",
      footprint: rect(9.7, -6.7, 1.8, 1.5),
      sweepPolicy: "advisory",
      blocksBase: true,
    },
    {
      id: "air-tank",
      name: "압축공기 리시버 탱크",
      category: "utility",
      footprint: { kind: "circle", center: { x: 7.9, y: -6.7 }, radius: 0.55 },
      sweepPolicy: "advisory",
      blocksBase: true,
    },
  ],
  candidates: [
    {
      id: "A",
      name: "후보 A · 균형 배치",
      position: { x: 0.8, y: 0 },
      description: "픽업과 검사 지그 사이, 기존 작업 동선 유지",
    },
    {
      id: "B",
      name: "후보 B · 동선 인접",
      position: { x: 1.9, y: -1.5 },
      description: "작업점 도달 범위와 남측 작업자 통로 간섭 검토",
    },
    {
      id: "C",
      name: "후보 C · 제어반 간섭",
      position: { x: -1.2, y: -2.2 },
      description: "제어반과 베이스가 겹치는 부적합 위치",
    },
  ],
  pathways: [
    {
      id: "worker",
      name: "작업자 보행 동선",
      kind: "worker",
      width: 1.2,
      points: [
        { x: -8, y: -4 },
        { x: -2, y: -4 },
        { x: 3, y: -4 },
        { x: 8, y: -4 },
        { x: 8, y: 4 },
      ],
    },
    {
      id: "cart",
      name: "물류 카트 동선",
      kind: "cart",
      width: 1.0,
      points: [
        { x: 6, y: 6 },
        { x: 6, y: -4 },
        { x: -4, y: -4 },
      ],
    },
  ],
  roi: {
    investment: 65000000,
    workersBefore: 2,
    workersAfter: 1,
    hoursPerDay: 8,
    daysPerMonth: 22,
    hourlyWage: 22000,
    monthlyMaintenance: 350000,
  },
};

// Import boundary: reject non-finite/range-invalid values, oversized arrays, duplicates and invalid references.
type Obj = Record<string, unknown>;
function isObj(value: unknown): value is Obj {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function object(value: unknown, path: string, errors: string[]): Obj | null {
  if (isObj(value)) return value;
  errors.push(`${path}: 객체여야 합니다`);
  return null;
}
function str(
  value: unknown,
  path: string,
  errors: string[],
  max = 160,
): string {
  if (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= max
  )
    return value;
  errors.push(`${path}: 1~${max}자 문자열이어야 합니다`);
  return "";
}
function num(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: string[],
): number {
  if (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= min &&
    value <= max
  )
    return value;
  errors.push(`${path}: ${min}~${max} 범위의 유한한 숫자여야 합니다`);
  return min;
}
function bool(value: unknown, path: string, errors: string[]): boolean {
  if (typeof value === "boolean") return value;
  errors.push(`${path}: 불리언이어야 합니다`);
  return false;
}
function point(value: unknown, path: string, errors: string[]): Point2 {
  const v = object(value, path, errors);
  return {
    x: num(v?.x, `${path}.x`, -1000, 1000, errors),
    y: num(v?.y, `${path}.y`, -1000, 1000, errors),
  };
}
function array(
  value: unknown,
  path: string,
  min: number,
  max: number,
  errors: string[],
): unknown[] {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    errors.push(`${path}: ${min}~${max}개 배열이어야 합니다`);
    return [];
  }
  return value;
}
function readFootprint(
  value: unknown,
  path: string,
  errors: string[],
): Footprint {
  const v = object(value, path, errors),
    center = point(v?.center, `${path}.center`, errors);
  if (v?.kind === "circle")
    return {
      kind: "circle",
      center,
      radius: num(v.radius, `${path}.radius`, 0.01, 100, errors),
    };
  if (v?.kind !== "rect")
    errors.push(`${path}.kind: rect 또는 circle이어야 합니다`);
  return {
    kind: "rect",
    center,
    width: num(v?.width, `${path}.width`, 0.01, 1000, errors),
    depth: num(v?.depth, `${path}.depth`, 0.01, 1000, errors),
  };
}
function readRoi(
  value: unknown,
  path: string,
  errors: string[],
): RoiInputs | null {
  const v = object(value, path, errors);
  if (!v) return null;
  return {
    investment: num(v.investment, `${path}.investment`, 0, 1e12, errors),
    workersBefore: num(
      v.workersBefore,
      `${path}.workersBefore`,
      0,
      1000,
      errors,
    ),
    workersAfter: num(v.workersAfter, `${path}.workersAfter`, 0, 1000, errors),
    hoursPerDay: num(v.hoursPerDay, `${path}.hoursPerDay`, 0, 24, errors),
    daysPerMonth: num(v.daysPerMonth, `${path}.daysPerMonth`, 0, 31, errors),
    hourlyWage: num(v.hourlyWage, `${path}.hourlyWage`, 0, 1e7, errors),
    monthlyMaintenance: num(
      v.monthlyMaintenance,
      `${path}.monthlyMaintenance`,
      0,
      1e12,
      errors,
    ),
  };
}
export type ValidationResult =
  | { valid: true; scenario: Scenario; errors: [] }
  | { valid: false; errors: string[]; scenario?: never };
export function validateScenario(input: unknown): ValidationResult {
  const errors: string[] = [],
    v = object(input, "scenario", errors);
  if (!v) return { valid: false, errors };
  if (v.schemaVersion !== SCHEMA_VERSION)
    errors.push(`schemaVersion: 지원 버전은 ${SCHEMA_VERSION}입니다`);
  const f = object(v.factory, "factory", errors),
    robot = object(v.robot, "robot", errors);
  const cell = readFootprint(v.cell, "cell", errors);
  if (cell.kind !== "rect") errors.push("cell: 직사각형이어야 합니다");
  const equipment = array(v.equipment, "equipment", 0, 200, errors).map(
    (item, i): Equipment => {
      const path = `equipment[${i}]`,
        o = object(item, path, errors);
      const sweepPolicy = o?.sweepPolicy;
      if (sweepPolicy !== "advisory" && sweepPolicy !== "work-target")
        errors.push(
          `${path}.sweepPolicy: advisory 또는 work-target이어야 합니다`,
        );
      return {
        id: str(o?.id, `${path}.id`, errors, 80),
        name: str(o?.name, `${path}.name`, errors),
        category: str(o?.category, `${path}.category`, errors, 80),
        footprint: readFootprint(o?.footprint, `${path}.footprint`, errors),
        sweepPolicy: sweepPolicy === "work-target" ? sweepPolicy : "advisory",
        blocksBase: bool(o?.blocksBase, `${path}.blocksBase`, errors),
      };
    },
  );
  const targets = array(v.targets, "targets", 1, 30, errors).map(
    (item, i): WorkTarget => {
      const path = `targets[${i}]`,
        o = object(item, path, errors);
      return {
        id: str(o?.id, `${path}.id`, errors, 80),
        name: str(o?.name, `${path}.name`, errors),
        position: point(o?.position, `${path}.position`, errors),
        ...(o?.equipmentId !== undefined
          ? {
              equipmentId: str(
                o.equipmentId,
                `${path}.equipmentId`,
                errors,
                80,
              ),
            }
          : {}),
      };
    },
  );
  const candidates = array(v.candidates, "candidates", 1, 100, errors).map(
    (item, i): Candidate => {
      const path = `candidates[${i}]`,
        o = object(item, path, errors);
      return {
        id: str(o?.id, `${path}.id`, errors, 80),
        name: str(o?.name, `${path}.name`, errors),
        position: point(o?.position, `${path}.position`, errors),
        ...(o?.yawDeg !== undefined
          ? { yawDeg: num(o.yawDeg, `${path}.yawDeg`, -180, 180, errors) }
          : {}),
        ...(o?.mountHeight !== undefined
          ? {
              mountHeight: num(
                o.mountHeight,
                `${path}.mountHeight`,
                0,
                1.5,
                errors,
              ),
            }
          : {}),
        ...(o?.description !== undefined
          ? {
              description: str(
                o.description,
                `${path}.description`,
                errors,
                1000,
              ),
            }
          : {}),
      };
    },
  );
  const pathways = array(v.pathways, "pathways", 0, 20, errors).map(
    (item, i): Pathway => {
      const path = `pathways[${i}]`,
        o = object(item, path, errors);
      if (o?.kind !== "worker" && o?.kind !== "cart")
        errors.push(`${path}.kind: worker 또는 cart여야 합니다`);
      return {
        id: str(o?.id, `${path}.id`, errors, 80),
        name: str(o?.name, `${path}.name`, errors),
        kind: o?.kind === "cart" ? "cart" : "worker",
        width: num(o?.width, `${path}.width`, 0.1, 20, errors),
        points: array(o?.points, `${path}.points`, 2, 200, errors).map((p, j) =>
          point(p, `${path}.points[${j}]`, errors),
        ),
      };
    },
  );
  for (const [label, items] of [
    ["equipment", equipment],
    ["targets", targets],
    ["candidates", candidates],
    ["pathways", pathways],
  ] as const) {
    const ids = new Set<string>();
    for (const item of items) {
      if (ids.has(item.id)) errors.push(`${label}: 중복 ID ${item.id}`);
      ids.add(item.id);
    }
  }
  const equipmentIds = new Set(equipment.map((item) => item.id));
  for (const target of targets)
    if (target.equipmentId && !equipmentIds.has(target.equipmentId))
      errors.push(`targets.${target.id}.equipmentId: 존재하지 않는 설비입니다`);
  const roi = readRoi(v.roi, "roi", errors);
  const robotProgram =
    v.robotProgram === undefined
      ? undefined
      : parseRobotProgram(v.robotProgram);
  if (v.robotProgram !== undefined && !robotProgram)
    errors.push(
      "robotProgram: 지원하는 로봇과 유효한 관절·경로 설정이 필요합니다",
    );
  let placedAssets: PlacedAsset[] | undefined;
  if (v.placedAssets !== undefined) {
    try {
      placedAssets = parsePlacedAssets(v.placedAssets);
    } catch (e) {
      errors.push(
        e instanceof Error ? e.message : "배치 데이터가 올바르지 않습니다",
      );
    }
  }
  if (
    v.showReferenceRobot !== undefined &&
    typeof v.showReferenceRobot !== "boolean"
  )
    errors.push("showReferenceRobot: boolean 값이 필요합니다");
  const scenario: Scenario = {
    schemaVersion: SCHEMA_VERSION,
    id: str(v.id, "id", errors, 80),
    name: str(v.name, "name", errors),
    factory: {
      width: num(f?.width, "factory.width", 1, 1000, errors),
      depth: num(f?.depth, "factory.depth", 1, 1000, errors),
      center: point(f?.center, "factory.center", errors),
    },
    cell: cell as Rect,
    robot: {
      name: str(robot?.name, "robot.name", errors),
      reach: num(robot?.reach, "robot.reach", 0.1, 20, errors),
      footprintDiameter: num(
        robot?.footprintDiameter,
        "robot.footprintDiameter",
        0.1,
        10,
        errors,
      ),
      safetyBuffer: num(
        robot?.safetyBuffer,
        "robot.safetyBuffer",
        0,
        10,
        errors,
      ),
      payloadKg: num(robot?.payloadKg, "robot.payloadKg", 0.1, 1000, errors),
    },
    equipment,
    targets,
    candidates,
    pathways,
    roi: roi as RoiInputs,
    ...(robotProgram ? { robotProgram } : {}),
    ...(placedAssets ? { placedAssets } : {}),
    ...(typeof v.showReferenceRobot === "boolean"
      ? { showReferenceRobot: v.showReferenceRobot }
      : {}),
    minimumPathwayWidth:
      v.minimumPathwayWidth === undefined
        ? 1.2
        : num(v.minimumPathwayWidth, "minimumPathwayWidth", 0.1, 20, errors),
  };
  return errors.length
    ? { valid: false, errors }
    : { valid: true, scenario, errors: [] };
}

export type SegmentIntersection =
  | { kind: "point"; point: Point2 }
  | { kind: "overlap"; start: Point2; end: Point2 };
/** Finite segment intersection including endpoints, collinear overlap and degenerate segments. */
export function segmentIntersection(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
): SegmentIntersection | null {
  const r = { x: b.x - a.x, y: b.y - a.y },
    s = { x: d.x - c.x, y: d.y - c.y };
  const rr = r.x * r.x + r.y * r.y,
    ss = s.x * s.x + s.y * s.y;
  if (rr <= EPSILON * EPSILON)
    return pointSegmentDistance(a, c, d) <= EPSILON
      ? { kind: "point", point: { ...a } }
      : null;
  if (ss <= EPSILON * EPSILON)
    return pointSegmentDistance(c, a, b) <= EPSILON
      ? { kind: "point", point: { ...c } }
      : null;
  const q = { x: c.x - a.x, y: c.y - a.y },
    cross = r.x * s.y - r.y * s.x;
  if (Math.abs(cross) <= EPSILON) {
    if (Math.abs(q.x * r.y - q.y * r.x) > EPSILON) return null;
    const t0 = (q.x * r.x + q.y * r.y) / rr,
      t1 = t0 + (s.x * r.x + s.y * r.y) / rr;
    const low = Math.max(0, Math.min(t0, t1)),
      high = Math.min(1, Math.max(t0, t1));
    if (low > high + EPSILON) return null;
    const start = { x: a.x + low * r.x, y: a.y + low * r.y };
    if (high - low <= EPSILON) return { kind: "point", point: start };
    return {
      kind: "overlap",
      start,
      end: { x: a.x + high * r.x, y: a.y + high * r.y },
    };
  }
  const t = (q.x * s.y - q.y * s.x) / cross,
    u = (q.x * r.y - q.y * r.x) / cross;
  if (t < -EPSILON || t > 1 + EPSILON || u < -EPSILON || u > 1 + EPSILON)
    return null;
  const clamped = Math.min(1, Math.max(0, t));
  return {
    kind: "point",
    point: { x: a.x + clamped * r.x, y: a.y + clamped * r.y },
  };
}
export function segmentSegmentDistance(
  a: Point2,
  b: Point2,
  c: Point2,
  d: Point2,
): number {
  if (segmentIntersection(a, b, c, d)) return 0;
  return Math.min(
    pointSegmentDistance(a, c, d),
    pointSegmentDistance(b, c, d),
    pointSegmentDistance(c, a, b),
    pointSegmentDistance(d, a, b),
  );
}
/** Exact Euclidean segment-to-AABB distance. Unlike axis-inflation, corners remain round. */
export function segmentRectDistance(a: Point2, b: Point2, rect: Rect): number {
  if (segmentIntersectsRect(a, b, rect)) return 0;
  const left = rect.center.x - rect.width / 2,
    right = rect.center.x + rect.width / 2;
  const bottom = rect.center.y - rect.depth / 2,
    top = rect.center.y + rect.depth / 2;
  return Math.min(
    pointRectDistance(a, rect),
    pointRectDistance(b, rect),
    pointSegmentDistance({ x: left, y: bottom }, a, b),
    pointSegmentDistance({ x: left, y: top }, a, b),
    pointSegmentDistance({ x: right, y: bottom }, a, b),
    pointSegmentDistance({ x: right, y: top }, a, b),
  );
}
export function segmentFootprintDistance(
  a: Point2,
  b: Point2,
  footprint: Footprint,
): number {
  return footprint.kind === "rect"
    ? segmentRectDistance(a, b, footprint)
    : Math.max(
        0,
        pointSegmentDistance(footprint.center, a, b) - footprint.radius,
      );
}
export function sweptSegmentIntersectsRect(
  a: Point2,
  b: Point2,
  radius: number,
  rect: Rect,
): boolean {
  return segmentRectDistance(a, b, rect) <= radius + EPSILON;
}
export type RouteObstacleIntersection = {
  equipmentId: string;
  name: string;
  centerlineDistance: number;
  /** Signed clearance of the requested corridor edge; non-positive means overlap/tangency. */
  clearance: number;
  segmentIndices: number[];
};
export type RouteBottleneck = {
  segmentIndex: number;
  start: Point2;
  end: Point2;
  /** Width of the obstacle-free strip centred on this segment, capped by requested route width. */
  centeredClearWidth: number;
  obstacleIds: string[];
  note: string;
};
export type RouteAudit = {
  pathwayId: string;
  name: string;
  kind: "worker" | "cart";
  width: number;
  minimumWidth: number;
  widthDeficit: number;
  meetsMinimumWidth: boolean;
  length: number;
  withinFactory: boolean;
  /** Minimum signed gap between corridor edge and blocking equipment; null if none. */
  minClearance: number | null;
  minCenteredClearWidth: number;
  obstacleIntersections: RouteObstacleIntersection[];
  bottlenecks: RouteBottleneck[];
  crossingIds: string[];
  status: "clear" | "review" | "obstructed";
  notes: string[];
};
export type RouteCrossing = {
  id: string;
  workerPathwayId: string;
  workerName: string;
  cartPathwayId: string;
  cartName: string;
  centerlineDistance: number;
  corridorClearance: number;
  /** shared = collinear overlap; crossing = centreline touch/cross; proximity = widths overlap only. */
  kind: "shared" | "crossing" | "proximity";
  centerlinesIntersect: boolean;
  segmentPairs: {
    workerSegment: number;
    cartSegment: number;
    intersection: SegmentIntersection | null;
  }[];
  segmentPairCount: number;
  detailsTruncated: boolean;
  note: string;
};
export type PathwayAnalysis = {
  minimumWidth: number;
  routes: RouteAudit[];
  crossings: RouteCrossing[];
  obstructedCount: number;
  reviewCount: number;
  notes: string[];
  disclaimer: string;
};
/**
 * Inspect static equipment occupancy and worker/cart route interactions.
 * minimumWidth is an editable planning assumption, NOT a legal or certified safety standard.
 * Scenario must be validated at the external boundary, as for analyzeCandidate.
 */
export function analyzePathways(
  scenario: Scenario,
  minimumWidth = 1.2,
): PathwayAnalysis {
  if (!Number.isFinite(minimumWidth) || minimumWidth < 0.1 || minimumWidth > 20)
    throw new RangeError("minimumWidth: 0.1~20m 범위의 유한한 숫자여야 합니다");
  const blocking = scenario.equipment.filter((item) => item.blocksBase);
  const factory: Rect = { kind: "rect", ...scenario.factory };
  const routes: RouteAudit[] = scenario.pathways.map((path) => {
    const obstacleMap = new Map<string, RouteObstacleIntersection>();
    const bottlenecks: RouteBottleneck[] = [];
    let minDistance = Infinity,
      length = 0,
      minCenteredClearWidth = path.width;
    for (let i = 1; i < path.points.length; i++) {
      const a = path.points[i - 1],
        b = path.points[i];
      length += distance(a, b);
      let segmentMinDistance = Infinity;
      const obstacleIds: string[] = [];
      for (const item of blocking) {
        const d = segmentFootprintDistance(a, b, item.footprint);
        minDistance = Math.min(minDistance, d);
        segmentMinDistance = Math.min(segmentMinDistance, d);
        if (d <= path.width / 2 + EPSILON) {
          obstacleIds.push(item.id);
          const existing = obstacleMap.get(item.id);
          if (existing) {
            existing.centerlineDistance = Math.min(
              existing.centerlineDistance,
              d,
            );
            existing.clearance = Math.min(
              existing.clearance,
              d - path.width / 2,
            );
            existing.segmentIndices.push(i - 1);
          } else
            obstacleMap.set(item.id, {
              equipmentId: item.id,
              name: item.name,
              centerlineDistance: d,
              clearance: d - path.width / 2,
              segmentIndices: [i - 1],
            });
        }
      }
      const centeredClearWidth = Math.max(
        0,
        Math.min(path.width, segmentMinDistance * 2),
      );
      minCenteredClearWidth = Math.min(
        minCenteredClearWidth,
        centeredClearWidth,
      );
      if (centeredClearWidth < minimumWidth - EPSILON || obstacleIds.length)
        bottlenecks.push({
          segmentIndex: i - 1,
          start: { ...a },
          end: { ...b },
          centeredClearWidth,
          obstacleIds,
          note: obstacleIds.length
            ? `요청 폭 ${path.width.toFixed(2)}m의 동선과 설비 ${obstacleIds.length}개가 겹치거나 접합니다.`
            : `설정한 검토 폭 ${minimumWidth.toFixed(2)}m보다 ${Math.max(0, minimumWidth - centeredClearWidth).toFixed(2)}m 좁습니다.`,
        });
    }
    const meetsMinimumWidth = path.width >= minimumWidth - EPSILON;
    const withinFactory = path.points.every((p) =>
      circleWithinRect(p, path.width / 2, factory),
    );
    const obstacleIntersections = [...obstacleMap.values()].sort(
      (a, b) => a.clearance - b.clearance,
    );
    const notes: string[] = [];
    if (!meetsMinimumWidth)
      notes.push(
        `통로 폭 ${path.width.toFixed(2)}m가 설정 검토 폭 ${minimumWidth.toFixed(2)}m에 미달합니다.`,
      );
    if (obstacleIntersections.length)
      notes.push(
        `${obstacleIntersections.map((item) => item.name).join(", ")}의 현재 점유 영역과 동선이 겹칩니다. 설비 배치 또는 경로를 조정하세요.`,
      );
    if (!withinFactory)
      notes.push("통로 폭을 포함한 영역이 공장 경계를 벗어납니다.");
    return {
      pathwayId: path.id,
      name: path.name,
      kind: path.kind,
      width: path.width,
      minimumWidth,
      widthDeficit: Math.max(0, minimumWidth - path.width),
      meetsMinimumWidth,
      length,
      withinFactory,
      minClearance: Number.isFinite(minDistance)
        ? minDistance - path.width / 2
        : null,
      minCenteredClearWidth,
      obstacleIntersections,
      bottlenecks,
      crossingIds: [],
      status:
        obstacleIntersections.length || !withinFactory
          ? "obstructed"
          : !meetsMinimumWidth
            ? "review"
            : "clear",
      notes,
    };
  });
  const crossings: RouteCrossing[] = [];
  const workers = scenario.pathways.filter((path) => path.kind === "worker"),
    carts = scenario.pathways.filter((path) => path.kind === "cart");
  for (const worker of workers)
    for (const cart of carts) {
      const halfWidths = (worker.width + cart.width) / 2;
      let minDistance = Infinity,
        centerlinesIntersect = false,
        shared = false,
        segmentPairCount = 0;
      const segmentPairs: RouteCrossing["segmentPairs"] = [];
      for (let i = 1; i < worker.points.length; i++)
        for (let j = 1; j < cart.points.length; j++) {
          const a = worker.points[i - 1],
            b = worker.points[i],
            c = cart.points[j - 1],
            d = cart.points[j];
          const intersection = segmentIntersection(a, b, c, d);
          const gap = intersection ? 0 : segmentSegmentDistance(a, b, c, d);
          minDistance = Math.min(minDistance, gap);
          if (gap <= halfWidths + EPSILON) {
            segmentPairCount++;
            if (segmentPairs.length < 100)
              segmentPairs.push({
                workerSegment: i - 1,
                cartSegment: j - 1,
                intersection,
              });
            if (intersection) centerlinesIntersect = true;
            if (intersection?.kind === "overlap") shared = true;
          }
        }
      if (!segmentPairCount) continue;
      const kind = shared
        ? "shared"
        : centerlinesIntersect
          ? "crossing"
          : "proximity";
      const crossing: RouteCrossing = {
        id: `${worker.id}::${cart.id}`,
        workerPathwayId: worker.id,
        workerName: worker.name,
        cartPathwayId: cart.id,
        cartName: cart.name,
        centerlineDistance: minDistance,
        corridorClearance: minDistance - halfWidths,
        kind,
        centerlinesIntersect,
        segmentPairs,
        segmentPairCount,
        detailsTruncated: segmentPairCount > segmentPairs.length,
        note:
          kind === "shared"
            ? "작업자와 카트가 같은 중심선 구간을 공유합니다. 동선 분리 또는 통행 순서를 검토하세요."
            : kind === "crossing"
              ? "작업자와 카트 중심선이 교차하거나 접합니다. 교차 지점의 시야와 통행 관리를 검토하세요."
              : "중심선은 떨어져 있지만 설정 통로 폭이 겹칩니다. 나란한 경로 사이의 이격을 검토하세요.",
      };
      crossings.push(crossing);
      for (const route of routes)
        if (route.pathwayId === worker.id || route.pathwayId === cart.id) {
          route.crossingIds.push(crossing.id);
          if (route.status === "clear") route.status = "review";
          route.notes.push(crossing.note);
        }
    }
  for (const route of routes)
    if (!route.notes.length)
      route.notes.push(
        "설정 폭과 현재 설비 배치 기준으로 겹침이 발견되지 않았습니다.",
      );
  const notes = [
    `최소 통로 폭 ${minimumWidth.toFixed(2)}m는 사용자가 조정하는 검토 가정이며 법정 기준이 아닙니다.`,
    "이동식 설비도 현재 표시 위치에서 점유 장애물로 검토합니다.",
  ];
  return {
    minimumWidth,
    routes,
    crossings,
    obstructedCount: routes.filter((route) => route.status === "obstructed")
      .length,
    reviewCount: routes.filter((route) => route.status === "review").length,
    notes,
    disclaimer:
      "평면상의 정적 동선 검토입니다. 사람·차량의 속도, 회전반경, 정지거리, 시간별 점유와 법규 적합성은 계산하지 않습니다. 중앙 유지 가능 폭은 지정 중심선을 유지할 때의 여유이며 통로 전체의 실제 유효 폭 측정값이 아닙니다.",
  };
}
