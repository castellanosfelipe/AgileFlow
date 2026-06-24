export async function apiFetch<T>(
  url: string,
  options: RequestInit = {}
): Promise<T> {
  const response = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      const callbackUrl = `${window.location.pathname}${window.location.search}`;
      window.location.href = `/login?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    }

    const responseBody = await response.text();
    let message = responseBody;

    try {
      const parsed = JSON.parse(responseBody) as {
        message?: string;
        error?: string;
      };
      message = parsed.message || parsed.error || responseBody;
    } catch {
      message = responseBody;
    }

    throw new Error(message || "La solicitud fallo");
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return response.json() as Promise<T>;
}
