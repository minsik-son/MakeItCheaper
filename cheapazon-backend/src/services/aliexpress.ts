import axios from 'axios';
import crypto from 'crypto';
import { AmazonProduct, AliExpressProduct } from '../types';
import { extractKeywords, validateProductMatch, compareProductImages } from './gemini';
import { calculateLocalScore, calculateTextScore, calculateImageScore } from './scoring';
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

        // Store response data for logging
        const data = response.data;

        // --- API Response Logging Start ---
        console.log("==== AliExpress Raw Search Results ====");
        const rawProducts = data.aliexpress_affiliate_product_query_response?.resp_result?.result?.products?.product;
        if (rawProducts) {
            console.log(`Total items received: ${rawProducts.length}`);
            rawProducts.forEach((p: any, i: number) => {
                console.log(`[${i + 1}] ID: ${p.product_id} | Title: ${p.product_title} | Price: ${p.target_sale_price}`);
            });
        } else {
            console.log("No products found in the raw API response.");
        }
        console.log("========================================");
        // --- API Response Logging End ---

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
        'page_size': '40' // Fetch a generous amount to filter further in subsequent stages
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

        const rejections: { title: string, price: number, reason: string }[] = [];
        const preCandidates = [];
        for (const item of products.slice(0, 40)) {
            const itemPrice = parseFloat(item.target_sale_price);
            const savings = numericPrice - itemPrice;

            // Price Cut Filter
            if (savings <= 0) {
                rejections.push({ title: item.product_title, price: itemPrice, reason: `Price too high (${itemPrice} vs Amazon ${numericPrice})` });
                continue;
            }

            // Suspiciously Cheap Filter
            if (itemPrice < numericPrice * 0.3) {
                rejections.push({ title: item.product_title, price: itemPrice, reason: `Suspiciously cheap (${itemPrice} < 30% of ${numericPrice})` });
                continue;
            }

            // Negative Keyword Filter
            const negativeKeywords = ['case', 'cover', 'glass', 'film', 'strap', 'band', 'stand', 'holder', 'part', 'replacement', 'battery'];
            const amzLower = product.title.toLowerCase();
            const aliLower = item.product_title.toLowerCase();
            let isAccessory = false;
            let caughtNeg = '';
            for (const neg of negativeKeywords) {
                if (aliLower.includes(neg) && !amzLower.includes(neg)) {
                    isAccessory = true;
                    caughtNeg = neg;
                    break;
                }
            }
            if (isAccessory) {
                rejections.push({ title: item.product_title, price: itemPrice, reason: `Accessory filter (${caughtNeg})` });
                continue;
            }

            // If it passes all cheap filters, add to pre-candidates
            preCandidates.push({ item, price: itemPrice, savings });
        }

        // New Stage 3: Two-Stage Waterfall Matching Logic
        console.log(`[Stage 3] Waterfall Matching for ${preCandidates.length} potential candidates...`);

        // Step A: Text Similarity Filter (>= 0.55)
        const textFilteredCandidates = [];
        const THRESHOLD = 0.55;

        for (const candidate of preCandidates) {
            const textScore = calculateTextScore(searchKeywords, candidate.item.product_title);

            if (textScore >= THRESHOLD) {
                textFilteredCandidates.push({
                    ...candidate,
                    textScore
                });
                console.log(`[Text Pass] Score: ${textScore.toFixed(2)} | ${candidate.item.product_title.substring(0, 40)}...`);
            } else {
                rejections.push({
                    title: candidate.item.product_title,
                    price: candidate.price,
                    reason: `Low Text similarity (${textScore.toFixed(2)} < ${THRESHOLD})`
                });
                console.log(`[Text Reject] Score: ${textScore.toFixed(2)} | ${candidate.item.product_title}\n`);
            }
        }

        if (textFilteredCandidates.length === 0) {
            console.log(`No candidates passed Text Similarity filter (>= ${THRESHOLD}).`);
            console.log('--- Full Rejection List ---');
            rejections.forEach((r, i) => {
                console.log(`${i + 1}. [${r.reason}] ${r.title} (${r.price})`);
            });
            return null;
        }

        console.log(`[Stage 3.5] Calculating Image Similarity for ${textFilteredCandidates.length} survivors...`);

        // Step B: Image Similarity Ranking
        // Calculate image scores in parallel
        const scoredCandidates = await Promise.all(textFilteredCandidates.map(async (candidate) => {
            const imageScore = await calculateImageScore(
                product.imageUrl || '',
                candidate.item.product_main_image_url
            );
            return {
                ...candidate,
                imageScore
            };
        }));

        // Step C: Sort & Select
        // Sort by Image Similarity (Descending). If Image Score is similar or 0, use Text Score as tie breaker.
        scoredCandidates.sort((a, b) => {
            // If both have valid image scores, prioritize image score
            if (a.imageScore > 0 || b.imageScore > 0) {
                // Sort descending
                if (b.imageScore !== a.imageScore) {
                    return b.imageScore - a.imageScore;
                }
            }
            // Tie-breaker or fallback: Text Score
            return b.textScore - a.textScore;
        });

        // Log the ranking
        scoredCandidates.forEach((c, idx) => {
            console.log(`#${idx + 1} Image: ${c.imageScore.toFixed(2)} | Text: ${c.textScore.toFixed(2)} | ${c.item.product_title.substring(0, 30)}...`);
        });

        // Select the top candidate
        const bestCandidate = scoredCandidates[0];

        if (!bestCandidate) {
            console.log('No best candidate found after ranking.');
            return null;
        }

        console.log(`[Selected] Image: ${bestCandidate.imageScore.toFixed(2)} (Text: ${bestCandidate.textScore.toFixed(2)}) - ${bestCandidate.item.product_title}`);

        const bestMatch = bestCandidate.item;
        const finalSavings = bestCandidate.savings;
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