import { JobError, runJob } from "./jobs";
import { ToolError } from "./tools";
import { claim, complete, fail, serviceClient, supabaseDb, supabaseStore } from "./supabase";

const IDLE_MS = Number(process.env.POLL_INTERVAL_MS ?? 5000);
let stopping = false;
for (const sig of ["SIGINT", "SIGTERM"] as const) process.on(sig, () => (stopping = true));

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Logs ids and outcomes only: never names, paths of scans or document text. */
const log = (msg: string, extra: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ at: new Date().toISOString(), msg, ...extra }));

async function main() {
  const sb = serviceClient();
  const store = supabaseStore(sb);
  const db = supabaseDb(sb);
  log("worker started");
  while (!stopping) {
    let job;
    try {
      job = await claim(sb);
    } catch (e) {
      log("claim error", { error: (e as Error).message });
      await sleep(IDLE_MS * 4);
      continue;
    }
    if (!job) {
      await sleep(IDLE_MS);
      continue;
    }
    const started = Date.now();
    try {
      const res = await runJob(job, store, db);
      await complete(sb, job.id, res.path, res.meta);
      log("job done", { job: job.id, kind: job.kind, ms: Date.now() - started });
    } catch (e) {
      // Only JobError messages are written for users; tool output and storage errors may
      // carry file names or document text, so they are reduced to a code.
      const message = e instanceof JobError ? e.message : e instanceof ToolError ? e.message : "Internal error";
      await fail(sb, job.id, message);
      log("job failed", { job: job.id, kind: job.kind, error: message, code: e instanceof ToolError ? e.tool : (e as Error).name });
    }
  }
  log("worker stopped");
}

main().catch((e) => {
  log("fatal", { error: (e as Error).message });
  process.exit(1);
});
