// Comprehensive post-processing and editorial repairs for CJEval junior-high Chinese records.

export const CJEVAL_EXCLUDED_IDS = new Set([
  "b322acd92726ee4475566fea98ca185b", // train #527: 现代文阅读 missing reading passage
  "369620bbf4863cbc0c99aa7cd3b32cc0", // train #1057: 现代文阅读 missing reading passage
  "e0fb5848cfea070ce51e75cd16f7f075", // train #1082: 现代文阅读 missing reading passage
  "a33ac42806f8c2ef83a188bd99507662", // train #1285: 现代文阅读 missing reading passage
  "0f8838554c65ee5c51d1540eb1944356", // test #211: passage-less reading question ("文章中描述了水的多种形态存在哪些优点？")
]);

const CIRCLED_NUMBERS = [
  "①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩",
  "⑪", "⑫", "⑬", "⑭", "⑮", "⑯", "⑰", "⑱", "⑲", "⑳",
  "㉑", "㉒", "㉓", "㉔", "㉕", "㉖", "㉗", "㉘", "㉙", "㉚",
  "㉛", "㉜", "㉝", "㉞", "㉟",
];

function toCircled(n) {
  return CIRCLED_NUMBERS[n - 1] || `(${n})`;
}

const INLINE_ORDERING_IDS = new Set([
  "1216f061554e30cb84e60587566eaf91",
  "94083675ce2b098a07592789c9da6d69",
  "2f64c2be159947412b4943e495140428",
  "e6a73ca2ed9775417de4c328640b2472",
  "05f8d0475c83cc253f613f787d768e13",
  "6f83c77deca19f89b60f1de552503e4b",
  "dc9771ad18d19b9d6dd169ab82699259",
]);

const PASSAGE_PARA_EXTRA_IDS = new Set([
  "1e6b4a7faa88c56705f5f5f83cc09a54",
  "3b7a7d822e7a54e36800bd51d4aac53a",
  "96c0eeabc4433aea6ce6d3e20089e02d",
  "ad504067dbfc67641f24bc5d970189b6",
  "6515112bd3e20cec57ba0c0335f50c63",
]);

const KEEP_SPACE_BRACKET_IDS = new Set([
  "1b9f3834341b16c512a1f9bc4de4804e",
  "0e659f92f7fe9cfe32c9cd73c789e5f6",
  "629aaaad9f5f85fec52b05f9f578bc1b",
]);

export function cleanCjevalEscapesAndBrackets(text, id = "", isStem = false) {
  if (!text) return text;
  let s = String(text)
    .replace(/\\+n(?:(?![a-zA-Z])|(?=[A-Fa-f]\s*[.．、:：处]))/gu, "\n")
    .replace(/\\u3000/gu, "　")
    .replace(/（上标：\\uf081）|\\uf081|\uf081/giu, "①")
    .replace(/（上标：\\uf082）|\\uf082|\uf082/giu, "②")
    .replace(/（上标：\\uf083）|\\uf083|\uf083/giu, "③")
    .replace(/（上标：\\uf084）|\\uf084|\uf084/giu, "④")
    .replace(/\u0261/gu, "g")
    .replace(/[（(]\s*dotted\s*[）)]([\s\S]*?)[（(]\s*\/dotted\s*[）)]/giu, "【$1】")
    .replace(/【正确】【的一项/gu, "【正确】的一项")
    .replace(/【注释(?=\s*\n)/gu, "【注释】")
    .replace(/【注释[：:]/gu, "【注释】");

  if (id === "cd2f16b2ef02c16d6427e1c02bb77eea") {
    s = s.replace(/\s*\\u\s*/gu, " ");
  }
  if (id === "6515112bd3e20cec57ba0c0335f50c63") {
    s = s.replace(/\(6\s+我国古代/u, "（6）我国古代");
  }

  // Convert underlined whitespace blanks to ____
  if (!KEEP_SPACE_BRACKET_IDS.has(id)) {
    s = s.replace(/【\s+】/gu, "____");
  }
  s = s.replace(/【\s*__+\s*】/gu, "____");
  s = s.replace(/【\s*\(\s*\)\s*】/gu, "（   ）");
  s = s.replace(/【】/gu, "");
  // Unwrap punctuation-only brackets
  s = s.replace(/【([：:，,。；;！？“”‘’（）()、]+)】/gu, "$1");
  // Trim leading/trailing spaces inside 【...】 when non-empty
  if (!KEEP_SPACE_BRACKET_IDS.has(id)) {
    s = s.replace(/【\s*([^【】\s][^【】]*?)\s*】/gu, "【$1】");
  }
  // Collapse nested brackets like 【...【x】...】 -> 【...x...】
  let prev;
  do {
    prev = s;
    s = s.replace(/【([^【】]*?)【([^【】]*?)】([^【】]*?)】/gu, "【$1$2$3】");
  } while (s !== prev);

  // Merge adjacent per-character brackets 【不】【正】【确】 -> 【不正确】
  const isLabel = (x) => /^(?:[A-F]\.?|[①-⑳]|甲|乙|丙|丁|链接材料|材料[一二三四五]|助读资料[一二三]|注释?|选文[一二]?|[（(]?\d+[）)]?)$/u.test(x.trim());
  const isPinyin = (x) => /^[a-zA-Zāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜ\s]+$/u.test(x.trim());
  do {
    prev = s;
    s = s.replace(/【([^【】\n]+?)】【([^【】\n]+?)】/gu, (m, a, b, offset, full) => {
      if (isLabel(a) || isLabel(b) || isPinyin(a) || isPinyin(b)) return m;
      const tail = full.slice(offset + m.length, offset + m.length + 30);
      if (/^\s*(?:（\s*）|\(\s*\)|_{2,})\s*(?:（\s*）|\(\s*\)|_{2,})/u.test(tail)) return m;
      return `【${a}${b}】`;
    });
  } while (s !== prev);

  if (isStem) {
    // Strip leaked prompt/field labels
    s = s
      .replace(/^ques_type\s*[:：]\s*[^\n]+\n+/u, "")
      .replace(/^(?:ques_content\s*[:：]\s*)?(?:题目内容|问题内容|试题类型|试题内容|题目|问题|正文|句子)\s*[:：]\s*/gu, "")
      .replace(/(^|\n|（\d+）\s*)(?:题目内容|问题内容|试题类型|试题内容|题目|问题|正文|句子)\s*[:：]\s*/gu, "$1")
      .replace(/(?:作答|题)类型为T\/F[（(]对\/错[）)][：:。]?\s*/gu, "")
      .replace(/\n选项：\n(?=[A-E]\.\s)/gu, "\n");
  }

  // Strip LLM rewrite meta-commentary in solutions/answers
  s = s
    .replace(/【优化后?解析】\s*/gu, "")
    .replace(/[（(]?与原题解析保持一致，未进行大幅度修改[。.]?[）)]?/gu, "")
    .replace(/为了减少阅读负担，解析可简化为[:：]\s*/gu, "");

  return s.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function findCandidateMarkers(stem) {
  const re = /[（(]\s*([1-9]|[1-3]\d)\s*[）)]/gu;
  const out = [];
  for (const m of stem.matchAll(re)) {
    const num = Number(m[1]);
    const idx = m.index;
    const end = idx + m[0].length;
    const before = stem.slice(Math.max(0, idx - 18), idx);
    const after = stem.slice(end, Math.min(stem.length, end + 30));

    if (/第\s*$/u.test(before) || /^\s*段/u.test(after) || (/^\s*[句行处空篇首则章联节]/u.test(after) && /(?:第|上|下|前|后|本|各|哪)\s*$/u.test(before))) continue;
    if (/[A-E]\.\s*[^।\n]{0,12}$/u.test(before) && /^[①②③④⑤⑥⑦⑧⑨⑩]/u.test(after.trim())) continue;
    if (/(?:【|[A-Za-z\u00C0-\u024F])[ \t]*$/u.test(before)) continue;
    if (/^\s*】/u.test(after)) continue;
    if (/[\u4e00-\u9fa5]$/u.test(before) && num <= 4 && !/_{2,}/u.test(after)) {
      const prev2 = before.slice(-2);
      if (!/(?:问题|小题|任务|活动|材料|片段|选段|如下|下面|以下|题干|阅读|完成)$/u.test(prev2)) {
        if (/^[，。；、：！？\n]/u.test(after) || /^[^？?。\n]{0,15}[，。；]/u.test(after)) {
          continue;
        }
      }
    }
    const isBlankSlot = /^\s*_{2,}\s*(?:[，。；、！？\n]|$)/u.test(after);
    const isInlineBlank = !/\n\s*$/u.test(before) && /^\s*_{2,}/u.test(after);
    out.push({ num, index: idx, end, raw: m[0], isBlankSlot, isInlineBlank });
  }
  return out;
}

export function bestOuterRoles(items) {
  const n = items.length;
  let best = null;
  function dfs(i, outerVal, innerVal, roles, outerCount, blankOuterPenalty) {
    if (i === n) {
      const score =
        outerCount * 100 -
        blankOuterPenalty * 250 -
        roles.filter((r) => r === "inner").length;
      if (!best || score > best.score) {
        best = { roles: [...roles], outerCount, score };
      }
      return;
    }
    const item = typeof items[i] === "number" ? { num: items[i] } : items[i];
    const x = item.num;
    if (x === outerVal + 1 && !(outerVal >= 1 && item.isInlineBlank)) {
      roles.push("outer");
      dfs(
        i + 1,
        x,
        0,
        roles,
        outerCount + 1,
        blankOuterPenalty + (innerVal >= 1 && item.isBlankSlot ? 1 : 0),
      );
      roles.pop();
    }
    if (outerVal >= 1 && x === innerVal + 1) {
      roles.push("inner");
      dfs(i + 1, outerVal, x, roles, outerCount, blankOuterPenalty);
      roles.pop();
    }
  }
  dfs(0, 0, 0, [], 0, 0);
  if (best && best.outerCount >= 2) return best.roles;
  return null;
}

export function normalizeStemNumbering(stem, qId = "", qType = "") {
  let s = stem;
  if (INLINE_ORDERING_IDS.has(qId)) {
    s = s.replace(/\n\n（([1-9])）\s*/gu, "（$1）");
    return s;
  }

  // Strip redundant trailing blank-sheet lines
  if (qId === "7fcb92731b26f070ebfe1365ac487473" || qId === "cd2f16b2ef02c16d6427e1c02bb77eea") {
    s = s.replace(/\n+（1）\s*__[\s\S]*$/u, "");
  }
  if (qId === "cd2f16b2ef02c16d6427e1c02bb77eea") {
    s = s
      .replace(/《朝花夕拾》\s*\|\s*(?:\n\n)?（1）/u, "《朝花夕拾》 | ①____")
      .replace(/《\(2\)』/u, "《②____》")
      .replace(/《红星照耀中国》\s*\|\s*(?:\n\n)?（3）/u, "《红星照耀中国》 | ③____")
      .replace(/《水浒传》\s*\|\s*(?:\n\n)?（4）/u, "《水浒传》 | ④____");
    return s;
  }
  if (qId === "a61a321ad7bfed3cd938c28a0e17c38e") {
    s = s
      .replace(/【（1）】他在取经途中（1）/u, "①____ 他在取经途中")
      .replace(/【（2）】（2）/u, "②____ ")
      .replace(/【（3）】他（3）/u, "③____ 他")
      .replace(/《【（4）】》/u, "《④____》");
    return s;
  }

  if (qId === "b01d22826dbbcb9ccc89ae8e37434c6e") {
    s = s.replace(/(?:\n\n)?[（(]([1-6])[）)]\s*/gu, (_, d) => `${toCircled(Number(d))}`);
    return s;
  }
  if (
    qId === "fb0ae0529e37d75cb0e5694e07cc85a3" ||
    qId === "f1ebfd52180754db7042fcfa988918f0" ||
    qId === "cd4136270ba81674d6c40b2fb0a19f01"
  ) {
    s = s.replace(/(?:\n\n)?[（(]\s*([1-9])\s*[）)](\s*_{2,})/gu, (_, d, u) => `${toCircled(Number(d))}${u}`);
    return s;
  }

  // Specific stem table / numbering repairs for corrupted CJEval items
  if (qId === "ba5fc204ac8b9651b3fd08f4884bba1e") {
    s = s.replace(
      /包括：\s*(?:\n\n)?[（(]1[）)]\s*视觉障碍[\s\S]*?(?=\n⑤干燥的月球)/u,
      (block) =>
        block
          .replace(/\n\n[（(]([1-6])[）)]\s*/gu, (_, d) => toCircled(Number(d)))
          .replace(/[（(]1[）)]\s*/u, "①"),
    );
  }
  if (qId === "db6d534617196ffbf4f971ff7d8edd4e") {
    s = s
      .replace(/（上标：\(1\)）/gu, "①")
      .replace(/（上标：\(2\)）/gu, "②")
      .replace(/【注】\n\(1\)\s*/u, "【注】\n①")
      .replace(/\n\n（2）\s*陇头：/u, "\n②陇头：");
  }
  if (qId === "4fa5ce348496e60c5fc394acf8b3154c") {
    s = s.replace(
      /（1）\s*阅读全文，根据上下文填写下表。[\s\S]*?[（(]2[）)]\s*品析第⑥段划线句子/u,
      "（1） 阅读全文，根据上下文填写下表。\n“我”童年时：快手刘的手【灵巧灵活】；快手刘的演出【②____】；观众【围了几圈】；“我”的表现【揭穿他】。\n“我”高二暑假：快手刘的手【①____】；快手刘的演出【表演失灵】；观众【寥寥无几】；“我”的表现【③____】。\n\n（2） 品析第⑥段划线句子",
    );
    return s;
  }
  if (qId === "946d2331828e87fd663bf34bf359c421") {
    s = s.replace(
      /（1）\s*文中的母亲爱看书、爱看戏、会思考，请填完整下列表格。[\s\S]*?[（(]2[）)]\s*选文①段划线句表达了什么作用？/u,
      "（1） 文中的母亲爱看书、爱看戏、会思考，请填完整下列表格。\n读《红楼梦》：行为【多次阅读】，观点【①____】；\n【②____】：行为【直观朴素地理解】，观点【认为康有为不是好人】；\n看京剧现代戏：行为【③____】，观点【认为传统老戏好】；\n听二人转：行为【无法忍受而离开】，观点【④____】。\n\n（2） 选文①段划线句表达了什么作用？",
    );
    return s;
  }
  if (qId === "a699d55847be9059a3ab2810eaa5a0ba") {
    s = s.replace(
      /（2）\s*请简要概括海洋生物发光的原因。[\s\S]*$/u,
      "（2） 请简要概括海洋生物发光的原因。\n①____\n②____\n③____\n④____",
    );
    return s;
  }
  if (qId === "a9eb930a7566c8af1acc517c4978c03d") {
    s = s
      .replace(
        /（1）\s*请阅读这部小说，并填写下表。\s*阅读策略内容思考故事线策略\s*从“悬念→结局”的角度梳理小说故事情节。/u,
        "请阅读这部小说，并完成下列各题。\n\n（1） 故事线策略：从“悬念→结局”的角度梳理小说故事情节。",
      )
      .replace(
        /\n\n（2）\s*“必读社”网站推荐本小说给读者/u,
        "\n\n（4） “必读社”网站推荐本小说给读者",
      );
    return s;
  }
  if (qId === "0f6738b824c808b838bf89e82c64027f") {
    s = s
      .replace(/\n\n（1）\s*一位同学对文段中的“比喻”/u, "\n①一位同学对文段中的“比喻”")
      .replace(/\n\n（2）\s*在文段两处方框内/u, "\n②在文段两处方框内")
      .replace(/（3）画线句作为总领句/u, "\n③画线句作为总领句")
      .replace(/\n\n（1）\s*下列加点字的读音/u, "\n①下列加点字的读音")
      .replace(/（2）在\[甲\]\[乙\]处分别填入/u, "\n②在[甲][乙]处分别填入")
      .replace(/（3）结合文意，在横线处填入/u, "\n③结合文意，在横线处填入")
      .replace(/（4）听完两位同学的演讲后/u, "\n④听完两位同学的演讲后");
    return s;
  }
  if (qId === "8e46ddb84daf2a3b78dbadf7bf7739ee") {
    s = s.replace(/\n\n（1）\s*对第三节赏析/u, "\n\n（3） 对第三节赏析");
  }
  if (qId === "bbc6caf66343a9421ac832fd52be3f07") {
    s = s.replace(/\n\n4\.\s*作者在描述/u, "\n\n（4） 作者在描述");
  }
  if (qId === "6515112bd3e20cec57ba0c0335f50c63") {
    s = s
      .replace(/\(6\s+我国古代/u, "（6） 我国古代")
      .replace(/第（12）段/u, "第⑫段");
  }

  s = s.replace(/\n\n（(1\d{3}|20\d{2}|[78]\d{2})）\s*/gu, "（$1）");
  s = s.replace(/（([1-9]\d*)）\s*[（(]\1[）)]\s*/gu, "（$1） ");
  s = s.replace(
    /（([1-9]\d*)）\s*[（(]([1-9]\d*)[）)]\s*/gu,
    (m, a, b) => `（${a}） ${toCircled(Number(b))} `,
  );

  // Check if top-level Arabic "1. ... 2. ..." subquestions exist
  const arabRe = /(?:^|[\n。！？；”’）)】])\s*([1-9])[.．、]\s*(?=(?:请|阅读|根据|结合|从|下列|以下|文章|选文|文中|本文|材料|链接|第[一二三四五六七八九十\d①-⑳]|为什么|说说|谈谈|简析|分析|概括|赏析|品析|品味|理解|判断|选择|填写|写出|指出|解释|补写|仿写|修改|梳|如果|有人|作家的|在作家|游记|通读))/gu;
  const arabMatches = [...s.matchAll(arabRe)];
  const hasSequentialArab =
    arabMatches.length >= 2 && arabMatches.every((m, idx) => Number(m[1]) === idx + 1);

  const ms = findCandidateMarkers(s);
  if (ms.length >= 2) {
    let start = 0;
    if (
      ms[0].num > 1 ||
      (qType === "现代文阅读" && ms[0].index < 150) ||
      PASSAGE_PARA_EXTRA_IDS.has(qId)
    ) {
      let pEnd = 0;
      while (pEnd + 1 < ms.length && ms[pEnd + 1].num === ms[pEnd].num + 1) {
        pEnd++;
      }
      if (pEnd + 1 < ms.length && ms[pEnd + 1].num === 1) {
        start = pEnd + 1;
      } else if (
        ms[0].num > 1 ||
        PASSAGE_PARA_EXTRA_IDS.has(qId) ||
        (qType === "现代文阅读" && ms[0].index < 150 && pEnd >= 3)
      ) {
        start = pEnd + 1;
      }
    }

    const rem = ms.slice(start);
    const roles = rem.length >= 2 ? bestOuterRoles(rem) : null;

    if (roles) {
      const firstOuterIdx = ms[start].index;
      // If sequential 1. .. K. starts BEFORE the first (1) and has more items than outer (1)..(r),
      // then 1. .. K. are the outer subquestions and (1)..(r) inside them are inner ①..④!
      const outerCount = roles.filter((r) => r === "outer").length;
      if (hasSequentialArab && arabMatches[0].index < firstOuterIdx && arabMatches.length > outerCount) {
        for (let i = ms.length - 1; i >= 0; i--) {
          const m = ms[i];
          s = s.slice(0, m.index) + toCircled(m.num) + s.slice(m.end);
        }
      } else {
        for (let i = ms.length - 1; i >= 0; i--) {
          const m = ms[i];
          if (i < start) {
            s = s.slice(0, m.index) + toCircled(m.num) + s.slice(m.end);
          } else {
            const role = roles[i - start];
            if (role === "outer") {
              const before = s.slice(0, m.index).replace(/[ \t\n]+$/u, "");
              const after = s.slice(m.end).replace(/^[ \t\n]+/u, "");
              s = `${before}\n\n（${m.num}） ${after}`;
            } else {
              const before = s.slice(0, m.index);
              const after = s.slice(m.end).replace(/^[ \t]+/u, "");
              s = `${before}${toCircled(m.num)}${after}`;
            }
          }
        }
        return s.replace(/\n{3,}/gu, "\n\n").trim();
      }
    } else if (start > 0) {
      for (let i = start - 1; i >= 0; i--) {
        const m = ms[i];
        s = s.slice(0, m.index) + toCircled(m.num) + s.slice(m.end);
      }
    }
  } else if (ms.length === 1 && ms[0].num === 1 && ms[0].index === 0) {
    s = s.slice(ms[0].end).replace(/^[ \t]+/u, "");
  }

  // Re-evaluate 1. .. K. top-level subquestions
  const arabMatchesAfter = [...s.matchAll(arabRe)];
  if (
    arabMatchesAfter.length >= 2 &&
    arabMatchesAfter.every((m, idx) => Number(m[1]) === idx + 1)
  ) {
    for (let i = arabMatchesAfter.length - 1; i >= 0; i--) {
      const m = arabMatchesAfter[i];
      const num = Number(m[1]);
      const fullMatch = m[0];
      const numMatch = fullMatch.match(/([1-9])[.．、]\s*$/u);
      const markerStart = m.index + fullMatch.length - numMatch[0].length;
      const before = s.slice(0, markerStart).replace(/[ \t\n]+$/u, "");
      const after = s.slice(m.index + fullMatch.length).replace(/^[ \t\n]+/u, "");
      s = `${before}\n\n（${num}） ${after}`;
    }
  }

  return s.replace(/\n{3,}/gu, "\n\n").trim();
}

export function countSubBlanks(sub) {
  const withoutOpts = sub.split(/\n(?:选项：|[A-E]\.\s)/u)[0];
  if (/[（(]\s*[）)]\s*$/u.test(withoutOpts.trim()) && /\n[A-E]\.\s/u.test(sub)) {
    return 1;
  }
  const circled = [...withoutOpts.matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]/gu)].map((m) => m[0]);
  if (circled.length >= 2) {
    const idx0 = "①②③④⑤⑥⑦⑧⑨⑩".indexOf(circled[0]);
    if (
      idx0 === 0 &&
      circled.every((c, i) => "①②③④⑤⑥⑦⑧⑨⑩".indexOf(c) === i)
    ) {
      return circled.length;
    }
  }
  const under = [...withoutOpts.matchAll(/_{2,}/gu)];
  if (under.length >= 2) return under.length;
  const brk = [...withoutOpts.matchAll(/【[①-⑩\d\s_]+】/gu)];
  if (brk.length >= 2) return brk.length;
  return 1;
}

