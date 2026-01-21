export interface ComparisonResponse {
    found: boolean;
    match?: {
        aliTitle: string;
        aliPrice: number;
        shipping: number;
        currency: 'USD' | 'CAD';
        savings: number;
        affiliateUrl: string;
        imageUrl: string;
    };
}

export const comparePrice = async (
    asin: string,
    title: string,
    price: number,
    currency: 'USD' | 'CAD',
    domain: string
): Promise<ComparisonResponse | null> => {
    try {
        const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3000';

        // Determine domain from currency/hostname if strict strict domain isn't passed or pass as is
        // In our scraper we extract domain or currency.
        // The previous design: backend receives domain: amazon.com | amazon.ca.

        const payload = {
            asin,
            title,
            price,
            currency,
            domain: domain.includes('ca') ? 'amazon.ca' : 'amazon.com'
        };

        const response = await fetch(`${API_BASE_URL}/api/compare`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }

        const data: ComparisonResponse = await response.json();
        return data;
    } catch (error) {
        console.error('Error comparing prices:', error);
        return null;
    }
};
