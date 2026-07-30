export const reviewedSelfContainedVisualIds = new Set([
  // Biology records whose source type is misleading or whose diagram is fully encoded in text.
  "70bb8c7edb884e43c8f89efb8711a73c",
  "f239e42b392f902d3712e621f81dc98f",
  "022360377e73a62ddf89c6b331d13c4f",

  // Mathematics records with complete textual stems and/or textual choices.
  "f52c0faf6e4c2b68b06babb7ac8f8e7e",
  "a59b29e2936d99ec3bb15bc48347c21d",
  "10899928c21f79e5aa058ddcc4ec32d6",
  "0aa9289c410d308f4a6e9aeae21816f4",
  "6935de6678147e5183807a60578e0c0d",
  "ca1439bb6f0b6a4dad7b6819e173e8f1",
  "aefe99d6bd6f3b8cdec63ddacf9a1925",
  "57d68b55403fff41ec90ed3997ae1692",
  "ecc9b9eb866705a6a38b755d3c3c3a66",
  "c9be8a4143e4f2b3366086a513d6dc8d",
  "280cbd44b1008df770b880d2a4cdcc1e",
  "582f74151867ea075d1ba3cf79a69264",
  "714cd07e01986a1eedb0c5e29ed26483",
  "1598ad729203360973a0e85ff9eac0af",
  "db2ea4bb565fa96188199d58a5bd54bf",
  "9f1b05983746b0e8f5c7847b7dc2737f",
  "6928fb678dd530f7a86fb08503283975",
  "e4025c1988fd4825b758cb1f516c03bf",
  "03e1a552d7c03fa2ebf247f8d4927919",
  "74cf1e5ffea83db110ae3a1168faadb3",

  // Physics records whose prose or textual choices contain all necessary information.
  "9dc7b9a4c37f2317bc78feaade033c26",
  "ab73d2af5f723893b15d11e9cb9db89b",
  "c6e6abb0795962a1ca699c67d70e886f",

  // CJEval prose that describes a map experiment completely in text.
  "f9d635a96e0d28b8cb19c8205b6c1218",
]);

export const repairedMissingFigureIds = new Set([
  "a5eae64bf9503c4d88947f680c9f693e",
  "8ef70fc5c12b82a2932b987dd151b5f0",
  "fa36ed2a96f34272a49ee7666d357dc5",
  "b7bde20ca0b30a80ac013b03a0166c45",
  "b98ed3fc0c4668aec237c6f23a56fd9b",
  "4fbc1823c2841d62cc022d75a57e3970",
  "3fc1aa35c10d807252936da125cd20c3",
  "df56e384715210fb98dcd73be0567a94",
  "6fb547240738f3873ca0baebb6ef4c74",
]);

type NormalizedQuestionType =
  | "SINGLE_CHOICE"
  | "MULTIPLE_CHOICE"
  | "TRUE_FALSE"
  | "FILL_BLANK"
  | "COMPUTATION"
  | "EXPERIMENT"
  | "WRITTEN_RESPONSE";

type CuratedQuestionUpdate = {
  stem: string;
  options?: readonly string[];
  answer: string;
  explanation: string;
  type?: NormalizedQuestionType;
  difficulty?: "EASY" | "MEDIUM" | "HARD";
  publish: true;
};

