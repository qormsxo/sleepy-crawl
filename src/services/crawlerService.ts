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

  private cleanText(text: string): string {
    return text
      .replace(/[\n\t]/g, '') // 줄바꿈과 탭 제거
      .replace(/\s+/g, ' ')   // 연속된 공백을 하나로
      .trim();                // 앞뒤 공백 제거
  }

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

      // HTML 응답 확인
      console.log('전체 HTML:', response.data);

      const $ = cheerio.load(response.data);
      const posts: DCPost[] = [];

      // main-wrapping 클래스를 찾음
      $('.main-wrapping').each((_, mainWrap) => {
        console.log('main-wrapping found');
        
        // 재귀적으로 하위 요소를 탐색하는 함수
        const findTargetElements = (element: cheerio.Element) => {
          // grid livebest-group 클래스를 가진 div 찾기
          const $element = $(element);
          
          if ($element.hasClass('grid') && $element.hasClass('livebest-group')) {
            console.log('grid livebest-group found');
            
            // thum-rtg-1-slider 클래스를 가진 div 찾기
            $element.find('*').each((_, el) => {
              if ($(el).hasClass('thum-rtg-1-slider')) {
                console.log('thum-rtg-1-slider found');
                
                // p 태그 찾기
                $(el).find('p').each((_, p) => {
                  const text = this.cleanText($(p).text());
                  if (text) {
                    console.log('Found p tag text:', text);
                    posts.push({ text });
                  }
                });
              }
            });
          }

          // 모든 자식 요소에 대해 재귀적으로 탐색
          $element.children().each((_, child) => {
            findTargetElements(child);
          });
        };

        // 재귀 탐색 시작
        findTargetElements(mainWrap);
      });

      console.log('최종 결과:', posts);
      return posts;
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

      // HTML 내용 확인
      const pageContent = await page.content();
      console.log('전체 HTML:', pageContent);

      const posts = await page.evaluate(() => {
        const results: any[] = [];
        
        // 텍스트 정리 함수를 페이지 컨텍스트 내에서 직접 정의
        const cleanText = (text: string) => {
          return text
            .replace(/[\n\t]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };
        
        // main-wrapping 클래스를 찾음
        const mainWraps = document.querySelectorAll('.main-wrapping');
        console.log('main-wrapping elements found:', mainWraps.length);

        const findTargetElements = (element: Element) => {
          // grid livebest-group 클래스를 가진 div 찾기
          if (element.classList.contains('grid') && element.classList.contains('livebest-group')) {
            console.log('grid livebest-group found');
            
            // thum-rtg-1-slider 클래스를 가진 모든 하위 요소 찾기
            element.querySelectorAll('*').forEach(el => {
              if (el.classList.contains('thum-rtg-1-slider')) {
                console.log('thum-rtg-1-slider found');
                
                // p 태그 찾기
                el.querySelectorAll('p').forEach(p => {
                  const text = cleanText(p.textContent || '');
                  if (text) {
                    console.log('Found p tag text:', text);
                    results.push({ text });
                  }
                });
              }
            });
          }

          // 모든 자식 요소에 대해 재귀적으로 탐색
          Array.from(element.children).forEach(child => {
            findTargetElements(child);
          });
        };

        mainWraps.forEach(wrap => {
          findTargetElements(wrap);
        });

        return results;
      });

      console.log('최종 결과:', posts);
      return posts;
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