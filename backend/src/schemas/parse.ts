import { z } from 'zod';

/**
 * Zod schemas for validating AI parse responses.
 * 
 * These schemas are used to validate the shape of responses from the AI model
 * before passing them to clients. This prevents malformed or unexpected data
 * from propagating through the system.
 */

export const ParsedSegmentSchema = z.object({
  id: z.number(),
  token: z.string(),
  pinyin: z.string(),
  definition: z.string(),
});

export const TranslationPartSchema = z.object({
  text: z.string(),
  segmentIds: z.array(z.number()),
});

export const ParseResponseSchema = z.object({
  translation: z.string(),
  translationParts: z.array(TranslationPartSchema),
  segments: z.array(ParsedSegmentSchema),
});

export type ValidatedParseResponse = z.infer<typeof ParseResponseSchema>;
