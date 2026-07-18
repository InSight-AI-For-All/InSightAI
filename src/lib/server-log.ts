type LogValue = string | number | boolean | null | undefined;

function serialize(event: string, details: Record<string, LogValue>) {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    ...details,
  });
}

export function logServerInfo(event: string, details: Record<string, LogValue> = {}) {
  console.info(serialize(event, details));
}

export function logServerError(event: string, details: Record<string, LogValue> = {}) {
  console.error(serialize(event, details));
}

export function getErrorName(error: unknown) {
  return error instanceof Error ? error.name : "UnknownError";
}