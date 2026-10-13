# cardprinter OMO 어댑터 — 입력·출력 계약

명령(패키지 루트에서):

```bash
node skills/cardprinter/scripts/run.mjs --input <input.json> --out <projectDir> \
  [--copy <copy.json>] [--quality draft|high] [--prepare-only] [--strict-compliance]
```

| 옵션 | 의미 |
|---|---|
| `--input` | 아래 스키마의 JSON. 상대 경로(`text_file`)는 이 파일 기준 |
| `--out` | 프로젝트 디렉터리(없으면 생성). 기본값 `<input 디렉터리>/out` |
| `--copy` | 에이전트가 쓴 `copy.json`을 초안 대신 사용 |
| `--quality` | 릴스 렌더 품질. `draft`(기본) / `high` |
| `--prepare-only` | 계약 파일만 만들고 렌더 생략 |
| `--strict-compliance` | 의료광고 위험 표현이 있으면 렌더 전에 종료(exit 1) |

## 입력 `input.json`

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| `mode` | `"topic"`·`"column"`·`"interview"` | ✓ | 입력 종류 |
| `topic` | string | ✓ | 표지 헤드라인 근거(≤24자 권장, 길면 자동 줄바꿈·말줄임) |
| `headline` | string | | 표지 헤드라인 직접 지정(`\n` 줄바꿈, 줄당 ≤18자) |
| `text` / `text_file` | string | column·interview | 칼럼 본문 / 인터뷰 대본(SRT·VTT·`화자: 발화` 텍스트) |
| `facts` | (string \| {id,claim,number,source})[] | topic | 검증된 사실 목록. 있으면 `text`보다 우선 |
| `clinic.name` | string | ✓ | 병원명(표지 키커·워드마크·CTA) |
| `clinic.region` `clinic.phone` `clinic.hours` | string | | CTA 카드·캡션 |
| `clinic.doctor` | string | | 표지 서브헤드·인용 출처 |
| `clinic.handle` | string | | CTA 카드 핸들, 캡션 |
| `clinic.brand_color` | `#RRGGBB` | | 강조색. WCAG 대비(흰 글자 4.5:1, 배경 3:1) 미달이면 무시 |
| `tier` | string | | `editorial`(기본)·`news`·`brand`·`character`·`luxury`·`data`·`newsprint` |
| `surface` `accent` | string | | 티어의 surface/accent id(`references/tiers/<tier>.json`) |
| `cta_headline` | string | | CTA 헤드라인(≤14자, 기본 "저장해두세요") |
| `hashtags` | string[] | | 캡션 해시태그 |

인터뷰 모드: 진행자(`기자`·`진행`·`사회`·`Q` 등) 발화는 사실에서 제외하고, 24자 이하 질문은 Q&A 카드 헤드라인으로 쓴다.
topic 모드: 인용 카드를 만들지 않는다(인용 날조 방지).

초안 카드 구성: 표지(A1) → Q&A(A9)·관리법(A3, 문단+불릿+콜아웃) → 인용(A6, 칼럼·인터뷰) → 체크리스트(A5, 3항목) → CTA(A11).
남은 사실 수에 따라 4~6장. 불릿 2개를 못 채우는 본문 카드는 만들지 않는다(G18 세로 채움 게이트).

## 출력 `<projectDir>/`

| 경로 | 내용 |
|---|---|
| `out/card-NN.png` | 캐러셀 카드 1080×1350(4:5) |
| `out/card-NN.slots.json` | 텍스트 슬롯 bbox(게이트 입력) |
| `out/short.mp4` | 9:16 1080×1920 30fps 릴스(카드 파생, 무음+모션) |
| `caption.txt` | 인스타 캡션 초안(요약·병원정보·의료광고 고지·해시태그) |
| `compliance.json` | 의료광고 위험 표현 자동 탐지 결과 |
| `brief.json` `copy.json` `tokens.json` `storyboard.json` | 업스트림 계약 파일(수정 후 `--copy`로 재실행) |
| `carousel/` `shorts/` | 카드 HTML·HyperFrames 컴포지션(빌드 산출물) |
| `result.json` | `{ ok, carousel[], reel, caption, compliance_hits, pipeline_exit }` |

종료 코드: 0 = 하드 게이트 전부 통과, 1 = 입력 오류 또는 게이트 FAIL(로그에 카드 번호·사유).
WARN(G14/G15/G16)은 통과로 처리되며 로그에 남는다.
