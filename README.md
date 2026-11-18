# Sleepy Crawler

밤 11시부터 새벽 3시 사이에 인터넷 커뮤니티에 올라온 글 중 새벽 감성이 짙거나 엉뚱하고 황당한 글을 AI가 골라 보여주는 공개 웹사이트입니다.
일반적인 인기글 모음이 아니라 "새벽에만 나오는 이상한 글"을 찾는 것이 목적입니다.
허용된 방법(공식 API, robots.txt와 약관이 허용하는 공개 페이지)으로만 수집합니다.

## 구조

- **web** (Next.js): 공개 피드, (예정) 제보·관리자 화면
- **worker** (Node): 1분마다 실행 대상 소스를 찾아 수집하고, 새 글을 AI로 평가 (pg-boss 작업 큐)
- **PostgreSQL**: 데이터와 작업 큐

## 로컬 실행

필요: Node.js 24, PostgreSQL 16 이상 (로컬 설치 DB를 그대로 사용. 다른 앱과 같은 DB여도 되며 모든 객체는 `sleepy` 스키마에만 생성)

```bash
npm install
```

```bash
cp .env.example .env
```

`.env`의 `DATABASE_URL`을 로컬 DB로 맞춘 뒤:

```bash
npm run db:migrate && npm run db:seed
```

```bash
LLM_PROVIDER=fake npm run crawl:once -- fixture --now 2026-11-18T19:00:00Z
```

```bash
npm run dev
```

http://localhost:3000 에서 샘플 글 피드를 볼 수 있습니다. 워커는 `npm run worker`로 실행합니다.

## 환경변수

| 이름 | 설명 |
|---|---|
| `DATABASE_URL` | PostgreSQL 연결 문자열. `?schema=`를 붙이면 `sleepy`만 허용 |
| `LLM_PROVIDER` | `gemini`, `openai`, `fake`(외부 호출 없는 데모용 평가) |
| `LLM_API_KEY` | 선택한 LLM의 API 키 |
| `LLM_MODEL` | 평가에 쓸 모델 이름 |
| `LLM_TEMPERATURE` | 기본 0 |
| `LLM_TIMEOUT_MS` | LLM 호출 제한 시간 (기본 60000) |
| `LOG_LEVEL` | 로그 수준 (기본 `info`) |

## 명령

| 명령 | 내용 |
|---|---|
| `npm test` | 전체 테스트 (DB 테스트는 메모리 Postgres 사용, Docker 불필요) |
| `npm run db:generate` | 스키마 변경 후 마이그레이션 생성 |
| `npm run crawl:once -- <source> [--now ISO]` | 큐 없이 한 번 수집하고 바로 평가 |
| `npm run eval:pending` | 평가 대기 글 전부 평가 |

## 문서

- 설계: [docs/superpowers/specs/2026-11-18-sleepy-crawler-design.md](docs/superpowers/specs/2026-11-18-sleepy-crawler-design.md)
- 결정 기록: [docs/decisions.md](docs/decisions.md)
- 단계 보고서: [docs/phases/phase-1.md](docs/phases/phase-1.md)
