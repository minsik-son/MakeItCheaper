import { GoogleGenerativeAI } from '@google/generative-ai';
import dotenv from 'dotenv';
import path from 'path';
import axios from 'axios';

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
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });
        //const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        /*
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
        */

        const prompt = `You are an expert AliExpress Sourcing Agent. Your goal is to find the original OEM factory version of an Amazon product on AliExpress.

        Analyze the Amazon Product Title: "${fullTitle}"

        Extraction Rules:
        1. **IGNORE PRIVATE LABELS**: Remove brands that are likely Amazon-only private labels or dropshipping brands (e.g., WOLFBOX, ANRABESS, Umite Chef). ONLY keep major global brands (e.g., Nike, Samsung, Lego, Tesla, Bicycle).
        2. **PRIORITIZE SPECS**: You MUST include key technical specifications (numbers) that define the product identity (e.g., "4000A", "160PSI", "26QT", "65L", "48 Amp").
        3. **IDENTIFY CORE ITEM**: Isolate the generic product name (e.g., "Jump Starter", "Duffle Bag", "Floor Mats").
        4. **COMPATIBILITY IS KEY**: If the item is an accessory, KEEP the "For [Model]" part (e.g., "For Tesla Model Y", "For iPhone").
        5. **REMOVE FLUFF**: Remove subjective marketing words (Premium, Gift for men, High Quality, 2025 Fall, Upgraded).
        6. **OUTPUT FORMAT**: Return a single string of 3 to 6 keywords tailored for the AliExpress search engine.

        Search Query: ${fullTitle}
        Return JSON with a single key "keywords".
        `;


        const result = await model.generateContent(prompt);

        const responseText = result.response.text();
        const jsonResponse = JSON.parse(responseText);
        const keywords = jsonResponse.keywords;
        //const text = result.response.text().trim();

        console.log(`Gemini extracted keywords: "${keywords}"`);
        return keywords;

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

async function urlToGenerativePart(url: string) {
    try {
        const response = await axios.get(url, { responseType: 'arraybuffer' });
        return {
            inlineData: {
                data: Buffer.from(response.data).toString('base64'),
                mimeType: response.headers['content-type'] || 'image/jpeg',
            },
        };
    } catch (error) {
        console.error(`Failed to download image: ${url}`);
        return null;
    }
}

export const compareProductImages = async (
    amazonImageUrl: string,
    candidates: Array<{ id: string, imageUrl: string, title: string }>
): Promise<string | null> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return candidates[0]?.id || null;

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        // Using gemini-2.0-flash-lite as it is optimized for multimodal high-volume tasks
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-lite" });

        console.log('Downloading images for comparison...');
        const amazonImagePart = await urlToGenerativePart(amazonImageUrl);

        if (!amazonImagePart) {
            console.warn('Could not download Amazon image, skipping visual check.');
            return candidates[0]?.id || null;
        }

        const candidateParts = [];
        const validCandidates = [];

        for (const cand of candidates) {
            const part = await urlToGenerativePart(cand.imageUrl);
            if (part) {
                candidateParts.push(part);
                validCandidates.push(cand);
            }
        }

        if (validCandidates.length === 0) return null;

        const prompt = `
        You are a visual product matcher.
        Target Image is the Amazon product we want.
        Candidate Images are from AliExpress.
        
        Task: Identify which Candidate Image shows the EXACT SAME product as the Target Image.
        
        Consider:
        - Shape, buttons, ports, logo placement (if visible).
        - Ignore minor color differences if the model is clearly the same.
        - Ignore watermark differences.
        
        Candidates are ordered 1 to ${validCandidates.length}.
        Return the index (1-based) of the best match.
        If none are a good match, return 0.
        
        Format: Just the number (0-${validCandidates.length}).
        `;

        // Input order: Prompt, Amazon Image, ...Candidate Images
        const result = await model.generateContent([
            prompt,
            amazonImagePart,
            ...candidateParts
        ]);

        const text = result.response.text().trim();
        const selectedIndex = parseInt(text);

        console.log(`Gemini Visual Match Result: ${text}`);
        validCandidates.forEach((candidate, index) => {
            console.log(`Candidate ${index + 1} aliexpress imageUrl: ${candidate.imageUrl}`);
        });

        if (!isNaN(selectedIndex) && selectedIndex > 0 && selectedIndex <= validCandidates.length) {
            // Index is 1-based
            return validCandidates[selectedIndex - 1].id;
        }

        return null; // None matched well enough

    } catch (error) {
        console.error('Gemini Visual Comparison Error:', error);
        return candidates[0]?.id || null; // Fallback to first
    }
};
