# RoboSpace Fit v2.0 — Academic Research Snapshot

**비상업적 학술 연구 전용 · 2026-09-28 기준 고정 공개본**

이 저장소는 RoboSpace Fit v2.0의 현재 버전을 연구자에게 제공하기 위해 한 번 공개한 독립 스냅샷입니다. 내부 개발 저장소와 Git 이력 및 원격 연결을 공유하지 않으며, 이후 내부 업데이트가 자동으로 반영되지 않습니다. 지속적인 기능 업데이트나 유지보수는 약속하지 않습니다.

- 연구 기준 태그: [`v2.0.0-research-20260928`](https://github.com/willbyte-ai/robospace-fit-research/releases/tag/v2.0.0-research-20260928)
- 이용 조건: [LICENSE](LICENSE) · 제3자 고지: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)
- 인용 정보: [CITATION.cff](CITATION.cff) · 스냅샷 정보: [SNAPSHOT.json](SNAPSHOT.json)

## 연구 이용 조건

실험·비교·재현 연구·논문 및 학위논문 작성과, 해당 연구를 위한 실행·수정·포크·공유를 허용합니다. 기관 소속이 없는 독립 연구자도 이용할 수 있습니다. 소스나 수정본을 공유할 때는 같은 이용 조건과 기존 고지를 유지하고 변경 사항을 표시해야 합니다.

상업적 제품·서비스 개발 및 운영, 유료 컨설팅, 실제 사업 운영 등 학술 연구 이외의 사용에는 권리자의 별도 서면 허락이 필요합니다. 연구 논문은 출판사의 수익 발생 여부와 관계없이 출판할 수 있습니다. 논문의 공동저자 등록이나 사전 출판 승인을 요구하지 않습니다.

위 내용은 안내 요약이며, 구체적인 권리와 조건은 영문 [LICENSE](LICENSE)에 정합니다. 제3자 구성요소와 GitHub 약관으로 별도 부여되는 권리는 유지됩니다. 이 저장소는 연구용으로 소스를 공개한 **source-available** 프로젝트이며, 용도를 제한하지 않는 OSI 정의의 오픈소스 라이선스는 아닙니다.

## 포크와 인용

GitHub의 **Fork** 버튼으로 본인 계정에 복사한 뒤 연구용 변경을 진행할 수 있습니다. 논문에는 이 프로젝트와 사용한 공개 태그 또는 커밋을 기록하고, 수정한 부분과 실험 설정을 함께 설명해 주세요. 아래 인용은 권장사항이며 추가 라이선스 의무는 아닙니다.

> RoboSpace Fit contributors. (2026). *RoboSpace Fit v2.0: Academic Research Snapshot* (2.0.0-research.20260928) [Computer software]. https://github.com/willbyte-ai/robospace-fit-research

This repository is a frozen, independent research snapshot. Use, modification, and redistribution of original project materials are permitted only for non-commercial academic research under the [LICENSE](LICENSE). Commercial use requires separate written permission. Third-party licenses remain in effect.

## 프로젝트 개요

식품 포장·팔레타이징, 금속 가공, 전자 조립, 물류 분류 가상 공정에서 로봇 도입 가능성을 검토하는 웹 기반 공간분석 스튜디오입니다. React / TypeScript / Three.js / Vinext를 사용합니다.

## 실행

Node.js **22.13.0 이상**과 npm이 필요합니다. 앱 실행용 3D 모델과 메타데이터는 포함되어 있으므로 Blender 설치나 모델 재생성이 필요하지 않습니다. 로컬 실행에는 기존 운영 서비스의 계정, API 키, 데이터베이스 또는 배포 권한이 필요하지 않습니다.

```sh
git clone https://github.com/willbyte-ai/robospace-fit-research.git
cd robospace-fit-research
git checkout v2.0.0-research-20260928
npm run install:ci
npm run dev
```

브라우저에서 http://localhost:5173 을 엽니다. 포크에서 수정할 경우 본인 저장소를 clone하고 작업 브랜치를 만드세요. 위 태그 checkout은 동일 버전으로 실험을 재현하기 위한 절차입니다.

검증 명령:

```sh
npx tsc --noEmit --incremental false
npx tsx --test tests/*.test.ts
npm run build
```

## 구현 기능

- Blender MCP로 직접 제작한 24×18m 공장과 독립된 RS-1850 6축 로봇
- 투명도·배경 블러·금속 질감을 적용한 작업 화면
- 3D 회전·확대·이동, 2D 탑뷰, 공장/설비/작업반경/여유/동선 레이어
- A/B/C 후보 선택, 좌표 및 바닥 클릭 배치, 작업반경과 설비 이격 가정 편집
- 실제 모델 메타데이터의 27개 점유 외곽을 이용한 평면 기하 분석
- 베이스 충돌과 작업 포락선 접근의 분리, pick/place 포함 여부, 근거별 점수
- 경유점·폭 변경, 작업자/대차 중심선 교차·공유·폭 겹침, 설비 점유와 경로 간섭
- ROI 가정 입력, 월/연 순절감액, 회수기간, 36개월 누적 순효과
- 현재 상태를 담는 인쇄/PDF 리포트 및 3D 장면 PNG
- 이 브라우저에 시나리오 저장·복원, JSON 내보내기·검증 후 가져오기
- 모델 GLB/Blender 원본과 검수 완료 기본 시나리오 PDF 다운로드
- 지원 브라우저의 WebMCP: read_placement_analysis, configure_robot_candidate

