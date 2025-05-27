# SleepyCrawl

**sleepy crawl**는 야간 및 이상한 시간대에 인터넷 커뮤니티 글들을 크롤링하고, 시간대별 글 패턴을 분석하는 백엔드 서비스입니다.  
Node.js, TypeScript, Express 기반으로 개발되었으며, MongoDB에 데이터를 저장합니다.

---

## 주요 기능

- 커뮤니티 글 크롤링 (글 제목, 내용, 작성 시간)
- 특정 시간대(예: 새벽 1시~5시)의 글 필터링 및 조회

---

## 기술 스택

- Node.js, TypeScript
- Express.js (API 서버)
- MongoDB + Mongoose (데이터 저장)
- axios, cheerio (정적 페이지 크롤링)
- puppeteer (동적 페이지 크롤링, 필요 시)
- dayjs (시간 처리)

---

## 설치 및 실행

1. 리포지토리 클론

```bash