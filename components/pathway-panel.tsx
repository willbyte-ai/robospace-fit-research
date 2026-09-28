"use client";
import { useState } from "react";
import {
  Route,
  TriangleAlert,
  Check,
  ArrowRight,
  Plus,
  Trash2,
} from "lucide-react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { FloorPlan, NumberField } from "./analysis-panels";
import { analyzePathways, type Scenario } from "@/lib/engine";
import { factoryBounds } from "@/lib/factory-scenario";
export function PathwayPanel({
  scenario,
  selected,
  onChange,
}: {
  scenario: Scenario;
  selected: string;
  onChange: (s: Scenario) => void;
}) {
  const bounds = factoryBounds(scenario);
  const [routeId, setRouteId] = useState(scenario.pathways[0]?.id ?? "");
  const audit = analyzePathways(scenario, scenario.minimumPathwayWidth ?? 1.2);
  const route =
    scenario.pathways.find((p) => p.id === routeId) ?? scenario.pathways[0];
  const result = audit.routes.find((p) => p.pathwayId === route?.id);
  const changePoint = (i: number, axis: "x" | "y", v: number) =>
    onChange({
      ...scenario,
      pathways: scenario.pathways.map((p) =>
        p.id === route.id
          ? {
              ...p,
              points: p.points.map((point, j) =>
                i === j ? { ...point, [axis]: v } : point,
              ),
            }
          : p,
      ),
    });
  return (
    <section className="analysis-page">
      <div className="section-head">
        <div className="eyebrow">FLOW & CLEARANCE</div>
        <h2>사람과 물류가 지나는 길.</h2>
        <p>설비 점유와 통로 폭을 함께 반영한 평면 동선 검토입니다.</p>
      </div>
      <div className="pathway-layout">
        <div className="glass route-map">
          <div className="panel-heading">
            설비·로봇·이동 동선<span>위에서 본 공정</span>
          </div>
          <FloorPlan scenario={scenario} selected={selected} />
          <div className="route-legend">
            <span>
              <i className="amber-bg" />
              작업자 동선
            </span>
            <span>
              <i className="blue-bg" />
              대차 동선
            </span>
            <span>
              <i className="accent-blue-bg" />
              작업반경
            </span>
          </div>
          <div className="path-stats">
            <div>
              <span>설비와 겹치는 경로</span>
              <b>
                {audit.obstructedCount}
                <small>개</small>
              </b>
            </div>
            <div>
              <span>작업자·대차 경로 겹침</span>
              <b>
                {audit.crossings.length}
                <small>쌍</small>
              </b>
            </div>
            <div>
              <span>검토 최소 폭</span>
              <b>
                {audit.minimumWidth.toFixed(1)}
                <small>m</small>
              </b>
            </div>
          </div>
          {audit.crossings.map((c) => (
            <div className="route-warning" key={c.id}>
              <TriangleAlert size={17} />
              <p>{c.note}</p>
            </div>
          ))}
        </div>
        <div className="glass route-editor">
          <div className="panel-heading">
            동선 조건 편집
            <Route size={16} />
          </div>
          {route ? (
            <>
              <Select value={route.id} onValueChange={setRouteId}>
                <SelectTrigger
                  className="route-select"
                  aria-label="편집할 동선"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {scenario.pathways.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="coordinate-fields">
                <NumberField
                  label="이동 통로 폭"
                  value={route.width}
                  min={0.1}
                  max={5}
                  step={0.1}
                  unit="m"
                  onChange={(v) =>
                    onChange({
                      ...scenario,
                      pathways: scenario.pathways.map((p) =>
                        p.id === route.id ? { ...p, width: v } : p,
                      ),
                    })
                  }
                />
                <NumberField
                  label="최소 폭 검토값"
                  value={scenario.minimumPathwayWidth ?? 1.2}
                  min={0.1}
                  max={5}
                  step={0.1}
                  unit="m"
                  onChange={(v) =>
                    onChange({ ...scenario, minimumPathwayWidth: v })
                  }
                />
              </div>
              <p className="section-caption">
                최소 폭은 시나리오 가정이며 법정 기준이 아닙니다.
              </p>
              <div className="route-points-head">
                <span>경유점 좌표 (m)</span>
                <span>X</span>
                <span>Y</span>
              </div>
              <div className="route-points">
                {route.points.map((p, i) => (
                  <div key={i}>
                    <span className="point-number">{i + 1}</span>
                    <NumberField
                      label={`${route.kind} 경유점 ${i + 1} X`}
                      value={p.x}
                      min={bounds.minX}
                      max={bounds.maxX}
                      step={0.1}
                      onChange={(v) => changePoint(i, "x", v)}
                    />
                    <NumberField
                      label={`${route.kind} 경유점 ${i + 1} Y`}
                      value={p.y}
                      min={bounds.minY}
                      max={bounds.maxY}
                      step={0.1}
                      onChange={(v) => changePoint(i, "y", v)}
                    />
                    <button
                      className="plain-button"
                      disabled={route.points.length <= 2}
                      aria-label={`경유점 ${i + 1} 삭제`}
                      onClick={() =>
                        onChange({
                          ...scenario,
                          pathways: scenario.pathways.map((p) =>
                            p.id === route.id
                              ? {
                                  ...p,
                                  points: p.points.filter((_, j) => i !== j),
                                }
                              : p,
                          ),
                        })
                      }
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="button wide"
                disabled={route.points.length >= 12}
                onClick={() =>
                  onChange({
                    ...scenario,
                    pathways: scenario.pathways.map((p) =>
                      p.id === route.id
                        ? {
                            ...p,
                            points: [
                              ...p.points,
                              {
                                ...p.points[p.points.length - 1],
                                x: Math.min(
                                  bounds.maxX,
                                  p.points[p.points.length - 1].x + 1,
                                ),
                              },
                            ],
                          }
                        : p,
                    ),
                  })
                }
              >
                <Plus size={15} />
                경유점 추가
              </button>
            </>
          ) : (
            <p>등록된 동선이 없습니다. 기본 시나리오를 복원해 시작하세요.</p>
          )}
        </div>
      </div>
      <div className="route-results">
        {audit.routes.map((r) => (
          <article className="glass route-result" key={r.pathwayId}>
            <div>
              <Route size={18} />
              <h3>{r.name}</h3>
              <span
                className={
                  "status-chip " +
                  (r.status === "clear"
                    ? "recommended"
                    : r.status === "obstructed"
                      ? "blocked"
                      : "review")
                }
              >
                {r.status === "clear"
                  ? "조건 충족"
                  : r.status === "obstructed"
                    ? "경로 조정 필요"
                    : "조건부 검토"}
              </span>
            </div>
            <p>
              경로 길이 <b>{r.length.toFixed(1)}m</b> · 설정 폭{" "}
              <b>{r.width.toFixed(2)}m</b> · 설비 간섭{" "}
              <b>{r.obstacleIntersections.length}건</b>
            </p>
            {r.notes.map((n) => (
              <p key={n} className="route-note">
                {n}
              </p>
            ))}
          </article>
        ))}
      </div>
      <p className="method-note">{audit.disclaimer}</p>
    </section>
  );
}
