import { createHash } from "node:crypto";

export const AGIEVAL_COMMIT = "84ab72d94318290aad2e4ec820d535a95a1f7552";
export const AGIEVAL_SOURCE_PATH = "data/v1_1/gaokao-chinese.jsonl";
export const AGIEVAL_SOURCE_SHA256 = "1ddcf8fa15e07a25589796dc1c72a341c2d874af8de41970262d66693f95285f";
export const AGIEVAL_SOURCE_COUNT = 246;
export const AGIEVAL_OUTPUT_COUNT = 227;

export const AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE = `晏子之晋，至中牟，睹弊冠反裘负刍，息于涂侧者，以为君子也。使人问焉，曰：“子何为者也？”对曰：“我越石父者也。”晏子曰：“何为至此？”曰：“吾为人臣，仆于中牟，见使将归。”晏子曰：“何为为仆？”对曰：“不免冻饿之切吾身，是以为仆也。”晏子曰：“为仆几何？”对曰：“三年矣。”晏子曰：“可得赎乎？”对曰：“可。”遂解左骖以赠①之，因载而与之俱归。

至舍，不辞而入，越石父怒而请绝，晏子使人应之曰：“吾未尝得交夫子也，子为仆三年，吾乃今日睹而赎之，吾于子尚未可乎？子何绝我之暴也。”

越石父对之曰：“臣闻之，士者诎乎不知己，而申乎知己，故君子不以功轻人之身，不为彼功诎身之理。吾三年为人臣仆，而莫吾知也。今子赎我，吾以子为知我矣；向者子乘，不我辞也，吾以子为忘；今又不辞而入，是与臣我者同矣。我犹且为臣，请鬻于世。”

晏子出，见之曰：“向者见客之容，而今也见客之意。婴闻之，省行者不引其过，察实者不讥其辞，婴可以辞而无弃乎！婴诚革之。”乃令粪洒②改席，尊醮③而礼之。

越石父曰：“吾闻之，至恭不修途，尊礼不受摈④。夫子之礼，仆不敢当也。”晏子遂以为上客。

君子曰：“俗人之有功则德，德则骄，晏子有功，免人于厄，而反诎下之，其去俗亦远矣。此全功之道也。”（选自《晏子春秋》）

【注】①赠：一作“赎”。②粪洒：扫除清洗。③醮：古代嘉礼中的一种礼节。④摈：通“傧”，傧相。`;

const EXPECTED_KEYS = ["answer", "label", "options", "other", "passage", "question"];

function digest(value) {
  return createHash("sha256").update(value).digest("hex");
}

function applyRequiredReplacements(value, replacements, repairKey) {
  let repaired = String(value ?? "");
  for (const [search, replacement] of replacements ?? []) {
    if (!repaired.includes(search)) {
      throw new Error("AGIEval repair row " + (repairKey + 1) + " no longer contains " + JSON.stringify(search));
    }
    repaired = repaired.replace(search, replacement);
  }
  return repaired;
}

const ANTIBIOTIC_PASSAGE_REPAIRS = [
  ["奈何不了了的耐药菌", "奈何不了的耐药菌"],
  ["耐4~6中抗生素", "耐4~6种抗生素"],
  ["次前3个月", "此前3个月"],
  ["从某种意思上说", "从某种意义上说"],
  ["有利地抑制了普通细菌", "有力地抑制了普通细菌"],
  ["会是牲畜体内的病菌", "会使牲畜体内的病菌"],
];

const GO_PASSAGE_REPAIRS = [
  ["源头想符", "源头相符"],
  ["围棋的产生围棋的产生和发展", "围棋的产生和发展"],
  ["介于赌博", "宜于赌博"],
  ["他们不符合我们民族的思想特征", "它们不符合我们民族的思想特征"],
  ["围棋的价值和地位在与传统礼教观念斗争中确立起来的", "围棋的价值和地位是在与传统礼教观念斗争中确立起来的"],
  ["传动伦理观念", "传统伦理观念"],
  ["认识别这些观念", "认识到这些观念"],
  ["精神宣寄的工具", "精神寄托的工具"],
];

