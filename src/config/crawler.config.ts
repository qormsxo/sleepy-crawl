import { CrawlerConfig } from '../types/crawler.types';
import dotenv from 'dotenv';

dotenv.config();

export const crawlerConfig: CrawlerConfig = {
  headers: {
    'User-Agent': process.env.CRAWLER_USER_AGENT || 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
    'Accept': process.env.CRAWLER_ACCEPT || 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': process.env.CRAWLER_ACCEPT_LANGUAGE || 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': process.env.CRAWLER_SEC_CH_UA || '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    'Sec-Ch-Ua-Mobile': process.env.CRAWLER_SEC_CH_UA_MOBILE || '?1',
    'Sec-Ch-Ua-Platform': process.env.CRAWLER_SEC_CH_UA_PLATFORM || '"Android"',
    'Upgrade-Insecure-Requests': '1'
  },
  timeout: parseInt(process.env.CRAWLER_TIMEOUT || '30000', 10),
  waitUntil: (process.env.CRAWLER_WAIT_UNTIL || 'networkidle0') as 'networkidle0' | 'networkidle2' | 'load' | 'domcontentloaded',
  postsLimit: parseInt(process.env.CRAWLER_POSTS_LIMIT || '5', 10)
}; 