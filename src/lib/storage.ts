const DEFAULT_TTL_SECONDS = 7 * 24 * 60 * 60;

interface KVBinding {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
  delete(key: string): Promise<void>;
}

export interface Storage {
  read(noteID: string): Promise<string>;
  write(noteID: string, content: string): Promise<void>;
  delete(noteID: string): Promise<void>;
}

export class KVStorage implements Storage {
  constructor(private kv: KVBinding) {}

  async read(noteID: string): Promise<string> {
    const content = await this.kv.get(noteID);
    return content ?? "";
  }

  async write(noteID: string, content: string): Promise<void> {
    await this.kv.put(noteID, content, { expirationTtl: DEFAULT_TTL_SECONDS });
  }

  async delete(noteID: string): Promise<void> {
    await this.kv.delete(noteID);
  }
}

export class VercelKVStorage implements Storage {
  private baseUrl: string;
  private token: string;

  constructor() {
    const url = process.env.KV_REST_API_URL;
    const token = process.env.KV_REST_API_TOKEN;
    if (!url || !token) {
      throw new Error(
        "Vercel KV not configured: set KV_REST_API_URL and KV_REST_API_TOKEN"
      );
    }
    this.baseUrl = url.replace(/\/+$/, "");
    this.token = token;
  }

  private async request(
    method: string,
    path: string,
    body?: string
  ): Promise<{ result: unknown }> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      body,
    });
    if (!res.ok) {
      throw new Error(`Vercel KV error: ${res.status} ${res.statusText}`);
    }
    return res.json();
  }

  async read(noteID: string): Promise<string> {
    const data = await this.request("GET", `/get/${noteID}`);
    return (data.result as string | null) ?? "";
  }

  async write(noteID: string, content: string): Promise<void> {
    await this.request(
      "POST",
      `/set/${noteID}?EX=${DEFAULT_TTL_SECONDS}`,
      JSON.stringify(content)
    );
  }

  async delete(noteID: string): Promise<void> {
    await this.request("POST", `/del/${noteID}`);
  }
}
