"use client";
import { ArrowUpRight, Check, Crosshair, TriangleAlert } from "lucide-react";
import type { Scenario, Analysis } from "@/lib/engine";
import { computeRoi } from "@/lib/engine";
import { statusText } from "@/components/analysis-panels";

export function OverviewPanel({
  scenario,
  analysis,
  roi,
}: {
  scenario: Scenario;
  analysis: Analysis;
  roi: ReturnType<typeof computeRoi>;
}) {
  const reached = analysis.reach.filter((r) => r.reachable).length;
  return (
    <>
      <div className="overview-kpis">
        <div>
          <span>배치 점수</span>
          <b>
            {analysis.score}
            <small>/100</small>
          </b>
        </div>
        <div>
          <span>도달 지점</span>
          <b>
            {reached}
            <small>/{analysis.reach.length}</small>
          </b>
        </div>
        <div>
          <span>간섭 검출</span>
          <b className={analysis.footprintCollisions.length ? "coral" : ""}>
            {analysis.footprintCollisions.length}
            <small>건</small>
          </b>
        </div>
      </div>
      <div className="micro-heading">
        작업 반경 검토 <span>{scenario.robot.reach.toFixed(2)} m</span>
      </div>
      <div className="overview-reach">
        {analysis.reach.map((r) => (
          <div key={r.targetId}>
            <span>
              {r.targetId.toUpperCase()}
              <b className={!r.reachable ? "amber" : ""}>
                {r.distance.toFixed(2)} m
              </b>
            </span>
            <div className={"metric-track " + (!r.reachable ? "review" : "")}>
              <i
                style={{
                  width:
                    Math.min((r.distance / scenario.robot.reach) * 100, 100) +
                    "%",
                }}
              />
            </div>
          </div>
        ))}
      </div>
      <div className="overview-footer">
        <span>예상 투자 회수</span>
        <b>
          {roi.paybackMonths?.toFixed(1) ?? "—"}
          <small>개월</small>
        </b>
      </div>
    </>
  );
}

export function CandidateMonitor({
  scenario,
  analyses,
  selected,
  onSelect,
  onCompare,
}: {
  scenario: Scenario;
  analyses: Analysis[];
  selected: string;
  onSelect: (id: string) => void;
  onCompare: () => void;
}) {
  return (
    <>
      <div className="panel-heading">
        <span>
          후보 상태 <small>CANDIDATES</small>
        </span>
        <span className="count-badge">{analyses.length}</span>
      </div>
      <div className="candidate-summary">
        <div>
          <b>{analyses.length}</b>
          <span>배치 후보</span>
        </div>
        <div>
          <b>{analyses.filter((a) => a.allTargetsReachable).length}</b>
          <span>도달 충족</span>
        </div>
        <div>
          <b>{analyses.filter((a) => a.status === "recommended").length}</b>
          <span>우선 검토</span>
        </div>
      </div>
      <div className="monitor-cards">
        {analyses.map((a) => (
          <button
            key={a.candidateId}
            className={
              "monitor-card " +
              a.status +
              (selected === a.candidateId ? " selected" : "")
            }
            aria-label={`후보 ${a.candidateId} 선택`}
            aria-pressed={selected === a.candidateId}
            onClick={() => onSelect(a.candidateId)}
          >
            <div className="monitor-card-heading">
              <b data-candidate={a.candidateId}>
                {scenario.robot.name.split(" ")[0]} / {a.candidateId}
              </b>
              <span>
                {selected === a.candidateId ? (
                  <>
                    <span className="status-dot" />
                    선택됨
                  </>
                ) : (
                  "대안"
                )}
              </span>
            </div>
            <p>{a.candidateName}</p>
            <div className="monitor-state">
              <span>{statusText[a.status]}</span>
              {a.status === "recommended" ? (
                <Check size={12} />
              ) : (
                <TriangleAlert size={12} />
              )}
            </div>
            <div className="monitor-score">
              <span>배치 점수</span>
              <b>
                {a.score}
                <small>/100</small>
              </b>
            </div>
            <div className={"metric-track " + a.status}>
              <i style={{ width: a.score + "%" }} />
            </div>
            <div className="monitor-data">
              <span>
                작업점 도달
                <b>
                  {a.reach.filter((r) => r.reachable).length} / {a.reach.length}
                </b>
              </span>
              <span>
                최소 이격<b>{a.minClearance?.toFixed(2) ?? "—"} m</b>
              </span>
            </div>
          </button>
        ))}
      </div>
      <button className="text-button" onClick={onCompare}>
        후보 상세 비교
        <ArrowUpRight size={13} />
      </button>
      <div className="monitor-note">
        <Crosshair size={12} />
        <span>
          {scenario.robot.name} ·{" "}
          {scenario.robotProgram ? "제조사 공시 제원" : "가상 제원"}
        </span>
      </div>
    </>
  );
}