export const curatedQuestionUpdates = new Map<string, CuratedQuestionUpdate>([
  [
    "a5eae64bf9503c4d88947f680c9f693e",
    {
      stem: "丙酮酸脱羧酶只催化丙酮酸脱羧反应，并能与双缩脲试剂反应呈紫色。请回答：（1）该酶体现了什么催化特点？（2）其化学本质是什么？",
      answer: "（1）专一性；（2）蛋白质。",
      explanation: "一种酶通常只催化一种或一类特定反应，体现酶的专一性。双缩脲试剂与蛋白质中的肽键发生紫色反应，因此该酶的化学本质是蛋白质。",
      type: "WRITTEN_RESPONSE",
      publish: true,
    },
  ],
  [
    "8ef70fc5c12b82a2932b987dd151b5f0",
    {
      stem: "某二倍体生物的体细胞含有6条染色体。在一个减数第二次分裂后期细胞中，移向同一极的4条染色体中有两条互为同源染色体。造成该现象最合理的原因是（ ）",
      answer: "A",
      explanation: "正常减数第一次分裂时同源染色体分离。若其中一对未分离，同一个次级性母细胞会同时得到这对同源染色体；减数第二次分裂后期便可能观察到同一极有4条染色体，其中两条互为同源染色体。",
      publish: true,
    },
  ],
  [
    "fa36ed2a96f34272a49ee7666d357dc5",
    {
      stem: "关于动物精巢中细胞分裂时期的判断，正确的是（ ）",
      options: [
        "有丝分裂中期发生同源染色体联会",
        "减数第二次分裂中期同源染色体成对排列在赤道板两侧",
        "减数第一次分裂后期同源染色体分离，而姐妹染色单体尚未分离",
        "减数第二次分裂后期发生同源染色体分离",
      ],
      answer: "C",
      explanation: "同源染色体联会发生在减数第一次分裂前期，成对排列发生在减数第一次分裂中期；减数第一次分裂后期同源染色体分离，姐妹染色单体不分离；减数第二次分裂后期分离的是姐妹染色单体。",
      publish: true,
    },
  ],
  [
    "b7bde20ca0b30a80ac013b03a0166c45",
    {
      stem: "一张矩形纸片长70 cm、周长160 cm，则纸片的宽为（ ）",
      answer: "C",
      explanation: "设宽为x cm。由矩形周长公式得2(70+x)=160，解得x=10，因此选C。",
      publish: true,
    },
  ],
  [
    "b98ed3fc0c4668aec237c6f23a56fd9b",
    {
      stem: "在平面直角坐标系中，△ABC的顶点为A(0,0)、B(2,0)、C(0,1)，△DEF的顶点为D(6,0)、E(6,2)、F(5,0)。由△ABC得到△DEF的变换是（ ）",
      options: [
        "向右平移6个单位",
        "向右平移4个单位，再向上平移1个单位",
        "绕点A顺时针旋转90°，再向右平移6个单位",
        "绕点A逆时针旋转90°，再向右平移6个单位",
      ],
      answer: "D",
      explanation: "绕A逆时针旋转90°后，A、B、C依次变为(0,0)、(0,2)、(-1,0)；再向右平移6个单位，依次得到D(6,0)、E(6,2)、F(5,0)，因此选D。",
      publish: true,
    },
  ],
  [
    "4fbc1823c2841d62cc022d75a57e3970",
    {
      stem: "△ABC中，∠C=67°、∠B=30°。将△ABC绕点A顺时针旋转得到△AB′C′，且点C′在线段BC上，则∠B′C′B的度数为（ ）",
      answer: "C",
      explanation: "旋转保持长度和角度不变，所以AC′=AC，∠AC′B′=∠ACB=67°。在等腰三角形ACC′中，∠AC′C=67°；由于B、C′、C共线，∠AC′B=113°，故∠B′C′B=113°-67°=46°，选C。",
      publish: true,
    },
  ],
  [
    "3fc1aa35c10d807252936da125cd20c3",
    {
      stem: "一个闭合线圈水平放置，其正上方有一根竖直条形磁铁，磁铁N极朝下并向线圈靠近，但尚未进入线圈。此时磁铁与线圈之间的作用是（ ）",
      options: [
        "相互吸引，因为感应电流要阻碍磁铁运动",
        "相互排斥，因为感应电流产生的磁场要阻碍向下磁通量的增加",
        "没有相互作用，因为磁铁尚未进入线圈",
        "先相互吸引，磁铁进入线圈后才相互排斥",
      ],
      answer: "B",
      explanation: "N极靠近线圈时，穿过线圈的向下磁通量增加。根据楞次定律，感应电流产生向上的磁场以阻碍这一增加，线圈靠近磁铁的一侧等效为N极，因此二者相互排斥。",
      publish: true,
    },
  ],
  [
    "df56e384715210fb98dcd73be0567a94",
    {
      stem: "一列简谐横波沿x轴负方向传播。t=1 s时，在0≤x≤3 m范围内的波形满足$$y=-A\\sin\\left(\\frac{\\pi}{2}x\\right)$$。某质点此刻位移为0，且正沿y轴负方向运动，该质点可能位于（ ）",
      answer: "A",
      explanation: "沿x轴负方向传播的波可写成y=f(x+vt)，因此质点的振动方向与波形曲线在该点的斜率同号。t=1 s时，x=0处位移为0且斜率为负，质点正向下运动；x=2 m处虽然位移也为0，但斜率为正。故选A。",
      publish: true,
    },
  ],
  [
    "6fb547240738f3873ca0baebb6ef4c74",
    {
      stem: "物体P静止在水平地面上。一根竖直轻弹簧的上端固定、下端与P连接，且弹簧处于压缩状态。设弹簧对P的弹力为F，地面对P的支持力为N，则（ ）",
      answer: "D",
      explanation: "被压缩的弹簧要恢复原长，对位于其下端的物体P施加竖直向下的弹力F；地面对P的支持力N竖直向上，因此选D。",
      publish: true,
    },
  ],
  [
    "9dd7e50c7184f006f1d7fd3a26c3d1a5",
    {
      stem: "叶绿体是植物细胞进行光合作用的细胞器；蓝藻是能进行光合作用的原核生物。请分别选择答案：\n（1）关于蓝藻的叙述，错误的是：A. 含有叶绿体，能进行光合作用；B. 含有核糖体，能合成蛋白质；C. 属于自养生物；D. 光合膜含有光合色素。\n（2）有观点认为叶绿体起源于被原始真核生物吞噬但未被消化的蓝藻。下列证据不支持该观点的是：A. 叶绿体核糖体结构与蓝藻相似；B. 叶绿体内膜成分与蓝藻细胞膜相似；C. 叶绿体中大多数蛋白质由细胞核DNA控制合成；D. 叶绿体与蓝藻的DNA均为环状。请按“（1）…；（2）…”作答。",
      answer: "（1）A；（2）C。",
      explanation: "蓝藻没有叶绿体，但具有光合膜和光合色素，因此（1）选A。叶绿体的大多数蛋白质由细胞核DNA控制合成，不能作为叶绿体源自蓝藻的直接支持证据，因此（2）选C。",
      type: "WRITTEN_RESPONSE",
      publish: true,
    },
  ],
  [
    "c7e8723639bd12885a8c4abc5b2347ba",
    {
      stem: "用半偏法测量量程3 V、内阻约3000 Ω的电压表内阻。电阻箱R₀与电压表串联，开关S₂与R₀并联；滑动变阻器R₁接成分压器，开关S₁控制电源。请回答：（1）在闭合开关前将R₁调到使测量支路分压最小的位置后，应怎样操作并读取测量值？（2）若把测得的内阻记为Rᵥ′，它与真实值Rᵥ相比偏大、相等还是偏小？说明原因。",
      answer: "（1）闭合S₁、S₂，调节R₁使电压表满偏；保持R₁不变，断开S₂，调节R₀使电压表半偏；读取R₀，此读数作为Rᵥ′。（2）Rᵥ′>Rᵥ。断开S₂后测量支路总电阻增大，分得电压增大；半偏时R₀两端电压大于电压表两端电压，因此R₀读数大于真实内阻。",
      explanation: "满偏后保持分压器不变，串入电阻箱并调到半偏，是半偏法的基本步骤。由于分压电路并非理想恒压源，串入R₀后支路电阻增大、端电压随之升高，导致达到半偏所需的R₀大于电压表真实内阻。",
      type: "EXPERIMENT",
      publish: true,
    },
  ],
]);

