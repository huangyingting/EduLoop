import { readFile } from "node:fs/promises";
import { DEFAULT_CONTENT_FILES as files, DEFAULT_CONTENT_LOCALE, localeFileUrl } from "./content-manifest.mjs";

const rows = [];
for (const file of files) {
  const source = (await readFile(localeFileUrl(DEFAULT_CONTENT_LOCALE, file), "utf8")).replace(/^\uFEFF/, "");
  rows.push(...JSON.parse(source).map((question) => ({ ...question, __file: file })));
}
const group = (key) => Object.fromEntries(Object.entries(rows.reduce((result, item) => {
  const value = String(key(item)); result[value] = (result[value] ?? 0) + 1; return result;
}, {})).sort((a, b) => b[1] - a[1]));
const OPTION_LABELS = ["A", "B", "C", "D", "E"];
const options = (item) => OPTION_LABELS.filter((label) => String(item.options?.[label] ?? "").trim());
const gradeBandForGrade = (grade) => {
  if (/^[一二三四五六]年级$/.test(grade)) return "小学";
  if (/^(?:[七八九]年级|初中综合)$/.test(grade)) return "初中";
  if (/^高[一二三]$/.test(grade)) return "高中";
  return grade;
};
const report = {
  files: files.length, total: rows.length,
  gradeBands: group((item) => gradeBandForGrade(item.grade)), subjects: group((item) => item.subject),
  grades: group((item) => item.grade), difficulties: group((item) => item.difficulty), types: group((item) => item.type),
  quality: {
    missingStem: rows.filter((item) => !String(item.stem ?? "").trim()).length,
    missingExplanation: rows.filter((item) => !item.solutions?.some((part) => String(part ?? "").trim())).length,
    withOptions: rows.filter((item) => options(item).length).length,
    optionCounts: group((item) => options(item).length),
    withLatex: rows.filter((item) => /\$\$|\\frac|\\rm/.test(String(item.stem ?? ""))).length,
    duplicateIds: rows.length - new Set(rows.map((item) => item.id)).size,
    duplicateStems: rows.length - new Set(rows.map((item) => String(item.stem ?? "").trim())).size,
  },
};
console.log(JSON.stringify(report, null, 2));
