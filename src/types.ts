export type Vendor = 'anthropic' | 'openai' | 'google';

export type CategoryId = 'coding' | 'math' | 'reasoning' | 'knowledge' | 'agent' | 'language' | 'multimodal' | 'other';

export interface Benchmark {
  id: string;
  name: string;
  category: CategoryId;
  released: string;
  superseded: boolean;
}

export interface Score {
  /** 0~1 로 환산한 점수 */
  s: number;
  /** 최고점을 낸 추론 강도 */
  v: string;
}

export interface Model {
  id: string;
  name: string;
  vendor: Vendor;
  date: string;
  firstSeen: string;
  scores: Record<string, Score>;
}

export interface Dataset {
  updatedAt: string;
  source: { name: string; url: string; license: string };
  benchmarks: Benchmark[];
  models: Model[];
}

export interface Summary {
  n: number;
  wins: number;
  a: number;
  b: number;
  pp: number;
  rel: number;
}
