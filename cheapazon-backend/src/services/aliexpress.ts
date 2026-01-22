import axios from 'axios';
import crypto from 'crypto';
import { AmazonProduct, AliExpressProduct } from '../types';
import { extractKeywords, validateProductMatch, compareProductImages } from './gemini';
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

        // --- 3-STAGE FILTERING LOOP (Optimized for Cost) ---
        let bestMatch = null;
        const candidates: any[] = [];

        // 상위 20개만 검사
        for (const item of products.slice(0, 20)) {
            const itemPrice = parseFloat(item.target_sale_price);
            const savings = numericPrice - itemPrice;

            // [Stage 1] Price Cut (가장 중요: 안 싸면 바로 버림)
            if (savings <= 0) {
                console.log(`[Filter] Not cheaper: ${item.product_title.substring(0, 30)}... (Ali: ${itemPrice} >= Amz: ${numericPrice}) \n`);
                continue; // 다음 상품으로 이동
            }


            // [Stage 1.5] Suspicious Price Check (너무 싸면 의심하고 거름)
            // 아마존 가격의 30% 미만인 경우 (즉, 70% 이상 저렴한 경우)
            if (itemPrice < numericPrice * 0.3) {
                console.log(`[Filter] Suspiciously cheap (>70% off): ${item.product_title.substring(0, 30)}... (Ali: ${itemPrice} vs Amz: ${numericPrice}) \n`);
                continue; // 케이스나 부품일 확률이 높으므로 스킵
            }

            // [Stage 2] Negative Keyword Filter (돈 안 드는 연산: 액세서리인지 확인)
            const negativeKeywords = ['case', 'cover', 'glass', 'film', 'strap', 'band', 'stand', 'holder', 'part', 'replacement', 'battery'];
            const amzLower = product.title.toLowerCase();
            const aliLower = item.product_title.toLowerCase();

            let isAccessory = false;
            for (const neg of negativeKeywords) {
                // 아마존 제목에는 없는데 알리 제목에만 'case' 등이 있으면 액세서리로 간주
                if (aliLower.includes(neg) && !amzLower.includes(neg)) {
                    isAccessory = true;
                    console.log(`[Filter] Accessory keyword '${neg}': ${item.product_title} \n \n`);
                    break;
                }
            }
            if (isAccessory) continue; // 액세서리면 스킵

            // [Stage 3] AI Semantic Check (돈 드는 연산: 최종 후보만 검사)
            // 여기까지 왔다는 건 "싸고" + "키워드상 액세서리가 아님"을 의미함
            const priceRatio = itemPrice / numericPrice;
            const isSemanticMatch = await validateProductMatch(product.title, item.product_title, priceRatio);

            if (!isSemanticMatch) {
                console.log(`[Filter] AI Rejected: ${item.product_title.substring(0, 40)}... \n\n`);
                continue; // AI가 아니라고 하면 스킵
            }

            // [Candidate] Valid candidate found
            console.log(`[Candidate] Semantic Match: ${item.product_title.substring(0, 30)}... \n\n`);
            // Store original string price to be safe, or just item
            // item is from the API response
            bestMatch = item; // Temporary assignment for referencing

            // Add to candidates list
            // We store the parsed price for savings calculation later if selected
            candidates.push({ item, price: itemPrice, savings });

            if (candidates.length >= 3) break; // Collect max 3 candidates
        }

        if (candidates.length === 0) {
            console.log('No valid match found after validation.');
            console.log('---------------------------------------------');
            return null;
        }

        // Default to first candidate
        let selectedCandidate = candidates[0];

        // [Stage 4] Image Verification (If multiple candidates & image available)
        if (candidates.length > 1 && product.imageUrl) {
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
        }
        else {
            console.log(`No image verification candidates. ${product.imageUrl}`);
            console.log(`candidates: ${JSON.stringify(candidates)}`);
            console.log('---------------------------------------------');
            console.log(`product: ${JSON.stringify(product)}`)
        }

        bestMatch = selectedCandidate.item;
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
            imageUrl: bestMatch.product_main_image_url
        };

    } catch (error) {
        console.error('Error querying AliExpress API:', error);
        return null;
    }
};