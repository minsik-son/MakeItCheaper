import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars explicitly
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

// Define fallback first or use function declaration
const basicFallback = (title: string): string => {
    return title.split(' ').slice(0, 5).join(' ');
};

export const extractKeywords = async (fullTitle: string): Promise<string> => {
    // Access env var at runtime
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.warn('Gemini API Key not found. Falling back to basic extraction.');
        return basicFallback(fullTitle);
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        const prompt = `
        You are an expert e-commerce search optimizer.
        Your task is to extract the most relevant search keywords from a long Amazon product title to find the EXACT same item on AliExpress.
        
        Rules:
        1. Remove brand names if they are generic or likely custom-branded on AliExpress (e.g. "Amazon Basics"). Keep major brands (Nike, Samsung).
        2. Focus on the core model number and product type.
        3. Remove adjectives like "Premium", "High Quality".
        4. Return ONLY the keywords in 6 words or less.
        
        Amazon Title: "${fullTitle}"
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim();
        console.log(`Gemini extracted keywords: "${text}"`);
        return text;

    } catch (error) {
        console.error('Gemini Error:', error);
        return basicFallback(fullTitle);
    }
};

export const validateProductMatch = async (amazonTitle: string, aliTitle: string, priceRatio: number): Promise<boolean> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return true; // Fail open

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        const prompt = `
        You are a strict e-commerce validation bot.
        Determine if these two product titles refer to the SAME core product category and type.
        
        Context:
        - We are trying to find a cheaper alternative for the Amazon product on AliExpress.
        - The AliExpress price is ${Math.round(priceRatio * 100)}% of the Amazon price.
        
        Compare:
        1. Amazon: "${amazonTitle}"
        2. AliExpress: "${aliTitle}"
        
        Rules:
        - If one is a "Case", "Cover", "Screen Protector", "Accessory" and the other is the main device (Phone, Tablet), return NO.
        - If they are completely different items (e.g. Mouse vs Graphic Card), return NO.
        - If they are the same product (or very similar alternative), return YES.
        
        Answer (YES or NO):
        `;

        const result = await model.generateContent(prompt);
        const text = result.response.text().trim().toUpperCase();

        console.log(`AI Validation: ${text} | Amz: ${amazonTitle} vs Ali: ${aliTitle}`);

        return text.includes("YES");

    } catch (error) {
        console.error('Gemini Validation Error:', error);
        return true;
    }
};
