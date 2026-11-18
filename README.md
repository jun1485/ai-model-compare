# AI 모델 성능 비교

Claude·GPT·Gemini 신모델이 공개 벤치마크에 올라오면 이전 자사 모델과 경쟁사 최신 모델 대비 분야별 향상률을 보여 주는 사이트.

- 데이터: [Epoch AI Benchmarking Hub](https://epoch.ai/benchmarks) 공개 ZIP(CC BY 4.0)
- 수집: `npm run crawl` → `public/data/models.json` (새 모델은 `firstSeen` 으로 기록)
- 자동화: `.github/workflows/update.yml` 이 6시간마다 수집하고 GitHub Pages 로 배포하며, 데이터가 바뀐 경우에만 갱신 커밋 생성
- 개발: `npm run dev`, 빌드: `npm run build`
- 분야 분류: `scripts/benchmarks.mjs`
