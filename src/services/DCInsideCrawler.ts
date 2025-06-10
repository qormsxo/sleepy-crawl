import puppeteer, { Browser, Page } from 'puppeteer';
import { ICrawler, IPageEvaluator, DCPost, CrawlerConfig } from '../types/crawler.types';
import { TrendAnalyzer } from './trendAnalyzer';
import logger from '../utils/logger';
import { crawlerConfig } from '../config/crawler.config';
import { CrawlerResult, Post, TrendAnalysis } from '../types/crawler.types';

/**
 * DCInside 모바일 웹사이트 크롤러
 * 실시간 베스트 게시물을 크롤링하고 각 게시물의 내용과 댓글을 수집합니다.
 * @implements {ICrawler}
 * @implements {IPageEvaluator}
 */
export class DCInsideCrawler implements ICrawler, IPageEvaluator {
  private browser: Browser | null = null;
  private page: Page | null = null;
  private trendAnalyzer: TrendAnalyzer;

  /**
   * DCInsideCrawler 생성자
   * @param {CrawlerConfig} config - 크롤러 설정 (헤더, 타임아웃, 게시물 제한 등)
   */
  constructor(private readonly config: CrawlerConfig) {
    this.trendAnalyzer = new TrendAnalyzer();
  }

  /**
   * Puppeteer 브라우저와 페이지를 초기화합니다.
   * 크롤링 시작 전에 반드시 호출해야 합니다.
   * @throws {Error} 브라우저 초기화 실패 시 에러
   */
  async initialize(): Promise<void> {
    try {
      logger.info('브라우저 초기화 시작');
      this.browser = await puppeteer.launch({
        headless: this.config.headless,
        args: this.config.browserArgs
      });
      this.page = await this.browser.newPage();
      await this.page.setViewport(this.config.viewport);
      await this.page.setUserAgent(this.config.headers['User-Agent']);
      await this.page.setExtraHTTPHeaders(this.config.headers);
      logger.info('브라우저 초기화 완료');
    } catch (error) {
      logger.error('브라우저 초기화 실패', { error });
      throw error;
    }
  }

  /**
   * 사용한 브라우저 리소스를 정리합니다.
   * 크롤링 완료 후 반드시 호출해야 합니다.
   */
  async cleanup(): Promise<void> {
    try {
      if (this.browser) {
        logger.info('브라우저 종료');
        await this.browser.close();
        this.browser = null;
        this.page = null;
      }
    } catch (error) {
      logger.error('브라우저 종료 중 오류 발생', { error });
      throw error;
    }
  }

  /**
   * DCInside 실시간 베스트 게시물을 크롤링하고 트렌드를 분석합니다.
   * config.postsLimit 만큼의 게시물을 수집하며, 각 게시물의 내용과 댓글을 함께 가져옵니다.
   * @returns {Promise<{ posts: { title: string }[]; trends: any }>} 크롤링된 게시물 배열과 트렌드 분석 결과
   * @throws {Error} 브라우저가 초기화되지 않았거나 크롤링 중 에러 발생 시
   */
  async crawl(): Promise<{
    posts: { title: string }[];
    trends: {
      summary: string;
      sentiment: string;
    };
  }> {
    if (!this.page) {
      throw new Error('브라우저가 초기화되지 않았습니다.');
    }

    try {
      logger.info('메인 페이지 접속 시작');
      await this.page.goto('https://m.dcinside.com/', {
        waitUntil: this.config.waitUntil,
        timeout: this.config.timeout
      });
      logger.info('메인 페이지 접속 완료');

      const posts = await this.evaluateMainPage(this.page);
      logger.info('게시물 크롤링 완료', { count: posts.length });

      const trends = await this.analyzeTrends(posts);
      logger.info('트렌드 분석 완료', { sentiment: trends.sentiment });

      return {
        posts: posts.map(post => ({
          title: post.title
        })),
        trends
      };
    } catch (error) {
      logger.error('크롤링 중 오류 발생', { error });
      throw error;
    }
  }

