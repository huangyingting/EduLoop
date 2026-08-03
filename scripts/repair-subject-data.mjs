import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SUBJECT_FILES = ["biology.json", "chemistry.json", "mathematics.json", "physics.json"];

function applyRequiredReplacements(value, replacements, repairKey, field) {
  let repaired = String(value ?? "");
  for (const [search, replacement, expectedCount = 1] of replacements ?? []) {
    const matches = repaired.split(search).length - 1;
    const repairedMatches = repaired.split(replacement).length - 1;
    // Earlier versions passed LaTeX-bearing replacements directly to
    // String.replaceAll, where `$$` is interpreted as a replacement token for
    // one literal dollar sign. Recover those already-written intermediate
    // values before applying the corrected literal replacement behavior.
    const collapsedReplacement = replacement.replaceAll("$$", "$");
    const collapsedMatches = collapsedReplacement === replacement
      ? 0
      : repaired.split(collapsedReplacement).length - 1;
    if (matches === 0 && collapsedMatches === expectedCount) {
      repaired = repaired.replaceAll(collapsedReplacement, () => replacement);
      continue;
    }
    if (matches === 0 && repairedMatches >= expectedCount) {
      continue;
    }
    // A replacement can intentionally extend the matched source fragment.
    // Once applied, the shorter fragment remains inside the corrected value;
    // recognize that exact state instead of extending it again on every run.
    if (replacement.includes(search) && repairedMatches >= expectedCount && matches === repairedMatches) {
      continue;
    }
    if (matches !== expectedCount) {
      throw new Error(`Repair ${repairKey} expected ${expectedCount} ${field} match(es) for ${JSON.stringify(search)}, received ${matches}`);
    }
    repaired = repaired.replaceAll(search, () => replacement);
  }
  return repaired;
}

