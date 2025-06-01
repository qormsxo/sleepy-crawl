# SleepyCrawl

**sleepy crawl**는 야간 및 이상한 시간대에 인터넷 커뮤니티 글들을 크롤링하고, 시간대별 글 패턴과 트렌드를 분석하는 백엔드 서비스입니다.  
Node.js, TypeScript, Express 기반으로 개발되었으며, MongoDB에 데이터를 저장합니다.

---

## 주요 기능

- 커뮤니티 글 크롤링 (글 제목, 내용, 작성 시간)
- 특정 시간대(예: 새벽 1시~5시)의 글 필터링 및 조회
- 트렌드 분석 (키워드 추출, 토픽 분석, 감성 분석)
- 지원 커뮤니티: DCInside 모바일

---

## 기술 스택

- Node.js, TypeScript
- Express.js (API 서버)
- MongoDB + Mongoose (데이터 저장)
- Puppeteer (동적 페이지 크롤링)
- dayjs (시간 처리)

---

## 개발 환경

### 테스트

- Jest (테스트 프레임워크)
- 단위 테스트 및 통합 테스트 지원
- 크롤러, 트렌드 분석기 등 주요 컴포넌트 테스트 구현

### 코드 품질

- ESLint + Prettier (코드 스타일 및 품질 관리)
- TypeScript 타입 체크