export const MULTI_BLANK_COUNTS = {
  "9bf0408b3177b14b6209993913d76dbd": [2, 1, 1, 2],
  "c6766e8a2ebfc076e3c3982e2322143e": [1, 2, 1, 1, 1],
  "6836874b177850557f48daac544d0241": [2, 2, 1, 1],
  "99ca46a4fe53c69da57f24de0e7aa9bf": [3, 1, 3],
  "9567b15f562f741678eb49c24e104093": [1, 2, 2],
  "96c56996660864e6873997ef5f4fd96d": [3, 1, 1, 1, 1],
  "7b2df4d1c0126225431ca89bffa1fdce": [1, 2, 1],
  "36cea3233dd8d9df1f38588e047709b2": [2, 1, 1, 1],
  "556e4a68983f6a75d61fe6cb194c1d14": [1, 2],
  "85cae158d9f22de7f7d888be7e5f43f6": [4, 2, 1, 1],
  "2b9c18f475a74c607bce6557242c84b8": [1, 1, 1, 1, 2],
  "da9aeb35116235ef0a1c5a6dd4b1dbaa": [1, 3],
  "7b198d822e1a5da13c5e94d760ccbc05": [2, 1],
  "4bd7281fef9f2fb9f447a79cf6404451": [2, 1, 1, 1],
  "d37470a98c013bd9d36a6938f2772c75": [2, 1],
  "9973c038523eacfe3eb4c01ca9d1c4ee": [2, 1, 1],
  "fa8a39f95a17bd66462538fb654295ae": [1, 2, 1, 1],
  "70f2d1dd4bb4d301b873aa2f77fc2622": [1, 1, 2],
  "af6369f36e67d493c7dba4bd46a6652a": [2, 2],
  "aa9cf73e6afa092173ac6833dc605d0d": [2, 3, 3, 2, 1],
  "ef22be92e4a58a4588c81f4370951233": [2, 2, 1],
  "493b8470f70d7f23cb9edb19d223f811": [2, 1, 1],
  "c8f71e50028a190e5be46f6019333be4": [3, 1, 2],
  "2310312678d5d3fd4778dbbb7f774216": [2, 1, 1],
  "6ba06c548c3dea84f1e56106aa360d44": [3, 1, 1, 1],
  "c8c8d4bcffb3cccab339df1dc105ed50": [2, 1],
  "93c613a9531ed1c7fed17b569e33c304": [2, 1],
  "6dbbd1b8e459d9716c73806c830ebcb4": [3, 2, 1, 2],
  "950134413b057e777eecf7adf7da008d": [2, 1],
  "18110d86bd848394c169681a8a76947f": [2, 2],
  "045e20481c93162a1b2a7070cbcd5d9e": [2, 1, 1, 1],
  "628e1c8304bb9523cbbd532be56a4fbc": [2, 4],
  "ce4e225eab58a269c86d73de9ba6fe35": [2, 2, 2],
  "d6e05b3f8843ebf3b68aa89b0a911cdd": [3, 2, 2, 2],
  "9eb15645e5ad300dd9d46af590cd6458": [2, 1, 1, 1],
  "a41a338853262c1f4cfcfdc9fd9fc5ed": [1, 2],
  "d2d20b209eaac3d59d280cf0d0572efd": [2, 2, 2],
  "c19831317a85a033709ba28dc673b742": [2, 1, 1],
  "7bbf200d8d8a57088404b997a1d82bcf": [2, 1, 1],
  "70e243c57e9dd60163fdea2e29558ea2": [2, 2, 2],
  "f34d8b96657013c2f628a6a089673627": [2, 2, 1, 1, 1],
  "5fc9bfd0804f9d3734910fa6ff255262": [7, 2, 1, 1, 1],
  "094e764f7c8f444799c76da2d82193f7": [2, 3],
  "caffd9acc136a6e2b9d83c5b8ca99c3b": [4, 1, 1, 1],
  "785927d41d561f557df7ea92fd7a765b": [1, 1, 2, 1],
  "0a18d3ee879f7f15bbd61b7faf36632b": [1, 2, 1, 1, 1],
  "2d5dbf31d7e3c8a0328e5689a0cbcae9": [1, 2, 1],
  "66989dc1949ffb9b57966c2d431f24f6": [2, 1, 1, 1, 1],
  "c90efc2a288af2662c47987fbc6603f8": [4, 2],
  "26e6f47d43fde912e81f9c87840372cd": [2, 2, 1, 1, 1],
  "5840ed330bcc8865fd7f24dc9114a958": [3, 1],
  "c46bc996b8245e2db644b7795f7a0acf": [4, 1],
  "778a0db387a27da7feab475fd8dd19ed": [3, 1, 2, 2],
  "b2fbb755edcfe05410912e11d99c78a3": [2, 4],
  "ec8c51cba5bac09c8f644c414b1be4d8": [1, 1, 1, 1, 1, 1],
  "b8993e0b06093cef1549d766d16119c7": [1, 1, 1, 1, 1, 1],
  "e0561b8705bf10a6a0131a0825c586aa": [2, 2, 2],
};

export function normalizeAnswerNumbering(ans, K = 0, qId = "") {
  let a = ans
    .replace(/\\+n(?![a-zA-Z])/gu, "\n")
    .replace(/（([1-9]\d*)）\s*[（(]\1[）)]\s*/gu, "（$1）")
    .replace(/（([1-9]\d*)）\s*(?:1\.\s*)+1\.\s*/gu, "（$1）①")
    .replace(/（([1-9]\d*)）\s*\1[、.．:：]\s*(?!.*[12][、.．])/gu, "（$1）");

  // If answer starts with unnumbered first part followed by (2), prepend （1）
  if (!/^[（(]1[）)]/u.test(a) && /(?:^|[\s。！？；”])[（(]2[）)]/u.test(a) && !/[（(]1[）)]/u.test(a)) {
    a = `（1）${a}`;
  }

  // If answer uses "1. ... 2. ... K." as outer markers (with optional inner (1)(2))
  const arabCheck = [...a.matchAll(/(?:^|[\s\n；;。！？])[1-9]\d*[.．、]\s*/gu)];
  if (
    K >= 2 &&
    !/（2）/u.test(a) &&
    arabCheck.length === K &&
    arabCheck.every((m, idx) => Number(m[0].match(/([1-9]\d*)/u)[1]) === idx + 1)
  ) {
    // Convert inner (1)..(9) inside 1. .. K. to ①..⑨ first
    a = a.replace(/\(([1-9])\)\s*/gu, (_, d) => toCircled(Number(d)));
    for (let i = arabCheck.length - 1; i >= 0; i--) {
      const m = [...a.matchAll(/(?:^|[\s\n；;。！？])([1-9]\d*)[.．、]\s*/gu)][i];
      const num = Number(m[1]);
      const fullMatch = m[0];
      const numMatch = fullMatch.match(/([1-9]\d*)[.．、]\s*$/u);
      const startIdx = m.index + fullMatch.length - numMatch[0].length;
      const before = a.slice(0, startIdx).replace(/[ \t\n]+$/u, "");
      const after = a.slice(m.index + fullMatch.length).replace(/^[ \t\n]+/u, "");
      a = before ? `${before}\n（${num}）${after}` : `（${num}）${after}`;
    }
    return a.trim();
  }

  a = a
    .replace(/^([1-9]\d*)[.．、]\s*(?=[（(]\1[）)])/gu, "")
    .replace(/\n([1-9]\d*)[.．、]\s*(?=[（(][1-9]\d*[）)])/gu, "\n");

  if (/（1）/u.test(a) && !/（2）/u.test(a) && /\(2\)/u.test(a)) {
    // Mixed full-width （1） and half-width (2)..(K)
    a = a.replace(/(?:^|(?<=[\s\n；;。！？”]))\(([1-9]\d*)\)\s*/gu, (_, d) => `\n（${d}）`);
  }

  if (/（1）/u.test(a)) {
    a = a.replace(/\(([1-9])\)\s*/gu, (_, d) => toCircled(Number(d)));
    a = a.replace(/(^|\n)（([1-9]\d*)）([^\n]+)/gu, (line, pfx, num, body) => {
      if (/(?:^|\s)1[.．、]\s*\S[\s\S]*?\s2[.．、]\s*\S/u.test(body)) {
        const replaced = body.replace(/(?:^|\s)([1-9])[.．、]\s*/gu, (m, d) => ` ${toCircled(Number(d))}`).trim();
        return `${pfx}（${num}）${replaced}`;
      }
      return line;
    });
  }

  const allFw = [...a.matchAll(/（([1-9]\d*)）/gu)];
  if (allFw.length >= 2) {
    const nums = allFw.map((m) => Number(m[1]));
    const roles = bestOuterRoles(nums);
    if (roles) {
      for (let i = allFw.length - 1; i >= 0; i--) {
        const m = allFw[i];
        const num = Number(m[1]);
        if (roles[i] === "outer") {
          const before = a.slice(0, m.index).replace(/[ \t\n]+$/u, "");
          const after = a.slice(m.index + m[0].length).replace(/^[ \t\n]+/u, "");
          a = before ? `${before}\n（${num}）${after}` : `（${num}）${after}`;
        } else {
          const before = a.slice(0, m.index);
          const after = a.slice(m.index + m[0].length).replace(/^[ \t]+/u, "");
          a = `${before}${toCircled(num)}${after}`;
        }
      }
    }
  }

  const topFw = [...a.matchAll(/(?:^|\n)（([1-9]\d*)）/gu)];
  let M = topFw.length;

  if (M <= 1 && K >= 2) {
    const hw = [...a.matchAll(/(?:^|(?<=[\s\n；;。！？”]))\(([1-9]\d*)\)\s*/gu)];
    if (hw.length >= 2 && hw.every((m, idx) => Number(m[1]) === idx + 1)) {
      for (let i = hw.length - 1; i >= 0; i--) {
        const m = hw[i];
        const num = Number(m[1]);
        const before = a.slice(0, m.index).replace(/[ \t\n]+$/u, "");
        const after = a.slice(m.index + m[0].length).replace(/^[ \t\n]+/u, "");
        a = before ? `${before}\n（${num}）${after}` : `（${num}）${after}`;
      }
      M = hw.length;
    }
  }

  if (M <= 1 && K >= 2) {
    const arab = [...a.matchAll(/(?:^|[\s\n；;。！？])([1-9]\d*)[.．、]\s*/gu)];
    if (arab.length >= 2 && arab.every((m, idx) => Number(m[1]) === idx + 1)) {
      for (let i = arab.length - 1; i >= 0; i--) {
        const m = arab[i];
        const num = Number(m[1]);
        const fullMatch = m[0];
        const numMatch = fullMatch.match(/([1-9]\d*)[.．、]\s*$/u);
        const startIdx = m.index + fullMatch.length - numMatch[0].length;
        const before = a.slice(0, startIdx).replace(/[ \t\n]+$/u, "");
        const after = a.slice(m.index + fullMatch.length).replace(/^[ \t\n]+/u, "");
        a = before ? `${before}\n（${num}）${after}` : `（${num}）${after}`;
      }
      M = arab.length;
    }
  }

  if (M <= 1 && K >= 2) {
    const circ = [...a.matchAll(/[①②③④⑤⑥⑦⑧⑨⑩]/gu)];
    if (
      circ.length === K &&
      circ.every((m, idx) => "①②③④⑤⑥⑦⑧⑨⑩".indexOf(m[0]) === idx)
    ) {
      for (let i = circ.length - 1; i >= 0; i--) {
        const m = circ[i];
        const num = i + 1;
        const before = a.slice(0, m.index).replace(/[ \t\n]+$/u, "");
        const after = a.slice(m.index + m[0].length).replace(/^[ \t\n]+/u, "");
        a = before ? `${before}\n（${num}）${after}` : `（${num}）${after}`;
      }
      M = circ.length;
    }
  }

  // Handle single （1） followed by ②..④ (e.g. 2cc9380ccc1e45d7a184d414e0914e65)
  if (M === 1 && K >= 2 && /^（1）/u.test(a)) {
    const circRest = [...a.matchAll(/[②③④⑤⑥⑦⑧⑨⑩]/gu)];
    if (
      circRest.length === K - 1 &&
      circRest.every((m, idx) => "①②③④⑤⑥⑦⑧⑨⑩".indexOf(m[0]) === idx + 1)
    ) {
      for (let i = circRest.length - 1; i >= 0; i--) {
        const m = circRest[i];
        const num = i + 2;
        const before = a.slice(0, m.index).replace(/[ \t\n]+$/u, "");
        const after = a.slice(m.index + m[0].length).replace(/^[ \t\n]+/u, "");
        a = `${before}\n（${num}）${after}`;
      }
      M = K;
    }
  }

  if (K === 0 && M === 1 && /^（1）(?!\s*[（(][1-9][）)])/u.test(a)) {
    a = a.replace(/^（1）\s*/u, "");
  }
  if (
    K === 0 &&
    (qId === "dda585e935a00aee6a98411b56a9bf70" ||
      qId === "cd2f16b2ef02c16d6427e1c02bb77eea" ||
      qId === "a61a321ad7bfed3cd938c28a0e17c38e")
  ) {
    a = a.replace(/(?:^|\n)（([1-9])）\s*/gu, (_, d) => (Number(d) === 1 ? `${toCircled(1)}` : `；${toCircled(Number(d))}`));
  }

  return a.trim();
}

