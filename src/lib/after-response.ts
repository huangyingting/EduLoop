import { after } from "next/server";

export async function runAfterResponse(task: () => Promise<void>) {
  if (process.env.NODE_ENV === "test") {
    await task();
    return;
  }
  after(task);
}
