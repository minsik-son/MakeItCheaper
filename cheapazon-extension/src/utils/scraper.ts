export interface ProductDetails {
    asin: string;
    title: string;
    price: number;
    imageUrl: string;
}

export const cleanTitle = (title: string): string => {
    return title
        .replace(/New|2025|Latest Model/gi, '')
        // Allow Unicode letters (\p{L}), numbers (\p{N}), whitespace, and hyphens.
        // Requires 'u' flag for Unicode property escapes.
        .replace(/[^\p{L}\p{N}\s\-]/gu, ' ')
        .trim()
        .replace(/\s+/g, ' ');
};

export const getProductDetails = (): ProductDetails | null => {
    try {
        // Match Amazon ASIN from various URL formats
        const asinMatch = window.location.pathname.match(/(?:\/dp\/|\/gp\/aw\/d\/|\/product\/)([A-Z0-9]{10})/);
        const asin = asinMatch ? asinMatch[1] : '';

        if (!asin) return null;

        const titleElement = document.getElementById('productTitle');
        const title = titleElement ? cleanTitle(titleElement.innerText) : '';

        // Price extraction is tricky on Amazon as there are multiple selectors
        // Common selectors: .a-price .a-offscreen, #priceblock_ourprice, #corePrice_desktop, #apex_desktop
        let price = 0;
        
        // Try multiple selectors for price in order of preference
        const priceSelectors = [
            '.a-price .a-offscreen',
            '#corePrice_desktop .a-offscreen',
            '#corePrice_feature_div .a-offscreen',
            '#apex_desktop .a-offscreen',
            '#priceblock_ourprice',
            '#priceblock_dealprice'
        ];

        for (const selector of priceSelectors) {
            const element = document.querySelector(selector);
            if (element && element.textContent) {
                const priceText = element.textContent.replace(/[^0-9.]/g, '');
                const parsed = parseFloat(priceText);
                if (!isNaN(parsed) && parsed > 0) {
                    price = parsed;
                    break; // Found a valid price, stop searching
                }
            }
        }

        const imageElement = document.getElementById('landingImage') as HTMLImageElement;
        const imageUrl = imageElement ? imageElement.src : '';
        console.log('Image URL:', imageUrl);

        return {
            asin,
            title,
            price,
            imageUrl
        };
    } catch (error) {
        console.error('Error scraping product details:', error);
        return null;
    }
};
