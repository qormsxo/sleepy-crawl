# PR 제목

Sleepy Crawler 신규 프로젝트: 기초 공사와 기본 흐름 (수집 → AI 평가 → 공개 피드)

# PR 본문

## 무엇을 바꿨나

기존 Express + Puppeteer 프로젝트를 새 구조로 교체하고(기존 코드는 `legacy-v0` 태그로 보존), 지시서 12장의 기본 흐름을 샘플(fixture) 소스로 끝까지 동작시켰습니다.

- **구조:** Next.js 16 웹 + 별도 Node 워커(pg-boss 작업 큐) + PostgreSQL. 도메인 로직은 `src/core`에 프레임워크 없이 분리
- **수집:** 소스 시간대 기준 23:00:00 ≤ t < 03:00:00 필터, URL 정규화와 중복 제거, 수집 경로 기록. 본문·댓글은 DB에 저장하지 않음
- **외부 요청:** robots.txt 확인(오류 시 전부 금지), 호스트별 요청 간격, 타임아웃, 재시도, 429/403 즉시 중단
- **AI 평가:** JSON 스키마 검증, 배점 초과·정의 밖 분류 거부, 공개 결정은 서버 규칙(AI의 decision은 참고만), 안전성 문제는 점수와 무관하게 공개 금지
- **공개 피드:** 최신/점수순, 날짜·시간대·유형·커뮤니티 필터, 원문 링크, 모바일 대응
- **문서:** 설계(`docs/superpowers/specs/`), 구현 계획(`docs/superpowers/plans/`), 결정 기록(`docs/decisions.md`), 단계 보고서(`docs/phases/phase-1.md`)

## 왜

지시서 12장: 관리자 기능보다 "수집 → 중복 제거 → AI 평가 → 공개 결정 → 노출" 흐름을 먼저 완성. 실제 사이트 수집 허용 조사 전이라 fixture 소스로 흐름을 검증했습니다(설계 15-2).

## 검증

- `npm test`: 111개 통과 (DB 테스트는 메모리 Postgres, Docker 불필요)
- `npx tsc --noEmit`, `npm run build` 통과
- 실제 Postgres(Docker): 마이그레이션·시드, 1회 수집+평가(14건 중 11건 저장, 시간대 밖 2건 제외), 워커 큐 동작 확인
- 브라우저: 피드·필터, 375px 폭, `<script>` 제목이 텍스트로만 표시됨 확인
- 전체 브랜치 코드 검토: 치명 0 / 중요 6(모두 수정) / 사소 6(보고서에 기록, 후속 계획에서 처리)

## 리뷰어가 알아야 할 것

- **실제 OpenAI 호출은 미검증**(키 없음). 로컬에서는 `LLM_PROVIDER=fake` 사용
- 개발용 Postgres는 **5433 포트**(docker-compose)
- 작업 큐 `crawl` 정책을 `stately`로 바꿔, 이전에 만든 개발 DB에서는 워커가 시작을 거부함 → `docker compose down -v` 후 재생성
- Windows에서 `npx`로 띄운 워커는 Ctrl+C가 전달되지 않음(정상 종료 미검증)
- 범위 밖(후속 계획): 실제 사이트/Reddit 수집기, 80:20 배분, 제보, 관리자, 배포

🤖 Generated with [Claude Code](https://claude.com/claude-code)
