import { after } from "next/server";
import { errorLogMetadata } from "@/lib/logging";

export type AfterResponseTaskName =
  | "account_deletion_notice"
  | "email_change_delivery"
  | "email_change_notice"
  | "email_verification_delivery"
  | "expired_security_artifact_cleanup"
  | "learning_data_deletion_notice"
  | "password_change_notice"
  | "password_reset_delivery"
  | "provider_disconnect_notice"
  | "session_revocation_notice";

export async function runAfterResponse(
  taskName: AfterResponseTaskName,
  task: () => Promise<void>,
) {
  const monitoredTask = async () => {
    try {
      await task();
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "after_response_task_failed",
        task: taskName,
        ...errorLogMetadata(error),
      }));
    }
  };

  if (process.env.NODE_ENV === "test") {
    await monitoredTask();
    return;
  }
  try {
    after(monitoredTask);
  } catch {
    // after() is only available inside a request scope. Outside one (for
    // example in an operator script) run the task without blocking the caller;
    // monitoredTask already reports failures.
    void monitoredTask();
  }
}
