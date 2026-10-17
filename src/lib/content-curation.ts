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
      stem: "图2为丙酮酸脱羧酶催化丙酮酸脱羧反应的示意图。图中表示丙酮酸脱羧酶的是______（用图中字母回答），该酶只催化丙酮酸脱羧过程，体现了酶具有______特点。该酶与双缩脲试剂反应呈现紫色，说明丙酮酸脱羧酶的化学本质是______。",
      answer: "（1）D；专一；（2）蛋白质",
      explanation: "图2为丙酮酸脱羧酶催化底物C分解为产物E和F的过程。D在反应前后形态与结构保持不变，因此D表示丙酮酸脱羧酶；该酶只能催化丙酮酸脱羧这一特定反应，体现了酶的专一性；双缩脲试剂可与蛋白质中的肽键发生紫色反应，说明该酶的化学本质是蛋白质。",
      type: "WRITTEN_RESPONSE",
      publish: true,
    },
  ],
  [
    "8ef70fc5c12b82a2932b987dd151b5f0",
    {
      stem: "观察到的某生物（2n=6）减数第二次分裂后期细胞如图所示。下列解释合理的是（ ）",
      answer: "A",
      explanation: "题干中2n=6，说明该生物为二倍体且体细胞含6条染色体，正常减数第二次分裂后期移向每一极的染色体数应为3条。而图中移向每一极的染色体均为4条，且同一极中的第②条与第④条染色体形态、大小相同，互为同源染色体，说明在减数第一次分裂后期有一对同源染色体未分离而进入了同一个次级性母细胞，故选A。",
      publish: true,
    },
  ],
  [
    "fa36ed2a96f34272a49ee7666d357dc5",
    {
      stem: "如图所示，甲图表示动物精巢内体细胞分裂及其精子形成过程中染色体、染色单体、DNA数量的变化图，乙图表示在上述两种细胞分裂过程的各个时期染色体变化模式图。乙图所示与甲图所示相对应的是（ ）",
      options: ["a－①", "b－④", "c－②", "d－③"],
      answer: "C",
      explanation: "甲图中：①不含染色单体，染色体数与DNA数均为2n，对应有丝分裂末期或减数第二次分裂后期；②中染色体∶染色单体∶DNA＝2n∶4n∶4n，对应有丝分裂前、中期或减数第一次分裂过程；③中染色体∶染色单体∶DNA＝n∶2n∶2n，对应减数第二次分裂前、中期；④中不含染色单体，染色体与DNA数均为n，对应精细胞。乙图中a为有丝分裂中期（对应②），b为减数第二次分裂中期（对应③），c为减数第一次分裂后期（对应②），d为减数第二次分裂后期（对应①）。故选C。",
      publish: true,
    },
  ],
  [
    "b7bde20ca0b30a80ac013b03a0166c45",
    {
      stem: "如图，将一张长为70 cm的矩形纸片ABCD沿对称轴EF折叠后得到如图所示的形状，若折叠后AB与CD的距离为60 cm，则原纸片的宽度为（ ）",
      answer: "C",
      explanation: "设原矩形纸片的宽度AB=x cm。由沿对称轴EF折叠的几何性质可知，BE=DF=35-x（cm）。折叠后AB与CD平行且总距离为2(35-x)+x=60，解得x=10。故选C。",
      publish: true,
    },
  ],
  [
    "b98ed3fc0c4668aec237c6f23a56fd9b",
    {
      stem: "如图，在方格纸中的△ABC经过变换得到△DEF，正确的变换是（ ）",
      options: [
        "把△ABC向右平移6格",
        "把△ABC向右平移4格，再向上平移1格",
        "把△ABC绕点A顺时针旋转90°，再向右平移6格",
        "把△ABC绕点A逆时针旋转90°，再向右平移6格",
      ],
      answer: "D",
      explanation: "观察方格纸中△ABC与△DEF的顶点位置与直角边朝向：将△ABC绕点A逆时针旋转90°后，再向右平移6格，即可与△DEF完全重合。故选D。",
      publish: true,
    },
  ],
  [
    "4fbc1823c2841d62cc022d75a57e3970",
    {
      stem: "如图，△ABC中，∠C=67°，∠B=30°，将△ABC绕点A顺时针旋转后，得到△AB′C′，且C′在边BC上，则∠B′C′B的度数为（ ）",
      answer: "C",
      explanation: "由旋转的性质得AC=AC′，∠AC′B′=∠C=67°。因为点C′在边BC上，所以在等腰△ACC′中，∠AC′C=∠C=67°，从而∠AC′B=180°-67°=113°。因此∠B′C′B=∠AC′B-∠AC′B′=113°-67°=46°。故选C。",
      publish: true,
    },
  ],
  [
    "3fc1aa35c10d807252936da125cd20c3",
    {
      stem: "如图所示，闭合线圈上方有一竖直放置的条形磁铁，磁铁的N极朝下，当磁铁向下运动时（但未插入线圈内部）（ ）",
      options: [
        "线圈中感应电流的方向与图中箭头方向相同，磁铁与线圈相互吸引",
        "线圈中感应电流的方向与图中箭头方向相同，磁铁与线圈相互排斥",
        "线圈中感应电流的方向与图中箭头方向相反，磁铁与线圈相互吸引",
        "线圈中感应电流的方向与图中箭头方向相反，磁铁与线圈相互排斥",
      ],
      answer: "B",
      explanation: "条形磁铁N极朝下向下靠近线圈时，穿过线圈向下的磁通量增大。根据楞次定律，感应电流产生的磁场方向向上以阻碍磁通量增大，由安培定则可知线圈中感应电流方向为俯视逆时针，即与图中箭头方向相同；线圈上端等效为N极，与磁铁下端N极相互排斥。故选B。",
      publish: true,
    },
  ],
  [
    "df56e384715210fb98dcd73be0567a94",
    {
      stem: "一列简谐横波沿x轴负方向传播，图甲是t = 1 s时的波形图，图乙是波中某振动质元位移随时间变化的振动图线，则图乙可能是图甲中哪个质元的振动图线？（ ）",
      answer: "A",
      explanation: "由图乙可知，在t=1 s时刻该质元位于平衡位置（y=0）且向y轴负方向运动。在图甲中，简谐横波沿x轴负方向传播，t=1 s时位于平衡位置的质元有x=0和x=2 m处，由波形平移法可知x=0处的质元正沿y轴负方向运动，x=2 m处的质元正沿y轴正方向运动。故选A。",
      publish: true,
    },
  ],
  [
    "6fb547240738f3873ca0baebb6ef4c74",
    {
      stem: "如图所示，弹簧对物体P的弹力为F，地面对物体的弹力为N，则下列可能的情况是（ ）",
      answer: "D",
      explanation: "由图可知竖直轻弹簧位于物体P上方、水平地面位于物体P下方。地面对物体P的支持力N方向一定竖直向上；当弹簧处于压缩状态时，弹簧对物体P的弹力F方向竖直向下，此时P在重力、向下的弹簧弹力F与向上的地面支持力N作用下保持静止，因此可能的情况是F向下、N向上。故选D。",
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
      stem: "用如图所示的半偏法电路测量量程为3 V、内阻约为3000 Ω的电压表V的内阻。图中电阻箱$$R_{0}$$与电压表V串联，开关$$S_{2}$$与$$R_{0}$$并联；滑动变阻器$$R_{1}$$接成分压电路，开关$$S_{1}$$控制干路。请回答：\n（1）闭合开关前先将滑动变阻器$$R_{1}$$的滑片移到使测量支路分压最小的位置，接下来应如何操作并读取电压表内阻的测量值$$R_{V}'$$？\n（2）测量值$$R_{V}'$$与电压表真实内阻$$R_{V}$$相比是偏大、相等还是偏小？请说明理由。",
      answer: "（1）闭合$$S_{1}$$、$$S_{2}$$，调节$$R_{1}$$使电压表指针满偏；保持$$R_{1}$$滑片位置不变，断开$$S_{2}$$，调节电阻箱$$R_{0}$$使电压表指针半偏；读取此时电阻箱$$R_{0}$$的阻值，即为电压表内阻的测量值$$R_{V}'$$。（2）偏大（$$R_{V}' > R_{V}$$）。断开$$S_{2}$$后，测量支路总电阻增大，分压电路分得的电压随之变大；当电压表半偏（两端电压为满偏电压一半）时，电阻箱$$R_{0}$$两端的实际电压大于满偏电压的一半，因此$$R_{0}$$的阻值大于电压表的真实内阻$$R_{V}$$。",
      explanation: "满偏后保持分压器不变，串入电阻箱并调到半偏，是半偏法的基本步骤。由于分压电路并非理想恒压源，串入$$R_{0}$$后支路电阻增大、端电压随之升高，导致达到半偏所需的$$R_{0}$$大于电压表真实内阻。",
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
        "将某些废旧塑料熔化后再成型",
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
      stem: "关于单摆的运动有下列说法，正确的是（ ） ①单摆的回复力是摆线拉力与重力的合力 ②单摆的回复力是重力沿摆球运动轨迹切向的分力 ③单摆的周期与质量和振幅无关，与摆长和当地的重力加速度有关 ④单摆做简谐运动的条件是摆角很小，如小于5° ⑤在山脚下走时准确的摆钟移到高山上走时将变快",
      options: ["①③④", "②③④", "③④⑤", "①④⑤"],
    },
  ],
]);

// This source record contains five related subquestions and five answer keys.
// Until derived child records are supported, retain it as one self-assessed response.
export const selfAssessedCompositeIds = new Set([
  "4c9a653d596f290ce11834eea2942bdb",
]);
