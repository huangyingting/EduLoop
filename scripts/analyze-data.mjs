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
const raw = (item) => item.question_info?.raw_content ?? {};
const options = (item) => ["a", "b", "c", "d", "e"].filter((key) => String(raw(item)[`option_${key}`] ?? "").trim());
const report = {
  files: files.length, total: rows.length,
  gradeBands: group((item) => item.grade_band), subjects: group((item) => item.course),
  grades: group((item) => item.grade), difficulties: group((item) => item.difficulty), types: group((item) => item.type),
  quality: {
    missingStem: rows.filter((item) => !String(raw(item).title ?? "").trim()).length,
    missingExplanation: rows.filter((item) => !item.solution_info?.some((part) => String(part.solution_info ?? "").trim())).length,
    withOptions: rows.filter((item) => options(item).length).length,
    optionCounts: group((item) => options(item).length),
    withLatex: rows.filter((item) => /\$\$|\\frac|\\rm/.test(String(raw(item).title ?? ""))).length,
    withChildren: rows.filter((item) => item.children?.length).length,
    duplicateIds: rows.length - new Set(rows.map((item) => item.id)).size,
    duplicateStems: rows.length - new Set(rows.map((item) => String(raw(item).title ?? "").trim())).size,
  },
};
console.log(JSON.stringify(report, null, 2));
