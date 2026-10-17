import { describe, expect, it, vi } from "vitest";
import type { EditorCheckpoint } from "../../src/features/cms/cms_workspace_schemas";
import { EditorCheckpointSession } from "../../src/features/cms/ui/editor-checkpoint-session";

function checkpoint(version: number): EditorCheckpoint {
  return {
    version,
    baseRevisionId: "base",
    updatedAt: "2026-10-15T12:00:00.000Z",
    stale: false,
    document: {
      title: "Recovery",
      slug: "recovery",
      description: "",
      socialImageId: null,
      data: { root: { props: {} }, content: [] },
    },
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function transport() {
  return {
    read: vi.fn(async (): Promise<EditorCheckpoint | null> => null),
    save: vi.fn(async (_body: string, version: number) =>
      checkpoint(version + 1),
    ),
    discard: vi.fn(async () => undefined),
    describeError: (cause: unknown) => String(cause),
    isConflict: (cause: unknown) => cause === "conflict",
  };
}

describe("document recovery request ordering", () => {
  it("serializes rapid queued edits and never reuses an old checkpoint version", async () => {
    const io = transport();
    const first = deferred<EditorCheckpoint>();
    io.save.mockImplementationOnce(() => first.promise);
    const session = new EditorCheckpointSession(io);
    session.setEnabled(true);
    await session.load();
    const one = session.retain("one");
    await Promise.resolve();
    const two = session.retain("two");
    const three = session.retain("three");
    expect(io.save).toHaveBeenCalledTimes(1);
    first.resolve(checkpoint(1));
    await Promise.all([one, two, three]);
    expect(io.save.mock.calls).toEqual([
      ["one", 0],
      ["two", 1],
      ["three", 2],
    ]);
  });

  it("finishes an active write before discarding and cancels queued or timed writes", async () => {
    const io = transport();
    const saving = deferred<EditorCheckpoint>();
    io.save.mockImplementationOnce(() => saving.promise);
    const session = new EditorCheckpointSession(io);
    session.setEnabled(true);
    await session.load();
    const active = session.retain("one");
    await Promise.resolve();
    const queued = session.retain("two");
    const cleared = session.discard();
    const lateTimer = session.retain("three");
    expect(io.discard).not.toHaveBeenCalled();
    saving.resolve(checkpoint(1));
    await Promise.all([active, queued, cleared, lateTimer]);
    expect(io.save).toHaveBeenCalledTimes(1);
    expect(io.discard).toHaveBeenCalledExactlyOnceWith(1);
    expect(session.getSnapshot().status).toBe("");
  });

  it("does not let a stale recovery read race a write or leak into a copied document", async () => {
    const oldIo = transport();
    const read = deferred<EditorCheckpoint | null>();
    oldIo.read.mockImplementationOnce(() => read.promise);
    const old = new EditorCheckpointSession(oldIo);
    old.setEnabled(true);
    const loading = old.load();
    const queued = old.retain("old input");
    const settled = old.settle();
    const copyIo = transport();
    const copy = new EditorCheckpointSession(copyIo);
    copy.setEnabled(true);
    await copy.load();
    await copy.retain("copy input");
    read.resolve(checkpoint(9));
    await Promise.all([loading, queued, settled]);
    expect(oldIo.save).not.toHaveBeenCalled();
    expect(copyIo.save).toHaveBeenCalledExactlyOnceWith("copy input", 0);
    expect(copy.getSnapshot().candidate).toBeNull();
  });

  it("stops queued edits after a conflict until the saved recovery copy is reviewed", async () => {
    const io = transport();
    io.save.mockRejectedValueOnce("conflict");
    const session = new EditorCheckpointSession(io);
    session.setEnabled(true);
    await session.load();
    await Promise.all([session.retain("one"), session.retain("two")]);
    expect(io.save).toHaveBeenCalledTimes(1);
    expect(session.getSnapshot().blocked).toBe(true);
    io.read.mockResolvedValueOnce(checkpoint(8));
    await session.load();
    await session.retain("three");
    expect(io.save).toHaveBeenCalledTimes(1);
    expect(session.recover()?.version).toBe(8);
    await session.retain("reviewed");
    expect(io.save).toHaveBeenLastCalledWith("reviewed", 8);
  });
});
