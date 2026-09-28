"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Box,
  Layers3,
  ScanLine,
  ArrowUpRight,
  ChevronRight,
  Move3D,
  FileDown,
  Check,
  CircleHelp,
  Settings2,
  Crosshair,
  Maximize,
  Factory,
  Plus,
  Minus,
  RotateCcw,
  Save,
  FolderOpen,
  Download,
  Play,
  Pause,
  MousePointer2,
  PanelLeftClose,
  PanelLeftOpen,
  TriangleAlert,
  MoveRight,
  Info,
  FileText,
  Wallet,
  Eye,
  ImageDown,
  Command,
} from "lucide-react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  TooltipProvider,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
} from "@/components/ui/tooltip";
import { Toaster, toast } from "sonner";
import {
  FactoryViewer,
  type ViewerHandle,
  type Layers,
} from "@/components/factory-viewer";
import {
  ComparePanel,
  RoiPanel,
  ReportPanel,
  NumberField,
  FloorPlan,
  statusText,
} from "@/components/analysis-panels";
import {
  analyzeAll,
  computeRoi,
  validateScenario,
  type Scenario,
  type Point2,
} from "@/lib/engine";
import { useWebMcp } from "@/lib/webmcp";
import { PathwayPanel } from "@/components/pathway-panel";
import { OverviewPanel, CandidateMonitor } from "@/components/scene-panels";
import {
  defaultScenario,
  isFactoryCompatible,
  factories,
  findFactory,
  factoryBounds,
  type FactoryDefinition,
} from "@/lib/factory-scenario";
import {
  ACTIVE_FACTORY_KEY,
  scenarioStorageKey,
  readScenario,
  type ScenarioDraft,
} from "@/lib/scenario-storage";
import {
  EquipmentLibrary,
  PlacementPanel,
} from "@/components/equipment-library";
import {
  findAsset,
  suggestPlacement,
  placementIssues,
  placementContext,
  type PlacedAsset,
} from "@/lib/placement";
import { homePose } from "@/lib/robot-motion";
import { RobotStudio } from "@/components/robot-studio";
import { FactoryTour, useFactoryTour } from "@/components/factory-tour";
import { findRobot } from "@/lib/robot-catalog";
import { buildMotionPlan } from "@/lib/robot-motion";
import type { RobotTelemetry } from "@/lib/robot-types";
const layerNames: Record<keyof Layers, string> = {
  factory: "공장 구조",
  equipment: "설비·적재물",
  reach: "로봇 작업 범위",
  safety: "설정 여유 영역",
  paths: "작업자·대차 동선",
  labels: "작업점 라벨",
};
const number = (n: number | null) => (n === null ? "—" : n.toFixed(2));
function IconButton({
  label,
  children,
  onClick,
  active = false,
}: {
  label: string;
  children: React.ReactNode;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className={"icon-button " + (active ? "active" : "")}
          aria-label={label}
          onClick={onClick}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
function download(content: string, name: string, type = "application/json") {
  const blob = new Blob([content], { type });
  const u = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = u;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 5000);
}
export default function Home() {
  const [scenario, setScenario] = useState<Scenario>(() =>
    structuredClone(defaultScenario),
  );
  const [selected, setSelected] = useState("A");
  const [tab, setTab] = useState("space");
  const [view, setView] = useState<"3d" | "2d">("3d");
  const [layers, setLayers] = useState<Layers>({
    factory: true,
    equipment: true,
    reach: true,
    safety: false,
    paths: true,
    labels: false,
  });
  const [placing, setPlacing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [editing, setEditing] = useState(false);
  const [showLeft, setShowLeft] = useState(true);
  const [help, setHelp] = useState(false);
  const [project, setProject] = useState(false);
  const [catalog, setCatalog] = useState(false);
  const [robotStudio, setRobotStudio] = useState(false);
  const [assetLibrary, setAssetLibrary] = useState(false);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [placementDraft, setPlacementDraft] = useState<PlacedAsset | null>(
    null,
  );
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [assetStatus, setAssetStatus] = useState<"loading" | "ready" | "error">(
    "loading",
  );
  const [assetPlaying, setAssetPlaying] = useState(false);
  const [snap, setSnap] = useState(0.05);
  const [telemetry, setTelemetry] = useState<RobotTelemetry | null>(null);
  const telemetryRef = useRef(telemetry);
  telemetryRef.current = telemetry;
  const history = useRef<{
    past: Scenario[];
    future: Scenario[];
    time: number;
  }>({ past: [], future: [], time: 0 });
  const [historyRevision, setHistoryRevision] = useState(0);
  const drafts = useRef(new Map<string, ScenarioDraft>());
  const [reset, setReset] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [object, setObject] = useState("");
  const [reportImage, setReportImage] = useState<string>();
  const [reportDate, setReportDate] = useState("");
  const viewer = useRef<ViewerHandle>(null);
  const tour = useFactoryTour({ loaded, viewer, prepare: () => {
    setHelp(false);
    setTab("space");
    setView("3d");
    setPlaying(false);
    setAssetPlaying(false);
    setRobotStudio(false);
    setLayoutOpen(false);
    setCatalog(false);
    setProject(false);
    setPlacing(false);
    setEditing(false);
  } });
  const file = useRef<HTMLInputElement>(null);
  const latest = useRef(scenario);
  latest.current = scenario;
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const definition = findFactory(scenario.id) ?? factories[0];
  const robotModel = findRobot(scenario.robotProgram?.modelId);
  const program = scenario.robotProgram;
  const motionPlan = useMemo(
    () =>
      robotModel && program ? buildMotionPlan(robotModel, program) : undefined,
    [
      robotModel,
      program?.mode,
      program?.speed,
      program?.waypoints,
      program?.mode === "teach" && program.waypoints.length < 2
        ? program.joints
        : undefined,
    ],
  );
  useEffect(() => {
    setTelemetry(null);
  }, [robotModel?.id, selected, program?.joints, motionPlan]);
  const bounds = factoryBounds(scenario);
  const baseBounds = factoryBounds(
    scenario,
    scenario.robot.footprintDiameter / 2,
  );
  const analyses = useMemo(() => analyzeAll(scenario), [scenario]);
  const analysis =
    analyses.find((a) => a.candidateId === selected) ?? analyses[0];
  const candidate = scenario.candidates.find(
    (c) => c.id === analysis.candidateId,
  )!;
  const roi = useMemo(() => computeRoi(scenario.roi), [scenario.roi]);
  useEffect(() => {
    try {
      const active = localStorage.getItem(ACTIVE_FACTORY_KEY);
      const id = active && findFactory(active) ? active : defaultScenario.id;
      const restored = readScenario(localStorage, id);
      setScenario(
        restored?.scenario ?? structuredClone(findFactory(id)!.scenario),
      );
      setSelected(restored?.selected ?? "A");
      setSaved(restored?.saved ?? false);
    } catch {
      toast.error(
        "저장한 시나리오를 복원하지 못했습니다. 기본 장면을 열었습니다.",
      );
    }
    setReportDate(new Date().toLocaleDateString("ko-KR"));
  }, []);
  const switchFactory = (next: FactoryDefinition) => {
    if (next.scenario.id === scenario.id) {
      setCatalog(false);
      return;
    }
    drafts.current.set(scenario.id, { scenario, selected, saved });
    let restored = drafts.current.get(next.scenario.id);
    try {
      restored ??= readScenario(localStorage, next.scenario.id);
    } catch {}
    setLoaded(false);
    history.current = { past: [], future: [], time: 0 };
    setHistoryRevision((v) => v + 1);
    setRobotStudio(false);
    setPlacementDraft(null);
    setSelectedAsset(null);
    setLayoutOpen(false);
    setAssetLibrary(false);
    setAssetPlaying(false);
    setTelemetry(null);
    setScenario(restored?.scenario ?? structuredClone(next.scenario));
    setSelected(restored?.selected ?? "A");
    setSaved(restored?.saved ?? false);
    setReportImage(undefined);
    setPlaying(false);
    setPlacing(false);
    setEditing(false);
    setObject("");
    setTab("space");
    setView("3d");
    setCatalog(false);
    try {
      localStorage.setItem(ACTIVE_FACTORY_KEY, next.scenario.id);
    } catch {}
    toast.success(`${next.shortTitle} 공장을 열었습니다.`);
  };
  const update = useCallback((next: Scenario) => {
    const h = history.current;
    if (Date.now() - h.time > 450)
      h.past = [...h.past.slice(-29), latest.current];
    h.time = Date.now();
    h.future = [];
    latest.current = next;
    setScenario(next);
    setHistoryRevision((v) => v + 1);
    setReportImage(undefined);
    setSaved(false);
  }, []);
  const commitLayout = (items: PlacedAsset[]) => {
    history.current.time = 0;
    update({ ...latest.current, placedAssets: items });
    history.current.time = 0;
  };
  const openLibrary = () => {
    if (tour.active) {
      if (!tour.ready) return;
      tour.finish("completed");
    }
    setRobotStudio(false);
    setLayoutOpen(true);
    setAssetLibrary(true);
    setPlaying(false);
    setPlacing(false);
    setTab("space");
  };
  const nextAssetName = (assetId: string) => {
    let n = 1;
    const base = findAsset(assetId)!.name;
    while (
      (latest.current.placedAssets ?? []).some((i) => i.name === `${base} ${n}`)
    )
      n++;
    return `${base} ${n}`;
  };
  const beginPlacement = (assetId: string, source?: PlacedAsset) => {
    const asset = findAsset(assetId)!;
    const items = latest.current.placedAssets ?? [];
    if (!source && items.length >= 60) return;
    const model = findRobot(asset.robotModelId);
    const draft: PlacedAsset = source
      ? structuredClone(source)
      : {
          id: crypto.randomUUID(),
          assetId,
          name: nextAssetName(assetId),
          position: suggestPlacement(
            assetId,
            placementContext(latest.current, selectedRef.current),
            items,
          ),
          yawDeg: 0,
          mountHeight: 0,
          ...(model ? { joints: homePose(model) } : {}),
        };
    setAssetStatus("loading");
    setPlacementDraft(draft);
    setAssetLibrary(false);
    setLayoutOpen(true);
    setRobotStudio(false);
    setAssetPlaying(false);
    setPlaying(false);
    setPlacing(false);
    setView("3d");
    requestAnimationFrame(() => viewer.current?.focusAsset(draft));
  };
  const confirmPlacement = () => {
    if (
      !placementDraft ||
      assetStatus !== "ready" ||
      placementIssues(
        placementDraft,
        placementContext(latest.current, selectedRef.current),
        latest.current.placedAssets ?? [],
      ).outside
    )
      return;
    const items = latest.current.placedAssets ?? [];
    commitLayout(
      items.some((i) => i.id === placementDraft.id)
        ? items.map((i) => (i.id === placementDraft.id ? placementDraft : i))
        : [...items, placementDraft],
    );
    setSelectedAsset(placementDraft.id);
    setPlacementDraft(null);
    toast.success("설비 위치를 확정했습니다.");
  };
  const selectPlaced = (id: string) => {
    setSelectedAsset(id);
    setLayoutOpen(true);
    setRobotStudio(false);
    setAssetPlaying(false);
    setObject("");
  };
  const undo = () => {
    setPlacementDraft(null);
    setAssetPlaying(false);
    const h = history.current,
      previous = h.past.pop();
    if (!previous) return;
    h.future.push(latest.current);
    h.time = 0;
    latest.current = previous;
    setScenario(previous);
    setSaved(false);
    setPlaying(false);
    setReportImage(undefined);
    if (!previous.candidates.some((c) => c.id === selected))
      setSelected(previous.candidates[0].id);
    setHistoryRevision((v) => v + 1);
  };
  const redo = () => {
    setPlacementDraft(null);
    setAssetPlaying(false);
    const h = history.current,
      next = h.future.pop();
    if (!next) return;
    h.past.push(latest.current);
    h.time = 0;
    latest.current = next;
    setScenario(next);
    setSaved(false);
    setPlaying(false);
    setReportImage(undefined);
    if (!next.candidates.some((c) => c.id === selected))
      setSelected(next.candidates[0].id);
    setHistoryRevision((v) => v + 1);
  };
  const choose = useCallback((id: string) => {
    if (id.startsWith("equipment:")) {
      setObject(id.slice(10).replace(/__.*/, ""));
      return;
    }
    setSelected(id);
    setReportImage(undefined);
    setSaved(false);
    setObject("");
    setPlacing(false);
  }, []);
  const place = useCallback(
    (p: Point2) => {
      const s = latest.current;
      update({
        ...s,
        candidates: s.candidates.map((c) =>
          c.id === selected ? { ...c, position: p } : c,
        ),
      });
      setSaved(false);
      setReportImage(undefined);
      setPlacing(false);
      toast.success(`후보 ${selected} 위치를 변경했습니다.`);
    },
    [selected, update],
  );
  const save = useCallback(() => {
    try {
      const snapshot =
        latest.current.robotProgram &&
        telemetryRef.current?.modelId === latest.current.robotProgram.modelId
          ? {
              ...latest.current,
              robotProgram: {
                ...latest.current.robotProgram,
                joints: [...telemetryRef.current.joints],
              },
            }
          : latest.current;
      localStorage.setItem(
        scenarioStorageKey(latest.current.id),
        JSON.stringify({
          ...snapshot,
          selectedCandidateId: selectedRef.current,
        }),
      );
      localStorage.setItem(ACTIVE_FACTORY_KEY, latest.current.id);
      setSaved(true);
      toast.success("이 브라우저에 시나리오를 저장했습니다.");
    } catch {
      toast.error(
        "저장 공간을 사용할 수 없습니다. JSON 내보내기를 이용하세요.",
      );
    }
  }, []);
  const exportScenario = () => {
    const snapshot =
      scenario.robotProgram &&
      telemetry?.modelId === scenario.robotProgram.modelId
        ? {
            ...scenario,
            robotProgram: {
              ...scenario.robotProgram,
              joints: [...telemetry.joints],
            },
          }
        : scenario;
    download(
      JSON.stringify(snapshot, null, 2),
      `robospace-fit-${definition.slug}.json`,
    );
  };
  const importScenario = async (f: File) => {
    try {
      if (f.size > 1000000)
        throw new Error("1MB 이하의 JSON 파일만 가져올 수 있습니다.");
      const check = validateScenario(JSON.parse(await f.text()));
      if (!check.valid) throw new Error(check.errors[0]);
      if (!isFactoryCompatible(check.scenario))
        throw new Error(
          "지원하는 네 공장 모델과 설비 형상이 일치하는 시나리오를 사용하세요.",
        );
      if (check.scenario.id !== scenario.id) {
        drafts.current.set(scenario.id, { scenario, selected, saved });
        setLoaded(false);
      }
      setPlacementDraft(null);
      setSelectedAsset(null);
      setAssetPlaying(false);
      update(check.scenario);
      setPlaying(false);
      setPlacing(false);
      setEditing(false);
      setObject("");
      setTab("space");
      setView("3d");
      try {
        localStorage.setItem(ACTIVE_FACTORY_KEY, check.scenario.id);
      } catch {}
      setSelected(check.scenario.candidates[0].id);
      toast.success("시나리오를 가져왔습니다.");
      setProject(false);
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "올바른 JSON 시나리오가 아닙니다.",
      );
    }
    if (file.current) file.current.value = "";
  };
  const openReport = () => {
    setReportImage(loaded ? viewer.current?.capture() : undefined);
    setReportDate(new Date().toLocaleDateString("ko-KR"));
    setTab("report");
    setPlaying(false);
  };
  const capture = () => {
    const data = viewer.current?.capture();
    if (!data) {
      toast.error("3D 모델이 준비된 뒤 다시 시도하세요.");
      return;
    }
    const a = document.createElement("a");
    a.href = data;
    a.download = `RoboSpace-Fit-${definition.slug}-${selected}.png`;
    a.click();
    toast.success("현재 3D 장면을 이미지로 저장했습니다.");
  };
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (tour.active) return;
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
      if (e.key === "Escape") {
        setPlacementDraft(null);
        setPlacing(false);
        setEditing(false);
      }
      if ((e.target as HTMLElement).tagName === "INPUT") return;
      if (e.key === "1") viewer.current?.focus("overview");
      if (e.key === "2") viewer.current?.focus("cell");
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [save, tour.active]);
  useWebMcp({
    scenario,
    selected,
    analyses,
    setScenario: update,
    setSelected: choose,
  });
  return (
    <TooltipProvider delayDuration={250}>
      <main
        className={
          "studio " + (tab === "space" ? "studio-viewport" : "studio-analysis")
        }
      >
        <Toaster theme="dark" position="bottom-center" />
        <header className="topbar no-print">
          <a className="brand" href="/" aria-label="RoboSpace Fit 홈">
            <span className="brand-symbol">
              <Box size={23} />
            </span>
            <span>
              robospace<span className="brand-light"> fit</span>
            </span>
            <span className="version">2.0</span>
          </a>
          <button
            className="project-crumb"
            aria-label="공장 시나리오 선택"
            onClick={() => setCatalog(true)}
          >
            <Factory size={14} />
            <b>
              {definition.shortTitle} /{" "}
              {String(factories.indexOf(definition) + 1).padStart(2, "0")}
            </b>
            <span className="project-chevron">⌄</span>
          </button>
          <button
            className="mobile-project icon-button factory-compact-switch"
            aria-label="공장 시나리오 선택"
            onClick={() => setCatalog(true)}
          >
            <Factory size={15} />
            <span>{definition.shortTitle}</span>
            <span aria-hidden="true">⌄</span>
          </button>
          <Tabs
            value={tab}
            onValueChange={(v) => (v === "report" ? openReport() : setTab(v))}
          >
            <TabsList className="main-tabs" data-tour="analysis-tabs">
              <TabsTrigger value="space">공간분석</TabsTrigger>
              <TabsTrigger value="compare">후보 비교</TabsTrigger>
              <TabsTrigger value="paths">동선 검토</TabsTrigger>
              <TabsTrigger value="roi">경제성 분석</TabsTrigger>
              <TabsTrigger value="report">리포트</TabsTrigger>
            </TabsList>
          </Tabs>
          <span className={"save-state " + (saved ? "saved" : "")}>
            <span className="status-dot" />
            {saved ? "저장됨" : "변경사항 있음"}
          </span>
          <IconButton
            label="시나리오 데이터 열기"
            onClick={() => setProject(true)}
          >
            <FolderOpen size={17} />
          </IconButton>
          <IconButton label="시나리오 저장 (⌘S)" onClick={save}>
            <Save size={17} />
          </IconButton>
          <button className="button primary" onClick={openReport}>
            <FileDown size={16} />
            진단 리포트
          </button>
          <IconButton label="사용 안내" onClick={() => setHelp(true)}>
            <CircleHelp size={16} />
          </IconButton>
        </header>
        <div className="workspace">
          {tab !== "space" && (
            <div className="workspace-heading no-print">
              <div>
                <div className="eyebrow">
                  ROBOSPACE FIT / {definition.industry}
                </div>
                <h1>
                  {
                    {
                      compare: "배치 후보 비교",
                      paths: "작업 동선 검토",
                      roi: "경제성 분석",
                      report: "공간 진단 리포트",
                    }[tab]
                  }
                </h1>
                <p>{scenario.name} · 가상 테스트베드</p>
              </div>
              <button className="button" onClick={() => setTab("space")}>
                <Box size={15} />
                3D 공간으로 돌아가기
              </button>
            </div>
          )}
          <section
            className={
              "scene-stage no-print " + (tab !== "space" ? "scene-hidden" : "")
            }
          >
            <FactoryViewer
              key={definition.slug + (robotModel?.id ?? "default")}
              definition={definition}
              ref={viewer}
              scenario={scenario}
              candidateId={selected}
              layers={tour.active ? { ...layers, factory: true, equipment: true, reach: true, paths: true } : layers}
              tourActive={tour.active}
              tourPaused={tour.paused}
              view={view}
              placing={placing}
              playing={playing}
              onSelect={choose}
              onPlace={place}
              onLoaded={setLoaded}
              model={robotModel}
              motionPlan={motionPlan}
              snap={snap}
              studioOpen={robotStudio || layoutOpen}
              placementDraft={placementDraft}
              selectedAsset={selectedAsset}
              assetPlaying={assetPlaying}
              onAssetSelect={selectPlaced}
              onDraftMove={(position) =>
                setPlacementDraft((d) => (d ? { ...d, position } : null))
              }
              onAssetStatus={setAssetStatus}
              onAssetError={() =>
                toast.error(
                  "배치한 설비 모델을 불러오지 못했습니다. 새로고침 후 다시 시도해주세요.",
                )
              }
              onTelemetry={setTelemetry}
            />
            <div className="viewport-bar">
              <span>
                <span className="status-dot" />
                {loaded ? "공간 모델 준비됨" : "모델 불러오는 중"}
                <span className="viewport-divider" />
                SCENARIO MODE
              </span>
              <span className="subtle">
                {scenario.factory.width} × {scenario.factory.depth} m{" "}
                <span>·</span> METRIC
              </span>
              <div className="view-switch">
                <button
                  className={view === "3d" ? "active" : ""}
                  onClick={() => setView("3d")}
                >
                  3D
                </button>
                <button
                  className={view === "2d" ? "active" : ""}
                  onClick={() => setView("2d")}
                >
                  2D
                </button>
              </div>
            </div>
            <button
              className="button primary layout-launch"
              data-tour="add-equipment"
              aria-describedby={tour.ready ? "tour-instruction" : undefined}
              onClick={openLibrary}
              disabled={!!placementDraft}
            >
              <Plus size={16} />
              설비·로봇 추가
            </button>
            {!layoutOpen && (scenario.placedAssets?.length ?? 0) > 0 && (
              <button
                className="button glass layout-list-launch"
                onClick={() => {
                  setLayoutOpen(true);
                  setRobotStudio(false);
                }}
              >
                배치 목록 · {scenario.placedAssets!.length}대
              </button>
            )}
            {showLeft && !robotStudio && !layoutOpen && (
              <aside className="scene-sidebar glass">
                <div className="panel-heading">
                  <span>
                    공간 분석 요약 <small>OVERVIEW</small>
                  </span>
                  <button
                    className="plain-button"
                    aria-label="공간 구성 닫기"
                    onClick={() => setShowLeft(false)}
                  >
                    <PanelLeftClose size={15} />
                  </button>
                </div>
                <OverviewPanel
                  scenario={scenario}
                  analysis={analysis}
                  roi={roi}
                />
                <details className="layer-details">
                  <summary>
                    <Layers3 size={14} /> 공간 레이어{" "}
                    <span>
                      {Object.values(layers).filter(Boolean).length} / 6
                    </span>
                  </summary>
                  {(Object.keys(layerNames) as (keyof Layers)[]).map((k) => (
                    <div className="layer-row" key={k}>
                      <label htmlFor={"layer-" + k}>{layerNames[k]}</label>
                      <Switch
                        id={"layer-" + k}
                        size="sm"
                        checked={layers[k]}
                        onCheckedChange={(v) =>
                          setLayers((s) => ({ ...s, [k]: v }))
                        }
                      />
                    </div>
                  ))}
                </details>
                <div className="compact-candidates">
                  <CandidateMonitor
                    scenario={scenario}
                    analyses={analyses}
                    selected={selected}
                    onSelect={choose}
                    onCompare={() => setTab("compare")}
                  />
                </div>
              </aside>
            )}
            {!showLeft && !robotStudio && !layoutOpen && (
              <button
                className="sidebar-restore glass"
                aria-label="공간 구성 열기"
                onClick={() => setShowLeft(true)}
              >
                <PanelLeftOpen size={19} />
              </button>
            )}
            <div className="scene-caption">
              <span>
                {definition.industry} /{" "}
                {String(factories.indexOf(definition) + 1).padStart(2, "0")}
              </span>
              <span>가상 공정 · 공간 배치 검토</span>
            </div>
            <aside
              className="candidate-monitor glass"
              style={
                robotStudio || layoutOpen ? { display: "none" } : undefined
              }
            >
              <CandidateMonitor
                scenario={scenario}
                analyses={analyses}
                selected={selected}
                onSelect={choose}
                onCompare={() => setTab("compare")}
              />
            </aside>
            <aside
              className="inspector glass"
              style={
                robotStudio || layoutOpen ? { display: "none" } : undefined
              }
            >
              <div className="panel-heading">
                <span>
                  배치 상세 <small>ROBOT / {selected}</small>
                </span>
                <Settings2 size={15} />
              </div>
              <div className="inspector-title">
                <span className="candidate-letter">{selected}</span>
                <div>
                  <h2>{scenario.robot.name}</h2>
                  <p>
                    {robotModel
                      ? `${robotModel.category} · ${robotModel.payloadKg} kg`
                      : definition.robotDescription}
                  </p>
                </div>
              </div>
              <button
                className="button primary wide robot-studio-launch"
                onClick={() => {
                  setRobotStudio(true);
                  setPlacing(false);
                }}
              >
                <Move3D size={16} />
                로봇 선택·배치·시뮬레이션
                <ArrowUpRight size={15} />
              </button>
              <div className="inspector-preview">
                <FloorPlan
                  scenario={scenario}
                  selected={selected}
                  onSelect={choose}
                />
                <span>배치 평면도 · LIVE</span>
              </div>
              <div className="score-overview">
                <div className="score-heading">
                  <span>배치 적합도</span>
                  <b className={analysis.status}>
                    {analysis.score}
                    <small>/100</small>
                  </b>
                </div>
                <div className={"metric-track " + analysis.status}>
                  <i style={{ width: analysis.score + "%" }} />
                </div>
                <div className="score-caption">
                  <b className={analysis.status}>
                    {statusText[analysis.status]}
                  </b>
                  <span>
                    {analysis.reasons.length
                      ? `${analysis.reasons.length}개 검토 항목`
                      : "설정 조건 충족"}
                  </span>
                </div>
              </div>
              <div className="metric-row">
                <span>작업점 도달</span>
                <b
                  className={
                    analysis.allTargetsReachable ? "accent-blue" : "amber"
                  }
                >
                  {analysis.reach.filter((r) => r.reachable).length} /{" "}
                  {analysis.reach.length} <small>지점</small>
                </b>
              </div>
              <div className="reach-details">
                {analysis.reach.map((r) => (
                  <span key={r.targetId}>
                    {r.targetId.toUpperCase()}
                    <b className={!r.reachable ? "amber" : ""}>
                      {r.distance.toFixed(2)}m{" "}
                      {r.reachable ? (
                        <Check size={11} />
                      ) : (
                        <TriangleAlert size={11} />
                      )}
                    </b>
                  </span>
                ))}
              </div>
              <div className="metric-row">
                <span>베이스 간섭</span>
                <b
                  className={
                    analysis.footprintCollisions.length
                      ? "coral"
                      : "accent-blue"
                  }
                >
                  {analysis.footprintCollisions.length
                    ? `${analysis.footprintCollisions.length}건`
                    : "없음"}
                </b>
              </div>
              <div className="metric-row">
                <span>최소 설비 이격</span>
                <b>
                  {number(analysis.minClearance)} <small>m</small>
                </b>
              </div>
              <div className="metric-row">
                <span>동선 포락선 겹침</span>
                <b
                  className={
                    analysis.pathways.some((p) => p.envelopeIntersects)
                      ? "amber"
                      : "accent-blue"
                  }
                >
                  {analysis.pathways.filter((p) => p.envelopeIntersects).length}{" "}
                  <small>건</small>
                </b>
              </div>
              <button
                className={"button wide " + (editing ? "" : "primary")}
                onClick={() => {
                  setEditing((v) => !v);
                  setPlacing(false);
                }}
              >
                <Crosshair size={16} />
                {editing ? "위치 편집 닫기" : "후보 위치 편집"}
                <ArrowUpRight size={15} />
              </button>
              {editing && (
                <div className="position-editor">
                  <div className="coordinate-fields">
                    <NumberField
                      label="X 좌표"
                      value={candidate.position.x}
                      min={baseBounds.minX}
                      max={baseBounds.maxX}
                      step={0.05}
                      onChange={(v) => place({ x: v, y: candidate.position.y })}
                      unit="m"
                    />
                    <NumberField
                      label="Y 좌표"
                      value={candidate.position.y}
                      min={baseBounds.minY}
                      max={baseBounds.maxY}
                      step={0.05}
                      onChange={(v) => place({ x: candidate.position.x, y: v })}
                      unit="m"
                    />
                  </div>
                  <button
                    className={"button wide " + (placing ? "primary" : "")}
                    onClick={() => {
                      setPlacing((v) => !v);
                      viewer.current?.focus("cell");
                    }}
                  >
                    <MousePointer2 size={15} />
                    {placing ? "바닥에서 위치 선택 중…" : "장면에서 위치 지정"}
                  </button>
                  <div className="slider-field">
                    <label>
                      작업반경<b>{scenario.robot.reach.toFixed(2)} m</b>
                    </label>
                    <Slider
                      aria-label="로봇 작업반경"
                      disabled={!!robotModel}
                      value={[scenario.robot.reach]}
                      min={0.5}
                      max={3}
                      step={0.05}
                      onValueChange={([v]) =>
                        update({
                          ...scenario,
                          robot: { ...scenario.robot, reach: v },
                        })
                      }
                    />
                  </div>
                  <div className="slider-field">
                    <label>
                      설비 이격 여유
                      <b>{scenario.robot.safetyBuffer.toFixed(2)} m</b>
                    </label>
                    <Slider
                      aria-label="설비 이격 여유"
                      value={[scenario.robot.safetyBuffer]}
                      min={0}
                      max={1.5}
                      step={0.05}
                      onValueChange={([v]) =>
                        update({
                          ...scenario,
                          robot: { ...scenario.robot, safetyBuffer: v },
                        })
                      }
                    />
                  </div>
                </div>
              )}
              <details className="analysis-details">
                <summary>
                  검토 근거 및 개선 의견
                  <Info size={13} />
                </summary>
                {analysis.reasons.length ? (
                  <ul>
                    {analysis.reasons.map((r) => (
                      <li key={r.label}>
                        {r.label}
                        <b>−{r.penalty}</b>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>도달, 베이스 배치, 설정 이격, 동선 조건을 충족합니다.</p>
                )}
                <p>100점에서 각 검토 항목을 감점합니다.</p>
                {analysis.recommendations.map((r) => (
                  <p key={r}>{r}</p>
                ))}
              </details>
              <p className="fineprint">
                2D 사전검토 · 실제 안전성·관절 궤적 검증 제외
              </p>
            </aside>
            {layoutOpen && (
              <PlacementPanel
                scenario={placementContext(scenario, selected)}
                draft={placementDraft}
                selected={selectedAsset}
                status={assetStatus}
                snap={snap}
                playing={assetPlaying}
                canUndo={history.current.past.length > 0}
                canRedo={history.current.future.length > 0}
                onAdd={openLibrary}
                onClose={() => {
                  setLayoutOpen(false);
                  setPlacementDraft(null);
                  setAssetPlaying(false);
                }}
                onSelect={selectPlaced}
                onDraft={setPlacementDraft}
                onConfirm={confirmPlacement}
                onCancel={() => setPlacementDraft(null)}
                onEdit={() => {
                  const item = scenario.placedAssets?.find(
                    (i) => i.id === selectedAsset,
                  );
                  if (item) beginPlacement(item.assetId, item);
                }}
                onDuplicate={() => {
                  const item = scenario.placedAssets?.find(
                    (i) => i.id === selectedAsset,
                  );
                  if (item) {
                    const copy = {
                      ...structuredClone(item),
                      id: crypto.randomUUID(),
                      name: nextAssetName(item.assetId),
                      position: suggestPlacement(
                        item.assetId,
                        placementContext(scenario, selected),
                        scenario.placedAssets ?? [],
                      ),
                    };
                    beginPlacement(copy.assetId, copy);
                  }
                }}
                onDelete={() => {
                  commitLayout(
                    (scenario.placedAssets ?? []).filter(
                      (i) => i.id !== selectedAsset,
                    ),
                  );
                  setSelectedAsset(null);
                  setAssetPlaying(false);
                }}
                onFocus={() => {
                  const item =
                    placementDraft ??
                    scenario.placedAssets?.find((i) => i.id === selectedAsset);
                  if (item) {
                    setView("3d");
                    requestAnimationFrame(() =>
                      viewer.current?.focusAsset(item),
                    );
                  }
                }}
                onSnap={setSnap}
                onUndo={undo}
                onRedo={redo}
                onPlaying={() => setAssetPlaying((v) => !v)}
                onPose={(joints) =>
                  update({
                    ...scenario,
                    placedAssets: (scenario.placedAssets ?? []).map((i) =>
                      i.id === selectedAsset ? { ...i, joints } : i,
                    ),
                  })
                }
                onReference={(showReferenceRobot) =>
                  update({ ...scenario, showReferenceRobot })
                }
              />
            )}
            {robotStudio && !layoutOpen && (
              <RobotStudio
                scenario={scenario}
                candidate={candidate}
                telemetry={telemetry}
                playing={playing}
                placing={placing}
                snap={snap}
                canUndo={history.current.past.length > 0}
                canRedo={history.current.future.length > 0}
                onChange={update}
                onSelect={choose}
                onPlaying={setPlaying}
                onPlacing={setPlacing}
                onSnap={setSnap}
                onClose={() => {
                  setRobotStudio(false);
                  setPlacing(false);
                }}
                onFocus={() => {
                  setView("3d");
                  viewer.current?.focus("cell");
                }}
                onSeek={(v) => viewer.current?.seek(v)}
                onUndo={undo}
                onRedo={redo}
              />
            )}
            {placing && (
              <div className="placing-hint glass">
                <Crosshair size={17} />새 로봇 위치를 바닥에서 선택하세요
                <button onClick={() => setPlacing(false)}>취소</button>
              </div>
            )}
            {object && (
              <div className="object-info glass">
                <Box size={15} />
                <span>
                  {scenario.equipment.find((e) => e.id === object)?.name ??
                    object.replaceAll("_", " ")}
                </span>
                <button aria-label="선택 해제" onClick={() => setObject("")}>
                  ×
                </button>
              </div>
            )}
            <div className="viewport-bottom">
              <div className="glass legend">
                <span>
                  <i className="accent-blue-bg" />
                  작업 범위
                </span>
                <span>
                  <i className="amber-bg" />
                  작업자 동선
                </span>
                <span>
                  <i className="blue-bg" />
                  대차 동선
                </span>
              </div>
              <div className="glass simulation-control">
                <IconButton
                  label={playing ? "동작 예시 일시정지" : "동작 예시 재생"}
                  onClick={() => {
                    if (
                      program?.mode === "teach" &&
                      program.waypoints.length < 2
                    ) {
                      toast.info("저장 자세를 2개 이상 추가하세요.");
                      setRobotStudio(true);
                      return;
                    }
                    setPlaying((v) => !v);
                  }}
                >
                  {playing ? <Pause size={15} /> : <Play size={15} />}
                </IconButton>
                <span>
                  {robotModel ? "관절 시뮬레이션" : "동작 예시"}
                  <small>
                    {robotModel
                      ? `${telemetry?.elapsed.toFixed(1) ?? "0.0"} s · ${program!.speed * 100}%`
                      : "로봇 라이브러리에서 확장"}
                  </small>
                </span>
                <span
                  className={"simulation-bars " + (playing ? "playing" : "")}
                >
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                  <i />
                </span>
              </div>
              <div className="glass viewport-tools">
                <IconButton
                  label="로봇 라이브러리와 배치 도구"
                  active={robotStudio}
                  onClick={() => {
                    setLayoutOpen(false);
                    setPlacementDraft(null);
                    setAssetPlaying(false);
                    setRobotStudio((v) => !v);
                  }}
                >
                  <Move3D size={17} />
                </IconButton>
                <IconButton
                  label="공장 전체 보기 (1)"
                  onClick={() => {
                    setView("3d");
                    viewer.current?.focus("overview");
                  }}
                >
                  <Maximize size={17} />
                </IconButton>
                <IconButton
                  label="로봇 셀 확대 (2)"
                  onClick={() => {
                    setView("3d");
                    viewer.current?.focus("cell");
                  }}
                >
                  <Crosshair size={17} />
                </IconButton>
                <IconButton
                  label="확대"
                  onClick={() => viewer.current?.zoom(1)}
                >
                  <Plus size={18} />
                </IconButton>
                <IconButton
                  label="축소"
                  onClick={() => viewer.current?.zoom(-1)}
                >
                  <Minus size={18} />
                </IconButton>
                <IconButton label="장면 이미지 저장" onClick={capture}>
                  <ImageDown size={16} />
                </IconButton>
                <IconButton label="튜토리얼과 사용 안내" onClick={() => setHelp(true)}>
                  <CircleHelp size={17} />
                </IconButton>
              </div>
            </div>
          </section>
          {tab === "compare" && (
            <ComparePanel
              scenario={scenario}
              analyses={analyses}
              selected={selected}
              onSelect={(id) => {
                choose(id);
                setTab("space");
                setTimeout(() => viewer.current?.focus("cell"), 50);
              }}
            />
          )}
          {tab === "paths" && (
            <PathwayPanel
              scenario={scenario}
              selected={selected}
              onChange={update}
            />
          )}
          {tab === "roi" && (
            <RoiPanel
              scenario={scenario}
              onChange={(roi) => update({ ...scenario, roi })}
            />
          )}
          {tab === "report" && (
            <ReportPanel
              scenario={scenario}
              analyses={analyses}
              selected={selected}
              image={reportImage}
              date={reportDate}
              onCapture={() => {
                setTab("space");
                toast.info(
                  "원하는 구도로 조정한 뒤 진단 리포트를 다시 여세요.",
                );
              }}
            />
          )}
          {tab === "space" && (
            <div className="workflow-strip no-print">
              <div>
                <span className="workflow-icon">
                  <Crosshair size={17} />
                </span>
                <span>
                  선택한 후보 <b>{selected}</b>
                </span>
                <span className="strip-divider" />
                <span>
                  평면 작업점 도달{" "}
                  <b>{analysis.allTargetsReachable ? "충족" : "검토 필요"}</b>
                </span>
              </div>
              <div>
                <span>
                  예상 회수기간{" "}
                  <b>
                    {roi.paybackMonths?.toFixed(1) ?? "—"}
                    <small>개월</small>
                  </b>
                </span>
                <button onClick={() => setTab("roi")}>
                  경제성 검토
                  <ArrowUpRight size={14} />
                </button>
              </div>
            </div>
          )}
          <footer className="statusbar no-print">
            <span>
              ROBOSPACE FIT <span className="status-divider">/</span> SCENARIO
              STUDIO
            </span>
            <span>
              {scenario.factory.width} × {scenario.factory.depth} m{" "}
              <span>·</span> 가상 공장 · 평면 기반 사전검토
            </span>
            <span>
              <span className="status-dot" />
              {saved ? "로컬 저장됨" : "시나리오 편집 중"}
            </span>
          </footer>
        </div>
        <EquipmentLibrary
          open={assetLibrary}
          onOpenChange={setAssetLibrary}
          onChoose={beginPlacement}
          count={scenario.placedAssets?.length ?? 0}
        />
        <FactoryTour tour={tour} viewer={viewer} />
        <Dialog open={help} onOpenChange={setHelp}>
          <DialogContent className="studio-dialog">
            <DialogTitle>공간분석 스튜디오 사용 안내</DialogTitle>
            <DialogDescription>
              장면을 둘러보고, 후보를 바꾸고, 필요한 개선을 확인하세요.
            </DialogDescription>
            <button className="button tutorial-replay" disabled={!loaded || !!placementDraft} onClick={tour.start}>
              <Play size={17} /> 사용법 튜토리얼 다시 보기 <span>약 11초</span>
            </button>
            {placementDraft && <p className="subtle">현재 배치를 확정하거나 취소한 뒤 튜토리얼을 다시 볼 수 있습니다.</p>}
            <div className="help-grid">
              <div>
                <Move3D />
                <b>공간 탐색</b>
                <p>
                  드래그로 회전 · 스크롤로 확대
                  <br />
                  우클릭 드래그로 이동 · 터치 두 손가락 확대
                </p>
              </div>
              <div>
                <Crosshair />
                <b>후보 위치 편집</b>
                <p>
                  좌표를 입력하거나 바닥에서 지정하세요. 반경과 여유 값도 조정할
                  수 있습니다.
                </p>
              </div>
              <div>
                <Save />
                <b>시나리오 보관</b>
                <p>
                  ⌘/Ctrl + S로 이 브라우저에 저장합니다. 다른 기기에는 JSON
                  내보내기·가져오기를 사용하세요.
                </p>
              </div>
              <div>
                <FileText />
                <b>진단 리포트</b>
                <p>
                  현재 입력과 분석 결과를 담습니다. 인쇄 화면에서 PDF로 저장할
                  수 있습니다.
                </p>
              </div>
            </div>
            <div className="notice">
              <Info size={17} />
              <p>
                본 공장들은 공정별 로봇 배치 검토를 위해 만든 가상
                테스트베드입니다. 실제 설치를 위한 정밀 궤적·안전성 검증은
                포함하지 않습니다.
              </p>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={catalog} onOpenChange={setCatalog}>
          <DialogContent className="studio-dialog factory-catalog">
            <div className="catalog-heading">
              <span className="eyebrow">FACTORY SCENARIOS / 04</span>
              <DialogTitle>다른 공정, 다른 공간.</DialogTitle>
              <DialogDescription>
                공장을 선택하면 설비·로봇·배치 후보·경제성 가정이 함께
                전환됩니다.
              </DialogDescription>
            </div>
            <div className="factory-cards">
              {factories.map((f, i) => (
                <button
                  key={f.slug}
                  className={
                    "factory-card " +
                    (definition.slug === f.slug ? "selected" : "")
                  }
                  onClick={() => switchFactory(f)}
                  aria-pressed={definition.slug === f.slug}
                >
                  <div className="factory-card-image">
                    <img
                      src={f.assets.thumbnail}
                      alt={`${f.title} 3D 공간 미리보기`}
                    />
                    <span className="factory-index">0{i + 1}</span>
                    {definition.slug === f.slug && (
                      <span className="factory-current">
                        <Check size={12} /> 현재 공장
                      </span>
                    )}
                  </div>
                  <div className="factory-card-body">
                    <span className="eyebrow">{f.industry}</span>
                    <h3>
                      {f.title}
                      <ArrowUpRight size={17} />
                    </h3>
                    <p>{f.description}</p>
                    <div className="factory-specs">
                      <span>
                        {f.scenario.factory.width} × {f.scenario.factory.depth}{" "}
                        m
                      </span>
                      <span>{f.scenario.equipment.length}개 공간 객체</span>
                      <span>{f.scenario.robot.name}</span>
                    </div>
                  </div>
                </button>
              ))}
            </div>
            <div className="catalog-footer">
              <p>
                공장별 편집값은 전환 중 유지됩니다. 다음 방문에도 보관하려면
                저장하세요.
              </p>
              <button
                className="button"
                onClick={() => {
                  setCatalog(false);
                  setProject(true);
                }}
              >
                <FolderOpen size={15} />
                현재 시나리오 데이터
              </button>
            </div>
          </DialogContent>
        </Dialog>
        <Dialog open={project} onOpenChange={setProject}>
          <DialogContent className="studio-dialog project-dialog">
            <DialogTitle>시나리오 데이터</DialogTitle>
            <DialogDescription>
              현재 기기에 보관하거나 JSON으로 다른 작업 환경에 옮기세요.
            </DialogDescription>
            <label className="project-name">
              프로젝트 이름
              <input
                value={scenario.name}
                maxLength={160}
                onChange={(e) => {
                  if (e.target.value.trim())
                    update({ ...scenario, name: e.target.value });
                }}
              />
            </label>
            <div className="project-actions">
              <button className="button" onClick={save}>
                <Save size={17} />이 브라우저에 저장
              </button>
              <button className="button" onClick={exportScenario}>
                <Download size={17} />
                JSON 내보내기
              </button>
              <button className="button" onClick={() => file.current?.click()}>
                <FolderOpen size={17} />
                JSON 가져오기
              </button>
              <button
                className="button"
                onClick={() => {
                  setProject(false);
                  setReset(true);
                }}
              >
                <RotateCcw size={17} />
                기본 시나리오로 복원
              </button>
            </div>
            <p className="method-note">
              JSON에는 공간 객체·후보 좌표·로봇 가정·ROI 입력값이 포함됩니다. 네
              공장의 편집값을 가져오면 해당 모델도 함께 열립니다. 공장 경계와
              설비 형상이 일치하는 파일만 허용합니다.
            </p>
            <div className="model-downloads">
              <span>3D 모델 · 기본 진단 샘플</span>
              <div>
                <a className="button" href={definition.assets.blend} download>
                  Blender 원본
                </a>
                <a className="button" href={definition.assets.factory} download>
                  공장 GLB
                </a>
                <a className="button" href={definition.assets.robot} download>
                  로봇 GLB
                </a>
                <a
                  className="button"
                  href="/reports/robospace-fit-demo-feasibility.pdf"
                  download
                >
                  식품 공장 샘플 PDF
                </a>
              </div>
            </div>
            <details className="mobile-layer-options">
              <summary>3D 레이어 표시</summary>
              {(Object.keys(layerNames) as (keyof Layers)[]).map((k) => (
                <div className="layer-row" key={k}>
                  <label htmlFor={"mobile-layer-" + k}>{layerNames[k]}</label>
                  <Switch
                    id={"mobile-layer-" + k}
                    checked={layers[k]}
                    onCheckedChange={(v) =>
                      setLayers((s) => ({ ...s, [k]: v }))
                    }
                  />
                </div>
              ))}
            </details>
            <details className="target-editor">
              <summary>작업점·통로 조건 편집</summary>
              <div className="coordinate-fields">
                {scenario.targets.map((t) => (
                  <div key={t.id}>
                    <b>{t.name}</b>
                    <NumberField
                      label={`${t.id} X`}
                      value={t.position.x}
                      min={bounds.minX}
                      max={bounds.maxX}
                      step={0.1}
                      onChange={(v) =>
                        update({
                          ...scenario,
                          targets: scenario.targets.map((x) =>
                            x.id === t.id
                              ? { ...x, position: { ...x.position, x: v } }
                              : x,
                          ),
                        })
                      }
                    />
                    <NumberField
                      label={`${t.id} Y`}
                      value={t.position.y}
                      min={bounds.minY}
                      max={bounds.maxY}
                      step={0.1}
                      onChange={(v) =>
                        update({
                          ...scenario,
                          targets: scenario.targets.map((x) =>
                            x.id === t.id
                              ? { ...x, position: { ...x.position, y: v } }
                              : x,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              {scenario.pathways.map((p) => (
                <NumberField
                  key={p.id}
                  label={p.name + " 폭"}
                  unit="m"
                  value={p.width}
                  min={0.1}
                  max={5}
                  step={0.1}
                  onChange={(v) =>
                    update({
                      ...scenario,
                      pathways: scenario.pathways.map((x) =>
                        x.id === p.id ? { ...x, width: v } : x,
                      ),
                    })
                  }
                />
              ))}
            </details>
          </DialogContent>
        </Dialog>
        <Dialog open={reset} onOpenChange={setReset}>
          <DialogContent className="studio-dialog">
            <DialogTitle>기본 시나리오로 복원</DialogTitle>
            <DialogDescription>
              현재 선택한 공장의 입력을 초기 시나리오로 바꿉니다. 저장된
              시나리오는 다음 저장 전까지 유지됩니다.
            </DialogDescription>
            <div className="dialog-actions">
              <button className="button" onClick={() => setReset(false)}>
                취소
              </button>
              <button
                className="button primary"
                onClick={() => {
                  update(structuredClone(definition.scenario));
                  setSelected("A");
                  setReset(false);
                  setPlacementDraft(null);
                  setSelectedAsset(null);
                  setAssetPlaying(false);
                  toast.success("기본 시나리오를 복원했습니다.");
                }}
              >
                복원하기
              </button>
            </div>
          </DialogContent>
        </Dialog>
        <input
          ref={file}
          className="hidden"
          type="file"
          accept=".json,application/json"
          aria-label="시나리오 JSON 파일"
          onChange={(e) => {
            if (e.target.files?.[0]) void importScenario(e.target.files[0]);
          }}
        />
      </main>
    </TooltipProvider>
  );
}
