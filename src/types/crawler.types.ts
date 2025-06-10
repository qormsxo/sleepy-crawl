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

export interface TrendAnalysis {
  summary: string;
  sentiment: string;
}

export interface CrawlerConfig {
  baseUrl: string;
  headers: {
    'User-Agent': string;
    'Accept': string;
    'Accept-Language': string;
  };
  waitUntil: 'networkidle0' | 'networkidle2' | 'load' | 'domcontentloaded';
  timeout: number;
  postsLimit: number;
  headless: 'new' | boolean;
  browserArgs: string[];
  viewport: {
    width: number;
    height: number;
  };
}

export interface Post {
  title: string;
}

export interface CrawlerResult {
  posts: Post[];
  trends: TrendAnalysis;
}

export interface ICrawler {
  crawl(): Promise<CrawlerResult>;
  initialize(): Promise<void>;
  cleanup(): Promise<void>;
}

export interface IPageEvaluator {
  evaluateMainPage(page: Page): Promise<DCPost[]>;
  evaluatePostPage(page: Page, url: string): Promise<{ content: string | null; comments: string[] }>;
} 