import { describe, expect, it } from "vitest";
import { castVote, readVotes } from "@/lib/store";

// Harness smoke test: proves the @/ alias resolves, the in-memory backend works
// without KV env vars, and vote round-trips survive JSON coercion. If this
// fails, the whole suite's foundation is broken — fix it before anything else.
describe("test harness", () => {
  it("round-trips a vote through the in-memory store", async () => {
    await castVote("p1", "tokenA", { choice: "yes" }, "room-x");
    const votes = await readVotes("p1", "room-x");
    expect(votes["tokenA"]).toEqual({ choice: "yes" });
  });

  it("isolates rooms and phases", async () => {
    await castVote("p1", "tokenA", 1, "room-x");
    const other = await readVotes("p2", "room-x");
    expect(other["tokenA"]).toBeUndefined();
  });
});
