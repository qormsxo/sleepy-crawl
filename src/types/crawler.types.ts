import { Page } from 'puppeteer';

export interface DCPost {
  id?: string;
  title: string;
  url?: string;
  content?: string;
  createdAt?: Date;
  author?: string;
  comments?: DCComment[];
}

export interface DCComment {
  content: string;
  author?: string;
  createdAt?: Date;
}

export interface CrawlerConfig {
  headers: {
    'User-Agent': string;
    'Accept': string;
    'Accept-Language': string;
    'Cache-Control': string;
    'Pragma': string;
    'Sec-Ch-Ua': string;
    'Sec-Ch-Ua-Mobile': string;
    'Sec-Ch-Ua-Platform': string;
    'Upgrade-Insecure-Requests': string;
  };
  timeout: number;
  waitUntil: 'networkidle0' | 'networkidle2' | 'load' | 'domcontentloaded';
  postsLimit: number;
}

export interface ICrawler {
  crawl(): Promise<DCPost[]>;
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface IPageEvaluator {
  evaluateMainPage(page: Page): Promise<DCPost[]>;
  evaluatePostPage(page: Page, url: string): Promise<{ content: string | null; comments: string[] }>;
} 