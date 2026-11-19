import { describe, expect, it } from "vitest";
import { QUESTION_TICKET_TTL_MS, issueQuestionTicket, verifyQuestionTicket } from "./question-ticket";

const secret = "a-test-secret-that-is-long-enough-for-hmac-signing-0123456789";

describe("question tickets", () => {
  it("verify only for the served question and only until they expire", () => {
    const now = 1_800_000_000_000;
    const ticket = issueQuestionTicket("question-1", now, secret);
    expect(verifyQuestionTicket(ticket, "question-1", now + 1_000, secret)).toBe(true);
    expect(verifyQuestionTicket(ticket, "question-2", now + 1_000, secret)).toBe(false);
    expect(verifyQuestionTicket(ticket, "question-1", now + QUESTION_TICKET_TTL_MS + 1, secret)).toBe(false);
    expect(verifyQuestionTicket(ticket, "question-1", now, "another-secret-of-sufficient-length-0123456789-abcdef")).toBe(false);
  });

  it("rejects malformed and far-future tickets", () => {
    const now = 1_800_000_000_000;
    expect(verifyQuestionTicket(undefined, "question-1", now, secret)).toBe(false);
    expect(verifyQuestionTicket("not-a-ticket", "question-1", now, secret)).toBe(false);
    const forgedFuture = issueQuestionTicket("question-1", now + 10 * QUESTION_TICKET_TTL_MS, secret);
    expect(verifyQuestionTicket(forgedFuture, "question-1", now, secret)).toBe(false);
  });
});
