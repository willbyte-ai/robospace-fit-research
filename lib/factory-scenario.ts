import {
  defaultScenario as original,
  type Scenario,
  type Equipment,
} from "./engine";
import layout from "../public/models/factory-layout.json";
import metal from "../public/models/metal-machining/layout.json";
import electronics from "../public/models/electronics-assembly/layout.json";
import logistics from "../public/models/logistics-sortation/layout.json";
import { findRobot } from "./robot-catalog";
const convert = (
  id: string,
  name: string,
  b: { minX: number; maxX: number; minZ: number; maxZ: number },
): Equipment => ({
  id,
  name,
  category: id.includes("pallet") ? "적재" : "설비",
  footprint: {
    kind: "rect",
    center: { x: (b.minX + b.maxX) / 2, y: -(b.minZ + b.maxZ) / 2 },
    width: b.maxX - b.minX,
    depth: b.maxZ - b.minZ,
  },
  sweepPolicy: ["pick_conveyor", "pallet_pick"].includes(id)
    ? "work-target"
    : "advisory",
  blocksBase: true,
});
const equipment: Equipment[] = layout.colliders.map((c) =>
  convert(c.id, c.label, c.bounds),
);
const amr = layout.equipment.find((e) => e.id === "amr")!;
equipment.push(convert(amr.id, amr.label, amr.footprintXZ));
layout.fences.forEach((f) =>
  equipment.push(
    convert(f.id, f.gate ? "안전펜스 출입문" : "안전펜스", {
      minX: Math.min(f.start[0], f.end[0]) - f.thickness / 2,
      maxX: Math.max(f.start[0], f.end[0]) + f.thickness / 2,
      minZ: Math.min(f.start[1], f.end[1]) - f.thickness / 2,
      maxZ: Math.max(f.start[1], f.end[1]) + f.thickness / 2,
    }),
  ),
);
export const defaultScenario: Scenario = {
  ...original,
  id: "food-packaging-hall-v2",
  name: "식품 포장·팔레타이징 구역",
  equipment,
  robot: { ...original.robot, name: "RS-1850 팔레타이저", payloadKg: 12 },
  targets: [
    {
      id: "pick",
      name: "컨베이어 픽업",
      position: { x: -0.8, y: 0 },
      equipmentId: "pick_conveyor",
    },
    {
      id: "place",
      name: "팔레트 적재",
      position: { x: 2, y: 0.5 },
      equipmentId: "pallet_pick",
    },
  ],
  candidates: [
    {
      id: "A",
      name: "포장라인 중앙",
      position: { x: 0.55, y: -0.25 },
      description: "픽업과 적재 사이, 평면 도달·이격 조건을 만족하는 후보",
    },
    {
      id: "B",
      name: "작업 동선 인접",
      position: { x: 1.9, y: -1.5 },
      description: "픽업과 적재 작업점 도달 범위 조정이 필요한 후보",
    },
    {
      id: "C",
      name: "제어반 인접",
      position: { x: 3.85, y: 2 },
      description: "제어반과 설치 베이스가 겹치는 후보",
    },
  ],
};

export type FactoryDefinition = {
  slug: string;
  title: string;
  shortTitle: string;
  industry: string;
  description: string;
  robotDescription: string;
  scenario: Scenario;
  camera: {
    cellOffset: [number, number, number];
    targetHeight: number;
    overviewPosition: [number, number, number];
  };
  assets: { factory: string; robot: string; blend: string; thumbnail: string };
};

const extraFactory = (data: unknown): FactoryDefinition => {
  const d = data as Omit<FactoryDefinition, "assets">;
  const path = `/models/${d.slug}`;
  return {
    ...d,
    assets: {
      factory: `${path}/factory.glb`,
      robot: `${path}/robot.glb`,
      blend: `${path}/scene.blend`,
      thumbnail: `${path}/thumbnail.png`,
    },
  };
};

export const factories: FactoryDefinition[] = [
  {
    slug: "food-packaging",
    title: "식품 포장·팔레타이징",
    shortTitle: "식품 포장",
    industry: "FOOD & PACKAGING",
    description:
      "스테인리스 포장 라인, 위생 배관, 박스 적재 셀을 갖춘 식품 생산 공간",
    robotDescription: "6축 로봇 · 진공 그리퍼 · 가상 제원",
    scenario: defaultScenario,
    camera: {
      cellOffset: [3.6, 3.6, 5],
      targetHeight: 0.92,
      overviewPosition: [25, 24, 30],
    },
    assets: {
      factory: "/models/factory.glb",
      robot: "/models/robot.glb",
      blend: "/models/robospace-food-factory.blend",
      thumbnail: "/models/food-thumbnail.png",
    },
  },
  extraFactory(metal),
  extraFactory(electronics),
  extraFactory(logistics),
];

export const findFactory = (id: string) =>
  factories.find((f) => f.scenario.id === id);

export function factoryBounds(s: Scenario, inset = 0) {
  return {
    minX: s.factory.center.x - s.factory.width / 2 + inset,
    maxX: s.factory.center.x + s.factory.width / 2 - inset,
    minY: s.factory.center.y - s.factory.depth / 2 + inset,
    maxY: s.factory.center.y + s.factory.depth / 2 - inset,
  };
}

export function isFactoryCompatible(s: Scenario) {
  const baseline = findFactory(s.id)?.scenario;
  if (!baseline) return false;
  const model = findRobot(s.robotProgram?.modelId);
  return (
    JSON.stringify(s.factory) === JSON.stringify(baseline.factory) &&
    s.equipment.length === baseline.equipment.length &&
    s.equipment.every((e) => {
      const original = baseline.equipment.find((o) => o.id === e.id);
      return (
        original &&
        JSON.stringify(e.footprint) === JSON.stringify(original.footprint) &&
        e.blocksBase === original.blocksBase &&
        e.sweepPolicy === original.sweepPolicy
      );
    }) &&
    (model
      ? s.robot.footprintDiameter === model.footprintDiameter &&
        s.robot.reach === model.reach &&
        s.robot.payloadKg === model.payloadKg
      : s.robot.footprintDiameter === baseline.robot.footprintDiameter)
  );
}
