import { Router } from 'express';
import { CrawlerController } from '../controllers/crawlerController';
import { errorHandler } from '../middleware/errorHandler';

const router = Router();
const crawlerController = new CrawlerController();

router.get('/dcinside', errorHandler , crawlerController.crawlDCInside);

export default router; 