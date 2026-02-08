import { describe, it, expect } from 'vitest';
import { cleanTitle } from './scraper';

describe('cleanTitle', () => {
    it('should clean English titles by removing special characters', () => {
        const input = 'Samsung Galaxy S24 Ultra (Titanium Gray) - 512GB';
        const expected = 'Samsung Galaxy S24 Ultra Titanium Gray - 512GB';
        // Note: The regex /[^\p{L}\p{N}\s\-]/gu allows letters, numbers, spaces, and hyphens. 
        // Parentheses () are NOT allowed, so they should be removed.
        expect(cleanTitle(input)).toBe(expected);
    });

    it('should preserve Korean characters', () => {
        const input = '[삼성전자] 갤럭시 S24 울트라 256GB';
        const expected = '삼성전자 갤럭시 S24 울트라 256GB'; // Brackets [] removed
        expect(cleanTitle(input)).toBe(expected);
    });

    it('should preserve Japanese characters', () => {
        const input = 'ソニー ワイヤレスノイズキャンセリングイヤホン WF-1000XM4';
        const expected = 'ソニー ワイヤレスノイズキャンセリングイヤホン WF-1000XM4';
        expect(cleanTitle(input)).toBe(expected);
    });

    it('should preserve Chinese characters', () => {
        const input = 'Apple iPhone 15 Pro Max (256 GB) - 原色钛金属';
        const expected = 'Apple iPhone 15 Pro Max 256 GB - 原色钛金属'; // Parentheses removed
        expect(cleanTitle(input)).toBe(expected);
    });

    it('should remove "New", "2025", "Latest Model" keywords', () => {
        const input = 'New Apple iPhone 15 2025 Latest Model';
        const expected = 'Apple iPhone 15';
        expect(cleanTitle(input)).toBe(expected);
    });

    it('should handle mixed content and excessive spaces', () => {
        const input = '  Samsung   Galaxy   !!!   S24   ';
        const expected = 'Samsung Galaxy S24';
        expect(cleanTitle(input)).toBe(expected);
    });

    it('should preserve hyphens', () => {
        const input = 'USB-C Cable - 6ft';
        const expected = 'USB-C Cable - 6ft';
        expect(cleanTitle(input)).toBe(expected);
    });
});