const AGIEVAL_REPAIRS = new Map([
  [
    111,
    {
      sourceSha256: "cb404affd8de5a55688bb888394df4bf405e880a8760ece6bc61ea625e7f56a0",
      note: "校正病句题题干及C项OCR",
      question: "下列各句中，没有语病、句意明确的一句是",
      options: [
        "(A)目前国际金融危机的影响仍在持续，尽管国内外旅游业面临的压力和不确定性都在加大，但中国旅游业繁荣与发展的基本面并未改变。",
        "(B)或许连作者都没想到，由于这一篇哀悼家鹤的纪念文章刻在石上，使得文本的命运与石头的命运牵连在一起，为后人留下了诸多难解之谜。",
        "(C)房地产市场之所以陷入长达一年的萧条，除了市场周期性调整的因素外，还在于部分开发商追求暴利，哄抬房价，也是泡沫加速破裂的重要原因。",
        "(D)海峡两岸关系协会与海峡交流基金会今天下午针对第三次陈江会谈的各项协议文本，举行了最后一次预备性磋商，历时大约一个多小时。",
      ],
    },
  ],
  [
    126,
    {
      sourceSha256: "7cc72780734c7ddab353b0a135d2446821c2a0557b443dec2500c7d3e4ba5b1c",
      note: "依据2012年山东卷校正《围棋与国家》材料OCR",
      passageReplacements: GO_PASSAGE_REPAIRS,
    },
  ],
  [
    127,
    {
      sourceSha256: "6c708f4cdb14b8e2d9503eb393d9f610122652bfba2c63856c8c67f4b53c4d78",
      note: "依据2012年山东卷校正《围棋与国家》材料及选项OCR",
      passageReplacements: GO_PASSAGE_REPAIRS,
      options: [
        "(A)、围棋作为民族文化的瑰宝、高度智慧的结晶，对个人修身养性，对民族社会的群体心理产生深刻影响。",
        "(B)、围棋的价值和地位是在与掷彩博累活动的比较，传统礼教观念的斗争中，在社会实践的对比中确立起来。",
        "(C)、自人们从生命意义上认识围棋的价值，把它作为自觉的艺术追求后，围棋就成为儒士必备的艺技。",
        "(D)、围棋作为“国艺”，是一种与国家民族有深厚渊源、从国家层面上能够反映民族精神需求的艺术和技能形式。",
      ],
    },
  ],
  [
    128,
    {
      sourceSha256: "ca1662bbdb567b41789e5246a3a3cff6f31dbc13a96e1b4ccecf7ee34cf3bc09",
      note: "依据2012年山东卷校正《围棋与国家》材料及选项OCR",
      passageReplacements: GO_PASSAGE_REPAIRS,
      options: [
        "(A)、围棋的地位不是任何人封赐的，也不是带有感情色彩的主观结论，而是随着人们对其功能和价值认识的深入逐步确定的。",
        "(B)、围棋因为符合我们民族的思想特征，能够满足人们精神生活的真正需求，在东汉中期就凭借着其本质上的优势而盛极一时。",
        "(C)、人们自己对“度”的把握不好造成了围棋活动的负面作用，其实这些负面作用也与围棋的娱乐、交际等功能性弱点有直接关系。",
        "(D)、对围棋进行神化和矮化都是不对的，只要把“国艺价值观”作为认识围棋价值的出发点，就能正确认识围棋的“国艺”地位。",
      ],
    },
  ],
  [
    184,
    {
      sourceSha256: "dab74fca5df2db27fdd24fbe6cb27fead777c5916067ae8d8904fc6e613e6783",
      note: "校正《抗生素滥用与DNA污染》材料OCR",
      passageReplacements: ANTIBIOTIC_PASSAGE_REPAIRS,
    },
  ],
  [
    185,
    {
      sourceSha256: "856fdafa7f3fbf1b64224398c99856759ac32faa32b1fd342ced1967a716c3d6",
      note: "校正《抗生素滥用与DNA污染》材料OCR",
      passageReplacements: ANTIBIOTIC_PASSAGE_REPAIRS,
    },
  ],
  [
    186,
    {
      sourceSha256: "b21536c98508a0332f9ff71133fc2ac7318b3ddcd4fc281fcb62dff9f15bd35f",
      note: "校正《抗生素滥用与DNA污染》材料、题干及A项OCR",
      passageReplacements: ANTIBIOTIC_PASSAGE_REPAIRS,
      question: "根据原文提供的信息，以下推断正确的一项是",
      options: [
        "(A)人类需要不断开发各种新型抗生素来战胜各种不同的耐抗生素病菌。",
        "(B)土壤中的耐药基因经过多次转移，传播给人后其耐药性会逐步下降。",
        "(C)检测牲畜排泄物中有无耐药基因即可判定其饲料是否添加了抗生素。",
        "(D)只要科学、合理地使用抗生素，人们就不会感染各种耐抗生素病菌。",
      ],
    },
  ],
  [
    227,
    {
      sourceSha256: "b1de77e9593aed151edccbeb4a31f9a950f97dd2ec958848a23bfb105d746d91",
      note: "依据2008年福建卷原卷校正文言文及词义选项OCR",
      passage: AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE,
      options: [
        "(A)子何绝我之暴也 暴：暴躁",
        "(B)士者诎乎不知己 诎：屈从",
        "(C)请鬻于世 鬻：卖",
        "(D)免人于厄 厄：困境",
      ],
    },
  ],
  [
    228,
    {
      sourceSha256: "8bfce603604de8833c5ced9affa91fca115fbd8e8085ff9da5217d85fa0f62cf",
      note: "依据2008年福建卷原卷校正文言文及虚词选项OCR",
      passage: AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE,
      options: [
        "(A)①因载而与之俱归 ②以其求思之深而无不在也",
        "(B)①吾乃今日睹而赎之 ②山东豪俊遂并起而亡秦族矣",
        "(C)①而申乎知己 ②胡为乎遑遑欲何之",
        "(D)①故君子不以功轻人之身 ②秦亦不以城予赵",
      ],
    },
  ],
  [
    229,
    {
      sourceSha256: "848618ff5599e1be372b9509ce0c9dfb7fe3a794b80d1819ca3a450586720d39",
      note: "依据2008年福建卷原卷校正文言文及内容选项OCR",
      passage: AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE,
      options: [
        "(A)晏子前往晋国，在途中遇到了越石父，替他赎身，可见晏子善于识别人才，爱护人才。",
        "(B)越石父认为晏子对自己失礼，仍把他当奴仆，十分生气，说明他态度偏激，心胸狭窄。",
        "(C)晏子听了越石父的一番话后，深感愧疚，就以宾礼相待，这使越石父颇受感动。",
        "(D)君子认为，晏子能远离世俗的偏见，礼贤下士，不居功自傲，这样就可以保全功德了。",
      ],
    },
  ],
]);