  /**
   * DCInside 메인 페이지에서 실시간 베스트 게시물 목록을 추출합니다.
   * @param {Page} page - Puppeteer 페이지 인스턴스
   * @returns {Promise<DCPost[]>} 게시물 제목과 URL이 포함된 배열
   */
  async evaluateMainPage(page: Page): Promise<DCPost[]> {
    return await page.evaluate(() => {
      function cleanText(text: string): string {
        return text.replace(/[\n\t]/g, '').replace(/\s+/g, ' ').trim();
      }

      const results: DCPost[] = [];
      const mainWraps = document.querySelectorAll('.main-wrapping');

      const findTargetElements = (element: Element) => {
        if (element.classList.contains('grid') && element.classList.contains('livebest-group')) {
          element.querySelectorAll('*').forEach(el => {
            if (el.classList.contains('thum-rtg-1-slider')) {
              el.querySelectorAll('ul li').forEach(li => {
                const a = li.querySelector('a');
                const p = li.querySelector('p');
                const title = p?.textContent ? cleanText(p.textContent) : '';
                const href = a?.getAttribute('href');
                
                if (title && href) {
                  const url = href.match(/\/board\/[^']+/)?.[0];
                  if (url) {
                    results.push({
                      title,
                      url: `https://m.dcinside.com${url}`
                    });
                  }
                }
              });
            }
          });
        }

        Array.from(element.children).forEach(findTargetElements);
      };

      mainWraps.forEach(findTargetElements);
      return results;
    });
  }

  /**
   * 개별 게시물 페이지에서 내용과 댓글을 추출합니다.
   * @param {Page} page - Puppeteer 페이지 인스턴스
   * @param {string} url - 게시물 URL
   * @returns {Promise<{content: string | null; comments: string[]}>} 게시물 내용과 댓글 배열
   */
  async evaluatePostPage(page: Page, url: string): Promise<{ content: string | null; comments: string[] }> {
    await page.goto(url, {
      waitUntil: this.config.waitUntil,
      timeout: this.config.timeout
    });

    return await page.evaluate(() => {
      function cleanText(text: string): string {
        return text.replace(/[\n\t]/g, '').replace(/\s+/g, ' ').trim();
      }

      let content = '';
      const container = document.querySelector('.container');
      
      if (container) {
        const brickWid = container.querySelector('.brick-wid');
        if (brickWid) {
          const gallInner = brickWid.querySelector('.gall-thum-btm-inner');
          if (gallInner) {
            const paragraphs = gallInner.querySelectorAll('p');
            content = Array.from(paragraphs)
              .map(p => p.textContent || '')
              .filter(text => text.trim() !== '')
              .map(text => cleanText(text))
              .join('\n');
          }
        }
      }

      const comments: string[] = [];
      const commentBox = document.getElementById('comment_box');
      
      if (commentBox) {
        const commentItems = commentBox.querySelectorAll('.comment-item, .reply-item');
        
        commentItems.forEach(item => {
          const commentText = item.querySelector('.comment-text, .reply-text');
          if (commentText) {
            const text = cleanText(commentText.textContent || '');
            if (text) {
              comments.push(text);
            }
          }
        });
      }

      return {
        content: content || null,
        comments: [...new Set(comments)]
      };
    });
  }

  /**
   * 중복된 게시물을 제거합니다.
   * 제목을 기준으로 중복을 확인하며, 먼저 발견된 게시물을 유지합니다.
   * @param {DCPost[]} posts - 게시물 배열
   * @returns {DCPost[]} 중복이 제거된 게시물 배열
   * @private
   */
  private removeDuplicates(posts: DCPost[]): DCPost[] {
    const uniquePosts = new Map<string, DCPost>();
    posts.forEach(post => {
      if (!uniquePosts.has(post.title)) {
        uniquePosts.set(post.title, post);
      }
    });
    return Array.from(uniquePosts.values());
  }

  private async analyzeTrends(posts: DCPost[]): Promise<TrendAnalysis> {
    try {
      logger.debug('트렌드 분석 시작');
      const postsText = posts.map(post => post.title).join('\n');
      const trends = await this.trendAnalyzer.analyzeTrends(posts);
      logger.debug('트렌드 분석 완료', { sentiment: trends.sentiment });
      return trends;
    } catch (error) {
      logger.error('트렌드 분석 중 오류 발생', { error });
      throw error;
    }
  }
} 