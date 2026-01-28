import axios from 'axios';
import crypto from 'crypto';
import { AmazonProduct, AliExpressProduct } from '../types';
import { extractKeywords, validateProductMatch, compareProductImages } from './gemini';
import { calculateLocalScore } from './scoring';
import dotenv from 'dotenv';
dotenv.config();

const API_GATEWAY = 'https://api-sg.aliexpress.com/sync';

const generateSignature = (params: Record<string, string>, secret: string) => {
    const sortedKeys = Object.keys(params).sort();
    let query = '';
    for (const key of sortedKeys) {
        query += key + params[key];
    }
    return crypto.createHmac('sha256', secret).update(query).digest('hex').toUpperCase();
};

export const getAliExpressProductDetails = async (aliProductId: string, currency: string): Promise<AliExpressProduct | null> => {
    const APP_KEY = process.env.ALI_APP_KEY;
    const APP_SECRET = process.env.ALI_APP_SECRET;
    const TRACKING_ID = process.env.ALI_TRACKING_ID;

    if (!APP_KEY || !APP_SECRET || !TRACKING_ID) return null;

    const timestamp = Date.now().toString();
    const params: Record<string, string> = {
        'app_key': APP_KEY,
        'timestamp': timestamp,
        'sign_method': 'sha256',
        'method': 'aliexpress.affiliate.product.detail.get',
        'v': '2.0',
        'product_ids': aliProductId,
        'target_currency': currency,
        'target_language': 'EN',
        'tracking_id': TRACKING_ID
    };

    const sign = generateSignature(params, APP_SECRET);
    params['sign'] = sign;

    try {
        const response = await axios.post(API_GATEWAY, new URLSearchParams(params), {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
        });

        const result = response.data.aliexpress_affiliate_product_detail_get_response;
        if (!result || !result.resp_result || !result.resp_result.result || !result.resp_result.result.products) {
            return null;
        }

        const product = result.resp_result.result.products.product[0];
        if (!product) return null;

        return {
            aliTitle: product.product_title,
            aliPrice: parseFloat(product.target_sale_price),
            shipping: 0,
            currency: product.target_sale_price_currency as 'USD' | 'CAD',
            savings: 0, // Calculated by caller
            affiliateUrl: product.promotion_link,
            imageUrl: product.product_main_image_url,
            aliProductId: product.product_id
        };
    } catch (error) {
        console.error('Error fetching AliExpress details:', error);
        return null;
    }
};