export const PINNED_ANSWERS = {
  // Placeholder answers repaired from solutions[0]
  "1e6987207756bf96653525b749ff234c":
    "（1）B\n（2）“垂”字写出了星辰低垂、仿佛近在眼前的景象，烘托出原野的辽阔苍茫；“涌”字描绘出月光随大江奔涌翻腾的动态感，展现出江水磅礴的气势；诗人以乐景写哀情，借雄浑阔大的夜景反衬孤舟漂泊的凄凉与孤独。",
  "e05945a8f7275d5852f544f51e87cf5e":
    "（1）B\n（2）A\n（3）示例：坚持读书、坚持善良和坚持吃苦更有持久的影响力。坚持读书能不断拓宽认知边界、提升个人能力；坚持善良能让人问心无愧，温暖他人并照亮生活；坚持吃苦能让人在磨砺中脚踏实地，最终收获成长与成功。",
  "661f45ef99880bbbfda757031e840989":
    "（1）B\n（2）示例：春江碧波荡漾，两岸绿草如茵，映衬着水鸟洁白的羽毛；连绵的青山苍翠欲滴，山间火红的春花竞相怒放，宛如熊熊燃烧的火焰，明丽生动的春景更勾起游子无尽的思乡之情。",
  "3b7a7d822e7a54e36800bd51d4aac53a":
    "（1）人类大脑在原有记忆回路的基础上，通过分支回路进行回忆；海马体内负责记忆形成与回忆的两条并行回路相互配合，当回忆回路被激活时，记忆形成回路可以将新信息编码加入现有记忆，从而实现记忆的编辑和更新。\n（2）研究人员运用光遗传学技术对小鼠进行恐惧条件反射实验，发现抑制小鼠下托神经元会损伤其回忆能力但不影响新记忆的形成，证实下托对回忆是必需的而对记忆形成并非必需，从而得出记忆形成与回忆使用不同神经回路的结论。\n（3）示例：科学研究需要敢于质疑传统观点，通过严谨的实验设计不断假设、验证与推论；同时，深入的科学探索往往能带来意想不到的新发现，并为相关疾病的治疗提供新启示。\n（4）示例：第①段运用打比方的说明方法，将大脑不同神经元集群分类储存记忆比作计算机的信息分类，通俗形象地说明了大脑储存记忆的机制。",
  "82df41da8e62fc5e6245a85205b12016":
    "（1）唐僧（唐三藏）\n（2）朱德\n（3）儒林外史\n（4）藤野先生",
  "bc4feca3b23ce5d0f34dd5f3712c46b2":
    "（1）①母亲在我出生前做梦梦见了小葫芦；②葫芦寓意辟邪、招宝，父母希望我一生平安、富裕。\n（2）①示例一：运用了对比手法，将别人的小名和我的小名进行比较，表现了我对别人小名的羡慕和对自己小名的厌恶。示例二：运用了拟物手法，把孩子们比作欢呼雀跃的小动物，生动地写出了孩子们的兴奋，表现了我对别人的小名的羡慕和对自己小名的厌恶。②“抛”字表现了对自己小名的不满；生动形象地写出了高中后终于没人知道我小名的喜悦；为文章结尾期待有人叫我小名作铺垫。\n（3）文中父亲因患病开始健忘，但仍然记得我的小名，我流泪是感动和悔恨，感动父亲记得我的小名，悔恨小时候不理解父母之爱；链接材料中，我看到父亲信中的伤心话，想念父亲而流泪。\n（4）小时不理解父母的用意，极力排斥小名；成年后理解了父母的心意，呼唤小名的亲人却已离去；在异乡工作，小葫芦寄托了对亲人的怀念和对故乡的依恋。",
  "0f6738b824c808b838bf89e82c64027f":
    "（1）①比喻；②偏，歪；③B；④想象丰富的神话传说、笔法多样的诸子散文、叙事灵活的史传文学，都对中国古代小说的形成产生了深远影响。\n（2）①C；②D；③A；④B\n（3）A",
  "0e659f92f7fe9cfe32c9cd73c789e5f6":
    "（1）①与故友重逢的欣喜；②被贬异乡、远眺湘山的忧愁与思乡之情；③面对浩渺洞庭、秋风落叶时漂泊孤寂与个体渺小的感慨。\n（2）①B；②“孤鸿”常用来象征漂泊异乡的游子，与诗中“秋风”“落叶”“一扁舟”等意象相契合，更能烘托出诗人被贬后孤寂悲凉、渺小无助的心境。",
  "99e4085f34248499a22f926019724a03":
    "（1）B\n（2）运用对偶和拟人的修辞手法，“驮诗”写出诗人旅途吟咏的孤寂，“呼愁”赋予倦鸟人的哀愁，借瘦马、倦鸟、天涯、村落等意象营造出苍凉凄清的意境，烘托出游子羁旅天涯的孤寂愁苦。\n（3）抒发了诗人羁旅漂泊的孤寂愁苦、对故乡的深切思念，以及对时光流逝、年华易老的感伤。",
  "ec8c51cba5bac09c8f644c414b1be4d8":
    "（1）（河流、池塘等）缺水干枯。\n（2）建筑物或堆积物失去支撑而倒下。\n（3）身体强壮健康。\n（4）通过指导和锻炼使能力得以提升。\n（5）荒原\n（6）追根究底",
  "b8993e0b06093cef1549d766d16119c7":
    "（1）兴趣\n（2）地位低下\n（3）蔓延\n（4）制止，控制\n（5）濒近\n（6）无能为力",
  "b01d22826dbbcb9ccc89ae8e37434c6e":
    "①④③⑥⑤②",
  "6515112bd3e20cec57ba0c0335f50c63":
    "（1）①蝗灾的严重影响；②蝗灾的成因；③蝗灾的防治\n（2）A\n（3）示例：舅舅，尽管蝗虫给农业带来巨大危害，但它们在生态系统内也有一定的正面作用。喷洒农药虽然见效快，但也会对林场生态环境带来长期的负面影响，比如农药残留对植物及人体健康不利。您可以考虑尝试养鸭治蝗法或生态治蝗法，既环保又有效。",
  "d2d20b209eaac3d59d280cf0d0572efd":
    "（1）示例：选5A处。整体画面是：碧绿的柳丝笼在一片若有若无的水烟中，更显得妩媚动人。（或选5B处。整体画面是：落花满地，家童尚未打扫，山居主人仍在窗内酣眠。）\n（2）6A：啼；6B：犹眠（或“眠”）\n（3）7A：清丽朦胧，令人心动。7B：春日景色清新明丽，富有生机，更显宁静悠然，令人向往。",

  // Remaining subquestion-answer alignment completions verified against stem and solutions[0]
  "562e91f1575e647cb83ef6c8e2c42e92":
    "（1）A句：“幸灾乐祸”赋予相思鸟人的情态，反衬出“我”因担忧和羞愧而自嘲的心理。B句：“最亮的星星”把英语老师比作闪耀的星星，形象地表现出老师对“我”人生道路深远的指引与影响。\n（2）示例：我更赞同丽丽的说法。文章情节跌宕起伏，通过主人公偷看电影、面临命题考试、巧遇老师以及英语测试得高分后再次接受检验等波折，层层推进，生动展现了既严格又亲切的老师形象，引人入胜。",
  "222048e8bccedf3e71c56f5c64b83e58":
    "（1）①不忘初心；②理解一件事情的意义\n（2）示例：以读书为例，不辜负自己就是静下心来广泛阅读经典名著，在阅读中思考感悟书中的思想智慧，并将其转化为日常言行的准则，不断丰盈精神世界、实现自我提升。",
  "7d49c419a93d0dc338f8fb41b083c2d2":
    "（1）①毛竹青葱挺拔，令人精神振奋；②深山秋景层次分明，令人赞叹；③“一石观景处”远眺翠竹，充满生机与活力；④主人讲解竹子分公母的知识，增长见闻；⑤高山瀑布气势磅礴，震撼人心；⑥主人热情煮茶招待，让人倍感温暖；⑦期待来年春天品尝鲜笋。\n（2）①“层层”“满”“翻滚”等词语化静为动，生动形象地描绘出竹林连绵起伏、繁茂壮观的气势，表现出作者内心的振奋与喜悦；②“猛扑”“裹挟”运用拟人修辞手法，赋予湿云浓雾主动出击的力量感，生动写出了云雾汹涌翻腾的磅礴气势。\n（3）运用对比（欲扬先抑）手法，先写前两天游客对人工景点兴趣索然、第二天人走一半，反衬出第三天明月山自然风光的奇绝迷人，使行文波澜起伏。\n（4）①议论；②第④段画线句含蓄隽永、言有尽而意无穷，引发读者对自然价值的深思；链接材料则运用排比直抒胸臆，气势充沛地赞美了黄河博大宽厚、勇往直前的民族精神。",
  "3bf3949c52b1b08f518e6bf177881099":
    "（1）示例一：用“竹径”好。“竹径”与前文“高林”相呼应，“竹”象征高洁幽雅，且“竹径”与“禅房”对仗工整。示例二：用“幽径”好。“幽径”写出小路曲折幽深的特点，与后文“幽处”相照应，更能烘托山寺的幽静氛围。\n（2）寂静（或：静谧）\n（3）能。诗歌颈联借“山光”“鸟”“潭影”营造出清澈空灵、恬淡禅寂的意境；【助读资料二】通过描绘飞鸟欢悦、潭影涤荡躁动灵魂的画面，把颈联的意象具体化，有助于读懂颈联物我两忘的禅意。",
  "3e9f8caf821928f112c0d0eddaea4502":
    "（1）①寓情于景（借景抒情）；②轻烟；③寒江水；④明月；⑤沙洲\n（2）表达了诗人对统治阶级荒淫无度生活的忧虑与悲愤，以及对国家前途命运的深切担忧。",
  "96c7bf442695538ecf3497917ee86449":
    "（1）①抵触、排斥；②自豪、开心；③谢师宴上高老师亮出银光闪闪的蚕茧\n（2）是高老师买走了“我的”蚕。依据：毕业谢师宴临别时，高老师把“我”叫到身边，摊开手掌亮出十多个银光闪闪的蚕茧。\n（3）①“站”字写出了高老师身材高大、严阵以待的形象，也侧面映射出同学们面对年长老师时的意外与排斥心理；②运用比喻的修辞手法，把蚕宝宝比作太阳、把“我”比作向日葵，生动形象地表现出“我”对蚕宝宝的痴迷与喜爱。\n（4）示例：不认同。最后一段通过补充交代高老师买蚕养蚕的良苦用心，不仅照应前文伏笔、使故事情节完整，更深化了高老师关爱学生、因材施教的感人形象，升华了师生情谊的主旨。",
  "1629ae798eaa1d474c57b5183a60c52c":
    "（1）运用语言描写，连用两个“可不敢”，生动传神地表现出爷爷坚守手艺良心、诚实守信、绝不糊弄东家的坚定态度与工匠精神。\n（2）运用比喻的修辞手法，把爷爷的好手艺、好名声比作长了翅膀的鸟儿，生动形象地写出爷爷声名远播的速度之快、范围之广。\n（3）雇主的态度由最初的怀疑、不满和怠慢，转变为后来的敬重和感激。原因：起初雇主误以为爷爷拖延工期是为了多算工钱；后来邻居家家具变形而爷爷做的家具完好无损，雇主真正认识到了爷爷精湛的手艺与诚实守信的品格。\n（4）①节俭惜物（不敢浪费粮食）；②敬畏自然、勤劳踏实（不敢糊弄庄稼）；③诚实守信（不敢糟践木材、欺骗东家）；④知恩图报、正直谦逊（不敢忘恩负义、不敢昧良心、不敢贪心）。\n（5）示例：“不敢”并非胆怯，而是对规则、道德与良知的敬畏与自律。在今天的学习和生活中，心存“不敢”能警醒我们坚守诚信底线，踏实做事、坦荡做人。",
  "82920d8b273539c0cd56fe58a8cc3133":
    "（1）①进山寻得幽兰；②兰花灿烂绽放\n（2）运用比喻和排比的修辞手法，把红柿子比作红宝石、大眼睛、小灯笼，生动形象地写出红柿子晶莹饱满、红润喜人的特点，增强了语言韵律感，流露出作者寻兰途中的喜悦心情。\n（3）①内容上，交代了家中幽兰的来历，表现出作者对深山幽兰的喜爱与敬畏；②结构上，丰富了文章内容，避免平铺直叙，为下文写幽兰绽放及抒发人生感悟做铺垫。\n（4）①表达了对幽兰高洁品格的喜爱、赞美与敬畏之情；②借幽兰领悟到耐得住寂寞、直面风雨挫折的人生哲理；③幽兰在特殊时期给予作者战胜困难的勇气与乐观坚强的力量。",
  "497b53b548284c41740fd43da1ad35ba":
    "（1）①蝴蝶在吸食花蜜时帮助开花植物传粉，双方形成互利共生的关系；②开花植物为吸引蝴蝶演化出鲜艳色彩与花蜜结构，蝴蝶也演化出适应采蜜的器官；③二者相互依存，缺一不可。\n（2）运用打比方的说明方法，把蝴蝶比作“花的爱情使者”，把花比作“蝴蝶的食品供应商”，生动形象、通俗易懂地说明了蝴蝶与开花植物互利共赢的协同进化关系，增强了文章的趣味性。\n（3）C",
  "32fd4b3568eff532b7097ee3f020640a":
    "（1）运用拟人的修辞手法，“竞”字赋予百花人的竞争情态，生动形象地描绘出晚春时节百花争奇斗艳、生机勃勃的繁茂景象，表达了诗人对春光的喜爱与惜春之情。\n（2）C",
  "670bb893058d679451527c66c9c6a59c":
    "（1）①听觉；②风雨凄迷、阴冷沉郁；③喜悦\n（2）通过重章叠句、反复咏叹风雨和鸡鸣，一方面烘托出久盼不至的凄凉氛围，反衬见到君子后的无限喜悦；另一方面增强了诗歌的节奏感和音乐美，形成回环往复的艺术效果。",
  "dec1ce2422eebc615537328982fb08b5":
    "（1）①把剩下的粮食装成四袋；②看到老甘只带走了两袋；③带队准备转移\n（2）神态细节描写。“两眼瞅着地上”细腻地表现出老寿既坚定支持革命队伍，又因家里断粮、连累老伴挨饿而内心愧疚、纠结的复杂心理。\n（3）老伴是一个刀子嘴豆腐心、深明大义、坚韧刚强的农村妇女。她嘴上抱怨老寿，却在关键时刻亲手把仅存的粮食装进干粮袋交给游击队，默默承受生活苦难，全力支持革命。\n（4）小说通过老寿夫妇倾尽家中口粮支援游击队，而老甘体谅百姓疾苦只带走两袋干粮的感人情节，赞美了抗日战争时期人民群众无私奉献的觉悟与革命队伍体恤百姓的深厚军民鱼水情。",
  "0648d493322f2b4c7aa65e1b0bba83dc":
    "（1）①清晨散步听到“一二三，木头人”的喊声；②哑然失笑；③观看母子玩“一二三，木头人”的游戏；④感动尊敬\n（2）运用比喻的修辞手法，将胖女人比作“被筷子夹起的汤包”，生动形象地写出她听到电话铃声时全身紧绷、慌乱局促的情态，表现出她在兼顾工作与孩子时的巨大压力，为下文揭开原因做铺垫。\n（3）示例：作为子女，我们应当体谅母亲在工作与家庭之间奔波的辛劳，尊重并支持母亲追求自我价值，主动承担力所能及的家务，管理好自己的学习与生活，用懂事和关爱为母亲分担压力。",
  "ab0cf8934816514b3478a3544e8204bf":
    "（1）B\n（2）①尊重和敬畏中华优秀传统文化经典，反对低俗恶搞与肆意戏说；②立足理性分析，取其精华、去其糟粕；③结合时代需求进行创造性转化与创新性发展，让传统文化服务当代社会。",
  "6004fc2cc56b354b4d036ca2dfbb17ee":
    "（1）文章记叙了年迈的外婆中医免费为一名农村高中生精心治疗眼疾，并在去世前为他预先留下七封回信和六副微调药方、去世后捐献遗体的感人故事。\n（2）①仁心仁术、不图回报：年事已高仍坚持出诊，替贫困学生免费治病、垫付药费；②严谨负责、替患者着想：耐心将繁体字药方译成简体并换算克数，临终前预先备好后续六副药方与鼓励信件。\n（3）第一次痛哭是因为得知外婆中医早已去世却为自己留好药方和回信，内心无比震惊、悲痛与感激；第二次痛哭是因为得知外婆中医捐献遗体的高尚壮举，灵魂受到极大震撼与感动。\n（4）C\n（5）示例：选A“七封回信”。理由：“七封回信”是贯穿全文的叙事线索，凝聚着外婆中医对患者的仁爱与嘱托，且设置悬念，新颖别致，激发读者的阅读兴趣。",
  "728d7fd31946677ecaa1a11b444f1cda":
    "（1）表达了诗人与友人同为远赴异乡做官之人、同病相怜的感慨，以此宽慰友人不必为离别过度悲伤。\n（2）李白运用拟人手法，将愁心寄托给明月，让明月伴随友人远赴夜郎，化无形情思为有形陪伴；王勃则以议论入诗，用“海内存知己，天涯若比邻”突破空间阻隔，表现出旷达豪迈、积极乐观的胸襟。",
  "d70a68e5e7acf0a8ca27fbdc0e125873":
    "（1）D\n（2）甲诗《春望》借国破家亡的凄凉春景，抒发了诗人忧国伤时、念家悲己的沉痛之情；乙诗《南安军》通过追述兵败被俘的北行经历，表达了诗人宁死不屈、以死报国的崇高民族气节。",
  "3d52bf11ef0875f7cfb41722325f8bcf":
    "（1）①老马喝糖水，向众人道谢；②谦和有礼；③老马把包子省给孙子小马吃；④得意欣慰\n（2）一方面反映出茶馆掌柜心地善良、经验丰富；另一方面侧面反映出旧社会底层车夫因饥寒交迫而晕倒的现象司空见惯，揭露了底层劳动人民悲惨的生存境遇。\n（3）命运：小马最终病死，老马只能孤苦伶仃地在街头卖茶水度日，结局凄惨。作用：老马爷孙的悲剧是旧社会车夫命运的缩影，让祥子看到了自己未来的下场，击碎了祥子靠个人奋斗买车立业的希望，推动了祥子思想性格的转变。",
  "bb6d26e84d677563e2058f0e9ff2cff3":
    "（1）①语言豪迈刚烈：如“身不得，男儿列，心却比，男儿烈”，直抒胸臆，尽显巾帼不让须眉的英雄气概；②格调慷慨悲壮：突破传统闺怨束缚，抒发冲破家庭牢笼、投身家国革命的豪情壮志与侠义精神。\n（2）词中情景交融、哀景衬豪情：上片借中秋月夜的清冷萧瑟烘托词人不甘雌伏、知音难觅的孤愤；下片由景入情，在苍凉秋色中抒发济世报国的豪情，景助情势，情使景显。",
  "fc2834e840627b37a3789d846d91c1e9":
    "（1）运用引用论证，引用多位作家和美学家对废墟的名言，有力地论证了废墟具有超越时代、跨文化的独特审美价值与历史厚度，升华了文章主旨，引发读者的审美共鸣与历史思考。\n（2）A",
  "ad504067dbfc67641f24bc5d970189b6":
    "（1）①老钱进山割漆、精心配漆；②老钱按工序多次为家具刷漆；④老钱带伤坚持完成最后一道上漆工序\n（2）①通过正面细节描写老钱擦拭家具的动作及侧面描写众人的夸赞，突出了生漆家具的品质优良，衬托出老钱精湛高超的漆艺；②运用语言和动作描写，生动塑造了老钱淳朴耿直、重信守诺、不贪钱财的工匠形象。\n（3）结尾写赵大小姐赠送匾额致谢、老钱收徒传艺，既照应前文、使故事情节圆满完整，又凸显了传统手艺得以薪火相传的美好主题，深化了赞美工匠精神的主旨。\n（4）B",
  "26db8ec46f1ef361132c45cd66cad336":
    "（1）本文采用逻辑顺序。先由肺炎疫情引出说明对象“冠状病毒”，接着依次介绍冠状病毒的发现历史、命名缘由、感染症状、传播途径与预防措施，层层深人，条理清晰，符合人们的认知规律。\n（2）“不仅……还……”构成递进关系，先说明冠状病毒是普通感冒的常见病原体之一，再进一步指出它还是多次重大疫情的元凶，突出其危害之大，体现了说明文语言的严密性与逻辑性。\n（3）C",
  "ac8530695366d74f44dcfb0cb69321f0":
    "（1）①多产：客厅、卧室以至天花板贴满剧照，扮演过农民、地主、医生等各式各样的角色；②敬业：对每个配角都全力以赴，一句台词反复演练上万次，仔细琢磨每个细节；③称职：无论扮演什么角色都栩栩如生、传神到位。\n（2）插叙。补充交代了这位演员离异、家庭破裂的婚姻背景，与他舞台上的成功形成强烈反差，为下文他回答“最不成功的角色是自己”做铺垫，使人物形象更加真实立体。\n（3）①眉飞色舞：表现出他谈起舞台角色时内心的得意、自信与自豪；②欲言又止：表现出他提及现实生活中的家庭与亲人时内心的愧疚、痛苦、悔恨与沮丧。\n（4）示例：人生就像舞台，我们不仅要演好学业与事业上的角色，更不能忽略生活中作为子女、朋友和公民的责任；只有兼顾事业追求与家庭温情，才算真正演好了“自己”这一人生最重要的角色。",
  "c2bd69c0479c001cdb2d6447347664b7":
    "（1）C\n（2）A\n（3）B",
  "c536807fc4148733de6ba523b8e84bb7":
    "（1）尾联采用直抒胸臆的抒情方式，慷慨激昂地表达了诗人宁死不屈、舍生取义、以死报国的崇高民族气节与赤诚忠心。\n（2）A",
  "1aae4826be56f2eb7dfb3dbca1c3feed":
    "（1）①苍凉壮阔；②壮志难酬的悲慨；③思念家乡\n（2）示例：“浊酒一杯家万里”中“一杯”与“万里”形成强烈数量对比，一杯浊酒消解不了万里乡愁，凝练而深沉地表现了守边将士思乡之切与功业未成的无奈悲凉。",
  "44c2574ac167f58cf7c9932b2d125187":
    "（1）日落时分孤舟泊岸，入夜后听岭猿啼啸、灭烛就枕，深夜闻渔歌阵阵，黎明时听鸡鸣报晓。\n（2）颔联以猿啸反衬潭水空寂，突出环境幽僻冷寂的特点；后两联写诗人夜闻渔歌、晨听鸡鸣，联想到误入桃花源的典故，表现了诗人超然尘俗、向往宁静淡泊生活的心境。",
  "8e46ddb84daf2a3b78dbadf7bf7739ee":
    "（1）称它“最美、最珍贵”是因为这片干枯的槐树叶沾着故乡的泥土，承载着诗人对祖国故土的深情眷恋；说它“最让人伤心、流泪”是因为它脱离母体漂泊异乡，勾起了诗人羁旅海外、远离祖国的离愁与悲伤。\n（2）D\n（3）C",
  "d0e79c6c6450ffed957585bcad63643b":
    "（1）七拼八凑\n（2）七上八下\n（3）七高八低\n（4）七嘴八舌",
  "1445c55a004dd1fcb494b815ef354a42":
    "（1）①曲牌名；②秋天的愁思；③流落异乡、极度悲伤思乡的旅人\n（2）深秋黄昏，枯萎的藤蔓缠绕着千年老树，暮鸦在枝头哀鸣；不远处小桥横跨潺潺流水，桥边几户人家炊烟袅袅；荒凉古道上，瑟瑟西风中一位游子正骑着瘦马踽踽独行。",
  "5d81a9e8781a44f47b45abb729cb7344":
    "（1）①对人谦称自己的弟弟；②视觉；③听觉\n（2）运用借景抒情（融情于景）的手法，将思弟念家之情融入寒露初降、圆月高悬的秋夜景物中，主观上觉得故乡的月色比异乡更加明亮，委婉深沉地表达了对故乡和亲人的深切思念。",
  "c689e9c8541edeb6c33dcf14c1327796":
    "（1）颈联“沉舟侧畔千帆过，病树前头万木春”以“沉舟”“病树”自比，用“千帆过”“万木春”展现出万物蓬勃发展的生机，既抒发了诗人虽遭贬谪仍豁达乐观的胸怀，又蕴含着新事物必将取代旧事物的哲理。\n（2）B",
  "d473ccf08dfb4e793de99f1265df6ff1":
    "（1）运用心理描写和对比手法，“衣裳薄”与“盼天寒”形成强烈反差，深刻刻画出卖炭翁为生计所迫、宁可自己受冻也期盼炭能卖个好价钱的矛盾痛苦心理，表达了诗人对底层劳动人民的深切同情。\n（2）D",
  "38d6c2b1db148e34f4520bf4049ca572":
    "（1）景象：春雨过后，漫山遍野的春花竞相绽放，在微风细雨中轻轻摇曳，整座山峰春意盎然。妙处：“动”字化静为动，生动传神地写出山花在雨后摇曳生姿、点染整座山峰的勃勃生机，流露出词人对春日山景的喜爱之情。\n（2）A",
  "af3c33df9085baff96e405313b4c1c43":
    "（1）这两句诗对仗工整，画面雄浑壮阔：“大”字写出边疆沙漠的浩瀚无边，“孤”字烘托出景物的单调与苍凉，“直”字展现孤烟劲拔坚毅之美，“长”字写出黄河横贯大漠的绵延无尽，“圆”字添一分苍茫温润，共同营造出雄浑壮美的边塞意境。\n（2）A",
  "ec191655e0bea5a6d9960865415cb78f":
    "（1）①秋；②杨花落尽；③表现旅途遥远，寄托对故乡或友人的绵长情思\n（2）《闻王昌龄左迁龙标遥有此寄》中，诗人运用拟人手法，将明月当成善解人意的使者，把满腔愁思与关切托付给明月，让明月跨越千里伴随友人远赴夜郎，生动表达了对友人的深切同情与挂念。",
  "48330572de393b371266578456651482":
    "（1）运用比喻和对偶的修辞手法，将破碎的国家山河比作风中飘散的柳絮，将自己坎坷动荡的身世比作雨中飘摇的浮萍，生动贴切地将国家命运与个人遭遇融为一体，抒发了国破家亡的悲痛与忧愤。\n（2）A",
  "bce81520f1a164e966e76c66120586d9":
    "（1）本诗描绘了水鸟和鸣、采摘荇菜等河洲劳作与自然景象，抒发了青年男子对文静美好女子的爱慕与追求，经历了求之不得的焦虑苦闷与想象求而得之的喜悦，表现了纯真健康的美好爱情。\n（2）全诗巧妙运用比兴手法：开篇以“关关雎鸠，在河之洲”起兴，借水鸟相向合鸣引出“窈窕淑女，君子好逑”；后文又以“参差荇菜，左右流之”起兴，借采摘水中摆动的荇菜烘托君子求取淑女的执着与急切。",
  "aac2a8cbc43d310876b7e273f43de350":
    "（1）兵营里将士们分食烤熟的牛肉，军乐队奏响雄壮激昂的塞外战歌，秋日沙场上正在举行盛大威武的阅兵典礼，气氛悲壮热烈。\n（2）D",
  "04089c870fd633f439f8fcd1615eb14d":
    "（1）①负气指责父亲无能并离家出走；②误拨父亲电话留下一段话；③回家发现父亲手机一直连着充电器\n（2）通过侧面描写同学们的安静反应，烘托出“我”那番话的真挚感人，同时为下文“我”发现当时误拨了父亲电话的情节做铺垫。\n（3）运用外貌描写，细致刻画出父亲满脸沧桑、白发稀疏、憔悴衰老的模样，直观展现了父亲半个多月来因担忧、思念“我”而心力交瘁，体现了深沉的父爱。\n（4）父子俩冰释前嫌：父亲因自己没能帮上儿子而自责愧疚、又为儿子的理解而欣慰感动；“我”则为自己当初的自私任性与误解父亲而悔恨不已。\n（5）示例：儿子终于理解我的苦心了，怪我没本事帮他铺路，让他一个人在外受苦。不知他现在吃得好不好、顺不顺利，我一定要守着电话，等他平安回来。",
  "15b196da464a49e1774afeae6b5cc2d9":
    "（1）①心疼地把他扶起来；②被拘留在看守所；③慈爱地向客人介绍他；④勤劳刻苦让家里经济状况改善\n（2）运用自然环境描写，描绘出四年后夏日草原碧绿、野花争艳的生机勃勃景象，烘托出阿妈拉巴一家重归温馨和睦的幸福氛围，暗示宽容与善良让生活焕发新生。\n（3）AC\n（4）作用：“阿妈拉巴的酥油灯”是贯穿全文的线索，象征着阿妈拉巴宽容善良、温暖人心的美好品质，点明并升华主旨。感悟：宽容能化解仇恨、救赎心灵；正如阿妈拉巴用宽容接纳刘志、曼德拉放下怨恨走出心灵囚笼，学会宽容既能照亮他人，也能让自己的生命获得真正的安宁与自由。",
  "da951a3459b8e07f2ca4874cade20a7a":
    "（1）①适应力强，生长范围广；②花朵繁茂，金黄明丽；③姿态各异，活泼灵动，自然成趣。\n（2）丰富文章文化内涵，增添阅读趣味，借齐白石画作中丝瓜与草虫相映成趣的意境，突出丝瓜花质朴旺盛的生命力，表达作者对丝瓜花的喜爱。\n（3）运用比喻和拟人的修辞手法，将丝瓜花比作“顽皮的孩子”，并连用“伏、仰、蹲、顾盼、依偎”等动词，生动传神地描绘出丝瓜花千姿百态、充满生机的情状，流露出作者的喜爱之情。\n（4）示例：①几只母鸡在院角悠闲地踱步觅食；②树荫下老爷爷摇着蒲扇眯眼小憩\n（5）示例：我喜欢梅花，因为梅花不畏严寒、傲雪凌霜，象征着坚韧不拔的品格。相关诗句：“墙角数枝梅，凌寒独自开。”",
  "6d646c99b6a36b052b8297d862db68cf":
    "（1）①曹操集；②曹操；③孟德；④东汉末年；⑤政治；⑥军事；⑦慷慨悲壮；⑧曹丕；⑨曹植\n（2）①李白；②太白；③青莲居士；④唐\n（3）①散曲（元曲）；②曲牌；③马致远；④元；⑤散曲",
  "bc1a04622ff4358b3f1d8a18a9fb57f1":
    "（1）①小时候每次回家，奶奶都早早为我们烙好香喷喷的葱花饼；②大年初五清晨我们返城时，奶奶天不亮就起床烙饼并用麻布层层包裹让我们带上；③后来奶奶年迈仍坚持为我们烙葱花饼，葱花饼承载着奶奶深沉的爱。\n（2）综合运用心理感受、视觉和嗅觉描写：先写打开袋子时内心的强烈震撼，再从视觉写麻布层层包裹下整整齐齐的葱花饼，最后从嗅觉写五香粉、葱花和面香弥漫空间，细腻传神地表现出奶奶的体贴入微与“我”的感动。\n（3）奶奶是一位勤劳能干、疼爱晚辈、细心体贴的老人：她不辞辛劳早起为晚辈烙葱花饼，并细心地用麻布层层包裹以保持饼的温度。\n（4）示例一：同意“表达家庭亲情”。全文以“葱花饼”为线索，饱含深情地记叙了奶奶为我们烙饼、包饼的点滴往事，赞美了至真至纯的隔代亲情。示例二：同意“关注老年人生活”。文章在展现奶奶疼爱晚辈的同时，也写出了农村老人独居守望、期盼儿孙归来的孤寂，引发读者对老年人精神生活的关怀。",
  "49cf43960cf5d737b2ff880c67271531":
    "（1）BE\n（2）“仰望中的登攀”在结构上承上启下，既承接上文对司马迁伟大人格的景仰（“仰望”），又引出下文沿着司马祠九十九级神道拾级而上的游览过程（“登攀”），将外在的登山步伐与内在的精神朝圣融为一体。\n（3）①九十九级神道：象征司马迁一生历经的九九八十一难与顽强抗争；②司马迁泥塑像：展现司马迁刚毅威严的“完人”气度；③衣冠墓冢：呈八卦造型，象征司马迁参透天人之际的大智大慧；④墓顶千年古柏：苍劲挺拔，象征司马迁直指苍穹的“天问”精神与不朽风骨。\n（4）连用四个“读”字，将司马祠比作一部厚重的历史巨著，由浅入深地写出作者从观赏建筑风貌到品悟司马迁悲壮人生、不朽精神与生命哲理的心路历程，深化了敬仰史圣的主旨。",
};

