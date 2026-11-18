// Epoch AI 공개 벤치마크 수집 후 Claude·Gemini·GPT 모델 점수 데이터 생성
import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { unzipSync, strFromU8 } from 'fflate';
import { CATEGORY, EXTRA_SOURCES } from './benchmarks.mjs';

const ZIP_URL = 'https://epoch.ai/data/benchmark_data.zip';
const OUT = new URL('../public/data/models.json', import.meta.url);
const MIN_BENCHMARKS = 1;

// 따옴표·줄바꿈을 포함한 CSV 파싱
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      row.push(cell);
      cell = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) rows.push([...row, cell]);
  const [header, ...body] = rows;
  return body
    .filter((r) => r.some((v) => v !== ''))
    .map((r) => Object.fromEntries(header.map((h, i) => [h, r[i] ?? ''])));
}

// 조직명·모델명으로 제조사 판별
function vendorOf(org, name) {
  if (org === 'Anthropic' && /^Claude/i.test(name)) return 'anthropic';
  if (org === 'OpenAI' && /^(GPT|o\d|ChatGPT)/i.test(name)) return 'openai';
  if (org.startsWith('Google') && /^Gemini/i.test(name)) return 'google';
  return null;
}

// 모델 그룹 이름을 주소용 id 로 변환
const slug = (s) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, '-')
    .replace(/^-|-$/g, '');

// 모델 버전 이름의 추론 강도 접미사 추출
const variantOf = (version) => (version.match(/_([a-z]+)$/)?.[1] ?? '');

async function main() {
  const res = await fetch(ZIP_URL);
  if (!res.ok) throw new Error(`벤치마크 ZIP 다운로드 실패: ${res.status}`);
  const files = unzipSync(new Uint8Array(await res.arrayBuffer()));
  const csv = (name) => (files[name] ? parseCsv(strFromU8(files[name])) : null);

  // 모델 버전 → 모델 그룹 매핑
  const versions = new Map();
  for (const r of csv('model_metadata.csv')) {
    if (!r.model_version || !r.model_group) continue;
    const vendor = vendorOf(r.organization, r.model_group);
    if (!vendor) continue;
    versions.set(r.model_version, { group: r.model_group, vendor, date: r.date });
  }

  // 수집 대상 벤치마크 목록
  const sources = [];
  for (const r of csv('benchmark_metadata.csv')) {
    const extra = EXTRA_SOURCES[r.benchmark];
    const file = r.source_file || extra?.[0];
    const column = r.score_column || extra?.[1];
    if (!file || !column || !files[file]) continue;
    sources.push({ name: r.benchmark, file, column, released: r.release_date, superseded: !!r.superseded_by });
  }

  const models = new Map();
  const benchmarks = [];
  for (const src of sources) {
    const rows = csv(src.file).filter((r) => r['Model version'] && r[src.column] !== '');
    const values = rows.map((r) => Number(r[src.column])).filter(Number.isFinite);
    if (!values.length) continue;
    const max = Math.max(...values);
    // 백분율 표기 벤치마크는 0~1 로 환산, 점수형(Elo 등)은 제외
    if (max > 100) continue;
    const scale = max > 1.5 ? 0.01 : 1;
    const id = slug(src.name);
    let used = false;

    for (const r of rows) {
      const version = r['Model version'];
      if (version.includes('fallback')) continue;
      const meta = versions.get(version);
      const value = Number(r[src.column]) * scale;
      if (!meta || !Number.isFinite(value)) continue;
      const mid = slug(meta.group);
      const model = models.get(mid) ?? { id: mid, name: meta.group, vendor: meta.vendor, date: meta.date, scores: {} };
      if (meta.date && (!model.date || meta.date < model.date)) model.date = meta.date;
      // 추론 강도 변형 중 최고점 채택
      if (!model.scores[id] || value > model.scores[id].s) {
        model.scores[id] = { s: Math.round(value * 10000) / 10000, v: variantOf(version) };
      }
      models.set(mid, model);
      used = true;
    }
    if (used) {
      benchmarks.push({
        id,
        name: src.name,
        category: CATEGORY[src.name] ?? 'other',
        released: src.released,
        superseded: src.superseded,
      });
    }
  }

  // 이전 수집본과 비교해 새 모델 감지
  const prev = existsSync(OUT) ? JSON.parse(await readFile(OUT, 'utf8')) : null;
  const prevSeen = new Map((prev?.models ?? []).map((m) => [m.id, m.firstSeen]));
  const today = new Date().toISOString().slice(0, 10);
  const newModels = [];
  const list = [...models.values()]
    .filter((m) => Object.keys(m.scores).length >= MIN_BENCHMARKS && m.date)
    .map((m) => {
      const firstSeen = prevSeen.get(m.id) ?? (prev ? today : m.date);
      if (prev && !prevSeen.has(m.id)) newModels.push(m.name);
      return { ...m, firstSeen };
    })
    .sort((a, b) => b.date.localeCompare(a.date) || a.name.localeCompare(b.name));
  benchmarks.sort((a, b) => a.name.localeCompare(b.name));

  const body = {
    source: {
      name: 'Epoch AI, Capabilities & benchmarking',
      url: 'https://epoch.ai/benchmarks',
      license: 'CC BY 4.0',
    },
    benchmarks,
    models: list,
  };
  // 데이터 변경이 없으면 파일 유지
  const { updatedAt: _prevUpdatedAt, ...prevBody } = prev ?? {};
  if (prev && JSON.stringify(prevBody) === JSON.stringify(body)) {
    console.log('변경 없음');
    return;
  }
  await mkdir(new URL('.', OUT), { recursive: true });
  await writeFile(OUT, JSON.stringify({ updatedAt: new Date().toISOString(), ...body }));
  const summary = `모델 ${list.length}개 · 벤치마크 ${benchmarks.length}개 갱신${newModels.length ? `\n새 모델: ${newModels.join(', ')}` : ''}`;
  console.log(summary);
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `${summary}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
