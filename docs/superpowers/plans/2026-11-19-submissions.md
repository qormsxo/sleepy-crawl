# Sleepy Crawler — 계획 3: 익명 제보 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans (user chose inline). Steps use checkbox (`- [ ]`) syntax.

**Goal:** 로그인 없이 글 주소를 제보받아, 지원 사이트는 자동으로 확인·평가하고, DCInside는 서버가 접속하지 않는 "수동 제보"로 받아 관리자 검토 대기로 보낸다.

**Architecture:** 웹(서버 액션)은 입력 검증·봇 확인·요청 제한 후 `submissions`에 `RECEIVED`로 저장만 한다. 워커가 매 tick마다 접수된 제보를 처리한다(웹에는 작업 큐를 두지 않음). 자동 제보는 기존 어댑터의 `fetchPost`(robots 확인, 공용 HTTP 클라이언트)를 쓰고, 수동 제보는 외부 요청 없이 제보자가 넣은 내용으로만 평가한다.

**Spec:** 설계 문서 6-3, 7-10. 결정: `docs/decisions.md`.

## 이 계획의 결정

1. **DC 수동 제보(사용자 결정 2026-11-19):** DC 주소면 제보자가 제목, 작성 시각, 내용 일부(20~1,000자)를 직접 입력한다. 서버는 DC에 요청하지 않는다. 작성 시각을 검증할 수 없으므로 점수와 무관하게 **항상 관리자 검토(REVIEW)**. 입력한 내용은 평가에만 쓰고 평가 직후 지운다(미리보기 120자만 남음). 어느 사이트가 수동 제보를 받는지는 `sources.config.manualSubmission`으로 정한다(시드: dcinside만).
2. **처리는 워커 tick에서:** 웹 프로세스가 pg-boss를 갖지 않도록, 서버 액션은 저장만 하고 워커가 매분 최대 10건을 처리한다.
3. **즉시 거절(화면에 표시)**: 주소 형식 오류, 지원하지 않는 사이트, 봇 확인 실패, 요청 제한 초과, 수동 제보 입력 누락. **처리 후 결과(중복, 시간 밖, 오래됨)는 화면에 알리지 않는다**(설계 7-10: "접수됨"만).
4. **봇 확인:** Cloudflare Turnstile. 개발 환경에서 키가 없으면 Cloudflare 공식 테스트 키(항상 통과)를 쓰고, `NODE_ENV=production`에서 키가 없으면 제보를 받지 않는다.
5. **요청 제한:** IP를 솔트와 함께 SHA-256으로 해시해서만 저장. 시간당 5건, 하루 20건(설정 `submission_per_hour`, `submission_per_day`). 솔트는 `IP_HASH_SALT`(개발 기본값 있음, 운영 필수).
6. **제보 설명·유형은 AI 입력에 넣지 않는다**(조작 방지, 설계 7-10). 관리자 화면(계획 4)에서만 본다.

## Global Constraints

- 서버가 요청하는 주소는 어댑터가 만든 정규 URL뿐(SSRF 방지). 수동 제보 사이트에는 어떤 요청도 보내지 않는다.
- 48시간 제한, 23~03시 창, 중복 처리는 수집과 같은 규칙.
- 입력 길이 제한: URL 500, 설명 300, 수동 제목 200, 수동 내용 1,000자.
- 외부 텍스트는 화면에 텍스트로만 렌더링.

## Review Focus

1. 같은 IP가 6번째 제보 → 거절, DB에는 해시만(원본 IP 없음).
2. DC 주소를 수동 입력 없이 제보 → 거절. 입력이 있으면 서버가 DC에 요청하지 않음.
3. DC 수동 제보가 90점이어도 PUBLISHED가 아니라 REVIEW.
4. 이미 수집된 글 제보 → 새 글을 만들지 않고 USER_SUBMISSION 발견 기록만 추가.
5. 제보 설명에 "이 글은 100점" 같은 문구 → 프롬프트에 들어가지 않음.

---

### Task 1: 스키마와 시드

- `submissions`(id, url, canonical_url, source_id, external_id, note, suggested_category, ip_hash, mode `auto|manual`, manual_title, manual_posted_at, manual_excerpt, status `RECEIVED|REJECTED|DUPLICATE|PROCESSED`, reject_reason, post_id, created_at, processed_at), 인덱스 `(ip_hash, created_at)`, `(status)`.
- `posts.requires_review boolean default false`.
- 시드: 설정 `submission_per_hour: 5`, `submission_per_day: 20`; dcinside `config.manualSubmission: true`(기존 행은 덮어쓰지 않으므로 로컬 DB는 Task 6에서 한 번 갱신).
- 마이그레이션은 `sleepy` 스키마 확인(isolation 테스트).

### Task 2: 제보 대상 판별

