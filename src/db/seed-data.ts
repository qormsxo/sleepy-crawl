import { DEFAULT_THRESHOLDS, DEFAULT_WEIGHTS } from '../core/constants';

/** 지시서 3-2 초기 키워드. 시드 이후에는 DB에서만 관리한다. */
export const INITIAL_MIDNIGHT_KEYWORDS = [
  '새벽 감성',
  '잠이 안 온다',
  '갑자기 생각났는데',
  '문득',
  '인생이란',
  '현타',
  '왜 사는 걸까',
  '나만 이런가',
  '미치겠다',
  '오늘따라',
  '갑자기 궁금한데',
  '이 시간에',
  '무슨 생각으로',
  '잠들기 전에',
  '새벽에 생각해 보니까',
];

/** 지시서 5-1 유형 설명. */
export const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  ABSURD: '황당하고 비상식적인 글',
  LATE_NIGHT_EMOTION: '새벽 감성이 강한 글',
  OVERTHINKING: '지나친 고민이나 과몰입',
  NONSENSE_HUMOR: '맥락이 없거나 비논리적인 유머',
  IMPULSIVE_THOUGHT: '갑작스럽고 충동적인 생각',
  WEIRD_OBSERVATION: '독특한 일상 관찰',
  MEME: '인터넷 밈을 활용한 글',
  OTHER: '그 외',
};

/** 지시서 5-2 평가 항목 설명. */
export const CRITERIA: Record<string, string> = {
  absurdity: '황당함과 비상식적인 전개',
  unexpectedness: '예상하지 못한 전개',
  originality: '독특한 사고와 표현',
  late_night_emotion: '새벽 특유의 감정과 분위기',
  humor: '유머와 재미',
  shareability: '독창성과 공유 가치',
};

export const PROMPT_V1 = {
  name: 'v1',
  systemPrompt: [
    '너는 "Sleepy Crawler"의 게시글 큐레이터다.',
    'Sleepy Crawler는 새벽 시간대에 인터넷 커뮤니티에 올라오는 독특하고 황당한 글을 찾아 소개하는 서비스다.',
    '일반적인 인기글이나 유익한 정보글을 찾는 서비스가 아니다.',
    '새벽 감성, 엉뚱한 생각, 앞뒤가 맞지 않지만 웃긴 글, 사소한 일에 대한 과몰입, 갑작스러운 선언, 황당한 맥락, 밈의 독특한 활용을 높게 평가한다.',
    '반드시 지정된 JSON 형식으로만 답한다.',
  ].join('\n'),
  evalPrompt: [
    '아래 게시글을 평가하라.',
    '- 게시글 전체의 맥락과 전개를 본다.',
    '- 욕설, 자극적인 표현, 단순한 말장난만으로 높은 점수를 주지 않는다.',
    '- 인기글인지 여부나 작성 시간은 점수에 반영하지 않는다.',
    '- 각 항목 점수는 0 이상 배점 이하의 정수다. score는 항목 점수의 합이다.',
    '- scores_reason에 항목별 근거를 한 문장씩 쓴다.',
    '- reason은 독자에게 보여줄 한국어 선정 이유 1~2문장이다.',
    '- 안전성 문제가 있으면 safety.is_safe=false와 해당 flags를 넣는다. 판단이 애매하면 safety.uncertain=true.',
    '- is_candidate는 이 글이 서비스 성격에 맞는지 여부다.',
  ].join('\n'),
  criteria: CRITERIA,
  categoryDescriptions: CATEGORY_DESCRIPTIONS,
  exclusions: [
    '개인정보 및 신상 노출 (PERSONAL_INFO)',
    '특정 개인에 대한 심각한 괴롭힘 (HARASSMENT)',
    '혐오 및 폭력 선동 (HATE_VIOLENCE)',
    '자해·자살 등 위기 상황 (SELF_HARM)',
    '불법 행위 조장 (ILLEGAL)',
    '광고 및 도배 (SPAM)',
  ].join('\n'),
  weights: DEFAULT_WEIGHTS,
  thresholds: DEFAULT_THRESHOLDS,
  active: true,
  createdBy: 'seed',
};

export const INITIAL_SETTINGS: Record<string, unknown> = {
  crawl_interval_minutes: 10,
  preview_max_chars: 120,
  daily_eval_limit: 1000,
};

export const FIXTURE_SOURCE = {
  key: 'fixture',
  name: '샘플 커뮤니티',
  region: 'KR' as const,
  adapterKey: 'fixture',
  status: 'ACTIVE' as const,
  statusReason: '개발/데모용 샘플 데이터',
  timezone: 'Asia/Seoul',
};
