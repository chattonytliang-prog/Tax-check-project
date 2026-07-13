type ApiErrorBody = { error?: string; detail?: string }

async function apiError(response: Response) {
  const fallback = `API request failed: ${response.status}`
  try {
    const data = await response.json() as ApiErrorBody
    return data.error === 'Server error' && data.detail ? data.detail : data.error || data.detail || fallback
  } catch {
    return fallback
  }
}

async function requestJson<T>(url: string, init?: RequestInit): Promise<T> {
  let response = await fetch(url, init)
  if ([502, 503, 504].includes(response.status)) {
    await new Promise((resolve) => setTimeout(resolve, 800))
    response = await fetch(url, init)
  }
  if (!response.ok) throw new Error(await apiError(response))
  return response.json() as Promise<T>
}

export function apiGet<T>(url: string) {
  return requestJson<T>(url)
}

export function apiSend<T>(url: string, method: 'POST' | 'PUT', body: unknown) {
  return requestJson<T>(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export function apiUpload<T>(url: string, formData: FormData) {
  return requestJson<T>(url, { method: 'POST', body: formData })
}

export function apiDelete<T>(url: string) {
  return requestJson<T>(url, { method: 'DELETE' })
}
