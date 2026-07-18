const supabaseRequestTimeoutMilliseconds = 10_000;

export function fetchWithTimeout(
  input: RequestInfo | URL,
  init?: RequestInit,
  timeoutMilliseconds = supabaseRequestTimeoutMilliseconds,
) {
  const timeoutSignal = AbortSignal.timeout(timeoutMilliseconds);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, timeoutSignal])
    : timeoutSignal;
  return fetch(input, { ...init, signal });
}