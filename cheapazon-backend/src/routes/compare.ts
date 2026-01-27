import express, { Request, Response } from 'express';
import { searchAliExpress, getAliExpressProductDetails } from '../services/aliexpress';
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

        if (cached) {
            // A. Negative Caching (No Match Found Previously)
            if (!cached.matchResult) {
                const lastUpdated = new Date(cached.updatedAt).getTime();
                const now = new Date().getTime();
                const hoursSinceUpdate = (now - lastUpdated) / (1000 * 60 * 60);

                // If compiled < 24h ago, return Not Found immediately
                if (hoursSinceUpdate < 24) {
                    console.log(`[Cache Hit] Negative Match (No Ali Equivalent) for ${product.asin}`);
                    res.json({ found: false });
                    return;
                }
                console.log(`[Cache Expired] Negative Match expired. Retrying search for ${product.asin}`);
            }
            // B. Positive Caching (Match Exists)
            else {
                const lastChecked = new Date(cached.matchResult.lastChecked).getTime();
                const now = new Date().getTime();
                const hoursDiff = (now - lastChecked) / (1000 * 60 * 60);

                // If Fresh (< 12h) -> Return Immediately
                if (hoursDiff < 12) {
                    console.log(`[Cache Hit] Returning valid match for ${product.asin}`);
                    const response: ComparisonResponse = {
                        found: true,
                        match: {
                            aliTitle: cached.matchResult.aliTitle,
                            aliPrice: cached.matchResult.aliPrice,
                            shipping: 0,
                            currency: cached.matchResult.currency as 'USD' | 'CAD',
                            savings: cached.matchResult.savings,
                            affiliateUrl: cached.matchResult.aliUrl,
                            imageUrl: cached.matchResult.aliImageUrl,
                            aliProductId: cached.matchResult.aliProductId || undefined
                        }
                    };
                    res.json(response);
                    return;
                }

                // If Stale (> 12h) -> Optimize: Single Item Refresh
                if (cached.matchResult.aliProductId) {
                    console.log(`[Cache Stale] Refreshing Price via ID: ${cached.matchResult.aliProductId}`);
                    const refreshed = await getAliExpressProductDetails(cached.matchResult.aliProductId, product.currency);

                    if (refreshed) {
                        // C. Bait & Switch Protection (Simple Title Similarity Check)
                        // If titles are drastically different (e.g. length diff > 50 chars or completely different words), invalid.
                        // For now, trusting ID if valid product returned.

                        const newSavings = product.price - refreshed.aliPrice;

                        // Update DB
                        await prisma.matchResult.update({
                            where: { sourceProductId: cached.id },
                            data: {
                                aliPrice: refreshed.aliPrice,
                                savings: newSavings,
                                lastChecked: new Date(),
                                aliTitle: refreshed.aliTitle, // Update title in case it changed slightly
                                aliUrl: refreshed.affiliateUrl
                            }
                        });

                        console.log(`[Cache Refresh] Success. New Savings: ${newSavings}`);
                        res.json({
                            found: true,
                            match: { ...refreshed, savings: newSavings }
                        });
                        return;
                    } else {
                        console.warn(`[Cache Refresh] Failed to fetch details for ID ${cached.matchResult.aliProductId}. Fallback to full search.`);
                    }
                }
            }
        }

        // 2. Full Search (Fallback or First Time)
        // If we contain a cached entry (stale negative or stale positive with failed refresh), we update it.
        // If strict new, we create.

        console.log(`[Full Search] Triggering AI Search for ${product.asin}`);
        const match = await searchAliExpress(product);

        if (match) {
            // Upsert Logic
            await prisma.sourceProduct.upsert({
                where: { asin: product.asin },
                update: {
                    price: product.price,
                    updatedAt: new Date(),
                    matchResult: {
                        upsert: {
                            create: {
                                aliTitle: match.aliTitle,
                                aliPrice: match.aliPrice,
                                aliUrl: match.affiliateUrl,
                                aliImageUrl: match.imageUrl,
                                savings: match.savings,
                                currency: match.currency,
                                aliProductId: String(match.aliProductId),
                                lastChecked: new Date()
                            },
                            update: {
                                aliTitle: match.aliTitle,
                                aliPrice: match.aliPrice,
                                aliUrl: match.affiliateUrl,
                                aliImageUrl: match.imageUrl,
                                savings: match.savings,
                                currency: match.currency,
                                aliProductId: String(match.aliProductId),
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
                    updatedAt: new Date(),
                    matchResult: {
                        create: {
                            aliTitle: match.aliTitle,
                            aliPrice: match.aliPrice,
                            aliUrl: match.affiliateUrl,
                            aliImageUrl: match.imageUrl,
                            savings: match.savings,
                            currency: match.currency,
                            aliProductId: String(match.aliProductId)
                        }
                    }
                }
            });
        } else {
            // Negative Match: Record that we found nothing (SourceProduct exists, MatchResult is null or deleted)
            // If SourceProduct exists, just update timestamp.
            // If new, create SourceProduct only.

            // To handle "MatchResult could exist from previous positive", we typically delete it if we now find nothing.
            // But usually we just update updatedAt on SourceProduct.

            // First check if it exists to decide update or create
            const existing = await prisma.sourceProduct.findUnique({ where: { asin: product.asin } });

            if (existing) {
                await prisma.sourceProduct.update({
                    where: { asin: product.asin },
                    data: {
                        updatedAt: new Date(),
                        price: product.price
                        // Optional: delete matchResult if it existed? Maybe keep history? 
                        // For "Negative Caching" to work as "No Match Found", matchResult should be null.
                        // If it WAS a match but now isn't, we should probably delete matchResult.
                    }
                });
                // Explicitly delete matchResult if we want to enforce "No Match" state
                // await prisma.matchResult.delete({ where: { sourceProductId: existing.id } }).catch(() => {});
            } else {
                await prisma.sourceProduct.create({
                    data: {
                        asin: product.asin,
                        title: product.title,
                        price: product.price,
                        currency: product.currency,
                        imageUrl: product.imageUrl,
                        updatedAt: new Date() // Sets the "negative cache" timer
                    }
                });
            }
        }

        const response: ComparisonResponse = {
            found: !!match,
            match: match || undefined
        };

        res.json(response);
    } catch (error) {
        console.error('Error in comparison route:', error);
        // Throw to Global Error Handler
        throw error;
    }
});

export default router;
