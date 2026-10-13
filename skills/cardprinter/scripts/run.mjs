#!/usr/bin/env node
// OMO adapter for CardPrinter — clinic (dental) input → 4:5 carousel PNGs + 9:16 reel MP4.
// It only writes the upstream contract files (brief/copy/tokens/storyboard) and then calls the
// unchanged upstream pipeline (scripts/pipeline.sh). See ../references/io.md for the input schema.
//
// usage: node skills/cardprinter/scripts/run.mjs --input <input.json> --out <projectDir>
//          [--copy <copy.json>] [--quality draft|high] [--prepare-only] [--strict-compliance]
import { spawnSync } from "node:child_process";
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes(`--${name}`);
const die = (msg) => { console.error(`✗ ${msg}`); process.exit(1); };

const inputPath = opt("input");
if (!inputPath) die("--input <input.json> 필요 (스키마: skills/cardprinter/references/io.md)");
const input = JSON.parse(readFileSync(resolve(inputPath), "utf8"));
const inputDir = dirname(resolve(inputPath));
const proj = resolve(opt("out", join(inputDir, "out")));
const quality = opt("quality", "draft");
if (!["draft", "high"].includes(quality)) die("--quality 는 draft|high");
mkdirSync(proj, { recursive: true });

// ── 1. 입력 정규화 ──
const mode = input.mode;
if (!["topic", "column", "interview"].includes(mode)) die("mode 는 topic|column|interview");
const clinic = input.clinic || {};
if (!clinic.name) die("clinic.name 필요");
const topic = String(input.topic || "").trim();
if (!topic) die("topic 필요 (표지 헤드라인의 근거)");

let text = input.text || "";
if (input.text_file) text = readFileSync(resolve(inputDir, input.text_file), "utf8");
if (mode === "interview") text = cleanTranscript(text);

function cleanTranscript(raw) {
  // SRT/VTT/plain 대본 → 화자 라벨 유지한 문장 텍스트. 타임코드·번호·WEBVTT 헤더 제거.
  return raw.replace(/\r/g, "").split("\n")
    .filter((l) => l.trim() && !/^WEBVTT/.test(l) && !/^\d+$/.test(l.trim()) && !/-->/.test(l))
    .map((l) => l.replace(/<[^>]+>/g, "").trim()).join("\n");
}

const doctorLabel = clinic.doctor || "원장";
const speakerRe = /^([^:：\s]{1,10})\s*[:：]\s*/; // "원장: ..." / "기자: ..."
const sentences = [];
for (const line of text.split("\n")) {
  const m = line.match(speakerRe);
  const speaker = m ? m[1] : null;
  const body = m ? line.slice(m[0].length) : line;
  for (const s of body.split(/(?<=[.!?。])\s+/)) {
    const t = s.trim().replace(/\s+/g, " ");
    if (t.length >= 8) sentences.push({ text: t, speaker });
  }
}
// 인터뷰는 질문자(기자/진행 등) 발화를 팩트에서 제외 — 의료진 발화만 사용
const isHost = (sp) => sp && /기자|진행|사회|인터뷰어|PD|Q/i.test(sp);
const usable = sentences.filter((s) => !(mode === "interview" && isHost(s.speaker)));

// ── 2. 팩트(brief.facts) — 입력 facts 우선, 없으면 원문 문장 추출 ──
const numOf = (s) => (String(s).match(/\d[\d,.]*\d%?|\d%/g) || []).join(" ");
let facts;
if (Array.isArray(input.facts) && input.facts.length) {
  facts = input.facts.map((f, i) => (typeof f === "string" ? { claim: f } : f))
    .map((f, i) => ({ id: f.id || `f${i + 1}`, claim: f.claim, number: f.number ?? numOf(f.claim), source: f.source || clinic.name }));
} else if (usable.length) {
  facts = usable.map((s, i) => ({ id: `f${i + 1}`, claim: s.text, number: numOf(s.text), source: mode === "interview" ? `${doctorLabel} 인터뷰` : `${clinic.name} 칼럼`, speaker: s.speaker || undefined }));
} else die("topic 모드는 facts[] 또는 text 필요 — 리서치한 사실을 facts에 먼저 채우세요(날조 금지)");
if (facts.length < 3) die(`사용 가능한 사실 ${facts.length}개 < 3 — 원문을 늘리거나 facts[]를 채우세요`);
const clinicLine = [clinic.name, clinic.region, clinic.phone].filter(Boolean).join(" · ");
const metaFacts = [
  { id: "topic", claim: topic, number: numOf(topic), source: "topic" },
  { id: "clinic", claim: `${clinicLine} ${clinic.hours || ""}`.trim(), number: numOf(`${clinic.phone || ""} ${clinic.hours || ""}`), source: "clinic profile" },
];

