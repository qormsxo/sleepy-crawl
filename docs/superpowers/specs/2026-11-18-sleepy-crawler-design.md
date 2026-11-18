# Sleepy Crawler — 신규 설계 문서

- 작성일: 2026-11-18
- 근거: 사용자 개발 지시서(0~12장) 전체
- 상태: 승인됨 (2026-11-18, 사용자 "일단 해봐" — 14절 기본값과 아래 15절 추천안 채택)

표기 규칙: **[지시서]** = 사용자 지시서에 명시된 결정, **[내 판단]** = 지시서에 없어서 설계자가 정한 기본값(변경 가능), **[빌더 재량]** = 구현자가 정해도 되는 부분.

---

## 1. 의도와 목적

한국 시간 23:00~03:00 사이에 작성된 인터넷 커뮤니티 글 중 "새벽에만 나오는 이상하고 황당하고 웃긴 글"을 찾아, AI가 서비스 성격에 맞는지 평가해 공개 웹사이트에 보여준다. **[지시서]**

일반 인기글 모음 사이트가 아니다. 인기글 목록은 후보 확보 경로일 뿐 평가 가산점이 아니다. **[지시서]**

최우선 목표는 다음 기본 흐름을 끝까지 완성하는 것이다. 관리자 기능과 세부 설정은 그다음이다. **[지시서]**

> 게시글 수집 → 중복 제거 → AI 평가 → 공개 여부 결정 → 웹사이트 노출

## 2. 목표 / 비목표 / 반목표

**목표**
- 허용된 방법으로만 한국 커뮤니티(목표 80%)와 Reddit(목표 20%)에서 후보를 수집
- 작성 시각 기준 23:00:00 ≤ t < 03:00:00 (Asia/Seoul) 필터
- AI 평가(6개 항목 점수 + 복수 분류 + 안전성 분리) 후 규칙 기반 공개 결정
- 로그인 없는 공개 피드, 필터, 익명 제보
- 관리자: 대시보드, 커뮤니티·키워드·밈·프롬프트·게시글 관리, 재평가 비교
- 키워드·프롬프트·임계값·배점·실행 주기는 모두 DB에서 관리 (배포 없이 변경)

**비목표 (이번 범위 아님)** **[지시서]**
- 광고, 결제, 일반 사용자 계정
- Instagram 카드 생성/업로드 (단, 확장 가능한 구조는 유지 — 12장)

**비목표** **[내 판단]**
- Reddit 글 번역 (원문 언어 그대로 표시, AI 선정 이유만 한국어)
- 다중 관리자 권한 등급 (관리자 계정은 있지만 역할 구분 없음)

**반목표 — 동작하더라도 실패로 보는 것**
- 피드가 그냥 "커뮤니티 인기글 모음"처럼 보이는 것
- 원문 전체를 복제·장기 저장하는 것
- robots.txt/약관 위반, 로그인·CAPTCHA·접근 제한 우회 **[지시서]**
- 안전성 문제가 있는 글, 작성 시각 불명 글, AI 오류 글이 자동 공개되는 것 **[지시서]**
- 크롤러 하나의 장애가 웹사이트나 다른 크롤러를 멈추는 것 **[지시서]**

## 3. 제약

- 허용된 수집 방법만 사용. 사이트별로 robots.txt·약관·API·RSS를 조사하고, 허용되지 않으면 관리자 화면에 "미지원"으로 표시. **[지시서]**
  - 조사 대상 10개 **[지시서 2-3]**: DCInside, 에펨코리아, 루리웹, 클리앙, 더쿠, 인벤, MLB PARK, 웃긴대학, 오늘의유머, 뽐뿌.
  - 예상: 목록의 10개 사이트 중 상당수가 자동 수집을 금지하거나 검색 페이지를 막고 있을 가능성이 높다. 출시 시 활성 한국 소스가 소수일 수 있으며, 80:20 비율은 그 경우 억지로 맞추지 않는다. **[지시서 2-2]**
- Reddit은 공식 API만 사용. 앱 등록·승인이 필요하며 승인 전까지 Reddit 소스는 `PENDING_APPROVAL` 상태로 둔다. 요청 제한 헤더를 준수한다. **[지시서 + 확인된 외부 제약]**
- 비밀키는 환경변수로만 관리. **[지시서]**
- 기존 코드·구조·데이터 모델은 계승하지 않는다. 기존 Git 기록·설정·환경변수는 삭제하지 않는다. **[지시서]**
- 비용: 소규모 VPS 1대 + LLM API 사용량 수준. **[내 판단]**

## 4. 접근 방식 (Approaches)

| 안 | 구성 | 장점 | 단점 |
|---|---|---|---|
| **A (선택)** | Next.js(웹+API+관리자) + 별도 Node 워커 + PostgreSQL(데이터 + pg-boss 작업 큐) | 언어 하나, 인프라는 DB 하나, 크롤링/평가가 웹과 분리됨 | Python 대비 크롤링·AI 라이브러리 선택지 약간 적음 |
| B | FastAPI + Celery + Redis + 별도 Next.js | 크롤링·AI 생태계 최상 | 언어 2개, 배포 단위 3개, Redis 추가 — 이 규모엔 과함 |
| C | 서버리스 (Vercel + Supabase + 예약 함수) | 서버 관리 없음 | 실행시간 제한, 브라우저 자동화 불가, 작업 분리·재시도 구조가 9장 요구와 맞지 않음 |

