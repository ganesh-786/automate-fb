import { z } from 'zod';
import { IdSchema, IsoDateTimeSchema, PlatformSchema, SchemaVersionSchema } from './common.ts';

export const CameraMoveSchema = z.enum([
  'static',
  'zoom-in',
  'zoom-out',
  'pan-left',
  'pan-right',
  'pan-up',
  'pan-down',
]);
export type CameraMove = z.infer<typeof CameraMoveSchema>;

export const SceneSchema = z.object({
  narration: z.string().min(1).max(600).describe('The exact words spoken during this scene.'),
  visualPrompt: z
    .string()
    .min(10)
    .max(800)
    .describe('Image-generation prompt for one vertical 9:16 still. The image contains no text.'),
  onScreenText: z
    .string()
    .max(80)
    .describe('Short overlay text for this scene. Empty string when there is none.'),
  cameraMove: CameraMoveSchema.describe('Motion applied to the still image.'),
  durationSeconds: z.number().min(1.5).max(15).describe('How long the scene stays on screen.'),
});
export type Scene = z.infer<typeof SceneSchema>;

/** A factual statement the human reviewer must check at the script gate. */
export const ClaimSchema = z.object({
  text: z.string().min(3).max(400).describe('The factual statement as it appears in the script.'),
  risk: z
    .enum(['low', 'medium', 'high'])
    .describe('High for medical, legal, financial or political statements.'),
  needsSource: z.boolean().describe('True when the reviewer should verify it against a source.'),
});
export type Claim = z.infer<typeof ClaimSchema>;

export const PlatformCopySchema = z.object({
  platform: PlatformSchema,
  caption: z.string().max(2200).describe('Post caption without hashtags.'),
  hashtags: z
    .array(z.string().regex(/^#[\p{L}\p{N}_]+$/u, 'expected a hashtag such as #science'))
    .max(30),
  title: z.string().max(100).describe('Video title where the platform has one, else empty.'),
});
export type PlatformCopy = z.infer<typeof PlatformCopySchema>;

/**
 * The part of a script a language model writes. Every field is required and "none" is an empty
 * string, because model structured-output modes handle optional fields unreliably.
 */
export const ScriptDraftSchema = z.object({
  title: z.string().min(3).max(100),
  hook: z.string().min(3).max(200).describe('The opening line, spoken in the first two seconds.'),
  scenes: z.array(SceneSchema).min(3).max(12),
  callToAction: z.string().max(240),
  claims: z.array(ClaimSchema).max(20),
  platformCopy: z.array(PlatformCopySchema).min(1).max(4),
});
export type ScriptDraft = z.infer<typeof ScriptDraftSchema>;

/** A script as stored in a job folder. Written by script-studio, approved at Gate A. */
export const ScriptSchema = ScriptDraftSchema.extend({
  schemaVersion: SchemaVersionSchema,
  scriptId: IdSchema,
  briefId: IdSchema,
  createdAt: IsoDateTimeSchema,
});
export type Script = z.infer<typeof ScriptSchema>;

/** Total on-screen time of a script, in seconds. */
export function scriptDurationSeconds(script: Pick<ScriptDraft, 'scenes'>): number {
  return script.scenes.reduce((total, scene) => total + scene.durationSeconds, 0);
}
