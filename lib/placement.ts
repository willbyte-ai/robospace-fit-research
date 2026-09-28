import type { Point2, Scenario } from "./engine";
import { findRobot, robotAsset, robotModels } from "./robot-catalog";

export type AssetDefinition = {
  id: string;
  name: string;
  category: "robot" | "transport" | "processing" | "inspection" | "storage";
  description: string;
  /** Nominal base footprint and overall height, in metres. */
  width: number;
  depth: number;
  height: number;
  modelUrl: string;
  thumbnailUrl: string;
  robotModelId?: string;
};

export type PlacedAsset = {
  id: string;
  assetId: string;
  name: string;
  position: Point2;
  yawDeg: number;
  mountHeight: number;
  joints?: number[];
};

const equipment = (
  id: string,
  name: string,
  category: AssetDefinition["category"],
  description: string,
  width: number,
  depth: number,
  height: number,
): AssetDefinition => ({
  id,
  name,
  category,
  description,
  width,
  depth,
  height,
  modelUrl: `/models/equipment/${id}/asset.glb`,
  thumbnailUrl: `/models/equipment/${id}/thumbnail.webp`,
});

/** Equipment is an original planning model, not a manufacturer's certified CAD. */
export const assetCatalog: AssetDefinition[] = [
  ...robotModels.map((model) => ({
    id: model.id,
    name: model.name,
    category: "robot" as const,
    description: model.description,
    width: model.footprintDiameter,
    depth: model.footprintDiameter,
    height: model.id === "ur10e" ? 1.5 : model.id === "abb-irb1200" ? 1.1 : 2.1,
    modelUrl: robotAsset(model, "robot.glb"),
    thumbnailUrl: robotAsset(model, "thumbnail.png"),
    robotModelId: model.id,
  })),
  equipment(
    "roller-conveyor",
    "동력 롤러 컨베이어",
    "transport",
    "구동 롤러, 측면 가이드, 감속 모터와 높이 조절 지지대가 있는 이송 설비",
    3,
    0.85,
    0.9,
  ),
  equipment(
    "amr-cart",
    "AMR 운반 로봇",
    "transport",
    "라이다, 안전 범퍼, 구동 휠과 상부 적재대를 갖춘 자율 운반 플랫폼",
    1,
    0.75,
    0.8,
  ),
  equipment(
    "cnc-mill",
    "CNC 머시닝 센터",
    "processing",
    "가공 챔버, 스핀들, 제어 패널과 칩 배출부를 갖춘 밀폐형 가공 설비",
    2.4,
    2.2,
    2.6,
  ),
  equipment(
    "vision-station",
    "비전 검사 스테이션",
    "inspection",
    "카메라, 검사 조명, 이송 테이블과 보호 프레임을 갖춘 광학 검사 설비",
    1.4,
    1.1,
    2.1,
  ),
  equipment(
    "pallet-rack",
    "팔레트 보관 랙",
    "storage",
    "다단 선반, 팔레트, 적재 박스와 바닥 앵커를 갖춘 산업용 보관 랙",
    2.4,
    1.2,
    3,
  ),
];

export const findAsset = (id?: string) =>
  assetCatalog.find((asset) => asset.id === id);

function validText(input: unknown, maximum: number): input is string {
  return (
    typeof input === "string" &&
    input.trim().length > 0 &&
    input.length <= maximum
  );
}

function finiteIn(input: unknown, min: number, max: number): input is number {
  return (
    typeof input === "number" &&
    Number.isFinite(input) &&
    input >= min &&
    input <= max
  );
}

