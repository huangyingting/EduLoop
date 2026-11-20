import { describe, expect, it } from "vitest";
import { contestScore, parseContestSlots } from "./contest-papers";

describe("contest paper provenance", () => {
  it("parses every paper slot a shared problem occupies", () => {
    expect(parseContestSlots("2002 AMC 10A · 第 3 题 | 2002 AMC 12A · 第 3 题")).toEqual([
      { paperKey: "2002-amc-10a", year: 2002, contest: "AMC 10A", level: "AMC-10", problemNumber: 3 },
      { paperKey: "2002-amc-12a", year: 2002, contest: "AMC 12A", level: "AMC-12", problemNumber: 3 },
    ]);
  });

  it("maps AJHSME, the pre-1999 AMC 8, and unlettered AMC 8 papers", () => {
    expect(parseContestSlots("1985 AJHSME · 第 1 题")).toEqual([
      { paperKey: "1985-ajhsme", year: 1985, contest: "AJHSME", level: "AMC-8", problemNumber: 1 },
    ]);
    expect(parseContestSlots("2019 AMC 8 · 第 25 题")[0]).toMatchObject({ paperKey: "2019-amc-8", level: "AMC-8", problemNumber: 25 });
    expect(parseContestSlots("2021 Fall AMC 10B · 第 7 题")).toEqual([
      { paperKey: "2021-fall-amc-10b", year: 2021, contest: "Fall AMC 10B", level: "AMC-10", problemNumber: 7 },
    ]);
    expect(parseContestSlots("2002 AMC 12P · 第 2 题")[0]).toMatchObject({ paperKey: "2002-amc-12p", contest: "AMC 12P", level: "AMC-12" });
    expect(parseContestSlots("")).toEqual([]);
    expect(parseContestSlots("某省期末试卷")).toEqual([]);
  });

  it("scores AMC 10/12 with blank credit and AMC 8 by correct answers only", () => {
    expect(contestScore("AMC-10", [true, true, null, false])).toEqual({ correct: 2, blank: 1, wrong: 1, score: 13.5 });
    expect(contestScore("AMC-8", [true, null, false])).toEqual({ correct: 1, blank: 1, wrong: 1, score: 1 });
  });
});

describe("bundled AMC provenance", () => {
  it("parses every slot into complete 25-problem papers", async () => {
    const { readFile } = await import("node:fs/promises");
    const papers = new Map<string, Set<number>>();
    let unparsed = 0;
    for (const file of ["amc8.json", "amc10.json", "amc12.json"]) {
      const records = JSON.parse((await readFile(`data/zh-CN/${file}`, "utf8")).replace(/^﻿/u, "")) as Array<{ sourcePaper: string }>;
      for (const record of records) {
        const parts = record.sourcePaper.split("|").filter((part) => part.trim());
        const slots = parseContestSlots(record.sourcePaper);
        unparsed += parts.length - slots.length;
        for (const slot of slots) papers.set(slot.paperKey, (papers.get(slot.paperKey) ?? new Set()).add(slot.problemNumber));
      }
    }
    expect(unparsed).toBe(0);
    expect(papers.size).toBe(143);
    expect([...papers.values()].every((numbers) => numbers.size === 25)).toBe(true);
  });
});
