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
  ["data/en/amc12.json", "f59e14e7cc69ee0b029bb5d12cce15c6", "solutions.2", "All other cases cases do work", "All other cases do work"],
  ["data/en/amc12.json", "7090f3e8940e9f3cd6f15b9f05c16934", "solutions.0", "log log curve", "log-log curve", 2],
  ["data/zh-CN/amc12.json", "23cd4fd7ec852275cce481f4d785a71e", "solutions.0", "为使使用的电缆数最大", "为使电缆数最大"],

  // Wave 3 AMC LaTeX & contributor signature repairs
  ["data/en/amc8.json", "5217ae2d852a5db6164d22ae5a7b7b06", "options.E", "$\\dfrac{7}{4}$", "$\\dfrac{7}{27}$"],
  ["data/en/amc8.json", "5217ae2d852a5db6164d22ae5a7b7b06", "solutions.0", "Answer: \\boxed", "Answer: $\\boxed{\\textbf{(E) }\\dfrac{7}{27}}$"],
  ["data/en/amc8.json", "21446f7db3c5247784fcfb844844a12a", "solutions.0", "Answer: \\boxed", "Answer: $\\boxed{\\textbf{(A) }8}$"],
  ["data/zh-CN/amc8.json", "c48258254e5da55823bfc139e8067cf5", "stem", "$AB=$10 \\mathrm{~cm}$$，$CD=$17 \\mathrm{~cm}$$", "$AB=10 \\mathrm{~cm}$，$CD=17 \\mathrm{~cm}$"],
  ["data/zh-CN/amc8.json", "5859c7523e0356735f7ef3e930bac55f", "solutions.0", "$R = $\\dfrac{\\dfrac{1}{2}EC.JI}{s^2}$ = $\\dfrac{\\dfrac{1}{2}(s\\sqrt3)(s\\sqrt2)}{s^2}$ = $\\dfrac{\\sqrt6}{2}$$", "$R = \\dfrac{\\dfrac{1}{2}EC\\cdot JI}{s^2} = \\dfrac{\\dfrac{1}{2}(s\\sqrt3)(s\\sqrt2)}{s^2} = \\dfrac{\\sqrt6}{2}$"],
  ["data/en/amc10.json", "4fbaa1518fbe729abcf6af7654dc1e12", "solutions.1", "Thus we have $S(N) \\bmod 9 \\). In this case, we have $ S(n) = 1274$, and therefore we have $S(n) \\bmod 9 \\equiv 1274 \\bmod 9 \\equiv 5 \\bmod 9$. Thus, \\( S(n+1) $ must be congruent", "Thus we have $S(N) \\equiv N \\pmod 9$. In this case, we have $S(n) = 1274$, and therefore we have $S(n) \\bmod 9 \\equiv 1274 \\bmod 9 \\equiv 5 \\bmod 9$. Thus, $S(n+1)$ must be congruent"],
  ["data/en/amc10.json", "afc226198337be0adf20a150a4d66dc2", "solutions.1", "$\\(\\left({\\dfrac{3}{2}}, {\\dfrac{1}{2}}\\right)\\)$", "$\\left({\\dfrac{3}{2}}, {\\dfrac{1}{2}}\\right)$"],
  ["data/en/amc10.json", "052af87fdd4e687644cf53bd74dcf2d3", "solutions.1", "\np^{2} \\cdot v_{p}\\left(p^{2}!\\right)=p^{3}+p^\n", "\n$p^{2} \\cdot v_{p}\\left(p^{2}!\\right)=p^{3}+p^{2}$\n"],
  ["data/en/amc10.json", "1d207b86979d9ee71fb0b07298e6d6c2", "solutions.6", "$\\begin{tabular}{lllllllll}$\nConfiguration $C$ $B$ $A$ $D$ $C$ $D$ $A$ $B$\n$D$ $A$ $B$ $C$ $B$ $A$ $D$ $C$\n$\\end{tabular}$\n\nThe $20$th\n\nTransformation\n\n$L \\quad R$\n\n$H \\quad V$", "$$\\begin{array}{c|cccc|cccc} \\text{Configuration} & C\\ B & A\\ D & C\\ D & A\\ B \\\\ & D\\ A & B\\ C & B\\ A & D\\ C \\\\ \\hline \\text{20th Transformation} & L & R & H & V \\end{array}$$"],
  ["data/en/amc10.json", "751d0e84f4c87059f719e77bcb2b44b4", "solutions.8", "and k+15 \\leq \\sqrt\n", "and $k+15 \\leq \\sqrt{70 k+50}$.\n"],
  ["data/en/amc10.json", "751d0e84f4c87059f719e77bcb2b44b4", "solutions.8", "or k>19+\\sqrt\n", "or $k>19+\\sqrt{155}$.\n"],
  ["data/en/amc10.json", "dd04eca4c374da249ddd2384489c771e", "solutions.0", "(\\text{D})\\boxed{5}", "$(\\text{D})\\ \\boxed{5}$"],
  ["data/en/amc10.json", "018ee9ddb6d7f031235201fbf96cdd11", "solutions.0", "Now we have use Pythagorean: x^2+(x\\cdot(2+\\sqrt{3}))^2=3\\sqrt{2}^2\\Rightarrow x^2+x^2\\cdot(7+4\\sqrt{3})=18\\Rightarrow x^2=\\frac{18}{8+4\\sqrt{3}}=\\frac{9}{4 + 2\\sqrt{3}}\\Rightarrow x^2 = \\frac{36 - 18\\sqrt{3}}", "Now we use the Pythagorean Theorem: $x^2+(x\\cdot(2+\\sqrt{3}))^2=(3\\sqrt{2})^2\\Rightarrow x^2+x^2\\cdot(7+4\\sqrt{3})=18\\Rightarrow x^2=\\frac{18}{8+4\\sqrt{3}}=\\frac{9}{4 + 2\\sqrt{3}}\\Rightarrow x^2 = \\frac{36 - 18\\sqrt{3}}{4}$."],
  ["data/en/amc10.json", "018ee9ddb6d7f031235201fbf96cdd11", "solutions.0", "and the answer is 108 + 36 + 3 = \\boxed", "and the answer is $108 + 36 + 3 = \\boxed{\\textbf{(E) }147}$."],
  ["data/en/amc10.json", "3de08ca4d219200ce497b0da2c662727", "solutions.0", "~Note that $lcm(6,8) = 24$, which should reveal the answer a lot faster than testing.", "Note that $\\operatorname{lcm}(6,8) = 24$, which reveals the answer much faster than testing."],
  ["data/en/amc10.json", "46673344338d52b9d51ff1f2b0072f52", "solutions.0", "~Note by SixthGradeBookWorm927: 'RZT' is the Rational Zero Theorem, otherwise known as the Rational Root Theorem.", "Note: 'RZT' is the Rational Zero Theorem, otherwise known as the Rational Root Theorem."],
  ["data/en/amc10.json", "c8dd6c070bf2fe57758220f10c556818", "solutions.0", "~Eggopancakes Note that the integer sum formula for perfect squares is $\\frac{n(n+1)(n+3)}{6}$.\n\n~ ReturnedSolver fix: integer sum formula for perfect squares is $\\frac{n(n+1)(2n+1)}{6}$.", "Note that the integer sum formula for perfect squares is $\\frac{n(n+1)(2n+1)}{6}$."],
  ["data/en/amc10.json", "5ed1e48bbd8c9afd2ce31bd1aa59660a", "solutions.0", "~Boywithnuke(Goal to 10 followers)\n\n~aldzandrtc(Fixed mistake, original = \"Case 3: $M = 2$. This occurs when one jar has 2 coins, another jar has 1 coin, and the last jar has 0 coins.\nWe can choose which jar gets 2 coins in 3 ways, which jar gets 1 coin in 2 ways, and which jar is alone in 3 ways. Therefore, there are $3 \\cdot 2 \\cdot 3 = 18$ outcomes. Thus, $\\Pr(M=2) = \\frac{18}{27} = \\frac{2}{3}$.\" After we choose which jar gets 2 coins, which jar gets one, we don't need to multiply by 3 to see which jar gets 0, because once the first 2 are picked, the last jar is set. However, the number $\\frac{2}{3}$ is coincidentally correct, because you need assign which 2 coins go into the jar with 2 coins, so you multiply by 3 choose 2, which is 3. Feel free to fix it up, because I am not experienced with latex)\n\n~ Minor edits by SixthGradeBookWorm927\n~ Minor edit by AlgeBruh16\n\n~ Minor edit by jeffyang2025\n\n", ""],
  ["data/zh-CN/amc10.json", "a5ff8d9d15c1edde86e5669110bc6c3a", "solutions.1", "$$\\boxed{\\textbf{(C)}\\ 3^{128}-2^{128}$$", "$$\\boxed{\\textbf{(C)}\\ 3^{128}-2^{128}}$$"],
  ["data/zh-CN/amc10.json", "a5ff8d9d15c1edde86e5669110bc6c3a", "solutions.2", "$$\\boxed{\\textbf{(C)}\\ 3^{128}-2^{128}.$$", "$$\\boxed{\\textbf{(C)}\\ 3^{128}-2^{128}}.$$"],
  ["data/zh-CN/amc10.json", "a7a5a46cb0017452f98e0c114b79859e", "solutions.2", "$$\\boxed{\\textbf{(D)}\\ \\frac{8a^2}{a^2+1}$$", "$$\\boxed{\\textbf{(D)}\\ \\frac{8a^2}{a^2+1}}$$"],
  ["data/zh-CN/amc10.json", "f88108339ba39e4c6381a15aef23dbff", "solutions.0", "由于 0\\le e_1\\le4、0\\le d_2\\le5，个位比较迫使 e_1=d_2；十位比较又迫使 c_2\\in\\{0,5\\}。再由两种进制表示同一个 N，约去共同的个位后可得\n\\[\n5(125a_1+25b_1+5c_1+d_1)=6(36a_2+6b_2+c_2).\n\\]\n因此 a_2+b_2\\equiv0\\pmod5。结合 100\\le N\\le999，六进制最高两位 (a_2,b_2) 只有", "由于 $0\\le e_1\\le4$、$0\\le d_2\\le5$，个位比较迫使 $e_1=d_2$；十位比较又迫使 $c_2\\in\\{0,5\\}$。再由两种进制表示同一个 $N$，约去共同的个位后可得\n\\[\n5(125a_1+25b_1+5c_1+d_1)=6(36a_2+6b_2+c_2).\n\\]\n因此 $a_2+b_2\\equiv0\\pmod5$。结合 $100\\le N\\le999$，六进制最高两位 $(a_2,b_2)$ 只有"],
  ["data/en/amc12.json", "1d9e7602263663a5daaaf7c461743c12", "solutions.0", "Thus the coefficient of $x^{28}$ is \\boxed", "Thus the coefficient of $x^{28}$ is $\\boxed{224}$."],
  ["data/en/amc12.json", "3abafd03a5a8a86f706aa750bb98951c", "solutions.0", "Adding up give $216+216$=\\boxed", "Adding up gives $216+216=\\boxed{(E)432}$."],
  ["data/en/amc12.json", "d1a6d31f7abe550aac5e6876e569c944", "solutions.0", "$\\sin A=\\dfrac{3 \\sqrt{15}}{16}, \\quad \\sin B=\\dfrac{\\sqrt{15}}{8}, \\quad$ and \\quad\\sin C=\\dfrac{\\sqrt{15}}", "$\\sin A=\\dfrac{3 \\sqrt{15}}{16}, \\quad \\sin B=\\dfrac{\\sqrt{15}}{8}, \\quad \\text{and} \\quad \\sin C=\\dfrac{\\sqrt{15}}{4}.$"],
  ["data/en/amc12.json", "4bf13f208977f76ac9594bafe4152d6c", "solutions.0", "\n[A B C D]=k\\sqrt{3}+\\sqrt{36-k^{2}}+10\\sqrt\n", "\n$[A B C D]=k\\sqrt{3}+\\sqrt{36-k^{2}}+10\\sqrt{3}.$\n"],
  ["data/en/amc12.json", "a8ee0142b0def76f26020202ad555995", "solutions.0", "\n(100 \\%-70 \\%) \\cdot\\left(1-\\dfrac{1}{3}\\right)=30 \\% \\cdot \\dfrac{2}{3}=\\boxed\n", "\n$(100 \\%-70 \\%) \\cdot\\left(1-\\dfrac{1}{3}\\right)=30 \\% \\cdot \\dfrac{2}{3}=\\boxed{(C)20 \\%}$\n"],
  ["data/en/amc12.json", "a49ae7a05f4d572a44a6bc464b7367df", "solutions.0", "$0 \\Longrightarrow x=$ \\dfrac{n \\pm \\sqrt{n^{2}-4 a n^{2}}}", "$0 \\Longrightarrow x= \\dfrac{n \\pm \\sqrt{n^{2}-4 a n^{2}}}{2a}.$"],

  // Wave 4 AMC URL, image-reference, and inline contributor note repairs
  ["data/en/amc8.json", "4f5f71e7724917441e2594a485476f88", "solutions.0", " (See https://arxiv.org/pdf/1602.06208.pdf.)", ""],
  ["data/zh-CN/amc8.json", "4f5f71e7724917441e2594a485476f88", "solutions.0", "（见https://arxiv.org/pdf/1602.06208.pdf。）", ""],
  ["data/en/amc8.json", "cce96b0cdf1c65f61bea3822dc4a7285", "solutions.0", "$Note:$ Input data was taken from the NASA website https://mars.nasa.gov/mars2020/.\n\n", ""],
  ["data/zh-CN/amc8.json", "cce96b0cdf1c65f61bea3822dc4a7285", "solutions.0", "$Note:$ 输入数据来自 NASA 网站 https://mars.nasa.gov/mars2020/。\n\n", ""],
  ["data/en/amc10.json", "00f82f94ecadadc5f226e071dcbefd8f", "solutions.0", " See this website:\n\ndecisionsciencenews.com/?s=happens+next", ""],
  ["data/en/amc10.json", "344051be2dd9e6d31574f57e55ed109c", "solutions.0", " (look at this problem to get a better idea of what's happening: https://artofproblemsolving.com/wiki/index.php/2011_AMC_10B_Problems/Problem_24)", ""],
  ["data/en/amc10.json", "344051be2dd9e6d31574f57e55ed109c", "solutions.0", " (see https://en.wikipedia.org/wiki/Farey_sequence#Farey_neighbours)", ""],
  ["data/en/amc10.json", "344051be2dd9e6d31574f57e55ed109c", "solutions.0", " Wikipedia page: https://en.wikipedia.org/wiki/Pick%27s_theorem.", ""],
  ["data/en/amc10.json", "8428c2de928d9ab9debcc590c4b49685", "solutions.4", " ~ primegn.", "."],
  ["data/en/amc10.json", "8428c2de928d9ab9debcc590c4b49685", "solutions.4", " ~Puer_137)", ")"],
  ["data/en/amc10.json", "dda3ada2ccd5c3ac6628ec704b430bbb", "solutions.1", " ~KingRavi)", ")"],
  ["data/en/amc10.json", "1d61c20cadddf582fabc1649d95e5413", "solutions.0", " ~ YTH)", ")"],
  ["data/en/amc10.json", "39932dd34ea8cc4e71b30d54cde465e6", "solutions.0", "Note from ~milquetoast:", "Note:"],
  ["data/en/amc10.json", "584efebe71a94be6e09f5b51d4c17b0e", "solutions.0", " ~ minor $\\LaTeX$ edits by dolphin7", ""],
  ["data/en/amc10.json", "ed7eb6a3d013a7ca5884177151a7122c", "solutions.4", "(not named in my image)", "$K$", 2],
];

