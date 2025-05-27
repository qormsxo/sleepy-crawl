import { Router } from 'express';
import { CrawlerController } from '../controllers/crawlerController';

const router = Router();
const crawlerController = new CrawlerController();

router.get('/dcinside/cheerio', crawlerController.crawlDCInsideWithCheerio);
router.get('/dcinside/puppeteer', crawlerController.crawlDCInsideWithPuppeteer);

export { router as routes }; 