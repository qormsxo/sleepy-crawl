# Sleepy Crawler — 계획 2: 한국 커뮤니티 실제 수집 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (user chose inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** 허용 조사를 통과한 4개 사이트(오늘의유머, 에펨코리아, 루리웹, 인벤)의 인기글을 실제로 수집해 기존 흐름(평가 → 공개)에 태운다.

**Architecture:** 계획 1의 어댑터 인터페이스에 사이트별 어댑터 4개를 추가한다. 목록의 시각이 부정확한 사이트는 새 글만 글 페이지를 열어 정확한 작성 시각을 얻는다. 한 번 판정한 글은 `seen_items`에 기록해 다시 열지 않는다.

**Tech Stack:** 계획 1과 동일 (cheerio, pg-boss, drizzle, vitest).

**Spec:** `docs/superpowers/specs/2026-11-18-sleepy-crawler-design.md`, 사이트 조사 `docs/sources.md`, 결정 `docs/decisions.md`

**범위 밖:** Reddit(사용자 보류), 80:20 배분(Reddit 재개 시 — 지금은 한국 100%라 의미 없음), 제보(계획 3), 관리자 화면(계획 4).

## 이 계획의 결정 (설계자 판단, 변경 가능)

1. **후속 수집 시간을 03:00~15:00로 늘린다(30분 간격).** 조사 결과 인기글 목록의 글은 대부분 4~10시간 전 글이다. 23~03시에만 수집하면 새벽 글이 인기글이 되기 전에 수집이 끝난다. 작성 시각 필터(23:00~03:00)는 그대로다. 설정 `followup_until_hour`(15), `followup_interval_minutes`(30).
2. **목록 시각을 믿을 수 없는 사이트는 글 페이지에서 작성 시각을 확정한다.** 오늘의유머 목록 시각은 베스트 등록 시각이고, 에펨코리아는 "N 시간 전"이다. 새 글만 열고 회차당 상한(`max_detail_fetches_per_run`, 20)을 둔다.
3. **수집 대상 게시판:** 오늘의유머 `bestofbest`·`humorbest`, 에펨코리아 `/best`, 루리웹 `/best/humor_only`, 인벤 오픈이슈갤러리 추천(`/board/webzine/2097?my=chu`). 게시판 목록은 `sources.config`에 두어 배포 없이 바꿀 수 있다.
4. **댓글은 아직 가져오지 않는다.** 평가 입력은 제목과 본문만 쓴다.
5. **테스트 픽스처는 실제 글을 복사하지 않는다.** 실제 페이지 구조(선택자)만 본뜬 가짜 HTML을 직접 작성한다.

## Global Constraints

- 모든 외부 요청은 `defaultHttpClient()`(robots 확인, 호스트별 3초 간격)를 거친다. 검색 경로는 쓰지 않는다.
- 글 주소는 robots.txt 허용 형태로 정규화한다. 에펨코리아는 `/best/<document_srl>`만 사용한다(`/index.php?...`, `/<번호>`는 금지 경로).
- 시각은 모두 KST(`Asia/Seoul`)로 해석한다. 시간대 없는 문자열을 `new Date()`로 파싱하지 않는다.
- 본문·댓글은 저장하지 않는다(계획 1과 동일).
- 테스트에서 실제 사이트 호출 금지. 실제 호출은 Task 9의 수동 확인에서만 한다.

## Review Focus

1. 사이트 HTML 구조가 바뀌어 목록이 0건 → 오류로 기록하고 소스를 `DEGRADED`로 표시(조용히 0건 성공 처리하지 않음). (Task 7)
2. 자정 직후 "23:55"처럼 날짜 없는 시각 → 전날로 해석. (Task 2)
3. 같은 글이 두 게시판(오유 bestofbest·humorbest)에 동시에 → 글 1개. (Task 3)
4. 403/429 → 해당 소스만 1시간 멈춤, 다른 소스는 계속. (Task 7)
5. 창 밖 글은 다음 회차에 다시 열지 않음. (Task 3)

---

### Task 1: 소스 목록과 설정 시드

**Files:** Modify `src/db/seed-data.ts`, `src/db/seed.ts`, `src/db/seed.test.ts`