const AMC_FILES = [
  "data/en/amc8.json",
  "data/en/amc10.json",
  "data/en/amc12.json",
  "data/zh-CN/amc8.json",
  "data/zh-CN/amc10.json",
  "data/zh-CN/amc12.json",
];

function cleanAmcMarkupAndSignatures(text, isZh = false) {
  let out = String(text ?? "")
    .replace(/\\section\*\{另一种解法\}/gu, "另一种解法：")
    .replace(/\\section\*\{OR\}/gu, "OR")
    .replace(/\n\n\\mathrm\n\n/gu, isZh ? "\n\n另一种解法：\n\n" : "\n\nOR\n\n")
    .replace(/\n\n\\end\n\n/gu, "\n\n")
    .replace(
      /\s*~+\s*@?[A-Za-z][A-Za-z0-9_. ]*(?:\([A-Za-z0-9_ ]+\))?(?:\s*~+\s*[A-Za-z0-9_. ()]+)?~*\s*$/gmu,
      "",
    );

  const lineDropRe =
    /^\s*(?:~+\s*@?[A-Za-z0-9_\\$]|vladimir\.shelomovskii@gmail\.com,\s*vvsss|emilyyunhanq@gmail\.com|Emily Q|Solution by [A-Za-z0-9_~ ]+|\((?:[Ee]dited|minor edits)[^)]*\)|By Antony Huang.*|Video Solution.*|https?:\/\/(?:www\.)?(?:youtube\.com|youtu\.be|imgur\.com|mathworld\.wolfram\.com)\S*|decisionsciencenews\.com\S*|(?:[Mm]inor |[Vv]ery small )?(?:latex |rephrasing )?(?:edits?|corrections?) (?:by|from|for) [^\n]+|A very similar solution offered by [^\n]+|added a single R to spell [^\n]+|i feel this explanation [^\n]+|17:51, 6 November 2025[^\n]+|\$\\newline\$\s*~[^\n]+)\s*$/u;

  const lines = out.split("\n").filter((line) => !lineDropRe.test(line));
  while (lines.length > 0) {
    const last = lines[lines.length - 1].trim();
    if (!last || /^[-–—]{1,2}\s*[A-Za-z_@][^\n$]{0,90}$/u.test(last)) {
      lines.pop();
    } else {
      break;
    }
  }
  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

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
let cleanedTextFields = 0;

