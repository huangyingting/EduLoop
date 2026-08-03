import { createHash } from "node:crypto";

export const CJEVAL_COMMIT = "590fb8f34239f642324b806b68374c303fe643bf";

export const CJEVAL_SPLITS = Object.freeze([
  { name: "train", count: 1_986, sha256: "8b2c61f2ff260744e211341cb4b116659c5a6e4657c3a51f6a66517d7ba28e44" },
  { name: "valid", count: 191, sha256: "6f842098d8f47e2d778060d98d57f81fffd864a5ce645b9633706e3b3ff77c28" },
  { name: "test", count: 322, sha256: "1574042343d32a54475ff769950d3c75562ee756a10f5ecfa84f00cf1b3f51e8" },
]);

const EMPHASIS_TAGS = ["dotted", "dot", "u", "underline", "underlined"];
const STRONG_TAGS = ["b", "bold", "strong", "mark"];
const TRANSPARENT_TAGS = ["span", "a", "i", "small"];
const FULL_WIDTH_A = "Ａ".codePointAt(0);
const SOURCE_LABEL = /(?:题目内容|问题内容|试题内容|任务内容|题干内容|小题内容|提问内容|文章内容|新题目内容|考题内容|填句内容|题目说明|问题说明|试题说明|任务说明|题目要求|试题要求|任务要求|阅读要求|题目描述|问题描述|任务描述|问题)\s*[:：]\s*/gu;
const NUMBERED_PART = /[（(]\s*[1-9]\d*\s*[）)]/gu;
const SECTION_MARKER = /【(?:材料[一二三四五甲乙丙丁\d]*|资料[一二三四五甲乙丙丁\d]*|文本[一二三四五甲乙丙丁\d]*|选文[一二三四五甲乙丙丁\d]*|注|注释|甲|乙|丙|丁)】|\[(?:注|注释)\]/gu;
const ARABIC_PART_PROMPT = /(?:请|文章|作者|根据|从|下列|结合|简要|分析|概括|指出|说明|为什么|找出|本题|这)/u;

function normalizeOptionLabel(label) {
  const codePoint = label.toUpperCase().codePointAt(0);
  return codePoint >= FULL_WIDTH_A && codePoint <= FULL_WIDTH_A + 4
    ? String.fromCodePoint(codePoint - 0xfee0)
    : label.toUpperCase();
}

function replacePairedTags(value, tags, replacement) {
  let result = value;
  for (const tag of tags) {
    result = result.replace(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, "giu"), replacement);
  }
  return result;
}

