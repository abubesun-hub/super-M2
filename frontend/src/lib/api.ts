function trimTrailingSlash(value: string) {
  return value.replace(/\/+$/, '')
}

import { clearStoredEmployeeSession, readStoredEmployeeSession } from './employee-session-storage'

const apiBaseStorageKey = 'super-m2-api-base'

function readStoredApiBaseUrl() {
  if (typeof window === 'undefined') {
    return null
  }

  return window.localStorage.getItem(apiBaseStorageKey)
}

function storeResolvedApiBaseUrl(value: string) {
  if (typeof window === 'undefined') {
    return
  }

  window.localStorage.setItem(apiBaseStorageKey, value)
}

function isHtmlResponse(response: Response) {
  const contentType = response.headers.get('content-type')?.toLowerCase() || ''
  return contentType.includes('text/html')
}

function getApiBaseUrlCandidates() {
  const configuredBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim()

  if (configuredBaseUrl) {
    return [trimTrailingSlash(configuredBaseUrl)]
  }

  if (typeof window === 'undefined') {
    return ['http://127.0.0.1:4001/api', 'http://localhost:4001/api', 'http://127.0.0.1:4000/api', 'http://localhost:4000/api']
  }

  const protocol = window.location.protocol
  const hostname = window.location.hostname
  const envApiPort = import.meta.env.VITE_API_PORT?.trim() || '4001'
  const storedBaseUrl = readStoredApiBaseUrl()
  const preferredCandidates = [
    `${protocol}//${hostname}:${envApiPort}/api`,
    `${protocol}//127.0.0.1:${envApiPort}/api`,
  ]
  const fallbackCandidates = [
    storedBaseUrl,
    `${protocol}//${hostname}:4001/api`,
    `${protocol}//127.0.0.1:4001/api`,
    `${protocol}//${hostname}:4000/api`,
    `${protocol}//127.0.0.1:4000/api`,
    `${window.location.origin}/api`,
  ]

  return [...preferredCandidates, ...fallbackCandidates]
    .filter((value, index, values): value is string => Boolean(value) && values.indexOf(value) === index)
}

export function getApiBaseUrl() {
  return getApiBaseUrlCandidates()[0] ?? 'http://localhost:4001/api'
}

function getStoredAccessToken() {
  return readStoredEmployeeSession()?.accessToken ?? null
}

export async function apiFetch(path: string, init: RequestInit = {}, options?: { auth?: boolean }) {
  const headers = new Headers(init.headers)
  const requiresAuth = options?.auth !== false

  if (requiresAuth) {
    const accessToken = getStoredAccessToken()

    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`)
    }
  }

  let lastResponse: Response | null = null
  let lastError: Error | null = null

  for (const baseUrl of getApiBaseUrlCandidates()) {
    try {
      const response = await fetch(`${baseUrl}${path}`, {
        ...init,
        headers,
      })

      if (response.ok && !isHtmlResponse(response)) {
        storeResolvedApiBaseUrl(baseUrl)
        return response
      }

      if (response.ok && isHtmlResponse(response)) {
        lastResponse = response
        continue
      }

      if (requiresAuth && response.status === 401 && typeof window !== 'undefined') {
        clearStoredEmployeeSession()
        return response
      }

      lastResponse = response

      if (response.status !== 404 && response.status < 500) {
        return response
      }
    } catch (error) {
      lastError = error instanceof Error ? error : new Error('تعذر الاتصال بالخادم.')
    }
  }

  if (lastResponse) {
    return lastResponse
  }

  throw lastError ?? new Error('تعذر الاتصال بالخادم.')
}