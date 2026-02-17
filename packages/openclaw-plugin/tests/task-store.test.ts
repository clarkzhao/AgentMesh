import { describe, it, expect, vi, afterEach } from "vitest";
import { TaskStore } from "../src/task-store.js";

describe("task-store", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("stores and retrieves tasks", () => {
    const store = new TaskStore();
    store.set("task-1", {
      id: "task-1",
      status: { state: "completed" },
      artifacts: [{ name: "response", parts: [{ type: "text", text: "Hello" }] }],
    });

    const task = store.get("task-1");
    expect(task).not.toBeNull();
    expect(task!.id).toBe("task-1");
    expect(task!.status.state).toBe("completed");
  });

  it("returns null for unknown task", () => {
    const store = new TaskStore();
    expect(store.get("unknown")).toBeNull();
  });

  it("expires entries after TTL", () => {
    const store = new TaskStore();
    vi.spyOn(Date, "now")
      .mockReturnValueOnce(0) // set
      .mockReturnValueOnce(3_600_001); // get (1 hour + 1ms later)

    store.set("task-1", { id: "task-1", status: { state: "completed" } });
    expect(store.get("task-1")).toBeNull();
  });

  it("evicts oldest when at capacity", () => {
    const store = new TaskStore();
    let time = 0;
    vi.spyOn(Date, "now").mockImplementation(() => ++time);

    // Fill to capacity (10,000)
    for (let i = 0; i < 10_000; i++) {
      store.set(`task-${i}`, { id: `task-${i}`, status: { state: "submitted" } });
    }

    expect(store.size).toBe(10_000);

    // Add one more — oldest should be evicted
    store.set("task-overflow", { id: "task-overflow", status: { state: "submitted" } });
    expect(store.size).toBe(10_000);
    expect(store.get("task-0")).toBeNull(); // oldest evicted
    expect(store.get("task-overflow")).not.toBeNull();
  });

  it("enforces terminal state immutability — completed cannot be overwritten", () => {
    const store = new TaskStore();
    store.set("task-1", { id: "task-1", status: { state: "completed" } });
    store.set("task-1", { id: "task-1", status: { state: "failed", error: "late" } });

    const task = store.get("task-1");
    expect(task!.status.state).toBe("completed");
  });

  it("enforces terminal state immutability — failed cannot be overwritten", () => {
    const store = new TaskStore();
    store.set("task-1", { id: "task-1", status: { state: "failed", error: "timeout" } });
    store.set("task-1", { id: "task-1", status: { state: "completed" } });

    const task = store.get("task-1");
    expect(task!.status.state).toBe("failed");
  });

  it("allows update from submitted to completed", () => {
    const store = new TaskStore();
    store.set("task-1", { id: "task-1", status: { state: "submitted" } });
    store.set("task-1", { id: "task-1", status: { state: "completed" } });

    const task = store.get("task-1");
    expect(task!.status.state).toBe("completed");
  });
});
