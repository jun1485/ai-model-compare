import type { CategoryId, Model, Summary, Vendor } from './types';

export const VENDORS: Record<Vendor, { label: string; brand: string }> = {
  anthropic: { label: 'Anthropic', brand: 'Claude' },
  openai: { label: 'OpenAI', brand: 'GPT' },
  google: { label: 'Google', brand: 'Gemini' },
};

export const VENDOR_ORDER: Vendor[] = ['anthropic', 'openai', 'google'];

export const CATEGORIES: { id: CategoryId; label: string }[] = [
  { id: 'coding', label: '코딩' },
  { id: 'math', label: '수학' },
  { id: 'reasoning', label: '추론·퍼즐' },
  { id: 'knowledge', label: '지식·과학' },
  { id: 'agent', label: '에이전트·업무' },
  { id: 'language', label: '언어·긴 문맥' },
  { id: 'multimodal', label: '시각·멀티모달' },
  { id: 'other', label: '기타' },
];

const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length;

// 모델 이름에서 버전 숫자를 뺀 계열명 추출
export const familyOf = (name: string) =>
  name
    .replace(/\(.*?\)/g, '')
    .replace(/[-\s]?\d+(\.\d+)*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

// 두 모델이 함께 점수를 가진 벤치마크 id 목록 추출
export const overlap = (a: Model, b: Model) => Object.keys(a.scores).filter((id) => id in b.scores);

// 선택 모델 기준 제조사별 기본 비교 대상 선정
export function defaultTarget(models: Model[], sel: Model, vendor: Vendor): Model | undefined {
  const same = vendor === sel.vendor;
  const pool = models
    .filter(
      (m) =>
        m.vendor === vendor &&
        m.id !== sel.id &&
        (same ? m.date < sel.date : m.date <= sel.date) &&
        overlap(sel, m).length > 0,
    )
    .sort((a, b) => b.date.localeCompare(a.date) || b.id.localeCompare(a.id, 'en', { numeric: true }));
  const [latest] = pool;
  // 자사 모델은 같은 계열 직전 모델 우선
  const family = same ? pool.find((m) => familyOf(m.name) === familyOf(sel.name)) : undefined;
  return family ?? latest;
}

// 지정 벤치마크 범위의 평균 점수 차이와 우세 수 집계
export function summarize(sel: Model, target: Model, benchIds: string[]): Summary | undefined {
  const pairs = benchIds.flatMap((id) => {
    const a = sel.scores[id]?.s;
    const b = target.scores[id]?.s;
    return a === undefined || b === undefined ? [] : [[a, b] as const];
  });
  if (!pairs.length) return undefined;
  const a = mean(pairs.map(([x]) => x));
  const b = mean(pairs.map(([, y]) => y));
  return {
    n: pairs.length,
    wins: pairs.filter(([x, y]) => x > y).length,
    a,
    b,
    pp: (a - b) * 100,
    rel: b > 0 ? ((a - b) / b) * 100 : 0,
  };
}

// 0~1 점수 백분율 표기
export const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// 증감 부호 포함 표기
export const signed = (v: number, unit: string) => `${v > 0 ? '+' : v < 0 ? '−' : '±'}${Math.abs(v).toFixed(1)}${unit}`;

// 증감 방향별 색상 클래스
export const tone = (v: number) => (v > 0.05 ? 'up' : v < -0.05 ? 'down' : 'flat');