type CuratedChoiceContent = {
  stem: string;
  options: readonly string[];
};

export const curatedChoiceContent = new Map<string, CuratedChoiceContent>([
  [
    "48ced198bd013dab58c3c98c5294c21c",
    {
      stem: "使用化学手段可以消除某些环境污染。下列主要依靠化学手段消除环境污染的是（ ）",
      options: [
        "在燃煤中添加生石灰",
        "将某些废旧塑料融化后再成型",
        "把放射性核废料深埋于地下岩层",
        "用多孔吸附剂清除水面油污",
      ],
    },
  ],
  [
    "7f3f887a8bcebe4efe4c4ed96a2b61cf",
    {
      stem: "在下列对称图形中，对称轴的条数最少的图形是（ ）",
      options: ["圆", "等边三角形", "正方形", "正六边形"],
    },
  ],
  [
    "ad16f3546d0314262abf9713c402f868",
    {
      stem: "关于单摆的运动有下列说法，正确的是（ ） ①单摆的回复力是摆线的拉力与重力的合力 ②单摆的回复力是重力沿摆球运动轨迹切向的分力 ③单摆的周期与质量和振幅无关，与摆长和当地的重力加速度有关 ④单摆做简谐运动的条件是摆角很小，如小于5° ⑤在山脚下走时准确的摆钟移到高山上走时将变快",
      options: ["①③④", "②③④", "③④⑤", "①④⑤"],
    },
  ],
]);

// This source record contains five related subquestions and five answer keys.
// Until derived child records are supported, retain it as one self-assessed response.
export const selfAssessedCompositeIds = new Set([
  "4c9a653d596f290ce11834eea2942bdb",
]);