export function alignSubquestionAnswers(question) {
  const qId = question.id;
  if (PINNED_ANSWERS[qId]) {
    question.answer = PINNED_ANSWERS[qId];
  }

  const stemMarkers = [...question.stem.matchAll(/(?:^|\n)（([1-9]\d*)）/gu)];
  const K = stemMarkers.length;
  question.answer = normalizeAnswerNumbering(question.answer, K, qId);

  const ansMarkers = [...question.answer.matchAll(/(?:^|\n)（([1-9]\d*)）/gu)];
  const M = ansMarkers.length;

  if (K >= 2 && M > K) {
    let counts = MULTI_BLANK_COUNTS[qId];
    if (!counts) {
      const parts = question.stem.split(/\n\n(?=（[1-9]\d*）)/u);
      const subParts = parts.filter((p) => /^（[1-9]\d*）/u.test(p));
      const detected = subParts.map(countSubBlanks);
      const sum = detected.reduce((a, b) => a + b, 0);
      if (sum === M) counts = detected;
    }
    if (counts && counts.length === K && counts.reduce((a, b) => a + b, 0) === M) {
      const ansItems = [];
      for (let i = 0; i < ansMarkers.length; i++) {
        const start = ansMarkers[i].index + ansMarkers[i][0].length;
        const end = i + 1 < ansMarkers.length ? ansMarkers[i + 1].index : question.answer.length;
        ansItems.push(question.answer.slice(start, end).trim());
      }
      const grouped = [];
      let ptr = 0;
      for (let k = 0; k < K; k++) {
        const c = counts[k];
        const slice = ansItems.slice(ptr, ptr + c);
        ptr += c;
        if (c === 1) {
          grouped.push(`（${k + 1}）${slice[0]}`);
        } else {
          const joined = slice.map((item, idx) => `${toCircled(idx + 1)}${item}`).join("；");
          grouped.push(`（${k + 1}）${joined}`);
        }
      }
      question.answer = grouped.join("\n");
    }
  }

  // Also normalize solution numbering cleanly
  if (Array.isArray(question.solutions) && question.solutions[0]) {
    question.solutions[0] = normalizeAnswerNumbering(question.solutions[0], K, qId);
  }

  return question;
}

