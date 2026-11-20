// AMC provenance arrives as "2002 AMC 10A · 第 3 题 | 2002 AMC 12A · 第 3 题":
// one question can occupy slots in several papers. Parsing the slots lets the
// importer rebuild every paper exactly, including shared AMC 10/12 problems.

export type ContestSlot = {
  paperKey: string;
  year: number;
  contest: string;
  level: "AMC-8" | "AMC-10" | "AMC-12";
  problemNumber: number;
};

// AJHSME was the name of AMC 8 before 1999; 2002 also had practice papers
// (AMC 10P/12P), and 2021 had a second, "Fall" sitting.
const SLOT_PATTERN = /^(\d{4})\s+(?:(Fall)\s+)?(AMC\s+(8|10|12)([ABP])?|AJHSME)\s*·\s*第\s*(\d{1,2})\s*题$/u;

export function parseContestSlots(sourcePaper: string): ContestSlot[] {
  return sourcePaper.split("|").map((part) => part.trim()).flatMap((part) => {
    const match = part.match(SLOT_PATTERN);
    if (!match) return [];
    const [, year, season, contest, amcLevel, variant, number] = match;
    const level = amcLevel ?? "8";
    const normalizedContest = `${season ? `${season} ` : ""}${contest.replace(/\s+/gu, " ")}`;
    const seasonKey = season ? `${season.toLowerCase()}-` : "";
    return [{
      paperKey: amcLevel ? `${year}-${seasonKey}amc-${level}${variant ? variant.toLowerCase() : ""}` : `${year}-ajhsme`,
      year: Number(year),
      contest: normalizedContest,
      level: `AMC-${level}` as ContestSlot["level"],
      problemNumber: Number(number),
    }];
  });
}

export const CONTEST_RULES = {
  "AMC-8": { questionCount: 25, durationMinutes: 40, correctPoints: 1, blankPoints: 0 },
  "AMC-10": { questionCount: 25, durationMinutes: 75, correctPoints: 6, blankPoints: 1.5 },
  "AMC-12": { questionCount: 25, durationMinutes: 75, correctPoints: 6, blankPoints: 1.5 },
} as const;

export function contestScore(level: ContestSlot["level"], results: Array<boolean | null>) {
  const rules = CONTEST_RULES[level];
  const correct = results.filter((result) => result === true).length;
  const blank = results.filter((result) => result === null).length;
  return { correct, blank, wrong: results.length - correct - blank, score: correct * rules.correctPoints + blank * rules.blankPoints };
}
