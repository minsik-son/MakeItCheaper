import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';

// Load env vars explicitly
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

export const extractKeywords = async (fullTitle: string): Promise<string> => {
    // Access env var at runtime
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
        console.warn('Gemini API Key not found in process.env. Falling back to basic keyword extraction.');
        console.log('Current Env Keys:', Object.keys(process.env).filter(k => k.includes('GEMINI')));
        return basicFallback(fullTitle);
    }

    try {
        const genAI = new GoogleGenerativeAI(apiKey);

        const model = genAI.getGenerativeModel({ model: "gemini-flash-lite-latest" });

        const prompt = `
        You are an expert e-commerce search optimizer.
        Your task is to extract the most relevant search keywords from a long Amazon product title to find the EXACT same item on AliExpress.
        
        Rules:
        1. Remove brand names if they are generic or likely custom-branded on AliExpress (e.g. "Amazon Basics", random caps brands). Keep major brands (Nike, Samsung, etc).
        2. Focus on the core model number and product type.
        3. Remove adjectives like "Premium", "High Quality", "2024 New".
        4. Remove quantity counts if it confuses the search (e.g. "2 packs"), but keep if essential.
        5. Return ONLY the keywords in a single line string. No explanations.
        6. Keyword should be less than 7 words.
        
        Amazon Title: "${fullTitle}"
        
        Keywords:
        `;

        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();

        const cleanedKeywords = text.trim();
        console.log(`Gemini extracted keywords: "${cleanedKeywords}" from "${fullTitle}"`);

        return cleanedKeywords;

    } catch (error) {
        console.error('Error with Gemini API:', error);
        return basicFallback(fullTitle);
    }
};

const basicFallback = (title: string): string => {
    // Fallback: Take first 5 words
    return title.split(' ').slice(0, 5).join(' ');
};
