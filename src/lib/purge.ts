const LIST_PAGE_SIZE = 1000;

/** Default KV operation budget for a single Cron invocation. */
export const DEFAULT_MAX_OPERATIONS = 900;

/** How many keys are deleted concurrently inside one page. */
export const DEFAULT_CONCURRENCY = 50;

export interface PurgeKVKey {
  name: string;
}

export interface PurgeKVListResult {
  keys: PurgeKVKey[];
  list_complete: boolean;
  cursor?: string;
}

/**
 * Minimal subset of the Workers KV binding used by the purge job. Only the
 * binding is required, so the job needs no API token or account credentials.
 */
export interface PurgeKV {
  list(options?: { limit?: number; cursor?: string }): Promise<PurgeKVListResult>;
  delete(key: string): Promise<void>;
}

export interface PurgeOptions {
  /** Maximum KV operations (list + delete) for this run. */
  maxOperations?: number;
  /** Concurrent deletes per chunk. */
  concurrency?: number;
}

export interface PurgeResult {
  deleted: number;
  failed: number;
  operations: number;
  /** True when keys may still remain (budget exhausted or deletes failed). */
  remaining: boolean;
}

function clampConcurrency(concurrency: number): number {
  if (!Number.isFinite(concurrency)) return DEFAULT_CONCURRENCY;
  return Math.max(1, Math.min(Math.floor(concurrency), LIST_PAGE_SIZE));
}

function clampOperations(maxOperations: number): number {
  if (!Number.isFinite(maxOperations)) return DEFAULT_MAX_OPERATIONS;
  return Math.max(1, Math.floor(maxOperations));
}

/**
 * Deletes every key in a KV namespace without using the Cloudflare REST API.
 *
 * The namespace is re-listed from the beginning after each page instead of
 * following the cursor, because deleting keys invalidates cursor positions and
 * can skip entries. Each run is capped by an operation budget so a single Cron
 * invocation stays within the per-invocation KV operation limit.
 */
export async function purgeAllNotes(
  kv: PurgeKV,
  options: PurgeOptions = {}
): Promise<PurgeResult> {
  const maxOperations = clampOperations(
    options.maxOperations ?? DEFAULT_MAX_OPERATIONS
  );
  const concurrency = clampConcurrency(
    options.concurrency ?? DEFAULT_CONCURRENCY
  );

  let deleted = 0;
  let failed = 0;
  let operations = 0;
  let confirmedEmpty = false;

  while (operations < maxOperations && !confirmedEmpty) {
    const page = await kv.list({ limit: LIST_PAGE_SIZE });
    operations += 1;

    if (page.keys.length === 0) {
      confirmedEmpty = true;
      break;
    }

    const budget = Math.min(page.keys.length, maxOperations - operations);
    if (budget <= 0) break;

    const batch = page.keys.slice(0, budget);
    let deletedInPage = 0;

    for (let i = 0; i < batch.length; i += concurrency) {
      const chunk = batch.slice(i, i + concurrency);
      const results = await Promise.allSettled(
        chunk.map((key) => kv.delete(key.name))
      );
      operations += chunk.length;

      for (const result of results) {
        if (result.status === "fulfilled") {
          deleted += 1;
          deletedInPage += 1;
        } else {
          failed += 1;
        }
      }

      if (deletedInPage === 0) break;
      if (operations >= maxOperations) break;
    }

    // Every delete failed, so re-listing would spin on the same keys.
    if (deletedInPage === 0) break;

    if (
      page.list_complete &&
      batch.length === page.keys.length &&
      deletedInPage === batch.length
    ) {
      confirmedEmpty = true;
    }
  }

  return { deleted, failed, operations, remaining: !confirmedEmpty };
}