for (const filename of AMC_FILES) {
  const filepath = path.resolve(filename);
  const isZh = filename.includes("/zh-CN/");
  const questions = JSON.parse((await readFile(filepath, "utf8")).replace(/^\uFEFF/, ""));
  let changed = false;

  for (const [, id, fieldPath, search, replacement, expectedCount = 1] of REPAIRS.filter(([f]) => f === filename)) {
    const matches = questions.filter((question) => question.id === id);
    if (matches.length !== 1) {
      throw new Error(`Repair ${filename}:${id} expected one record, received ${matches.length}`);
    }
    const [container, leaf] = fieldContainer(matches[0], fieldPath);
    const value = String(container[leaf] ?? "");
    const matchCount = value.split(search).length - 1;
    const replacementCount = value.split(replacement).length - 1;
    if (matchCount === 0 && (replacement === "" || replacementCount >= expectedCount)) {
      continue;
    }
    if (matchCount !== expectedCount) {
      throw new Error(`Repair ${filename}:${id}:${fieldPath} expected ${expectedCount} match(es) for ${JSON.stringify(search)}, received ${matchCount}`);
    }
    container[leaf] = value.replaceAll(search, () => replacement);
    repairedFields += 1;
    changed = true;
  }

  for (const question of questions) {
    const nextStem = cleanAmcMarkupAndSignatures(question.stem, isZh);
    if (nextStem !== question.stem) {
      question.stem = nextStem;
      cleanedTextFields += 1;
      changed = true;
    }
    question.solutions = (question.solutions ?? []).map((sol) => {
      const nextSol = cleanAmcMarkupAndSignatures(sol, isZh);
      if (nextSol !== sol) {
        cleanedTextFields += 1;
        changed = true;
      }
      return nextSol;
    });
  }

  if (changed) {
    await writeFile(filepath, `${JSON.stringify(questions, null, 2)}\n`);
  }
}

