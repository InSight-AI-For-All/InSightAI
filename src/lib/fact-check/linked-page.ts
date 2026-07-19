import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { load } from "cheerio";
import ipaddr from "ipaddr.js";

const maximumResponseBytes = 512 * 1024;
const maximumExtractedCharacters = 12_000;
const requestTimeoutMilliseconds = 8_000;
const maximumRedirects = 3;

type PublicAddress = { address: string; family: 4 | 6 };

export function isPublicAddress(value: string) {
  try {
    let address = ipaddr.parse(value);
    if (address instanceof ipaddr.IPv6 && address.isIPv4MappedAddress()) {
      address = address.toIPv4Address();
    }
    return address.range() === "unicast";
  } catch {
    return false;
  }
}

export function getInspectableUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  const instagramPost = url.pathname.match(/^\/(p|reel|tv)\/([a-zA-Z0-9_-]+)\/?$/);
  if (hostname === "instagram.com" && instagramPost) {
    return new URL(`https://www.instagram.com/${instagramPost[1]}/${instagramPost[2]}/embed/captioned/`);
  }
  return url;
}

async function resolvePublicAddress(url: URL): Promise<PublicAddress> {
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error("The linked page URL is not allowed.");
  }
  if (url.port && !((url.protocol === "http:" && url.port === "80") || (url.protocol === "https:" && url.port === "443"))) {
    throw new Error("The linked page port is not allowed.");
  }

  const addresses = await lookup(url.hostname, { all: true, verbatim: true });
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicAddress(address))) {
    throw new Error("The linked page did not resolve to a public address.");
  }
  const selected = addresses[0];
  return { address: selected.address, family: selected.family as 4 | 6 };
}

async function requestPage(url: URL, redirectsRemaining = maximumRedirects): Promise<{ html: string; finalUrl: string }> {
  const publicAddress = await resolvePublicAddress(url);
  const transport = url.protocol === "https:" ? https : http;
  const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
    if (options.all) callback(null, [publicAddress]);
    else callback(null, publicAddress.address, publicAddress.family);
  };

  return new Promise((resolve, reject) => {
    const request = transport.request(url, {
      headers: {
        "Accept": "text/html,application/xhtml+xml,text/plain;q=0.9",
        "Accept-Encoding": "identity",
        "Accept-Language": "en-US,en;q=0.9",
        "User-Agent": "Mozilla/5.0 (compatible; InSightAI/1.0; +https://insightaiforall.com)",
      },
      lookup: pinnedLookup,
      signal: AbortSignal.timeout(requestTimeoutMilliseconds),
    }, (response) => {
      const status = response.statusCode || 0;
      const location = response.headers.location;
      if (status >= 300 && status < 400 && location) {
        response.resume();
        if (redirectsRemaining <= 0) return reject(new Error("The linked page redirected too many times."));
        const redirectUrl = new URL(location, url);
        void requestPage(redirectUrl, redirectsRemaining - 1).then(resolve, reject);
        return;
      }
      if (status < 200 || status >= 300) {
        response.resume();
        reject(new Error(`The linked page returned HTTP ${status}.`));
        return;
      }

      const contentType = String(response.headers["content-type"] || "").toLowerCase();
      if (!contentType.includes("text/html") && !contentType.includes("application/xhtml+xml") && !contentType.includes("text/plain")) {
        response.resume();
        reject(new Error("The linked page is not textual content."));
        return;
      }

      const chunks: Buffer[] = [];
      let totalBytes = 0;
      response.on("data", (chunk: Buffer) => {
        totalBytes += chunk.length;
        if (totalBytes > maximumResponseBytes) {
          response.destroy(new Error("The linked page is too large."));
          return;
        }
        chunks.push(chunk);
      });
      response.on("end", () => resolve({
        html: Buffer.concat(chunks).toString("utf8"),
        finalUrl: url.href,
      }));
      response.on("error", reject);
    });
    request.on("error", reject);
    request.end();
  });
}

export function extractPageText(html: string) {
  const $ = load(html);
  $("script, style, noscript, template, svg").remove();
  const title = ($('meta[property="og:title"]').attr("content") || $("title").first().text()).trim();
  const description = ($('meta[property="og:description"]').attr("content") || $('meta[name="description"]').attr("content") || "").trim();
  const body = $("body").text().replace(/\s+/g, " ").trim();
  return [title, description, body]
    .filter(Boolean)
    .join("\n")
    .slice(0, maximumExtractedCharacters);
}

export async function retrieveLinkedPage(value: string) {
  const requestedUrl = getInspectableUrl(value);
  const response = await requestPage(requestedUrl);
  const text = extractPageText(response.html);
  if (!text) throw new Error("The linked page did not contain readable text.");
  return { url: response.finalUrl, text };
}