export function normalizeCjevalText(value) {
  let result = String(value ?? "").normalize("NFC");
  result = result
    .replace(/[\u200b-\u200d\u2060\ufeff]/gu, "")
    .replace(/<br\s*\/?\s*>/giu, "\n")
    .replace(/\((\/?(?:dotted|dot|u|underline|underlined))\)/giu, "<$1>")
    .replace(/&nbsp;/giu, " ")
    .replace(/&amp;/giu, "&")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
  result = replacePairedTags(result, EMPHASIS_TAGS, "【$1】");
  result = replacePairedTags(result, STRONG_TAGS, "【$1】");
  result = replacePairedTags(result, ["sup"], "（上标：$1）");
  result = replacePairedTags(result, TRANSPARENT_TAGS, "$1");
  result = result.replace(/<\/?(?:dotted|dot|u|underline|underlined|b|bold|strong|mark|sup|span|a|i|small)(?:\s[^>]*)?>/giu, "");
  result = result.replace(/<点>([\s\S]*?)<点>/gu, "【$1】").replace(/<([^<>\n]+)>/gu, "〈$1〉");
  return result.replace(/[ \t]+\n/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

function flattenCjevalContent(value) {
  if (typeof value === "string") return normalizeCjevalText(value);
  if (Array.isArray(value)) return value.map((item) => flattenCjevalContent(item)).filter(Boolean).join("\n");
  if (value && typeof value === "object") {
    const title = flattenCjevalContent(value["题目内容"] ?? value.question ?? "");
    const options = value["选项"] ?? value.options;
    if (title && Array.isArray(options)) return `${title}\n选项：\n${flattenCjevalContent(options)}`;
    return Object.entries(value).map(([key, item]) => `${key}：${flattenCjevalContent(item)}`).join("\n");
  }
  return normalizeCjevalText(value);
}

function canonicalNumberedPart(marker) {
  return `（${marker.replace(/\D/gu, "")}）`;
}

function structuralPrefix(prefix) {
  if (!prefix) return "";
  return `${prefix.replace(/\s/gu, "")}\n\n`;
}

function formatSectionMarkers(value) {
  return value.replace(new RegExp(`[ \\t\\n]*(${SECTION_MARKER.source})[ \\t\\n]*`, "gu"), (_, marker, offset) => (
    `${offset === 0 ? "" : "\n\n"}${marker}\n`
  ));
}

function formatCircledNumbers(value) {
  return value.replace(/(^|[\s。！？；】])([①②③④⑤⑥⑦⑧⑨⑩])(?=\s*\S)/gu, (_, prefix, marker) => {
    if (!prefix) return marker;
    return `${/\s/u.test(prefix) ? "" : prefix}\n${marker}`;
  });
}

function formatChoiceMarkers(value) {
  return value.replace(/(^|[\s\u3000：:。；;，,）)])([A-EＡ-Ｅ])\s*[.．、:：]\s*/giu, (_, prefix, label) => {
    const canonicalLabel = normalizeOptionLabel(label);
    if (!prefix) return `${canonicalLabel}. `;
    return `${/\s/u.test(prefix) ? "" : prefix}\n${canonicalLabel}. `;
  });
}

function poetryBoundary(value) {
  const boundaries = [
    value.search(/\n\n(?=【(?:注|注释)】|\[(?:注|注释)\])/u),
    value.search(/\n\n(?=（1）)/u),
  ].filter((index) => index >= 0);
  return boundaries.length ? Math.min(...boundaries) : value.length;
}

function surroundFirst(value, search) {
  const index = value.indexOf(search);
  if (index < 0) return value;
  const before = value.slice(0, index).trimEnd();
  const after = value.slice(index + search.length).trimStart();
  return `${before ? `${before}\n` : ""}${search}${after ? `\n${after}` : ""}`;
}

function formatPoetry(value, authors) {
  const boundary = poetryBoundary(value);
  let passage = value.slice(0, boundary).trim();
  const remainder = value.slice(boundary);
  let introduction = "";
  if (/^(?:阅读|赏读|请阅读|请细读|古诗词阅读|诗歌赏析)/u.test(passage)) {
    const introductionEnd = passage.search(/[。！？]/u);
    if (introductionEnd >= 0 && introductionEnd < 80) {
      introduction = passage.slice(0, introductionEnd + 1).trim();
      passage = passage.slice(introductionEnd + 1).trim();
    }
  }
  for (const author of authors) passage = surroundFirst(passage, author);
  passage = passage.replace(/([，。！？；])(?=[^\n])/gu, "$1\n");
  const formattedPassage = [introduction, passage].filter(Boolean).join("\n\n");
  return `${formattedPassage}${remainder}`;
}

function formatCjevalLayout(value, { poetry = false, authors = [] } = {}) {
  let result = value
    .replace(new RegExp(`(${NUMBERED_PART.source})\\s*${SOURCE_LABEL.source}`, "gu"), (_, marker) => `\n\n${canonicalNumberedPart(marker)} `)
    .replace(new RegExp(`^${SOURCE_LABEL.source}`, "u"), "")
    .replace(new RegExp(`(^|\\n)${SOURCE_LABEL.source}`, "gu"), (_, prefix) => prefix);

  const numberedParts = [...result.matchAll(new RegExp(`(^|[\\s。！？；])(${NUMBERED_PART.source})\\s*(?=\\S)`, "gu"))];
  if (numberedParts.length > 1) {
    result = result.replace(new RegExp(`(^|[\\s。！？；]+)(${NUMBERED_PART.source})\\s*(?=\\S)`, "gu"), (_, prefix, marker) => (
      `${structuralPrefix(prefix)}${canonicalNumberedPart(marker)} `
    ));
  }

  const arabicPartPattern = new RegExp(`(^|[\\s。！？；])([1-9]\\d*)[.．、]\\s*(?=${ARABIC_PART_PROMPT.source})`, "gu");
  if ([...result.matchAll(arabicPartPattern)].length > 1) {
    result = result.replace(new RegExp(arabicPartPattern.source, "gu"), (_, prefix, number) => (
      `${structuralPrefix(prefix)}${number}. `
    ));
  }

  result = formatSectionMarkers(result)
    .replace(/[ \t\n]*(?:选项(?:是)?)\s*[:：][ \t\n]*/gu, "\n选项：\n")
    .replace(/[ \t\n]*选择\s*[:：][ \t\n]*(?=[A-EＡ-Ｅ]\s*[.．、:：])/gu, "\n选项：\n");
  result = formatChoiceMarkers(result);
  result = formatCircledNumbers(result);
  result = result.replace(/[ \t]+\n/gu, "\n").replace(/\n[ \t]+/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
  if (poetry) result = formatPoetry(result, authors);
  return result.replace(/[ \t]+\n/gu, "\n").replace(/\n[ \t]+/gu, "\n").replace(/\n{3,}/gu, "\n\n").trim();
}

export function formatCjevalContent(value, options) {
  return formatCjevalLayout(flattenCjevalContent(value), options);
}

export function hasCjevalSourceLabel(value) {
  const structuralLabel = new RegExp(`(?:(?:^|\\n)[ \\t]*|${NUMBERED_PART.source}\\s*)${SOURCE_LABEL.source}`, "u");
  return structuralLabel.test(String(value));
}

export function splitChoiceContent(value) {
  const content = formatCjevalContent(value);
  const markerPattern = /(?:^|[\s\u3000：:。；;，,）)])([A-EＡ-Ｅ])\s*[.．、:：]/giu;
  const markers = [...content.matchAll(markerPattern)].map((match) => {
    const matchStart = match.index ?? 0;
    const labelOffset = match[0].lastIndexOf(match[1]);
    return {
      label: normalizeOptionLabel(match[1]),
      start: matchStart + labelOffset,
      end: matchStart + match[0].length,
    };
  });
  if (markers.length < 2 || markers.length > 5) return null;
  const labels = markers.map((marker) => marker.label);
  if (new Set(labels).size !== labels.length) return null;
  if ([...labels].sort().some((label, index) => label !== String.fromCharCode(65 + index))) return null;
  const options = markers.map((marker, index) => ({
    label: marker.label,
    content: content.slice(marker.end, markers[index + 1]?.start ?? content.length).trim(),
  })).sort((left, right) => left.label.localeCompare(right.label));
  if (options.some((option) => !option.content)) return null;
  const stem = content.slice(0, markers[0].start).replace(/(?:选项|选项是)\s*[：:]?\s*$/u, "").trim();
  return stem ? { stem, options } : null;
}

function formatAnswerPart(value, depth) {
  if (typeof value === "string") return normalizeCjevalText(value);
  if (Array.isArray(value)) {
    return value.map((item, index) => {
      const prefix = depth === 0 ? `（${index + 1}）` : `${index + 1}. `;
      return `${prefix}${formatAnswerPart(item, depth + 1)}`;
    }).join("\n");
  }
  if (value && typeof value === "object") {
    const entries = Object.entries(value);
    const zeroBasedKeys = entries.every(([key], index) => key === String(index));
    return entries.map(([key, item], index) => {
      const numberedKey = key.match(/^[（(](\d+)[）)]$/u)?.[1];
      const prefix = zeroBasedKeys ? `（${index + 1}）` : numberedKey ? `（${numberedKey}）` : `${key}. `;
      return `${prefix}${formatAnswerPart(item, depth + 1)}`;
    }).join("\n");
  }
  return String(value ?? "");
}

export function formatCjevalAnswer(value) {
  if (!Array.isArray(value)) return formatAnswerPart(value, 0);
  if (value.length === 1 && typeof value[0] === "string") return normalizeCjevalText(value[0]);
  return formatAnswerPart(value, 0);
}

function stableId(split, index) {
  return createHash("sha256").update(`cjeval:${CJEVAL_COMMIT}:初中语文:${split}:${index}`).digest("hex").slice(0, 32);
}

function knowledgeTag(label) {
  const normalized = normalizeCjevalText(label);
  return {
    dimension: "TOPIC",
    slug: `cjeval-${createHash("sha256").update(normalized).digest("hex").slice(0, 12)}`,
    label: normalized,
    confidence: 1,
    source: "IMPORT",
  };
}

function mapDifficulty(value) {
  if (value === "容易" || value === "较易") return "容易";
  if (value === "较难" || value === "困难") return "困难";
  return "一般";
}

function replaceRequired(value, search, replacement, repairKey) {
  if (!value.includes(search)) throw new Error(`CJEval repair ${repairKey} no longer matches its pinned source`);
  return value.replace(search, replacement);
}

const CJEVAL_REPAIRS = new Map([
  [
    "train:0",
    {
      note: "校正读音题选项及解析，使答案C唯一成立",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "粗<dotted>拙</dotted>（zhuō）", "粗<dotted>拙</dotted>（zhuó）", "train:0"),
          ques_analyze: "本题考查汉字读音。A项中“侮辱”的“侮”应读wǔ；B项中“忧心忡忡”的“忡”应读chōng；C项读音全部正确；D项中“粗拙”的“拙”应读zhuō。因此选C。",
        };
      },
    },
  ],
  [
    "train:25",
    {
      note: "依据来源解析补全缺失选项并校正重复表述",
      apply(record) {
        return {
          ...record,
          ques_content: `${record.ques_content} 选项：A. 污篾、告戒 B. 枷琐、慢不经心 C. 浮燥、厉厉在目 D. 恬静、辐射、纷至沓来、轻歌曼舞`,
          ques_analyze: replaceRequired(record.ques_analyze, "此题目的目的是", "此题的目的是", "train:25"),
        };
      },
    },
  ],
  [
    "train:179",
    {
      note: "校正病句和失配选项，并将数字选项规范为字母选项",
      apply(record) {
        let content = replaceRequired(record.ques_content, "父母无私的爱的<dotted>养</dotted>", "父母无私的<dotted>养</dotted>", "train:179");
        content = replaceRequired(content, "选项: 1.", "选项: A.", "train:179");
        content = replaceRequired(content, " 2. 文中", " B. 文中", "train:179");
        content = replaceRequired(content, " 3. “漫步”", " C. “漫步”", "train:179");
        content = replaceRequired(
          content,
          " 4. 文中的“馈赠”一词与“赠送”意义相近，且“馈”的发音与“愧”相同。",
          " D. 文中的“赠予”一词与“赠送”意义相近，且“予”在这里读yǔ。",
          "train:179",
        );
        return {
          ...record,
          ques_content: content,
          ques_answer: ["A"],
          ques_analyze: "A项表述有误：“养育”和“成长”在文中用作名词，“漫步”用作动词，并非同一词性。B项中“幸福”带有褒义色彩；C项中“漫”共十四画，第五笔是横折；D项中“赠予”与“赠送”意义相近，“予”读yǔ。故选A。",
        };
      },
    },
  ],
  [
    "train:304",
    {
      note: "校正重复且与答案冲突的B项",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "B. ①会 ②孺 ③搏", "B. ①汇 ②孺 ③搏", "train:304"),
        };
      },
    },
  ],
  [
    "train:378",
    {
      note: "校正解析中的重复词",
      apply(record) {
        return {
          ...record,
          ques_analyze: replaceRequired(
            record.ques_analyze,
            "四个词的加点字音标标注都正确",
            "四个词的加点字读音标注都正确",
            "train:378",
          ),
        };
      },
    },
  ],
  [
    "train:379",
    {
      note: "恢复三个错别字干扰项，并将数字选项规范为字母选项",
      apply(record) {
        return {
          ...record,
          ques_content: "请从以下句子中选择一个没有错别字的选项：（ ）选项：A. 对犯了错误的同事，应该给予热心帮助，而不是幸灾乐祸。 B. 老师的严肃批评，让他不知所错。 C. 翻阅了许多资料后，我才理解了“格物致志”的真实意义。 D. 人生不可能一翻风顺，有时遇到挫折反而能促进我们的成长。",
          ques_answer: ["A"],
          ques_analyze: "A项没有错别字。B项“不知所错”应为“不知所措”；C项“格物致志”应为“格物致知”；D项“一翻风顺”应为“一帆风顺”。故选A。",
        };
      },
    },
  ],
  [
    "train:408",
    {
      note: "确认为含两小问的复合题，保留参考答案自评",
      apply(record) {
        return { ...record, ques_type: "复合题" };
      },
    },
  ],
  [
    "train:642",
    {
      note: "修复阅读题引用中的损坏标记并同步答案解析",
      apply(record) {
        const question = "(3) 题目内容：从修辞角度品析下列句子。就在一个拐角处，一树柿子顶着雪跃入我的眼帘。这是一棵老柿树，它悠然矗立在废弃土房旁。";
        const content = replaceRequired(
          record.ques_content,
          "(3) 题目内容：从修辞角度品析加点词的妙用。就在一个拐角处，一树柿子<点>头<点>雪跃入我的眼帘。这是一棵老柿树，它<悠然>矗立在废弃土房旁。",
          question,
          "train:642",
        );
        const answer = [...record.ques_answer];
        answer[2] = "“顶着”“跃入”“悠然”赋予柿子树人的动作和情态，生动写出柿子树覆雪而立、突然映入眼帘的姿态，表达作者的惊喜与喜爱。";
        const analyze = [...record.ques_analyze];
        analyze[2] = "(3) 句子运用拟人手法。“顶着”“跃入”“悠然”赋予柿子树人的动作和情态，生动表现老柿树覆雪而立、安静从容又突然映入眼帘的姿态，传达作者的惊喜与喜爱。";
        return { ...record, ques_content: content, ques_answer: answer, ques_analyze: analyze };
      },
    },
  ],
  [
    "train:695",
    {
      note: "校正《在那颗星子下》正文中的重复字",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "英语言期中考试", "英语期中考试", "train:695"),
        };
      },
    },
  ],
  [
    "train:873",
    {
      note: "校正阅读题设问中的近形字",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "最珍惜的自然资源", "最珍贵的自然资源", "train:873"),
        };
      },
    },
  ],
  [
    "train:1074",
    {
      note: "校正家书引文中的重复字",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "把敌人消灭尽尽为止", "把敌人消灭干净为止", "train:1074"),
        };
      },
    },
  ],
  [
    "train:698",
    {
      note: "校正阅读材料中的重复词",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "歌舞表演表演距离这么远", "歌舞表演距离这么远", "train:698"),
        };
      },
    },
  ],
  [
    "train:905",
    {
      note: "校正阅读材料中的重复否定词",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "有没有没撕净的广告", "有没有撕净的广告", "train:905"),
        };
      },
    },
  ],
  [
    "train:1008",
    {
      note: "校正灰塑材料中的标题叠写、残留英文和说明方法名称",
      apply(record) {
        let content = replaceRequired(record.ques_content, "广府灰塑广府灰塑是", "广府灰塑\n广府灰塑是", "train:1008");
        content = replaceRequired(content, "倒塌risks", "倒塌风险", "train:1008");
        return {
          ...record,
          ques_content: content,
          ques_analyze: replaceRequired(record.ques_analyze, "第一，自定义", "第一，下定义", "train:1008"),
        };
      },
    },
  ],
  [
    "train:1099",
    {
      note: "分隔《蒹葭》篇名与首句并补全三小问答案",
      apply(record) {
        let content = replaceRequired(record.ques_content, "蒹葭蒹葭苍苍", "蒹葭\n蒹葭苍苍", "train:1099");
        content = replaceRequired(content, "请解释划线句子的含义", "请解释“蒹葭苍苍，白露为霜”的含义", "train:1099");
        content = replaceRequired(
          content,
          "D. 诗中表达了主人公对心上人坚持不懈的追求以及近在咫尺却无法触及的失落感。",
          "D. 诗中表现主人公因追求不得而彻底绝望，并放弃了对伊人的追寻。",
          "train:1099",
        );
        return {
          ...record,
          ques_content: content,
          ques_answer: [
            "“蒹葭苍苍”写芦苇茂盛，“白露为霜”写清晨露水凝结成霜。",
            "诗句勾勒出深秋清晨芦苇茂盛、露水成霜的萧瑟凄清画面。",
            "D",
          ],
          ques_analyze: [
            "“苍苍”写芦苇茂盛，“白露为霜”点明深秋清晨的时令和环境。",
            "每章以蒹葭和白露起兴，描绘芦苇茂盛、露水由凝结到渐干的清冷秋景，烘托主人公追寻伊人而不得的惆怅。",
            "主人公虽反复追寻而未能到达，却没有放弃追寻，更没有彻底绝望，因此D项不正确。",
          ],
        };
      },
    },
  ],
  [
    "train:1103",
    {
      note: "校正二维码数量的中文数位表示和失配选项",
      apply(record) {
        let content = replaceRequired(record.ques_content, "即905亿亿亿亿亿亿亿亿。", "即905亿亿亿亿亿亿亿亿亿。", "train:1103");
        content = replaceRequired(
          content,
          "C. “回”字定位作用指的是二维码在不同方向都能正确扫描反馈。",
          "C. “回”字形定位方块的作用是增加二维码的信息存储量。",
          "train:1103",
        );
        return {
          ...record,
          ques_content: content,
          ques_analyze: "第（1）题中，C项把定位方块的作用误说成增加存储量；原文说明它用于定位，使二维码从不同角度扫描都能正确反馈。D项把QR码的特点扩大为所有二维码，也不正确，故选C、D。第⑧⑨段先用两个颜色的球放入盒子的例子说明每增加一个可变格，组合数就翻倍，再列出最小QR码有249个可变格、共有2的249次方种组合，并补充其他规格和付款码的数据，通过举例子、列数字和作推算说明二维码数量极其庞大。科技节展板介绍二维码功用时，链接材料一主要讲二维码被滥用的安全风险，不直接介绍其功用，因此不适合选用。",
        };
      },
    },
  ],
  [
    "train:1553",
    {
      note: "分隔《十五从军征》篇名与首句",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "十五从军征十五岁从军", "十五从军征\n十五岁从军", "train:1553"),
        };
      },
    },
  ],
  [
    "train:1612",
    {
      note: "分隔《关雎》篇名与首句",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "关雎关关雎鸠", "关雎\n关关雎鸠", "train:1612"),
        };
      },
    },
  ],
  [
    "train:1613",
    {
      note: "分隔《敷浅原见桃花》篇名与首句",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "敷浅原<sup >①</sup>见桃花桃花雨后", "敷浅原<sup >①</sup>见桃花\n桃花雨后", "train:1613"),
        };
      },
    },
  ],
  [
    "train:1823",
    {
      note: "分隔《静女》篇名与首句",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "静女静女其姝", "静女\n静女其姝", "train:1823"),
        };
      },
    },
  ],
  [
    "train:1953",
    {
      note: "分隔《渔家傲》词牌题目与首句",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(
            record.ques_content,
            "渔家傲·天接云涛连晓雾天接云涛连晓雾",
            "渔家傲·天接云涛连晓雾\n天接云涛连晓雾",
            "train:1953",
          ),
        };
      },
    },
  ],
  [
    "valid:57",
    {
      note: "分隔《关雎》篇名与首句",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "关雎关关雎鸠", "关雎\n关关雎鸠", "valid:57"),
        };
      },
    },
  ],
  [
    "valid:78",
    {
      note: "分隔《蒹葭》篇名与首句并校正失配选项",
      apply(record) {
        let content = replaceRequired(record.ques_content, "蒹葭蒹葭苍苍", "蒹葭\n蒹葭苍苍", "valid:78");
        content = replaceRequired(content, "蒹葭茂密浓密的景象", "蒹葭茂密的景象", "valid:78");
        content = replaceRequired(
          content,
          "D. 诗中表现了主人公对意中人执着追求的精神和可望不可及的失落情绪。",
          "D. 诗中表现主人公因伊人可望不可即而彻底绝望，并放弃了追求。",
          "valid:78",
        );
        return {
          ...record,
          ques_content: content,
          ques_analyze: "（1）B项错误：“白露为霜”写的是深秋清晨，而不是黄昏。\n（2）主人公虽反复追寻伊人而不得，却始终没有放弃，更没有彻底绝望，因此D项不正确。\n（3）《蒹葭》采用重章叠句和含蓄的景物描写，感情委婉深沉，并非直白表达，因此C项不正确。",
        };
      },
    },
  ],
  [
    "valid:81",
    {
      note: "分隔《十五从军征》篇名与首句并恢复开放题答案",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "十五从军征十五从军征", "十五从军征\n十五从军征", "valid:81"),
          ques_answer: [
            "B",
            "揭露不合理的兵役制度和长期战争给百姓造成的深重苦难，表达对和平生活的渴望。",
          ],
          ques_analyze: [
            "B项的空间顺序判断错误：四句先写野兔钻进狗洞、野鸡飞上屋梁，再写庭院和井边长满野生谷葵，并非由远及近；其余分析符合诗意。",
            "全诗通过一位从军六十五年的老兵返乡后亲人尽亡、家园荒芜、独自做饭却无人共食的遭遇，控诉长期战争和繁重兵役给普通百姓造成的灾难，寄托对和平生活的渴望。",
          ],
        };
      },
    },
  ],
  [
    "valid:86",
    {
      note: "分隔《关雎》《蒹葭》篇名与首句",
      apply(record) {
        let content = replaceRequired(record.ques_content, "关雎关关雎鸠", "关雎\n关关雎鸠", "valid:86");
        content = replaceRequired(content, "蒹葭蒹葭苍苍", "蒹葭\n蒹葭苍苍", "valid:86");
        return { ...record, ques_content: content };
      },
    },
  ],
  [
    "test:120",
    {
      note: "分隔《十五从军征》篇名与首句",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "（一）十五从军征十五岁时参军", "（一）十五从军征\n十五岁时参军", "test:120"),
        };
      },
    },
  ],
  [
    "test:160",
    {
      note: "恢复诗歌比较题四小问的实质答案并校正重复词",
      apply(record) {
        return {
          ...record,
          ques_answer: [
            "“土地”象征遭受侵略、苦难深重的祖国；“河流”象征人民长期郁结的悲愤；“风”象征人民对侵略者的愤怒和抗争；“黎明”象征解放和充满希望的未来。",
            "“沙哑”表明鸟即使声嘶力竭也要歌唱，表现诗人在民族苦难中仍愿为祖国奉献一切的深沉、悲切而执着的爱。",
            "相同点：都表达对祖国土地的热爱。不同点：《我爱这土地》感情悲愤深沉，突出苦难中的抗争和献身；《中国的土地》感情明朗热烈，赞美祖国的美丽、人民的品格和复兴希望。",
            "B",
          ],
          ques_analyze: [
            "土地、河流、风和黎明分别承载祖国苦难、人民悲愤、抗争力量和光明未来等抽象含义，构成象征意象群。",
            "“沙哑”不是削弱赞歌，而是表现长期苦难和竭尽全力的歌唱，使爱国情感更深沉、更有献身意味。",
            "两诗都爱祖国，但甲诗立足民族危亡，情调悲愤凝重；乙诗铺陈山川物产和人民品格，情调明朗、自豪并充满希望。",
            "B项错误：甲诗首节写鸟歌唱、抗争直至死亡，包含连续动作，并非侧重静态描写。",
          ],
        };
      },
    },
  ],
  [
    "train:1561",
    {
      note: "恢复《浣溪沙》的词牌、作者、正文、注释、小题和选项分段",
      apply(record) {
        replaceRequired(record.ques_content, "浣溪沙<sup >①</sup> 苏轼", "浣溪沙<sup >①</sup> 苏轼", "train:1561");
        return {
          ...record,
          ques_content: [
            "阅读下面的古诗词，完成下面小题。",
            "",
            "浣溪沙①",
            "苏轼",
            "簌簌衣巾落枣花，村南村北响缫车②，牛衣③古柳卖黄瓜。",
            "酒困路长惟欲睡，日高人渴漫思茶④，敲门试问野人家。",
            "",
            "【注释】",
            "① 公元1078年，徐州春旱，太守苏轼曾率众求雨。得雨后，他又与百姓同赴石潭谢雨。此为词人在赴徐门石潭谢雨路上所作。",
            "② 缫车：缫丝所用的器具。",
            "③ 牛衣：蓑衣，这里泛指用粗麻织成的衣服。",
            "④ 漫思茶：想随便去哪儿找点茶喝。漫，随意。",
            "",
            "（1）下列对诗歌的理解不正确的一项是（ ）",
            "选项：",
            "A. 全词从农村习见的典型事物入手，意趣盎然地表现了淳厚的乡村风味。",
            "B. 上片写枣花、缫丝、黄瓜这些富有时令特色的事物，点染出了一幅初夏时节农村风俗画。",
            "C. 这首词上片写景，重在路途之声；下片记事，重在行人之态。",
            "D. “村南村北响缫车”通过写嘈杂的“缫车”声，含蓄地表达了词人的烦躁郁闷之情。",
            "",
            "（2）这首词清新朴实，明白如话。“敲门试问野人家”中的“试问”二字让词人形象栩栩传神。请结合本句内容，分析词人形象。",
          ].join("\n"),
          ques_answer: [
            "D",
            "“试问”写词人敲门后试探着询问能否讨茶解渴，表现出他谨慎有礼、平易近人、亲近百姓的形象。",
          ],
          ques_analyze: "（1）“村南村北响缫车”写雨后农村缫丝繁忙的景象，表现词人对乡村生活和民生的关注，并非表达烦躁郁闷，因此D项不正确。\n（2）词人虽旅途困倦、口渴，却只在敲门后试探着询问，不贸然打扰农家。“试问”体现了他的谦和有礼、平易近人和亲民。",
        };
      },
    },
  ],
  [
    "train:1618",
    {
      note: "校正《伟大的悲剧》词语题中的重复词",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(
            record.ques_content,
            "<dotted>虚</dotted><dotted>幻</dotted><dotted>幻</dotted><dotted>境</dotted>",
            "<dotted>虚</dotted><dotted>幻</dotted><dotted>梦</dotted><dotted>境</dotted>",
            "train:1618",
          ),
          ques_analyze: replaceRequired(record.ques_analyze, "虚幻幻境", "虚幻梦境", "train:1618"),
        };
      },
    },
  ],
  [
    "test:244",
    {
      note: "校正阅读材料中的同义词叠写",
      apply(record) {
        return {
          ...record,
          ques_content: replaceRequired(record.ques_content, "只能给出大概概要", "只能给出大概", "test:244"),
        };
      },
    },
  ],
]);

