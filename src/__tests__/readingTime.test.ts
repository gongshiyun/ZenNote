import { describe, it, expect } from 'vitest';
import { estimateReadingTime, computeWordCount } from '../domain/document';

describe('estimateReadingTime', () => {
  it('returns 0 for empty content', () => {
    expect(estimateReadingTime('')).toBe(0);
    expect(estimateReadingTime('   \n  ')).toBe(0);
  });

  it('returns at least 1 minute for non-empty content', () => {
    expect(estimateReadingTime('你好')).toBe(1);
    expect(estimateReadingTime('hello')).toBe(1);
  });

  it('scales with word count (~400 words per minute)', () => {
    // 800 Chinese chars -> 2 minutes
    expect(estimateReadingTime('字'.repeat(800))).toBe(2);
    // 401 english words -> 2 minutes
    expect(estimateReadingTime(Array(401).fill('word').join(' '))).toBe(2);
    // 1200 english words -> 3 minutes
    expect(estimateReadingTime(Array(1200).fill('word').join(' '))).toBe(3);
  });
});

describe('computeWordCount (regression guard)', () => {
  it('counts Chinese characters individually and english words by whitespace', () => {
    const wc = computeWordCount('你好 world foo');
    expect(wc.chineseChars).toBe(2);
    expect(wc.englishWords).toBe(2);
    expect(wc.totalWords).toBe(4);
    expect(wc.lineCount).toBe(1);
  });
});
