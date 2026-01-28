import NodeCache from 'node-cache';

/**
 * Image Hash Cache (In-Memory LRU)
 * TTL: 7 days
 */
const imageHashCache = new NodeCache({
    stdTTL: 604800,  // 7 days in seconds
    maxKeys: 10000,
    useClones: false
});

/**
 * Get cached image hash or compute and cache it
 */
export async function getCachedImageHash(
    url: string,
    hashFunction: (url: string) => Promise<string | null>
): Promise<string | null> {

    // Check cache first
    const cached = imageHashCache.get<string>(url);
    if (cached) {
        // console.log(`[Cache HIT] Image hash for ${url.substring(0, 30)}...`);
        return cached;
    }

    // Compute if missing
    const hash = await hashFunction(url);
    if (hash) {
        imageHashCache.set(url, hash);
        // console.log(`[Cache MISS] Stored hash for ${url.substring(0, 30)}...`);
    }

    return hash;
}

export function getCacheStats() {
    return {
        keys: imageHashCache.keys().length,
        hits: imageHashCache.getStats().hits,
        misses: imageHashCache.getStats().misses
    };
}
