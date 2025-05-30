import { DCInsideCrawler } from '../DCInsideCrawler';
import { CrawlerConfig } from '../../types/crawler.types';
import puppeteer, { Browser, Page } from 'puppeteer';

// Mock Puppeteer
jest.mock('puppeteer');

describe('DCInsideCrawler', () => {
  let crawler: DCInsideCrawler;
  let mockBrowser: jest.Mocked<Browser>;
  let mockPage: jest.Mocked<Page>;

  const mockConfig: CrawlerConfig = {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Linux; Android 10; SM-G981B) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/80.0.3987.162 Mobile Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ko-KR,ko;q=0.8,en-US;q=0.5,en;q=0.3',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Ch-Ua': '"Chromium";v="112"',
      'Sec-Ch-Ua-Mobile': '?1',
      'Sec-Ch-Ua-Platform': 'Android',
      'Upgrade-Insecure-Requests': '1'
    },
    timeout: 30000,
    waitUntil: 'networkidle0',
    postsLimit: 10
  };

  beforeEach(() => {
    // Setup mock implementations
    mockPage = {
      setUserAgent: jest.fn(),
      setExtraHTTPHeaders: jest.fn(),
      goto: jest.fn(),
      evaluate: jest.fn(),
      close: jest.fn(),
    } as unknown as jest.Mocked<Page>;

    mockBrowser = {
      newPage: jest.fn().mockResolvedValue(mockPage),
      close: jest.fn(),
    } as unknown as jest.Mocked<Browser>;

    (puppeteer.launch as jest.Mock).mockResolvedValue(mockBrowser);

    crawler = new DCInsideCrawler(mockConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initialize', () => {
    it('브라우저와 페이지를 성공적으로 초기화해야 합니다', async () => {
      await crawler.initialize();

      expect(puppeteer.launch).toHaveBeenCalledWith({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      expect(mockBrowser.newPage).toHaveBeenCalled();
      expect(mockPage.setUserAgent).toHaveBeenCalledWith(mockConfig.headers['User-Agent']);
      expect(mockPage.setExtraHTTPHeaders).toHaveBeenCalledWith(mockConfig.headers);
    });
  });

  describe('cleanup', () => {
    it('브라우저 리소스를 정리해야 합니다', async () => {
      await crawler.initialize();
      await crawler.cleanup();

      expect(mockBrowser.close).toHaveBeenCalled();
    });
  });

  describe('crawl', () => {
    beforeEach(async () => {
      await crawler.initialize();
    });

    afterEach(async () => {
      await crawler.cleanup();
    });

    it('메인 페이지에서 게시물을 크롤링해야 합니다', async () => {
      const mockPosts = [
        { title: '테스트 게시물 1', url: 'https://m.dcinside.com/board/test/1' },
        { title: '테스트 게시물 2', url: 'https://m.dcinside.com/board/test/2' }
      ];

      const mockPostContent = {
        content: '테스트 내용',
        comments: ['테스트 댓글 1', '테스트 댓글 2']
      };

      mockPage.evaluate
        .mockResolvedValueOnce(mockPosts)
        .mockResolvedValueOnce(mockPostContent)
        .mockResolvedValueOnce(mockPostContent);

      const result = await crawler.crawl();

      expect(mockPage.goto).toHaveBeenCalledWith('https://m.dcinside.com/', {
        waitUntil: mockConfig.waitUntil,
        timeout: mockConfig.timeout
      });
      expect(result.length).toBeLessThanOrEqual(mockConfig.postsLimit);
      expect(result[0]).toHaveProperty('content');
      expect(result[0]).toHaveProperty('comments');
    });

    it('중복된 게시물을 제거해야 합니다', async () => {
      const mockPosts = [
        { title: '중복 게시물', url: 'https://m.dcinside.com/board/test/1' },
        { title: '중복 게시물', url: 'https://m.dcinside.com/board/test/2' }
      ];

      const mockPostContent = {
        content: '테스트 내용',
        comments: ['테스트 댓글']
      };

      mockPage.evaluate
        .mockResolvedValueOnce(mockPosts)
        .mockResolvedValueOnce(mockPostContent);

      const result = await crawler.crawl();

      expect(result.length).toBe(1);
      expect(result[0].title).toBe('중복 게시물');
    });

    it('브라우저가 초기화되지 않은 경우 에러를 발생시켜야 합니다', async () => {
      await crawler.cleanup();
      await expect(crawler.crawl()).rejects.toThrow('Browser not initialized');
    });
  });
}); 