- 10개 한국 커뮤니티 + Reddit 1행을 시드한다. 상태와 사유는 `docs/sources.md` 그대로:
  - `ACTIVE`: todayhumor, fmkorea, ruliweb, inven (config에 목록 URL 배열 `lists`)
  - `UNSUPPORTED`: dcinside(약관 제16조), mlbpark(robots 전면 금지), ppomppu(403 차단), clien·theqoo·humoruniv(사용자 미선택, 검토 대기)
  - reddit: `PENDING_APPROVAL`, region GLOBAL, 사유 "사용자 보류"
- 설정 추가: `followup_until_hour: 15`, `followup_interval_minutes: 30`, `max_detail_fetches_per_run: 20`.
- 시드는 기존 행을 덮어쓰지 않는다(관리자 변경 보존).
- [ ] 테스트: seed 후 sources 12행(fixture 포함), ACTIVE 한국 소스 4개, 각 ACTIVE 소스 `config.lists` 비어 있지 않음, dcinside 상태 UNSUPPORTED이고 사유에 "약관" 포함. 실패 확인 → 구현 → 통과 → 커밋.

### Task 2: KST 시각 해석 도구

**Files:** Create `src/sources/kst-time.ts`, test

- `parseKstAbsolute(s: string): Date | null` — `2026.11.18 16:59`, `2026-11-18 19:43`, `2026/11/17 13:50:09`, `2026.11.18 (16:54:40)`, `26/11/18 07:48`, `2026-11-18T16:54:40` (시간대 없음 → KST).
- `parseKstListTime(s: string, now: Date): { at: Date; precision: 'minute' | 'approximate' } | null` — `16:54`(오늘, now보다 미래면 어제), `4 시간 전`·`12분 전`·`방금`(approximate), `17.11.09`·`2026.11.17`(날짜만 → approximate, 00:00).
- [ ] 테스트: 위 형식 각각, 자정 직후 now=00:10에 `23:55` → 전날 23:55(Review Focus 2), 잘못된 문자열 → null.

### Task 3: 글 페이지로 시각 확정 + seen_items

**Files:** Modify `src/db/schema.ts`(+마이그레이션, `sleepy` 스키마·nullable enum 수동 수정 주의), `src/sources/types.ts`, `src/pipeline/crawl.ts`, tests

- `seen_items(source_id, external_id, outcome text, seen_at)`, 유니크 `(source_id, external_id)`.
- `ParsedPost`에 `needsDetail?: boolean` 추가(목록 시각을 믿을 수 없음).
- `crawlSource` 흐름 변경: 목록 항목마다
  1. `posts`나 `seen_items`에 이미 있으면 → 발견 기록만(posts에 있을 때) 하고 넘어감.
  2. `needsDetail`이면 회차 상한 안에서 `fetchPost`로 시각을 확정. 상한 초과분은 다음 회차로 미룸(seen에 기록하지 않음).
  3. 창 밖이면 `seen_items(outcome='out_of_window')` 기록.
- 본문은 여전히 저장하지 않는다.
- [ ] 테스트(가짜 어댑터): needsDetail 항목은 fetchPost 결과 시각으로 판정; 창 밖 항목은 두 번째 회차에 fetchPost 호출 0회(Review Focus 5); 상한 2일 때 3번째 항목은 미룸; 같은 externalId가 두 목록에 → posts 1행(Review Focus 3).

### Task 4: 오늘의유머 어댑터

**Files:** Create `src/sources/todayhumor.ts`, `src/sources/fixtures/todayhumor-list.html`, `todayhumor-post.html`, test

- 목록 `tr.view`: 링크 `td.subject a`, 제목 같은 요소 텍스트. 글 번호 = `no` 파라미터. 정규 URL `https://www.todayhumor.co.kr/board/view.php?table=<table>&no=<no>`. `needsDetail: true`.
- 글: 제목 `.viewSubjectDiv`, 본문 `.viewContent` 텍스트, 작성 시각 = `원글작성시간 : YYYY/MM/DD HH:MM:SS` 문구(precision exact).
- `matchUrl`: `todayhumor.co.kr` 계열의 `view.php?table=..&no=..`.
- [ ] 테스트: 목록 3건 파싱, 글의 원글작성시간 사용(베오베 등록시간 아님), matchUrl.

