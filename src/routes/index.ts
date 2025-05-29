import { Router } from 'express';
import { CrawlerController } from '../controllers/crawlerController';

const router = Router();
const crawlerController = new CrawlerController();

router.get('/dcinside', crawlerController.crawlDCInside);

export default router; 