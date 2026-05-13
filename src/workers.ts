import { handleRequest } from "./handler";
import { KVStorage } from "./lib/storage";

interface CloudflareEnv {
  KV: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
  };
}

export default {
  async fetch(
    request: Request,
    env: CloudflareEnv,
    _ctx: ExecutionContext
  ): Promise<Response> {
    const storage = new KVStorage(env.KV);
    return handleRequest(request, storage);
  },
};