export const searchAliExpress = async (product: AmazonProduct): Promise<AliExpressProduct | null> => {
    const APP_KEY = process.env.ALI_APP_KEY;
    const APP_SECRET = process.env.ALI_APP_SECRET;
    const TRACKING_ID = process.env.ALI_TRACKING_ID;

    if (!APP_KEY || !APP_SECRET || !TRACKING_ID) {
        console.error('AliExpress API credentials missing in .env');
        return null;
    }

    console.log(`Searching AliExpress for: ${product.title} in ${product.currency}`);

    let numericPrice = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
    if (isNaN(numericPrice) || numericPrice <= 0) {
        console.error('Invalid product price, aborting search.');
        return null;
    }

    // Use Gemini to get optimized keywords
    let searchKeywords = product.title;
    if (product.title.length > 50) {
        searchKeywords = await extractKeywords(product.title);
    } else {
        console.log(`Title short enough, using original: ${searchKeywords}`);
    }

    const timestamp = Date.now().toString();

    const params: Record<string, string> = {
        'app_key': APP_KEY,
        'timestamp': timestamp,
        'sign_method': 'sha256',
        'method': 'aliexpress.affiliate.product.query',
        'v': '2.0',
        'keywords': searchKeywords,
        'target_currency': product.currency,
        'target_language': 'EN',
        'tracking_id': TRACKING_ID,
        'page_size': '40' // 넉넉하게 가져와서 앞에서부터 거름
    };

    const sign = generateSignature(params, APP_SECRET);
    params['sign'] = sign;

    const requestBody = new URLSearchParams(params);

    try {
        const response = await axios.post(API_GATEWAY, requestBody, {
            headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8' }
        });

        const data = response.data;
        if (data.error_response) {
            console.error('AliExpress API Error:', data.error_response);
            return null;
        }

        const result = data.aliexpress_affiliate_product_query_response;
        if (!result || !result.resp_result || !result.resp_result.result || !result.resp_result.result.products) {
            console.log('No products found on AliExpress.');
            return null;
        }

        const products = result.resp_result.result.products.product;
        if (products.length === 0) return null;

        // --- 3-STAGE FILTERING LOOP (Optimized for Cost & Speed) ---

        // Stage 1 & 2: Collect potential candidates with cheap filters first
        const preCandidates = [];
        for (const item of products.slice(0, 20)) {
            const itemPrice = parseFloat(item.target_sale_price);
            const savings = numericPrice - itemPrice;

            // Price Cut Filter
            if (savings <= 0) continue;

            // Suspiciously Cheap Filter
            if (itemPrice < numericPrice * 0.3) continue;

            // Negative Keyword Filter
            const negativeKeywords = ['case', 'cover', 'glass', 'film', 'strap', 'band', 'stand', 'holder', 'part', 'replacement', 'battery'];
            const amzLower = product.title.toLowerCase();
            const aliLower = item.product_title.toLowerCase();
            let isAccessory = false;
            for (const neg of negativeKeywords) {
                if (aliLower.includes(neg) && !amzLower.includes(neg)) {
                    isAccessory = true;
                    break;
                }
            }
            if (isAccessory) continue;

            // If it passes all cheap filters, add to pre-candidates for expensive AI check
            preCandidates.push({ item, price: itemPrice, savings });
        }

        // Stage 3: AI Semantic Check in Parallel (with Fast-Pass)
        const candidates = [];
        let highConfidenceMatch = null;

        if (preCandidates.length > 0) {
            console.log(`[Stage 2.5] Running Fast-Pass scoring for ${preCandidates.length} candidates...`);

            // 1. Run Local Scoring on all pre-candidates
            const scoringPromises = preCandidates.map(p =>
                calculateLocalScore({
                    amazonTitle: product.title,
                    amazonImageUrl: product.imageUrl || '',
                    aliTitle: p.item.product_title,
                    aliImageUrl: p.item.product_main_image_url
                })
            );

            const scoringResults = await Promise.all(scoringPromises);

            const fastPassCandidates = [];
            const aiVerifyCandidates = [];

            // 2. Sort candidates into buckets based on score
            for (let i = 0; i < preCandidates.length; i++) {
                const scoring = scoringResults[i];
                const preCandidate = preCandidates[i];

                if (scoring.decision === 'fast-pass') {
                    // >= 88: High confidence, skip AI
                    fastPassCandidates.push({
                        ...preCandidate,
                        confidence: Math.round(scoring.finalScore),
                        fastPass: true
                    });
                    console.log(`[Fast-Pass ✓] Score ${scoring.finalScore.toFixed(1)} | ${preCandidate.item.product_title.substring(0, 40)}...`);
                } else if (scoring.decision === 'ai-verify') {
                    // 70 <= Score < 88: Needs AI verification
                    aiVerifyCandidates.push(preCandidate);
                } else {
                    // < 70: Reject
                    console.log(`[Reject X] Score ${scoring.finalScore.toFixed(1)} | ${preCandidate.item.product_title}`);
                }
            }

            // 3. Process Fast-Pass Matches (Immediate Success)
            if (fastPassCandidates.length > 0) {
                // Determine savings for reporting?
                console.log(`[SUCCESS] ${fastPassCandidates.length} Fast-Pass matches found. AI calls saved: ${aiVerifyCandidates.length}`);

                // Sort by score descending
                fastPassCandidates.sort((a, b) => b.confidence - a.confidence);

                candidates.push(...fastPassCandidates.slice(0, 3));
                highConfidenceMatch = fastPassCandidates[0];
            }

            // 4. Process AI-Verify Matches (Only if needed)
            // If we have a high confidence match from Fast-Pass, we might skip this.
            // But usually, we might want to check if AI finds something *better*? 
            // The prompt says "88점 이상 → AI 검증 완전 스킵", so we skip if we have ANY fast-pass match?
            // "Fast-Pass 매치가 있으면 즉시 반환 (AI 호출 완전 스킵)" -> Yes, skip AI calls entirely if fast-pass found.

            if (!highConfidenceMatch && aiVerifyCandidates.length > 0) {
                console.log(`[Stage 3] Running AI validation for ${aiVerifyCandidates.length} candidates...`);

                const validationPromises = aiVerifyCandidates.map(p => {
                    const priceRatio = p.price / numericPrice;
                    return validateProductMatch(product.title, p.item.product_title, priceRatio);
                });

                const validationResults = await Promise.all(validationPromises);

                for (let i = 0; i < aiVerifyCandidates.length; i++) {
                    const { isMatch, confidence } = validationResults[i];

                    if (isMatch && confidence > 70) {
                        const candidate = { ...aiVerifyCandidates[i], confidence, fastPass: false };

                        if (confidence >= 90 && !highConfidenceMatch) {
                            console.log(`[AI High Confidence] ${confidence}%: ${candidate.item.product_title.substring(0, 30)}...`);
                            highConfidenceMatch = candidate;
                        }

                        console.log(`[AI Verified ✓] ${confidence}%: ${candidate.item.product_title.substring(0, 30)}...`);
                        candidates.push(candidate);
                        if (candidates.length >= 3 && !highConfidenceMatch) break;
                    } else {
                        console.log(`[AI Rejected ✗] ${confidence}%: ${aiVerifyCandidates[i].item.product_title.substring(0, 40)}...`);
                    }
                }
            }
        }

        if (candidates.length === 0) {
            console.log('No valid match found after validation.');
            return null;
        }

        // Default to first candidate or high confidence match
        let selectedCandidate = highConfidenceMatch || candidates[0];

        // [Stage 4] Image Verification (If multiple candidates & image available & NO high confidence match)
        if (!highConfidenceMatch && candidates.length > 1 && product.imageUrl) {
            console.log(`Comparing images for ${candidates.length} candidates...`);
            const candidatesForGemini = candidates.map(c => ({
                id: c.item.product_id,
                imageUrl: c.item.product_main_image_url,
                title: c.item.product_title
            }));

            const bestId = await compareProductImages(product.imageUrl, candidatesForGemini);
            if (bestId) {
                const found = candidates.find(c => c.item.product_id === bestId);
                if (found) {
                    selectedCandidate = found;
                    console.log(`[Image] Gemini preferred: ${selectedCandidate.item.product_title.substring(0, 30)}...`);
                }
            }
        } else if (highConfidenceMatch) {
            console.log(`[Stage 4] Skipped Image Verification due to high confidence match.`);
        }
        else {
            console.log(`No image verification candidates. ${product.imageUrl}`);
            console.log(`candidates: ${JSON.stringify(candidates)}`);
            console.log('---------------------------------------------');
            console.log(`product: ${JSON.stringify(product)}`)
        }

        const bestMatch = selectedCandidate.item;
        const finalSavings = selectedCandidate.savings; // Use pre-calculated savings

        if (!bestMatch) {
            console.log('No valid match found after validation.');
            console.log('---------------------------------------------');
            return null;
        }

        const aliPrice = parseFloat(bestMatch.target_sale_price);

        return {
            aliTitle: bestMatch.product_title,
            aliPrice: aliPrice,
            shipping: 0.00,
            currency: bestMatch.target_sale_price_currency,
            savings: finalSavings,
            affiliateUrl: bestMatch.promotion_link,
            imageUrl: bestMatch.product_main_image_url,
            aliProductId: bestMatch.product_id
        };

    } catch (error) {
        console.error('Error querying AliExpress API:', error);
        return null;
    }
};