// ── 3. 카피 초안(copy.json) — 결정론. 고품질은 에이전트가 copy.json을 다시 쓰고 --copy로 재실행 ──
const len = (s) => [...String(s)].length;
const cut = (s, n) => {
  if (len(s) <= n) return s;
  const head = [...s].slice(0, n - 1).join("");
  const sp = head.lastIndexOf(" ");
  return (sp > n * 0.5 ? head.slice(0, sp) : head).replace(/[,·\s]+$/, "") + "…";
};
function wrapHeadline(s, max = 24, line = 18) {
  s = cut(s.replace(/\s+/g, " ").trim(), max);
  if (len(s) <= line) return s;
  const words = s.split(" ");
  let best = null;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(" "), b = words.slice(i).join(" ");
    if (len(a) <= line && len(b) <= line) { const d = Math.abs(len(a) - len(b)); if (!best || d < best.d) best = { d, v: `${a}\n${b}` }; }
  }
  return best ? best.v : [...s].slice(0, line).join("");
}
const pool = facts.slice();
const take = (pred) => { const i = pool.findIndex(pred); return i >= 0 ? pool.splice(i, 1)[0] : null; };
const takeAny = (max) => take((f) => len(f.claim) <= max) || (pool.length ? pool.shift() : null);

function buildCopy() {
  const cards = [];
  const handle = clinic.handle ? { handle: clinic.handle } : undefined;
  const srcLabel = `출처: ${mode === "interview" ? `${doctorLabel} 인터뷰` : mode === "column" ? `${clinic.name} 칼럼` : clinic.name}`;
  cards.push({ type: "cover", archetype: "A1", kicker: cut(clinic.name, 12), headline: input.headline ? input.headline : wrapHeadline(topic),
    subhead: cut(clinic.doctor ? `${clinic.doctor}이 알려드려요` : `${clinic.name}이 알려드려요`, 34), fact_refs: ["topic"] });
  // 필수 슬롯(리스트 3항목·인용)을 먼저 예약하고, 남은 사실로 Q&A·dense 카드를 채운다(사실 부족 시 선택 블록부터 생략).
  const bullets = [];
  while (bullets.length < 3) { const b = take((f) => len(f.claim) <= 34) || take((f) => len(f.claim) <= 48); if (!b) break; bullets.push(b); }
  if (bullets.length < 3) die("리스트 카드용 48자 이하 문장이 3개 미만 — facts[]에 짧은 문장을 추가하세요");
  bullets.sort((a, b) => facts.indexOf(a) - facts.indexOf(b));
  // 인터뷰·칼럼은 의료진 본인 발화이므로 인용 카드 허용. topic 모드는 인용 날조 방지로 생략.
  const q = mode !== "topic" ? take((f) => len(f.claim) <= 44) : null;
  // Q&A — 인터뷰는 진행자 질문을 헤드라인으로, 그 외는 고정 질문형 라벨
  const hostQ = mode === "interview" ? sentences.find((s) => isHost(s.speaker) && len(s.text) <= 24) : null;
  // 본문 카드는 항상 para + bullets(2~3) [+ callout]. G18 실측: para+callout만 있는 카드는 짧은 문장에서 죽은공간 FAIL,
  // bullets 블록이 있으면 짧은 문장에서도 PASS. bullets 2개를 못 채우면 그 카드는 만들지 않는다.
  const bodyCard = (archetype, body_mode, kicker, headline, maxBullets, withCallout) => {
    const para = takeAny(90);
    const items = [];
    while (items.length < maxBullets) { const b = take((f) => len(f.claim) <= 40) || take((f) => len(f.claim) <= 48); if (!b) break; items.push(b); }
    if (!para || items.length < 2) { pool.unshift(...[para, ...items].filter(Boolean)); return null; }
    const co = withCallout ? take((f) => len(f.claim) <= 70) : null;
    return { type: "body", archetype, body_mode, kicker, headline,
      blocks: [{ kind: "para", text: cut(para.claim, 90) }, { kind: "bullets", items: items.map((b) => b.claim) }, ...(co ? [{ kind: "callout", label: "포인트", text: co.claim }] : [])],
      fact_refs: [para.id, ...items.map((b) => b.id), ...(co ? [co.id] : [])], source: srcLabel };
  };
  const qaHead = hostQ ? wrapHeadline(hostQ.text) : "먼저 알아둘 점";
  const body = pool.length >= 6
    ? [bodyCard("A9", "qa", "Q", qaHead, 2, false), bodyCard("A3", "dense", "알아두세요", "이렇게 관리하세요", 3, true)]
    : [hostQ ? bodyCard("A9", "qa", "Q", qaHead, 3, true) : bodyCard("A3", "dense", "알아두세요", "이렇게 관리하세요", 3, true)];
  cards.push(...body.filter(Boolean));
  if (q) cards.push({ type: "quote", archetype: "A6", body: q.claim, attribution: `${doctorLabel} · ${clinic.name}`, fact_refs: [q.id] });
  cards.push({ type: "body", archetype: "A5", body_mode: "list", headline: "꼭 기억하세요",
    blocks: [{ kind: "bullets", items: bullets.map((b) => b.claim) }], fact_refs: bullets.map((b) => b.id) });
  cards.push({ type: "cta", archetype: "A11", headline: cut(input.cta_headline || "저장해두세요", 14), body: cut(clinicLine, 90),
    cta_label: "저장해두고 다시 보기", fact_refs: ["clinic"], ...(handle ? { author: handle } : {}) });
  cards.forEach((c, i) => (c.index = i + 1));
  return { series_wordmark: clinic.name, card_count: cards.length, cards };
}

