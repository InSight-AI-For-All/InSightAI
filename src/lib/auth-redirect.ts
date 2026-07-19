export function getSafeRedirectDestination(requestedPath: string, appUrl: string) {
  const requestedDestination = new URL(requestedPath, appUrl);
  return requestedPath.startsWith("/") && requestedDestination.origin === appUrl
    ? requestedDestination
    : new URL("/dashboard", appUrl);
}

const protectedPrefixes = ["/dashboard", "/check", "/history", "/results", "/account", "/admin"];

export function isProtectedAppPath(pathname: string) {
  return protectedPrefixes.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export function getLoginDestination(requestUrl: URL) {
  const loginUrl = new URL("/login", requestUrl.origin);
  loginUrl.searchParams.set("next", `${requestUrl.pathname}${requestUrl.search}`);
  return loginUrl;
}