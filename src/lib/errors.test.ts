import { describe, it, expect } from 'vitest';
import { classifyPipelineError } from './errors';

describe('classifyPipelineError', () => {
  const URL_TOO_LONG_MESSAGE =
    'That URL is too long for QR error correction level H. Please shorten it.';

  it('classifies "Input too long" wording as url-too-long', () => {
    const result = classifyPipelineError(new Error('Input too long'));
    expect(result.kind).toBe('url-too-long');
    expect(result.userMessage).toBe(URL_TOO_LONG_MESSAGE);
  });

  it('classifies "no version available" wording as url-too-long', () => {
    const result = classifyPipelineError(new Error('no version available'));
    expect(result.kind).toBe('url-too-long');
    expect(result.userMessage).toBe(URL_TOO_LONG_MESSAGE);
  });

  it('classifies "cannot encode this data" wording as url-too-long', () => {
    const result = classifyPipelineError(new Error('cannot encode this data'));
    expect(result.kind).toBe('url-too-long');
    expect(result.userMessage).toBe(URL_TOO_LONG_MESSAGE);
  });

  it('classifies "not enough error correction" wording as url-too-long', () => {
    const result = classifyPipelineError(
      new Error('not enough error correction'),
    );
    expect(result.kind).toBe('url-too-long');
    expect(result.userMessage).toBe(URL_TOO_LONG_MESSAGE);
  });

  it('classifies an unrelated Error as unknown and forwards its message', () => {
    const result = classifyPipelineError(new Error('random other failure'));
    expect(result.kind).toBe('unknown');
    expect(result.userMessage).toBe('random other failure');
  });

  it('classifies a non-Error throw (plain string) as unknown', () => {
    const result = classifyPipelineError('boom');
    expect(result.kind).toBe('unknown');
    expect(result.userMessage).toBe('boom');
  });
});
