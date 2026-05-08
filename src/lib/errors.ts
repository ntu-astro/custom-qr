/**
 * Pipeline error classification. Maps thrown errors from the QR generation
 * pipeline to user-facing messages. `qrcode` library error wording is the
 * primary source of substring matches; if `qrcode` rephrases on a future
 * upgrade (project pins qrcode@1.5.4 — see CLAUDE.md), update fixtures here.
 */

export type PipelineErrorKind = 'url-too-long' | 'unknown';

export interface ClassifiedError {
  kind: PipelineErrorKind;
  userMessage: string;
}

const URL_TOO_LONG_PATTERNS: readonly RegExp[] = [
  /too long/i,
  /not enough/i,
  /no version/i,
  /cannot encode/i,
];

export function classifyPipelineError(err: unknown): ClassifiedError {
  const msg = err instanceof Error ? err.message : String(err);
  if (URL_TOO_LONG_PATTERNS.some((re) => re.test(msg))) {
    return {
      kind: 'url-too-long',
      userMessage:
        'That URL is too long for QR error correction level H. Please shorten it.',
    };
  }
  return { kind: 'unknown', userMessage: msg };
}
