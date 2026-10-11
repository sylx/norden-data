/** 開発サーバー（server/dataPlugin.ts）との読み書き */
export async function api<T>(url: string, init?: { method: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, init && {
    method: init.method,
    headers: init.body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error ?? `${res.status} ${res.statusText}`)
  return body as T
}

export const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e))
