import { getApiUrl, getToken } from "./session";

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function parseErrorBody(body: string, fallback: string) {
  try {
    const json = JSON.parse(body) as { error?: string };
    if (json.error) return json.error;
  } catch {
    /* use raw */
  }
  return body || fallback;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const base = await getApiUrl();
  if (!base) throw new ApiError(0, "Not signed in — set server URL first");
  const token = await getToken();
  const headers: Record<string, string> = {
    ...(init.headers as Record<string, string> | undefined),
  };
  // Only set JSON content-type when there is a body — empty DELETE/GET with
  // application/json makes Fastify return 400 (empty JSON body).
  if (init.body != null && headers["Content-Type"] == null && headers["content-type"] == null) {
    headers["Content-Type"] = "application/json";
  }
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(`${base}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, parseErrorBody(body, res.statusText));
  }
  // Some DELETEs may return empty — tolerate
  const text = await res.text();
  if (!text) return {} as T;
  return JSON.parse(text) as T;
}

export type AuthUser = {
  id: string;
  username: string;
  displayName: string;
  role: string;
};

type AuthResult = {
  token: string;
  user: AuthUser;
  device: { id: string; deviceName: string };
};

export async function authStatus(apiUrl: string) {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/auth/status`);
  if (!res.ok) throw new ApiError(res.status, "Could not reach server");
  return res.json() as Promise<{ needsBootstrap: boolean; userCount: number }>;
}

export async function loginAccount(input: {
  apiUrl: string;
  username: string;
  password: string;
  deviceName: string;
}) {
  const base = input.apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      deviceName: input.deviceName,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, parseErrorBody(body, "Login failed"));
  }
  return res.json() as Promise<AuthResult>;
}

export async function validateInvite(apiUrl: string, code: string) {
  const base = apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/auth/invite/${encodeURIComponent(code.trim().toLowerCase())}`);
  const body = await res.text();
  let json: { valid?: boolean; error?: string; expiresAt?: string; status?: string } = {};
  try {
    json = JSON.parse(body) as typeof json;
  } catch {
    /* ignore */
  }
  if (!res.ok) {
    return {
      valid: false as const,
      error: json.error || parseErrorBody(body, "Invalid invite"),
      expiresAt: json.expiresAt,
    };
  }
  return {
    valid: true as const,
    expiresAt: json.expiresAt,
  };
}

export async function registerAccount(input: {
  apiUrl: string;
  username: string;
  password: string;
  displayName?: string;
  inviteCode?: string;
  deviceName: string;
}) {
  const base = input.apiUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/auth/register`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      username: input.username,
      password: input.password,
      displayName: input.displayName,
      inviteCode: input.inviteCode,
      deviceName: input.deviceName,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new ApiError(res.status, parseErrorBody(body, "Register failed"));
  }
  return res.json() as Promise<AuthResult>;
}
