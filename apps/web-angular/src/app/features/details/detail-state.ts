export type DetailFailure = 'not-found' | 'forbidden' | 'error';

export function detailFailure(error: unknown): DetailFailure {
  if (typeof error !== 'object' || error === null || !('status' in error)) return 'error';
  const status = (error as { status?: unknown }).status;
  if (status === 404) return 'not-found';
  if (status === 403) return 'forbidden';
  return 'error';
}

export function safeExternalUrl(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}