/** Strict import boundary. Call only if the optional persisted field is present. */
export function parsePlacedAssets(input: unknown): PlacedAsset[] {
  if (!Array.isArray(input) || input.length > 60) {
    throw new Error("배치 설비 목록은 최대 60개 항목의 배열이어야 합니다.");
  }
  const ids = new Set<string>();
  return input.map((value, index) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      throw new Error(`배치 설비 ${index + 1}의 형식이 올바르지 않습니다.`);
    }
    const item = value as Partial<PlacedAsset>;
    const asset = findAsset(item.assetId);
    if (
      !validText(item.id, 100) ||
      ids.has(item.id) ||
      !asset ||
      !validText(item.name, 100) ||
      !item.position ||
      !finiteIn(item.position.x, -1000, 1000) ||
      !finiteIn(item.position.y, -1000, 1000) ||
      !finiteIn(item.yawDeg, -180, 180) ||
      !finiteIn(item.mountHeight, 0, 1.5)
    ) {
      throw new Error(
        `배치 설비 ${index + 1}의 식별자 또는 위치가 올바르지 않습니다.`,
      );
    }
    const model = findRobot(asset.robotModelId);
    if (
      item.joints !== undefined &&
      (!model ||
        !Array.isArray(item.joints) ||
        item.joints.length !== model.joints.length ||
        !item.joints.every((angle, jointIndex) =>
          finiteIn(
            angle,
            model.joints[jointIndex].minDeg,
            model.joints[jointIndex].maxDeg,
          ),
        ))
    ) {
      throw new Error(`배치 설비 ${index + 1}의 관절 값이 올바르지 않습니다.`);
    }
    ids.add(item.id);
    return {
      id: item.id,
      assetId: asset.id,
      name: item.name,
      position: { x: item.position.x, y: item.position.y },
      yawDeg: item.yawDeg,
      mountHeight: item.mountHeight,
      ...(item.joints ? { joints: [...item.joints] } : {}),
    };
  });
}

const EPS = 1e-8;
type OrientedRect = {
  center: Point2;
  halfWidth: number;
  halfDepth: number;
  u: Point2;
  v: Point2;
};

function rectangle(
  center: Point2,
  width: number,
  depth: number,
  yawDeg = 0,
): OrientedRect {
  const angle = (yawDeg * Math.PI) / 180;
  const c = Math.cos(angle),
    s = Math.sin(angle);
  return {
    center,
    halfWidth: width / 2,
    halfDepth: depth / 2,
    u: { x: c, y: s },
    v: { x: -s, y: c },
  };
}

const dot = (a: Point2, b: Point2) => a.x * b.x + a.y * b.y;

function corners(rect: OrientedRect): Point2[] {
  return [-1, 1].flatMap((u) =>
    [-1, 1].map((v) => ({
      x:
        rect.center.x +
        u * rect.halfWidth * rect.u.x +
        v * rect.halfDepth * rect.v.x,
      y:
        rect.center.y +
        u * rect.halfWidth * rect.u.y +
        v * rect.halfDepth * rect.v.y,
    })),
  );
}

/** SAT tests positive penetration; merely touching an edge is not an overlap. */
function rectanglesOverlap(a: OrientedRect, b: OrientedRect): boolean {
  const delta = { x: b.center.x - a.center.x, y: b.center.y - a.center.y };
  return [a.u, a.v, b.u, b.v].every((axis) => {
    const radius =
      a.halfWidth * Math.abs(dot(a.u, axis)) +
      a.halfDepth * Math.abs(dot(a.v, axis)) +
      b.halfWidth * Math.abs(dot(b.u, axis)) +
      b.halfDepth * Math.abs(dot(b.v, axis));
    return Math.abs(dot(delta, axis)) < radius - EPS;
  });
}

function circleOverlaps(rect: OrientedRect, center: Point2, radius: number) {
  const delta = { x: center.x - rect.center.x, y: center.y - rect.center.y };
  const outsideX = Math.max(Math.abs(dot(delta, rect.u)) - rect.halfWidth, 0);
  const outsideY = Math.max(Math.abs(dot(delta, rect.v)) - rect.halfDepth, 0);
  return Math.hypot(outsideX, outsideY) < radius - EPS;
}

function placedRectangle(item: PlacedAsset): OrientedRect {
  const asset = findAsset(item.assetId);
  if (!asset) throw new Error(`알 수 없는 배치 설비: ${item.assetId}`);
  return rectangle(item.position, asset.width, asset.depth, item.yawDeg);
}

/**
 * Temporary collision context for the visible analysis robot. Never persist this
 * derived scenario: factory equipment remains the original authored layout.
 */
export function placementContext(
  scenario: Scenario,
  candidateId?: string,
): Scenario {
  const candidate = scenario.candidates.find((item) => item.id === candidateId);
  if (scenario.showReferenceRobot === false || !candidate) return scenario;
  const reserved = "__layout_reference_robot__";
  const ids = new Set(scenario.equipment.map((item) => item.id));
  let id = reserved,
    suffix = 0;
  while (ids.has(id)) id = `${reserved}${++suffix}`;
  const reference: Scenario["equipment"][number] = {
    id,
    name: "분석 기준 로봇",
    category: "reference-robot",
    footprint: {
      kind: "circle",
      center: { ...candidate.position },
      radius: scenario.robot.footprintDiameter / 2,
    },
    blocksBase: true,
    sweepPolicy: "advisory",
  };
  return { ...scenario, equipment: [...scenario.equipment, reference] };
}

