import { Request, Response } from 'express';
import { DCInsideCrawler } from '../services/DCInsideCrawler';
import { crawlerConfig } from '../config/crawler.config';
import AppError from '../utils/AppError';

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
        status: 'success',
        data: result,
        message: '크롤링이 성공적으로 완료되었습니다.'
      });
    } catch (error) {
      // 에러를 errorHandler 미들웨어로 전달
      throw new AppError(
        error instanceof Error ? error.message : '크롤링 중 오류가 발생했습니다.',
        500
      );
    } finally {
      await this.crawler.cleanup();
    }
  };
} 