---
name: cardprinter
description: 주제 한 줄·병원 칼럼·원장 인터뷰 대본(SRT/VTT/텍스트)과 병원 프로필로 인스타 카드뉴스 캐러셀(4:5 PNG)과 9:16 릴스 MP4를 품질 게이트를 통과시켜 만든다. 치과·병원 마케팅 카드뉴스에 맞춘 원커맨드 어댑터와 의료광고 위험 표현 점검을 포함한다. 트리거 — "카드뉴스 만들어", "치과 카드뉴스", "칼럼으로 카드뉴스", "인터뷰로 카드뉴스", "원장님 인터뷰 릴스", "인스타 캐러셀", "카드뉴스 릴스", "cardprinter". Use for Korean card-news carousels and 9:16 reels from a topic, a clinic column, or a doctor interview transcript plus a clinic profile (dental/clinic marketing).
---

# cardprinter (OMO)

gongnyang의 MIT [CardPrinter](https://github.com/gongnyang/cardprinter)를 OmO/Senpi 스킬로 감싼 진입점이다.
입력(주제·칼럼·인터뷰 + 병원 프로필) → 업스트림 계약 파일(`brief/copy/tokens/storyboard.json`) →
업스트림 파이프라인(`scripts/pipeline.sh`, 게이트 G1~G19) → **캐러셀 PNG 1080×1350 + 릴스 MP4 1080×1920**.

## 경로

모든 경로는 **이 SKILL.md 기준 `../..` = 패키지 루트**다. 명령은 패키지 루트에서 실행한다.
입출력 계약 전체는 [references/io.md](references/io.md), 업스트림 운영 절차는 [../../SKILL.md](../../SKILL.md).

## 0. 최초 1회 설정

```bash
bash skills/cardprinter/scripts/setup.sh   # scripts/node_modules · .venv(게이트) · .omo-cache(hyperframes 0.7.26)
```

전역 설치·사용자 설정 변경은 하지 않는다. ffmpeg/ffprobe가 필요하고, tesseract가 없으면 OCR 게이트만 inconclusive가 된다.

## 1. 입력 파일 작성

사용자 요청에서 `input.json`을 만든다(예시: `examples/dental-{column,interview,topic}/input.json`).

- `mode`: `topic` | `column` | `interview`
- `topic`(필수, 표지 헤드라인 근거) · `clinic.name`(필수) · `clinic.{region,phone,doctor,handle,brand_color}`
- `column`/`interview`: `text` 또는 `text_file`(인터뷰는 SRT/VTT/“원장: …” 대본 그대로)
- `topic`: **`facts[]` 필수** — 리서치한 사실을 먼저 채운다. 사실이 없으면 만들지 않는다.

## 2. 원커맨드 실행

```bash
node skills/cardprinter/scripts/run.mjs --input <input.json> --out <projectDir> [--quality draft|high]
```

결정론 카피 초안을 만들고 렌더까지 한 번에 돈다. 결과: `<projectDir>/out/card-NN.png`, `<projectDir>/out/short.mp4`,
`caption.txt`(인스타 캡션 초안), `compliance.json`(의료광고 위험 표현), `result.json`.
종료 코드 0 = 모든 하드 게이트 통과. 실패하면 로그의 게이트 메시지(카드 번호·이유)를 보고 해당 카드만 고친다.

## 3. 카피 품질 올리기(권장)

초안은 원문 문장을 그대로 배치한다. 게시용이면 에이전트가 카피를 다시 쓴다:

1. `--prepare-only`로 계약 파일만 만든다.
2. `<projectDir>/copy.json`을 [카피 공식](../../references/copy-formulas.md)대로 다시 쓴다 —
   표지 ≤24자(줄당 ≤18), CTA 헤드라인 ≤14자, 본문 ≤90자, 불릿 ≤48자, 첫 카드 `cover`(A1)·마지막 `cta`(A11).
   **숫자는 `fact_refs`로 참조한 brief.facts에 있어야 한다(G10 날조 0).**
3. `node skills/cardprinter/scripts/run.mjs --input <input.json> --out <projectDir> --copy <projectDir>/copy.json`

## 4. 확인과 보고

- PNG는 직접 열어 보고, 릴스는 `ffmpeg -i out/short.mp4 -vf fps=1/2,scale=270:-1,tile=6x2 -frames:v 1 sheet.png`로 확인한다.
- `compliance.json`에 걸린 표현(최고·유일·100%·완치·무통·보장·할인/이벤트·전후사진 등)은 바꾸거나 사용자에게 알린다.
  자동 탐지는 법률 검토를 대체하지 않는다.
- 업로드·게시는 하지 않는다. 산출물 경로와 게이트 결과, 남은 WARN을 보고한다.

## 원칙

- 업스트림 코드·게이트는 고치지 않고 계약 파일만 만든다. 게이트를 끄거나 우회하지 않는다.
- 환자 개인정보·실제 치료 사례 사진·후기·효과 보장 문구를 만들지 않는다.
- 생성 이미지는 기본 사용 안 함(텍스트 카드). 이미지가 필요하면 업스트림 S4 절차(codex-imagegen)를 따른다.
