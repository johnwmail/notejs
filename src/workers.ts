import { handleRequest } from "./handler";
import { KVStorage } from "./lib/storage";
import { purgeAllNotes } from "./lib/purge";

interface CloudflareEnv {
  KV: {
    get(key: string): Promise<string | null>;
    put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
    delete(key: string): Promise<void>;
    list(options?: {
      limit?: number;
      cursor?: string;
    }): Promise<{
      keys: Array<{ name: string }>;
      list_complete: boolean;
      cursor?: string;
    }>;
  };
  /** Set to "false" to skip the scheduled KV purge. */
  PURGE_ENABLED?: string;
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

  async scheduled(
    controller: ScheduledController,
    env: CloudflareEnv,
    ctx: ExecutionContext
  ): Promise<void> {
    if (env.PURGE_ENABLED === "false") {
      console.log("purge: skipped because PURGE_ENABLED=false");
      return;
    }

    ctx.waitUntil(
      purgeAllNotes(env.KV)
        .then((result) => {
          console.log(
            `purge: cron=${controller.cron} deleted=${result.deleted} ` +
              `failed=${result.failed} operations=${result.operations} ` +
              `remaining=${result.remaining}`
          );
        })
        .catch((error: unknown) => {
          console.error(`purge: failed - ${String(error)}`);
        })
    );
  },
};
