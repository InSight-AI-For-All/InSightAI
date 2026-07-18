export function getSafeRedirectDestination(requestedPath: string, appUrl: string) {
  const requestedDestination = new URL(requestedPath, appUrl);
  return requestedPath.startsWith("/") && requestedDestination.origin === appUrl
    ? requestedDestination
    : new URL("/dashboard", appUrl);
}