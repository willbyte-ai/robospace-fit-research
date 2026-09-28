"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowUpRight,
  Check,
  ChevronDown,
  Copy,
  Crosshair,
  Download,
  Move3D,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Trash2,
  X,
} from "lucide-react";
import type { Candidate, Scenario } from "@/lib/engine";
import { factoryBounds } from "@/lib/factory-scenario";
import { findRobot, robotAsset, robotModels } from "@/lib/robot-catalog";
import {
  clampPose,
  createProgram,
  factoryToRobot,
  forwardKinematics,
  homePose,
  robotToFactory,
  solvePosition,
} from "@/lib/robot-motion";
import type {
  RobotModel,
  RobotProgram,
  RobotTelemetry,
  Vec3,
} from "@/lib/robot-types";
import { NumberField } from "./analysis-panels";
import { toast } from "sonner";

type Props = {
  scenario: Scenario;
  candidate: Candidate;
  telemetry: RobotTelemetry | null;
  playing: boolean;
  placing: boolean;
  snap: number;
  canUndo: boolean;
  canRedo: boolean;
  onChange: (s: Scenario) => void;
  onSelect: (id: string) => void;
  onPlaying: (v: boolean) => void;
  onPlacing: (v: boolean) => void;
  onSnap: (v: number) => void;
  onClose: () => void;
  onFocus: () => void;
  onSeek: (v: number) => void;
  onUndo: () => void;
  onRedo: () => void;
};
export function RobotStudio(p: Props) {
  const model = findRobot(p.scenario.robotProgram?.modelId),
    program = p.scenario.robotProgram;
  const [section, setSection] = useState("library");
  useEffect(() => {
    if (!model) setSection("library");
  }, [model]);
  const telemetry = p.telemetry?.modelId === model?.id ? p.telemetry : null;
  const [target, setTarget] = useState<Vec3>([0, 0, 1]);
  const [ikResult, setIkResult] = useState("");
  const body = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (body.current) body.current.scrollTop = 0;
  }, [section, model?.id]);
  const c = p.candidate;
  const b = factoryBounds(p.scenario, p.scenario.robot.footprintDiameter / 2);
  const tcp =
    model && program
      ? robotToFactory(
          forwardKinematics(model, program.joints).tcp.toArray() as Vec3,
          c.position,
          c.yawDeg ?? 0,
          c.mountHeight ?? 0,
        )
      : null;
  useEffect(() => {
    if (tcp) setTarget(tcp.map((n) => +n.toFixed(3)) as Vec3);
    setIkResult("");
  }, [model?.id, c.id]); // Preserve user-edited target while jogging.
  const changeProgram = (patch: Partial<RobotProgram>, pause = false) => {
    if (!program) return;
    if (pause) p.onPlaying(false);
    p.onChange({
      ...p.scenario,
      robotProgram: {
        ...program,
        ...(pause
          ? { joints: [...(telemetry?.joints ?? program.joints)] }
          : {}),
        ...patch,
      },
    });
  };
  const changeCandidate = (patch: Partial<Candidate>) =>
    p.onChange({
      ...p.scenario,
      candidates: p.scenario.candidates.map((old) =>
        old.id === c.id ? { ...old, ...patch } : old,
      ),
    });
  const selectModel = (next: RobotModel) => {
    p.onPlaying(false);
    const bounds = factoryBounds(p.scenario, next.footprintDiameter / 2);
    p.onChange({
      ...p.scenario,
      robot: {
        name: next.name,
        reach: next.reach,
        footprintDiameter: next.footprintDiameter,
        safetyBuffer: p.scenario.robot.safetyBuffer,
        payloadKg: next.payloadKg,
      },
      robotProgram: createProgram(next),
      candidates: p.scenario.candidates.map((item) => ({
        ...item,
        position: {
          x: Math.max(bounds.minX, Math.min(bounds.maxX, item.position.x)),
          y: Math.max(bounds.minY, Math.min(bounds.maxY, item.position.y)),
        },
      })),
    });
    setSection("place");
    p.onFocus();
    toast.success(`${next.name}를 배치했습니다.`);
  };
  const pose = telemetry?.joints ?? program?.joints ?? [];
  const addWaypoint = () => {
    if (!program || program.waypoints.length >= 12) return;
    changeProgram(
      {
        mode: "teach",
        joints: [...pose],
        waypoints: [
          ...program.waypoints,
          {
            id: crypto.randomUUID(),
            name: `자세 ${program.waypoints.length + 1}`,
            joints: [...pose],
          },
        ],
      },
      true,
    );
    toast.success("현재 관절 자세를 경로에 기록했습니다.");
  };
  const duplicate = () => {
    if (p.scenario.candidates.length >= 8) return;
    const id = "ABCDEFGH"
      .split("")
      .find((id) => !p.scenario.candidates.some((x) => x.id === id))!;
    p.onChange({
      ...p.scenario,
      candidates: [
        ...p.scenario.candidates,
        {
          ...c,
          id,
          name: `${model?.name ?? p.scenario.robot.name} 배치안 ${id}`,
          position: {
            x: Math.min(b.maxX, c.position.x + 0.5),
            y: Math.max(b.minY, c.position.y - 0.5),
          },
        },
      ],
    });
    p.onSelect(id);
    toast.success(
      `배치안 ${id}를 복제했습니다. 후보들은 대안 배치로 비교됩니다.`,
    );
  };
  const removeCandidate = () => {
    const remaining = p.scenario.candidates.filter((x) => x.id !== c.id);
    if (!remaining.length) return;
    p.onChange({ ...p.scenario, candidates: remaining });
    p.onSelect(remaining[0].id);
  };
  return (
    <aside className="robot-studio glass" aria-label="로봇 배치 스튜디오">
      <div className="robot-studio-header">
        <div>
          <span className="eyebrow">ROBOT PLACEMENT LAB</span>
          <h2>로봇 배치 스튜디오</h2>
        </div>
        <button
          className="icon-button"
          aria-label="로봇 배치 스튜디오 닫기"
          onClick={p.onClose}
        >
          <X size={18} />
        </button>
      </div>
      <nav className="robot-studio-tabs" aria-label="로봇 도구">
        {[
          ["library", "라이브러리"],
          ["place", "배치"],
          ["joints", "관절"],
          ["motion", "시뮬레이션"],
        ].map(([id, title]) => (
          <button
            key={id}
            className={section === id ? "active" : ""}
            disabled={id !== "library" && !model}
            onClick={() => setSection(id)}
          >
            {title}
          </button>
        ))}
      </nav>
      <div className="robot-studio-body" ref={body}>
        {section === "library" ? (
          <>
            <div className="robot-library-intro">
              <h3>공정에 맞는 로봇을 선택하세요</h3>
              <p>
                실제 제품 사진과 제조사 제원 기반의 6축 모델.
                <br />네 공장 모두에서 동일한 라이브러리를 사용합니다.
              </p>
            </div>
            {robotModels.map((item, i) => (
              <button
                className={
                  "robot-product-card " +
                  (model?.id === item.id ? "selected" : "")
                }
                onClick={() => selectModel(item)}
                key={item.id}
                aria-label={`${item.name} 배치`}
              >
                <div className="robot-product-image">
                  <img
                    src={robotAsset(item, "thumbnail.png")}
                    alt={`${item.name} 상세 3D 모델`}
                  />
                  <span className="robot-product-index">0{i + 1}</span>
                  {model?.id === item.id && (
                    <span className="robot-product-selected">
                      <Check size={11} /> 선택됨
                    </span>
                  )}
                </div>
                <div className="robot-product-copy">
                  <span>
                    {item.manufacturer} / {item.category}
                  </span>
                  <h3>
                    {item.name}
                    <ArrowUpRight size={17} />
                  </h3>
                  <p>{item.description}</p>
                  <div>
                    <b>
                      {item.payloadKg}
                      <small> kg</small>
                    </b>
                    <b>
                      {(item.reach * 1000).toFixed(0)}
                      <small> mm</small>
                    </b>
                    <b>
                      6<small> AXIS</small>
                    </b>
                  </div>
                </div>
              </button>
            ))}
            <p className="robot-note">
              형상과 일부 치수는 사진을 바탕으로 재구성했습니다. 실제 제품은
              제조사 원본 자료를 확인하세요.
            </p>
          </>
        ) : (
          model &&
          program && (
            <>
              <div className="robot-active-product">
                <img src={robotAsset(model, "thumbnail.png")} alt="" />
                <div>
                  <span>{model.manufacturer}</span>
                  <b>{model.name}</b>
                  <small>
                    {model.payloadKg} kg · {(model.reach * 1000).toFixed(0)} mm
                    · 6 AXIS
                  </small>
                </div>
                <button
                  aria-label="로봇 모델 변경"
                  className="icon-button"
                  onClick={() => setSection("library")}
                >
                  <ChevronDown size={16} />
                </button>
              </div>
              {section === "place" && (
                <>
                  <div className="robot-section-heading">
                    <h3>위치와 설치 방향</h3>
                    <span>배치안 {c.id}</span>
                  </div>
                  <div className="robot-candidate-chips">
                    {p.scenario.candidates.map((item) => (
                      <button
                        key={item.id}
                        className={item.id === c.id ? "active" : ""}
                        onClick={() => p.onSelect(item.id)}
                      >
                        {item.id}
                      </button>
                    ))}
                    <button
                      onClick={duplicate}
                      disabled={p.scenario.candidates.length >= 8}
                      aria-label="배치안 복제"
                    >
                      <Copy size={13} />
                    </button>
                    {!["A", "B", "C"].includes(c.id) && (
                      <button
                        aria-label="현재 배치안 삭제"
                        disabled={p.scenario.candidates.length <= 1}
                        onClick={removeCandidate}
                      >
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  <div className="coordinate-fields">
                    <NumberField
                      label="로봇 X 좌표"
                      value={c.position.x}
                      min={b.minX}
                      max={b.maxX}
                      step={p.snap || 0.01}
                      unit="m"
                      onChange={(v) =>
                        changeCandidate({ position: { ...c.position, x: v } })
                      }
                    />
                    <NumberField
                      label="로봇 Y 좌표"
                      value={c.position.y}
                      min={b.minY}
                      max={b.maxY}
                      step={p.snap || 0.01}
                      unit="m"
                      onChange={(v) =>
                        changeCandidate({ position: { ...c.position, y: v } })
                      }
                    />
                  </div>
                  <div className="coordinate-fields">
                    <NumberField
                      label="설치 회전"
                      value={c.yawDeg ?? 0}
                      min={-180}
                      max={180}
                      step={5}
                      unit="°"
                      onChange={(v) => changeCandidate({ yawDeg: v })}
                    />
                    <NumberField
                      label="설치 받침 높이"
                      value={c.mountHeight ?? 0}
                      min={0}
                      max={1.5}
                      step={0.05}
                      unit="m"
                      onChange={(v) => changeCandidate({ mountHeight: v })}
                    />
                  </div>
                  <div className="robot-rotation-presets">
                    {[-90, 0, 90, 180].map((yaw) => (
                      <button
                        key={yaw}
                        onClick={() => changeCandidate({ yawDeg: yaw })}
                      >
                        {yaw}°
                      </button>
                    ))}
                  </div>
                  <button
                    className={"button wide " + (p.placing ? "primary" : "")}
                    onClick={() => {
                      p.onPlacing(!p.placing);
                      p.onFocus();
                    }}
                  >
                    <Crosshair size={16} />
                    {p.placing
                      ? "바닥에서 새 위치를 클릭하세요"
                      : "장면에서 원하는 위치에 배치"}
                  </button>
                  <label className="robot-select-row">
                    배치 스냅
                    <select
                      aria-label="배치 스냅"
                      value={p.snap}
                      onChange={(e) => p.onSnap(+e.target.value)}
                    >
                      <option value={0}>자유 배치</option>
                      <option value={0.05}>5 cm</option>
                      <option value={0.1}>10 cm</option>
                      <option value={0.5}>50 cm</option>
                    </select>
                  </label>
                  <div className="robot-history">
                    <button
                      className="button"
                      onClick={p.onUndo}
                      disabled={!p.canUndo}
                    >
                      <RotateCcw size={13} />
                      실행 취소
                    </button>
                    <button
                      className="button"
                      onClick={p.onRedo}
                      disabled={!p.canRedo}
                    >
                      다시 실행
                    </button>
                  </div>
                  <p className="robot-note">
                    A–H는 서로 비교할 대안 배치입니다. 각 후보의 위치·방향·받침
                    높이를 개별 저장합니다.
                  </p>
                  <div className="robot-spec-grid">
                    <span>
                      공칭 도달거리<b>{model.reach.toFixed(3)} m</b>
                    </span>
                    <span>
                      최대 가반하중<b>{model.payloadKg} kg</b>
                    </span>
                    <span>
                      본체 질량<b>{model.massKg} kg</b>
                    </span>
                    <span>
                      설치 베이스 외접원
                      <b>Ø {model.footprintDiameter.toFixed(3)} m</b>
                    </span>
                  </div>
                </>
              )}
              {section === "joints" && (
                <>
                  <div className="robot-section-heading">
                    <h3>6축 관절 조작</h3>
                    <button
                      className="text-button"
                      onClick={() =>
                        changeProgram({ joints: homePose(model) }, true)
                      }
                    >
                      <RotateCcw size={12} />홈 자세
                    </button>
                  </div>
                  <p className="robot-note">
                    슬라이더를 움직이면 해당 축과 연결된 링크가 함께 회전합니다.
                  </p>
                  <div className="robot-joints">
                    {model.joints.map((joint, i) => (
                      <label key={joint.name}>
                        <span>
                          <b>{joint.name}</b>
                          {joint.label}
                          <strong>
                            {(pose[i] ?? program.joints[i]).toFixed(1)}°
                          </strong>
                        </span>
                        <input
                          aria-label={`${joint.name} 관절 각도`}
                          type="range"
                          min={joint.minDeg}
                          max={joint.maxDeg}
                          step={0.5}
                          value={pose[i] ?? program.joints[i]}
                          onChange={(e) => {
                            const next = [...pose];
                            next[i] = +e.target.value;
                            changeProgram(
                              { joints: clampPose(model, next) },
                              true,
                            );
                          }}
                        />
                        <small>
                          <span>{joint.minDeg}°</span>
                          <span>{joint.maxDeg}°</span>
                        </small>
                      </label>
                    ))}
                  </div>
                  <button
                    className="button wide"
                    onClick={addWaypoint}
                    disabled={program.waypoints.length >= 12}
                  >
                    <Plus size={14} />
                    현재 자세를 경로에 기록
                  </button>
                  <details className="robot-ik">
                    <summary>
                      툴 끝 위치로 자세 찾기 <span>IK</span>
                    </summary>
                    <p>
                      공장 좌표계 · 위치만 계산합니다. 툴 방향은 고정하지
                      않습니다.
                    </p>
                    <div className="robot-xyz">
                      {["X", "Y", "Z"].map((axis, i) => (
                        <NumberField
                          key={axis}
                          label={`목표 ${axis}`}
                          value={target[i]}
                          min={i === 2 ? 0 : -50}
                          max={i === 2 ? 5 : 50}
                          step={0.05}
                          unit="m"
                          onChange={(v) =>
                            setTarget(
                              (old) =>
                                old.map((n, j) => (j === i ? v : n)) as Vec3,
                            )
                          }
                        />
                      ))}
                    </div>
                    <button
                      className="button wide"
                      onClick={() => {
                        const result = solvePosition(
                          model,
                          factoryToRobot(
                            target,
                            c.position,
                            c.yawDeg ?? 0,
                            c.mountHeight ?? 0,
                          ),
                          pose,
                        );
                        setIkResult(
                          result.reached
                            ? `자세 적용 · 위치 오차 ${(result.error * 1000).toFixed(1)} mm`
                            : `이 위치에 도달하지 못했습니다 · 오차 ${(result.error * 1000).toFixed(0)} mm`,
                        );
                        if (result.reached)
                          changeProgram({ joints: result.joints }, true);
                      }}
                    >
                      목표 위치 자세 계산
                    </button>
                    {ikResult && <p role="status">{ikResult}</p>}
                  </details>
                </>
              )}
              {section === "motion" && (
                <>
                  <div className="robot-section-heading">
                    <h3>작업 동작 시뮬레이션</h3>
                    <span>JOINT SPACE</span>
                  </div>
                  <div className="robot-motion-modes">
                    {[
                      ["sweep", "다방향 스윕", "좌우·상하·손목 회전"],
                      ["transfer", "이송 동작", "접근·상승·회전·하강"],
                      ["teach", "저장 자세", "직접 기록한 순서로 반복"],
                    ].map(([mode, name, desc]) => (
                      <button
                        className={program.mode === mode ? "active" : ""}
                        key={mode}
                        onClick={() =>
                          changeProgram(
                            { mode: mode as RobotProgram["mode"] },
                            true,
                          )
                        }
                      >
                        <b>{name}</b>
                        <span>{desc}</span>
                      </button>
                    ))}
                  </div>
                  {program.mode === "teach" && (
                    <div className="robot-waypoints">
                      <div className="robot-section-heading">
                        <h3>기록한 자세</h3>
                        <span>{program.waypoints.length} / 12</span>
                      </div>
                      {program.waypoints.map((w, i) => (
                        <div key={w.id}>
                          <span>{String(i + 1).padStart(2, "0")}</span>
                          <button
                            onClick={() =>
                              changeProgram({ joints: [...w.joints] }, true)
                            }
                          >
                            {w.name}
                            <small>
                              {w.joints
                                .slice(0, 3)
                                .map((n) => `${n.toFixed(0)}°`)
                                .join(" / ")}
                            </small>
                          </button>
                          <button
                            aria-label={`${w.name} 위로 이동`}
                            disabled={i === 0}
                            onClick={() => {
                              const next = [...program.waypoints];
                              [next[i - 1], next[i]] = [next[i], next[i - 1]];
                              changeProgram({ waypoints: next }, true);
                            }}
                          >
                            ↑
                          </button>
                          <button
                            aria-label={`${w.name} 삭제`}
                            onClick={() =>
                              changeProgram(
                                {
                                  waypoints: program.waypoints.filter(
                                    (x) => x.id !== w.id,
                                  ),
                                },
                                true,
                              )
                            }
                          >
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                      <button
                        className="button wide"
                        onClick={addWaypoint}
                        disabled={program.waypoints.length >= 12}
                      >
                        <Plus size={14} />
                        현재 자세 추가
                      </button>
                      {program.waypoints.length < 2 && (
                        <p className="robot-note">
                          관절 탭에서 서로 다른 자세를 2개 이상 기록하세요.
                        </p>
                      )}
                    </div>
                  )}
                  <div className="robot-playbar">
                    <button
                      className="button primary"
                      aria-label={
                        p.playing
                          ? "로봇 시뮬레이션 일시정지"
                          : "로봇 시뮬레이션 재생"
                      }
                      disabled={
                        program.mode === "teach" && program.waypoints.length < 2
                      }
                      onClick={() => p.onPlaying(!p.playing)}
                    >
                      {p.playing ? <Pause size={15} /> : <Play size={15} />}{" "}
                      {p.playing ? "일시정지" : "재생"}
                    </button>
                    <button
                      className="icon-button"
                      aria-label="시뮬레이션 처음으로"
                      onClick={() => {
                        p.onPlaying(false);
                        p.onSeek(0);
                      }}
                    >
                      <RotateCcw size={16} />
                    </button>
                    <span>
                      {(p.telemetry?.elapsed ?? 0).toFixed(1)} /{" "}
                      {(p.telemetry?.duration ?? 0).toFixed(1)} s
                    </span>
                  </div>
                  <input
                    className="robot-timeline"
                    disabled={
                      program.mode === "teach" && program.waypoints.length < 2
                    }
                    aria-label="시뮬레이션 타임라인"
                    type="range"
                    min={0}
                    max={1}
                    step={0.002}
                    value={p.telemetry?.progress ?? 0}
                    onChange={(e) => {
                      p.onPlaying(false);
                      p.onSeek(+e.target.value);
                    }}
                  />
                  <label className="robot-select-row">
                    재생 속도
                    <select
                      aria-label="로봇 재생 속도"
                      value={program.speed}
                      onChange={(e) =>
                        changeProgram({ speed: +e.target.value }, true)
                      }
                    >
                      <option value={0.25}>25%</option>
                      <option value={0.5}>50%</option>
                      <option value={1}>100%</option>
                    </select>
                  </label>
                  <label className="robot-check-row">
                    <input
                      type="checkbox"
                      checked={program.showTrail}
                      onChange={(e) =>
                        changeProgram({ showTrail: e.target.checked })
                      }
                    />
                    <span>툴 끝 이동 궤적 표시</span>
                    <i className="robot-blue-dot" />
                  </label>
                  <label className="robot-check-row">
                    <input
                      type="checkbox"
                      checked={program.showWorkspace}
                      onChange={(e) =>
                        changeProgram({ showWorkspace: e.target.checked })
                      }
                    />
                    <span>3D 작업 범위 샘플 표시</span>
                  </label>
                  <p className="robot-note">
                    관절 제한과 축별 속도 상한 내에서 부드럽게 보간합니다. 3D
                    점군은 관절 자세를 샘플링한 도달 영역입니다.
                  </p>
                </>
              )}
              <div className="robot-tcp-readout">
                <span>
                  <i className="robot-blue-dot" />
                  TCP · 공장 좌표
                </span>
                <div>
                  {["X", "Y", "Z"].map((axis, i) => (
                    <span key={axis}>
                      {axis}
                      <b>
                        {(p.telemetry?.tcp[i] ?? tcp?.[i] ?? 0).toFixed(3)}
                        <small> m</small>
                      </b>
                    </span>
                  ))}
                </div>
                {p.telemetry?.belowFloor && (
                  <p>
                    툴 끝이 바닥 아래에 있습니다. 자세 또는 설치 높이를
                    조정하세요.
                  </p>
                )}
              </div>
              <details className="robot-sources">
                <summary>모델·제원 출처와 다운로드</summary>
                <p>{model.note}</p>
                {model.sources.map((s) => (
                  <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
                    {s.title}
                    <ArrowUpRight size={12} />
                  </a>
                ))}
                <a href={robotAsset(model, "scene.blend")} download>
                  <Download size={12} />
                  Blender 원본
                </a>
                <a href={robotAsset(model, "robot.glb")} download>
                  <Download size={12} />
                  관절 분리 GLB
                </a>
              </details>
            </>
          )
        )}
      </div>
      <footer>
        사진 기반 시각 모델 · 관절 기구학 시뮬레이션
        <br />
        <span>
          제조사 CAD·제어 프로그램·충돌 안전 검증을 대체하지 않습니다.
        </span>
      </footer>
    </aside>
  );
}