**사용자가 A안을 선택했다 (2026-11-18).** 이유: 9장의 책임 분리를 프로세스 2개(웹/워커)로 충족하면서 구조가 가장 단순하고, 사용자가 TypeScript 경험이 있다.

## 5. 기술 스택 **[내 판단, A안 범위 내]**

| 영역 | 선택 | 이유 |
|---|---|---|
| 언어/런타임 | TypeScript, Node.js 현행 LTS | 단일 언어 |
| 웹 | Next.js (App Router, 현행 안정 버전), Tailwind CSS | 공개 화면·관리자·API를 하나의 앱으로 |
| DB | PostgreSQL 16+ | 관계형 데이터, 통계 쿼리, 작업 큐 겸용 |
| ORM/마이그레이션 | Drizzle ORM + drizzle-kit | 가볍고 SQL에 가까움, 타입 안전 |
| 작업 큐/스케줄 | pg-boss (Postgres 기반 큐, cron 지원) | Redis 불필요, 재시도·백오프·동시성 제한 내장 |
| HTTP 수집 | undici/fetch + cheerio | 정적 HTML 파싱이 기본 |
| 브라우저 자동화 | Playwright — 꼭 필요한 소스에만, 기본 비활성 | 비용·부하 최소화 |
| 시간 처리 | date-fns-tz (또는 Temporal 폴리필) | Asia/Seoul 변환 [빌더 재량: 라이브러리 선택] |
| 검증 | zod (LLM 응답 JSON Schema 검증, API 입력 검증) | 5-4 요구 |
| LLM | 공급자 어댑터 인터페이스, 기본 OpenAI (구조화 출력/JSON Schema 모드) | 교체 가능. 모델명은 환경변수 |
| 관리자 인증 | 이메일+비밀번호(argon2 해시), 암호화 세션 쿠키(iron-session 등) | 단일 관리자 수준에 충분 |
| 제보 보호 | Cloudflare Turnstile + IP 기반 요청 제한(DB) | 스팸 방지 |
| 로깅/오류 | pino 구조화 로그 + DB의 실행 기록 테이블. 외부 오류 추적(Sentry)은 DSN 있을 때만 활성 | 9장 오류 추적 |
| 테스트 | Vitest(단위/통합), Playwright(핵심 화면 E2E) | |
| 배포 | VPS 1대 + Docker Compose (web, worker, postgres) + Caddy(HTTPS) | 월 1~2만 원대 |
| 패키지 관리 | pnpm, 단일 패키지 (모노레포 아님) | 단순함 |

## 6. 전체 아키텍처

```
                ┌──────────────── VPS (Docker Compose) ────────────────┐
 방문자 ──HTTPS──▶ Caddy ──▶ web (Next.js)                              │
 관리자 ──HTTPS──▶          ├ 공개 피드 / 제보 폼                        │
                │          ├ /admin (세션 인증)                          │
                │          └ API 라우트 ── 작업 등록(enqueue) ──┐        │
                │                                              ▼        │
                │                       PostgreSQL (데이터 + pg-boss 큐) │
                │                                              ▲        │
                │          worker (Node) ─── 작업 소비 ─────────┘        │
                │          ├ scheduler: 실행 주기에 따라 crawl 작업 생성   │
                │          ├ crawl:<source> → 커뮤니티 어댑터 → 정규화     │
                │          │                 → 시간 필터 → 중복 검사 → 저장│
                │          ├ evaluate:post → LLM 어댑터 → 검증 → 공개 결정 │
                │          └ submission:process → 어댑터로 원문 확인 → 평가│
                └───────────────────────────────────────────────────────┘
                              │ 허용된 HTTP 요청만         │ LLM API
                              ▼                           ▼
                     한국 커뮤니티 / Reddit API      OpenAI(기본)
```

- web과 worker는 같은 코드베이스, 다른 진입점, 다른 컨테이너. worker가 죽거나 외부 사이트가 느려도 web은 영향받지 않는다. **[지시서 9장 충족]**
- 크롤링과 AI 평가는 서로 다른 큐. 크롤링이 끝나면 저장된 게시글마다 `evaluate:post` 작업을 등록한다. LLM 장애 시 크롤링은 계속되고 평가 작업만 재시도된다.
- 소스별 큐 동시성 1 + 소스별 최소 요청 간격으로 상대 사이트 부하를 제한한다.

### 디렉터리 구조 **[내 판단]**

