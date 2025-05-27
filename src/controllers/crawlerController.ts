import { Request, Response } from 'express';
import { CrawlerService } from '../services/crawlerService';

export class CrawlerController {
  private crawlerService: CrawlerService;

  constructor() {
    this.crawlerService = new CrawlerService();
  }

  crawlDCInsideWithCheerio = async (_: Request, res: Response) => {
    try {
      const data = await this.crawlerService.crawlDCInsideWithCheerio();
      res.json(data);
    } catch (error) {
      console.error('크롤링 실패:', error);
      res.status(500).json({ error: 'DC인사이드 크롤링에 실패했습니다.' });
    }
  };

  crawlDCInsideWithPuppeteer = async (_: Request, res: Response) => {
    try {
      const data = await this.crawlerService.crawlDCInsideWithPuppeteer();
      res.json(data);
    } catch (error) {
      console.error('크롤링 실패:', error);
      res.status(500).json({ error: 'DC인사이드 크롤링에 실패했습니다.' });
    }
  };
} 