const repairs = new Map(Object.entries({
  "732ad197bad41d4003e9413ef15e6708": {
    type: "单选题",
    title: "（2023高一下·芜湖期末）某种动物的直毛（B）对卷毛（b）为显性，黑色（D）对白色（d）为显性，控制两对性状的基因独立遗传。基因型为BbDd的个体与个体X交配，子代的表型及其比例为直毛黑色∶直毛白色∶卷毛黑色∶卷毛白色=1∶1∶1∶1。那么，个体X的基因型为（ ）",
    options: ["BbDD", "Bbdd", "BbDd", "bbdd", ""],
    answer1: "D",
    answer: "D",
    solution: "两对基因独立遗传。子代在两对性状上都呈1∶1分离，说明两对杂交分别都是测交，即Bb×bb、Dd×dd。因此个体X的基因型为bbdd，选D。",
  },
  "c9bb147b75b163f31452c5e42a247bac": { options: ["①②③④⑤⑥⑧", "①②③⑤⑦⑧⑨", "①②③⑤⑥⑦⑨", "①②③⑤⑦⑨", ""] },
  "8c50a094793fd0ea99cd598f6f9c4153": { options: ["②④⑥", "①③⑥", "②③⑤", "①④⑤", ""] },
  "c99517b65dab49b1d181c78c03a7422e": { options: ["构成核糖体的rRNA具有催化肽键形成的功能", "细胞核内的DNA必须有RNA作为引物才能完成复制", "mRNA是在RNA聚合酶的催化下以DNA的一条链为模板转录形成的", "四膜虫rRNA的前体物能在没有蛋白质参与下进行自我加工、剪切", ""] },
  "e1ae1a245b8aa03721f890d152a2ed4d": { type: "综合题" },

  "07ae4d6328abca8675a37a6c57eca684": {
    type: "多选题",
    answer1: "C|D",
    answer: "【答案】 C、D",
    solution: "若丁为H，甲、乙、丙可取B、C、N；若丁为Cl，甲、乙、丙可取Li、Be、B。若丁为O或Be，其余三种同周期相邻元素的最外层电子数之和均无法使总和等于13。因此丁一定不是O或Be，选C、D。",
  },
  "ff64bdf3f79e735f961f7840224db4c6": {
    type: "多选题",
    answer1: "A|C",
    answer: "【答案】 A、C",
    solution: "生成碳酸钠需要碳元素，故还需含碳物质，A正确；氨盐水比食盐水更易吸收二氧化碳，B错误；碳酸氢钠在该体系中的溶解度较小，先结晶析出，C正确；没有未溶食盐不能证明溶液一定不饱和，D错误。因此选A、C。",
  },
  "4c9c4d818d0dba367c4e87b429229315": {
    answer1: "D",
    answer: "【答案】 D",
    solution: "氢能、天然气水合物和太阳能发电涉及的能量转化不改变原子核；氚与氦-3发生核聚变时会形成新的原子核，即产生新核素。因此选D。",
  },
  "cdfc059fdb653c4c27c14f16bc23a057": {
    answer1: "A",
    answer: "【答案】 A",
  },
  "63f20abd0881636dbc276a384e505761": {
    answer1: "C",
    answer: "【答案】 C",
  },

  "8c3190eb3cbab739d69a0dadcacb3fd0": {
    answer1: "解：4公顷=40000平方米，长方形的长=面积÷宽=40000÷800=50（米）。答：它的长为50米。",
    answer: "解：4公顷=40000平方米，长方形的长=面积÷宽=40000÷800=50（米）。答：它的长为50米。",
    solution: "1公顷=10000平方米，所以4公顷=40000平方米。由长方形面积=长×宽，得长=40000÷800=50（米）。",
  },
  "9b1758d70cfa4b6843bf36f0cfc79d4f": {
    answer1: "C",
    answer: "【答案】 C",
    solution: "关于x轴对称的两点横坐标相同，纵坐标互为相反数。点P(3,-2)关于x轴的对称点为Q(3,2)，因此选C。",
  },
  "97cfe5d071593fdd188c368de32f36d9": {
    solution: "①整数没有最小值，错误；②非负数包括正数和0，错误；③有理数还包括0，错误；④正数没有最小值、负数没有最大值，正确；⑤无限循环小数是有理数，所以该说法错误。共有4个错误说法，选C。",
  },
  "8e77140268e7ad3a2e92552bf9d57786": {
    solution: "题中不等式表示函数在(0,1)上严格凸。由二阶导数可知，3^x、log_{0.3}x和x^3在该区间内二阶导数均为正，而√x的二阶导数为负。因此满足条件的函数有3个，选D。",
  },
  "b8476c2694a476dcf8631092873815f7": {
    answer: "【解答】（1）各次载客后距出发地分别为5、2、12、4、16、6千米，所以最远为16千米。（2）六次收入分别为14、10、24、20、28、24元，共120元。",
    solution: "（1）依次累加位移：5，5-3=2，2+10=12，12-8=4，4+12=16，16-10=6，因此最远距离为16千米。（2）每次费用为10+2×max(路程-3,0)，所以总收入为14+10+24+20+28+24=120元。",
  },
  "554e5fa4ecc0f1e5ec8c2f532caa6ad6": { options: ["{α|α=475°+k•360°，k∈Z}", "{α|α=97°+k•360°，k∈Z}", "{α|α=263°+k•360°，k∈Z}", "{α|α=-263°+k•360°，k∈Z}", ""] },
  "51120881aae144d6ce615f374e36a001": {
    title: "设集合A={x|(x-3)(x-a)=0}，a∈R，B={x|(x-4)(x-1)=0}。若A∩B是单元素集，则a=（ ）",
    answer: "【答案】 C",
  },
  "04d6803d6a1c195d76304c67d38cb562": { options: ["$$4444.2222$$", "$$44444.2222$$", "$$44444.22222$$", "", ""] },
  "bc32f364a1bfd36f74cd2150bc72eb17": { options: ["先用等式的性质1，再用等式的性质1", "先用等式的性质2，再用等式的性质2", "先用等式的性质2，再用等式的性质1", "先用等式的性质1，再用等式的性质2", ""] },
  "a3802523c1f7e72ccfa3e1d0cc53485a": { options: ["①②③④", "①②③", "①②④", "②③④", ""] },
  "6625107598e9859731a6fc0f58a89ae5": { options: ["$$1$$和$$5$$", "$$-1$$和$$5$$", "$$1$$和$$-5$$", "$$-1$$和$$-5$$", ""] },
  "57351cf182498d54128d9adf97e521bc": { options: ["$$x=-\\dfrac{4}{5}$$", "$$x=\\dfrac{4}{5}$$", "$$x=-4$$", "$$x=4$$", ""] },
  "b98ed3fc0c4668aec237c6f23a56fd9b": { options: ["把△ABC向右平移6格", "把△ABC向右平移4格，再向上平移1格", "把△ABC绕点A顺时针旋转90°，再向右平移6格", "把△ABC绕点A逆时针旋转90°，再向右平移6格", ""] },
  "43c7119eb8e46f350e3f16cebad9a6ab": { options: ["$$x(x+1)=42$$", "$$x(x-1)=42$$", "$$x(x-1)=21$$", "$$x(x+1)=21$$", ""] },
  "926f4df0379d1aebfab261d6a2bb5bc6": { options: ["第一象限", "第二象限", "第三象限", "第四象限", ""] },
  "426aba19487058ac182c72df51535eda": { options: ["已知$$a>1$$，$$∀x>0$$，$$a^x\\leqslant1$$", "$${已知}0<a<1,∃x_0<0,a^{x_0}\\leqslant1$$", "$${已知}0<a<1,∃x_0\\geqslant0,a^{x_0}\\leqslant1$$", "已知$$0<a<1$$，$$∀x<0$$，$$a^x\\leqslant1$$", ""] },
  "4c9a653d596f290ce11834eea2942bdb": { type: "解答题" },
  "6f3928ccf594834e3a818d9a48931b33": {
    answer1: "B",
    answer: "【答案】 B",
  },
  "8f5b06a5f14e973b5e96055d64ad686b": {
    answer1: "22，18，34，76，34，49，12，88，6，10，36，11，17，9，14，1，5，30，35，80，24，57，36，8，21，53，59，45",
    answer: "22，18，34，76，34，49，12，88，6，10，36，11，17，9，14，1，5，30，35，80，24，57，36，8，21，53，59，45",
    solution: "相同数位对齐，从个位减起；个位不够减时从十位退1。依次计算得：22，18，34，76，34，49，12，88，6，10，36，11，17，9，14，1，5，30，35，80，24，57，36，8，21，53，59，45。",
  },
  "0d873fe367ae3d69fd3ed82121f17838": {
    answer1: "（1）1664元；（2）选择第二家商家。",
    answer: "（1）1664元；（2）选择第二家商家。",
    solution: "（1）设进价为x元。第一家售价为1.25x×0.9=1.125x，利润为0.125x=208，解得x=1664，售价为1872元。（2）第二家售价为1.4x×0.8=1.12x=1863.68元，低于第一家的1872元，因此选择第二家。",
  },
  "005db94744c309c285d3dd17c8d286f0": {
    answer1: "例如：-8x³y，-8x²y²，-8xy³。",
    answer: "例如：-8x³y，-8x²y²，-8xy³。",
    solution: "单项式的系数取-8，且x、y的指数都是正整数、指数和为4即可。例如-8x³y、-8x²y²、-8xy³。",
  },
  "86e7816d6d9868b42007f657ade6bf9f": {
    answer1: "0",
    answer: "0",
    solution: "从原点向右5个单位到5，再向左5个单位回到0，所以终点表示的数是0。",
  },
  "44a131591b9f937dd8d2d5528ecbe1a4": {
    title: "在△ABC中，a=7，b=8，夹角C=60°，求边c。",
    answer1: "$$\\sqrt{57}$$",
    answer: "$$\\sqrt{57}$$",
    solution: "由余弦定理，c²=a²+b²-2ab cos C=7²+8²-2×7×8×cos60°=49+64-56=57，所以c=√57。",
  },

  "0f49958bb1c9aa0cf86c3e1ede0c0544": {
    answer1: "反射；折射",
    answer: "反射；折射",
    solution: "水面相当于平面镜，蝴蝶的虚像由光的反射形成；鱼发出的光从水中进入空气时发生折射，所以看到的鱼是折射形成的虚像。",
  },
  "57777ccf4a0f4cac111e40798693b94b": {
    answer: "【答案】 B、D",
    solution: "验钞机利用紫外线的荧光效应，手术室消毒灯利用紫外线的杀菌作用；电视遥控器和夜视仪利用的是红外线。因此选B、D。",
  },
  "72d38be798790b1f2bb23c3590871890": {
    answer: "B",
    solution: "合外力做功等于动能增量：W合=mv²/2=20×3²/2=90 J，故B正确。重力做功mgh=400 J，支持力不做功，阻力做功为90-400=-310 J。",
  },
  "3d02e55920c058ac8adaa286df4aae43": {
    type: "多选题",
    answer1: "A|C",
    answer: "【答案】 A、C",
    solution: "欧姆挡每次换挡后都必须重新欧姆调零，A正确；同一挡位连续测量不必每次调零，B错误；在路测电阻须先与其他元件断开，C正确；手同时接触两端会引入人体并联电阻，D错误。因此选A、C。",
  },
  "c6eeda83ac7548d22235284ce1b3c760": {
    type: "多选题",
    answer1: "A|C",
    answer: "【答案】 A、C",
    solution: "释放前小车应靠近打点计时器，以充分利用纸带，A正确；计时器应在无滑轮一端，B错误；应先接通电源、待打点稳定后再释放小车，C正确；电火花计时器使用220 V交流电，D错误。因此选A、C。",
  },
  "c7d8180948fe2c62f2f4865f1df715c7": { options: ["物体在恒力作用下不可能做曲线运动", "物体在变力作用下不可能做直线运动", "物体在恒力作用下可能做曲线运动", "物体在变力作用下可能做直线运动", ""] },
  "1b6ae7b9b56f68439774913c540be844": { options: ["太阳", "月亮", "地面", "云朵", ""] },
  "408642be3319d162839363e592c68c85": {
    solution: "直流电不能产生交变磁场，A错误；涡流强弱与磁场变化频率有关，B正确；常见电磁炉需要铁磁性导体锅具以有效耦合并发热，C正确；金属面板会产生额外涡流损耗，面板通常采用绝缘耐热材料，D错误。因此选B、C。",
  },
  "bdfd9a0db4653c75b032f93362a4dfc2": {
    answer: "（1）B；（2）B、C。",
    solution: "（1）斜槽末端切线水平，才能保证小球以水平初速度飞出，选B。（2）末端不水平会使运动不再是平抛；木板未固定会使记录坐标不一致，二者都会增大误差，选B、C。摩擦本身不妨碍获得稳定轨迹，取点离原点较远通常能减小相对误差。",
  },
  "b0cfb6a5d2c42a66493572720490b247": {
    type: "多选题",
    options: ["液面表面张力的方向与液面垂直并指向液体内部", "单晶体有固定的熔点，多晶体没有固定的熔点", "单晶体中原子（或分子、离子）的排列具有空间周期性", "通常金属在各个方向的物理性质都相同，所以金属是非晶体", "液晶具有流动性，其光学性质具有各向异性"],
  },
  "c7e8723639bd12885a8c4abc5b2347ba": {
    title: "用半偏法测量量程3 V、内阻约3000 Ω的电压表内阻。电阻箱R₀与电压表串联，开关S₂与R₀并联；滑动变阻器R₁接成分压器，开关S₁控制电源。请回答：（1）在闭合开关前将R₁调到使测量支路分压最小的位置后，应怎样操作并读取测量值？（2）若把测得的内阻记为Rᵥ′，它与真实值Rᵥ相比偏大、相等还是偏小？说明原因。",
    answer1: "（1）闭合S₁、S₂，调节R₁使电压表满偏；保持R₁不变，断开S₂，调节R₀使电压表半偏；读取R₀。（2）Rᵥ′>Rᵥ。",
    answer: "（1）闭合S₁、S₂，调节R₁使电压表满偏；保持R₁不变，断开S₂，调节R₀使电压表半偏；读取R₀，此读数作为Rᵥ′。（2）Rᵥ′>Rᵥ。断开S₂后测量支路总电阻增大，分得电压增大；半偏时R₀两端电压大于电压表两端电压，因此R₀读数大于真实内阻。",
    solution: "满偏后保持分压器不变，串入电阻箱并调到半偏，是半偏法的基本步骤。由于分压电路并非理想恒压源，串入R₀后支路电阻增大、端电压随之升高，导致达到半偏所需的R₀大于电压表真实内阻。",
  },
  "9dd7e50c7184f006f1d7fd3a26c3d1a5": {
    type: "综合题",
  },
  "bf054a9c1358957cce9555c42821cea0": {
    solution: "生态系统需要外界持续输入能量，A正确；生态系统依靠自我调节维持相对稳定，B正确；自然生态系统通常趋向稳态，C正确；营养结构越复杂，抵抗力稳定性通常越强，但恢复力稳定性往往越弱，因此D不正确。",
  },
  "3ca822332a7f959fb29f6fbab52b97f7": {
    solution: "布朗运动是悬浮微粒的无规则运动，A错误；扩散说明分子不停地做无规则运动且分子间有空隙，B正确；分子间距离增大时引力和斥力都减小，C错误；一定量气体压强不变、体积增大时温度升高，内能增加且对外做功，必须吸热，D错误。因此选B。",
  },
  "b5730b67b77514e0f37a818e3e319352": {
    type: "多选题",
    answer1: "A|B|C",
    answer: "【答案】 A、B、C",
    solution: "小车应靠近打点计时器，先接通电源再释放，A正确；纸带起始处的密集点不利于测量，可舍去后选取计数点，B正确；50 Hz时相邻点间隔0.02 s，每隔四个点取一个计数点即相邻计数点间有5个间隔，时间为0.10 s，C正确；速度过小会使点过密，不利于测量，D错误。",
  },
  "d18c89e9c99fb4757f4e11c40943fbb3": {
    type: "多选题",
    answer1: "A|B|D",
    answer: "【答案】 A、B、D",
    solution: "小球从斜槽不同位置滚下时，离开斜槽的初速度不同，A正确，因此轨迹和相同下落时间内的水平位移也不同，B、D正确；抛出点高度相同，竖直方向均为自由落体，所以在空中的时间相同，C错误。",
  },
  "00a560a9a9026701d8457e47e0b192b4": {
    solution: "5 s时指5 s末，是时刻，A正确；5 s内指从0到5 s的时间间隔，不是第4 s末到第5 s末，B错误；第5 s内是从第4 s末到第5 s末的1 s，C正确；第4 s末与第5 s初是同一时刻，D正确。因此选B。",
  },
  "2ababce7b71679e090a04c88ad1914f1": {
    solution: "白炽灯、保险丝和电饭煲都利用电流的热效应；电容器主要利用充放电过程工作，不以电流热效应为工作原理。因此选C。",
  },

  "fc7daff468950cf80f1cec2c8e3141f9": {
    titleReplacements: [["原尿中中葡萄糖", "原尿中葡萄糖"]],
    solutionReplacements: [["原尿中中葡萄糖", "原尿中葡萄糖"]],
  },
  "5291b65f937dad41293c240e575c4f2c": {
    title: "哺乳动物受精过程的顺序为（ ）①第一次卵裂开始；②释放第二极体；③顶体反应；④穿越透明带；⑤雌、雄原核的形成；⑥核膜消失，雌、雄原核融合。",
    options: ["①②③④⑤⑥", "③②④⑤⑥①", "④⑤②①③⑥", "③④②⑤⑥①", ""],
  },
  "dc8435e7ff7c6e7e2db4d183aa889611": {
    solutionReplacements: [["免疫和和激素", "免疫和激素"]],
  },
  "de677a25158c3d5fd6295e231e8f7b82": {
    solution: "染色体是基因的主要载体，A正确；基因在染色体上呈线性排列，B正确；一条染色体未复制时含一个DNA分子，复制后含两个DNA分子，C正确；基因是具有遗传效应的DNA片段，并非任意DNA片段都是基因，D错误。因此选D。",
  },
  "48a2e6d47ae57a2fe7c81cc7d7297139": {
    solutionReplacements: [["生物膜系系统", "生物膜系统"]],
  },
  "eeaf6c39042b7227d02c8bc7c6f907ce": {
    solutionReplacements: [["增殖的高高峰阶段", "增殖的高峰阶段"]],
  },
  "f0d38079e6f41402c7ae84ae9081ad9b": {
    solutionReplacements: [["初生演替替", "初生演替"]],
  },
  "3da0ce64a63d61ab028aba86f0f91f63": {
    solutionReplacements: [["溶酶体体内", "溶酶体内"]],
  },

  "8dc2b947b6332f850affd404041c0f38": {
    solutionReplacements: [
      ["性质和和用途", "性质和用途"],
      ["氖水的微观构成", "氖气的微观构成"],
    ],
  },
  "10c7318c295ce1893ad36ed5772e213f": {
    titleReplacements: [["怎么办？，这种", "怎么办？这种"]],
    answerReplacements: [["大勺中中时", "大勺中时"]],
  },
  "428dd7831612bc275d06b5788cf69174": {
    title: "（4分）下列反应中，属于取代反应的是____，属于氧化反应的是____，属于加成反应的是____。①甲烷在光照下与氯气反应；②乙烯使溴水褪色；③乙烯使酸性高锰酸钾溶液褪色；④苯与液溴反应；⑤乙醇与乙酸酯化；⑥苯与浓硝酸和浓硫酸的混酸反应。",
    answer: "【答案】①④⑤⑥；③；②",
    solution: "①甲烷与氯气的光照反应、④苯的溴代、⑤乙醇与乙酸的酯化和⑥苯的硝化，均有原子或原子团被另一原子或原子团替代，属于取代反应。③乙烯使酸性高锰酸钾溶液褪色时乙烯被氧化，属于氧化反应。②溴加到乙烯碳碳双键两端，属于加成反应。因此依次填①④⑤⑥、③、②。",
  },
  "dd7199cad030e7d2068e4d91be6d42e5": {
    type: "多选题",
    answer1: "B|D",
    answer: "【答案】 B、D",
    solution: "A项，容器Ⅰ从反应物侧正向反应并升温，容器Ⅱ从生成物侧逆向反应并降温；两者的平衡温度和组成不同，正反应速率不相同，错误。B项，Ⅰ与Ⅲ的初始组成比例相同，且该反应前后气体总物质的量不变；在通常忽略容器热容的理想模型下，将各物质的量同比加倍不改变平衡转化率和绝热平衡温度，所以平衡常数相同，正确。C项，以700 ℃恒温平衡为参照，Ⅰ的绝热升温使放热的正反应平衡左移，剩余CO增多；Ⅱ的绝热降温使正反应平衡右移，剩余CO减少，因此Ⅰ中CO比Ⅱ中多，错误。D项，同温时Ⅰ中CO正向转化率与Ⅱ中CO₂逆向转化率之和为1；绝热条件使前者因升温而减小、后者因降温而减小，故二者之和小于1，正确。因此选B、D。",
  },
  "cc7ca178e2012134521431c0fb5b824e": {
    titleReplacements: [["最少能供上上述", "最少能供上述"]],
  },
  "503d8f318d7236774bae9c49f9af2dd7": {
    answerReplacements: [["使一部分物质经经汽化", "使一部分物质经汽化"]],
  },
  "e433dc878f84e414245a812fb262c935": {
    solutionReplacements: [["应用用酒精灯外焰", "应用酒精灯外焰"]],
  },
  "ac26f5fb3349f57bbaf8e1bdbbef4990": {
    titleReplacements: [["将体温计计打破", "将体温计打破"]],
  },
  "db34eb24fd229b6be77807b824ff7172": {
    solutionReplacements: [["故不同物质质表示的反应速率", "故不同物质表示的反应速率"]],
  },
  "0feab10a39992baedc330515767b1d9c": {
    solutionReplacements: [["气气体", "气体", 2]],
  },
  "89c3f191318e621269f28a2efcccd9e1": {
    title: "下列物质的用途与化学性质有关的是（ ）",
    solution: "浓硫酸作干燥剂利用其吸水性，石墨作电极利用其导电性，干冰作制冷剂利用其升华吸热，这些用途不需要生成新物质。烧碱能与炉具上的油污发生化学反应，因此作炉具清洁剂利用的是化学性质，选C。",
  },
  "2abad7c3e1e065e282142c822a10cec8": {
    answerReplacements: [
      ["稀盐酸除去铜粉中的铁粉", "稀盐酸除去铜粉中的锌粉"],
      ["可以用用盐酸", "可以用盐酸"],
    ],
  },
  "54a1a6ffd055bd5974319c2fa121a407": {
    solutionReplacements: [["则则稀释后", "则稀释后", 2]],
  },
  "303075120f46207afe79c5802cb7bd93": {
    solution: "A为SiO₂水晶，是由原子构成的原子晶体且属于化合物；B冰醋酸由极性分子构成；C氧化镁是离子晶体；D白磷由P₄分子构成；E晶体氩以氩原子为构成微粒，归入分子晶体；F氯化铵是含共价键的离子晶体；G铝是金属晶体；H金刚石是由原子构成的原子晶体。因此（1）依次为A、AEH、E；（2）依次为B、F、DE；（3）金属铝导电不需破坏化学键，分子晶体熔化不破坏分子内化学键，原子晶体熔化需克服共价键，依次为G、BDE、AH。",
  },

  "bc1b6f3c5de7c4183aeca9fe512ea772": {
    titleReplacements: [["3里米", "3厘米"]],
  },
  "d88753917127c6c9305f176e93ca14a8": {
    title: "现有有理数3、4、-6、10，每个数用且只用一次，进行加、减、乘、除运算，使结果等于24。请写出三个符合条件的算式。",
  },
  "2cb2a3050711f753dff04f89ffb19ed4": {
    title: "闽北某村原有林地$$120$$公顷、旱地$$60$$公顷。为适应产业结构调整，需把一部分旱地改造为林地。改造后，旱地面积占林地面积的$$20\\%$$。设把$$x$$公顷旱地改造为林地，则可列方程为$$()$$",
    solutionReplacements: [["未知数以以改造后", "未知数，以改造后"]],
  },
  "b11265114e1cdae9860f5a304bd0559a": {
    title: "写出各单项式的系数和次数：$$(1)\\dfrac{2m}{3}$$；$$(2)-y$$；$$(3)\\dfrac{1}{8}x^{2}y$$；$$(4)-3πx^{7}y^{2}$$。",
    answer1: "（1）系数为$$\\dfrac{2}{3}$$，次数为1；（2）系数为-1，次数为1；（3）系数为$$\\dfrac{1}{8}$$，次数为3；（4）系数为$$-3π$$，次数为9。",
    answer: "（1）系数为$$\\dfrac{2}{3}$$，次数为1；（2）系数为-1，次数为1；（3）系数为$$\\dfrac{1}{8}$$，次数为3；（4）系数为$$-3π$$，次数为9。",
    solution: "单项式的系数是数字因数，次数是所有字母指数之和。（1）$$\\dfrac{2m}{3}=\\dfrac{2}{3}m$$，系数为$$\\dfrac{2}{3}$$、次数为1。（2）$$-y=-1\\cdot y$$，系数为-1、次数为1。（3）$$\\dfrac{1}{8}x^2y$$的系数为$$\\dfrac{1}{8}$$，次数为$$2+1=3$$。（4）$$-3πx^7y^2$$的系数为$$-3π$$，次数为$$7+2=9$$。",
  },
  "d34155e4e0cc38c8bde300ccb97997b6": {
    solution: "三个圆心角之和为$$360^\\circ$$，比值总份数为$$1+3+5=9$$，所以每份为$$360^\\circ\\div9=40^\\circ$$。（1）三个圆心角分别为$$40^\\circ$$、$$120^\\circ$$、$$200^\\circ$$。（2）半径为2的圆面积是$$πr^2=4π$$，按圆心角占周角的比例计算，三个扇形面积依次为$$\\dfrac{40}{360}\\times4π=\\dfrac{4}{9}π$$、$$\\dfrac{120}{360}\\times4π=\\dfrac{4}{3}π$$、$$\\dfrac{200}{360}\\times4π=\\dfrac{20}{9}π$$。",
  },
  "db9872a625dacb34f7497b4ac4c3351b": {
    solution: "（1）由$$4x-3=2x+5$$移项得$$4x-2x=5+3$$，所以$$2x=8$$，解得$$x=4$$。（2）先合并右边常数：$$20-5x=3x-24$$。移项得$$-5x-3x=-24-20$$，所以$$-8x=-44$$，解得$$x=\\dfrac{11}{2}=5.5$$。",
  },
  "2d9230532b01437b16ba1c331a1680f0": {
    solution: "（1）由$$i^2=-1$$可得$$i^3=-i$$、$$i^4=1$$、$$i^6=-1$$。虚数单位的幂以4为周期，因$$2020\\div4$$余0，所以$$i^{2020}=1$$。（2）$$(x-1)^2=-1=i^2$$，故$$x-1=\\pm i$$，解得$$x=1\\pm i$$。（3）方程除以2得$$x^2-4x+13=0$$，配方为$$(x-2)^2=-9=(3i)^2$$，故$$x-2=\\pm3i$$，解得$$x=2\\pm3i$$。",
  },
  "cc1b85136dd237ade5c8f308067f8f29": {
    titleReplacements: [["至少要称 次次才能", "至少要称 次才能"]],
  },
  "3060515d6147e55f44f28e27d975d55b": {
    solutionReplacements: [["、还是成成反比例", "、还是成反比例"]],
  },
  "9b03bef0f0aefdca4f96fac82fc26fe2": {
    answerReplacements: [[" 则则□＜3", " 则□＜3"]],
  },
  "17c4d6b1c798fbe2534f787f9dfc0b46": {
    solution: "冰箱的长、宽、高描述的是长度，应使用长度单位；墙面大小描述的是面积，应使用面积单位。因此依次选D、B。",
  },
  "8cd6e6996791b03293475ddf1c8637c9": {
    solutionReplacements: [["663336，即即从3333", "663336，即从3333"]],
  },
  "a71c5f1317f6bab5998c15aad9d4cee6": {
    solutionReplacements: [["面积的最大值值为8", "面积的最大值为8"]],
  },
  "06b499c8a0ddc4ca36b1192d90f15a0b": {
    answer1Replacements: [["不等式式", "不等式"]],
    answerReplacements: [["不等式式", "不等式"]],
  },
  "b56a6fb86cadb07a66217686b3aecf30": {
    solutionReplacements: [["恒等变变换", "恒等变换", 2]],
  },
  "2ddc5f5a3588d721fb4ed0e86f9d57b8": {
    solutionReplacements: [["同底数幂的除法法，底数", "同底数幂的除法，底数"]],
  },
  "5389801e6bf925766d41bd50e464f092": {
    titleReplacements: [["勾兑并包装装箱后出售", "勾兑并包装、装箱后出售"]],
  },
  "2a855142e8587ee4682001896f2246c8": {
    solution: "把圆剪拼成近似长方形后，长方形的长等于圆周长的一半，即$$πr=15.7$$。取$$π=3.14$$，得$$r=15.7\\div3.14=5$$（厘米）。圆的面积为$$πr^2=3.14\\times5^2=78.5$$（平方厘米）。",
  },
  "c46f9a773f18161ae1620a2a225589b2": {
    solution: "按相同数位对齐，从个位开始相减：$$96-66=30$$，$$53-50=3$$，$$87-75=12$$，$$74-32=42$$。",
  },
  "da6650ea1319bcadf68dfa985f14f804": {
    solution: "每盒有6个月饼，5盒就是5个6相加，所以一共有$$5\\times6=30$$（个）月饼。",
  },
  "7d928eaa06146c15fd895be41194a0f4": {
    solution: "把60217000按数位写成$$60\\,217\\,000$$可知，最左边的6在千万位，所以最高位是千万位；数字2在十万位，表示2个十万。",
  },
  "478d70965b9905332cdd4f7529383b4d": {
    solution: "设经过$$t$$分钟两针第一次重合。5时整时，时针在分针前方$$5\\times30^\\circ=150^\\circ$$；分针每分钟转$$6^\\circ$$，时针每分钟转$$0.5^\\circ$$。由$$6t=150+0.5t$$，得$$t=\\dfrac{150}{5.5}=\\dfrac{300}{11}$$（分钟）。",
  },
  "daf861b599c88299e5d594cb5627390e": {
    solution: "先分解$$a^2-9=(a-3)(a+3)$$，并用$$3-a=-(a-3)$$：$$\\dfrac{12}{(a-3)(a+3)}-\\dfrac{2}{a-3}=\\dfrac{12-2(a+3)}{(a-3)(a+3)}=\\dfrac{-2(a-3)}{(a-3)(a+3)}=-\\dfrac{2}{a+3}$$。原式要求$$a\\ne\\pm3$$。",
  },

  "d46fe4d96bfbe4c55eef0da681baeee9": {
    titleReplacements: [
      ["爸爸的上上随爸爸", "爸爸的车上，随爸爸"],
      ["不解的问", "不解地问"],
      ["就说到", "就说道"],
      ["根握顺序", "根据顺序"],
      ["不是很平密", "不是很严密"],
      ["在显示生活中", "在现实生活中"],
      ["这一些结论", "这些结论"],
    ],
  },
  "d174fb016792510a8150d26d4763a9e3": {
    solutionReplacements: [["和和镜面", "和镜面", 2]],
  },
  "d0ccaf8126979280e46f0aeba1a6730e": {
    solutionReplacements: [["条件和和声音", "条件和声音"]],
  },
  "a2fd3578ad72763e7c62d8060b70ad14": {
    answerReplacements: [["可以以及时", "可以及时"]],
  },
  "8fc99306e886f996b79bb93724448050": {
    options: [
      "$$β$$衰变现象说明电子是原子核的组成部分",
      "查德威克通过原子核人工转变的实验发现了中子",
      "$$α$$粒子散射实验揭示了原子的可能的能量状态是不连续的",
      "氡的半衰期为$$3.8$$天，若取$$4$$个氡原子核经过$$7.6$$天后只剩下一个氡原子核了",
      "",
    ],
  },
  "8cc7f24f89633816c5525482dd2d536f": {
    solutionReplacements: [["若若速度", "若速度"]],
  },
  "ff5ba85231ffb343748a0c4b11054073": {
    answerReplacements: [["计时时器", "计时器"]],
  },
  "c35b7894dba825f3756930a997c90c01": {
    solutionReplacements: [["如如一个", "如一个"]],
  },
  "1a72fd5e843671ec8585992635774be3": {
    solutionReplacements: [["乙车位参照物", "乙车为参照物"]],
  },
  "f14013c1616d65d5a22af35a12446347": {
    solutionReplacements: [["这个红字字只能", "这个红字只能"]],
  },
  "26653e0fb69c6e7401f70e5f5973e939": {
    solutionReplacements: [["接触触电人", "接触触电者"]],
  },
  "55a1461d2675f6bbeda37f258d4884ab": {
    solutionReplacements: [["不持续续放热", "不持续放热"]],
  },
  "6df3f0379d7485b0b30ef3272fd74c68": {
    solutionReplacements: [["大于入入射角", "大于入射角"]],
  },
  "9a42c4b80ed721c306a602906eee1142": {
    solutionReplacements: [["理解解答即可", "理解后即可解答"]],
  },
  "45734c384b32be205922f80609c650df": {
    options: [
      "布朗运动说明悬浮微粒的分子在永不停息地做无规则运动",
      "一定质量的理想气体缓慢膨胀，其内能一定减少",
      "一定质量的理想气体吸收热量，其温度一定升高",
      "一定质量的理想气体保持压强不变、体积增大时，一定从外界吸收热量",
      "电冰箱的制冷系统能够不断地把冰箱内的热量传到外界，违背了热力学第二定律",
    ],
  },
  "c616dd851ebacd56c62486c2ff82c9b6": {
    solutionReplacements: [["保护建筑物物等", "保护建筑物等"]],
  },
  "d6e7c2d5470f20734b73525a9e70e7dd": {
    solutionReplacements: [["本题题考查了", "本题考查了"]],
  },
  "c5a06f103e978b732d7c2354c9f1a4c8": {
    titleReplacements: [["汽车的加速速度方向", "汽车的加速度方向"]],
  },
  "23b6789d04fe63bd43ffe3f6e13b1959": {
    answerReplacements: [["动能增增大", "动能增大"]],
  },
  "47fe4f40cc615e6de45bebfeb4086d6a": {
    solutionReplacements: [["求出出角速度", "求出角速度"]],
  },
  "f03ae2bd8e0adcce9e3c7aa6641f85bc": {
    solutionReplacements: [["通电电线周围磁场", "通电导线周围磁场"]],
  },
  "a6a499f925464f0aeadd4b949d58cf73": {
    options: ["压力和支持力总是跟接触面垂直", "物体受到摩擦力时一定受到弹力", "压力和支持力是一对作用力和反作用力", "两物体间有弹力，则一定有摩擦力", ""],
  },
  "746cee918267c9d0bf1178d4bda4c840": {
    options: [
      "光电效应中，金属板向外发射的光电子又可以叫做光子",
      "用光照射金属不能发生光电效应是因为该入射光的频率小于金属的截止频率",
      "对于同种金属而言，遏止电压与入射光的频率无关",
      "石墨对X射线散射时，部分X射线的散射光波长会变大，这个现象称为康普顿效应",
      "光电效应现象、康普顿效应说明光具有粒子性",
    ],
  },
  "b6c1098751ac5452fbe60e4d8c33258f": {
    options: [
      "在光电效应实验中，入射光强度越强，遏止电压和饱和光电流越大",
      "电子的发现使人们认识到原子不是组成物质的最小微粒，原子本身也具有结构",
      "α粒子散射实验中，α粒子大角度偏转的主要原因是粒子与电子的碰撞造成的",
      "放射性原子核发生α衰变、β衰变后产生的新核处于高能级，它向低能级跃迁时产生γ射线，因此γ射线经常伴随α射线和β射线产生",
      "重原子核发生α衰变时，衰变产物的结合能之和一定大于原重核的结合能",
    ],
  },
  "07ef0d6486753eb95c61f0584f3e3328": {
    answerReplacements: [["衰老细胞细胞膜通透性功能改变", "衰老细胞的细胞膜通透性改变"]],
  },
  "7e224d27969d3c2cea3f24c543c9ed60": {
    solutionReplacements: [["次生演替演替", "次生演替"]],
  },
  "60c826821446815697ea3dc0afbb10f7": {
    solutionReplacements: [["经减数分裂分裂可以", "经减数分裂可以"]],
  },
  "7fe3a18210e6b47b6792459e07337b04": {
    solutionReplacements: [["脱氧核苷酸中的中的五碳糖", "脱氧核苷酸中的五碳糖"]],
  },
  "e7a720a2a3087ba44dfe3cc87fe3e1b2": {
    solutionReplacements: [["衰老细胞细胞膜通透性改变", "衰老细胞的细胞膜通透性改变"]],
  },
  "5fd4a1e1aef42578b5cc2c548b5bbe45": {
    optionReplacements: { option_b: [["衰老细胞细胞核", "衰老细胞的细胞核"]] },
  },
  "5f4449be6360e672f1b8712ca441a8b4": {
    answerReplacements: [["（2）微根据实验实验可知", "（2）根据实验可知"]],
  },
  "fedcf990704950b4c5b5181f8161240f": {
    solutionReplacements: [["激素通过血液运输被靶细胞细胞膜受体结合", "激素通过血液运输并与靶细胞膜上的受体结合"]],
  },
  "d73d2e8ccd840afcf899385726f226f6": {
    solutionReplacements: [["经有丝分裂分裂分化而来", "经有丝分裂、分化而来"]],
  },
  "5590e867d1c6fb242b49c92ecd7bbb59": {
    solutionReplacements: [["意在考查考生意在考查考生", "意在考查考生"]],
  },
  "c052a51beda6440d4f366aaac48a395e": {
    answerReplacements: [["各种关系一一一一一既有", "各种关系，既有"]],
  },
  "ce9cfb5f2e0cd3a0b2a6009b36152f62": {
    solutionReplacements: [["卵细胞细胞膜的外面", "卵细胞膜的外面"]],
  },
  "09811d94a8f0c00f030eb2b3da6e5df2": {
    titleReplacements: [["真核细胞细胞核内", "真核细胞的细胞核内"]],
  },
  "3087f9e84f626e3bb25dc210827c7b85": {
    answerReplacements: [["效应T细胞细胞核中", "效应T细胞的细胞核中"]],
  },
  "4779d399d44a13984df30dc2f3e8a674": {
    solutionReplacements: [["卵细胞细胞膜的外面", "卵细胞膜的外面"]],
  },
  "3e8656697ad349fa4365f06f6ad9f2eb": {
    answerReplacements: [["能进行进行DNA复制", "能进行DNA复制"]],
  },
  "f878e316eb3c26fdacd79f6d2380caf0": {
    solutionReplacements: [["动物细胞细胞膜", "动物细胞膜"]],
  },

  "4c48d3d4ef7abf026b9fa44375badaa1": {
    solutionReplacements: [["据此分析分析判断", "据此分析判断"]],
  },
  "6fbafd909bbdf359072b4708ac50e5b4": {
    solutionReplacements: [["反应反应的碳", "反应中碳"]],
  },
  "ab6941d0ee5ad5522d3ea36f726d13bd": {
    solutionReplacements: [["化学性质性质又", "化学性质又"]],
  },
  "6dd5a4724977f865ed34c55909550b62": {
    solutionReplacements: [["结合结合选项", "结合选项"]],
  },
  "ad7f1d384e0fea5393802e3b41586a7e": {
    answerReplacements: [["为了防止防止", "为了防止"]],
  },
  "0d010c55a62993f38763e9816d67b44c": {
    solutionReplacements: [
      ["根据根据物质", "根据物质"],
      ["相互反应想现象", "相互反应的现象"],
    ],
  },
  "0fb3c58ee1e6689a05e838fe4460cf8a": {
    solutionReplacements: [["才能达到达到一次", "才能达到一次"]],
  },
  "e44994620ec447f10892e577d5e65465": {
    solutionReplacements: [["并能形成形成光化学烟雾", "并能形成光化学烟雾"]],
  },
  "632dfd888e8b3d0b62fcbb68fe5f81de": {
    titleReplacements: [["由分子构成的是构成的是______，由原子构成的是______由离子构成的是______", "由分子构成的是______，由原子构成的是______，由离子构成的是______"]],
  },
  "cb6f0311f5eaf7df6f3900039dd3297d": {
    titleReplacements: [["错误的是的是", "错误的是"]],
  },
  "9c95e0175a2693dc2cf761c8f9ce1b8f": {
    answerReplacements: [["富含富含", "富含", 4]],
  },
  "896937c3df09962a412f99ccd8666947": {
    solutionReplacements: [["被硝基取代取代生成", "被硝基取代生成"]],
  },
  "0f897ea5061b35754283ae5e0175619e": {
    solutionReplacements: [["平衡逆向移动，反应反应减小", "平衡逆向移动，反应速率减小"]],
  },
  "087b71e8d4326eb67a655331c87bad3c": {
    solutionReplacements: [["用于鉴别鉴别晶体", "用于鉴别晶体"]],
  },
  "9e5859b9b57df5adc28be91caaf089b6": {
    answerReplacements: [["生产过程中大量排放排放，燃烧", "生产过程中大量排放污染物；燃烧"]],
  },
  "16d007fc5912f3584d214f1dd01b176d": {
    optionReplacements: { option_b: [["用铁制容器盛装容器盛装浓硝酸", "用铁制容器盛装浓硝酸"]] },
  },
  "c7e6745e79fe19af2bc1bfd331d14c1a": {
    solutionReplacements: [["可用饱和碳酸钠溶液吸收吸收乙酸乙酯，然后根据碳酸钠溶液呈碱性、乙酸乙酯为中性进行解答", "可用饱和碳酸钠溶液洗涤乙酸乙酯，以除去乙酸并溶解乙醇，然后分液"]],
  },
  "ef59bc2c9fb15dae25628195ac7fae50": {
    answerReplacements: [["酶具有具有催化效率", "酶具有催化效率"]],
  },

  "2fd4b513fab2ffef9fbf6c712a514064": {
    solution: "逐题计算：2+3=5，4+5=9，6+3=9，9+0=9，8-4=4，9-5=4，10-6=4，7-2=5。",
  },
  "1c75a7fd58fce862733c837e222eb47b": {
    solution: "依次用逆运算求空格：120÷3=40，64÷2=32，300×5=1500，33×2=66。因此填40、32、1500、66。",
  },
  "8e962c2fd16a870cd0363e9c977635da": {
    solution: "6时整，分针指向12、时针指向6，两针夹角为180°，是平角；9时整，分针指向12、时针指向9，两针较小夹角为90°，是直角。",
  },
  "9c7d602ca8f37b4234cd7b99d972ddb5": {
    solution: "正方形边长为6分米，内切圆的直径为6分米，所以半径为3分米。取π=3.14，圆面积为3.14×3²=28.26平方分米；剩余面积为6²-28.26=7.74平方分米。",
  },
  "872d69b898b1d8208d9632552e3e8123": {
    solution: "百分数的写法是在数后加百分号，所以百分之三十五写作35%；0.056%按小数部分依次读出，读作百分之零点零五六。",
  },
  "afc622785bc274bdbb2d0b305b6a4615": {
    solution: "负数是小于0的数；0既不是正数也不是负数。只有D项符合定义。",
  },
  "098e91163360b1322293458ceb3a8e30": {
    solutionReplacements: [["所以所以", "所以"]],
  },
  "97dd9009d34faebdec2157dfb62a1476": {
    solutionReplacements: [["这种类这种类型", "这种类型"]],
  },
  "502e661e454d298fb64cfdfa6875de7a": {
    solutionReplacements: [["用后面的数字的数字除以", "用后面的数字除以"]],
  },
  "0acbf6c135261d31cc3d8cf4754baa8d": {
    answerReplacements: [["5号应最少最少有", "5号应至少有"]],
    solutionReplacements: [["5号应最少最少有", "5号应至少有"]],
  },
  "ed76cff367d62410c44cdd0bc94a7704": {
    solutionReplacements: [["最后根据根据四舍五入法", "最后根据四舍五入法"]],
  },
  "baa42608d2de0e589eaaf92c9388ca8e": {
    solutionReplacements: [["第一根第一根剪去", "第一根剪去"]],
  },
  "e1514dc736e9760ce39867131431d314": {
    answerReplacements: [["第五位第五位数", "第五位数"]],
  },
  "c1210206582dbe6616107337760021c4": {
    solutionReplacements: [["每组4条棱的相等相等", "每组4条棱相等"]],
  },
  "7b3d0c6eaafac6e72226b6bd9c238193": {
    solutionReplacements: [["平均数平均数表示", "平均数表示"]],
  },
  "67bc76bbda24b35650df8a12eff9dead": {
    solutionReplacements: [["若李老师用了用了", "若李老师用了"]],
  },
  "31e502e93ef26663d50a9cafe68b91b1": {
    solutionReplacements: [["本题考查考查了", "本题考查了"]],
  },
  "73cc5e46709d151acccc37d92203e925": {
    solutionReplacements: [["两点关于关于原点", "两点关于原点", 3]],
  },
  "74406d5bba5939bf3271feed86ae4aa1": {
    solutionReplacements: [["要注意注意不等式", "要注意不等式"]],
  },
  "c13ae7d7e0a7bfb4883bd28cf921e6e7": {
    solutionReplacements: [["关键是根据根据垂直定理", "关键是根据垂直定理"]],
  },
  "4a540c846b326046432a28b5e12cd6f3": {
    solutionReplacements: [["同类项是字母相同相同", "同类项的字母相同"]],
  },
  "f6c662c469e7e62c70692b541c662e63": {
    solutionReplacements: [["也不能确定确定其它各边", "也不能确定其他各边"]],
  },
  "e05f290eae6c26cf7faa1c53dd772b3f": {
    solutionReplacements: [["根据条件建立建立反映", "根据条件建立反映"]],
  },
  "a6bbfed772bc500489603eb1cc5a2121": {
    solutionReplacements: [["单价单价$$y$$", "单价$$y$$"]],
  },
  "63b53cd88774a6ef636e6c5fb31f0161": {
    solutionReplacements: [["分式分式$$\\dfrac{x}{x+1}$$", "分式$$\\dfrac{x}{x+1}$$"]],
  },
  "744a7762f957e250bf47ba84a1373b42": {
    solutionReplacements: [["对各选项进行进行逐一分析", "对各选项逐一分析"]],
  },
  "5d238f3bf3981c0a9fd19b631a65dbdb": {
    solutionReplacements: [["对各选项进行进行逐一分析", "对各选项逐一分析"]],
  },
  "b2b12670a4697aa8851016d8714e18b1": {
    solutionReplacements: [["第三个月第三个月投放", "第三个月投放"]],
  },
  "687278ca7d54144788557a9cae4c4e89": {
    solutionReplacements: [["属于属于基础题", "属于基础题"]],
  },
  "03c9bd420247a7a3814e9b2e56bf86f5": {
    solutionReplacements: [["对于③：由于由于", "对于③：由于"]],
  },
  "a3cd7c466f92ea674b18c8e7fb372556": {
    solutionReplacements: [["分段函数函数值", "分段函数值"]],
  },
  "12eff2fe6337f6db09b0b7894ec489b1": {
    answerReplacements: [["的解析式的解析式", "的解析式"]],
  },
  "30439cd3331f22ad37a49beb2dd0387d": {
    title: "从5位男数学教师和4位女数学教师中选出3位，分别到3个不同的班担任班主任，要求选出的3位教师中男女教师都有，则不同的选派方案有（ ）",
    solution: "先从9位教师中选出3位并分配到3个不同班，共有$$A_9^3=9×8×7=504$$种。排除全为男教师的$$A_5^3=60$$种和全为女教师的$$A_4^3=24$$种，得到$$504-60-24=420$$种。因此选B。",
  },
  "8b2d7578b47c4c0c65972b29d797ff05": {
    solutionReplacements: [["进一步求出求出弦长", "进一步求出弦长"]],
  },
  "60c60be26b3d053d8290ddf1047f244a": {
    answer1Replacements: [["函数函数$$f(x)", "函数$$f(x)"]],
    answerReplacements: [["函数函数$$f(x)", "函数$$f(x)"]],
  },
  "d2f58c69a0c35ee82887c5cc6f3de8c3": {
    solutionReplacements: [["再根据函数函数y=", "再根据函数y="]],
  },
  "05a30028b1ccae779f5583a740603f20": {
    titleReplacements: [["等差数列数列", "等差数列"]],
    solutionReplacements: [["等差数列数列", "等差数列"]],
  },
  "5429aabe08fa445c1949b63fe265d7c5": {
    solutionReplacements: [["基础知识，考查考查数形结合思想", "基础知识，考查数形结合思想"]],
  },
  "f160323f0e128bd0ffced100d0528b96": {
    title: "一个长方体的长、宽、高分别为8米、6米、4米。它的前、后两个面的面积各是____平方米，左、右两个面的面积各是____平方米，上、下两个面的面积各是____平方米。",
    answer: "32平方米；24平方米；48平方米",
    solution: "长方体的前、后面都是长为8米、宽为4米的长方形，面积为8×4=32（平方米）；左、右面都是长为6米、宽为4米的长方形，面积为6×4=24（平方米）；上、下面都是长为8米、宽为6米的长方形，面积为8×6=48（平方米）。",
  },
  "3350435ee14d33f03b2c93d258fbdf23": {
    title: "一个正方体与一个长方体的棱长总和相等，则它们的体积相等。（判断对错）",
    answer: "×",
    solution: "棱长总和相等只能说明正方体的棱长与长方体的长、宽、高之和满足相应关系，不能保证体积相等。例如，棱长为2的正方体与长、宽、高分别为1、2、3的长方体，棱长总和都是24，但体积分别为8和6。因此题中说法错误。",
  },
  "e6ff6d9c1168165b52bf674bc0afa5de": {
    answer: "32平方厘米；0立方厘米",
    solution: "把长方体分成两个棱长为4厘米的正方体，会新增两个正方形切面，所以表面积增加4×4×2=32（平方厘米）。切割只改变物体的表面积，不改变总体积，因此总体积增加0立方厘米。",
  },
  "e1c5c23859f42c88cd00bb6a7a266791": {
    solution: "三个相同的正方体排成一列拼成长方体时，两个接合处各遮住两个面，所以长方体表面积相当于6×3-4=14个小正方形面的面积。每个面的面积为56÷14=4（平方厘米），小正方体棱长为2厘米。因此每个小正方体的表面积为4×6=24（平方厘米），体积为2×2×2=8（立方厘米）。",
  },
  "f175fda4efbf28a5e73bd06d40cd50ec": {
    solution: "沿与一个面平行的中间截面切开后，每个长方体的长、宽、高分别为10厘米、10厘米、5厘米。其体积为10×10×5=500（立方厘米），表面积为2×(10×10+10×5+10×5)=400（平方厘米）。",
  },

  "62f4cd9fd85c6aa5914c813d32f7dd3f": {
    solutionReplacements: [["、压缩体积压缩体积不能", "；压缩体积不能"]],
  },
  "454eb142d72c2c797694b9246cf7c716": {
    solutionReplacements: [["芳香油分子分子在", "芳香油分子在"]],
  },
  "b78d99e86cccf16adfa963cbd31228de": {
    answerReplacements: [["二倍焦距焦距", "二倍焦距"]],
  },
  "4629d1499f9c73a650c75999834d034b": {
    solutionReplacements: [["一节干电池的电压的电压", "一节干电池的电压"]],
  },
  "11b217454b01610d4832f720f6fc78b0": {
    solutionReplacements: [
      ["脉搏跳动一次的时间的时间", "脉搏跳动一次的时间"],
      ["所以要测出$$1$$分钟内脉搏跳动的时间，然后除以$$60s$$，即为脉搏跳动一次的时间", "所以可测出$$1$$分钟内脉搏跳动的次数，再用$$60s$$除以该次数，即可得到脉搏跳动一次的时间"],
    ],
  },
  "b99522fb7d2d318c477248325772e7d9": {
    answerReplacements: [["振幅是影响影响度的原因", "振幅是影响响度的因素"]],
  },
  "b354520a6bbb8a5da4dfb5032b0db08c": {
    solutionReplacements: [["开关和用电器之间之间", "开关和用电器之间"]],
  },
  "a2a6bf01f9892b5f1e28725c675e93d9": {
    title: "2015年10月5日，中国女科学家屠呦呦获得诺贝尔生理学或医学奖。她领导的团队从青蒿中提取青蒿素时，不用水煮而改用乙醚，这是因为乙醚的____较低（选填“凝固点”或“沸点”）。乙醚的凝固点为-114 ℃、沸点为35 ℃；乙醚沸腾后继续加热，其温度____升高（选填“会”或“不会”），从而避免高温破坏青蒿素的有效成分。提取过程中____使用酒精温度计测温（选填“能”或“不能”）；酒精的沸点为78 ℃。",
  },
  "a67acd766cc4034beb8b50803deb3f8b": {
    solutionReplacements: [
      ["玻璃棒会失去了电子时", "玻璃棒失去电子后", 2],
      ["验电器的验电器的制成原理", "验电器的制成原理"],
      ["丝绸摩擦这的玻璃棒", "丝绸摩擦过的玻璃棒"],
      ["橡胶棒带电。", "橡胶棒带负电。"],
    ],
  },
  "bdff20fdff23957cb9d09e15dd1c7b3d": {
    solutionReplacements: [["水汽化成为水蒸气水蒸气是看不见的", "水汽化成为水蒸气，水蒸气是看不见的"]],
  },
  "381510b1012e9d14480b9d12abe37b24": {
    optionReplacements: { option_b: [["带金属外壳的电气设备外壳的电气设备", "带金属外壳的电气设备"]] },
    answerReplacements: [["带金属外壳的电气设备外壳的电气设备", "带金属外壳的电气设备"]],
  },
  "b51e9151be2d8ca7728149d40dfa1bc4": {
    solutionReplacements: [["根据公式公式", "根据公式"]],
  },
  "ccebb055e07a26328aec1b3a5af31def": {
    solutionReplacements: [["同一位置释放释放小球", "同一位置释放小球"]],
  },
  "b0be525bd9d51844d24093942fcc25f0": {
    solutionReplacements: [["花香扑鼻说明分子的运动运动", "花香扑鼻说明分子不停地做无规则运动"]],
  },
  "a0a96e29f6afbfbedf7918d4effff6a4": {
    solutionReplacements: [["要求小球小球每次", "要求小球每次"]],
  },
  "88ff81823a67df89f6ec70c57a4cdefb": {
    answerReplacements: [["加速度是描述描述速度变化快慢", "加速度是描述速度变化快慢"]],
  },
  "eaee4285da807962335e25adc9936418": {
    titleReplacements: [["向东和向西分别分别沿水平方向", "向东和向西分别沿水平方向"]],
  },
  "73b450d8c85044b3c3136aa52ac78739": {
    solutionReplacements: [["本题物理物理学史", "本题考查物理学史"]],
  },
  "e677c37c74b6e1eb069c478ff2d79678": {
    solutionReplacements: [["两个直线运动的合运动的合加速度", "两个直线运动的合运动，其合加速度"]],
  },
  "93a7840c4573ccebe6f7bceb0bd7fe7a": {
    answerReplacements: [["叫做叫做元电荷", "叫做元电荷"]],
    solutionReplacements: [["叫做叫做元电荷", "叫做元电荷"]],
  },
  "ca95adf92cc4f7a6dad02a11e572cf36": {
    solutionReplacements: [["解：根据根据万有引力", "解：根据万有引力"]],
  },
  "613e64c37d419e5e11a11b78fd4976f9": {
    solutionReplacements: [["匀变速直线运动运动的速度公式", "匀变速直线运动的速度公式"]],
  },
  "f059d6de92299ee3fadb43986b849166": {
    answerReplacements: [["他的助手根据根据勒威耶", "他的助手根据勒威耶"]],
  },
  "42ba9235b13d398e541142b4591813a9": {
    solutionReplacements: [["是加速度的单位的单位", "是加速度的单位"]],
  },
  "2fc086a9d613472856cd307cc7470f5c": {
    answerReplacements: [["那几个力的合力合力", "那几个力的合力"]],
  },
  "fef358b53375a401737104c7aead939d": {
    optionReplacements: { option_d: [["利用离心离心现象", "利用离心现象"]] },
    answerReplacements: [["利用离心离心现象", "利用离心现象"]],
  },
  "071cd7be05254f03b80b962722ae8ba8": {
    answerReplacements: [["最大静摩擦力摩擦力越大", "最大静摩擦力越大"]],
  },
  "30e54a42c946095197f55290006413d0": {
    title: "“中新网湛江海安一月七日电（记者王辛莉）琼州海峡天堑变通途，百年梦想今成真。今天上午九点十五分，运载着火车车厢的粤海铁一号缓缓驶离广东湛江海安码头，经过约四十五分钟平稳的海上行驶，粤海铁一号于十时进入海南岛海口南港港池，十时十分到达港口停泊位。”这里九点十五分是____，四十五分钟是____（填“时间”或“时刻”）。",
  },
}));

