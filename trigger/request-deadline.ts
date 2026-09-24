// Keep the controller, timer and parent listener alive through BOTH fetch and
// response-body consumption. Dispose them before a durable worker wait.
export async function withRequestDeadline<T>(
  parent: AbortSignal, milliseconds: number, operation: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  parent.throwIfAborted();
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(parent.reason);
  parent.addEventListener("abort", forwardAbort, { once: true });
  const timer = setTimeout(() => controller.abort(new DOMException("Request deadline exceeded", "TimeoutError")), milliseconds);
  timer.unref();
  try {
    const result = await operation(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } catch (error) {
    // Stream helpers may wrap an abort. Preserve the actual timeout/cancel cause.
    if (controller.signal.aborted) throw controller.signal.reason;
    throw error;
  } finally {
    clearTimeout(timer);
    parent.removeEventListener("abort", forwardAbort);
  }
}