export function cleanMangledSolutionMeta(text) {
  if (!text) return "";
  return String(text)
    .replace(/^【(?:优化后?解析|详解优化|赏析优化|分析思路|解题思路)】\s*/u, "")
    .replace(/为了减少阅读负担，解析可简化为[：:]\s*/gu, "")
    .replace(/与原题解析保持一致，未进行大幅度修改[。.]?\s*/gu, "")
    .replace(/新选项([A-F])/gu, "$1项")
    .replace(/新的([A-F])项/gu, "$1项")
    .trim();
}

const CHOICE_ITEM_OVERRIDES = {
  // 多选题: 9b1f29b3edda952754b5c650b4853d9c (valid #196)
  "9b1f29b3edda952754b5c650b4853d9c": (q) => {
    q.options.D =
      "格列佛在大人国与国王谈论英国的政治制度时，国王对格列佛所述英国的状况非常不满，将其子民归结为“自然界在地面上爬行的小毒虫中最有害的一类”。在小人国，国王因格列佛在皇宫小便灭火，并且不愿彻底消灭不来夫斯古帝国而对他十分不满。";
    q.options.E =
      "孙悟空在龙宫索得金箍棒和一身披挂，又大闹地府勾去生死簿，龙王和阎王表奏玉帝，请伏妖猴。玉帝派太白金星赴花果山招安悟空，封他做“弼马温”。";
  },
  // 15 单选题 with LLM-corrected distractors
  "5e88a265d7cba5d47eb5376225770b32": (q) => {
    q.options.B = q.options.B.replace("圆明园", "园明园");
    q.options.C = q.options.C.replace("相得益彰", "相得益章");
    q.options.D = q.options.D.replace("走投无路", "走头无路");
    q.solutions = [
      "A项所有词语书写均正确；B项“园明园”应写作“圆明园”；C项“相得益章”应写作“相得益彰”；D项“走头无路”应写作“走投无路”。故选A。",
    ];
  },
  "21bfa5e309ef006f4e5168b18d98f9c4": (q) => {
    q.options.A = q.options.A.replace("妥帖", "妥贴");
    q.options.C = q.options.C.replace("倒计时", "倒记时");
    q.options.D = q.options.D.replace("巧妙绝伦", "巧妙绝轮");
    q.solutions = [
      "A项“妥贴”应写作“妥帖”；B项所有词语书写均正确；C项“倒记时”应写作“倒计时”；D项“巧妙绝轮”应写作“巧妙绝伦”。故选B。",
    ];
  },
  "fbdd78aba7da713fbf027d2fd4beadae": (q) => {
    q.options.D = "禁止空调厂商和经销商不得以价格战的手段进行不正当竞争。";
    q.solutions = [
      "A项“能否解决……是……的前提”两面对一面；B项表意明确，没有语病；C项“当……的时候，是……的时候”搭配不当；D项“禁止……不得……”否定不当，表意相反。故选B。",
    ];
  },
  "dd8670164daaff0d5000e098013b67ef": (q) => {
    q.options.A = q.options.A.replace("捶打", "锤打");
    q.options.C = q.options.C.replace("飘动", "漂浮");
    q.options.D = q.options.D.replace("变幻", "变换");
    q.solutions = [
      "A项“锤打”应改为“捶打”；B项用词准确恰当；C项“漂浮”指在液体表面停留在某处或浮动，形容白雾在竹林间流动应为“飘动”；D项“变换”多指具体事物的更换，形容霞光、云彩姿态奇异多变应为“变幻”。故选B。",
    ];
  },
  "f70b9c6d9b80f136d896528078556abe": (q) => {
    q.options.A = q.options.A.replace("萦带", "莹带");
    q.options.B = q.options.B.replace(
      "闻一多先生的著名作品包括《神话与诗》和《唐诗杂论》。",
      "闻一多先生的诗集代表作包括《神话与诗》和《唐诗杂论》。",
    );
    q.solutions = [
      "A项“莹带”应写作“萦带”；B项《神话与诗》《唐诗杂论》是闻一多先生的古典文学研究论著，他的代表诗集是《红烛》《死水》；C项两个“手”均为名词，“手艺”为名词；D项表述完全正确。故选D。",
    ];
  },
  "b025b976ca0745433405d62fc7abb76e": (q) => {
    q.options.A = q.options.A.replace("留下了中国的足迹", "迈出了中国的足迹");
    q.options.B = q.options.B.replace("面对“谁来养活中国”的问题", "面对“谁来养活中国”");
    q.options.C = "这些现象的产生，是因为一些研究者科学精神的缺位密不可分。";
    q.solutions = [
      "A项“迈出……足迹”动宾搭配不当，应为“留下……足迹”或“迈出……步伐”；B项“面对……”后面缺少宾语中心语“的问题”；C项“是因为……密不可分”句式杂糅；D项表意明确，没有语病。故选D。",
    ];
  },
  "6c79275bbda06c65d645bb39fba02749": (q) => {
    q.options.D = q.options.D.replace("正襟危坐", "正经危坐");
    q.solutions = [
      "A项字音、字形均完全正确；B项“解剖（pāo）”应读“pōu”，“胡髭（zī）”字音虽对但前词注音有误；C项“黝黑（yǒu）”正确，“脂粉奁（lián）”前词或字形有误；D项“正经危坐”应写作“正襟危坐”。故选A。",
    ];
  },
  "45941b78855b7d2c3d65a033fbdde6a5": (q) => {
    q.options.A = q.options.A.replace("逃窜", "逃串");
    q.options.B = q.options.B.replace("旁骛", "旁鹜");
    q.options.C = q.options.C.replace("矫揉造作", "骄揉造作");
    q.solutions = [
      "A项“逃串”应写作“逃窜”；B项“旁鹜”应写作“旁骛”；C项“骄揉造作”应写作“矫揉造作”；D项所有词语均书写正确。故选D。",
    ];
  },
  "befcebb1104b85f50b7f00341a35d657": (q) => {
    q.options.A = q.options.A.replace("蹑手蹑脚", "聂手聂脚");
    q.options.B = q.options.B.replace("练达", "炼达").replace("不屑置辩", "不屑置辨");
    q.options.C = q.options.C.replace("心旷神怡", "心旷神饴");
    q.solutions = [
      "A项“聂手聂脚”应写作“蹑手蹑脚”；B项“炼达”应写作“练达”，“不屑置辨”应写作“不屑置辩”；C项“心旷神饴”应写作“心旷神怡”；D项所有词语均书写正确。故选D。",
    ];
  },
  "4b55cefb1bb25d8af3d0172bca9ca946": (q) => {
    q.options.C = q.options.C.replace("（lòu）", "（lóu）");
    q.options.D = q.options.D.replace("相形见绌", "相形见拙");
    q.solutions = [
      "A项加点字注音与书写均完全正确；B项“脊梁（jí）”应读“jǐ”；C项“简陋（lóu）”应读“lòu”；D项“相形见拙”应写作“相形见绌”。故选A。",
    ];
  },
  "358c4b9cde244e2c03440ac398938c6d": (q) => {
    q.solutions = [
      "A项“狭隘（ǎi）”应读“ài”；B项“晶莹（yín）”应读“yíng”；C项“抡（lùn）起”应读“lūn”；D项加点字注音全部正确。故选D。",
    ];
  },
  "fc443987a2d5d97fdacc7b19fd874114": (q) => {
    q.options.A = q.options.A.replace("典籍", "典藉");
    q.options.B = q.options.B.replace("道歉", "倒歉");
    q.options.C = q.options.C.replace("抱着冰冷的身子", "妪着冰冷的身子");
    q.solutions = [
      "A项“典藉”应写作“典籍”；B项“倒歉”应写作“道歉”；C项“妪着”应写作“抱着”（或“怄/呕”等错别字）；D项所有字词书写均正确。故选D。",
    ];
  },
  "c4c4becda7aa8a167d324fd175b2de7a": (q) => {
    q.options.A = q.options.A.replace("昼夜不停", "昼夜不断");
    q.options.B = q.options.B.replace("奔腾万里", "一泄万里");
    q.options.C = q.options.C.replace("高粱", "高梁");
    q.solutions = [
      "A项“昼夜不断”与水波涌动搭配不当，应为“昼夜不停”；B项“一泄万里”应写作“一泻万里”；C项“高梁”应写作“高粱”；D项所有词语均书写正确。故选D。",
    ];
  },
  "35f4e8e4c1a3f0430a38806162fbc72c": (q) => {
    q.options.B = q.options.B.replace("妨碍", "防碍");
    q.options.C = q.options.C.replace("金榜题名", "金榜提名");
    q.options.D = q.options.D.replace("旋律", "弦律").replace("挑拨离间", "挑拔离间");
    q.solutions = [
      "A项所有词语书写均正确；B项“防碍”应写作“妨碍”；C项“金榜提名”应写作“金榜题名”；D项“弦律”应写作“旋律”，“挑拔离间”应写作“挑拨离间”。故选A。",
    ];
  },
  "1e2ad63c753e3c97b66b318ca10ee366": (q) => {
    q.options.A = q.options.A
      .replace("散文集《朝花夕拾》", "散文诗集《朝花夕拾》")
      .replace("《阿长与》", "《阿长与〈山海经〉》");
    q.solutions = [
      "A项《朝花夕拾》是鲁迅的回忆性散文集，而非“散文诗集”（鲁迅的散文诗集是《野草》）；B、C、D三项文学常识表述均正确。故选A。",
    ];
    q.answer = "A";
  },
  // 12 单选题 with option/solution mismatches
  "4f0889ba44a0c77123f5e06e307c3c20": (q) => {
    q.options.C = q.options.C.replace("戏谑", "迫不急待");
    q.solutions = [
      "A项“朦胧（móng）”应读“méng”；B项字音、字形均完全正确；C项“迫不急待”应写作“迫不及待”；D项“瑟缩（sè）”正确，“言简意赅（hái）”应读“gāi”。故选B。",
    ];
  },
  "9b7a96663021af5af35125afd6591059": (q) => {
    q.solutions = [
      "A项所有词语书写均正确；B项“枯躁”应写作“枯燥”；C项“长途拔涉”应写作“长途跋涉”；D项“格物至知”应写作“格物致知”。故选A。",
    ];
  },
  "6ad55c696a263ab2ba87352cbbd2842f": (q) => {
    q.options.B = q.options.B.replace("【暗】呜", "【喑】呜");
    q.options.C = q.options.C.replace("（yǎo）", "（yáo）");
    q.solutions = [
      "A项“模样（mó）”应读“mú”，“如法炮制（pào）”应读“páo”；B项字音、字形均正确；C项“窈窕（yáo）”应读“yǎo”；D项“掂斤播两”应为“拈斤播两”，“觚筹交错”应为“觥筹交错”。故选B。",
    ];
  },
  "3cc70f3b7a45e3c5db24f6a8de9ce264": (q) => {
    q.options.B = q.options.B.replace("郑重其事", "郑重其是");
    q.options.D = q.options.D.replace("络绎不绝", "络译不绝");
    q.solutions = [
      "A项所有词语均无错别字；B项“郑重其是”应写作“郑重其事”；C项“表章会”应写作“表彰会”；D项“络译不绝”应写作“络绎不绝”。故选A。",
    ];
  },
  "0526dd8ade3c04589783ace6fd8af881": (q) => {
    q.options.B = q.options.B.replace("英国女作家夏洛蒂·勃朗特", "法国女作家夏洛蒂·勃朗特");
    q.options.C = q.options.C.replace("“小寒”之前是“大寒”", "“小寒”之后是“大寒”");
    q.solutions = [
      "A、C、D三项表述均正确；B项《简·爱》的作者夏洛蒂·勃朗特是英国女作家，而非“法国女作家”。故选B。",
    ];
  },
  "2f589cde2771f3160471534886a82d9f": (q) => {
    q.options.A = q.options.A.replace("腼【腆】（tiān）", "腼【腆】（tiǎn）");
    q.solutions = [
      "A项加点字注音全部正确；B项“抽屉（qí）”应读“tì（轻声ti）”；C项“凝聚（nín）”应读“níng”，“模糊（mò）”应读“mó”；D项“瑕疵（chī）”应读“cī”，“羞怯（qie）”应读“qiè”，“腼腆（tiān）”应读“tiǎn”。故选A。",
    ];
  },
  "4add02a5bc32fd51e79b935254b2c1ec": (q) => {
    q.options.A = q.options.A.replace("抑扬顿挫", "抑扬顿措");
    q.solutions = [
      "A项“抑扬顿措”应写作“抑扬顿挫”；B项“震聋发聩”应写作“振聋发聩”；C项“坦荡如底”应写作“坦荡如砥”；D项所有词语均书写正确。故选D。",
    ];
  },
  "b29f5d244887486f915373c6203a37d5": (q) => {
    q.solutions = [
      "A项“巧妙绝轮”应写作“巧妙绝伦”；B项“狼籍”应写作“狼藉”；C项“教悔”应写作“教诲”；D项所有词语均书写正确。故选D。",
    ];
  },
  "c77da3dfa88f1099a89ebfe66baea6b4": (q) => {
    q.solutions = [
      "A项“气氛（fèn）”应读“fēn”；B项所有加点字注音均正确；C项“稽（qí）首”应读“qǐ”，“篡（chuàn）改”应读“cuàn”；D项“苛（gē）求”应读“kē”。故选B。",
    ];
  },
  "05768aab5c2897c3010569bf3e8c07c1": (q) => {
    q.options.B = q.options.B.replace("震撼", "震憾");
    q.options.C = q.options.C.replace("与日俱增", "与日剧增");
    q.options.D = q.options.D.replace("轻歌曼舞", "轻歌漫舞");
    q.solutions = [
      "A项所有词语均无错别字；B项“震憾”应写作“震撼”；C项“与日剧增”应写作“与日俱增”；D项“轻歌漫舞”应写作“轻歌曼舞”。故选A。",
    ];
  },
  "80e696888621ba4f7963a1b9c4a6fc76": (q) => {
    q.solutions = [
      "A项“悄（qiǎo）然”应读“qiāo”；B项“自曝自弃”应写作“自暴自弃”；C项加点字的拼音和书写均正确；D项“遒劲（jìn）”应读“jìng”。故选C。",
    ];
  },
  "8adc539c5497b713518dd984d23e66c1": (q) => {
    q.options.C = q.options.C.replace("帐篷", "帐蓬");
    q.options.D = q.options.D.replace("闲暇", "闲瑕");
    q.solutions = [
      "A项所有词语书写均正确；B项“决别”应写作“诀别”；C项“帐蓬”应写作“帐篷”；D项“闲瑕”应写作“闲暇”。故选A。",
    ];
  },
  // Reading / choice items discovered during audit
  "4d32933900a2ecac816f7473a43fb977": (q) => {
    q.stem = q.stem.replace("母亲出于疼爱儿子", "母亲出于疼爱孙子");
  },
  "e05945a8f7275d5852f544f51e87cf5e": (q) => {
    q.solutions[0] = q.solutions[0].replace(
      "通过描绘荒芜景象表达了对过去繁华的怀念",
      "写出了重返故居时见老屋依旧、燕子归巢的亲切与欣慰，并非“表现了作者对乡村没落的悲叹”",
    );
  },
};

