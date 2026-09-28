"use client";
import { useEffect, useRef } from "react";
import { flushSync } from "react-dom";
import { analyzeAll, computeRoi, type Scenario, type Analysis } from "./engine";
import { factoryBounds } from "./factory-scenario";
type Props = {
  scenario: Scenario;
  selected: string;
  analyses: Analysis[];
  setScenario: (s: Scenario) => void;
  setSelected: (s: string) => void;
};
type Tool = {
  name: string;
  description: string;
  title: string;
  inputSchema: object;
  annotations: { readOnlyHint: boolean; untrustedContentHint: boolean };
  execute: (input: unknown) => unknown;
};
export function useWebMcp(props: Props) {
  const latest = useRef(props);
  latest.current = props;
  useEffect(() => {
    const context = (
      document as unknown as {
        modelContext?: {
          registerTool: (
            tool: Tool,
            options: { signal: AbortSignal },
          ) => unknown;
        };
      }
    ).modelContext;
    if (!context?.registerTool) return;
    const abort = new AbortController();
    const register = (tool: Tool) => {
      try {
        void Promise.resolve(
          context.registerTool(tool, { signal: abort.signal }),
        ).catch(() => {});
      } catch {}
    };
    register({
      name: "read_placement_analysis",
      title: "배치 분석 조회",
      description:
        "현재 후보들의 공간분석 결과와 ROI 가정 및 계산 결과를 조회합니다.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: false },
      execute: () => {
        const p = latest.current;
        return {
          selected: p.selected,
          scenario: p.scenario,
          analyses: p.analyses,
          roi: computeRoi(p.scenario.roi),
        };
      },
    });
    register({
      name: "configure_robot_candidate",
      title: "로봇 배치 후보 설정",
      description:
        "현재 가상 공장의 후보를 선택하고 선택적으로 X/Y 위치를 조정합니다. 실제 장비는 제어하지 않습니다.",
      inputSchema: {
        type: "object",
        properties: {
          candidateId: { type: "string" },
          x: { type: "number", minimum: -1000, maximum: 1000 },
          y: { type: "number", minimum: -1000, maximum: 1000 },
        },
        required: ["candidateId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false, untrustedContentHint: false },
      execute: (input) => {
        if (!input || typeof input !== "object")
          throw new Error("객체 입력이 필요합니다");
        const o = input as Record<string, unknown>;
        if (Object.keys(o).some((k) => !["candidateId", "x", "y"].includes(k)))
          throw new Error("지원하지 않는 필드입니다");
        const p = latest.current;
        const candidate = p.scenario.candidates.find(
          (c) => c.id === o.candidateId,
        );
        if (!candidate) throw new Error("존재하지 않는 후보입니다");
        const bounds = factoryBounds(p.scenario, p.scenario.robot.footprintDiameter / 2);
        const x = o.x === undefined ? candidate.position.x : o.x,
          y = o.y === undefined ? candidate.position.y : o.y;
        if (
          typeof x !== "number" ||
          !Number.isFinite(x) ||
          x < bounds.minX ||
          x > bounds.maxX ||
          typeof y !== "number" ||
          !Number.isFinite(y) ||
          y < bounds.minY ||
          y > bounds.maxY
        )
          throw new Error("공장 범위 내 유한한 좌표를 입력하세요");
        const next = {
          ...p.scenario,
          candidates: p.scenario.candidates.map((c) =>
            c.id === candidate.id ? { ...c, position: { x, y } } : c,
          ),
        };
        flushSync(() => {
          p.setScenario(next);
          p.setSelected(candidate.id);
        });
        return analyzeAll(next).find((a) => a.candidateId === candidate.id);
      },
    });
    return () => abort.abort();
  }, []);
}
