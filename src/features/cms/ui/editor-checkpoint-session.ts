import type { EditorCheckpoint } from "../cms_workspace_schemas";

type CheckpointTransport = {
  read: () => Promise<EditorCheckpoint | null>;
  save: (body: string, version: number) => Promise<EditorCheckpoint>;
  discard: (version: number) => Promise<void>;
  describeError: (cause: unknown) => string;
  isConflict: (cause: unknown) => boolean;
};
const initialState = {
  candidate: null as EditorCheckpoint | null,
  ready: false,
  status: "",
  problem: "",
  blocked: false,
};

/** One actor/document session serializes reads, recovery writes and deletion. */
export class EditorCheckpointSession {
  private state = initialState;
  private version = 0;
  private savedPayload = "";
  private queue: Promise<void> = Promise.resolve();
  private enabled = false;
  private epoch = 0;
  private listeners = new Set<() => void>();

  constructor(private readonly transport: CheckpointTransport) {}

  getSnapshot = () => this.state;
  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };
  private update(state: Partial<typeof initialState>) {
    this.state = { ...this.state, ...state };
    this.listeners.forEach((listener) => listener());
  }
  private enqueue<T>(operation: () => Promise<T>): Promise<T> {
    const task = this.queue.then(operation);
    this.queue = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }
  setEnabled(enabled: boolean) {
    if (!enabled) this.pause();
    else this.enabled = true;
  }
  pause() {
    this.enabled = false;
    this.epoch += 1;
  }
  settle() {
    // Cancel queued/timed writes immediately, before React commits the busy state.
    this.pause();
    return this.queue;
  }
  load = () =>
    this.enqueue(async () => {
      try {
        const checkpoint = await this.transport.read();
        this.version = checkpoint?.version ?? 0;
        this.savedPayload = "";
        this.update({
          candidate: checkpoint,
          ready: true,
          blocked: false,
          problem: "",
        });
      } catch (cause) {
        this.update({ problem: this.transport.describeError(cause) });
      }
    });
  retain(body: string) {
    const epoch = this.epoch;
    return this.enqueue(async () => {
      if (
        !this.enabled ||
        epoch !== this.epoch ||
        !this.state.ready ||
        this.state.candidate ||
        this.state.blocked ||
        this.savedPayload === body
      )
        return;
      this.update({ status: "Saving recovery copy…" });
      try {
        const checkpoint = await this.transport.save(body, this.version);
        this.version = checkpoint.version;
        this.savedPayload = body;
        this.update({
          status: `Recovery saved ${new Date(checkpoint.updatedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`,
          problem: "",
        });
      } catch (cause) {
        this.update({
          status: "Recovery not saved",
          problem: this.transport.describeError(cause),
          blocked: this.transport.isConflict(cause),
        });
      }
    });
  }
  discard = () => {
    this.pause();
    return this.enqueue(async () => {
      if (this.version) await this.transport.discard(this.version);
      this.version = 0;
      this.savedPayload = "";
      this.update({ candidate: null, status: "", blocked: false, problem: "" });
    });
  };
  recover = () => {
    const candidate = this.state.candidate;
    this.update({ candidate: null });
    return candidate;
  };
}