for (const base of ["amc8.json", "amc10.json", "amc12.json"]) {
  const enPath = path.resolve(`data/en/${base}`);
  const zhPath = path.resolve(`data/zh-CN/${base}`);
  const enQuestions = JSON.parse((await readFile(enPath, "utf8")).replace(/^\uFEFF/, ""));
  const zhQuestions = JSON.parse((await readFile(zhPath, "utf8")).replace(/^\uFEFF/, ""));
  let enChanged = false;
  let zhChanged = false;

  for (let i = 0; i < enQuestions.length; i += 1) {
    const enQ = enQuestions[i];
    const zhQ = zhQuestions[i];
    if (!enQ || !zhQ || enQ.id !== zhQ.id) continue;
    const enSols = enQ.solutions ?? [];
    const zhSols = zhQ.solutions ?? [];
    if (enSols.length !== zhSols.length) continue;

    const seenEn = new Set();
    const seenZh = new Set();
    const nextEn = [];
    const nextZh = [];
    for (let k = 0; k < enSols.length; k += 1) {
      const eSol = enSols[k];
      const zSol = zhSols[k];
      if (
        !eSol ||
        !zSol ||
        /^Notice that only answer choices \(a\) and \(c\) sum to 180/u.test(eSol) ||
        /^The problem mentions the sum of digits - recall that if a number is divisible by 9[\s\S]*Guess that the answer must therefore be/u.test(eSol) ||
        /let’s move on and pray that our answer is right/u.test(eSol)
      ) {
        continue;
      }
      if (seenEn.has(eSol) || seenZh.has(zSol)) continue;
      seenEn.add(eSol);
      seenZh.add(zSol);
      nextEn.push(eSol);
      nextZh.push(zSol);
    }
    if (nextEn.length > 0 && nextEn.length !== enSols.length) {
      enQ.solutions = nextEn;
      zhQ.solutions = nextZh;
      cleanedTextFields += 2;
      enChanged = true;
      zhChanged = true;
    }
  }

  if (enChanged) await writeFile(enPath, `${JSON.stringify(enQuestions, null, 2)}\n`);
  if (zhChanged) await writeFile(zhPath, `${JSON.stringify(zhQuestions, null, 2)}\n`);
}

console.log(JSON.stringify({ repairedFields, cleanedTextFields }, null, 2));
