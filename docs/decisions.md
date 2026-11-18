# 결정 기록

설계 문서(`docs/superpowers/specs/2026-11-18-sleepy-crawler-design.md`) 14·15절과 구현 중 결정을 한 줄씩 남긴다.

- 2026-11-18 구현 방식: A안 — Next.js 웹 + 별도 Node 워커 + PostgreSQL(pg-boss 큐). (사용자 선택)
- 2026-11-18 03:00 이후 후속 수집(작성 시각 필터는 동일 적용). (설계자 기본값)
- 2026-11-18 LLM `decision`은 참고용, 최종 공개 여부는 서버 규칙으로 계산. (설계자 기본값)
- 2026-11-18 안전성 평가에 `uncertain` 필드 추가 → 불확실하면 관리자 검토. (설계자 기본값)
- 2026-11-18 작성 시각은 AI 입력에서 제외(새벽 가산 금지). (설계자 기본값)
- 2026-11-18 검색이 금지된 소스에서는 키워드를 필터로만 사용, 경로는 POPULAR + matched_keywords. (설계자 기본값)
- 2026-11-18 본문·댓글은 DB에 저장하지 않음(소스별 예외 플래그). (설계자 기본값)
- 2026-11-18 제보 글도 자동 공개 규칙을 적용, 제보 설명은 AI 입력에서 제외. (설계자 기본값)
- 2026-11-18 게시글 상세 페이지 없음, 원문으로 바로 연결. (설계자 기본값)
- 2026-11-18 기본 LLM은 OpenAI(교체 가능), 배포는 VPS + Docker Compose. (설계자 기본값)
- 2026-11-18 기존 코드는 `legacy-v0` 태그(2fdc168) 후 교체. (설계자 기본값)
- 2026-11-18 Reddit 시간 판정은 서브레딧별 현지 시간대 기준. (사용자 승인, 설계 15-1)
- 2026-11-18 허용 소스가 없으면 fixture 소스로 흐름 완성, 애매한 약관은 사용자가 최종 결정. (사용자 승인, 설계 15-2)
- 2026-11-18 패키지 매니저 npm (로컬에 pnpm 없음). lockfile을 커밋하도록 `.gitignore`의 `package-lock.json` 줄 제거.
- 2026-11-18 Next.js 16.4 생성 결과의 `AGENTS.md` 유지.
- 2026-11-18 개발 DB는 Docker 대신 사용자의 로컬 PostgreSQL(다른 앱과 공유). 모든 객체를 `sleepy` 스키마에 생성(drizzle 마이그레이션 기록, pg-boss 큐 포함). `DATABASE_URL`의 Prisma식 `?schema=`는 `sleepy`만 허용하고 연결 전에 제거. (사용자 지시)
- 2026-11-18 drizzle-kit이 nullable enum 컬럼 타입을 스키마 없이 생성하는 문제가 있어, 생성된 마이그레이션의 `CREATE SCHEMA`와 해당 컬럼을 직접 수정함. 마이그레이션을 새로 생성할 때 `src/db/isolation.test.ts`가 이를 잡아낸다.
- 2026-11-18 docker-compose.yml은 배포(계획 5)용으로 남겨 둠. 개발에는 사용하지 않음.
- 2026-11-18 LLM 공급자에 Gemini 추가(@google/genai, 구조화 출력 responseJsonSchema). 설정은 LLM_PROVIDER/LLM_API_KEY/LLM_MODEL/LLM_TEMPERATURE/LLM_TIMEOUT_MS 공통 변수 사용. 실제 호출 1회 검증(gemini-3.1-flash-lite, 약 2초, 입력 768/출력 416 토큰). 기본값은 여전히 fake. (사용자 지시)
