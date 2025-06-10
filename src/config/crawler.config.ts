import { CrawlerConfig } from '../types/crawler.types';
import dotenv from 'dotenv';

dotenv.config();

export const crawlerConfig: CrawlerConfig = {
  baseUrl: 'https://m.dcinside.com',
  headers: {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7'
  },
  waitUntil: 'networkidle0' as const,
  timeout: 30000,
  postsLimit: 5,
  headless: 'new' as const,
  browserArgs: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-web-security',
    '--disable-features=IsolateOrigins,site-per-process'
  ],
  viewport: {
    width: 1920,
    height: 1080
  }
}; 