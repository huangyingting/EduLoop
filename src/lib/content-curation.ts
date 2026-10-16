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
      stem: "如图所示，已知丙酮酸脱羧酶催化丙酮酸脱羧，请据图回答：\n（1）图中表示丙酮酸脱羧酶的是________（用图中字母回答），该图表示酶具有________性。\n（2）该酶与双缩脲试剂混合后呈现紫色，说明其化学本质是________。",
      answer: "（1）D；专一；（2）蛋白质",
      explanation: "（1）化学反应前后酶的数量和性质不变，图中D与底物C特定结合促使其分解为E和F，且反应前后D形态不变，故D表示丙酮酸脱羧酶；酶与底物结构互补契合，体现了酶催化的专一性。（2）双缩脲试剂可与蛋白质中的肽键发生紫色反应，因此该酶的化学本质是蛋白质。",
      type: "WRITTEN_RESPONSE",
      publish: true,
    },
  ],
  [
    "8ef70fc5c12b82a2932b987dd151b5f0",
    {
      stem: "某二倍体生物正常体细胞的染色体数目为6条，下图表示处于减数第二次分裂后期的细胞示意图（图中每极的第2条和第4条染色体形态、大小相同），出现该图所示现象最可能的原因是（ ）",
      answer: "A",
      explanation: "该二倍体生物正常体细胞有6条染色体（3对同源染色体），正常减数第二次分裂后期每一极应有3条互不同源的染色体。图中每一极有4条染色体，且第2条和第4条互为同源染色体，说明减数第一次分裂后期有一对同源染色体未分离而进入了同一个次级性母细胞。故选A。",
      publish: true,
    },
  ],
  [
    "fa36ed2a96f34272a49ee7666d357dc5",
    {
      stem: "下面甲图为某动物的一组细胞分裂图像（①～④表示染色体、染色单体、DNA的数量关系），乙图表示该动物精巢中不同分裂时期的细胞模式图（a、b、c、d）。有关叙述正确的是（ ）",
      options: [
        "乙图中a细胞可发生同源染色体联会，对应甲图中的②",
        "乙图中b细胞含有同源染色体，对应甲图中的③",
        "乙图中c细胞处于减数第一次分裂后期，同源染色体分离，对应甲图中的②",
        "乙图中d细胞处于减数第二次分裂后期，发生同源染色体分离，对应甲图中的④",
      ],
      answer: "C",
      explanation: "甲图中②染色体:染色单体:DNA=2n:4n:4n，可表示有丝分裂前/中期或减数第一次分裂过程；③为n:2n:2n，表示减数第二次分裂前/中期；④为2n:0:2n，表示减数第二次分裂后期。乙图中a为有丝分裂中期（无联会），b为减数第二次分裂中期（无同源染色体），c为减数第一次分裂后期（同源染色体分离，对应甲图②），d为减数第二次分裂后期（着丝点分裂，姐妹染色单体分离，无同源染色体）。故选C。",
      publish: true,
    },
  ],
  [
    "b7bde20ca0b30a80ac013b03a0166c45",
    {
      stem: "一张长为$$70\\text{ cm}$$的长方形纸片$$ABCD$$，沿着对称轴$$EF$$折叠成如图那样的图形，若$$AB$$与$$CD$$平行且相距$$60\\text{ cm}$$，则原纸片的宽是（ ）",
      answer: "C",
      explanation: "设原长方形纸片的宽为$$x\\text{ cm}$$。由折叠图的几何关系可知，折叠后左侧剩余长度为$$(70 - 60)\\text{ cm} = 10\\text{ cm}$$，即原纸片的宽$$x = 10\\text{ cm}$$。故选C。",
      publish: true,
    },
  ],
  [
    "b98ed3fc0c4668aec237c6f23a56fd9b",
    {
      stem: "如图所示，在方格纸中，由$$\\triangle ABC$$变换得到$$\\triangle DEF$$的过程是（ ）",
      options: [
        "向右平移6格",
        "向右平移4格，再向上平移1格",
        "绕点A顺时针旋转90°，再向右平移6格",
        "绕点A逆时针旋转90°，再向右平移6格",
      ],
      answer: "D",
      explanation: "观察方格纸中两个直角三角形的位置关系：将$$\\triangle ABC$$绕顶点$$A$$逆时针旋转$$90^\\circ$$得到$$\\triangle AB'C'$$，再向右平移6格即可与$$\\triangle DEF$$完全重合。故选D。",
      publish: true,
    },
  ],
  [
    "4fbc1823c2841d62cc022d75a57e3970",
    {
      stem: "如图，$$\\triangle ABC$$中，$$\\angle C = 67^\\circ$$，$$\\angle B = 30^\\circ$$，将$$\\triangle ABC$$绕点$$A$$顺时针旋转得到$$\\triangle AB'C'$$，点$$C'$$在线段$$BC$$上，则$$\\angle B'C'B$$的大小为（ ）",
      answer: "C",
      explanation: "由旋转的性质可知$$AC' = AC$$，$$\\angle AC'B' = \\angle C = 67^\\circ$$。在$$\\triangle ACC'$$中，因为$$AC' = AC$$，所以$$\\angle AC'C = \\angle C = 67^\\circ$$。又因为点$$C'$$在线段$$BC$$上，所以$$\\angle AC'B = 180^\\circ - 67^\\circ = 113^\\circ$$，因此$$\\angle B'C'B = \\angle AC'B - \\angle AC'B' = 113^\\circ - 67^\\circ = 46^\\circ$$。故选C。",
      publish: true,
    },
  ],
  [
    "3fc1aa35c10d807252936da125cd20c3",
    {
      stem: "如图所示，一根条形磁铁N极朝下竖直向水平放置的闭合线圈运动，在磁铁进入线圈内部之前，关于线圈中感应电流方向（图中箭头方向为俯视逆时针）和磁铁与线圈间相互作用力的说法正确的是（ ）",
      options: [
        "感应电流方向与图中箭头方向相反，磁铁与线圈相互吸引",
        "感应电流方向与图中箭头方向相同，磁铁与线圈相互排斥",
        "感应电流方向与图中箭头方向相反，磁铁与线圈相互排斥",
        "无感应电流，磁铁与线圈无相互作用",
      ],
      answer: "B",
      explanation: "条形磁铁N极朝下靠近闭合线圈时，穿过线圈向下的磁通量增大。根据楞次定律，感应电流的磁场方向向上以阻碍磁通量增加，由安培定则可知感应电流方向为俯视逆时针（与图中箭头方向相同）；同时“来拒去留”，线圈对磁铁产生向上的排斥力。故选B。",
      publish: true,
    },
  ],
  [
    "df56e384715210fb98dcd73be0567a94",
    {
      stem: "图甲是$$t=1\\text{ s}$$时的简谐横波波形图，波沿$$x$$轴负方向传播，图乙是波中某质元的振动位移随时间变化的振动图线（两图用同一时间起点），则图乙可能是图甲中哪个质元的振动图线（ ）",
      answer: "A",
      explanation: "由图乙可知，在$$t=1\\text{ s}$$时刻该质元处于平衡位置（$$y=0$$），且正在向$$y$$轴负方向运动。在图甲的$$t=1\\text{ s}$$波形图上，处于平衡位置的质元位于$$x=0\\text{ m}$$、$$x=2\\text{ m}$$、$$x=4\\text{ m}$$处。因波沿$$x$$轴负方向传播，由波形平移法可知，此时$$x=0\\text{ m}$$和$$x=4\\text{ m}$$处的质元正沿$$y$$轴负方向运动，$$x=2\\text{ m}$$处的质元正沿$$y$$轴正方向运动。故选A。",
      publish: true,
    },
  ],
  [
    "6fb547240738f3873ca0baebb6ef4c74",
    {
      stem: "如图所示，物体$$P$$静止在水平地面上，其上方与一根竖直轻弹簧相连。若弹簧处于压缩状态，弹簧对物体$$P$$的弹力为$$F$$，地面对物体$$P$$的支持力为$$N$$，则$$F$$和$$N$$的方向分别是（ ）",
      answer: "D",
      explanation: "轻弹簧位于物体$$P$$上方且处于压缩状态，弹簧恢复原长时会对下方的物体$$P$$施加竖直向下的推力，故弹力$$F$$竖直向下；水平地面对物体$$P$$的支持力$$N$$垂直于地面向上，即竖直向上。故选D。",
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
      stem: "如图所示为用“半偏法”测量一只量程为$$3\\text{ V}$$、内阻约为$$3000\\,\\Omega$$的电压表内阻的实验电路图（滑动变阻器$$R_1$$采用分压式接法，电阻箱$$R_0$$与待测电压表串联，开关$$S_2$$并联在$$R_0$$两端）。\n（1）闭合开关$$S_1$$前，已将滑动变阻器$$R_1$$的滑片调至使测量支路分压最小的位置。请补充完成后续的主要操作步骤并说明如何读取电压表内阻的测量值$$R_V'$$。\n（2）用该方法测得的电压表内阻测量值$$R_V'$$与真实值$$R_V$$相比，是偏大、相等还是偏小？请简述理由。",
      answer: "（1）闭合S₁、S₂，调节R₁使电压表指针满偏；保持R₁滑片位置不变，断开S₂，调节电阻箱R₀使电压表指针半偏；读取此时电阻箱R₀的阻值，即为电压表内阻的测量值Rᵥ′。（2）偏大（Rᵥ′ > Rᵥ）。断开S₂后，测量支路总电阻增大，分压电路分得的电压随之变大；当电压表半偏（两端电压为满偏电压一半）时，电阻箱R₀两端的实际电压大于满偏电压的一半，因此R₀的阻值大于电压表的真实内阻Rᵥ。",
      explanation: "（1）半偏法测电压表内阻时，先闭合S₁和S₂将R₀短路，调节分压滑变R₁使电压表满偏；再保持R₁滑片不动，断开S₂将R₀串入支路，调节R₀使电压表半偏，此时认为R₀与电压表分压相等，故读取R₀阻值作为测量值Rᵥ′。\n（2）由于滑动变阻器采用分压接法，断开S₂后串联支路的总电阻增大，导致该支路分得的电压高于原来的满偏电压Uₘ。当电压表示数为Uₘ/2时，电阻箱R₀两端分得的电压大于Uₘ/2，由串联分压规律可知Rᵥ′ = R₀ > Rᵥ，即测量值偏大。",
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
