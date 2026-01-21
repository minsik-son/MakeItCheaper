export interface AmazonProduct {
    asin: string;
    title: string;
    price: number;
    currency: 'USD' | 'CAD';
    domain: 'amazon.com' | 'amazon.ca';
}

export interface AliExpressProduct {
    aliTitle: string;
    aliPrice: number;
    shipping: number;
    currency: 'USD' | 'CAD';
    savings: number;
    affiliateUrl: string;
    imageUrl: string;
}

export interface ComparisonResponse {
    found: boolean;
    match?: AliExpressProduct;
}
