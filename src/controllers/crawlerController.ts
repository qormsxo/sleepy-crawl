import { Request, Response } from 'express';
import { DCInsideCrawler } from '../services/DCInsideCrawler';
import { crawlerConfig } from '../config/crawler.config';

export class CrawlerController {
  private crawler: DCInsideCrawler;

  constructor() {
    this.crawler = new DCInsideCrawler(crawlerConfig);
  }

  crawlDCInside = async (_: Request, res: Response): Promise<void> => {
    try {
      await this.crawler.initialize();
      const result = await this.crawler.crawl();
      res.json({
        success: true,
        data: result,
        message: '크롤링이 성공적으로 완료되었습니다.'
      });
    } catch (error) {
      console.error('크롤링 실패:', error);
      res.status(500).json({
        success: false,
        error: '크롤링에 실패했습니다.',
        message: error instanceof Error ? error.message : '알 수 없는 오류가 발생했습니다.'
      });
    } finally {
      await this.crawler.cleanup();
    }
  };
} 