## 파일 구조

- `app/page.tsx` — 작업 흐름, 시나리오 상태 및 저장
- `components/factory-viewer.tsx` — Three.js 모델/카메라/오버레이/애니메이션
- `components/analysis-panels.tsx` — 비교·ROI·리포트·공통 평면도
- `components/pathway-panel.tsx` — 동선 편집·정적 간섭 검토
- `lib/engine.ts` — 순수 기하 계산, ROI, 스키마 검증
- `lib/factory-scenario.ts` — Blender 메타데이터 → 분석 객체 변환
- `public/models/` — GLB, 편집용 Blender 원본, 좌표 메타데이터
- `public/reports/` — 기본 가상 시나리오 3쪽 PDF 샘플
- `model-sources/` — 포함된 Blender 생성/렌더 스크립트
- `tests/` — 기하 분석·동선·자산·배치·로봇 동작 검증
- [FACTORY_SCENARIOS.md](FACTORY_SCENARIOS.md) — 4종 가상 공장 구성
- [ROBOT_PLACEMENT.md](ROBOT_PLACEMENT.md) — 로봇 모델과 배치·관절 동작
- [EQUIPMENT_PLACEMENT.md](EQUIPMENT_PLACEMENT.md) — 설비 모델과 배치 기능

모델 수정에는 `public/models/`의 `.blend` 원본을 사용할 수 있습니다. `model-sources/`의 스크립트는 Blender Python 환경을 전제로 하며 일부 중간 결과 경로가 `/tmp/robospace-*`로 지정되어 있습니다. 실행 전에 경로를 확인하세요. 모든 기본 자산의 생성 스크립트가 포함된 것은 아니며, 식품 공장 등은 배포된 GLB·Blender 원본을 기준으로 재현할 수 있습니다.

## 좌표와 분석 범위

단위는 m입니다. 분석의 x/y는 Blender의 바닥 평면 x/y이며, Three.js는 `[x,height,-y]`를 사용합니다. 공장 메타데이터의 `colliders`를 우선하고 제어반 케이블은 몸체 점유 외곽에서 제외합니다. 닫힌 안전 게이트, AMR 및 이동식 적재물도 현재 위치의 장애물로 계산합니다.

후보 점수는 100점에서 도달 부족, 베이스 충돌, 공간 경계, 주변 설비·통로 포락선 겹침 등을 감점합니다. UI에 각 감점 근거를 제공합니다. 통로 최소 폭은 사용자 검토값이며 법정 기준으로 사용하지 않습니다.

상세 모델은 실제 현장 실측이나 제조사 CAD가 아닌 가상 테스트베드입니다. 평면 도달 검사는 높이·역기구학·관절 제한·툴 간섭·동역학·정지거리·안전 인증을 검증하지 않습니다. 로봇 재생은 관절 동작의 시각적 예시이며 경로 검증이나 사이클타임 산출에 사용하지 않습니다.

ROI는 `(이전 인원 - 이후 인원) × 일 가동시간 × 월 가동일수 × 시간당 인건비 - 월 유지보수비`를 월 순절감으로 계산합니다. 순절감이 0 이하이면 회수 불가입니다. 세금·금융비용·감가상각·생산증가 효과는 포함하지 않습니다.

## 저장 및 가져오기

계정 또는 서버 저장 기능은 없습니다. 저장 버튼은 현재 브라우저 localStorage에 저장합니다. JSON으로 동일 가상 공장의 후보·작업점·동선·경제성 가정을 다른 기기에 옮길 수 있습니다. 공장 경계나 설비 외곽이 모델과 다른 JSON은 거부합니다. 인터넷에 사용자의 입력을 전송하는 분석 API는 없습니다.

## 기본 시나리오 검증 결과

A (0.55,-0.25): 100점, 도달 2/2, 최소 이격 약 0.585m.
B (1.90,-1.50): 35점, 작업점 도달 부족 및 주변 포락선 검토.
C (3.85,2.00): 0점, 제어반 베이스 충돌.
도입비 65,000,000원 / 2→1명 / 일8시간 / 월22일 / 22,000원/시간 / 월 유지비350,000원: 회수18.46개월.
공장 전체 기본 동선에는 실제 팔레트·랙 점유 간섭과 공유 구간이 있으므로 후보A의 조건 충족을 공장 전체 적합성으로 해석하면 안 됩니다.

## 데이터와 권한

원본 사업계획서의 개인 연락처·주소·신청서 전문은 사이트나 소스 저장소에 포함하지 않습니다. 공장과 로봇은 이 프로젝트에서 제작한 원본 기하입니다.
