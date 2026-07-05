import type { ApiErrorBody } from "@/types/api";

export const API_BASE_URL: string =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

/**
 * In-memory token holder. The AuthProvider keeps this in sync with
 * localStorage so that a page refresh can rehydrate the token without
 * forcing a re-login, while all runtime reads go through memory (per the
 * "simulated JWT auth" requirement: token lives in memory + localStorage for
 * refresh-persistence).
 */
let inMemoryToken: string | null = null;

export function setAuthToken(token: string | null): void {
  inMemoryToken = token;
}

export function getAuthToken(): string | null {
  return inMemoryToken;
}

export class ApiError extends Error {
  status: number;
  body: ApiErrorBody | null;

  constructor(status: number, message: string, body: ApiErrorBody | null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

interface RequestOptions {
  method?: string;
  body?: BodyInit | null;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Set false to omit the Content-Type: application/json header (e.g. FormData). */
  json?: boolean;
}

function buildHeaders(options: RequestOptions): Headers {
  const headers = new Headers(options.headers ?? {});
  const token = getAuthToken();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  if (options.json !== false && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  return headers;
}

async function parseErrorBody(res: Response): Promise<ApiErrorBody | null> {
  try {
    const data = (await res.json()) as ApiErrorBody;
    return data;
  } catch {
    return null;
  }
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method: options.method ?? "GET",
    headers: buildHeaders(options),
    body: options.body ?? undefined,
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await parseErrorBody(res);
    const message = body?.detail ?? body?.message ?? `Request failed with status ${res.status}`;
    throw new ApiError(res.status, message, body);
  }

  if (res.status === 204) {
    return undefined as T;
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await res.json()) as T;
  }
  return undefined as T;
}

/**
 * Uploads a FormData payload via XMLHttpRequest instead of fetch, purely to get real
 * byte-level `upload.onprogress` events - fetch's ReadableStream request bodies aren't
 * broadly supported for tracking upload progress the way XHR has been for years.
 */
export function uploadFormWithProgress<T>(
  path: string,
  form: FormData,
  onProgress?: (percent: number) => void,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${API_BASE_URL}${path}`);
    const token = getAuthToken();
    if (token) {
      xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    }

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) {
        onProgress(Math.round((event.loaded / event.total) * 100));
      }
    };

    xhr.onload = () => {
      let body: unknown = undefined;
      try {
        body = xhr.responseText ? JSON.parse(xhr.responseText) : undefined;
      } catch {
        body = undefined;
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(body as T);
      } else {
        const errorBody = body as ApiErrorBody | null;
        const message = errorBody?.detail ?? errorBody?.message ?? `Request failed with status ${xhr.status}`;
        reject(new ApiError(xhr.status, message, errorBody));
      }
    };

    xhr.onerror = () => reject(new ApiError(0, "Network error during upload", null));
    xhr.send(form);
  });
}

export const apiClient = {
  get<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: "GET", signal });
  },
  post<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : null,
      signal,
    });
  },
  postForm<T>(path: string, form: FormData, signal?: AbortSignal): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: form,
      json: false,
      signal,
    });
  },
  patch<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : null,
      signal,
    });
  },
  delete<T>(path: string, signal?: AbortSignal): Promise<T> {
    return request<T>(path, { method: "DELETE", signal });
  },
};

/**
 * Downloads a file response (CSV/JSON export endpoints) and triggers a
 * browser save via a temporary anchor tag.
 */
export async function downloadFile(path: string, fallbackFilename: string): Promise<void> {
  const token = getAuthToken();
  const headers = new Headers();
  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }
  const res = await fetch(`${API_BASE_URL}${path}`, { headers });
  if (!res.ok) {
    const body = await parseErrorBody(res);
    throw new ApiError(res.status, body?.detail ?? "Export failed", body);
  }
  const blob = await res.blob();
  const disposition = res.headers.get("content-disposition");
  let filename = fallbackFilename;
  if (disposition) {
    const match = /filename="?([^"]+)"?/.exec(disposition);
    if (match?.[1]) {
      filename = match[1];
    }
  }
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