```
sleepy-crawl/
├─ src/
│  ├─ app/                    # Next.js App Router
│  │  ├─ (public)/            # 피드, 제보, 게시글 상세(선택)
│  │  ├─ admin/               # 관리자 화면
│  │  └─ api/                 # 공개 API, 관리자 API, 제보 API
│  ├─ worker/
│  │  ├─ index.ts             # 워커 진입점, 큐 등록
│  │  ├─ scheduler.ts
│  │  └─ jobs/                # crawl, evaluate, submission, reevaluate
│  ├─ sources/                # 커뮤니티 어댑터 (소스당 1파일 + 픽스처 테스트)
│  │  ├─ types.ts
│  │  ├─ registry.ts
│  │  ├─ reddit.ts
│  │  └─ <community>.ts
│  ├─ core/                   # 도메인 로직 (프레임워크 무관, 테스트 집중)
│  │  ├─ time-window.ts       # KST 시간 판정, 새벽 날짜 계산
│  │  ├─ normalize.ts         # URL 정규화, 미리보기 생성
│  │  ├─ dedupe.ts            # 중복 키, 유사 그룹
│  │  ├─ keywords.ts          # 키워드/밈 매칭
│  │  ├─ evaluation/          # 프롬프트 조립, 스키마, 검증, 공개 결정 규칙
│  │  └─ quota.ts             # 80:20 작업량 배분
│  ├─ llm/                    # LLM 공급자 어댑터
│  ├─ db/                     # Drizzle 스키마, 마이그레이션, 시드
│  └─ lib/                    # 로깅, 설정, 인증, 요청 제한
├─ tests/                     # E2E
├─ docs/
│  ├─ superpowers/specs/      # 이 문서
│  ├─ decisions.md            # 결정 기록 (지시서 0장 "결정 사항 문서화")
│  ├─ sources.md              # 사이트별 수집 허용 조사 결과
│  └─ phases/phase-N.md       # 단계별 구현 내역·테스트 결과 (11장)
├─ docker-compose.yml
├─ Dockerfile
└─ .env.example
```

### 기존 코드 처리 **[내 판단]**
- 현재 커밋에 `legacy-v0` 태그를 단 뒤, 기존 `src/`, `package.json`, `tsconfig.json`, `README.md`를 새 프로젝트로 교체한다. 기존 코드는 Git 기록과 태그로 언제든 볼 수 있다.
- `.gitignore`는 지우지 않고 필요한 항목만 추가한다. `.env` 계열 파일은 건드리지 않는다(현재 작업 폴더에는 없음).
- Git 원격, 사용자 설정은 변경하지 않는다.

## 7. 핵심 동작 설계

### 7-1. 시간 판정 **[지시서 2-1]**
- 모든 시각은 DB에 UTC(`timestamptz`)로 저장, 판정·표시는 Asia/Seoul.
- `isInNightWindow(t)`: KST 시각의 시(hour)가 23, 0, 1, 2 중 하나면 true. 즉 23:00:00 ≤ t < 03:00:00.
- `nightDate(t)`: 23시대 글은 당일, 0~2시대 글은 전날 날짜. 예) 11/19 01:30 작성 → 새벽 날짜 11/18. 피드의 "날짜별" 필터는 이 값을 사용. **[내 판단]**
- `nightHour`: 23 / 0 / 1 / 2 → "새벽 시간대별" 필터 값.
- 작성 시각 없음/해석 불가 → `posted_at = null`, 자동 공개 금지, 평가는 하되 상태는 관리자 검토. **[지시서]**
- 사이트가 "3분 전", "어제 23:12"처럼 상대 시각을 주면 수집 시각 기준으로 환산하고 `posted_at_precision`(exact / minute / approximate)을 함께 저장. `approximate`이고 경계(±10분)에 걸치면 자동 공개하지 않고 검토로 보낸다. **[내 판단]**
- 경계 단위 테스트 필수: 22:59:59 제외, 23:00:00 포함, 00:00:00 포함, 02:59:59 포함, 03:00:00 제외, UTC 변환 경계 포함.

### 7-2. 스케줄 **[지시서 2-1 + 내 판단]**
- 기본: KST 23:00~02:50 사이 10분 간격 실행. 간격은 관리자 설정(`settings.crawl_interval_minutes`), 소스별 덮어쓰기 가능.
- **[내 판단] 후속 수집**: 02:55에 쓴 글은 03:00 전에 인기글이 되지 않는다. 그래서 03:00 이후에도 설정 가능한 "후속 수집 시간"(기본 03:00~06:00, 30분 간격) 동안 인기글 목록을 다시 확인한다. 이때도 **작성 시각 필터는 동일하게** 적용한다. 관리자가 끌 수 있다.
- scheduler는 1분마다 깨어나 DB 설정을 읽고 실행할 소스별 crawl 작업을 등록한다(설정 변경이 재배포 없이 반영됨). 같은 소스의 작업이 이미 실행 중이면 건너뛴다(singleton key).

### 7-3. 80:20 배분 **[지시서 2-2]**
- 각 실행 회차에 "후보 수집 작업량"(요청 수 기준 예산)을 한국 80 / Reddit 20으로 나누고, 한국 몫은 활성 한국 소스에 균등 배분.
- 한쪽에 수집할 글이 없으면 남은 몫을 억지로 채우지 않는다.
- 회차별 목표 vs 실제(요청 수, 후보 수, 평가 통과 수, 공개 수)를 `crawl_runs`에 기록 → 대시보드 표시.
- 비율과 예산 크기는 설정값.

