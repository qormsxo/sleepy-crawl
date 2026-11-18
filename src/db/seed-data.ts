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
  // Popular lists lag hours behind: keep checking them after the night window (post-time filter unchanged).
  followup_until_hour: 15,
  followup_interval_minutes: 30,
  max_detail_fetches_per_run: 20,
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

const CHECKED = new Date('2026-11-18T00:00:00+09:00');
type SourceSeed = {
  key: string;
  name: string;
  region: 'KR' | 'GLOBAL';
  adapterKey: string;
  status: 'ACTIVE' | 'UNSUPPORTED' | 'PENDING_APPROVAL';
  statusReason: string;
  policyNotes: string;
  policyCheckedAt: Date;
  timezone: string;
  config: Record<string, unknown>;
};

/** 수집 대상 조사 결과 (docs/sources.md, 2026-11-18). 관리자가 이후 변경할 수 있다. */
export const KOREAN_SOURCES: SourceSeed[] = [
  {
    key: 'todayhumor', name: '오늘의유머', region: 'KR', adapterKey: 'todayhumor', status: 'ACTIVE',
    statusReason: '사용자 승인(2026-11-18)', policyNotes: 'robots 사실상 전부 허용. 약관 원문 미확인.',
    policyCheckedAt: CHECKED, timezone: 'Asia/Seoul',
    config: { lists: ['https://www.todayhumor.co.kr/board/list.php?table=bestofbest', 'https://www.todayhumor.co.kr/board/list.php?table=humorbest'] },
  },
  {
    key: 'fmkorea', name: '에펨코리아', region: 'KR', adapterKey: 'fmkorea', status: 'ACTIVE',
    statusReason: '사용자 승인(2026-11-18)', policyNotes: 'robots는 /best, /best2, /humor만 허용. 약관 제11조17호·제13조② 주의.',
    policyCheckedAt: CHECKED, timezone: 'Asia/Seoul',
    config: { lists: ['https://www.fmkorea.com/best'] },
  },
  {
    key: 'ruliweb', name: '루리웹', region: 'KR', adapterKey: 'ruliweb', status: 'ACTIVE',
    statusReason: '사용자 승인(2026-11-18)', policyNotes: '검색·정렬 파라미터 금지. 약관 제13조①2호(영리·비영리 복제 제한) 주의.',
    policyCheckedAt: CHECKED, timezone: 'Asia/Seoul',
    config: { lists: ['https://bbs.ruliweb.com/best/humor_only'] },
  },
  {
    key: 'inven', name: '인벤', region: 'KR', adapterKey: 'inven', status: 'ACTIVE',
    statusReason: '사용자 승인(2026-11-18)', policyNotes: '검색만 금지. 약관에 크롤링 금지 조항 없음.',
    policyCheckedAt: CHECKED, timezone: 'Asia/Seoul',
    config: { lists: ['https://www.inven.co.kr/board/webzine/2097?my=chu'] },
  },
  ...([
    ['dcinside', 'DCInside', '약관 제16조: 사전 서면 동의 없는 크롤링 명시적 금지'],
    ['mlbpark', 'MLB PARK', 'robots.txt가 일반 봇 전면 금지(Disallow: /)'],
    ['ppomppu', '뽐뿌', '첫 페이지부터 403 차단(우회하지 않음)'],
    ['clien', '클리앙', '검토 대기: 사용자 미선택. 추천글 경로·쿼리 금지, 약관 제13조③'],
    ['theqoo', '더쿠', '검토 대기: 사용자 미선택. AI 크롤러 차단, Content-Signal ai-train=no'],
    ['humoruniv', '웃긴대학', '검토 대기: 사용자 미선택. 베스트 게시판 robots 금지'],
  ] as const).map(([key, name, reason]): SourceSeed => ({
    key, name, region: 'KR', adapterKey: key, status: 'UNSUPPORTED', statusReason: reason,
    policyNotes: 'docs/sources.md 참고', policyCheckedAt: CHECKED, timezone: 'Asia/Seoul', config: {},
  })),
  {
    key: 'reddit', name: 'Reddit', region: 'GLOBAL', adapterKey: 'reddit', status: 'PENDING_APPROVAL',
    statusReason: '사용자 보류(2026-11-18): 공식 API 승인과 시간대 정책 미정',
    policyNotes: '공식 API만 사용 예정', policyCheckedAt: CHECKED, timezone: 'America/New_York', config: {},
  },
];
