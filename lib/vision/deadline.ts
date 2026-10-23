import { VisionError } from "./errors";

export class Deadline {
  private readonly controller = new AbortController();
  private readonly expires: number;
  private readonly timer: ReturnType<typeof setTimeout>;
  private readonly disconnect = () => this.controller.abort(new VisionError("ANALYSIS_TIMEOUT"));
  readonly signal = this.controller.signal;

  constructor(private readonly client: AbortSignal, duration: number) {
    this.expires = performance.now() + duration;
    this.timer = setTimeout(this.disconnect, duration);
    client.addEventListener("abort", this.disconnect, { once: true });
    if (client.aborted) this.disconnect();
  }

  remaining() {
    const remaining = Math.ceil(this.expires - performance.now());
    if (remaining <= 0 || this.signal.aborted) throw new VisionError("ANALYSIS_TIMEOUT");
    return remaining;
  }

  async wait<T>(work: Promise<T>): Promise<T> {
    if (performance.now() >= this.expires) this.disconnect();
    return new Promise<T>((resolve, reject) => {
      const cancel = () => reject(new VisionError("ANALYSIS_TIMEOUT"));
      this.signal.addEventListener("abort", cancel, { once: true });
      work.then(resolve, reject).finally(() => this.signal.removeEventListener("abort", cancel));
      if (this.signal.aborted) cancel();
    });
  }

  close() {
    clearTimeout(this.timer);
    this.client.removeEventListener("abort", this.disconnect);
  }
}