### 7-4. 소스 어댑터 **[지시서 9장 책임 분리]**

```ts
interface SourceAdapter {
  key: string;                       // 'reddit', 'clien' ...
  capabilities: { popular: boolean; search: boolean; fetchPost: boolean };
  matchUrl(url: URL): ParsedRef | null;          // 제보 URL 판별
  listPopular(ctx): AsyncIterable<RawPost>;       // 3-1
  search?(ctx, keyword): AsyncIterable<RawPost>;  // 3-2/3-3, 허용될 때만
  fetchPost(ctx, ref): Promise<RawPost>;          // 본문 임시 조회 (평가용)
}
```

- 사이트별 수집 가능 여부 조사 결과를 `sources` 테이블과 `docs/sources.md`에 기록: robots.txt 해당 경로 허용 여부, 약관 요지, API/RSS 유무, 확인 일자, 결론(ACTIVE / UNSUPPORTED / PENDING_APPROVAL / DISABLED) 및 사유.
- **robots.txt는 실행 시에도 확인**: 크롤러는 요청 전에 robots.txt(24시간 캐시)를 확인하고, 금지 경로면 요청하지 않는다.
- 식별 가능한 User-Agent(`SleepyCrawlerBot/1.0 (+서비스 URL/bot)`)를 사용하고 위장하지 않는다. **[내 판단]**
- 소스별 최소 요청 간격(기본 3초), 타임아웃 10초, 재시도 최대 3회 지수 백오프. 429/403이면 즉시 중단하고 해당 소스를 일정 시간 쉬게 한다(기본 1시간). 연속 실패 N회(기본 5) → 상태 `DEGRADED`, 관리자 대시보드 경고.
- Reddit: 공식 OAuth API(앱 전용 인증), 관리자가 등록한 서브레딧 목록 대상, `hot`/`top?t=day`/`new` 목록 + 허용 범위의 검색 API. `X-Ratelimit-*` 헤더를 준수한다.

### 7-5. 키워드 경로 **[지시서 3-2, 3-3]**
- 키워드 종류: `MIDNIGHT`(새벽 감성), `ABSURD`(황당한 글 검색), `MEME`(밈). 관리 항목: 키워드, 유사 표현(배열), 설명, 적용 시작/종료일, 활성 여부, 우선순위, 등록일. 초기 데이터는 시드로만 넣고 코드에 하드코딩하지 않는다.
- 사이트 검색이 **허용된 소스**: 우선순위 높은 활성 키워드부터 회차당 상한(기본 5개)까지 검색 → 수집 경로 `MIDNIGHT_KEYWORD` 또는 `MEME_KEYWORD`.
- 검색이 **허용되지 않은 소스**: 인기글 목록 등에서 받은 글의 제목/미리보기를 키워드로 매칭만 한다. 수집 경로는 `POPULAR`로 두고, 매칭된 키워드는 `matched_keywords`로 별도 기록. **[내 판단]** — 분석 시 "검색으로 찾은 글"과 "목록에서 키워드가 맞은 글"을 구분할 수 있게.
- 관리자 변경 사항은 다음 실행 회차부터 반영(매 회차 DB 조회).
- 키워드 매칭 여부는 AI 점수에 직접 반영하지 않는다. AI 프롬프트에 "활성 밈 목록과 설명"은 참고 정보로 제공한다(MEME 분류 판단용). **[내 판단]**

### 7-6. 수집 경로 기록 **[지시서 3-4]**
- 한 글이 여러 경로로 발견될 수 있으므로 `post_discoveries`(post_id, path, keyword_id, crawl_run_id, discovered_at)에 모두 기록하고, `posts.primary_path`는 최초 발견 경로.
- 경로별 평균 점수·공개 비율은 `post_discoveries` 기준으로 집계.

### 7-7. 중복 처리 **[지시서 4장]**
- 1차 키: `(source_id, external_id)` 유니크. external_id를 못 얻으면 정규화 URL 사용.
- 2차 키: `canonical_url` 유니크 (추적 파라미터 제거, 모바일/PC 도메인 통일, 소스 어댑터가 정의).
- 다른 커뮤니티의 같은 내용은 별도 글. 제목+미리보기 정규화 텍스트의 SimHash로 유사 그룹(`similar_group_id`)을 연결만 한다(공개 판단에는 영향 없음, 피드에서 같은 그룹은 하나만 노출 — **[내 판단]**).

### 7-8. AI 평가 **[지시서 5장]**

**입력**: 제목, 본문(임시 조회, 최대 길이 제한 기본 4,000자), 댓글 상위 일부(어댑터가 제공 가능할 때, 기본 5개), 커뮤니티 이름, 활성 밈 설명. 작성 시각은 넣지 않는다(새벽 가산 금지 원칙 — **[내 판단]** 편향 방지).

