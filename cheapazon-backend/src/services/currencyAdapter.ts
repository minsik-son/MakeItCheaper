import prisma from '../lib/prisma';
import { getAliExpressProductDetails } from './aliexpress';
import { AliExpressProduct } from '../types';

/**
 * Checks if the cached match currency differs from the target currency.
 * If so, fetches fresh details from AliExpress and updates the database.
 * Returns the updated match if successful, otherwise null.
 */
export const refreshMatchForCurrency = async (
    matchResult: any,
    sourceProductId: string,
    targetCurrency: string,
    amazonPrice: number
): Promise<AliExpressProduct | null> => {
    // 1. Check if adaptation is needed
    if (matchResult.currency === targetCurrency || !matchResult.aliProductId) {
        return null;
    }

    console.log(`[Cache Mismatch] Currency (${matchResult.currency} vs ${targetCurrency}). Fetching fresh price from AliExpress...`);

    // 2. Fetch fresh details in the TARGET currency
    const refreshed = await getAliExpressProductDetails(matchResult.aliProductId, targetCurrency);

    if (!refreshed) {
        console.warn(`[Cache Adapt] Failed to refresh price for currency. Keeping old cache.`);
        return null;
    }

    // 3. Calculate new savings
    const newSavings = amazonPrice - refreshed.aliPrice;

    // 4. Update Database
    await prisma.matchResult.update({
        where: { sourceProductId: sourceProductId },
        data: {
            aliPrice: refreshed.aliPrice,
            currency: refreshed.currency,
            savings: newSavings,
            lastChecked: new Date(),
            aliTitle: refreshed.aliTitle,
            aliUrl: refreshed.affiliateUrl
        }
    });

    console.log(`[Cache Adapt] Successfully updated to ${refreshed.currency} ${refreshed.aliPrice}`);

    return {
        ...refreshed,
        savings: newSavings
    };
};
