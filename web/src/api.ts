export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message);
    this.name = "ApiError";
  }
}

let csrfToken = "";

export function setCsrfToken(value: string): void {
  csrfToken = value;
}

export async function request<T>(path: string, method = "GET", body?: unknown): Promise<T> {
  if (!path.startsWith("/api/")) throw new Error("Destino de API local inválido.");
  const headers: Record<string, string> = { Accept: "application/json" };
  if (body !== undefined) headers["Content-Type"] = "application/json";
  if (method !== "GET" && csrfToken) headers["X-CSRF-Token"] = csrfToken;
  let response: Response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Não foi possível acessar o servidor local. Confira se o estúdio está em execução.", 0);
  }
  if (response.status === 204) return undefined as T;
  const data: unknown = await response.json().catch(() => undefined);
  if (!response.ok) {
    if (response.status === 401) window.dispatchEvent(new Event("session-expired"));
    const message = typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
      ? data.error.slice(0, 500)
      : `A operação não foi concluída (HTTP ${response.status}).`;
    throw new ApiError(message, response.status);
  }
  return data as T;
}