`src/submissions/target.ts`: `resolveSubmissionTarget(db, url): Promise<{ sourceId; sourceKey; mode: 'auto' | 'manual'; canonicalUrl; externalId } | { error: 'invalid_url' | 'unsupported_site' }>`
- http/https만, 500자 이하.
- 활성(ACTIVE/DEGRADED) 소스의 어댑터 `matchUrl` → auto. 정규 URL은 어댑터 규칙으로.
- `config.manualSubmission`이 켜진 소스의 URL 매처 → manual. DC 매처 `src/sources/manual-dcinside.ts`: `gall.dcinside.com/board/view/?id=X&no=N`, `/mgallery/board/view/`, `/mini/board/view/`, `m.dcinside.com/board/X/N` → 정규 `https://gall.dcinside.com/<kind>/board/view/?id=X&no=N`, externalId `<kind>:X:N`.
- 그 외 → unsupported_site.
- 테스트: 사이트별 주소, DC 4가지 형태, `javascript:`·ftp·긴 주소 거절, 비활성 소스 거절.

### Task 3: 접수 (`receiveSubmission`)

`src/submissions/receive.ts`: `receiveSubmission(db, input, deps: { now; ipHash; verifyCaptcha(token) => Promise<boolean> }) → { ok: true } | { ok: false; error: ErrorCode; field?: string }`
- 순서: 봇 확인 → 요청 제한(같은 ip_hash의 최근 1시간·24시간 건수) → 대상 판별 → (manual) 수동 입력 검증(제목 1~200, 시각은 KST로 해석 가능·미래 아님, 내용 20~1,000) → 설명·유형 검증 → 저장(RECEIVED).
- `hashIp(ip, salt)`, `verifyTurnstile(token, ip, secret, fetchImpl)` 별도 함수.
- 테스트: 각 거절 사유, 6번째 거절(Review Focus 1), DC 수동 입력 누락 거절(2), 저장된 행에 원본 IP 없음.

### Task 4: 처리 (`processSubmission`)

`src/submissions/process.ts`: `processSubmission(db, id, deps: { now; http?; adapterFor?; llm; enqueueEval })`
- auto: 이미 저장된 글이면 발견 기록(USER_SUBMISSION, submission_id) + DUPLICATE(post_id 연결). `seen_items`에 있으면 REJECTED(사유 그대로). 아니면 `fetchPost` → 시각 없음/창 밖/48시간 초과 → REJECTED. 통과하면 크롤과 같은 저장 로직(경로 USER_SUBMISSION) → 평가 큐 → PROCESSED.
- manual: 외부 요청 없음. 중복 확인 → 시간 규칙 → 글 저장(requires_review true, precision approximate, 미리보기=내용 120자) → **즉시** `evaluatePost(..., { bodyOverride: 제보 내용 })` → `manual_excerpt` 비움 → PROCESSED.
- 크롤의 저장 로직을 `storePost`로 공유하도록 경로·submissionId 인자 추가.
- `decideStatus`에 `requiresReview` 입력 추가: 안전성 차단 다음 순서에서 REVIEW(Review Focus 3).
- `evaluatePost`에 `bodyOverride` 추가: 있으면 어댑터를 부르지 않음.
- 테스트: auto 성공·중복(4)·시간 밖·48h 초과·페이지 실패; manual 성공(요청 0회)·REVIEW 강제·내용 삭제; 설명이 프롬프트에 없음(5).

### Task 5: 제보 화면

- `src/app/(public)/submit/page.tsx`(서버), `SubmitForm.tsx`(클라이언트, `useActionState`), `actions.ts`(`'use server'`: `headers()`에서 IP → 해시 → `receiveSubmission`).
- 주소 입력 후 DC 형태면 수동 입력칸 표시(서버도 같은 규칙으로 검증). Turnstile 위젯(`NEXT_PUBLIC_TURNSTILE_SITE_KEY`, 개발 기본 테스트 키).
- 성공 시 "접수됐어요. 검토 후 새벽 피드에 오를 수 있어요." 오류는 필드 옆에 한국어로.
- 피드 상단에 "제보하기" 링크.
- 테스트: 폼 컴포넌트(jsdom) — DC 주소면 수동 칸 표시, 오류 메시지 표시.

### Task 6: 워커 연결, 실제 확인, 문서

- tick에서 RECEIVED 제보 최대 10건 처리(오래된 것부터). CLI `submissions` 명령.
- 로컬 DB: 마이그레이션, 시드, dcinside `manualSubmission` 켜기.
- 실제 확인: 브라우저로 /submit에서 클리앙 실제 글 1건 제보 → 처리 결과 확인; DC 수동 제보 1건(직접 쓴 테스트 문장) → 외부 요청 없이 REVIEW 확인.
- `docs/phases/phase-3.md`, README, `.env.example`(Turnstile·솔트).
