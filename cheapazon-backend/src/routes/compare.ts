import express, { Request, Response } from 'express';
import { searchAliExpress } from '../services/aliexpress';
import { AmazonProduct, ComparisonResponse } from '../types';

const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const product: AmazonProduct = req.body;

        if (!product || !product.title || !product.price) {
            res.status(400).json({ error: 'Invalid product data' });
            return;
        }

        const match = await searchAliExpress(product);

        const response: ComparisonResponse = {
            found: !!match,
            match: match || undefined
        };

        res.json(response);
    } catch (error) {
        console.error('Error in comparison route:', error);
        res.status(500).json({ error: 'Internal server error' });
    }
});

export default router;
