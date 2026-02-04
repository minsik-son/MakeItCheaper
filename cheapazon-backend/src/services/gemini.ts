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

        const prompt = `You are an expert AliExpress Sourcing Agent specializing in identifying OEM factory products.
        Your goal is to transform a cluttered Amazon title into a high-converting AliExpress search query.

        Amazon Product Title: "${fullTitle}"

        ### STRICT EXTRACTION RULES:

        1. **BRAND & MODEL PURGE**: 
        - Remove ALL brand names and specific model numbers UNLESS they are globally recognized Tier-1 brands (e.g., Apple, Samsung, Sony, Nike, Tesla).
        - Specifically delete "private labels," "dropshipping brands," and "obscure alphanumeric model codes" (e.g., Delete "eufy", "Omni C20", "WOLFBOX", "A1234").

        2. **ESSENTIAL PRODUCT NOUNS**: 
        - Extract the core, generic descriptive nouns that define the object (e.g., "Robot Vacuum", "Mop Combo", "Self Emptying").
        - Use common industry terms that an OEM factory would use in their listing.

        3. **CRITICAL TECHNICAL SPECS**: 
        - Keep the performance numbers that distinguish the hardware (e.g., "7000Pa", "3.35-Inch", "160PSI").
        - Specs are often the only way to find the exact same factory model on AliExpress.

        4. **ACCESSORY COMPATIBILITY**: 
        - If the item is an accessory, keep the target device name (e.g., "For Tesla Model Y", "For iPhone 15").

        5. **CLEANING & RANKING**: 
        - Remove marketing "fluff" (Premium, Upgraded, Hands-free, 2026 New).
        - Arrange keywords by importance: [Core Item] + [Key Spec] + [Defining Feature].

        ### OUTPUT INSTRUCTION:
        - Return a JSON object with a single key "keywords".
        - The value must be a string of 3 to 6 optimized keywords.

        Example Input: "eufy Robot Vacuum Omni C20, 7000 Pa, Self Emptying"
        Example Output: {"keywords": "Robot Vacuum Mop Combo 7000Pa Self Emptying"}

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


export const validateProductMatch = async (amazonTitle: string, aliTitle: string, priceRatio: number): Promise<{ isMatch: boolean; confidence: number }> => {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) return { isMatch: true, confidence: 50 };

    try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({
            model: "gemini-2.0-flash-lite",
            generationConfig: { responseMimeType: "application/json" }
        });

        // Update prompt: Remove unnecessary descriptions and clarify JSON schema
        const prompt = `
        You are a strict e-commerce validation bot.
        Determine if these two product titles refer to the SAME core product category and type.
        
        Compare:
        1. Amazon: "${amazonTitle}"
        2. AliExpress: "${aliTitle}"
        
        Context: The AliExpress price is ${Math.round(priceRatio * 100)}% of the Amazon price.
        
        Rules:
        - If they are completely different items, confidence must be 0.
        - If one is an accessory (case, part) and the other is the main unit, confidence must be 0.
        - If they are the same product type, confidence > 80.
        
        Respond with this JSON structure ONLY:
        {
            "match": boolean,
            "confidence": number,
            "reason": string
        }
        `;

        const result = await model.generateContent(prompt);
        let text = result.response.text();

        // Safety: Remove markdown code blocks and trim whitespace
        text = text.replace(/```json|```/g, '').trim();

        console.log(`[DEBUG] Gemini Raw Response: ${text}`); // Debug log to verify actual response

        let json;
        try {
            json = JSON.parse(text);
        } catch (e) {
            console.error("JSON Parse Error. Raw text:", text);
            return { isMatch: false, confidence: 0 };
        }

        // Handle key case sensitivity (AI sometimes returns uppercase keys)
        const isMatchRaw = json.match ?? json.Match ?? false;
        const confidenceRaw = json.confidence ?? json.Confidence ?? 0;

        console.log(`AI Validation: ${isMatchRaw} (${confidenceRaw}%) | Amz: ${amazonTitle.substring(0, 20)}... vs Ali: ${aliTitle.substring(0, 20)}...`);

        return {
            isMatch: isMatchRaw === true || String(isMatchRaw).toLowerCase() === 'true' || String(isMatchRaw).toUpperCase() === 'YES',
            confidence: Number(confidenceRaw) || 0
        };

    } catch (error) {
        console.error('Gemini Validation Error:', error);
        return { isMatch: true, confidence: 50 }; // Default value on error
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
