export function propagateChildExit(code, signal, runtime = process) {
  if (code !== null) {
    runtime.exit(code);
    return;
  }
  if (!signal) {
    runtime.exit(1);
    return;
  }
  runtime.removeAllListeners(signal);
  runtime.kill(runtime.pid, signal);
}
