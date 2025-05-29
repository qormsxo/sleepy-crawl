import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer, { Page } from 'puppeteer';

interface DCPost {
  title: string;
  url?: string;
  content?: string;
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
      .replace(/[\n\t]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private extractUrlFromHref(href: string): string | null {
    const match = href.match(/\/board\/[^']+/);
    return match ? `https://m.dcinside.com${match[0]}` : null;
  }

  private removeDuplicates(posts: DCPost[]): DCPost[] {
    const uniquePosts = new Map<string, DCPost>();
    posts.forEach(post => {
      if (!uniquePosts.has(post.title)) {
        uniquePosts.set(post.title, post);
      }
    });
    return Array.from(uniquePosts.values());
  }

  private async fetchPostContent(page: Page, url: string): Promise<string | null> {
    try {
      await page.goto(url, {
        waitUntil: 'networkidle0',
        timeout: 30000
      });

      const content = await page.evaluate(() => {
        let content = '';
        
        // #top > .wrap_inner 내부의 텍스트
        const wrapInner = document.querySelector('#top .wrap_inner');
        if (wrapInner) {
          content += wrapInner.textContent || '';
        }

        // .view_content_wrap 내부의 p 태그 텍스트
        const viewContentWrap = document.querySelector('.view_content_wrap');
        if (viewContentWrap) {
          const paragraphs = viewContentWrap.querySelectorAll('p');
          paragraphs.forEach(p => {
            content += ' ' + (p.textContent || '');
          });
        }

        return content.replace(/[\n\t]/g, '')
                     .replace(/\s+/g, ' ')
                     .trim();
      });

      return content || null;
    } catch (error) {
      console.error(`Failed to fetch content from ${url}:`, error);
      return null;
    }
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
      console.log("crawlWithPuppeteer ");
      const page = await browser.newPage();
      await page.setUserAgent(this.headers['User-Agent']);
      await page.setExtraHTTPHeaders(this.headers);
      await page.goto(url, { waitUntil: 'networkidle0', timeout: 30000 });
      
      const data = await page.evaluate(() => {
        // 본문 내용 추출 (container > brick-wid > gall-thum-btm-inner 경로)
        const container = document.querySelector('.container');
        let mainContent = '';
        
        if (container) {
          const brickWid = container.querySelector('.brick-wid');
          if (brickWid) {
            const gallInner = brickWid.querySelector('.gall-thum-btm-inner');
            if (gallInner) {
              const paragraphs = gallInner.querySelectorAll('p');
              mainContent = Array.from(paragraphs)
                .map(p => p.textContent || '')
                .filter(text => text.trim() !== '')
                .join('\n');
            }
          }
        }

        // 댓글 내용 추출 (comment_box id를 가진 div 안의 모든 p)
        const commentBox = document.getElementById('comment_box');
        const comments = [];
        
        if (commentBox) {
          const commentParagraphs = commentBox.querySelectorAll('p');
          comments.push(...Array.from(commentParagraphs)
            .map(p => p.textContent || '')
            .filter(text => text.trim() !== ''));
        }

        return {
          content: mainContent || null,
          comments
        };
      });
      
      console.log(data);
      return data;
    } catch (error: any) {
      console.log(`Failed to crawl with Puppeteer: ${url}`, error);
      console.error(`Failed to crawl with Puppeteer: ${url}`, error);
      return { content: null, error: error.message };
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
      let posts: DCPost[] = [];

      $('.main-wrapping').each((_, mainWrap) => {
        const findTargetElements = (element: cheerio.Element) => {
          const $element = $(element);
          
          if ($element.hasClass('grid') && $element.hasClass('livebest-group')) {
            $element.find('*').each((_, el) => {
              if ($(el).hasClass('thum-rtg-1-slider')) {
                $(el).find('ul li').each((_, li) => {
                  const $li = $(li);
                  const $a = $li.find('a');
                  const $p = $li.find('p');
                  const title = this.cleanText($p.text());
                  const href = $a.attr('href');
                  
                  if (title && href) {
                    const url = this.extractUrlFromHref(href);
                    if (url) {
                      posts.push({
                        title,
                        url
                      });
                    } else {
                      posts.push({ title });
                    }
                  }
                });
              }
            });
          }

          $element.children().each((_, child) => {
            findTargetElements(child);
          });
        };

        findTargetElements(mainWrap);
      });

      // 중복 제거
      posts = this.removeDuplicates(posts);

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

      let posts = await page.evaluate(() => {
        const results: any[] = [];
        
        const cleanText = (text: string) => {
          return text
            .replace(/[\n\t]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
        };

        const extractUrlFromHref = (href: string): string | null => {
          const match = href.match(/\/board\/[^']+/);
          return match ? `https://m.dcinside.com${match[0]}` : null;
        };
        
        const mainWraps = document.querySelectorAll('.main-wrapping');

        const findTargetElements = (element: Element) => {
          if (element.classList.contains('grid') && element.classList.contains('livebest-group')) {
            element.querySelectorAll('*').forEach(el => {
              if (el.classList.contains('thum-rtg-1-slider')) {
                el.querySelectorAll('ul li').forEach(li => {
                  const a = li.querySelector('a');
                  const p = li.querySelector('p');
                  const title = cleanText(p?.textContent || '');
                  const href = a?.getAttribute('href');
                  
                  if (title && href) {
                    const url = extractUrlFromHref(href);
                    if (url) {
                      results.push({
                        title,
                        url
                      });
                    }
                  }
                });
              }
            });
          }

          Array.from(element.children).forEach(child => {
            findTargetElements(child);
          });
        };

        mainWraps.forEach(wrap => {
          findTargetElements(wrap);
        });

        return results;
      });

      // 중복 제거
      posts = this.removeDuplicates(posts);
      console.log('Found posts:', posts.length);
      
      // 각 포스트의 내용 가져오기
      const postsWithContent = [];
      for (const post of posts) {
        if (post.url) {
          const { content } = await this.crawlWithPuppeteer(post.url);
          if (content) {
            postsWithContent.push({
              ...post,
              content
            });
          } else {
            postsWithContent.push(post);
          }
        } else {
          postsWithContent.push(post);
        }
      }

      return postsWithContent;
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