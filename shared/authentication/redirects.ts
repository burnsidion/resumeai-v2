const internalOrigin = 'http://resumeai.internal'

const normalizeInternalDestination = (destination: string): string | null => {
  const candidate = destination.trim()

  if (
    candidate.length === 0 ||
    !candidate.startsWith('/') ||
    candidate.startsWith('//') ||
    candidate.includes('\\')
  ) {
    return null
  }

  try {
    const url = new URL(candidate, internalOrigin)

    if (url.origin !== internalOrigin) {
      return null
    }

    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return null
  }
}

export function getSafeInternalRedirect(
  destination: unknown,
  fallback = '/',
): string {
  const safeFallback = normalizeInternalDestination(fallback) ?? '/'

  return typeof destination === 'string'
    ? (normalizeInternalDestination(destination) ?? safeFallback)
    : safeFallback
}
