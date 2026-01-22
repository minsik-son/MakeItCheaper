export interface ProductDetails {
    asin: string;
    title: string;
    price: number;
    imageUrl: string;
}

export const cleanTitle = (title: string): string => {
    return title
        .replace(/New|2025|Latest Model/gi, '')
        .replace(/[^\w\s]/gi, ' ')
        .trim()
        .replace(/\s+/g, ' ');
};

export const getProductDetails = (): ProductDetails | null => {
    try {
        // const asinMatch = window.location.pathname.match(/\/dp\/([A-Z0-9]{10})/);
        const asinMatch = window.location.pathname.match(/(?:\/dp\/|\/gp\/aw\/d\/|\/product\/)([A-Z0-9]{10})/);
        const asin = asinMatch ? asinMatch[1] : '';

        if (!asin) return null;

        const titleElement = document.getElementById('productTitle');
        const title = titleElement ? cleanTitle(titleElement.innerText) : '';

        // Price extraction is tricky on Amazon as there are multiple selectors
        // Common selectors: .a-price .a-offscreen, #priceblock_ourprice
        let price = 0;
        const priceElement = document.querySelector('.a-price .a-offscreen');
        if (priceElement && priceElement.textContent) {
            const priceText = priceElement.textContent.replace(/[^0-9.]/g, '');
            price = parseFloat(priceText);
        }

        const imageElement = document.getElementById('landingImage') as HTMLImageElement;
        const imageUrl = imageElement ? imageElement.src : '';

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
