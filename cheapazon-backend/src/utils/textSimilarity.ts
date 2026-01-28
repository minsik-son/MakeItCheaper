import { distance } from 'fastest-levenshtein';

/**
 * Global Brand List (Curated top 50)
 * Only major brands that might be mentioned in OEM product titles
 */
const GLOBAL_BRANDS = [
    'Samsung', 'Apple', 'Sony', 'LG', 'Dell', 'HP', 'Lenovo', 'Asus',
    'Acer', 'Microsoft', 'Google', 'Nike', 'Adidas', 'Canon', 'Nikon',
    'Panasonic', 'Philips', 'Bosch', 'Tesla', 'Xiaomi', 'Huawei', 'OnePlus',
    'Logitech', 'Razer', 'Corsair', 'SteelSeries', 'Bose', 'JBL', 'Beats',
    'GoPro', 'DJI', 'Anker', 'Aukey', 'RAVPower', 'Belkin', 'TP-Link',
    'Netgear', 'Seagate', 'Western Digital', 'SanDisk', 'Kingston', 'Crucial',
    'Intel', 'AMD', 'NVIDIA', 'Gigabyte', 'MSI', 'EVGA', 'Roku', 'Fitbit'
];

/**
 * Clean and normalize product titles for comparison
 */
export function cleanTitle(title: string): string {
    let cleaned = title.toLowerCase();

    // 1. Remove marketing keywords
    const marketingWords = [
        'hot sale', 'limited', 'new arrival', 'free shipping', 'best seller',
        'amazon\'s choice', 'premium', 'upgraded', 'professional', 'high quality',
        'gift for', '2024', '2025', '2026', 'pack of', 'set of'
    ];

    for (const word of marketingWords) {
        cleaned = cleaned.replace(new RegExp(word, 'gi'), ' ');
    }

    // 2. Remove special characters but keep numbers and units
    cleaned = cleaned.replace(/[^\w\s\-]/g, ' ');

    // 3. Normalize brand names
    for (const brand of GLOBAL_BRANDS) {
        const regex = new RegExp(`\\b${brand}\\b`, 'gi');
        cleaned = cleaned.replace(regex, brand.toLowerCase());
    }

    // 4. Normalize whitespace
    cleaned = cleaned.replace(/\s+/g, ' ').trim();

    return cleaned;
}

/**
 * Calculate text similarity score (0 to 1)
 * Combines Levenshtein distance (30%) and Token Overlap (70%)
 */
export function getTextSimilarity(titleA: string, titleB: string): number {
    const cleanA = cleanTitle(titleA);
    const cleanB = cleanTitle(titleB);

    if (!cleanA || !cleanB) return 0;

    // Method 1: Levenshtein Distance
    const maxLen = Math.max(cleanA.length, cleanB.length);
    const distanceVal = distance(cleanA, cleanB);
    const levenScore = maxLen > 0 ? 1 - (distanceVal / maxLen) : 0;

    // Method 2: Token Overlap (Set Intersection)
    const tokensA = new Set(cleanA.split(/\s+/).filter(w => w.length > 2));
    const tokensB = new Set(cleanB.split(/\s+/).filter(w => w.length > 2));

    let intersection = 0;
    tokensA.forEach(token => {
        if (tokensB.has(token)) intersection++;
    });

    const union = new Set([...tokensA, ...tokensB]).size;
    const tokenScore = union > 0 ? intersection / union : 0;

    // Weighted Average (Tokens are more important as word order matters less)
    return levenScore * 0.3 + tokenScore * 0.7;
}
