import { Request, Response } from 'express';
import { DCInsideCrawler } from '../services/DCInsideCrawler';
import { crawlerConfig } from '../config/crawler.config';

export class CrawlerController {
  private crawler: DCInsideCrawler;

  constructor() {
    this.crawler = new DCInsideCrawler(crawlerConfig);
  }

  crawlDCInside = async (_: Request, res: Response) => {
    try {
      await this.crawler.initialize();
      const data = await this.crawler.crawl();
      res.json(data);
    } catch (error) {
      console.error('크롤링 실패:', error);
      res.status(500).json({ error: 'DC인사이드 크롤링에 실패했습니다.' });
    } finally {
      await this.crawler.cleanup();
    }
  };
} 