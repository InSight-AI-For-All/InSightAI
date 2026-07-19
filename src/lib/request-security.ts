import { randomUUID } from "node:crypto";
import { getAppUrl } from "@/lib/env";

export const maxFactCheckRequestBytes = 6 * 1024 * 1024;

export function getRequestId(request: Request) {
  const provided = request.headers.get("x-request-id");
  return provided && /^[a-zA-Z0-9_-]{8,64}$/.test(provided) ? provided : randomUUID();
}

export function isSameOriginRequest(request: Request) {
  const origin = request.headers.get("origin");
  try {
    const requestUrl = new URL(request.url);
    const requestOrigin = requestUrl.origin;
    const allowedOrigins = new Set([requestOrigin, getAppUrl()]);
    const externalHost = request.headers.get("x-forwarded-host") || request.headers.get("host");
    if (externalHost) {
      const externalProtocol = request.headers.get("x-forwarded-proto") || requestUrl.protocol.slice(0, -1);
      allowedOrigins.add(new URL(`${externalProtocol}://${externalHost}`).origin);
    }
    if (origin) return allowedOrigins.has(new URL(origin).origin);
    const referrer = request.headers.get("referer");
    if (referrer) return allowedOrigins.has(new URL(referrer).origin);
    return request.headers.get("sec-fetch-site") === "same-origin";
  } catch {
    return false;
  }
}

export function isRequestBodyTooLarge(request: Request, maximumBytes: number) {
  const value = request.headers.get("content-length");
  if (!value) return false;
  const length = Number(value);
  return !Number.isSafeInteger(length) || length < 0 || length > maximumBytes;
}

export function hasValidImageSignature(type: string, bytes: Uint8Array) {
  if (type === "image/jpeg") {
    return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  }
  if (type === "image/png") {
    return bytes.length >= 8 && [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
      .every((value, index) => bytes[index] === value);
  }
  if (type === "image/webp") {
    return bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  }
  return false;
}