/** Planar base-footprint guidance only: it does not test moving links or 3D clearance. */
export function placementIssues(
  item: PlacedAsset,
  scenario: Scenario,
  others: PlacedAsset[],
): { outside: boolean; overlaps: string[] } {
  const rect = placedRectangle(item);
  const { factory } = scenario;
  const outside = corners(rect).some(
    (point) =>
      Math.abs(point.x - factory.center.x) > factory.width / 2 + EPS ||
      Math.abs(point.y - factory.center.y) > factory.depth / 2 + EPS,
  );
  const overlaps: string[] = [];
  for (const equipment of scenario.equipment) {
    if (!equipment.blocksBase) continue;
    const footprint = equipment.footprint;
    const overlapsBase =
      footprint.kind === "circle"
        ? circleOverlaps(rect, footprint.center, footprint.radius)
        : rectanglesOverlap(
            rect,
            rectangle(footprint.center, footprint.width, footprint.depth),
          );
    if (overlapsBase) overlaps.push(equipment.name);
  }
  for (const other of others) {
    if (
      other.id !== item.id &&
      rectanglesOverlap(rect, placedRectangle(other))
    ) {
      overlaps.push(other.name);
    }
  }
  return { outside, overlaps };
}

/**
 * Finds the nearest available point on a 0.5 m grid around the cell centre.
 * If all points are occupied, returns the in-bounds point with fewest overlaps;
 * callers must still show placementIssues before confirmation.
 */
export function suggestPlacement(
  assetId: string,
  scenario: Scenario,
  others: PlacedAsset[],
): Point2 {
  const asset = findAsset(assetId);
  if (!asset) throw new Error(`알 수 없는 배치 설비: ${assetId}`);
  const { factory } = scenario;
  const minX = factory.center.x - (factory.width - asset.width) / 2;
  const maxX = factory.center.x + (factory.width - asset.width) / 2;
  const minY = factory.center.y - (factory.depth - asset.depth) / 2;
  const maxY = factory.center.y + (factory.depth - asset.depth) / 2;
  if (minX > maxX || minY > maxY) return { ...factory.center };
  const anchor = {
    x: Math.max(minX, Math.min(maxX, scenario.cell.center.x)),
    y: Math.max(minY, Math.min(maxY, scenario.cell.center.y)),
  };
  // An empty ID cannot equal any valid persisted instance's ID.
  const item: PlacedAsset = {
    id: "",
    assetId,
    name: asset.name,
    position: anchor,
    yawDeg: 0,
    mountHeight: 0,
  };
  let best = anchor;
  let bestOverlaps = Infinity;
  let bestDistance = Infinity;
  const visit = (gridX: number, gridY: number) => {
    const position = {
      x: Number((anchor.x + gridX * 0.5).toFixed(6)),
      y: Number((anchor.y + gridY * 0.5).toFixed(6)),
    };
    if (
      position.x < minX - EPS ||
      position.x > maxX + EPS ||
      position.y < minY - EPS ||
      position.y > maxY + EPS
    )
      return;
    const issue = placementIssues({ ...item, position }, scenario, others);
    const distance = gridX * gridX + gridY * gridY;
    if (
      !issue.outside &&
      (issue.overlaps.length < bestOverlaps ||
        (issue.overlaps.length === bestOverlaps && distance < bestDistance))
    ) {
      best = position;
      bestOverlaps = issue.overlaps.length;
      bestDistance = distance;
    }
  };
  visit(0, 0);
  const rings = Math.ceil(
    Math.max(
      anchor.x - minX,
      maxX - anchor.x,
      anchor.y - minY,
      maxY - anchor.y,
    ) / 0.5,
  );
  for (let ring = 1; ring <= rings; ring++) {
    if (bestOverlaps === 0 && ring * ring > bestDistance) break;
    for (let offset = -ring; offset <= ring; offset++) {
      visit(offset, -ring);
      visit(offset, ring);
      if (Math.abs(offset) !== ring) {
        visit(-ring, offset);
        visit(ring, offset);
      }
    }
  }
  return best;
}
