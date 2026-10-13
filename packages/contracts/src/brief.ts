import { z } from 'zod';
import {
  IdSchema,
  IsoDateTimeSchema,
  LanguageTagSchema,
  PlatformSchema,
  SchemaVersionSchema,
} from './common.ts';

/** Facebook Reels accept 3-90 s, the tightest limit of the four platforms. */
export const MAX_VIDEO_SECONDS = 90;
export const MIN_VIDEO_SECONDS = 15;

/** What the creator asks for. Written by the intake form, read by script-studio. */
export const BriefSchema = z.object({
  schemaVersion: SchemaVersionSchema,
  briefId: IdSchema,
  createdAt: IsoDateTimeSchema,
  prompt: z.string().min(10).max(4000),
  niche: z.string().min(2).max(120),
  audience: z.string().min(2).max(240),
  language: LanguageTagSchema,
  tone: z.string().min(2).max(120),
  targetPlatforms: z
    .array(PlatformSchema)
    .min(1)
    .refine((platforms) => new Set(platforms).size === platforms.length, {
      message: 'each platform may appear only once',
    }),
  durationSeconds: z.number().int().min(MIN_VIDEO_SECONDS).max(MAX_VIDEO_SECONDS),
  callToAction: z.string().max(240).optional(),
  brandStyle: z.string().max(600).optional(),
  /** Drives the AI-disclosure default and the impersonation checks at the script gate. */
  realisticPersonOrVoice: z.boolean(),
});
export type Brief = z.infer<typeof BriefSchema>;
