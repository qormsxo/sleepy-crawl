import { Request, Response } from 'express';
import { DCInsideCrawler } from '../services/DCInsideCrawler';
import { crawlerConfig } from '../config/crawler.config';
import AppError from '../utils/AppError';
import fs from 'fs';
import path from 'path';
import logger from '../utils/logger';

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

  crawlDCInsideTxt = async (_: Request, res: Response): Promise<void> => {
    try {
      await this.crawler.initialize();
      const result = await this.crawler.crawl();

      // 파일 저장
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const fileName = `crawl-result-${timestamp}.txt`;
      const outputDir = path.join(process.cwd(), 'output');
      
      // output 디렉토리가 없으면 생성
      if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
      }

      const filePath = path.join(outputDir, fileName);
      
      // 데이터를 텍스트 형식으로 변환
      const content = [
        '=== 크롤링 결과 ===',
        `\n생성 시간: ${new Date().toLocaleString()}`,
        '\n=== 게시물 목록 ===',
        ...result.posts.map((post, index) => 
          `\n${index + 1}. ${post.title}`
        ),
        '\n=== 트렌드 분석 ===',
        `요약: ${result.trends.summary}`,
        `감정: ${result.trends.sentiment}`
      ].join('\n');

      // 파일 저장
      await fs.promises.writeFile(filePath, content, 'utf-8');
      logger.info('파일 저장 완료', { filePath });
      
      res.json({
        status: 'success',
        message: '크롤링 결과가 파일로 저장되었습니다.',
        filePath,
        data: result
      });
    } catch (error) {
      // 에러를 errorHandler 미들웨어로 전달
      throw new AppError(
        error instanceof Error ? error.message : '크롤링 및 파일 저장 중 오류가 발생했습니다.',
        500
      );
    } finally {
      await this.crawler.cleanup();
    }
  };
} 