**프롬프트 버전(`prompt_versions`)** — 관리자가 편집, 새 버전 저장 시 이전 버전 보존:
- 시스템 프롬프트, 게시글 평가 프롬프트(템플릿), 항목별 평가 기준 설명, 유형 설명, 제외 기준, 배점(6개 항목 최대 점수), 공개 임계값(자동 공개/검토 하한), 버전 이름, 활성 여부.
- 활성 버전은 하나. 평가 결과에는 사용한 버전 ID를 저장한다.
- 항목 키 6개(absurdity, unexpectedness, originality, late_night_emotion, humor, shareability)는 고정, 배점만 변경 가능. 배점 합계가 100이 아니어도 되지만, 총점은 100점 만점으로 환산해 저장한다. **[내 판단]**

**분류 유형 8개 (복수 허용)** **[지시서 5-1]**: ABSURD(황당·비상식), LATE_NIGHT_EMOTION(새벽 감성), OVERTHINKING(지나친 고민·과몰입), NONSENSE_HUMOR(맥락 없는·비논리적 유머), IMPULSIVE_THOUGHT(갑작스러운·충동적 생각), WEIRD_OBSERVATION(독특한 일상 관찰), MEME(밈 활용), OTHER.

**기본 배점** **[지시서 5-2]**: absurdity 25, unexpectedness 20, originality 15, late_night_emotion 15, humor 15, shareability 10 = 100. 각 항목 점수와 근거를 생성. 욕설·자극적 표현·단순 말장난만으로 고득점 금지, 전체 맥락·전개 평가, 새벽 작성 시간 자체는 가산 금지.

**출력 JSON** **[지시서 5-4]**:
```json
{
  "is_candidate": true,
  "score": 82,
  "categories": ["ABSURD", "OVERTHINKING"],
  "reason": "평범한 상황에서 지나치게 비약적인 결론을 내리는 독특한 전개가 특징이다.",
  "scores": { "absurdity": 23, "unexpectedness": 18, "originality": 12,
              "late_night_emotion": 10, "humor": 11, "shareability": 8 },
  "safety": { "is_safe": true, "flags": [] },
  "decision": "PUBLISH"
}
```
- `is_candidate`: 서비스 성격(새벽의 독특·황당한 글)에 맞는지에 대한 AI의 판단. 점수가 높아도 성격이 다르면(예: 그냥 유익한 정보글) false.
- `reason`: 공개 카드에 그대로 보이는 한국어 선정 이유(1~2문장).
- 항목별 근거는 `scores_reason`(항목 키 → 한 문장) 필드로 추가한다. **[내 판단]** (5-2 "평가 근거 생성")
- `decision`: PUBLISH / REVIEW / REJECT 중 하나. 참고용으로 `llm_decision`에 저장.
- `safety.is_safe`: 5-3의 6개 사유 중 하나라도 해당하면 false.

**출력 검증**:
- LLM 구조화 출력(JSON Schema 모드) + zod 재검증.
- 서버 측 검증: 각 항목 0 ≤ 점수 ≤ 배점, `score` = 항목 합(불일치 시 항목 합을 사용하고 경고 기록), categories는 정의된 8개 중 1개 이상, safety.flags는 정의된 6개 코드(PERSONAL_INFO, HARASSMENT, HATE_VIOLENCE, SELF_HARM, ILLEGAL, SPAM) 중에서만.
- 안전성 판단 불확실 표현을 위해 `safety.uncertain: boolean` 필드를 추가한다. **[내 판단]** (5-3 "불확실하면 검토")
- 파싱 실패/스키마 불일치 → 1회 재시도 → 그래도 실패면 `EVAL_FAILED`, 공개 금지, 관리자 목록에 표시.

**공개 결정 — LLM의 `decision`은 참고로만 저장하고, 최종 결정은 서버 규칙으로 계산**: **[내 판단]** (임계값 변경을 즉시 반영하고 LLM 오판을 막기 위해)
1. 평가 실패 → `EVAL_FAILED` (비공개)
2. `safety.is_safe = false` → `BLOCKED` (점수 무관 공개 금지)
3. `safety.uncertain = true` → `REVIEW`
4. 작성 시각 없음/경계 근사치 → `REVIEW`
5. 제목·미리보기 모두 없음 → `HIDDEN` (6-1)
6. 점수 ≥ 자동 공개 임계값(기본 70) 그리고 `is_candidate = true` → `PUBLISHED`
7. 점수 ≥ 검토 하한(기본 50) → `REVIEW`
8. 그 외 → `HIDDEN`

관리자 수동 변경은 위 결과를 덮어쓰고 `status_source = ADMIN`으로 기록해 재평가 시 덮어쓰지 않는다.

**재평가와 비교** (7-4):
- 관리자가 샘플 세트(최근 N개 / 선택한 글 / 상태별)를 골라 특정 프롬프트 버전으로 재평가 → `evaluations`에 새 행 추가(기존 결과 보존).
- 비교 화면: 같은 글의 버전 A vs B 점수·분류·결정·이유를 나란히, 결정이 바뀐 글 강조.
- 재평가는 비교용이며 공개 상태를 자동으로 바꾸지 않는다. 관리자가 "이 버전을 활성화"하면 이후 신규 평가부터 적용. **[내 판단]**
- 재평가에는 본문이 필요하므로 원문을 다시 임시 조회한다. 원문이 삭제됐으면 저장된 제목·미리보기로만 평가하고 표시한다.

