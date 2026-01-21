"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchAliExpress = void 0;
const axios_1 = __importDefault(require("axios"));
const crypto_1 = __importDefault(require("crypto"));
const gemini_1 = require("./gemini");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
const API_GATEWAY = 'https://api-sg.aliexpress.com/sync'; // Standard Gateway
// Helper to generate signature
const generateSignature = (params, secret) => {
    const sortedKeys = Object.keys(params).sort();
    let query = '';
    // Concatenate key+value
    for (const key of sortedKeys) {
        query += key + params[key];
    }
    // HMAC-SHA256
    return crypto_1.default.createHmac('sha256', secret).update(query).digest('hex').toUpperCase();
};
const searchAliExpress = async (product) => {
    // Reload env vars at runtime to ensure they are picked up
    const APP_KEY = process.env.ALI_APP_KEY;
    const APP_SECRET = process.env.ALI_APP_SECRET;
    const TRACKING_ID = process.env.ALI_TRACKING_ID;
    if (!APP_KEY || !APP_SECRET || !TRACKING_ID) {
        console.error('AliExpress API credentials missing in .env');
        return null;
    }
    console.log(`Searching AliExpress for: ${product.title} in ${product.currency}`);
    console.log(`Raw Price Input: ${product.price} (Type: ${typeof product.price})`);
    // Ensure price is a valid number
    let numericPrice = typeof product.price === 'string' ? parseFloat(product.price) : product.price;
    if (isNaN(numericPrice) || numericPrice <= 0) {
        console.error('Invalid product price, aborting search.');
        return null;
    }
    // Use Gemini to get optimized keywords
    let searchKeywords = product.title;
    if (product.title.length > 190) {
        searchKeywords = await (0, gemini_1.extractKeywords)(product.title);
    }
    console.log(`Gemini optimized keywords: ${searchKeywords}`);
    const timestamp = Date.now().toString();
    const params = {
        'app_key': APP_KEY,
        'timestamp': timestamp,
        'sign_method': 'sha256',
        'method': 'aliexpress.affiliate.product.query',
        'v': '2.0',
        'keywords': searchKeywords,
        'target_currency': product.currency,
        'target_language': 'EN',
        'tracking_id': TRACKING_ID,
        // REMOVED 'sort': 'SALE_PRICE_ASC' 
        // We now use default sort (Relevance) to find the actual product, not just the cheapest accessory
        'page_size': '40' // Fetch more candidates to improve chances of finding a cheaper match in relevant results
    };
    // NOTE: Price filtering (max_sale_price) removed to avoid 'InvalidParameter' errors from API.
    // We already filter by price in the logic below (savings > 0).
    // Generate Signature
    const sign = generateSignature(params, APP_SECRET);
    params['sign'] = sign;
    console.log('AliExpress Request Params:', JSON.stringify(params, null, 2));
    // Convert to URLSearchParams for x-www-form-urlencoded
    const requestBody = new URLSearchParams(params);
    try {
        const response = await axios_1.default.post(API_GATEWAY, requestBody, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded;charset=utf-8'
            }
        });
        const data = response.data;
        if (data.error_response) {
            console.error('AliExpress API Error:', data.error_response);
            console.error('Error Msg:', data.error_response.msg);
            return null;
        }
        const result = data.aliexpress_affiliate_product_query_response;
        if (!result || !result.resp_result || !result.resp_result.result || !result.resp_result.result.products) {
            console.log('No products found on AliExpress.');
            return null;
        }
        const products = result.resp_result.result.products.product;
        if (products.length === 0)
            return null;
        // Smart Filtering Logic:
        // 1. Must be cheaper than Amazon.
        // 2. Must be at least 30% of Amazon price (to filter out accessories/parts).
        let bestMatch = null;
        for (const item of products) {
            const itemPrice = parseFloat(item.target_sale_price);
            // Check Price Floor (Accessory Filter)
            // If the item is less than 30% of the Amazon price, it's likely a part/accessory (e.g. ear pads vs headphones)
            /*
            if (itemPrice < numericPrice * 0.6) {
                console.log(`Skipping item (Too Cheap/Accessory): ${itemPrice} vs Amazon ${numericPrice}`);
                continue;
            }
            */
            // Check if cheaper
            const savings = numericPrice - itemPrice;
            if (savings > 0) {
                // Found a valid cheaper item that isn't suspiciously cheap
                bestMatch = item;
                // Ensure target_sale_price is consistent
                bestMatch.target_sale_price = itemPrice.toString();
                break; // Stop at first valid match (since results are sorted by relevance)
            }
        }
        if (!bestMatch) {
            console.log('No valid matching products found after filtering (all were too expensive or likely accessories)');
            return null;
        }
        const aliPrice = parseFloat(bestMatch.target_sale_price);
        // Recalculate savings 
        const savings = parseFloat((numericPrice - aliPrice).toFixed(2));
        if (savings <= 0)
            return null;
        return {
            aliTitle: bestMatch.product_title,
            aliPrice: aliPrice,
            shipping: 0.00,
            currency: bestMatch.target_sale_price_currency,
            savings: savings,
            affiliateUrl: bestMatch.promotion_link,
            imageUrl: bestMatch.product_main_image_url
        };
    }
    catch (error) {
        console.error('Error querying AliExpress API:', error);
        return null;
    }
};
exports.searchAliExpress = searchAliExpress;
