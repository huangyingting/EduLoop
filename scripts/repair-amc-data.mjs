import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPAIRS = [
  ["data/en/amc8.json", "57a0bb80c6e1698e9b75b44fe355cc81", "question_info.raw_content.title", "If each of the three operation signs,,,$+- \\times$, is used exactly ONCE", "If each of the three operation signs $+$, $-$, and $\\times$ is used exactly once"],
  ["data/en/amc8.json", "57a0bb80c6e1698e9b75b44fe355cc81", "solution_info.0.solution_info", "The six permutations of,+- and $\\times$ yield", "The six permutations of $+$, $-$, and $\\times$ yield"],
  ["data/en/amc8.json", "72d6b6ee74fb10eccbeffb165ffdd4e9", "solution_info.0.solution_info", "more more", "more"],
  ["data/en/amc10.json", "5064936057ee8a649c63e35fde6dd85c", "solution_info.2.solution_info", "to to", "to"],
  ["data/en/amc10.json", "d2fddc836f2453edf2512f3b47cd659c", "solution_info.1.solution_info", "both both", "both"],
  ["data/en/amc10.json", "3345ef7c78bdaf23959d74e18eb801cc", "solution_info.1.solution_info", "Basically the pattern goes: odd, odd, even, odd odd, even, odd, odd even…", "Basically the pattern goes: odd, odd, even, odd, odd, even, odd, odd, even…"],
  ["data/en/amc10.json", "766fcb66930c47707f73e34e10611360", "solution_info.13.solution_info", "out out", "out"],
  ["data/en/amc10.json", "bc11d60f42308f2c39f47596e560127a", "solution_info.3.solution_info", "spelling and and typos", "spelling and typos"],
  ["data/en/amc10.json", "bbaf8f9511f82335d68413e0b492d34e", "solution_info.0.solution_info", "ratio of of their areas", "ratio of their areas"],
  ["data/en/amc10.json", "edc427109fb1149c8848ba9ccdd67828", "solution_info.0.solution_info", "terms and and completing", "terms and completing"],
  ["data/en/amc10.json", "f47b86da51618f9c0b9ba706b3f1dda9", "solution_info.2.solution_info", "We can can substitute", "We can substitute"],
  ["data/en/amc10.json", "ff82749f93b0a6b10c1f7640349ce962", "solution_info.4.solution_info", "how many many vector tuples", "how many vector tuples"],
  ["data/en/amc10.json", "3b8ce873e6b18a871c63ed5e49602f5b", "solution_info.2.solution_info", "There's are $2$ ways", "There are $2$ ways"],
  ["data/en/amc10.json", "3b8ce873e6b18a871c63ed5e49602f5b", "solution_info.2.solution_info", "and and one valid valid seat", "and one valid seat"],
  ["data/en/amc10.json", "ba2d63a4e21889ca6df4a8cc93836f9e", "solution_info.10.solution_info", "odd numbers an an even number", "odd numbers and an even number"],
  ["data/en/amc10.json", "ba2d63a4e21889ca6df4a8cc93836f9e", "solution_info.12.solution_info", "have an an odd number", "have an odd number"],
  ["data/en/amc12.json", "aa8c07e9105999e23f40c06a72e0c0d4", "question_info.raw_content.title", "less than than", "less than"],
  ["data/en/amc12.json", "09d294a33f3b59396f051802d4315627", "solution_info.0.solution_info", "there are are exactly two circles", "there are exactly two circles"],
  ["data/en/amc12.json", "c70a9bc9ed9458997d35fbb240810e87", "solution_info.0.solution_info", "terms and and completing", "terms and completing"],
  ["data/en/amc12.json", "f59e14e7cc69ee0b029bb5d12cce15c6", "solution_info.2.solution_info", "All other cases cases do work", "All other cases do work"],
  ["data/en/amc12.json", "27c1ad07b339dc41f93dacae60ec2cf1", "solution_info.0.solution_info", "Note\nNote that you can quickly tell", "Note that you can quickly tell"],
  ["data/en/amc12.json", "7090f3e8940e9f3cd6f15b9f05c16934", "solution_info.0.solution_info", "log log curve", "log-log curve", 2],
  ["data/zh-CN/amc12.json", "23cd4fd7ec852275cce481f4d785a71e", "solution_info.0.solution_info", "为使使用的电缆数最大", "为使电缆数最大"],
];

function fieldContainer(record, fieldPath) {
  const keys = fieldPath.split(".");
  const leaf = keys.pop();
  let container = record;
  for (const key of keys) {
    if (container?.[key] === undefined) {
      throw new Error(`Missing field ${fieldPath} in ${record.id}`);
    }
    container = container[key];
  }
  return [container, leaf];
}

let repairedFields = 0;
for (const [filename, id, fieldPath, search, replacement, expectedCount = 1] of REPAIRS) {
  const filepath = path.resolve(filename);
  const questions = JSON.parse((await readFile(filepath, "utf8")).replace(/^\uFEFF/, ""));
  const matches = questions.filter((question) => question.id === id);
  if (matches.length !== 1) {
    throw new Error(`Repair ${filename}:${id} expected one record, received ${matches.length}`);
  }
  const [container, leaf] = fieldContainer(matches[0], fieldPath);
  const value = String(container[leaf] ?? "");
  const matchCount = value.split(search).length - 1;
  const replacementCount = value.split(replacement).length - 1;
  if (matchCount === 0 && replacementCount >= expectedCount) {
    continue;
  }
  if (matchCount !== expectedCount) {
    throw new Error(`Repair ${filename}:${id}:${fieldPath} expected ${expectedCount} match(es) for ${JSON.stringify(search)}, received ${matchCount}`);
  }
  container[leaf] = value.replaceAll(search, () => replacement);
  await writeFile(filepath, `${JSON.stringify(questions, null, 2)}\n`);
  repairedFields += 1;
}

console.log(JSON.stringify({ repairedFields }, null, 2));