### 7-9. 원문 저장 정책 **[지시서 8장]**
- 장기 저장: 제목, 미리보기(기본 최대 120자, 설정 가능), 메타데이터, 평가 결과.
- 본문·댓글: 평가 작업 중 메모리에서만 사용하고 DB에 저장하지 않는다. 소스별 `allow_body_storage` 플래그(기본 false)가 true인 경우에만 저장. **[내 판단]**
- 원문이 삭제된 것을 알게 되면(재조회 404) 피드에서 내린다. **[내 판단]**

### 7-10. 제보 **[지시서 6-3]**
- 입력: URL(필수), 설명·유형(선택). Turnstile 토큰 필수.
- 요청 제한: IP당 시간당 5건, 하루 20건(설정 가능). IP는 해시(솔트)로만 저장.
- 처리 작업: URL 형식/허용 스킴 검증 → 소스 어댑터 매칭(미지원 사이트면 "지원하지 않는 사이트" 응답) → 중복 확인(이미 있으면 기존 글에 `USER_SUBMISSION` 발견 기록 추가) → 소스 상태가 ACTIVE이고 robots 허용인지 → 원문 조회·작성 시각 확인(창 밖이면 거절) → AI 평가 → 공개 결정 규칙 동일 적용.
- **[내 판단]** 제보 글도 자동 공개 규칙을 그대로 따른다(점수 70 이상이면 자동 공개). 제보자가 단 설명·유형은 AI 입력에 넣지 않는다(조작 방지), 관리자 화면에만 표시.
- 서버 측 요청은 등록된 소스 도메인으로만 나간다(SSRF 방지).
- 제보 결과는 제보 완료 화면에 "접수됨" 정도로만 안내한다. 처리 결과 조회 기능은 없다. **[내 판단]**

### 7-11. 공개 웹사이트 **[지시서 6장]**
- 메인: 공개(`PUBLISHED`) 글 피드, 무한 스크롤 또는 페이지네이션 **[빌더 재량]**.
- 카드: 제목(없으면 미리보기), 커뮤니티 이름, 작성 시각(KST), AI 분류 배지, 점수, 선정 이유, 원문 링크(새 탭, `rel="noopener nofollow"`), 출처 표시.
- 필터: 최신순 / 점수순 정렬, 새벽 날짜, 커뮤니티, 유형, 새벽 시간대(23/0/1/2시). URL 쿼리로 공유 가능.
- 제보 페이지.
- 모바일 우선 반응형. 디자인 톤은 "새벽" 콘셉트의 어두운 테마. **[빌더 재량: 세부 디자인]**
- 게시글 상세 페이지는 만들지 않는다 — 원문으로 바로 보낸다. **[내 판단]** (복제 최소화)

### 7-12. 관리자 **[지시서 7장]**
- `/admin`, 세션 인증. 최초 관리자 계정은 CLI 시드 명령(`pnpm admin:create`)으로 생성. 로그인 실패 요청 제한, 세션 만료(기본 7일), 상태 변경 요청에 CSRF 방지(SameSite=Strict + Server Actions 출처 검사).
- 대시보드: 누적 수집, 평가 완료, 자동 공개, 검토 대기, 비공개, 커뮤니티별 수집량, 한국/Reddit 비중(목표 vs 실제), 수집 경로별 결과(건수, 평균 점수, 공개 비율), 최근 실행 상태와 오류.
- 커뮤니티 관리: 등록·수정·비활성화(삭제는 수집 기록이 없을 때만), 수집 설정(인기글 URL 등 어댑터 파라미터, 요청 간격, 예산), 실행 주기, 상태, 조사 메모, 오류 로그.
  - 주의: 커뮤니티 "등록"은 이미 코드에 어댑터가 있는 소스의 설정 등록이다. 어댑터 없는 새 사이트는 코드 추가가 필요하다. 예외적으로 Reddit 서브레딧 추가는 코드 없이 가능. **[내 판단]**
- 키워드·밈 관리, 프롬프트 관리(버전, 재평가, 비교), 게시글 관리(상태별 목록, 점수·분류·공개 상태 수동 변경, 사용자 제보 목록), 설정(실행 주기, 후속 수집, 비율, 예산, 미리보기 길이, 제보 제한).
- 관리자 변경 이력(`admin_audit_log`)을 남긴다. **[내 판단]**

## 8. 데이터 모델 (요약) **[내 판단, 지시서 8장 항목 포함]**

