import type { A2aTask, A2aTaskState, TaskStoreEntry } from "./types.js";

const TTL_MS = 60 * 60 * 1000; // 1 hour
const MAX_ENTRIES = 10_000;
const SWEEP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

const TERMINAL_STATES: Set<A2aTaskState> = new Set([
  "completed", "failed", "canceled", "rejected",
]);

export class TaskStore {
  private entries = new Map<string, TaskStoreEntry>();
  private sweepTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.sweepTimer = setInterval(() => this.sweep(), SWEEP_INTERVAL_MS);
    // Don't block process exit
    if (this.sweepTimer.unref) {
      this.sweepTimer.unref();
    }
  }

  stop(): void {
    if (this.sweepTimer) {
      clearInterval(this.sweepTimer);
      this.sweepTimer = null;
    }
  }

  set(taskId: string, task: A2aTask): void {
    // Enforce terminal state immutability
    const existing = this.entries.get(taskId);
    if (existing && TERMINAL_STATES.has(existing.task.status.state)) {
      return; // Already terminal, refuse update
    }

    // Evict oldest if at capacity
    if (!this.entries.has(taskId) && this.entries.size >= MAX_ENTRIES) {
      this.evictOldest();
    }

    this.entries.set(taskId, { task, createdAt: Date.now() });
  }

  get(taskId: string): A2aTask | null {
    const entry = this.entries.get(taskId);
    if (!entry) return null;

    // Check TTL
    if (Date.now() - entry.createdAt > TTL_MS) {
      this.entries.delete(taskId);
      return null;
    }

    return entry.task;
  }

  isTerminal(taskId: string): boolean {
    const entry = this.entries.get(taskId);
    if (!entry) return false;
    return TERMINAL_STATES.has(entry.task.status.state);
  }

  get size(): number {
    return this.entries.size;
  }

  private sweep(): void {
    const now = Date.now();
    for (const [id, entry] of this.entries) {
      if (now - entry.createdAt > TTL_MS) {
        this.entries.delete(id);
      }
    }
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.entries) {
      if (entry.createdAt < oldestTime) {
        oldestTime = entry.createdAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.entries.delete(oldestKey);
    }
  }
}
