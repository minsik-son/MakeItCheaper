import { getTextSimilarity } from '../utils/textSimilarity';
import { getImageHash, getImageSimilarity } from '../utils/imageSimilarity';
import { getCachedImageHash } from '../utils/cache';

interface ScoringInput {
    amazonTitle: string;
    amazonImageUrl: string;
    aliTitle: string;
    aliImageUrl: string;
}

interface ScoringResult {
    finalScore: number;  // 0~100
    textSim: number;     // 0~1
    imageSim: number;    // 0~1
    decision: 'fast-pass' | 'ai-verify' | 'reject';
}

/**
 * Local Similarity Scoring (Fast-Pass Layer)
 * Determines if a candidate should be accepted immediately, verified by AI, or rejected.
 */
export async function calculateLocalScore(input: ScoringInput): Promise<ScoringResult> {
    const { amazonTitle, amazonImageUrl, aliTitle, aliImageUrl } = input;

    // 1. Text Similarity (Synchronous, CPU bound but fast)
    const textSim = getTextSimilarity(amazonTitle, aliTitle);

    // 2. Image Similarity (Async, I/O bound)
    // Retrieve from cache or download & compute
    let imageSim = 0;
    try {
        // Parallel fetch of hashes
        const [hashA, hashB] = await Promise.all([
            amazonImageUrl ? getCachedImageHash(amazonImageUrl, getImageHash) : Promise.resolve(null),
            aliImageUrl ? getCachedImageHash(aliImageUrl, getImageHash) : Promise.resolve(null)
        ]);

        imageSim = getImageSimilarity(hashA, hashB);
    } catch (error) {
        console.warn('[Scoring] Image similarity failed, falling back to text only score:', error);
        // If image fails, rely on text but penalize slightly or just use text weight?
        // For now, treat imageSim as 0, which effectively lowers the score.
    }

    // 3. Weighting & Score Calculation
    // Scheme: Text 60% + Image 40%
    // If image comparison failed (0), score will be lower, likely leading to 'ai-verify' or 'reject'
    // which is safer than passing bad matches.
    const finalScore = Math.round((textSim * 60 + imageSim * 40) * 100 * 100) / 100; // Keep 2 decimal places? No, just integer or simple float.

    // Actually, let's keep it simple: 0-100 range.
    // (0.8 * 60) + (0.9 * 40) = 48 + 36 = 84
    const weightedScore = (textSim * 60) + (imageSim * 40);
    const roundedScore = Math.round(weightedScore * 10) / 10; // e.g. 84.5

    // 4. Threshold Decision
    let decision: 'fast-pass' | 'ai-verify' | 'reject';

    // Criteria:
    // >= 88: High confidence, skip expensive AI.
    // 70 - 88: Decent match, but needs AI to verify details/semantics.
    // < 70: Poor match, reject immediately.

    if (roundedScore >= 88) {
        decision = 'fast-pass';
    } else if (roundedScore >= 70) {
        decision = 'ai-verify';
    } else {
        // Edge case: If text is extremely high (>0.9) but image failed(=0), score is 54.
        // We might want to rescue high text matches if image is missing/broken.
        // But for now, strict policy is safer to avoid bad products.
        decision = 'reject';
    }

    return {
        finalScore: roundedScore,
        textSim,
        imageSim,
        decision
    };
}