| 테이블 | 주요 컬럼 |
|---|---|
| `sources` | id, key, name, region(KR/GLOBAL), adapter_key, status(ACTIVE/UNSUPPORTED/PENDING_APPROVAL/DISABLED/DEGRADED), status_reason, policy_notes, policy_checked_at, config(jsonb), interval_override, allow_body_storage |
| `subreddits` | id, source_id, name, active, priority |
| `keywords` | id, kind(MIDNIGHT/ABSURD/MEME), keyword, aliases[], description, starts_on, ends_on, active, priority, created_at |
| `crawl_runs` | id, source_id, started_at, finished_at, status, target_budget, requests_made, candidates_found, new_posts, error_count, error_summary |
| `crawl_errors` | id, crawl_run_id, source_id, url, kind, message, occurred_at |
| `posts` | id, source_id, external_id, canonical_url, title, preview, posted_at, posted_at_precision, night_date, night_hour, collected_at, primary_path, matched_keywords[], similar_group_id, status, status_source(AUTO/ADMIN), current_evaluation_id, published_at, removed_at |
| `post_discoveries` | id, post_id, path(POPULAR/MIDNIGHT_KEYWORD/MEME_KEYWORD/USER_SUBMISSION), keyword_id, crawl_run_id, submission_id, discovered_at |
| `evaluations` | id, post_id, prompt_version_id, model, is_candidate, score, scores(jsonb), categories[], reason, safety(jsonb), llm_decision, final_decision, raw_response(jsonb), error, tokens_in, tokens_out, created_at, purpose(LIVE/REEVAL) |
| `prompt_versions` | id, name, system_prompt, eval_prompt, criteria(jsonb), category_descriptions(jsonb), exclusions, weights(jsonb), thresholds(jsonb), active, created_at, created_by |
| `submissions` | id, url, note, suggested_category, ip_hash, status(RECEIVED/REJECTED/DUPLICATE/PROCESSED), reject_reason, post_id, created_at |
| `settings` | key, value(jsonb), updated_at |
| `admin_users`, `admin_sessions`, `admin_audit_log` | 인증과 변경 이력 |

- 인덱스: `posts(status, published_at)`, `posts(status, score)` 대용으로 current_evaluation 조인 또는 비정규화 `score` 컬럼 **[빌더 재량]**, `posts(night_date)`, `posts(source_id)`.
- 향후 Instagram 기능은 `posts`를 참조하는 별도 테이블(`social_cards`)로 추가 가능하도록 posts에 그 외 의존을 만들지 않는다.

## 9. 오류 처리·관측 **[지시서 9장]**
- 모든 외부 요청은 공통 HTTP 클라이언트를 거친다: 타임아웃, 재시도, 소스별 속도 제한, robots 확인, 로그.
- 작업 실패는 pg-boss 재시도(백오프) 후 dead-letter 큐로 이동, 관리자 대시보드에 표시.
- 구조화 로그(pino) → 컨테이너 로그. 크롤 실행/오류는 DB에도 기록해 관리자 화면에서 볼 수 있게.
- LLM 비용 관측: 평가별 토큰 수 저장, 대시보드에 일별 합계. 하루 평가 상한(설정값, 기본 1,000건)을 넘으면 평가 작업을 다음 날로 미룬다. **[내 판단]**
- 헬스 체크: web `/api/health`, worker 하트비트를 `settings`에 기록.

## 10. 보안 **[지시서 9장]**
- 비밀값(DB URL, LLM 키, Reddit 클라이언트 ID/Secret, Turnstile 키, 세션 비밀키, IP 해시 솔트)은 환경변수. `.env.example`만 커밋.
- 관리자: argon2 해시, 로그인 요청 제한, 세션 쿠키 HttpOnly/Secure/SameSite.
- 제보: Turnstile, 요청 제한, URL 허용 도메인 제한(SSRF 방지), 입력 길이 제한, 출력 시 이스케이프.
- 외부에서 받은 제목/미리보기는 HTML로 렌더링하지 않고 텍스트로만 표시.

## 11. 테스트 전략 **[지시서 11장 Phase 6 항목 포함]**
- 시간대: `time-window` 경계값·UTC 변환·nightDate 단위 테스트.
- 중복: 같은 글 재수집, URL 변형(모바일/PC/추적 파라미터), 다른 커뮤니티 같은 내용.
- 소스 어댑터: 저장해 둔 HTML/JSON 픽스처로 파싱 테스트(실제 사이트에 테스트 요청 금지). 상대 시각 파싱 포함.
- AI 평가: LLM 어댑터를 가짜로 바꿔 정상/스키마 위반/파싱 실패/안전성 플래그/불확실/점수 불일치 케이스, 공개 결정 규칙 표 기반 테스트.
- 관리자 권한: 비로그인 접근 차단, 세션 만료, CSRF.
- 제보: 요청 제한, 미지원 도메인, 중복, 창 밖 시각, SSRF 시도.
- 크롤러 오류: 타임아웃, 429/403, 연속 실패 → DEGRADED, 한 소스 실패가 다른 소스에 영향 없음.
- E2E(Playwright): 피드 필터, 제보 흐름, 관리자 로그인 → 상태 변경.

## 12. 개발 단계 **[지시서 11장 + 12장 우선순위 반영]**

지시서 12장 "기본 흐름을 가장 먼저 완성"에 따라, Phase 2~4의 최소 버전을 먼저 하나로 연결한다. **[내 판단]**