export const AGIEVAL_REPAIR_COUNT = AGIEVAL_REPAIRS.size;

export function repairAgievalRecord(record, sourceIndex) {
  const repair = AGIEVAL_REPAIRS.get(sourceIndex);
  if (!repair) return { record, note: "" };
  const sourceSha256 = digest(JSON.stringify(record));
  if (sourceSha256 !== repair.sourceSha256) {
    throw new Error(`AGIEval repair row ${sourceIndex + 1} no longer matches its pinned source: expected ${repair.sourceSha256}, received ${sourceSha256}`);
  }
  return {
    record: {
      ...record,
      passage: repair.passageReplacements
        ? applyRequiredReplacements(record.passage, repair.passageReplacements, sourceIndex)
        : repair.passage ?? record.passage,
      question: repair.question ?? record.question,
      options: repair.options ?? record.options,
    },
    note: repair.note,
  };
}

export function normalizeAgievalText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/(?<!_)__([^_\n]+)__(?!_)/gu, "$1")
    .replace(/(材料[一二三四五六七八九十\d]+[：:])。/gu, "$1")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function stripAgievalOptionLabel(value) {
  return normalizeAgievalText(value).replace(/^\s*[（(]\s*[A-DＡ-Ｄ]\s*[）)]\s*/u, "").trim();
}

function validateRecord(record, index) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    throw new Error(`AGIEval row ${index + 1} must be an object`);
  }
  const keys = Object.keys(record).sort();
  if (JSON.stringify(keys) !== JSON.stringify(EXPECTED_KEYS)) {
    throw new Error(`AGIEval row ${index + 1} has unexpected keys: ${keys.join(", ")}`);
  }
  if (record.passage !== null && typeof record.passage !== "string") {
    throw new Error(`AGIEval row ${index + 1} passage must be a string or null`);
  }
  if (typeof record.question !== "string" || !record.question.trim()) {
    throw new Error(`AGIEval row ${index + 1} is missing a question`);
  }
  if (!Array.isArray(record.options) || record.options.length !== 4 || record.options.some((option) => typeof option !== "string" || !option.trim())) {
    throw new Error(`AGIEval row ${index + 1} must contain four non-empty options`);
  }
  if (typeof record.label !== "string" || !/^[A-D]$/u.test(record.label)) {
    throw new Error(`AGIEval row ${index + 1} has an invalid answer label`);
  }
  if (record.answer !== null) {
    throw new Error(`AGIEval row ${index + 1} has an unexpected cloze answer`);
  }
  if (!record.other || typeof record.other !== "object" || Array.isArray(record.other) || typeof record.other.source !== "string" || !record.other.source.trim()) {
    throw new Error(`AGIEval row ${index + 1} is missing source-paper provenance`);
  }
}

