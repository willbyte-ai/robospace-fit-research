"use client";
import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { Pause, Play } from "lucide-react";
import type { ViewerHandle } from "./factory-viewer";
import { fitTourRect, tourCardPosition, type TourRect } from "@/lib/tour-layout";

const STORAGE_KEY = "robospace-fit.tutorial.v1";
const STEPS = [
  { mode: "cell", travel: 1.6, hold: 1.5, title: "공간을 먼저 이해하세요", description: "공장 안의 로봇과 주변 설비를 가까이 살펴봅니다." },
  { mode: "range", travel: 1.35, hold: 1.5, title: "작업 반경과 동선을 함께", description: "원의 작업 범위와 작업자·대차의 이동 경로를 확인하세요." },
  { mode: "overview", travel: 1.3, hold: 1.7, title: "배치를 비교하고 판단하세요", description: "후보 비교부터 동선·경제성 분석, 리포트까지 이어집니다." },
  { mode: "overview", travel: 0, hold: 1.6, title: "첫 설비를 배치해 보세요", description: "설비 선택 → 반투명 미리보기 → 위치 조정 → 배치 확정" },
] as const;

export function useFactoryTour({ loaded, viewer, prepare }: { loaded: boolean; viewer: RefObject<ViewerHandle | null>; prepare: () => void }) {
  const [step, setStep] = useState<number | null>(null);
  const [run, setRun] = useState(0);
  const [arrived, setArrived] = useState("");
  const [promptKey, setPromptKey] = useState("");
  const [paused, setPaused] = useState(false);
  const [reducedMotion, setReducedMotion] = useState(false);
  const checked = useRef(false);
  const prepareRef = useRef(prepare);
  prepareRef.current = prepare;
  const key = `${run}:${step}`;
  const active = step !== null;
  const ready = step === 3 && promptKey === key;
  const start = useCallback(() => {
    prepareRef.current();
    setReducedMotion(window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    setRun(v => v + 1);
    setArrived("");
    setPromptKey("");
    setPaused(false);
    setStep(0);
  }, []);
  const next = useCallback(() => {
    setArrived("");
    setStep(v => v === null ? null : Math.min(3, v + 1));
  }, []);
  const finish = useCallback((reason: "completed" | "skipped") => {
    if (reason === "completed" && !ready) return;
    try { localStorage.setItem(STORAGE_KEY, reason); } catch {}
    viewer.current?.stopTour();
    setStep(null);
    if (reason === "skipped") requestAnimationFrame(() => document.querySelector<HTMLButtonElement>('[data-tour="add-equipment"]')?.focus({ preventScroll: true }));
  }, [ready, viewer]);
  useEffect(() => {
    if (!loaded || checked.current) return;
    checked.current = true;
    let seen = false;
    try { seen = !!localStorage.getItem(STORAGE_KEY); } catch {}
    if (!seen) start();
  }, [loaded, start]);
  useEffect(() => {
    if (step === null || !loaded) return;
    let valid = true;
    viewer.current?.tourCamera({ mode: STEPS[step].mode, duration: reducedMotion ? 0 : STEPS[step].travel, reset: step === 0, onArrive: () => { if (valid) setArrived(key); } });
    return () => { valid = false; viewer.current?.stopTour(); };
  }, [step, key, loaded, reducedMotion, viewer]);
  useEffect(() => {
    if (step === null || arrived !== key || paused) return;
    if (reducedMotion) {
      if (step === 3) setPromptKey(key);
      return;
    }
    let frame = 0, elapsed = 0, previous = performance.now();
    const tick = (now: number) => {
      if (!document.hidden) elapsed += Math.min(100, now - previous);
      previous = now;
      if (elapsed >= STEPS[step].hold * 1000) {
        if (step === 3) setPromptKey(key); else next();
      } else frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [step, key, arrived, paused, reducedMotion, next]);
  return { active, step, key, ready, paused, reducedMotion, start, next, finish, togglePause: () => setPaused(v => !v) };
}

export function FactoryTour({ tour, viewer }: { tour: ReturnType<typeof useFactoryTour>; viewer: RefObject<ViewerHandle | null> }) {
  const [geometry, setGeometry] = useState<{ rect: TourRect; width: number; height: number } | null>(null);
  const [displayStep, setDisplayStep] = useState(tour.step ?? 0);
  const [fading, setFading] = useState(false);
  const card = useRef<HTMLDivElement>(null);
  const skip = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (tour.step === null) return;
    if (tour.reducedMotion || tour.step === displayStep) { setDisplayStep(tour.step); setFading(false); return; }
    setFading(true);
    const timer = setTimeout(() => { setDisplayStep(tour.step!); setFading(false); }, 220);
    return () => clearTimeout(timer);
  }, [tour.step, tour.reducedMotion, displayStep]);
  useEffect(() => {
    if (!tour.active) return;
    let frame = 0, previous = 0;
    const measure = (now: number) => {
      if (now - previous > 50 && !document.hidden) {
        previous = now;
        const width = window.innerWidth, height = window.innerHeight;
        const selector = tour.step === 3 ? '[data-tour="add-equipment"]' : tour.step === 2 ? '[data-tour="analysis-tabs"]' : null;
        const element = selector ? document.querySelector(selector) : null;
        const box = element?.getBoundingClientRect();
        const rect = box && box.width > 0 && box.height > 0
          ? { x: box.left - 10, y: box.top - 10, width: box.width + 20, height: box.height + 20 }
          : viewer.current?.tourBounds(tour.step === 1 ? "range" : "cell") ?? { x: width * .28, y: height * .18, width: width * .4, height: height * .5 };
        const fitted = fitTourRect(rect, width, height);
        setGeometry(old => old && old.width === width && old.height === height && Object.keys(fitted).every(k => Math.abs(fitted[k as keyof TourRect] - old.rect[k as keyof TourRect]) < 1) ? old : { rect: fitted, width, height });
      }
      frame = requestAnimationFrame(measure);
    };
    frame = requestAnimationFrame(measure);
    return () => cancelAnimationFrame(frame);
  }, [tour.active, tour.step, viewer]);
  useEffect(() => {
    if (!tour.active) return;
    const target = document.querySelector<HTMLButtonElement>('[data-tour="add-equipment"]');
    const allowed = (node: EventTarget | null) => node instanceof Element && (!!node.closest('[data-tour-control]') || (tour.ready && !!node.closest('[data-tour="add-equipment"]')));
    const guard = (event: Event) => {
      if (!allowed(event.target)) { event.preventDefault(); event.stopImmediatePropagation(); }
    };
    const keys = (event: KeyboardEvent) => {
      if (event.key === "Tab") {
        const options = [...document.querySelectorAll<HTMLButtonElement>('[data-tour-control]'), ...(tour.ready && target ? [target] : [])].filter(el => !el.disabled);
        const index = options.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.shiftKey ? (index <= 0 ? options.length - 1 : index - 1) : (index + 1) % options.length;
        event.preventDefault(); event.stopImmediatePropagation(); options[next]?.focus({ preventScroll: true });
      } else if (event.key === "Escape" || !allowed(event.target)) {
        event.preventDefault(); event.stopImmediatePropagation();
      }
    };
    const focusGuard = (event: FocusEvent) => { if (!allowed(event.target)) skip.current?.focus({ preventScroll: true }); };
    for (const type of ["pointerdown", "click", "dblclick", "contextmenu", "wheel", "touchmove"]) document.addEventListener(type, guard, { capture: true, passive: false });
    document.addEventListener("keydown", keys, true);
    document.addEventListener("focusin", focusGuard);
    if (tour.ready) target?.focus({ preventScroll: true }); else skip.current?.focus({ preventScroll: true });
    return () => {
      for (const type of ["pointerdown", "click", "dblclick", "contextmenu", "wheel", "touchmove"]) document.removeEventListener(type, guard, true);
      document.removeEventListener("keydown", keys, true);
      document.removeEventListener("focusin", focusGuard);
    };
  }, [tour.active, tour.ready]);
  if (!tour.active || !geometry) return null;
  const step = STEPS[displayStep];
  const position = tourCardPosition(geometry.rect, geometry.width, geometry.height, card.current?.offsetHeight ?? 205);
  return createPortal(
    <div className={"factory-tour no-print" + (tour.reducedMotion ? " tour-reduced" : "")} data-testid="factory-tour">
      <div className={"tour-spotlight " + (tour.ready ? "tour-action-ready" : "")} style={{ left: geometry.rect.x, top: geometry.rect.y, width: geometry.rect.width, height: geometry.rect.height }} aria-hidden="true" />
      <div ref={card} className={"tour-guide " + (fading ? "tour-fading" : "")} style={position} role="region" aria-label="사용법 튜토리얼" aria-live="polite">
        <div className="tour-eyebrow">QUICK TOUR <span>{String(displayStep + 1).padStart(2, "0")} / 04</span></div>
        <h2>{step.title}</h2>
        <p id="tour-instruction">{step.description}</p>
        <div className="tour-guide-footer">
          <div className="tour-progress" aria-label={`4단계 중 ${displayStep + 1}단계`}>
            {STEPS.map((_, i) => <i key={i} className={i <= displayStep ? "active" : ""} />)}
          </div>
          {tour.ready ? <span>강조된 추가 버튼으로 시작하세요</span> : tour.reducedMotion ? <button data-tour-control onClick={tour.next}>다음</button> : <button data-tour-control onClick={tour.togglePause} aria-label={tour.paused ? "튜토리얼 계속" : "튜토리얼 일시정지"}>{tour.paused ? <Play size={14} /> : <Pause size={14} />}{tour.paused ? "계속" : "일시정지"}</button>}
        </div>
      </div>
      <button ref={skip} data-tour-control className="tour-skip" onClick={() => tour.finish("skipped")}>튜토리얼 건너뛰기</button>
    </div>, document.body,
  );
}
