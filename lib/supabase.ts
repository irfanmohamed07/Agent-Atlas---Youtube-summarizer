const baseUrl = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

function headers(extra: HeadersInit = {}): HeadersInit {
  if (!baseUrl || !serviceKey) throw new Error("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required");
  return { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, ...extra };
}

export async function supabase<T>(path: string, init: RequestInit = {}): Promise<T> {
  if (!baseUrl) throw new Error("SUPABASE_URL is required");
  const response = await fetch(`${baseUrl}/rest/v1/${path}`, {
    ...init,
    headers: headers(init.headers),
  });
  if (!response.ok) throw new Error(`Supabase request failed (${response.status}): ${await response.text()}`);
  const text = await response.text();
  return (text ? JSON.parse(text) : null) as T;
}
