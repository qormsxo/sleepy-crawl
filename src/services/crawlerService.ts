import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';

interface DCPost {
  text: string;
}

export class CrawlerService {
  private headers = {
    'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_7_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.1.2 Mobile/15E148 Safari/604.1',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
    'Accept-Language': 'ko-KR,ko;q=0.9,en-US;q=0.8,en;q=0.7',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Not A(Brand";v="99", "Google Chrome";v="121", "Chromium";v="121"',
    'Sec-Ch-Ua-Mobile': '?1',
    'Sec-Ch-Ua-Platform': '"Android"',
    'Upgrade-Insecure-Requests': '1'
  };

  async crawlWithCheerio(url: string): Promise<any> {
    try {
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);
      
      // 여기에 cheerio를 사용한 크롤링 로직을 구현합니다
      // 예시: 모든 제목 태그 수집
      const titles = $('h1, h2, h3').map((_, el) => $(el).text()).get();
      
      return {
        titles,
        url
      };
    } catch (error) {
      throw new Error(`Failed to crawl with Cheerio: ${error}`);
    }
  }

  async crawlWithPuppeteer(url: string): Promise<any> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
      
      const page = await browser.newPage();
      await page.goto(url, { waitUntil: 'networkidle0' });
      
      // 여기에 Puppeteer를 사용한 크롤링 로직을 구현합니다
      // 예시: 페이지 타이틀과 메타 설명 수집
      const data = await page.evaluate(() => ({
        title: document.title,
        description: document.querySelector('meta[name="description"]')?.getAttribute('content'),
        url: window.location.href
      }));
      
      return data;
    } catch (error) {
      throw new Error(`Failed to crawl with Puppeteer: ${error}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }

  async crawlDCInsideWithCheerio(): Promise<DCPost[]> {
    try {
      const response = await axios.get('https://m.dcinside.com/', {
        headers: this.headers
      });
      const $ = cheerio.load(response.data);
      
      // HTML에서 모든 텍스트 추출
      const texts = $('body')
        .text()
        .split('\n')
        .map(text => text.trim())
        .filter(text => text.length > 0);

      return texts.map(text => ({ text }));
    } catch (error) {
      console.error('Cheerio 크롤링 에러:', error);
      throw new Error(`Failed to crawl DCInside: ${error}`);
    }
  }

  async crawlDCInsideWithPuppeteer(): Promise<DCPost[]> {
    let browser;
    try {
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process'
        ]
      });
      
      const page = await browser.newPage();
      await page.setUserAgent(this.headers['User-Agent']);
      await page.setExtraHTTPHeaders(this.headers);
      
      await page.goto('https://m.dcinside.com/', {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      // 페이지의 모든 텍스트 추출
      const texts = await page.evaluate(() => {
        // 스크립트와 스타일 태그 제거
        const scripts = document.querySelectorAll('script, style');
        scripts.forEach(script => script.remove());
        
        // body의 텍스트만 추출
        return document.body.innerText
          .split('\n')
          .map(text => text.trim())
          .filter(text => text.length > 0);
      });

      return texts.map(text => ({ text }));
    } catch (error) {
      console.error('Puppeteer 크롤링 에러:', error);
      throw new Error(`Failed to crawl DCInside: ${error}`);
    } finally {
      if (browser) {
        await browser.close();
      }
    }
  }
} 