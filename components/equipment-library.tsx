"use client";
import { useState } from "react";
import {
  Plus,
  Search,
  Box,
  Move3D,
  RotateCw,
  Check,
  X,
  Copy,
  Trash2,
  Crosshair,
  Undo2,
  Redo2,
  Play,
  Square,
  ChevronDown,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  assetCatalog,
  findAsset,
  placementIssues,
  type PlacedAsset,
} from "@/lib/placement";
import type { Scenario } from "@/lib/engine";
import { findRobot } from "@/lib/robot-catalog";
import { homePose } from "@/lib/robot-motion";
import { NumberField } from "@/components/analysis-panels";

const categories = {
  all: "전체",
  robot: "로봇암",
  transport: "운반·이송",
  processing: "가공",
  inspection: "검사",
  storage: "보관",
};
export function EquipmentLibrary({
  open,
  onOpenChange,
  onChoose,
  count,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onChoose: (id: string) => void;
  count: number;
}) {
  const [category, setCategory] = useState("all"),
    [query, setQuery] = useState("");
  const assets = assetCatalog.filter(
    (a) =>
      (category === "all" || a.category === category) &&
      `${a.name} ${a.description}`.toLowerCase().includes(query.toLowerCase()),
  );
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="equipment-library">
        <div className="equipment-library-heading">
          <div>
            <div className="eyebrow">ASSET LIBRARY / 08</div>
            <DialogTitle>설비와 로봇을 공간에 더하세요</DialogTitle>
            <DialogDescription>
              모델을 선택하면 반투명 미리보기가 나타납니다. 위치를 조정한 뒤
              직접 확정하세요.
            </DialogDescription>
          </div>
          <span className="library-count">
            배치됨 <b>{count}</b> / 60
          </span>
        </div>
        <div className="library-filter">
          <div className="library-categories">
            {Object.entries(categories).map(([id, name]) => (
              <button
                key={id}
                className={category === id ? "active" : ""}
                onClick={() => setCategory(id)}
              >
                {name}
              </button>
            ))}
          </div>
          <label className="library-search">
            <Search size={15} />
            <input
              aria-label="설비 검색"
              placeholder="설비 검색"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
        </div>
        <div className="equipment-grid">
          {assets.map((a) => (
            <button
              className="equipment-card"
              key={a.id}
              disabled={count >= 60}
              onClick={() => onChoose(a.id)}
              aria-label={`${a.name} 배치 미리보기`}
            >
              <div className="equipment-card-image">
                <img
                  src={a.thumbnailUrl}
                  alt={`${a.name} 3D 모델`}
                  loading="lazy"
                />
                <span>{categories[a.category]}</span>
                <i>
                  <Plus size={18} />
                </i>
              </div>
              <div className="equipment-card-copy">
                <h3>{a.name}</h3>
                <p>{a.description}</p>
                <footer>
                  <span>
                    {a.width.toFixed(2)} × {a.depth.toFixed(2)} m
                  </span>
                  <span>배치하기 ↗</span>
                </footer>
              </div>
            </button>
          ))}
          {!assets.length && (
            <p className="library-empty">검색 조건에 맞는 설비가 없습니다.</p>
          )}
        </div>
        <div className="library-footer">
          <span>
            <Box size={14} />
            설비 5종 · 로봇암 3종 · 동일 모델 여러 대 배치 가능
          </span>
          <span>1 선택 → 2 위치 조정 → 3 확정</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type PanelProps = {
  scenario: Scenario;
  draft: PlacedAsset | null;
  selected: string | null;
  status: "loading" | "ready" | "error";
  snap: number;
  playing: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onAdd: () => void;
  onClose: () => void;
  onSelect: (id: string) => void;
  onDraft: (v: PlacedAsset) => void;
  onConfirm: () => void;
  onCancel: () => void;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFocus: () => void;
  onSnap: (v: number) => void;
  onUndo: () => void;
  onRedo: () => void;
  onPlaying: () => void;
  onPose: (j: number[]) => void;
  onReference: (v: boolean) => void;
};
export function PlacementPanel(p: PanelProps) {
  const items = p.scenario.placedAssets ?? [],
    item = p.draft ?? items.find((i) => i.id === p.selected),
    asset = item && findAsset(item.assetId),
    robot = asset && findRobot(asset.robotModelId),
    issues = item ? placementIssues(item, p.scenario, items) : null;
  return (
    <aside className="placement-panel glass" aria-label="자유 배치 도구">
      <header>
        <div>
          <div className="eyebrow">LAYOUT STUDIO</div>
          <h2>
            자유 배치 <span>{items.length}</span>
          </h2>
        </div>
        <button
          className="icon-button"
          aria-label="자유 배치 닫기"
          onClick={p.onClose}
        >
          <X size={18} />
        </button>
      </header>
      <div className="placement-panel-scroll">
        <button
          className="button primary placement-add"
          disabled={!!p.draft || items.length >= 60}
          onClick={p.onAdd}
        >
          <Plus size={17} /> 설비·로봇 추가
        </button>
        <div className="placement-history">
          <button
            className="button"
            disabled={!p.canUndo || !!p.draft}
            onClick={p.onUndo}
            aria-label="배치 실행 취소"
          >
            <Undo2 size={14} />
          </button>
          <button
            className="button"
            disabled={!p.canRedo || !!p.draft}
            onClick={p.onRedo}
            aria-label="배치 다시 실행"
          >
            <Redo2 size={14} />
          </button>
          <label>
            <input
              type="checkbox"
              checked={p.scenario.showReferenceRobot !== false}
              onChange={(e) => p.onReference(e.target.checked)}
            />
            기준 로봇·가이드 표시
          </label>
        </div>
        {item && asset ? (
          <>
            <div
              className={"placement-selection " + (p.draft ? "is-draft" : "")}
            >
              <img src={asset.thumbnailUrl} alt="" />
              <div>
                <small>
                  {p.draft ? "PREVIEW · 미확정" : "PLACED · 배치 확정"}
                </small>
                <h3>{item.name}</h3>
                <span>
                  {asset.width.toFixed(2)} × {asset.depth.toFixed(2)} ×{" "}
                  {asset.height.toFixed(2)} m
                </span>
              </div>
            </div>
            {p.draft ? (
              <>
                <p className="placement-instruction">
                  <Move3D size={16} />
                  <span>
                    바닥을 클릭하거나 반투명 모델을 드래그하세요. 확정 전까지
                    자유롭게 옮길 수 있습니다.
                  </span>
                </p>
                <div className="placement-fields">
                  <NumberField
                    label="배치 X (m)"
                    value={item.position.x}
                    min={-1000}
                    max={1000}
                    step={p.snap || 0.01}
                    onChange={(x) =>
                      p.onDraft({ ...item, position: { ...item.position, x } })
                    }
                  />
                  <NumberField
                    label="배치 Y (m)"
                    value={item.position.y}
                    min={-1000}
                    max={1000}
                    step={p.snap || 0.01}
                    onChange={(y) =>
                      p.onDraft({ ...item, position: { ...item.position, y } })
                    }
                  />
                </div>
                <div className="placement-fields">
                  <NumberField
                    label="방향 (°)"
                    value={item.yawDeg}
                    min={-180}
                    max={180}
                    step={5}
                    onChange={(yawDeg) => p.onDraft({ ...item, yawDeg })}
                  />
                  <label className="placement-snap">
                    격자 간격
                    <select
                      aria-label="배치 격자 간격"
                      value={p.snap}
                      onChange={(e) => p.onSnap(Number(e.target.value))}
                    >
                      <option value={0}>자유 이동</option>
                      <option value={0.05}>5 cm</option>
                      <option value={0.1}>10 cm</option>
                      <option value={0.5}>50 cm</option>
                    </select>
                  </label>
                </div>
                {robot && (
                  <NumberField
                    label="설치 높이 (m)"
                    value={item.mountHeight}
                    min={0}
                    max={1.5}
                    step={0.05}
                    onChange={(mountHeight) =>
                      p.onDraft({ ...item, mountHeight })
                    }
                  />
                )}
                <div className="placement-actions">
                  <button
                    className="button"
                    onClick={() =>
                      p.onDraft({
                        ...item,
                        yawDeg: ((item.yawDeg + 90 + 180) % 360) - 180,
                      })
                    }
                  >
                    <RotateCw size={14} />
                    90° 회전
                  </button>
                  <button className="button" onClick={p.onFocus}>
                    <Crosshair size={14} />
                    모델 보기
                  </button>
                </div>
                <div
                  className={
                    "placement-check " +
                    (issues?.outside || issues?.overlaps.length
                      ? "has-issue"
                      : "")
                  }
                  role="status"
                >
                  {p.status === "loading"
                    ? "3D 모델을 불러오는 중…"
                    : p.status === "error"
                      ? "모델을 불러오지 못했습니다. 취소 후 다시 선택해주세요."
                      : issues?.outside
                        ? "공장 바깥입니다. 안쪽으로 옮겨주세요."
                        : issues?.overlaps.length
                          ? `평면 점유 영역 겹침 ${issues.overlaps.length}건 · ${issues.overlaps.slice(0, 2).join(", ")}`
                          : "공장 내부 · 평면 점유 영역 겹침 없음"}
                  <small>바닥 점유 영역 기준 · 로봇 동작 충돌 검증 제외</small>
                </div>
              </>
            ) : (
              <>
                <div className="placement-position">
                  <span>
                    X <b>{item.position.x.toFixed(2)}</b> m
                  </span>
                  <span>
                    Y <b>{item.position.y.toFixed(2)}</b> m
                  </span>
                  <span>
                    <b>{item.yawDeg}°</b>
                  </span>
                </div>
                <button
                  className="button primary placement-add"
                  onClick={p.onEdit}
                >
                  <Move3D size={16} />
                  위치·방향 편집
                </button>
                <div className="placement-actions">
                  <button
                    className="button"
                    onClick={p.onDuplicate}
                    disabled={items.length >= 60}
                  >
                    <Copy size={14} />
                    복제
                  </button>
                  <button className="button" onClick={p.onFocus}>
                    <Crosshair size={14} />
                    보기
                  </button>
                  <button className="button" onClick={p.onDelete}>
                    <Trash2 size={14} />
                    삭제
                  </button>
                </div>
                {robot && (
                  <details className="placed-robot-joints">
                    <summary>
                      관절·동작 미리보기 <ChevronDown size={14} />
                    </summary>
                    <button
                      className="button placement-add"
                      onClick={p.onPlaying}
                    >
                      {p.playing ? <Square size={14} /> : <Play size={14} />}{" "}
                      {p.playing ? "동작 미리보기 정지" : "다방향 동작 재생"}
                    </button>
                    {robot.joints.map((j, i) => (
                      <label key={j.name}>
                        {j.label}
                        <output>
                          {(item.joints ?? homePose(robot))[i].toFixed(0)}°
                        </output>
                        <input
                          type="range"
                          aria-label={`${item.name} ${j.label}`}
                          min={j.minDeg}
                          max={j.maxDeg}
                          step={1}
                          disabled={p.playing}
                          value={(item.joints ?? homePose(robot))[i]}
                          onChange={(e) =>
                            p.onPose(
                              (item.joints ?? homePose(robot)).map((v, n) =>
                                n === i ? Number(e.target.value) : v,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </details>
                )}
              </>
            )}
          </>
        ) : (
          <div className="placement-empty">
            <Box size={30} />
            <h3>공간을 직접 구성하세요</h3>
            <p>
              설비를 선택하고 위치를 확정하면 여기에 배치 목록이 만들어집니다.
            </p>
          </div>
        )}
        <div className="placed-list-heading">
          배치한 설비 <span>{items.length}대</span>
        </div>
        <div className="placed-list">
          {items.map((i, n) => (
            <button
              key={i.id}
              disabled={!!p.draft}
              className={p.selected === i.id ? "active" : ""}
              onClick={() => p.onSelect(i.id)}
            >
              <span>{String(n + 1).padStart(2, "0")}</span>
              <img src={findAsset(i.assetId)!.thumbnailUrl} alt="" />
              <b>{i.name}</b>
              <small>
                {i.position.x.toFixed(1)}, {i.position.y.toFixed(1)}
              </small>
            </button>
          ))}
        </div>
        <p className="placement-save-note">
          확정 후 상단 저장 버튼으로 보관하세요. 공장별 배치와 JSON 내보내기를
          지원합니다.
        </p>
      </div>
      {p.draft && (
        <footer className="placement-confirm">
          <button className="button" onClick={p.onCancel}>
            <X size={15} />
            취소
          </button>
          <button
            className="button primary"
            disabled={p.status !== "ready" || issues?.outside}
            onClick={p.onConfirm}
          >
            <Check size={17} />
            배치 확정
          </button>
        </footer>
      )}
    </aside>
  );
}