let copy;
const copyArg = opt("copy");
if (copyArg) copy = JSON.parse(readFileSync(resolve(copyArg), "utf8"));
else copy = buildCopy();

const brief = {
  topic, genre: "knowledge", tier: input.tier || "editorial", card_count: copy.cards.length,
  source_mode: mode, clinic: { ...clinic }, facts: [...facts, ...metaFacts],
  selection_rationale: `OMO cardprinter adapter — ${mode} 입력에서 결정론 추출(카피 초안). 의료광고 표현 점검 포함.`,
};
writeFileSync(join(proj, "brief.json"), JSON.stringify(brief, null, 2));
writeFileSync(join(proj, "copy.json"), JSON.stringify(copy, null, 2));

// ── 4. 의료광고 표현 점검(의료법 제56조 취지 — 최상급·보장·무통·가격유인·치료경험담) ──
const RISK = [/최고/, /최초/, /유일/, /100\s*%/, /완치/, /무통/, /부작용\s*(이\s*)?없/, /보장/, /확실/, /할인/, /이벤트/, /무료/, /전후\s*사진/, /비포\s*애프터/, /1등|1위/];
const cardText = (c) => [c.kicker, c.headline, c.subhead, c.body, c.attribution, ...(c.blocks || []).flatMap((b) => [b.text, b.label, ...(b.items || [])])].filter(Boolean).join(" ");
const compliance = copy.cards.flatMap((c) => RISK.filter((re) => re.test(cardText(c))).map((re) => ({ card: c.index, pattern: String(re) })));
writeFileSync(join(proj, "compliance.json"), JSON.stringify({ rule: "의료광고 위험 표현(자동 탐지, 법률 검토 대체 아님)", hits: compliance }, null, 2));
if (compliance.length) {
  console.log(`⚠ 의료광고 위험 표현 ${compliance.length}건 — ${join(proj, "compliance.json")}`);
  if (flag("strict-compliance")) die("--strict-compliance: 위험 표현 제거 후 재실행");
}

