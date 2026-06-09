// Runs once when the Next.js server starts. We use it to kick off the
// in-process 1С auto-sync scheduler (Node.js runtime only).
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { startSyncScheduler } = await import("./lib/scheduler");
    startSyncScheduler();
  }
}
