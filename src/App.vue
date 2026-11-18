<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import type { Benchmark, Dataset, Model, Summary, Vendor } from './types';
import { CATEGORIES, VENDORS, VENDOR_ORDER, defaultTarget, pct, signed, summarize, tone } from './compare';

/** 선택 목록에 올릴 최소 벤치마크 수 */
const MIN_SCORES = 3;
/** 새 모델 표시 기간 */
const NEW_DAYS = 21;

const data = ref<Dataset>();
const error = ref('');
const selectedId = ref('');
const targetIds = ref<string[]>([]);
const commonOnly = ref(false);

const models = computed(() => (data.value?.models ?? []).filter((m) => Object.keys(m.scores).length >= MIN_SCORES));
const byId = computed(() => new Map(models.value.map((m) => [m.id, m])));
const selected = computed(() => byId.value.get(selectedId.value));
const targets = computed(() => targetIds.value.map((id) => byId.value.get(id)));
const benchById = computed(() => new Map((data.value?.benchmarks ?? []).map((b) => [b.id, b])));

// 선택 모델 기준 자사 이전 모델 + 경쟁사 최신 모델 기본값 산출
function defaultTargets(sel: Model): string[] {
  const order = [sel.vendor, ...VENDOR_ORDER.filter((v) => v !== sel.vendor)];
  return order.map((v) => defaultTarget(models.value, sel, v)?.id ?? '');
}

// 모델 선택 시 비교 대상 초기화
function selectModel(id: string) {
  const sel = byId.value.get(id);
  if (!sel) return;
  selectedId.value = id;
  targetIds.value = defaultTargets(sel);
  window.scrollTo({ top: document.getElementById('compare')?.offsetTop ?? 0, behavior: 'smooth' });
}

// 주소 쿼리의 선택 상태 복원
function restoreFromUrl() {
  const q = new URLSearchParams(location.search);
  const sel = byId.value.get(q.get('m') ?? '') ?? models.value[0];
  if (!sel) return;
  selectedId.value = sel.id;
  const fromUrl = q.get('t')?.split(',');
  targetIds.value = fromUrl?.length === 3 ? fromUrl.map((id) => (byId.value.has(id) ? id : '')) : defaultTargets(sel);
}

// 선택 상태 주소 반영
watch([selectedId, () => targetIds.value.join(',')], () => {
  if (!selectedId.value) return;
  const q = new URLSearchParams({ m: selectedId.value, t: targetIds.value.join(',') });
  history.replaceState(null, '', `?${q}`);
});