// ── 5. 토큰(S3) — 업스트림 컴파일러 + 선택적 병원 브랜드 컬러(대비 확인 후 적용) ──
const node = (script, ...a) => spawnSync(process.execPath, [join(ROOT, script), ...a], { stdio: "inherit" }).status;
if (node("scripts/render/compile_tokens.mjs", proj, brief.tier, input.surface || "", input.accent || "") !== 0) die("compile_tokens 실패");
if (clinic.brand_color) {
  const tok = JSON.parse(readFileSync(join(proj, "tokens.json"), "utf8"));
  const lum = (hex) => { const v = hex.replace("#", "").match(/../g).map((x) => parseInt(x, 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
  const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const onAcc = tok.palette.on_acc || "#FFFFFF";
  if (ratio(clinic.brand_color, onAcc) >= 4.5 && ratio(clinic.brand_color, tok.palette.bg) >= 3) {
    tok.palette.accent = tok.palette.hl = tok.palette.pill_bg = clinic.brand_color;
    Object.assign(tok.css_vars, { "--acc": clinic.brand_color, "--hl": clinic.brand_color, "--pill-bg": clinic.brand_color });
    writeFileSync(join(proj, "tokens.json"), JSON.stringify(tok, null, 2));
    console.log(`✓ 병원 브랜드 컬러 ${clinic.brand_color} 적용`);
  } else console.log(`⚠ brand_color ${clinic.brand_color} 대비 부족(WCAG) — 티어 기본 accent 유지`);
}

// ── 6. storyboard.json(S7 계약) — 카드 1장 = 릴스 1비트, 자막 = 카드 헤드라인(G12 파생 규칙) ──
writeFileSync(join(proj, "storyboard.json"), JSON.stringify({
  scenes: copy.cards.map((c) => ({ card: c.index, caption: { text: String(c.headline || c.body || "").replace(/\n/g, " ") } })),
}, null, 2));

// ── 7. 인스타 캡션 초안 ──
const caption = [topic, "", ...copy.cards.filter((c) => c.type !== "cover" && c.type !== "cta")
  .flatMap((c) => [c.body, ...(c.blocks || []).flatMap((b) => b.items || (b.text ? [b.text] : []))]).filter(Boolean).map((t) => `• ${t}`),
"", clinicLine, clinic.handle || "", "", "※ 개인의 구강 상태에 따라 치료 방법과 결과는 다를 수 있습니다. 정확한 진단은 내원 상담을 통해 받으세요.",
"", (input.hashtags || ["치과", "구강건강", clinic.region?.split(" ").pop()].filter(Boolean)).map((h) => `#${String(h).replace(/^#/, "").replace(/\s+/g, "")}`).join(" ")].join("\n");
writeFileSync(join(proj, "caption.txt"), caption.replace(/\n{3,}/g, "\n\n"));

if (flag("prepare-only")) {
  console.log(`✓ 계약 파일 준비 완료(렌더 생략): ${proj}/{brief,copy,tokens,storyboard}.json — copy.json 수정 후 --copy 로 재실행`);
  process.exit(0);
}

// ── 8. 업스트림 파이프라인(S2 게이트 → 캐러셀 → 쇼츠) ──
const env = { ...process.env };
const venvPy = join(ROOT, ".venv/bin/python");
if (!env.CARDSHORTS_PY && existsSync(venvPy)) env.CARDSHORTS_PY = venvPy;
const pinned = join(ROOT, ".omo-cache/node_modules");
if (existsSync(join(pinned, ".bin/hyperframes"))) {
  // render_shorts.sh는 `npx hyperframes`를 shorts/에서 호출 — 로컬 node_modules가 있으면 npx가 고정 버전(0.7.26)을 쓴다
  mkdirSync(join(proj, "shorts"), { recursive: true });
  const link = join(proj, "shorts/node_modules");
  if (!existsSync(link) && !(() => { try { return lstatSync(link).isSymbolicLink(); } catch { return false; } })()) symlinkSync(pinned, link);
} else console.log("⚠ .omo-cache 에 hyperframes@0.7.26 없음 — `bash skills/cardprinter/scripts/setup.sh` 먼저 실행 권장");
const r = spawnSync("bash", [join(ROOT, "scripts/pipeline.sh"), proj, quality], { stdio: ["ignore", "inherit", "inherit"], env });

const out = join(proj, "out");
const pngs = existsSync(out) ? readdirSync(out).filter((f) => /^card-\d+\.png$/.test(f)).sort().map((f) => join(out, f)) : [];
const reel = join(out, "short.mp4");
const result = { ok: r.status === 0, carousel: pngs, reel: existsSync(reel) ? reel : null, caption: join(proj, "caption.txt"), compliance_hits: compliance.length, pipeline_exit: r.status };
writeFileSync(join(proj, "result.json"), JSON.stringify(result, null, 2));
console.log(JSON.stringify(result, null, 2));
process.exit(r.status ?? 1);