export function parseAgievalJsonl(source) {
  const lines = String(source).replace(/^\uFEFF/u, "").split(/\r?\n/gu).filter((line) => line.trim());
  if (lines.length !== AGIEVAL_SOURCE_COUNT) {
    throw new Error(`AGIEval source expected ${AGIEVAL_SOURCE_COUNT} rows, received ${lines.length}`);
  }
  return lines.map((line, index) => {
    let record;
    try {
      record = JSON.parse(line);
    } catch (error) {
      throw new Error(`AGIEval row ${index + 1} is invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    validateRecord(record, index);
    return record;
  });
}

function fingerprint(record) {
  const fields = [record.passage ?? "", record.question, ...record.options.map(stripAgievalOptionLabel)];
  const normalized = fields.map((value) => normalizeAgievalText(value).normalize("NFKC").replace(/\s+/gu, ""));
  return digest(normalized.join("\n"));
}

function stableId(sourceIndex) {
  return digest(`agieval:v1.1:gaokao-chinese:${sourceIndex}`).slice(0, 32);
}

function convertGroup(group) {
  const { record, sourceIndex, sources, repairNotes } = group;
  const passage = normalizeAgievalText(record.passage);
  const question = normalizeAgievalText(record.question);
  const options = record.options.map(stripAgievalOptionLabel);
  const optionByLabel = new Map(options.map((option, index) => [String.fromCharCode(65 + index), option]));
  const paper = sources.join("；同题亦见：");
  const duplicateNote = sources.length > 1 ? `；合并 ${sources.length} 个内容完全相同的试卷来源` : "";
  const repairNote = repairNotes.length ? `；EduLoop人工校订：${repairNotes.join("；")}` : "";
  const skillTag = passage
    ? { dimension: "SKILL", slug: "reading-comprehension", label: "阅读理解", confidence: 0.9, source: "IMPORT" }
    : { dimension: "SKILL", slug: "language-application", label: "语言运用", confidence: 0.85, source: "IMPORT" };

  return {
    id: stableId(sourceIndex),
    type: "单选题",
    grade_band: "高中",
    difficulty: "一般",
    grade: "高三",
    course: "语文",
    paper,
    online_test: true,
    option_split: true,
    quality: `AGIEval v1.1 MIT许可导入；固定提交 ${AGIEVAL_COMMIT}；源文件SHA-256 ${AGIEVAL_SOURCE_SHA256}${repairNote}${duplicateNote}`,
    question_info: {
      raw_content: {
        title: passage ? `${passage}\n\n${question}` : question,
        option_a: optionByLabel.get("A") ?? "",
        option_b: optionByLabel.get("B") ?? "",
        option_c: optionByLabel.get("C") ?? "",
        option_d: optionByLabel.get("D") ?? "",
        option_e: "",
        answer1: record.label,
      },
    },
    answer_info: { raw_content: record.label },
    solution_info: [{ solution_info: `AGIEval v1.1 原始数据未提供解析。参考答案为 ${record.label}。` }],
    children: [],
    source_tags: [
      { dimension: "TOPIC", slug: "gaokao-chinese", label: "高考语文", confidence: 1, source: "IMPORT" },
      skillTag,
    ],
  };
}

export function convertAgievalRecords(records) {
  const groups = new Map();
  records.forEach((rawRecord, index) => {
    validateRecord(rawRecord, index);
    const repair = repairAgievalRecord(rawRecord, index);
    const record = repair.record;
    validateRecord(record, index);
    const key = fingerprint(record);
    const existing = groups.get(key);
    if (!existing) {
      groups.set(key, {
        record,
        sourceIndex: index,
        sources: [record.other.source],
        repairNotes: repair.note ? [repair.note] : [],
      });
      return;
    }
    if (existing.record.label !== record.label) {
      throw new Error(`AGIEval duplicate rows ${existing.sourceIndex + 1} and ${index + 1} disagree on the answer`);
    }
    if (!existing.sources.includes(record.other.source)) existing.sources.push(record.other.source);
    if (repair.note && !existing.repairNotes.includes(repair.note)) existing.repairNotes.push(repair.note);
  });

  const questions = [...groups.values()].map(convertGroup);
  if (records.length === AGIEVAL_SOURCE_COUNT && questions.length !== AGIEVAL_OUTPUT_COUNT) {
    throw new Error(`AGIEval conversion expected ${AGIEVAL_OUTPUT_COUNT} unique questions, received ${questions.length}`);
  }
  return questions;
}