let repaired = 0;
const unresolvedSolutions = [];
const seenRepairs = new Set();
for (const filename of SUBJECT_FILES) {
  const filepath = path.resolve("data", "zh-CN", filename);
  const questions = JSON.parse((await readFile(filepath, "utf8")).replace(/^\uFEFF/, ""));
  for (const question of questions) {
    const repair = repairs.get(question.id);
    if (repair) {
      const raw = question.question_info.raw_content;
      if (repair.type) question.type = repair.type;
      if (repair.title) raw.title = repair.title;
      if (repair.titleReplacements) raw.title = applyRequiredReplacements(raw.title, repair.titleReplacements, question.id, "title");
      if (repair.options) [raw.option_a, raw.option_b, raw.option_c, raw.option_d, raw.option_e] = repair.options;
      if (repair.optionReplacements) {
        for (const [option, replacements] of Object.entries(repair.optionReplacements)) {
          raw[option] = applyRequiredReplacements(raw[option], replacements, question.id, option);
        }
      }
      if (repair.answer1 !== undefined) raw.answer1 = repair.answer1;
      if (repair.answer1Replacements) {
        raw.answer1 = applyRequiredReplacements(raw.answer1, repair.answer1Replacements, question.id, "answer1");
      }
      if (repair.answer !== undefined) question.answer_info.raw_content = repair.answer;
      if (repair.answerReplacements) {
        question.answer_info.raw_content = applyRequiredReplacements(question.answer_info.raw_content, repair.answerReplacements, question.id, "answer");
      }
      if (repair.solution !== undefined) question.solution_info = [{ solution_info: repair.solution }];
      if (repair.solutionReplacements) {
        question.solution_info = (question.solution_info ?? []).map(({ solution_info }) => ({
          solution_info: applyRequiredReplacements(solution_info, repair.solutionReplacements, question.id, "solution"),
        }));
      }
      repaired += 1;
      seenRepairs.add(question.id);
    }
    const solutions = question.solution_info ?? [];
    const needsSolution = !solutions.some(({ solution_info }) => {
      const value = String(solution_info ?? "").trim();
      return value && !/^(?:略|无|暂无|暂无解析|答案略|解析略|见答案)[。.]?$/.test(value);
    });
    if (needsSolution) {
      unresolvedSolutions.push(`${filename}:${question.id}`);
    }
  }
  await writeFile(filepath, `${JSON.stringify(questions, null, 2)}\n`);
}

const missingRepairs = [...repairs.keys()].filter((id) => !seenRepairs.has(id));
if (missingRepairs.length) throw new Error(`Repair IDs not found: ${missingRepairs.join(", ")}`);
if (unresolvedSolutions.length) {
  throw new Error(`Questions still need substantive solutions: ${unresolvedSolutions.join(", ")}`);
}
console.log(JSON.stringify({ explicitRepairs: repaired, unresolvedSolutions: 0 }, null, 2));
