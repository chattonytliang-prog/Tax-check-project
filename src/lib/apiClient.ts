export async function apiGet<T>(url: string): Promise<T> {
  const response = await fetch(url)
  if (!response.ok) {
    throw new Error(`API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function apiSend<T>(url: string, method: 'POST' | 'PUT', body: unknown): Promise<T> {
  const response = await fetch(url, {
    method,
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || data?.detail || `API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}

export async function apiDelete<T>(url: string): Promise<T> {
  const response = await fetch(url, { method: 'DELETE' })
  if (!response.ok) {
    const data = await response.json().catch(() => null)
    throw new Error(data?.error || data?.detail || `API request failed: ${response.status}`)
  }
  return response.json() as Promise<T>
}