| 단계 | 내용 | 완료 기준 |
|---|---|---|
| 1. 초기화 | legacy 태그, 새 프로젝트, Docker Compose, DB 스키마·마이그레이션·시드(키워드, 기본 프롬프트 v1, 설정), web/worker 골격 | `docker compose up`으로 빈 피드와 관리자 로그인 동작 |
| 0.5 사이트 조사 | 10개 한국 커뮤니티 + Reddit 정책 조사 → `docs/sources.md` | 사이트별 결론과 근거 |
| 2. 크롤링 | 공통 HTTP 클라이언트, 어댑터 인터페이스, Reddit + 허용된 한국 소스 1개 이상, 시간 필터, 중복, 스케줄러, 배분 | 실제 실행으로 후보 저장, 테스트 통과 |
| 3. AI 평가 | LLM 어댑터, 프롬프트 v1, 검증, 공개 결정 | 수집된 글이 자동으로 PUBLISHED/REVIEW/HIDDEN 분류 |
| 4. 사용자 페이지 | 피드, 카드, 필터, 제보 | **기본 흐름 완성** |
| 5. 관리자 | 대시보드, 커뮤니티·키워드·밈·프롬프트(재평가·비교)·게시글 관리, 설정 | 7장 항목 전부 |
| 6. 테스트·배포 | 11절 테스트 보강, VPS 배포 문서, README | 배포 가이드대로 새 서버에 올릴 수 있음 |

각 단계 끝에 `docs/phases/phase-N.md`에 구현 내역과 테스트 결과를 정리한다. **[지시서]**

## 13. 빌더에게 남기는 것
- 라이브러리 세부 선택(시간 라이브러리, 세션 라이브러리, UI 컴포넌트), 피드 페이지네이션 방식, 세부 디자인.
- 각 한국 커뮤니티 어댑터의 구체적 파싱 방법(조사 결과에 따라).
- 프롬프트 v1의 실제 문구(지시서 5장 기준을 반영해 작성, 관리자가 이후 수정).
- 인덱스와 쿼리 최적화.

## 14. 사용자 확인이 필요한 결정 목록 (내 판단 요약)
1. 03:00 이후 후속 수집(작성 시각 필터는 동일)
2. LLM 결정은 참고, 최종 공개는 서버 규칙
3. 안전성 `uncertain` 필드 추가
4. 작성 시각을 AI 입력에서 제외
5. 검색 불가 소스는 키워드를 필터로만 사용, 경로는 POPULAR + matched_keywords
6. 본문·댓글 비저장(소스별 예외 플래그)
7. 제보 글도 자동 공개 규칙 적용, 제보 설명은 AI 입력 제외
8. 게시글 상세 페이지 없음
9. 기본 LLM은 OpenAI(교체 가능), 배포는 VPS + Docker Compose
10. 기존 코드는 `legacy-v0` 태그 후 교체

## 15. 검토 후 확정 사항 (2026-11-18)

### 15-1. Reddit 시간 기준 — 서브레딧별 현지 시간대
- `subreddits.timezone`(IANA, 예: `America/New_York`, `Europe/London`)을 관리자가 지정. 기본값 `America/New_York`.
- Reddit 글의 시간 판정은 해당 서브레딧 시간대의 23:00:00 ≤ t < 03:00:00. 한국 소스는 Asia/Seoul 그대로.
- `time-window` 함수는 시간대를 인자로 받는다: `isInNightWindow(t, tz)`, `nightDate(t, tz)`, `nightHour(t, tz)`.
- 스케줄: 소스(서브레딧)별로 자기 시간대의 창 + 후속 수집 시간에 실행. 따라서 Reddit 수집은 한국 시간으로 낮에 돈다.
- 80:20 배분은 "새벽 날짜" 하루치 전체 작업량 기준으로 계산한다(회차 단위가 아님, 한국과 Reddit 실행 시각이 다르므로).
- 피드 카드에는 Reddit 글을 "현지 새벽 1:20 (뉴욕)"처럼 현지 시각으로 표시하고, 새벽 시간대 필터도 현지 시각 기준.
- `posts`에 `source_timezone` 컬럼을 저장한다.

### 15-2. 수집 가능한 소스가 없을 때
- 사이트 조사 결과와 무관하게 개발을 진행한다. 허용된 소스가 없거나 Reddit 승인이 지연되면 **저장된 샘플 데이터(픽스처 소스 어댑터 `fixture`)로 기본 흐름 전체를 완성**하고, 실제 소스는 허용되는 대로 활성화한다.
- `fixture` 어댑터는 개발/데모 환경에서만 활성화 가능(`NODE_ENV=production`에서는 비활성).
- 약관이 애매한 사이트: 설계자가 `docs/sources.md`에 근거를 정리하고 **최종 허용 여부는 사용자가 결정**한다. 결정 전 상태는 `UNSUPPORTED`(사유: 검토 대기).
- Phase 2 완료 기준 수정: "허용된 실제 소스 1개 이상 또는 fixture 소스로 실행해 후보 저장".
