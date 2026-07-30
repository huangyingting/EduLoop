import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const SUBJECT_FILES = ["biology.json", "chemistry.json", "mathematics.json", "physics.json"];

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
}));

function directLabels(value) {
  const cleaned = String(value ?? "").replace(/\$|\\rm|[{}（）()\[\]]/g, " ").trim().toUpperCase();
  const match = cleaned.match(/^(?:答案?[：:\s]*)?([A-E](?:[\s,，、;；|]*[A-E])*)[.。．]?$/);
  return match ? [...new Set(match[1].match(/[A-E]/g) ?? [])].sort() : [];
}

function fallbackSolution(question) {
  const raw = question.question_info.raw_content;
  const answer = String(question.answer_info.raw_content ?? "").trim();
  if (answer.length > 12 && !/^(?:【答案】)?\s*[A-E](?:[|、,，\s]*[A-E])*[。.]?$/.test(answer)) {
    return answer.replace(/^【答案】\s*/, "");
  }
  const labels = directLabels(raw.answer1).length ? directLabels(raw.answer1) : directLabels(answer);
  const options = [raw.option_a, raw.option_b, raw.option_c, raw.option_d, raw.option_e];
  if (labels.length && labels.every((label) => options[label.charCodeAt(0) - 65])) {
    const selected = labels.map((label) => `${label}：“${options[label.charCodeAt(0) - 65]}”`).join("；");
    return `依据题干条件逐项判断，符合条件的是${selected}，因此答案为${labels.join("、")}。`;
  }
  return `根据题目条件可得：${answer.replace(/^【答案】\s*/, "")}。`;
}

let repaired = 0;
let filledSolutions = 0;
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
      if (repair.options) [raw.option_a, raw.option_b, raw.option_c, raw.option_d, raw.option_e] = repair.options;
      if (repair.answer1 !== undefined) raw.answer1 = repair.answer1;
      if (repair.answer !== undefined) question.answer_info.raw_content = repair.answer;
      if (repair.solution !== undefined) question.solution_info = [{ solution_info: repair.solution }];
      repaired += 1;
      seenRepairs.add(question.id);
    }
    const solutions = question.solution_info ?? [];
    const needsSolution = !solutions.some(({ solution_info }) => {
      const value = String(solution_info ?? "").trim();
      return value && !/^(?:略|无|暂无|暂无解析|答案略|解析略)[。.]?$/.test(value);
    });
    if (needsSolution) {
      question.solution_info = [{ solution_info: fallbackSolution(question) }];
      filledSolutions += 1;
    }
  }
  await writeFile(filepath, `${JSON.stringify(questions, null, 2)}\n`);
}

const missingRepairs = [...repairs.keys()].filter((id) => !seenRepairs.has(id));
if (missingRepairs.length) throw new Error(`Repair IDs not found: ${missingRepairs.join(", ")}`);
console.log(JSON.stringify({ explicitRepairs: repaired, filledSolutions }, null, 2));