export const CJEVAL_REPAIR_COUNT = CJEVAL_REPAIRS.size;

export function repairCjevalRecord(record, split, index) {
  const repair = CJEVAL_REPAIRS.get(`${split}:${index}`);
  return repair ? { record: repair.apply(record), note: repair.note } : { record, note: "" };
}

export function convertCjevalRecord(record, split, index) {
  const repair = repairCjevalRecord(record, split, index);
  const source = repair.record;
  const answer = formatCjevalAnswer(source.ques_answer);
  const explanation = formatCjevalAnswer(source.ques_analyze);
  const authors = source.ques_knowledges.map((item) => normalizeCjevalText(item).match(/^(.+?)[（(]\d{3,4}-\d{3,4}[）)]$/u)?.[1]).filter(Boolean);
  const formattedContent = formatCjevalContent(source.ques_content, {
    poetry: source.ques_type === "诗歌鉴赏",
    authors,
  });
  const choiceAnswers = source.ques_type === "选择题"
    && Array.isArray(source.ques_answer)
    && source.ques_answer.length > 0
    && source.ques_answer.every((item) => typeof item === "string" && /^[A-E]$/u.test(item))
    ? [...new Set(source.ques_answer)]
    : [];
  const parsedChoice = choiceAnswers.length ? splitChoiceContent(formattedContent) : null;
  const isGradableChoice = choiceAnswers.length > 0 && Boolean(parsedChoice);
  const issues = [];
  if (source.ques_type === "选择题" && !choiceAnswers.length) issues.push("复合选择题需要人工确认作答结构");
  if (choiceAnswers.length && !parsedChoice) issues.push("选择题选项无法安全拆分");
  if (parsedChoice && choiceAnswers.some((answerLabel) => !parsedChoice.options.some((option) => option.label === answerLabel))) {
    issues.push("答案引用了不存在的选项");
  }
  if (JSON.stringify(source.ques_content).includes("<点>")) issues.push("来源含无法可靠解释的加点标记");
  const normalizedOptions = parsedChoice?.options.map((option) => option.content.replace(/\s+/gu, "")) ?? [];
  if (new Set(normalizedOptions).size !== normalizedOptions.length) issues.push("选择题包含重复选项");

  const optionByLabel = new Map(parsedChoice?.options.map((option) => [option.label, option.content]) ?? []);
  const answerKey = isGradableChoice ? choiceAnswers.join("|") : "";
  const quality = issues.length
    ? `CJEval许可导入；${repair.note ? `EduLoop人工校订：${repair.note}；` : ""}NEEDS_REVIEW：${issues.join("；")}`
    : `CJEval许可导入${repair.note ? `；EduLoop人工校订：${repair.note}` : ""}`;

  return {
    id: stableId(split, index),
    type: isGradableChoice ? choiceAnswers.length > 1 ? "多选题" : "单选题" : source.ques_type === "选择题" ? "复合题" : source.ques_type,
    grade_band: "初中",
    difficulty: mapDifficulty(source.ques_difficulty),
    grade: "初中综合",
    course: "语文",
    paper: `CJEval ${split} #${index + 1}；原始难度：${source.ques_difficulty}`,
    online_test: true,
    option_split: Boolean(parsedChoice),
    quality,
    question_info: {
      raw_content: {
        title: parsedChoice?.stem ?? formattedContent,
        option_a: optionByLabel.get("A") ?? "",
        option_b: optionByLabel.get("B") ?? "",
        option_c: optionByLabel.get("C") ?? "",
        option_d: optionByLabel.get("D") ?? "",
        option_e: optionByLabel.get("E") ?? "",
        answer1: answerKey,
      },
    },
    answer_info: { raw_content: answer },
    solution_info: [{ solution_info: explanation }],
    children: [],
    source_tags: [...new Set(source.ques_knowledges.map((item) => normalizeCjevalText(item)).filter(Boolean))].map(knowledgeTag),
  };
}
