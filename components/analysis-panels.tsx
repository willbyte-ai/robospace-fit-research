"use client";
import { useEffect, useState } from "react";
import {
  ArrowUpRight,
  Check,
  TriangleAlert,
  Download,
  Printer,
  ArrowRight,
  MoveRight,
  ShieldCheck,
  Info,
} from "lucide-react";
import {
  Table,
  TableHeader,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
} from "@/components/ui/table";
import {
  type Scenario,
  type Analysis,
  type RoiInputs,
  computeRoi,
  analyzePathways,
} from "@/lib/engine";
export const statusText = {
  recommended: "우선 검토",
  review: "조건부 검토",
  blocked: "위치 변경 필요",
};
export function NumberField({
  label,
  value,
  onChange,
  min = 0,
  max = 10000000000,
  step = 1,
  unit,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}) {
  const [text, setText] = useState(String(value));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => {
    setText(String(value));
    setInvalid(false);
  }, [value]);
  const commit = () => {
    const n = Number(text);
    if (!text.trim() || !Number.isFinite(n) || n < min || n > max) {
      setInvalid(true);
      return;
    }
    setInvalid(false);
    onChange(n);
  };
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input
          type="number"
          inputMode="decimal"
          aria-label={label}
          aria-invalid={invalid}
          value={text}
          min={min}
          max={max}
          step={step}
          onChange={(e) => {
            setText(e.target.value);
            setInvalid(false);
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              commit();
              e.currentTarget.blur();
            }
          }}
        />
        {unit && <small>{unit}</small>}
      </div>
      {invalid && (
        <em>
          {min.toLocaleString()} ~ {max.toLocaleString()} 사이 입력
        </em>
      )}
    </label>
  );
}
export function FloorPlan({
  scenario,
  selected,
  onSelect,
}: {
  scenario: Scenario;
  selected: string;
  onSelect?: (id: string) => void;
}) {
  const transform = (x: number, y: number) => `${x},${-y}`;
  const f = scenario.factory;
  const left = f.center.x - f.width / 2;
  const top = -f.center.y - f.depth / 2;
  const c = scenario.candidates.find((c) => c.id === selected)!;
  return (
    <svg
      className="floor-plan"
      viewBox={`${left - 1} ${top - 1} ${f.width + 2} ${f.depth + 2}`}
      role="img"
      aria-label="설비, 후보 배치, 동선을 표시한 분석 평면도"
    >
      <defs>
        <pattern
          id="plan-grid"
          width="1"
          height="1"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M1 0H0V1"
            fill="none"
            stroke="#ffffff"
            strokeOpacity=".05"
            strokeWidth=".015"
          />
        </pattern>
      </defs>
      <rect
        x={left}
        y={top}
        width={f.width}
        height={f.depth}
        fill="#2f2f2f"
        stroke="#8e8e8e"
        strokeWidth=".08"
      />
      <rect
        x={left}
        y={top}
        width={f.width}
        height={f.depth}
        fill="url(#plan-grid)"
      />
      {scenario.equipment.map((e) =>
        e.footprint.kind === "rect" ? (
          <rect
            key={e.id}
            x={e.footprint.center.x - e.footprint.width / 2}
            y={-e.footprint.center.y - e.footprint.depth / 2}
            width={e.footprint.width}
            height={e.footprint.depth}
            rx=".07"
            fill={e.sweepPolicy === "work-target" ? "#7f7f7f" : "#646464"}
            stroke="#ababab"
            strokeWidth=".04"
          >
            <title>{e.name}</title>
          </rect>
        ) : (
          <circle
            key={e.id}
            cx={e.footprint.center.x}
            cy={-e.footprint.center.y}
            r={e.footprint.radius}
            fill="#646464"
          />
        ),
      )}
      {scenario.pathways.map((p) => (
        <polyline
          key={p.id}
          points={p.points.map((p) => transform(p.x, p.y)).join(" ")}
          fill="none"
          stroke={p.kind === "worker" ? "#a5a5a5" : "#b3b3b3"}
          strokeWidth=".08"
          strokeDasharray=".22 .13"
        />
      ))}
      <circle
        cx={c.position.x}
        cy={-c.position.y}
        r={scenario.robot.reach}
        fill="#afafaf15"
        stroke="#c2c2c2"
        strokeWidth=".05"
      />
      <circle
        cx={c.position.x}
        cy={-c.position.y}
        r={scenario.robot.reach + scenario.robot.safetyBuffer}
        fill="none"
        stroke="#a5a5a5"
        strokeWidth=".035"
        strokeDasharray=".15 .1"
      />
      {scenario.targets.map((t) => (
        <g key={t.id}>
          <line
            x1={c.position.x}
            y1={-c.position.y}
            x2={t.position.x}
            y2={-t.position.y}
            stroke="#cccccc"
            strokeWidth=".025"
          />
          <circle cx={t.position.x} cy={-t.position.y} r=".13" fill="#dcdcdc" />
        </g>
      ))}
      {scenario.candidates.map((c) => (
        <g
          key={c.id}
          onClick={() => onSelect?.(c.id)}
          role={onSelect ? "button" : undefined}
          tabIndex={onSelect ? 0 : undefined}
          onKeyDown={(e) => {
            if (e.key === "Enter") onSelect?.(c.id);
          }}
          aria-label={`후보 ${c.id} 선택`}
          style={{ cursor: onSelect ? "pointer" : "default" }}
        >
          <circle
            cx={c.position.x}
            cy={-c.position.y}
            r=".35"
            fill={selected === c.id ? "#087aff" : "#3f3f3f"}
            stroke="#cbcbcb"
            strokeWidth=".04"
          />
          <text
            x={c.position.x}
            y={-c.position.y + 0.14}
            textAnchor="middle"
            fontSize=".38"
            fill={selected === c.id ? "#2c2c2c" : "#f3f3f3"}
          >
            {c.id}
          </text>
        </g>
      ))}
      <text x={left + 0.5} y={top + f.depth - 0.7} fontSize=".4" fill="#a5a5a5">
        {f.width.toFixed(1)} m × {f.depth.toFixed(1)} m · 가상 테스트베드
      </text>
    </svg>
  );
}
export function ComparePanel({
  scenario,
  analyses,
  selected,
  onSelect,
}: {
  scenario: Scenario;
  analyses: Analysis[];
  selected: string;
  onSelect: (id: string) => void;
}) {
  return (
    <section className="analysis-page">
      <div className="section-head">
        <div className="eyebrow">PLACEMENT STUDY</div>
        <h2>같은 공정, 세 가지 배치.</h2>
        <p>작업점 도달과 공간 제약을 함께 비교하세요.</p>
      </div>
      <div className="compare-cards">
        {analyses.map((a) => (
          <button
            key={a.candidateId}
            onClick={() => onSelect(a.candidateId)}
            className={
              "compare-card glass " +
              (selected === a.candidateId ? "selected" : "")
            }
          >
            <div className="compare-card-top">
              <span className="candidate-letter">{a.candidateId}</span>
              <span className={"status-chip " + a.status}>
                {statusText[a.status]}
              </span>
            </div>
            <h3>{a.candidateName.replace(/후보 [ABC] · /, "")}</h3>
            <FloorPlan scenario={scenario} selected={a.candidateId} />
            <div className="compare-score">
              <span>
                {a.score}
                <small>/ 100</small>
              </span>
              <span>공간 검토 점수</span>
            </div>
            <div className="small-metrics">
              <span>
                작업점 도달{" "}
                <b>
                  {a.reach.filter((r) => r.reachable).length}/{a.reach.length}
                </b>
              </span>
              <span>
                베이스 간섭 <b>{a.footprintCollisions.length}건</b>
              </span>
              <span>
                설비 이격 <b>{a.minClearance?.toFixed(2) ?? "—"} m</b>
              </span>
            </div>
            <div className="select-hint">
              {selected === a.candidateId ? (
                <>
                  <Check size={15} />
                  현재 선택한 후보
                </>
              ) : (
                <>
                  이 배치 검토하기
                  <ArrowUpRight size={16} />
                </>
              )}
            </div>
          </button>
        ))}
      </div>
      <div className="comparison-table glass">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>검토 항목</TableHead>
              {analyses.map((a) => (
                <TableHead key={a.candidateId}>후보 {a.candidateId}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              {
                label: "배치 좌표 (X, Y)",
                values: analyses.map(
                  (a) =>
                    `${a.position.x.toFixed(2)}, ${a.position.y.toFixed(2)} m`,
                ),
              },
              {
                label: "Pick / Place 도달",
                values: analyses.map((a) =>
                  a.reach
                    .map((r) => (r.reachable ? "포함" : "범위 밖"))
                    .join(" / "),
                ),
              },
              {
                label: "작업영역 설비 검토",
                values: analyses.map((a) => `${a.envelopeAdvisories.length}건`),
              },
              {
                label: "동선과 포락선 겹침",
                values: analyses.map(
                  (a) =>
                    `${a.pathways.filter((p) => p.envelopeIntersects).length}건`,
                ),
              },
              {
                label: "설정 이격 여유",
                values: analyses.map(
                  (a) => `${a.safetyMargin?.toFixed(2) ?? "—"} m`,
                ),
              },
            ].map((row) => (
              <TableRow key={row.label}>
                <TableCell>{row.label}</TableCell>
                {row.values.map((v, i) => (
                  <TableCell key={i}>{v}</TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="method-note">
        <Info size={15} />
        점수는 동일 조건의 후보 비교를 위한 규칙 기반 참고값입니다. 설비 겹침,
        도달 범위, 동선과 이격 여유에 따른 감점 근거를 공간분석에서 확인할 수
        있습니다.
      </p>
    </section>
  );
}
const money = (v: number) => Math.round(v / 10000).toLocaleString("ko-KR");
export function RoiPanel({
  scenario,
  onChange,
}: {
  scenario: Scenario;
  onChange: (value: RoiInputs) => void;
}) {
  const roi = computeRoi(scenario.roi);
  const change = (key: keyof RoiInputs, v: number) =>
    onChange({ ...scenario.roi, [key]: v });
  const end = 36;
  const min = Math.min(-scenario.roi.investment, roi.threeYearNetBenefit, 0);
  const max = Math.max(roi.threeYearNetBenefit, 0, 1);
  const y = (value: number) => 195 - ((value - min) / (max - min)) * 160;
  const zero = y(0);
  return (
    <section className="analysis-page">
      <div className="section-head">
        <div className="eyebrow">INVESTMENT OUTLOOK</div>
        <h2>공간의 가능성을, 숫자로.</h2>
        <p>현장 운영 가정을 바꾸며 단순 투자회수기간을 검토하세요.</p>
      </div>
      <div className="roi-layout">
        <div className="glass roi-inputs">
          <h3>운영 및 비용 가정</h3>
          <p className="section-caption">
            각 입력을 수정한 뒤 Enter 또는 다른 항목을 선택하세요.
          </p>
          <div className="roi-fields">
            <NumberField
              label="초기 도입비"
              value={scenario.roi.investment / 10000}
              onChange={(v) => change("investment", v * 10000)}
              unit="만원"
              max={1000000}
            />
            <NumberField
              label="월 유지보수비"
              value={scenario.roi.monthlyMaintenance / 10000}
              onChange={(v) => change("monthlyMaintenance", v * 10000)}
              unit="만원"
              max={100000}
            />
            <NumberField
              label="도입 전 인원"
              value={scenario.roi.workersBefore}
              onChange={(v) => change("workersBefore", v)}
              unit="명"
              max={100}
              step={0.5}
            />
            <NumberField
              label="도입 후 인원"
              value={scenario.roi.workersAfter}
              onChange={(v) => change("workersAfter", v)}
              unit="명"
              max={100}
              step={0.5}
            />
            <NumberField
              label="일 가동시간"
              value={scenario.roi.hoursPerDay}
              onChange={(v) => change("hoursPerDay", v)}
              unit="시간"
              min={0.1}
              max={24}
              step={0.5}
            />
            <NumberField
              label="월 가동일수"
              value={scenario.roi.daysPerMonth}
              onChange={(v) => change("daysPerMonth", v)}
              unit="일"
              min={1}
              max={31}
            />
            <NumberField
              label="시간당 인건비"
              value={scenario.roi.hourlyWage}
              onChange={(v) => change("hourlyWage", v)}
              unit="원"
              max={1000000}
              step={1000}
            />
          </div>
          <div className="roi-formula">
            <span>월 순절감액 계산</span>
            <p>
              (도입 전 − 후 인원) × 일 가동시간 × 월 가동일수 × 시간당 인건비 −
              월 유지보수비
            </p>
          </div>
        </div>
        <div className="roi-results">
          <div className="roi-hero glass">
            <span>예상 투자회수기간</span>
            <div>
              {roi.paybackMonths !== null ? (
                <>
                  {roi.paybackMonths.toFixed(1)}
                  <small>개월</small>
                </>
              ) : (
                <strong>회수 불가</strong>
              )}
            </div>
            <p>
              {roi.paybackMonths !== null
                ? "가동 조건과 인력 대체 가정에 따른 단순 추정"
                : "월 순절감액이 0 이하입니다. 운영 가정을 검토하세요."}
            </p>
            <div className="roi-stats">
              <div>
                <span>월 순절감액</span>
                <b>
                  {money(roi.monthlyNetSavings)}
                  <small>만원</small>
                </b>
              </div>
              <div>
                <span>연간 순절감액</span>
                <b>
                  {money(roi.annualSavings)}
                  <small>만원</small>
                </b>
              </div>
              <div>
                <span>3년 누적 순효과</span>
                <b>
                  {money(roi.threeYearNetBenefit)}
                  <small>만원</small>
                </b>
              </div>
            </div>
          </div>
          <div className="glass cashflow">
            <div className="panel-heading">
              36개월 누적 현금흐름<span>단위: 만원</span>
            </div>
            <svg
              viewBox="0 0 620 240"
              role="img"
              aria-label={`36개월 순효과 ${money(roi.threeYearNetBenefit)}만원`}
            >
              <defs>
                <linearGradient id="chart-fill" x1="0" y1="0" x2="0" y2="1">
                  <stop stopColor="#c7c7c7" stopOpacity=".2" />
                  <stop offset="1" stopColor="#c7c7c7" stopOpacity="0" />
                </linearGradient>
              </defs>
              {[0, 12, 24, 36].map((m) => (
                <g key={m}>
                  <line
                    x1={30 + (m / 36) * 555}
                    y1="25"
                    x2={30 + (m / 36) * 555}
                    y2="198"
                    stroke="#ffffff0c"
                  />
                  <text
                    x={30 + (m / 36) * 555}
                    y="224"
                    fill="#9e9e9e"
                    fontSize="12"
                    textAnchor="middle"
                  >
                    {m}개월
                  </text>
                </g>
              ))}
              <line
                x1="30"
                y1={zero}
                x2="585"
                y2={zero}
                stroke="#ffffff25"
                strokeDasharray="5 5"
              />
              <text x="32" y={zero - 9} fill="#939393" fontSize="11">
                손익분기
              </text>
              <path
                d={`M30 ${zero} L30 ${Math.min(198, Math.max(20, y(-scenario.roi.investment)))} L585 ${Math.min(198, Math.max(20, y(roi.threeYearNetBenefit)))} L585 ${zero}Z`}
                fill="url(#chart-fill)"
              />
              <path
                d={`M30 ${Math.min(198, Math.max(20, y(-scenario.roi.investment)))} L585 ${Math.min(198, Math.max(20, y(roi.threeYearNetBenefit)))}`}
                fill="none"
                stroke="#c6c6c6"
                strokeWidth="3"
              />
              {roi.paybackMonths !== null && roi.paybackMonths <= 36 && (
                <g>
                  <circle
                    cx={30 + (roi.paybackMonths / 36) * 555}
                    cy={zero}
                    r="5"
                    fill="#d1d1d1"
                  />
                  <text
                    x={30 + (roi.paybackMonths / 36) * 555}
                    y={zero + 22}
                    fill="#d1d1d1"
                    fontSize="12"
                    textAnchor="middle"
                  >
                    {roi.paybackMonths.toFixed(1)}개월
                  </text>
                </g>
              )}
            </svg>
          </div>
        </div>
      </div>
      <p className="method-note">
        <Info size={15} />
        생산량 증가, 세금, 금융비용, 감가상각, 에너지비 및 잔존가치는
        미포함입니다. 인력 재배치가 실제 비용 절감으로 이어지는지 별도
        확인하세요.
      </p>
    </section>
  );
}
export function ReportPanel({
  scenario,
  analyses,
  selected,
  image,
  date,
  onCapture,
}: {
  scenario: Scenario;
  analyses: Analysis[];
  selected: string;
  image?: string;
  date: string;
  onCapture: () => void;
}) {
  const a = analyses.find((a) => a.candidateId === selected)!;
  const roi = computeRoi(scenario.roi);
  const pathAudit = analyzePathways(
    scenario,
    scenario.minimumPathwayWidth ?? 1.2,
  );
  return (
    <section className="report-area">
      <div className="report-actions no-print">
        <div>
          <div className="eyebrow">FEASIBILITY REPORT</div>
          <h2>의사결정에 필요한 한 장의 근거.</h2>
        </div>
        <button className="button" onClick={onCapture}>
          장면 업데이트
        </button>
        <button className="button primary" onClick={() => window.print()}>
          <Printer size={16} />
          인쇄 / PDF 저장
        </button>
      </div>
      <article className="report-document">
        <header className="report-header">
          <span>
            ROBOSPACE FIT<span> / PLACEMENT STUDY</span>
          </span>
          <span>RF-2026-001</span>
        </header>
        <div className="report-title">
          <span>자동화 사전진단</span>
          <h1>{scenario.name}</h1>
          <p>
            가상 테스트베드 · {scenario.factory.width} ×{" "}
            {scenario.factory.depth} m · 검토일 {date}
          </p>
        </div>
        <div className="report-summary">
          <div>
            <span>검토 후보</span>
            <b>
              {selected}{" "}
              <small>{a.candidateName.replace(/후보 [ABC] · /, "")}</small>
            </b>
          </div>
          <div>
            <span>공간 검토 결과</span>
            <b>{statusText[a.status]}</b>
          </div>
          <div>
            <span>단순 회수기간</span>
            <b>
              {roi.paybackMonths?.toFixed(1) ?? "회수 불가"}
              <small>{roi.paybackMonths !== null ? "개월" : ""}</small>
            </b>
          </div>
        </div>
        {image ? (
          <img
            className="report-scene"
            src={image}
            alt="현재 로봇 배치의 3D 공장 장면"
          />
        ) : (
          <FloorPlan scenario={scenario} selected={selected} />
        )}
        <h2>01 · 후보별 공간 검토</h2>
        <table>
          <thead>
            <tr>
              <th>후보</th>
              <th>점수</th>
              <th>도달 작업점</th>
              <th>베이스 간섭</th>
              <th>설비 이격</th>
              <th>검토 결과</th>
            </tr>
          </thead>
          <tbody>
            {analyses.map((a) => (
              <tr key={a.candidateId}>
                <td>{a.candidateId}</td>
                <td>{a.score}</td>
                <td>
                  {a.reach.filter((r) => r.reachable).length}/{a.reach.length}
                </td>
                <td>{a.footprintCollisions.length}건</td>
                <td>{a.minClearance?.toFixed(2) ?? "—"}m</td>
                <td>{statusText[a.status]}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="report-caption">
          반경 {scenario.robot.reach}m · 베이스 직경{" "}
          {scenario.robot.footprintDiameter}m · 설정 이격 여유{" "}
          {scenario.robot.safetyBuffer}m · 2D 평면 기준
        </p>
        <h2>02 · 경제성 가정 및 추정</h2>
        <div className="report-economics">
          <dl>
            <dt>초기 도입비 / 월 유지보수비</dt>
            <dd>
              {money(scenario.roi.investment)} /{" "}
              {money(scenario.roi.monthlyMaintenance)}만원
            </dd>
            <dt>투입 인원 (전 → 후)</dt>
            <dd>
              {scenario.roi.workersBefore} → {scenario.roi.workersAfter}명
            </dd>
            <dt>가동 조건 / 시간당 인건비</dt>
            <dd>
              {scenario.roi.hoursPerDay}시간 × {scenario.roi.daysPerMonth}일 /{" "}
              {scenario.roi.hourlyWage.toLocaleString()}원
            </dd>
            <dt>월 순절감액 / 연 순절감액</dt>
            <dd>
              {money(roi.monthlyNetSavings)} / {money(roi.annualSavings)}만원
            </dd>
          </dl>
        </div>
        <h2>03 · 이동 동선 검토</h2>
        <ul>
          {pathAudit.routes.map((r) => (
            <li key={r.pathwayId}>
              {r.name}: 길이 {r.length.toFixed(1)}m · 설정 폭{" "}
              {r.width.toFixed(2)}m · 설비 간섭 {r.obstacleIntersections.length}
              건 · {r.status === "clear" ? "조건 충족" : "추가 검토 필요"}
            </li>
          ))}
          <li>
            작업자·대차 경로 겹침 {pathAudit.crossings.length}쌍. 최소 폭 검토
            가정 {pathAudit.minimumWidth.toFixed(1)}m.
          </li>
        </ul>
        <h2>04 · 개선 및 후속 검증</h2>
        <ul>
          {a.recommendations.map((r) => (
            <li key={r}>{r}</li>
          ))}
          <li>
            실측 도면과 현장 동선, 로봇 툴·하중·자세 제한을 반영한 정밀 검토가
            필요합니다.
          </li>
        </ul>
        <div className="report-caveat">
          <strong>분석 범위와 데이터 출처</strong>
          <p>
            선택한 공정을 바탕으로 만든 가상 공장과 로봇 모델입니다.
            실측 현장이나 특정 제조사 인증 제원이 아닙니다. 작업점 도달은
            수평거리, 베이스 간섭은 평면 외곽, 동선은 폭을 가진 선분으로
            계산합니다. 점수는 초기 비교를 위한 감점 방식입니다. 본 결과는 안전
            인증이나 설치 적합성의 최종 판정이 아닙니다. 경제성은 입력 가정에
            따른 단순 추정입니다.
          </p>
        </div>
        <footer className="report-footer">
          <span>RoboSpace Fit · Willbyte</span>
          <span>공간 기반 자동화 사전진단</span>
        </footer>
      </article>
    </section>
  );
}
