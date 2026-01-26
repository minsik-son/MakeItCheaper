import express, { Request, Response } from 'express';
import { searchAliExpress } from '../services/aliexpress';
import { AmazonProduct, ComparisonResponse } from '../types';

// import { prisma } from '../utils/prisma'; // Prisma import 주석 처리

const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const product: AmazonProduct = req.body;

        if (!product || !product.title || !product.price) {
            res.status(400).json({ error: 'Invalid product data' });
            return;
        }

        // --- SUPABASE CACHE LOGIC DISABLED ---
        /*
        // 1. Check Cache
        const cached = await prisma.sourceProduct.findUnique({
            where: { asin: product.asin },
            include: {
                comparisons: {
                    where: {
                        createdAt: {
                            gte: new Date(Date.now() - 1000 * 60 * 60 * 3) // 3시간 이내
                        }
                    },
                    orderBy: {
                        savings: 'desc'
                    },
                    take: 1
                }
            }
        });

        if (cached && cached.comparisons.length > 0) {
            console.log(`[Cache] HIT for ASIN: ${product.asin}`);
            const cachedMatch = cached.comparisons[0];
            const response: ComparisonResponse = {
                found: true,
                match: {
                    aliTitle: cachedMatch.aliTitle,
                    aliPrice: Number(cachedMatch.aliPrice),
                    shipping: 0,
                    currency: product.currency,
                    savings: Number(cachedMatch.savings),
                    affiliateUrl: cachedMatch.affiliateUrl,
                    imageUrl: cachedMatch.imageUrl
                }
            };
            res.json(response);
            return;
        }
        console.log(`[Cache] MISS for ASIN: ${product.asin}`);
        */
        // --- END OF DISABLED LOGIC ---

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

/*
import express, { Request, Response } from 'express';
import { searchAliExpress } from '../services/aliexpress';
import { AmazonProduct, ComparisonResponse } from '../types';
import prisma from '../lib/prisma';

const router = express.Router();

router.post('/', async (req: Request, res: Response) => {
    try {
        const product: AmazonProduct = req.body;

        if (!product || !product.title || !product.price) {
            res.status(400).json({ error: 'Invalid product data' });
            return;
        }

        // 1. Check Cache
        const cached = await prisma.sourceProduct.findUnique({
            where: { asin: product.asin },
            include: { matchResult: true }
        });

        if (cached && cached.matchResult) {
            const lastChecked = new Date(cached.matchResult.lastChecked).getTime();
            const now = new Date().getTime();
            const hoursDiff = (now - lastChecked) / (1000 * 60 * 60);

            if (hoursDiff < 12) {
                console.log(`[Cache Hit] Returning cached result for ${product.asin}`);
                const response: ComparisonResponse = {
                    found: true,
                    match: {
                        aliTitle: cached.matchResult.aliTitle,
                        aliPrice: cached.matchResult.aliPrice,
                        shipping: 0, // Simplified or stored
                        currency: cached.matchResult.currency as 'USD' | 'CAD',
                        savings: cached.matchResult.savings,
                        affiliateUrl: cached.matchResult.aliUrl,
                        imageUrl: cached.matchResult.aliImageUrl
                    }
                };
                res.json(response);
                return;
            }
            console.log(`[Cache Stale] Expired ${hoursDiff.toFixed(1)} hours ago for ${product.asin}`);
        } else {
            console.log(`[Cache Miss] No entry for ${product.asin}`);
        }

        // 2. Search AliExpress (Real API Call)
        const match = await searchAliExpress(product);

        // 3. Update Cache
        if (match) {
            await prisma.sourceProduct.upsert({
                where: { asin: product.asin },
                update: {
                    price: product.price,
                    matchResult: {
                        upsert: {
                            create: {
                                aliTitle: match.aliTitle,
                                aliPrice: match.aliPrice,
                                aliUrl: match.affiliateUrl,
                                aliImageUrl: match.imageUrl,
                                savings: match.savings,
                                currency: match.currency,
                                lastChecked: new Date()
                                // confidence will be added later
                            },
                            update: {
                                aliTitle: match.aliTitle,
                                aliPrice: match.aliPrice,
                                aliUrl: match.affiliateUrl,
                                aliImageUrl: match.imageUrl,
                                savings: match.savings,
                                currency: match.currency,
                                lastChecked: new Date()
                            }
                        }
                    }
                },
                create: {
                    asin: product.asin,
                    title: product.title,
                    price: product.price,
                    currency: product.currency,
                    imageUrl: product.imageUrl,
                    matchResult: {
                        create: {
                            aliTitle: match.aliTitle,
                            aliPrice: match.aliPrice,
                            aliUrl: match.affiliateUrl,
                            aliImageUrl: match.imageUrl,
                            savings: match.savings,
                            currency: match.currency
                        }
                    }
                }
            });
        }

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
*/