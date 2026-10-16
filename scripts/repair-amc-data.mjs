import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const REPAIRS = [
  ["data/en/amc8.json", "57a0bb80c6e1698e9b75b44fe355cc81", "stem", "If each of the three operation signs,,,$+- \\times$, is used exactly ONCE", "If each of the three operation signs $+$, $-$, and $\\times$ is used exactly once"],
  ["data/en/amc8.json", "57a0bb80c6e1698e9b75b44fe355cc81", "solutions.0", "The six permutations of,+- and $\\times$ yield", "The six permutations of $+$, $-$, and $\\times$ yield"],
  ["data/en/amc8.json", "72d6b6ee74fb10eccbeffb165ffdd4e9", "solutions.0", "more more", "more"],
  ["data/en/amc10.json", "5064936057ee8a649c63e35fde6dd85c", "solutions.2", "to to", "to"],
  ["data/en/amc10.json", "d2fddc836f2453edf2512f3b47cd659c", "solutions.1", "both both", "both"],
  ["data/en/amc10.json", "3345ef7c78bdaf23959d74e18eb801cc", "solutions.1", "Basically the pattern goes: odd, odd, even, odd odd, even, odd, odd even…", "Basically the pattern goes: odd, odd, even, odd, odd, even, odd, odd, even…"],
  ["data/en/amc10.json", "766fcb66930c47707f73e34e10611360", "solutions.13", "out out", "out"],
  ["data/en/amc10.json", "bc11d60f42308f2c39f47596e560127a", "solutions.3", "spelling and and typos", "spelling and typos"],
  ["data/en/amc10.json", "bbaf8f9511f82335d68413e0b492d34e", "solutions.0", "ratio of of their areas", "ratio of their areas"],
  ["data/en/amc10.json", "edc427109fb1149c8848ba9ccdd67828", "solutions.0", "terms and and completing", "terms and completing"],
  ["data/en/amc10.json", "f47b86da51618f9c0b9ba706b3f1dda9", "solutions.2", "We can can substitute", "We can substitute"],
  ["data/en/amc10.json", "ff82749f93b0a6b10c1f7640349ce962", "solutions.4", "how many many vector tuples", "how many vector tuples"],
  ["data/en/amc10.json", "3b8ce873e6b18a871c63ed5e49602f5b", "solutions.2", "There's are $2$ ways", "There are $2$ ways"],
  ["data/en/amc10.json", "3b8ce873e6b18a871c63ed5e49602f5b", "solutions.2", "and and one valid valid seat", "and one valid seat"],
  ["data/en/amc10.json", "ba2d63a4e21889ca6df4a8cc93836f9e", "solutions.10", "odd numbers an an even number", "odd numbers and an even number"],
  ["data/en/amc10.json", "ba2d63a4e21889ca6df4a8cc93836f9e", "solutions.12", "have an an odd number", "have an odd number"],
  ["data/en/amc12.json", "aa8c07e9105999e23f40c06a72e0c0d4", "stem", "less than than", "less than"],
  ["data/en/amc12.json", "09d294a33f3b59396f051802d4315627", "solutions.0", "there are are exactly two circles", "there are exactly two circles"],
  ["data/en/amc12.json", "c70a9bc9ed9458997d35fbb240810e87", "solutions.0", "terms and and completing", "terms and completing"],
  ["data/en/amc12.json", "f59e14e7cc69ee0b029bb5d12cce15c6", "solutions.2", "All other cases cases do work", "All other cases do work"],
  ["data/en/amc12.json", "27c1ad07b339dc41f93dacae60ec2cf1", "solutions.0", "Note\nNote that you can quickly tell", "Note that you can quickly tell"],
  ["data/en/amc12.json", "7090f3e8940e9f3cd6f15b9f05c16934", "solutions.0", "log log curve", "log-log curve", 2],
  ["data/zh-CN/amc12.json", "23cd4fd7ec852275cce481f4d785a71e", "solutions.0", "为使使用的电缆数最大", "为使电缆数最大"],
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