const CONTENT_ITEM_OVERRIDES = {
  // Textbook essay questions missing title/context
  "babdc4ab1f5111c9034ed9a04dca3afc": (q) => {
    q.stem =
      "在顾拜旦《庆祝奥林匹克运动复兴25周年》一文中，作者认为奥林匹克精神与纯粹的竞技精神有什么区别？它包含哪些内容？";
    q.type = "现代文阅读";
  },
  "b3a624e71bcc038d240d85a0f81bfbf8": (q) => {
    q.stem = "在朱自清《背影》一文中，父亲去买橘子时穿戴的是什么衣服？这样写有什么作用？";
    q.type = "现代文阅读";
  },
  // Open-ended comprehension/activity items misclassified as 填空题 without blanks
  "02bf490c9539004e3392c7bb614ed47a": (q) => {
    q.type = "现代文阅读";
  },
  "4f2fcb910e71698c6e68f3f888721931": (q) => {
    q.type = "现代文阅读";
  },
  "f6e513ea68c0ac54ea1f82f8cacdb8b3": (q) => {
    q.type = "现代文阅读";
  },
  "94ded0d6e21e9ed16cb6c432fda233c7": (q) => {
    q.type = "复合题";
  },
  "fb8911ecab4e6b33a79063464121bc8f": (q) => {
    q.type = "复合题";
  },
  // Truncated subquestion (2) in 苏州园林
  "1a7289f8a3c1993e90af6582612eab05": (q) => {
    q.stem = q.stem.replace(
      /（2）选文第②段中“一切都要为构成完美的图画而存在，决不容许有欠美伤美的败笔”一句[^\n]*/u,
      "（2）选文第②段中“一切都要为构成完美的图画而存在，决不容许有欠美伤美的败笔”一句中“败笔”是什么意思？改为“地方”可否？为什么？",
    );
  },
  // Corrupted answer in 82df41da8e62fc5e6245a85205b12016 (train #1697)
  "82df41da8e62fc5e6245a85205b12016": (q) => {
    q.stem = q.stem
      .replace("【①】", "①______")
      .replace("【②】", "②______")
      .replace("《【③】》", "《③______》")
      .replace("【④】", "④______");
    q.answer = "（1）唐僧（唐三藏）\n（2）朱德\n（3）儒林外史\n（4）藤野先生";
    q.solutions = [
      "（1）由“前往西天取经”“九九八十一难”可知，①处人物是《西游记》中的唐僧（唐三藏）。\n（2）由“《红星照耀中国》”“红军统帅”“沉默谦虚、爱护部下”可知，②处人物是朱德。\n（3）由“清代吴敬梓创作的长篇讽刺小说”“科举制度下读书人的命运”可知，③处作品是《儒林外史》。\n（4）由“鲁迅在仙台学医时的恩师”“修改讲义”可知，④处人物是藤野先生。",
    ];
  },
  // 27 错别字 non-choice items where LLM auto-corrected the typos in stem
  "47df7bbab695992328893299ca1c1ce7": (q) => {
    q.stem = q.stem.replace("不记其数", "不记其数").replace("消声匿迹", "消声匿迹");
  },
  "048844f804058fd4b3e89e90e5166898": (q) => {
    q.stem =
      "阅读下面的文字，完成后面的问题。\n历史的星空，因有众多杰出人物而光辉灿烂。他们中有叱咤风云的政治家，有决胜千里的军事家，有博学睿智的科学家，还有给人类奉献宝贵精神食粮的文学艺术家……阅读本单元课文，能让我们感受到杰出人物的非凡器宇：邓稼先在戈壁滩上风餐露宿，鞠躬尽粹，死而后已，成为了中国核武器事业的奠基人；闻一多先生潜心贯注地钻研古代典籍，目不窥园，沥尽心血，而后又慷慨淋漓地发表讲演，气冲斗牛，声震天地；鲁迅先生面对敌人的威协毫不退缩，依然坚守岗位，忘我工作。\n（1）给语段中加点的字注音。\n叱【咤】（______） 慷【慨】（______）\n（2）语段中有两个错别字，请找出来并改正。\n①“______”改为“______”；②“______”改为“______”。";
    q.answer = "（1）①zhà；②kǎi\n（2）①粹—瘁；②协—胁";
  },
  "628e1c8304bb9523cbbd532be56a4fbc": (q) => {
    q.stem =
      "请找出下列词语中的四个错别字，并改正。\n粗制烂造 抑扬顿挫 鹤立鸡群 正襟危坐 诚惶诚恐 藏污纳垢 黯然失色 广袤无垠 颔首低眉 无可置疑 一代天娇 莫衷一是\n错别字改正：______";
    q.answer = "烂—滥；娇—骄";
    q.solutions = ["“粗制烂造”应写作“粗制滥造”；“一代天娇”应写作“一代天骄”。"];
  },
  "efbfd590c544b3ba25aa8bcb0793a564": (q) => {
    q.stem = q.stem.replace("消声匿迹", "消声匿迹").replace("周道如砥", "周道如底").replace("引颈受戮", "引颈受戳");
    if (!q.stem.includes("周道如底")) {
      q.stem =
        "请找出下列词语中的错别字并改正。\n销声匿迹 遮天蔽日 周道如底 袅袅烟云 山崩地裂 百鸟啾啾 隐姓埋名 引颈受戳\n错别字改正：______";
    }
    q.answer = "底—砥；戳—戮";
    q.solutions = ["“周道如底”应写作“周道如砥”；“引颈受戳”应写作“引颈受戮”。"];
  },
  "5c64d36c89ab372c9007de98b862a8b2": (q) => {
    q.stem =
      "找出下列词语中的错别字并加以改正。\n眼花瞭乱 惟妙惟肖 巧妙绝伦 振耳欲聋 自出心裁 重峦叠嶂 抑扬顿挫 迫不急待\n错别字改正：______";
    q.answer = "瞭—缭；振—震；急—及";
    q.solutions = ["“眼花瞭乱”应写作“眼花缭乱”；“振耳欲聋”应写作“震耳欲聋”；“迫不急待”应写作“迫不及待”。"];
  },
  "54f372da6a585dde3d8132d2bcee6560": (q) => {
    q.stem =
      "找出下列句子中的错别字并改正。\n（1）每当夜间疲倦，正想偷懒时，仰面在灯光中瞥见他黑瘦的面貌，似乎正要说出抑扬顿措的话来。______\n（2）小屋粗制烂造，出自一个农村木匠之手，而不是由古今负盛名的建筑师建造的。______\n（3）这对眼睛不会放过微不足道的细节，同样也能全面揭示广茂无垠的宇宙。______\n（4）在客厅里正襟危坐地等待这位大师的接见，真是让人成惶成恐。______";
    q.answer = "（1）措—挫\n（2）烂—滥\n（3）茂—袤\n（4）成—诚";
  },
  "741d0e58c7c9c66912d6e90172f5dd4f": (q) => {
    q.stem = q.stem.replace("锋芒必露", "锋芒必露").replace("妇孺皆知", "妇儒皆知").replace("鞠躬尽瘁", "鞠躬尽粹");
    q.answer = "（1）①xuǎn；②xiǎn\n（2）①儒—孺；②粹—瘁";
  },
  "104a547e5ec2c93f21c3fc667d76b07c": (q) => {
    q.stem =
      "找出下列词语中的错别字并改正。\n翻来复去 喜出望外 恍然大悟 滚瓜烂熟 混为一谈 花团锦簇 美不胜收 疲倦不勘 截然不同 小心翼翼 不求甚解 油然而生\n错别字改正：______";
    q.answer = "复—覆；勘—堪";
    q.solutions = ["“翻来复去”应写作“翻来覆去”；“疲倦不勘”应写作“疲倦不堪”。"];
  },
  "bf7c12328ad289bd414bce89a1b6d536": (q) => {
    q.stem =
      "请找出下列词语中的错别字并改正。\n人迹罕至 人声鼎沸 来势凶凶 荒草萋萋 锋芒必露 家喻户晓 妇儒皆知 鞠躬尽粹\n错别字改正：______";
    q.answer = "凶凶—汹汹；必—毕；儒—孺；粹—瘁";
    q.solutions = [
      "“来势凶凶”应写作“来势汹汹”；“锋芒必露”应写作“锋芒毕露”；“妇儒皆知”应写作“妇孺皆知”；“鞠躬尽粹”应写作“鞠躬尽瘁”。",
    ];
  },
  "e4fc9eaa5fec0f3e5e0a8916828169ea": (q) => {
    q.stem =
      "找出下列词语中的四个错别字并改正。\n惟妙惟肖 巧妙绝伦 因地制宜 自出新裁 重峦叠障 俯仰生姿 摩肩接踵 络绎不绝 春寒料峭 无动于衷 坦荡如底 潜滋暗长\n错别字改正：______";
    q.answer = "新—心；障—嶂；底—砥";
    q.solutions = ["“自出新裁”应写作“自出心裁”；“重峦叠障”应写作“重峦叠嶂”；“坦荡如底”应写作“坦荡如砥”。"];
  },
  "414bc94b690d928512adfdd4c507f0a6": (q) => {
    q.stem =
      "找出下列词语中的错别字并改正。\n不可名状 微不足道 大庭广众 黯然失色 麻木不仁 骇人听闻 怪诞不经 神彩奕奕 惊慌失措 迫不急待\n错别字改正：______";
    q.answer = "彩—采；急—及";
    q.solutions = ["“神彩奕奕”应写作“神采奕奕”；“迫不急待”应写作“迫不及待”。"];
  },
  "d0f892f7ba15e44c44ca2e9b7559f1d4": (q) => {
    q.stem =
      "找出下列词语中的错别字并改正。\n鞠躬尽粹 妇儒皆知 锋芒必露 家谕户晓 沥尽心血 慷慨淋漓 气冲斗牛 目不窥园\n错别字改正：______";
    q.answer = "粹—瘁；儒—孺；必—毕；谕—喻";
    q.solutions = [
      "“鞠躬尽粹”应写作“鞠躬尽瘁”；“妇儒皆知”应写作“妇孺皆知”；“锋芒必露”应写作“锋芒毕露”；“家谕户晓”应写作“家喻户晓”。",
    ];
  },
  // Pinyin / character restoration items
  "e8cb34c9111fb68a1179f99795b3f1b6": (q) => {
    q.stem =
      "根据拼音写出相应的汉字。\n（1）烦zào（______）\n（2）huáng（______）恐\n（3）荒pì（______）\n（4）取dì（______）";
    q.answer = "（1）躁\n（2）惶\n（3）僻\n（4）缔";
  },
  "d9311a21712be65be978b9c080f6a4fa": (q) => {
    q.stem =
      "给下列加点的字注音，或根据拼音写出汉字。\n（1）【亘】古（______）\n（2）【憎】恶（______）\n（3）烦zào（______）\n（4）深xiāo（______）";
    q.answer = "（1）gèn\n（2）zēng\n（3）躁\n（4）宵";
  },
  "94170c9d0ae1187ab5c370be4cd6cc00": (q) => {
    q.stem =
      "给下列加点的字注音，或根据拼音写汉字。\n（1）震【悚】（______）\n（2）愧【怍】（______）\n（3）狼jí（______）\n（4）赋xián（______）";
    q.answer = "（1）sǒng\n（2）zuò\n（3）藉\n（4）闲";
  },
  "26e6f47d43fde912e81f9c87840372cd": (q) => {
    q.stem =
      "根据拼音写汉字，或给加点的字注音。\n（1）酝niàng（______）\n（2）粗guǎng（______）\n（3）【贮】蓄（______）\n（4）【莅】临（______）";
    q.answer = "（1）酿\n（2）犷\n（3）zhù\n（4）lì";
  },
  "6dbbd1b8e459d9716c73806c830ebcb4": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）分【歧】（______）\n（2）憔【悴】（______）\n（3）【霎】时（______）\n（4）【匿】笑（______）";
    q.answer = "（1）qí\n（2）cuì\n（3）shà\n（4）nì";
  },
  "d3a30efe423a11660346501551b83732": (q) => {
    q.stem =
      "根据拼音写出相应的汉字。\n（1）倜tǎng（______）\n（2）渊bó（______）\n（3）人声dǐng（______）沸\n（4）截然不tóng（______）";
    q.answer = "（1）傥\n（2）博\n（3）鼎\n（4）同";
  },
  "18110d86bd848394c169681a8a76947f": (q) => {
    q.stem =
      "给下列加点字注音或根据拼音写汉字。\n（1）【殉】职（______）\n（2）热【忱】（______）\n（3）狭ài（______）\n（4）鄙bó（______）";
    q.answer = "（1）xùn\n（2）chén\n（3）隘\n（4）薄";
  },
  "045e20481c93162a1b2a7070cbcd5d9e": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）缥【缈】（______）\n（2）滑【稽】（______）\n（3）随声附【和】（______）\n（4）骇人【听】闻（______）";
    q.answer = "（1）miǎo\n（2）jī\n（3）hè\n（4）tīng";
  },
  "aa7c8a63d0f41e62b6b04a3d61e3ae84": (q) => {
    q.stem =
      "根据拼音写汉字。\n（1）xián（______）熟\n（2）diān（______）倒\n（3）咆xiào（______）\n（4）浩hàn（______）";
    q.answer = "（1）娴\n（2）颠\n（3）哮\n（4）瀚";
  },
  "778a0db387a27da7feab475fd8dd19ed": (q) => {
    q.stem =
      "给加点的字注音，或根据拼音写汉字。\n（1）溃【退】（______）\n（2）要【塞】（______）\n（3）仲cái（______）\n（4）由zhōng（______）";
    q.answer = "（1）tuì\n（2）sài\n（3）裁\n（4）衷";
  },
  "d6e05b3f8843ebf3b68aa89b0a911cdd": (q) => {
    q.stem =
      "根据拼音写出相应的汉字。\n（1）油光可jiàn（______）\n（2）抑扬顿cuò（______）\n（3）深恶痛jí（______）\n（4）杳无xiāo（______）息";
    q.answer = "（1）鉴\n（2）挫\n（3）疾\n（4）消";
  },
  "9eb15645e5ad300dd9d46af590cd6458": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）【匿】名（______）\n（2）【诘】责（______）\n（3）【绯】红（______）\n（4）不【逊】（______）";
    q.answer = "（1）nì\n（2）jié\n（3）fēi\n（4）xùn";
  },
  "8676daeee542ae10de0f0b026a123082": (q) => {
    q.stem =
      "根据拼音写汉字。\n（1）器yǔ（______）\n（2）禁gù（______）\n（3）犀lì（______）\n（4）广mào（______）无垠";
    q.answer = "（1）宇\n（2）锢\n（3）利\n（4）袤";
  },
  "2748cf062bf080c8c4ab71856b65bf8f": (q) => {
    q.stem =
      "给下列加点的字注音，或根据拼音写汉字。\n（1）【炽】热（______）\n（2）【窒】息（______）\n（3）吹【嘘】（______）\n（4）筋疲力jìn（______）";
    q.answer = "（1）chì\n（2）zhì\n（3）xū\n（4）尽";
  },
  "f25e3112094e7e570bfd6c0de8679b85": (q) => {
    q.stem =
      "根据拼音写出相应的汉字。\n（1）婆suō（______）\n（2）秀qí（______）\n（3）坦荡如dǐ（______）\n（4）潜zī（______）暗长";
    q.answer = "（1）娑\n（2）颀\n（3）砥\n（4）滋";
  },
  "c90efc2a288af2662c47987fbc6603f8": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）【濒】临（______）\n（2）【俯】瞰（______）\n（3）惟妙惟【肖】（______）\n（4）巧妙绝【伦】（______）";
    q.answer = "（1）bīn\n（2）fǔ\n（3）xiào\n（4）lún";
  },
  "f90bd715c1fdd1f1016d5b397a4f3fbc": (q) => {
    q.stem =
      "根据拼音写出相应的汉字。\n（1）妖ráo（______）\n（2）风sāo（______）\n（3）红zhuāng（______）素裹\n（4）一代天jiāo（______）";
    q.answer = "（1）娆\n（2）骚\n（3）装\n（4）骄";
  },
  "bce0bd39306f82b800a4f9606683cab0": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）【娉】婷（______）\n（2）鲜【妍】（______）\n（3）冠【冕】（______）\n（4）【呢】喃（______）";
    q.answer = "（1）pīng\n（2）yán\n（3）miǎn\n（4）ní";
  },
  "089500984663af53ae439ab3c2175bfa": (q) => {
    q.stem =
      "根据拼音写汉字。\n（1）旁wù（______）\n（2）亵dú（______）\n（3）断章取yì（______）\n（4）言不及yì（______）";
    q.answer = "（1）骛\n（2）渎\n（3）义\n（4）义";
  },
  "a457f34a93508766ce16dc39dd32da4e": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）汲【取】（______）\n（2）压【榨】（______）\n（3）根深【蒂】固（______）\n（4）孜【孜】不倦（______）";
    q.answer = "（1）qǔ\n（2）zhà\n（3）dì\n（4）zī";
  },
  "bc9aaf87a4f5ae31bb799f20ad62f825": (q) => {
    q.stem =
      "根据拼音写出汉字。\n（1）萧suǒ（______）\n（2）家jǐng（______）\n（3）wǎng（______）然\n（4）zhǎn（______）新";
    q.answer = "（1）索\n（2）景\n（3）惘\n（4）崭";
  },
  "5f86fcc7c7e56b0099d1ae4a953eaa5e": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）【栈】桥（______）\n（2）【撬】开（______）\n（3）拮【据】（______）\n（4）牡【蛎】（______）";
    q.answer = "（1）zhàn\n（2）qiào\n（3）jū\n（4）lì";
  },
  "397906cb2f007816a63d792546603ac0": (q) => {
    q.stem =
      "根据拼音写汉字。\n（1）星xiù（______）\n（2）作yī（______）\n（3）不xǐng（______）人事\n（4）走tóu（______）无路";
    q.answer = "（1）宿\n（2）揖\n（3）省\n（4）投";
  },
  "83bb3494d7fa8b3f627590fdbd15138d": (q) => {
    q.stem =
      "给下列加点的字注音。\n（1）【拜】谒（______）\n（2）失【礼】（______）\n（3）茅塞【顿】开（______）\n（4）如【雷】贯耳（______）";
    q.answer = "（1）bài\n（2）lǐ\n（3）dùn\n（4）léi";
  },
  "5f217c7851f760c8638ea13ae2772e20": (q) => {
    q.stem =
      "根据拼音写汉字。\n（1）盘huán（______）\n（2）顷kè（______）\n（3）两lèi（______）插刀\n（4）战战jīngjīng（______）";
    q.answer = "（1）桓\n（2）刻\n（3）肋\n（4）兢兢";
  },
  "cc76014943db296354734b4abec73fa6": (q) => {
    q.stem =
      "给加点字注音，或根据拼音写汉字。\n（1）荤【菜】（______）\n（2）绰【号】（______）\n（3）门kǎn（______）\n（4）伤bā（______）";
    q.answer = "（1）cài\n（2）hào\n（3）槛\n（4）疤";
  },
  "c46bc996b8245e2db644b7795f7a0acf": (q) => {
    q.stem =
      "根据拼音写汉字。\n（1）舵shǒu（______）\n（2）飞cuàn（______）\n（3）海yàn（______）\n（4）蠢bèn（______）";
    q.answer = "（1）手\n（2）窜\n（3）燕\n（4）笨";
  },
  // Specific 填空题 blank restorations
  "9281037ca74445b47846d5a9d6824c7c": (q) => {
    q.stem = "艾青是中国现代著名的诗人，其成名作是《______》。";
  },
  "1b9bd2cd9e990ff612d8ea7fbb83d3b8": (q) => {
    q.stem = q.stem
      .replace("（A）", "（A）______")
      .replace("（B）", "（B）______")
      .replace("（C）", "（C）______")
      .replace("（D）", "（D）______");
  },
  "3af738e9c810a17d091d31b641acadf9": (q) => {
    q.stem = q.stem.replace("【（1）】", "①______").replace("【（2）】", "②______");
  },
  "63f0170b79e9c02229c36315aebaa550": (q) => {
    q.stem = q.stem.replace(/①②$/u, "①______：______");
  },
  "01a3145d03f99382a1e9b2f45fed61bf": (q) => {
    q.stem = "《红星照耀中国》的作者是______，他是______人。";
  },
  "38a72c3f4a9218006e67a7b3961c360b": (q) => {
    q.stem =
      "中国古代名著《西游记》中最具反叛特质的人物是______，最能展现这种叛逆和反抗精神的情节是______。";
  },
  "e50f841aea18f86f91cf3d686ea9a1dc": (q) => {
    q.stem = q.stem.replace("文中的“他”指的是谁？", "文中的“他”指的是______。");
  },
  "d7a5d0ed879abde2ab14d469e679812d": (q) => {
    q.stem = q.stem.replace("是《西游记》中的哪位角色？", "是《西游记》中的______：");
  },
  "4e9697d2f6a3a822c9af71456924ca52": (q) => {
    q.stem = q.stem.replace("这两个人物性格中的共同特点是什么？", "这两个人物性格中的共同特点是______。");
  },
  "3c1bb65252deaeb0a6f8fd598d22e595": (q) => {
    q.stem = `${q.stem}______`;
  },
  "84c88f3a121749e3266b835bceaa7339": (q) => {
    q.stem = `${q.stem}______、______、______。`;
  },
  "33b5134edd68acd928aef48174e7b57b": (q) => {
    q.stem = `${q.stem}______、______、______、______。`;
  },
  "f3412ce32c0821ed66c06817b359ae03": (q) => {
    q.stem = `${q.stem}\n从轻到重依次为：______。`;
  },
  "7bcf267e466b36c97225f5a6fc11e616": (q) => {
    q.stem = `${q.stem}\n褒义词：______；贬义词：______。`;
  },
  "216072042206b10f7af1cb6b1d12ced8": (q) => {
    q.stem = "识别词语的词性。请指出“再塑生命的人”中：\n（1）名词：______\n（2）动词：______";
  },
  "977bbe9b3f97dbe6000776c6a51e4c3c": (q) => {
    q.stem =
      "将下列作品与其作者配对。\n（1）《犟龟》——______\n（2）《小溪流的歌》——______\n（3）《基因畅想》——______\n（4）《如果人类也有尾巴》——______\n备选作者：A. 严文井  B. 坎特·伯恩斯  C. 米切尔·恩德  D. 漆孝诗";
  },
  "fdbcd27ad25821fef0c4ac62329eb05d": (q) => {
    q.stem =
      "解释以下词语的含义。\n（1）杂乱：______\n（2）停留：______\n（3）缓步：______\n（4）犹豫：______\n（5）萧条：______\n（6）见景生情：______\n（7）难以自控：______";
    q.answer =
      "（1）多而乱，没有条理。\n（2）暂时不继续前进或移动。\n（3）缓慢地迈步前行。\n（4）拿不定主意，迟疑不决。\n（5）寂寥冷落，毫无生气。\n（6）看到眼前景物而触动内心情感。\n（7）无法控制自己的情绪或行为。";
  },
  "0efe92b1eaffd9a5dfb1ac96660e3ecd": (q) => {
    q.stem = `${q.stem}\nA处“自如”：______；B处“自然”：______；C处“自然”：______。`;
  },
  "01f4a71745e2c26efd3f190d101cdaaa": (q) => {
    q.stem = `${q.stem}______`;
  },
  "604614076b115afaa10b246cc02e6c2b": (q) => {
    q.stem = `${q.stem}______`;
  },
  "c7093d25988d9683f0a3355ee2b6c06d": (q) => {
    q.stem = `${q.stem}______`;
  },
};

