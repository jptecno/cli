export const requestTimeoutMilliseconds = 30_000;

export async function fetchWithTimeout(
  url: string,
  init?: RequestInit,
): Promise<Response> {
  return fetch(url, {
    ...init,
    signal: AbortSignal.timeout(requestTimeoutMilliseconds),
  });
}

export function formatFetchError(error: unknown): string {
  if (isTimeoutError(error)) {
    return `a solicitação excedeu o tempo limite de ${requestTimeoutMilliseconds / 1000} segundos`;
  }

  return error instanceof Error ? error.message : 'erro desconhecido';
}

function isTimeoutError(error: unknown): boolean {
  return (
    error instanceof DOMException &&
    (error.name === 'TimeoutError' || error.name === 'AbortError')
  );
}