onMounted(async () => {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/models.json`);
    if (!res.ok) throw new Error(`${res.status}`);
    data.value = await res.json();
    restoreFromUrl();
  } catch (e) {
    error.value = `데이터를 불러오지 못했습니다 (${e instanceof Error ? e.message : e})`;
  }
});

const daysAgo = (date: string) => (Date.now() - Date.parse(date)) / 86_400_000;

// 최근 출시 모델과 자사 이전 모델 대비 향상률
const recent = computed(() =>
  models.value.slice(0, 8).map((m) => {
    const prev = defaultTarget(models.value, m, m.vendor);
    return { model: m, prev, summary: prev ? summarize(m, prev, Object.keys(m.scores)) : undefined };
  }),
);

// 제조사별 선택 목록
const groups = computed(() =>
  VENDOR_ORDER.map((v) => ({ vendor: v, models: models.value.filter((m) => m.vendor === v) })),
);

// 비교 대상별 전체 요약
const overall = computed(() =>
  targets.value.map((t) => (selected.value && t ? summarize(selected.value, t, Object.keys(selected.value.scores)) : undefined)),
);

// 분야별 벤치마크 행과 비교 대상별 요약
const sections = computed(() => {
  const sel = selected.value;
  if (!sel) return [];
  return CATEGORIES.map((c) => {
    const benches = Object.keys(sel.scores)
      .map((id) => benchById.value.get(id))
      .filter((b): b is Benchmark => b?.category === c.id)
      .filter((b) => !commonOnly.value || targets.value.every((t) => !t || b.id in t.scores))
      .sort((a, b) => Number(a.superseded) - Number(b.superseded) || a.name.localeCompare(b.name));
    const ids = benches.map((b) => b.id);
    return {
      ...c,
      benches,
      summaries: targets.value.map((t) => (t ? summarize(sel, t, ids) : undefined)),
    };
  }).filter((s) => s.benches.length);
});

const slotLabel = (i: number) => {
  const sel = selected.value;
  if (!sel) return '';
  if (i === 0) return `${VENDORS[sel.vendor].brand} 이전 모델`;
  const v = VENDOR_ORDER.filter((x) => x !== sel.vendor)[i - 1] as Vendor;
  return `${VENDORS[v].brand} 경쟁 모델`;
};

const summaryText = (s: Summary) => `공통 ${s.n}개 중 ${s.wins}개 우세`;

const updatedLabel = computed(() =>
  data.value ? new Date(data.value.updatedAt).toLocaleString('ko-KR', { dateStyle: 'medium', timeStyle: 'short' }) : '',
);
</script>

<template>
  <header class="top">
    <div class="wrap">
      <p class="eyebrow">Claude · GPT · Gemini</p>
      <h1>AI 모델 성능 비교</h1>
      <p class="lede">새 모델이 공개 벤치마크에 올라오면 자동으로 모아, 이전 모델과 경쟁사 최신 모델보다 분야별로 몇 % 나아졌는지 보여 줍니다.</p>
      <p v-if="data" class="meta">
        데이터 갱신 {{ updatedLabel }} · 모델 {{ models.length }}개 · 벤치마크 {{ data.benchmarks.length }}개
      </p>
    </div>
  </header>

  <main class="wrap">
    <p v-if="error" class="notice">{{ error }}</p>
    <p v-else-if="!data" class="notice">불러오는 중…</p>

    <template v-else>
      <section>
        <h2>최근 나온 모델</h2>
        <div class="cards">
          <button
            v-for="r in recent"
            :key="r.model.id"
            class="card"
            :class="{ active: r.model.id === selectedId }"
            @click="selectModel(r.model.id)"
          >
            <span class="card-top">
              <span class="chip" :class="r.model.vendor">{{ VENDORS[r.model.vendor].label }}</span>
              <span v-if="daysAgo(r.model.date) <= NEW_DAYS" class="new">NEW</span>
              <span class="date">{{ r.model.date }}</span>
            </span>
            <strong class="card-name">{{ r.model.name }}</strong>
            <span v-if="r.summary && r.prev" class="card-delta">
              <span class="big" :class="tone(r.summary.rel)">{{ signed(r.summary.rel, '%') }}</span>
              <span class="sub">{{ r.prev.name }} 대비 · {{ summaryText(r.summary) }}</span>
            </span>
            <span v-else class="sub">비교할 이전 모델 없음</span>
          </button>
        </div>
      </section>

      <section id="compare">
        <h2>비교하기</h2>
        <div class="pickers">
          <label class="picker main">
            <span>기준 모델</span>
            <select :value="selectedId" @change="selectModel(($event.target as HTMLSelectElement).value)">
              <optgroup v-for="g in groups" :key="g.vendor" :label="VENDORS[g.vendor].label">
                <option v-for="m in g.models" :key="m.id" :value="m.id">
                  {{ m.name }} · {{ m.date }} · {{ Object.keys(m.scores).length }}개
                </option>
              </optgroup>
            </select>
          </label>
          <label v-for="(_, i) in targetIds" :key="i" class="picker">
            <span>{{ slotLabel(i) }}</span>
            <select v-model="targetIds[i]">
              <option value="">비교 안 함</option>
              <optgroup v-for="g in groups" :key="g.vendor" :label="VENDORS[g.vendor].label">
                <option v-for="m in g.models" :key="m.id" :value="m.id" :disabled="m.id === selectedId">
                  {{ m.name }} · {{ m.date }}
                </option>
              </optgroup>
            </select>
          </label>
        </div>

        <div v-if="selected" class="summary">
          <template v-for="(t, i) in targets" :key="i">
            <div v-if="t" class="sum-card">
              <span class="sum-head">
                <span class="dot" :class="t.vendor" />{{ selected.name }} vs {{ t.name }}
              </span>
              <template v-if="overall[i]">
                <span class="big" :class="tone(overall[i]!.rel)">{{ signed(overall[i]!.rel, '%') }}</span>
                <span class="sub">
                  평균 {{ pct(overall[i]!.b) }} → {{ pct(overall[i]!.a) }} ({{ signed(overall[i]!.pp, '%p') }}) ·
                  {{ summaryText(overall[i]!) }}
                </span>
              </template>
              <span v-else class="sub">공통 벤치마크 없음</span>
            </div>
          </template>
        </div>
      </section>

      <section v-if="selected">
        <h2>분야별 향상률</h2>
        <div class="table-scroll">
          <table class="grid">
            <thead>
              <tr>
                <th>분야</th>
                <template v-for="(t, i) in targets" :key="i">
                  <th v-if="t"><span class="dot" :class="t.vendor" />vs {{ t.name }}</th>
                </template>
              </tr>
            </thead>
            <tbody>
              <tr v-for="s in sections" :key="s.id">
                <th>{{ s.label }}</th>
                <template v-for="(t, i) in targets" :key="i">
                  <td v-if="t">
                    <template v-if="s.summaries[i]">
                      <span class="val" :class="tone(s.summaries[i]!.rel)">{{ signed(s.summaries[i]!.rel, '%') }}</span>
                      <span class="sub">{{ s.summaries[i]!.wins }}/{{ s.summaries[i]!.n }} 우세</span>
                    </template>
                    <span v-else class="na">—</span>
                  </td>
                </template>
              </tr>
            </tbody>
          </table>
        </div>
      </section>

      <section v-if="selected">
        <div class="section-head">
          <h2>벤치마크별 점수</h2>
          <label class="toggle"><input v-model="commonOnly" type="checkbox" /> 비교 대상 모두에 있는 것만</label>
        </div>
        <div class="table-scroll">
          <table class="grid bench">
            <thead>
              <tr>
                <th>벤치마크</th>
                <th><span class="dot" :class="selected.vendor" />{{ selected.name }}</th>
                <template v-for="(t, i) in targets" :key="i">
                  <th v-if="t"><span class="dot" :class="t.vendor" />{{ t.name }}</th>
                </template>
              </tr>
            </thead>
            <tbody v-for="s in sections" :key="s.id">
              <tr class="cat-row">
                <th>{{ s.label }}</th>
                <td :colspan="1 + targets.filter(Boolean).length" />
              </tr>
              <tr v-for="b in s.benches" :key="b.id">
                  <th>
                    {{ b.name }}
                    <span v-if="b.superseded" class="tag">구버전</span>
                  </th>
                  <td>
                    <span class="score">{{ pct(selected.scores[b.id]!.s) }}</span>
                    <span class="bar"><span :class="selected.vendor" :style="{ width: pct(selected.scores[b.id]!.s) }" /></span>
                  </td>
                  <template v-for="(t, i) in targets" :key="i">
                    <td v-if="t">
                      <template v-if="t.scores[b.id]">
                        <span class="score muted">{{ pct(t.scores[b.id]!.s) }}</span>
                        <span
                          class="val small"
                          :class="tone((selected.scores[b.id]!.s - t.scores[b.id]!.s) * 100)"
                        >
                          {{ signed((selected.scores[b.id]!.s - t.scores[b.id]!.s) * 100, '%p') }}
                          <template v-if="t.scores[b.id]!.s > 0">
                            ({{ signed(((selected.scores[b.id]!.s - t.scores[b.id]!.s) / t.scores[b.id]!.s) * 100, '%') }})
                          </template>
                        </span>
                      </template>
                      <span v-else class="na">—</span>
                    </td>
                  </template>
                </tr>
            </tbody>
          </table>
        </div>
      </section>

      <footer class="foot">
        <p>
          출처: <a :href="data.source.url" target="_blank" rel="noopener">{{ data.source.name }}</a> ({{ data.source.license }}).
          6시간마다 자동으로 다시 받아 새 모델을 반영합니다.
        </p>
        <p>
          향상률은 두 모델이 함께 치른 벤치마크의 평균 점수 차이를 이전 평균으로 나눈 값입니다. 추론 강도(low·high·max 등) 설정이 여러 개면 가장 높은 점수를 씁니다.
          공통 점수가 있는 모델 중 자사는 같은 계열 직전 모델을 우선하고, 경쟁사는 기준 모델 출시일까지 나온 최신 모델을 기본으로 고릅니다.
        </p>
      </footer>
    </template>
  </main>
</template>