const POETRY_ITEM_OVERRIDES = {
  // 5 side-by-side interleaved poems
  "9bf0408b3177b14b6209993913d76dbd": (q) => {
    q.stem = q.stem.replace(
      /\[甲\][\s\S]*?(?=\n（1）)/u,
      "【甲】\n送杜少府之任蜀州\n王勃\n城阙辅三秦，风烟望五津。\n与君离别意，同是宦游人。\n海内存知己，天涯若比邻。\n无为在歧路，儿女共沾巾。\n\n【乙】\n闻王昌龄左迁龙标遥有此寄\n李白\n杨花落尽子规啼，闻道龙标过五溪。\n我寄愁心与明月，随君直到夜郎西。",
    );
  },
  "a3e034434ded70f66a45bef5a7cc52da": (q) => {
    q.stem = q.stem.replace(
      /（甲）[\s\S]*?(?=\n（1）)/u,
      "【甲】\n题破山寺后禅院\n常建\n清晨入古寺，初日照高林。\n竹径通幽处，禅房花木深。\n山光悦鸟性，潭影空人心。\n万籁此都寂，但余钟磬音。\n\n【乙】\n登飞来峰\n王安石\n飞来山上千寻塔，闻说鸡鸣见日升。\n不畏浮云遮望眼，自缘身在最高层。",
    );
  },
  "187b17c9a113a612cf278578cf8dee8d": (q) => {
    q.stem = q.stem.replace(
      /阅读下面两首古诗[\s\S]*?(?=\n（1）)/u,
      "阅读下面两首古诗，完成各题。\n【甲】\n望岳\n杜甫\n岱宗夫如何？齐鲁青未了。\n造化钟神秀，阴阳割昏晓。\n荡胸生曾云，决眦入归鸟。\n会当凌绝顶，一览众山小。\n\n【乙】\n登飞来峰\n王安石\n飞来山上千寻塔，闻说鸡鸣见日升。\n不畏浮云遮望眼，自缘身在最高层。",
    );
  },
  "d70a68e5e7acf0a8ca27fbdc0e125873": (q) => {
    q.stem = q.stem.replace(
      /阅读下面两首诗[\s\S]*?(?=\n（1）)/u,
      "阅读下面两首诗，回答问题。\n【甲】\n春望\n杜甫\n国破山河在，城春草木深。\n感时花溅泪，恨别鸟惊心。\n烽火连三月，家书抵万金。\n白头搔更短，浑欲不胜簪。\n\n【乙】\n南安军\n文天祥\n梅花南北路，风雨湿征衣。\n出岭同谁出？归乡如此归！\n山河千古在，城郭一时非。\n饿死真吾志，梦中行采薇。",
    );
  },
  "bbd510442807808ee2021536e0ed7028": (q) => {
    q.stem = q.stem.replace(
      /阅读下面两首诗词[\s\S]*?(?=\n（1）)/u,
      "阅读下面两首诗词，完成各题。\n【甲】\n过零丁洋\n文天祥\n辛苦遭逢起一经，干戈寥落四周星。\n山河破碎风飘絮，身世浮沉雨打萍。\n惶恐滩头说惶恐，零丁洋里叹零丁。\n人生自古谁无死？留取丹心照汗青。\n\n【乙】\n破阵子·为陈同甫赋壮词以寄之\n辛弃疾\n醉里挑灯看剑，梦回吹角连营。八百里分麾下炙，五十弦翻塞外声，沙场秋点兵。\n马作的卢飞快，弓如霹雳弦惊。了却君王天下事，赢得生前身后名。可怜白发生！",
    );
  },
  // 4 missing poems
  "7b198d822e1a5da13c5e94d760ccbc05": (q) => {
    q.stem =
      "阅读下面这首诗，完成下列小题。\n观沧海\n曹操\n东临碣石，以观沧海。\n水何澹澹，山岛竦峙。\n树木丛生，百草丰茂。\n秋风萧瑟，洪波涌起。\n日月之行，若出其中；\n星汉灿烂，若出其里。\n幸甚至哉，歌以咏志。\n\n（1）这首诗的作者是东汉末年的______。诗中统领全篇的一个字是“______”字。从写景的虚实上看，这首诗前六句写______，后四句写______。\n\n（2）写出你对“日月之行，若出其中；星汉灿烂，若出其里”这四句诗的理解。";
  },
  "6c0ae998ba23e21432df81454263a764": (q) => {
    q.stem =
      "阅读下面的宋词，完成各题。\n渔家傲·秋思\n范仲淹\n塞下秋来风景异，衡阳雁去无留意。四面边声连角起，千嶂里，长烟落日孤城闭。\n浊酒一杯家万里，燕然未勒归无计。羌管悠悠霜满地，人不寐，将军白发征夫泪。\n\n（1）全词抒发了作者怎样的思想感情？\n\n（2）请揣摩“霜满地”在表达上的作用。";
  },
  "5ebcc09abf516e4d4e46c880693cb773": (q) => {
    q.stem =
      "阅读下面这首古诗，完成各题。\n渡荆门送别\n李白\n渡远荆门外，来从楚国游。\n山随平野尽，江入大荒流。\n月下飞天镜，云生结海楼。\n仍怜故乡水，万里送行舟。\n\n（1）本诗颔联化静为动，极具表现力，请选出与这种手法相同的一项（______）\nA. 明月松间照，清泉石上流。\nB. 晴川历历汉阳树，芳草萋萋鹦鹉洲。\nC. 大漠孤烟直，长河落日圆。\nD. 山重水复疑无路，柳暗花明又一村。\n\n（2）尾联中“故乡水”指什么水？表达了诗人怎样的思想感情？";
  },
  "4d193e3834393d90a549f3f7e17fa805": (q) => {
    q.stem =
      "阅读下面这首词，完成各题。\n卜算子·黄州定慧院寓居作\n苏轼\n缺月挂疏桐，漏断人初静。谁见幽人独往来，缥缈孤鸿影。\n惊起却回头，有恨无人省。拣尽寒枝不肯栖，寂寞沙洲冷。\n\n（1）词中的“鸿”有什么特点？作者借“孤鸿”寄托了怎样的情怀？\n\n（2）下列对这首词的理解和赏析，不正确的一项是（______）\nA. 开头两句通过“缺月”“疏桐”“漏断”等意象，渲染出幽深凄冷的夜境。\nB. “谁见幽人独往来，缥缈孤鸿影”采用托物寓人的手法，将“幽人”与“孤鸿”融为一体。\nC. 下片写孤鸿惊恐不安、四处寻觅温暖巢穴，表现了作者贬居黄州后渴望得到朝廷重用的急切心理。\nD. 全词借景抒情、托物言志，境界孤高澄澈，笔致空灵蕴藉。";
    q.answer =
      "（1）特点：孤寂、高洁、傲岸、不肯随波逐流（拣尽寒枝不肯栖）。情怀：作者借“孤鸿”自喻，寄托了贬谪黄州时期的孤寂苦闷，以及不愿与世俗同流合污、坚守高洁理想的人格追求。\n（2）C";
  },
  // Paraphrased classical poems restored to canonical classical verse
  "df681c87e0fe53e26d5def5f2646a34f": (q) => {
    q.stem = q.stem.replace(
      /湿云①静止[\s\S]*?(?=\n【注释】)/u,
      "湿云①不动溪桥冷，嫩②寒初透东风影。【桥下水声长，一枝和月香。】\n人怜花似旧，花不知人瘦。独自倚阑干③，夜深花正寒。",
    );
  },
  "3bf3949c52b1b08f518e6bf177881099": (q) => {
    q.stem = q.stem.replace("禅院里着", "禅院里______着");
  },
  "ad511bdcd27ed5ed02e3a2f98e44927d": (q) => {
    q.stem = q.stem.replace(
      /低空中悬挂着[\s\S]*?(?=\n（1）)/u,
      "低空银一钩，糁野玉三尺。\n愁绝水边花，无人问消息。",
    );
  },
  "6d568a3b9f43aab419559645178e5830": (q) => {
    q.stem = q.stem.replace(
      /\[甲\][\s\S]*?(?=\n【注】)/u,
      "【甲】\n定风波\n苏轼\n三月七日，沙湖道中遇雨。雨具先去，同行皆狼狈，余独不觉。已而遂晴，故作此词。\n莫听穿林打叶声，何妨吟啸且徐行。竹杖芒鞋轻胜马，谁怕？一蓑烟雨任平生。\n料峭春风吹酒醒，微冷，山头斜照却相迎。回首向来萧瑟处，归去，也无风雨也无晴。\n\n【乙】\n西江月·世事一场大梦\n苏轼\n世事一场大梦，人生几度秋凉？夜来风叶已鸣廊，看取眉头鬓上①。\n酒贱常愁客少，月明多被云妨②。中秋谁与共孤光③，把盏凄然北望。",
    );
  },
  "19b2b980871652d229537b367e2aee29": (q) => {
    q.stem = q.stem.replace(
      /阅读下面两首古诗[\s\S]*?(?=\n（1）)/u,
      "阅读下面两首古诗，完成问题。\n【甲】\n______日作\n唐·顾况\n不觉老将春共至，更悲携手几人全。\n还丹寂寞羞明镜，手把屠苏让少年。\n\n【乙】\n辛未______\n清·赵翼\n烛影摇红焰尚明，寒深知己积琼英①。\n老夫冒冷披衣起，要听雄鸡第一声。\n\n【注释】①琼英：指雪花。",
    );
  },
  "6c434ed8b3d37e3e414fec8f1b277385": (q) => {
    q.stem = q.stem.replace(
      /放慵[\s\S]*?(?=\n【注释】)/u,
      "放慵\n[宋] 陈与义\n暖日薰杨柳，浓春醉海棠。\n放慵①真有味，应俗②苦相妨。\n拙宦人皆笑，疏交午自藏。\n云移稳扶杖，燕坐独焚香。",
    );
  },
  "1c7dabefc91f30a5097c1817ccf45387": (q) => {
    q.stem = q.stem.replace(
      /送别薛华[\s\S]*?(?=\n（1）)/u,
      "别薛华\n王勃\n送送多穷路，遑遑独问津。\n悲凉千里道，凄断百年身。\n心事同漂泊，生涯共苦辛。\n无论去与住，俱是梦中人。",
    );
  },
  "5f5e3166107346378ae79ab8b66bed66": (q) => {
    q.stem = q.stem.replace(
      /武昌老人说笛歌[\s\S]*?(?=\n【注释】)/u,
      "武昌老人说笛歌\n刘禹锡\n武昌老人七十馀，手把庾令①相问书。\n自言少小学吹笛，早事曹王②曾赏激。\n往年镇戍到蕲州，楚山秋竹亲自求。\n千株万株选一节，不惜貂裘换美竹。\n古苔苍苍封老节③，石上孤生饱风雪。\n商声④五音随指发，水中龙应行云绝。\n曾将⑤黄鹤楼上吹，一声占尽秋江月。\n如今老去语犹迟，音韵高低耳不知。\n气力已微心尚在，时时一曲梦中吹。",
    );
  },
  "f2c82684c4cf66212577315949ae1a31": (q) => {
    q.stem = q.stem.replace(
      /小船沿着清澈的溪流[\s\S]*?(?=\n（1）)/u,
      "舟逐清溪弯复弯，柳边山尽柳边山。绿鬟如雾柳如烟。\n两岸春声啼巧舌，一船归思急催舷，斜阳芳草一生闲。",
    );
  },
  "768e7cfa1ab52742bee604da15db9a38": (q) => {
    q.stem = q.stem.replace(
      /陂①水因风吹拂[\s\S]*?(?=\n\[注\])/u,
      "陂①水受风绿，稻田含雨青。\n苍烟横落照，归唱起前汀。",
    );
  },
  "7155ebab9c4c6913e6f173cc5243d39b": (q) => {
    q.stem = q.stem.replace(
      /屋角微风轻拂[\s\S]*?(?=\n（1）)/u,
      "屋角风微烟自生，柳条纤软杏花明。\n朦胧数点斜阳里，应是呢喃燕子行。",
    );
  },
  "a7885ad603b351e394617b688b723dcc": (q) => {
    q.stem = q.stem.replace(
      /桂花[\s\S]*?(?=\n（1）)/u,
      "桂花\n[宋] 刘克庄\n结子如粟大，开花似蜡黄。\n落金遮蚁穴，酿蜜满蜂房。\n月下高低影，风前远近香。\n夜深清入骨，幽梦绕胡床。",
    );
  },
  "c098368a212e82f140443ddbabfbd713": (q) => {
    q.stem = q.stem.replace(
      /为了革命而生[\s\S]*?(?=\n【注释】)/u,
      "生为革命死不哭，莽莽神州叹沉陆。\n魂兮归来大地红，小住人间三十六②。",
    );
  },
  "dbb7f1b8780477bda909ed3517698287": (q) => {
    q.stem = q.stem.replace(
      /【甲】[\s\S]*?(?=\n【注】)/u,
      "【甲】\n______望\n[清] 周容\n千百寒鸦度尽时，一轮低月对人斜。\n欲追残梦惊回处，黄菊樽①前剥蟹家。\n\n【乙】\n洛桥______望\n[唐] 孟郊\n天津桥下冰初结，洛阳陌上人行绝。\n榆柳萧疏楼阁闲，月明直见嵩山雪。",
    );
  },
  "5c8e7a01fc0f08fbba80e4583e867973": (q) => {
    q.stem = q.stem.replace(
      /初见嵩山[\s\S]*?(?=\n【注】)/u,
      "初见嵩山\n[宋] 张耒\n年来鞍马困尘埃，赖有青山豁我怀。\n日暮北风吹雨去，数峰清瘦出云来。",
    );
  },
  "0d051cfaf77bc1743ef4d60ac13bd3b1": (q) => {
    q.stem = q.stem.replace(
      /依靠我七尺之躯[\s\S]*?(?=\n\[注\])/u,
      "凭着我七尺身躯八斗才，哪怕他十谒朱门九不开。\n不甫能一朝云路通，则这三卷天书将我来救。\n（孛老②云）孩儿，我记的你当初说金榜无名誓不归。\n（正末云）父亲、母亲，放心。\n（唱）我可便稳拍拍的夺一个状元回③。（下）",
    );
  },
  "391a351cdfb3e9818cfa7ce80f1bd37c": (q) => {
    q.stem = q.stem.replace(
      /书房里人去楼空[\s\S]*?(?=\n【注释】)/u,
      "书帷①人散后，兀坐百无聊。\n炉火明残照，瓶花冻折腰。\n烽烟惊绝塞，升斗②恋微僚。\n愁绝团圞月，他乡独自看。",
    );
  },
  "7667924d3332c4991aa69a2a7a755990": (q) => {
    q.stem = q.stem.replace(
      /太华山三峰如高耸的屏障[\s\S]*?(?=\n【注】)/u,
      "太华三峰列峻屏，晴天翠色落无垠。\n晓云东绕关河紫，秋色西来天地青。\n【玉女盆①寒疑黛蓄，仙人掌②上拂明星。】\n乱林绝壑藏真隐，静居悠然采药馨。",
    );
  },
  "77df0effa9223093c0d7382cd7ff3863": (q) => {
    q.stem = q.stem.replace(
      /山色优美[\s\S]*?(?=\n（1）)/u,
      "山好溪行晚，相呼度石梁。\n风吹衣影乱，沙软印痕长。\n泉响迷归路，山月迎人忙。\n遥看茅屋外，竹影一灯凉。",
    );
  },
  "d55a05d8ff353bced5487c046d904d70": (q) => {
    q.stem = q.stem.replace(
      /十五岁应征入伍[\s\S]*?(?=\n（1）)/u,
      "十五从军征，八十始得归。\n道逢乡里人：“家中有阿谁？”\n“遥看是君家，松柏冢累累。”\n兔从狗窦入，雉从梁上飞。\n中庭生旅谷，井上生旅葵。\n舂谷持作饭，采葵持作羹。\n羹饭一时熟，不知贻阿谁。\n出门东向望，泪落沾我衣。",
    );
  },
  "8d2a7de8e256aedcfae0135c9c1f3660": (q) => {
    q.stem = q.stem.replace(
      /池塘回旋处[\s\S]*?(?=\n【注】)/u,
      "回塘①雨脚如缫丝，野禽不起沉鱼②飞。\n耕蓑③钓笠取未暇，秋田有望从淋漓。",
    );
  },
  "de5b16c9ee5406fc83c7e1320d5b52eb": (q) => {
    q.stem = q.stem.replace(
      /庆全庵桃花[\s\S]*?(?=\n【注释】)/u,
      "庆全庵桃花\n谢枋得①\n寻得桃源好避秦，桃红又是一年春。\n花飞莫遣随流水，怕有渔郎来问津。\n\n桃花\n徐孚远②\n海山春色自天来，朵朵桃花照面开。\n千载避秦真此地，何须重入武陵隈。",
    );
    q.answer = q.answer.replace(/^（1）AC/u, "（1）A");
  },
  "630867cc5925a519d02071a96e4c666b": (q) => {
    q.stem = q.stem
      .replace(
        /寒塘[\s\S]*?(?=\n（1）)/u,
        "寒塘\n【唐】赵嘏\n晓发梳临水，寒塘坐见秋。\n乡心正无限，一雁度南楼。",
      )
      .replace("【闻雁】", "A. 【闻雁】")
      .replace("【与夏十二登岳阳楼】", "B. 【与夏十二登岳阳楼】")
      .replace("【秋夕】", "C. 【秋夕】");
  },
  "db7191205d3938319d184205398c3fce": (q) => {
    q.stem = q.stem.replace(
      /芦苇苍茫[\s\S]*?(?=\n（1）)/u,
      "葭菼苍苍望不迥，落雁平沙几点星。\n明月入烟霜入水，行人今夜宿清淮。",
    );
  },
};

