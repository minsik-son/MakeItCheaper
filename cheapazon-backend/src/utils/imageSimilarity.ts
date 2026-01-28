import sharp from 'sharp';
import axios from 'axios';

/**
 * Calculate Perceptual Hash (64-bit) for an image URL
 * Returns a 16-character hex string or null if failed
 */
export async function getImageHash(imageUrl: string): Promise<string | null> {
    try {
        // 1. Download image with timeout
        const response = await axios.get(imageUrl, {
            responseType: 'arraybuffer',
            timeout: 5000,
            headers: { 'User-Agent': 'Mozilla/5.0' }
        });

        // 2. Process with Sharp: 8x8 resize, grayscale, raw pixel data
        const buffer = await sharp(response.data)
            .resize(8, 8, { fit: 'fill', kernel: 'nearest' })
            .greyscale()
            .raw()
            .toBuffer();

        // 3. Calculate average pixel value
        const pixels = Array.from(buffer);
        const avg = pixels.reduce((a, b) => a + b, 0) / pixels.length;

        // 4. Generate hash bits (1 if >= avg, else 0)
        const bits = pixels.map(p => (p >= avg ? '1' : '0')).join('');

        // 5. Convert to Hex
        const hash = BigInt('0b' + bits).toString(16).padStart(16, '0');

        return hash;

    } catch (error) {
        if (axios.isAxiosError(error)) {
            console.warn(`[ImageHash] Network error for ${imageUrl}: ${error.message}`);
        } else {
            console.warn(`[ImageHash] Processing error for ${imageUrl}:`, error);
        }
        return null;
    }
}

/**
 * Calculate similarity between two image hashes using Hamming Distance
 * Returns score from 0 to 1
 */
export function getImageSimilarity(hashA: string | null, hashB: string | null): number {
    if (!hashA || !hashB) return 0;

    try {
        // Convert Hex to Binary String padded to 64 bits
        const binA = BigInt('0x' + hashA).toString(2).padStart(64, '0');
        const binB = BigInt('0x' + hashB).toString(2).padStart(64, '0');

        // Calculate Hamming Distance
        let distance = 0;
        for (let i = 0; i < 64; i++) {
            if (binA[i] !== binB[i]) distance++;
        }

        // Normalize to 0-1 range (0 distance = 1.0 similarity)
        return Math.max(0, 1 - (distance / 64));
    } catch (e) {
        console.warn('[ImageSimilarity] Error comparing hashes:', e);
        return 0;
    }
}