### Task 5: 에펨코리아 어댑터

**Files:** Create `src/sources/fmkorea.ts`, fixtures, test

- 목록 `li.li`: `h3.title a`의 href에서 `document_srl` 추출 → 정규 URL `https://www.fmkorea.com/best/<srl>`. 제목은 링크 텍스트에서 끝의 `[댓글수]` 제거. `.regdate`("4 시간 전") → approximate, `needsDetail: true`.
- 글(`/best/<srl>`): 제목 `.top_area h1`, 시각 `.top_area .date` (`YYYY.MM.DD HH:MM`, minute), 본문 `article .xe_content` 첫 요소.
- [ ] 테스트: 목록 파싱과 URL 변환(금지 경로 형태가 나오지 않음), 제목에서 `[490]` 제거, 글 파싱, matchUrl(`/best/123`, `/123` 모두 인식해 `/best/123`으로).

### Task 6: 루리웹·인벤 어댑터

**Files:** Create `src/sources/ruliweb.ts`, `src/sources/inven.ts`, fixtures, tests

- 루리웹 목록 `tr.table_body`(공지 제외): `a.subject_link` href, 제목 텍스트(앞의 순번 숫자 제거), `td.time`(`16:54` 또는 `YY.MM.DD`) → `parseKstListTime`. 정규 URL은 쿼리 제거 `https://bbs.ruliweb.com/best/board/<board>/read/<id>`. 글: 제목 `.subject_inner_text`, 시각 `.regdate`(`2026.11.18 (16:54:40)`), 본문 `.view_content`. 목록 시각이 분 단위로 정확하므로 `needsDetail: false`.
- 인벤 목록 `table tbody tr`: `a.subject-link`(카테고리 `span.category` 제외한 텍스트가 제목), `td.date`. 정규 URL `https://www.inven.co.kr/board/<group>/<board>/<id>`(쿼리 제거). 글: 제목 `.articleTitle h1`, 시각 `.articleDate`, 본문 `#powerbbsContent`. `needsDetail: false`.
- [ ] 테스트: 각 목록·글 파싱, 정규 URL, 공지·광고 행 제외.

### Task 7: 소스 보호와 구조 변경 감지

**Files:** Modify `src/db/schema.ts`(`sources.paused_until`, `sources.consecutive_failures`), `src/pipeline/crawl.ts`, `src/worker/scheduler.ts`, tests

- 목록 0건이면 오류(`kind='empty_list'`)로 기록하고 실패로 센다(Review Focus 1).
- `HttpBlockedError`(403/429) → `paused_until = now + 1h`, 실패로 센다(Review Focus 4).
- 연속 실패 5회 → status `DEGRADED`. 성공하면 연속 실패 0, DEGRADED였으면 ACTIVE로 복구.
- `dueSources`는 `paused_until > now`인 소스를 건너뛴다. DEGRADED도 계속 시도한다(복구 확인용).
- [ ] 테스트: 위 각 경우.

### Task 8: 후속 수집 스케줄

**Files:** Modify `src/worker/scheduler.ts`, tests

- `dueSources(now, sources, lastRunAt, opts: { intervalMin, followupUntilHour, followupIntervalMin })`:
  - 창(23:00~02:59) 안: 기존 간격.
  - 03:00 ≤ 현지 시각 < followupUntilHour: 후속 간격.
  - 그 외: 실행 안 함.
- [ ] 테스트: KST 02:59(10분 간격), 03:10(30분 간격), 14:59(실행), 15:00(실행 안 함), followupUntilHour=3이면 후속 없음.

### Task 9: 실제 사이트 확인, 미뤄 둔 작은 수정, 보고서

- 미뤄 둔 작은 수정(각각 테스트 먼저): 재평가 시 `publishedAt` 유지, 배점 키 누락 시 검증 실패, 활성 프롬프트 1개 보장(부분 유니크 인덱스), 피드 커서 NULL 안전(`NULLS LAST`).
- 실제 확인: 로컬 DB에 시드 → 4개 소스 각각 `crawl:once`(현재 시각) → 수집 건수·오류 확인, 새벽 글이 있으면 Gemini로 평가 1~2건.
- `docs/phases/phase-2.md`, `docs/sources.md`(활성 게시판), README 갱신.