export function ensureFillBlankMarkers(question) {
  if (question.type !== "填空题") return;

  // Normalize any short underscores (2..5) to standard 6-underscore blank
  question.stem = question.stem.replace(/_{2,5}(?!_)/gu, "______");
  // Normalize empty brackets （   ） / (   ) / 【   】 to （______）
  question.stem = question.stem
    .replace(/（\s*）/gu, "（______）")
    .replace(/\(\s*\)/gu, "（______）")
    .replace(/【\s+】/gu, "______");

  if (question.stem.includes("______")) return;

  // If a 填空题 has numbered subquestions （1）... or ①..., append ______ to each subquestion line that lacks a blank
  const lines = question.stem.split("\n");
  let modified = false;
  const nextLines = lines.map((line) => {
    const trimmed = line.trim();
    if (/^(?:（[1-9]\d*）|[①②③④⑤⑥⑦⑧⑨⑩])/u.test(trimmed) && !trimmed.includes("______")) {
      modified = true;
      return `${trimmed}______`;
    }
    return line;
  });

  if (modified) {
    question.stem = nextLines.join("\n");
  } else {
    question.stem = `${question.stem.trim()}______`;
  }
}

export function postProcessCjevalQuestion(question) {
  if (!question || CJEVAL_EXCLUDED_IDS.has(question.id)) {
    return null;
  }

  const q = structuredClone(question);

  // Clean escapes and brackets first
  q.stem = cleanCjevalEscapesAndBrackets(q.stem, q.id, true);
  if (q.options && typeof q.options === "object") {
    for (const key of Object.keys(q.options)) {
      q.options[key] = cleanCjevalEscapesAndBrackets(q.options[key], q.id, false);
    }
  }
  q.answer = cleanCjevalEscapesAndBrackets(q.answer, q.id, false);
  if (Array.isArray(q.solutions)) {
    q.solutions = q.solutions
      .map((s) => cleanMangledSolutionMeta(cleanCjevalEscapesAndBrackets(s, q.id, false)))
      .filter(Boolean);
  }

  // Apply item-specific content, choice, and poetry overrides
  if (CHOICE_ITEM_OVERRIDES[q.id]) {
    CHOICE_ITEM_OVERRIDES[q.id](q);
  }
  if (CONTENT_ITEM_OVERRIDES[q.id]) {
    CONTENT_ITEM_OVERRIDES[q.id](q);
  }
  if (POETRY_ITEM_OVERRIDES[q.id]) {
    POETRY_ITEM_OVERRIDES[q.id](q);
  }

  // Normalize stem subquestion numbering & align answers/solutions
  q.stem = normalizeStemNumbering(q.stem, q.id, q.type);
  alignSubquestionAnswers(q);

  // Re-apply poetry/content answer overrides if they modified answer after alignment
  if (q.id === "de5b16c9ee5406fc83c7e1320d5b52eb") {
    q.answer = q.answer.replace(/^（1）AC/u, "（1）A");
  }

  // Ensure all 填空题 have explicit blank markers (______)
  ensureFillBlankMarkers(q);

  return q;
}






