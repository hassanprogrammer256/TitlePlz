/**
 * AI features (Gemini) are intentionally NOT part of v1 and nothing imports this module yet.
 *
 * Planned: `POST /api/ai/deconstruct` backing the client's DeconstructionChat. When it is built:
 *  - call Gemini from the server only, so GEMINI_API_KEY never reaches the browser;
 *  - require a session and rate-limit per user, because every call costs money;
 *  - never include a drop's `correctTitle` in the prompt or the response for unsolved drops.
 */
import { config } from '../../config/env.js';

export const ai = {
  /** True once a key is configured. Features must still be explicitly mounted before they are reachable. */
  isConfigured: () => Boolean(config.GEMINI_API_KEY),
} as const;
