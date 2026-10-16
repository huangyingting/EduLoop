import { createHash } from "node:crypto";

export const AGIEVAL_COMMIT = "84ab72d94318290aad2e4ec820d535a95a1f7552";
export const AGIEVAL_SOURCE_PATH = "data/v1_1/gaokao-chinese.jsonl";
export const AGIEVAL_SOURCE_SHA256 = "1ddcf8fa15e07a25589796dc1c72a341c2d874af8de41970262d66693f95285f";
export const AGIEVAL_SOURCE_COUNT = 246;
export const AGIEVAL_OUTPUT_COUNT = 213;

export const AGIEVAL_AUTHORITATIVE_YANZI_PASSAGE = `晏子之晋，至中牟，睹弊冠反裘负刍，息于涂侧者，以为君子也。使人问焉，曰：“子何为者也？”对曰：“我越石父者也。”晏子曰：“何为至此？”曰：“吾为人臣，仆于中牟，见使将归。”晏子曰：“何为为仆？”对曰：“不免冻饿之切吾身，是以为仆也。”晏子曰：“为仆几何？”对曰：“三年矣。”晏子曰：“可得赎乎？”对曰：“可。”遂解左骖以赠①之，因载而与之俱归。

至舍，不辞而入，越石父怒而请绝，晏子使人应之曰：“吾未尝得交夫子也，子为仆三年，吾乃今日睹而赎之，吾于子尚未可乎？子何绝我之暴也。”

越石父对之曰：“臣闻之，士者诎乎不知己，而申乎知己，故君子不以功轻人之身，不为彼功诎身之理。吾三年为人臣仆，而莫吾知也。今子赎我，吾以子为知我矣；向者子乘，不我辞也，吾以子为忘；今又不辞而入，是与臣我者同矣。我犹且为臣，请鬻于世。”

晏子出，见之曰：“向者见客之容，而今也见客之意。婴闻之，省行者不引其过，察实者不讥其辞，婴可以辞而无弃乎！婴诚革之。”乃令粪洒②改席，尊醮③而礼之。

越石父曰：“吾闻之，至恭不修途，尊礼不受摈④。夫子之礼，仆不敢当也。”晏子遂以为上客。

君子曰：“俗人之有功则德，德则骄，晏子有功，免人于厄，而反诎下之，其去俗亦远矣。此全功之道也。”（选自《晏子春秋》）

【注】①赠：一作“赎”。②粪洒：扫除清洗。③醮：古代嘉礼中的一种礼节。④摈：通“傧”，傧相。`;

export const AGIEVAL_2019_VOLUNTEER_PASSAGE = `材料一：2008北京奥运会、残奥会将中国志愿服务活动推向一个新的发展阶段。这批被誉为“鸟巢一代”的奥运志愿者通过积极参与和真诚奉献，在奥运会的平台上展现、锻炼和成就了自己，奥运会服务经历给“鸟巢一代”志愿者烙下了深深的印记，可以发现，奥运志愿服务的实践产生了一种共同的精神素养，志愿者分享的回忆背后所蕴含的价值取向与我国倡导的“爱国”“敬业”“诚信”“友善”等社会主义核心价值观有着较高的契合。他们积极投身奥运这一全球性的体育文化盛典，充满了对国家的热爱和认同，展现出这代人的社会担当和国际视野。因此，奥运志愿服务集体记忆可以作为潜在的精神遗产和志愿遗产，集体记忆的建构将对北京2022冬奥会有所助益。（摘编自王艳等《“鸟巢一代”奥运志愿服务集体记忆与奥运遗产》） 材料二：国务院印发的《中长期青年发展规划（2016～2025年）》强调提升青年志愿服务水平、促进青少年的社会融入和社会参与，中国体育志愿服务事业在冬奥背景下的健全与发展将为青少年社会参与提供实现路径。志愿服务是一种利他行为，是以不求物质回报为前提地为他人、社会团体或某项事业，乃至为整个社会提供援助。近年来学者们逐渐构建了以讨论志愿者行为动机为主的解释范式，比如人们可能因表达个人价值、增强自身意义、增长职业技能和强化人际关系等方面来进行志愿服务。志愿者的参与动机之所以重要，就在于志愿服务不能简单地局限在无私奉献的框架内，志愿服务对于志愿者的自我成长和公民参与社会建设也有重要意义。志愿服务的最终目的是在全体社会成员的心中内化志愿精神，形成一种面对社会、面向人生的个体态度和公民意识，在这种层面上，志愿服务所谓“推动人类发展和促进社会进步”的价值才得以彰显。（摘编自李佳宝等《论冬奥背景下体育志愿服务与青少年社会参与》）材料三：近两年，共享单车成为市民出行的新宠。然而，在共享单车发展正盛的同时，违规停车、私自上锁、丢弃及破坏单车的现象也屡见不鲜。为了规范使用，共享单车公司也尝试采取一些措施，除了运营人员加强维护之外，公司官方平台也会以信用分奖惩的方式来鼓励使用者对违规行为进行举报，以此规范共享单车的使用。随着举报反馈机制的建立，在城市中涌现出一群单车猎人，他们是共享单车的使用者，在业余时间他们也会寻找并拍照举报那些破坏共享单车正常使用秩序的行为，并将违规使用的单车搬到公共区域停放以维护共享秩序，他们将此称为“打猎”。在自发参与共享单车秩序维护的过程中，单车猎人的这一行为也逐渐体现出在消费社会中使用者自下而上地参与社会治理的特点。作为消费者的单车猎人也逐渐体现出一定的公民意识，他们参与治理并形成网络时代促进共享单车健康发展的新力量。（摘编自许金凤等《卷入的消费者一一以摩族猎人为例》）`;

export const AGIEVAL_2020_TIANJIN_PASSAGE = `材料一：阅读是人类特有的活动。在阅读方面，人类与动物并不是全无关联。动物能否看懂环境，往往决定着它能否安全地生存下去。人既要阅读作为客观世界的环境，也要阅读以符号为中介的书籍。当人越来越多地阅读书籍的时候，人对客观自然环境或环境的阅读也发生了变化。这就是说，人在“看”自然、“看”其他存在物、“看”其他人时，已经带着自身有价值取向的意义和理解结构去“看”客观世界了。阅读就是一个通过编码符号进行的意义再生成过程。通过阅读，我们可以与几千年之前的老子、孔子的思想世界联系起来，也可以与远在欧美的哈贝马斯、罗尔斯的精神世界联系起来。有了这两个维度的精神联系，我们每个人的精神世界都得以丰富起来。（取材于韩震《阅读的本质》）

材料二：2019年，我国成年国民中，11.1%的国民阅读10本及以上纸质图书，此外还有7.6%的国民阅读10本及以上电子书。2019年我国成年国民人均纸质书报刊和电子书阅读量：纸质图书4.65本，电子书2.84本，报纸16.33期（份），期刊2.33期（份）。（取材于刘彬《第十七次全国国民阅读调查报告发布》）

材料三：千百年来，书籍都是人类文化的标志，是发达文明的象征。然而，互联网的出现正影响着人类的生活方式和思维模式，纸质书的未来正愈发显得不那么确定。还有什么能阻止书籍的数字化进程？是人类的情感，还是书籍超越文本载体的价值所在？上世纪后期，唐·麦肯齐提出的“文本社会学”理论认为，承载文本的物质形式（书）会影响到文本所要传达的意义。许多当代学者不再只是关心书页上的文字，而开始关注书籍作为一个整体的重要性，包括封面、字体、配图等书籍的各个要素。如果按照时间顺序将同一文本的不同版本的封面进行排列，我们就会发现，公众对文本及作者的文化取向和态度一直在不断地变化。印刷字体和封面一样，能够代表书籍所处的时代。不断翻新的技术使在书内大批量印刷图像成为可能，同时也为书籍打上时代的烙印。机械印刷技术的发展使得同一版本的书与书之间几乎没有区别。然而随着时间的推移，不同的读者或收藏家会在书上留下自己的印记，从那些标记、批注或藏书票中，我们可以分析读者和文本之间的私密关系，也可以了解一本书可能产生的时代影响。一篇文稿从编辑到付印是一个极其复杂的过程，任何差错以及随之而来的修正，都可能带来某一版本书籍的个体多样性。从中，我们可以看出作者的意图改变，或可以窥见时局的风向变更。纸质书的装帧过程也给后人留下了意想不到的遗产。在一本1630年左右的书籍装帧中，人们发现了17世纪早期一位书商的记录，其中提到莎士比亚的另一出剧作《爱的功劳》。早有学者提出过莎翁曾写过对应《爱的徒劳》的另一剧本，这个发现显然为这种观点提供了证据。“书籍成为历史”的说法是悲观的，但“历史”的含义同样也是积极的，它让人们认识到书籍是人类历史文化遗产的一部分，拥有值得保护和诠释的丰富意义。（取材于陆纡文《数字化时代，我们如何解读纸质书的价值》）`;

export const AGIEVAL_2018_BOOK_MARKET_PASSAGE = `材料一：“十二五”期间，党和国家高度重视图书出版产业的发展，先后出台了多项法律法规与扶持政策，为实体书店和网店的发展提供了良好的环境。随着全民阅读的深入推进和数字技术的广泛应用，各类出版社为加快产业升级，纷纷借助已有的数字出版部门，实现网络技术和图书出版的融合发展，拉近了出版业与市场的距离。在互联网快速发展的背景下，除了传统纸质图书销售外，电子图书的销售、图书版权产生的间接利润、图书作为传播平台产生的广告效益等，都为图书出版业带来了新的增值空间。（摘编自《中国新闻出版广电报》）

材料二：2010～2015年中国图书零售市场主要有实体书店和网店两大渠道。图1显示，实体书店渠道市场码洋规模2010年为309亿元（年度增长率5.82%），2011年为327亿元（5.83%），2012年为323亿元（-1.22%），2013年为319亿元（-1.24%），2014年回暖至332亿元（3.94%），2015年达到344亿元（0.29%），经历了“增速下降—负增长—销售回暖”的过程。图2显示，网店渠道市场码洋规模2010年为60亿元（年度增长率76.47%），2011年为82亿元（36.67%），2012年为119亿元（45.12%），2013年为161亿元（35.29%），2014年为212亿元（31.68%），2015年达到280亿元（32.08%），保持高速增长。（摘编自开卷《2015年中国图书零售市场报告》）

材料三：面对网络渠道的冲击，全国各地新建或改造的大型书城正逐步向文化购物中心转型，通过融合阅读、咖啡、文创、展演等多元业态吸引读者，但这种复合经营业态仍在探索推进之中，尚未成为整个实体书店行业的主流。（摘编自《光明日报》）`;

export const AGIEVAL_2017_MUSEUM_PASSAGE = `材料一：随着社会经济发展和人民精神文化生活需求的日益多样化，博物馆服务于社会建设的格局发生了重大变化，博物馆收藏、展示的文化遗产资源多渠道、多层次、多形式地为社会公众所共享，在“讲好中国故事，传播好中国声音”上发挥着举足轻重的作用。博物馆接待参观人次，从2001年的7955万人次增长到2014年的7.2亿人次，13年间增长了8倍。对于青少年而言，博物馆逐渐成为学校教育之外的“第二课堂”，在互动性、体验性、趣味性方面发挥着独特的优势。2014年，全国博物馆拥有近3000万件（套）藏品，依托这些藏品在历史、文化、考古等领域开展了大量的科研活动，科研成果也非常丰富。针对藏品的研究，需要整合学校和研究机构的学者、教师，因此博物馆往往会成为一个地区的文史研究中心。同时，博物馆逐渐成为展示城市独特历史文化、提升城市文化品牌价值的重要载体。2010年，西安市委、市政府正式提出把西安建设成“博物馆之城”的战略目标，随后广州、济南等城市也纷纷提出建设“博物馆之城”的口号，以此提升城市的竞争力。（摘编自刘世锦主编《中国文化遗产事业发展报告（2014）》）

材料二：2008年起，中国文化文物系统的博物馆开始全面免费开放，此后博物馆的直接经济贡献逐渐减弱。因此，只能通过博物馆事业增加值来衡量博物馆对国民经济的直接贡献。博物馆事业增加值即文化文物系统内的博物馆向社会提供产品或服务（如文化创意产品销售、文物巡展、社会文物鉴定及咨询等）而增加的价值总和。2001～2014年全国博物馆事业增加值变化情况：按当年价格计算与按2001年可比价格计算的增加值最低年份均为2001年（9.6亿元），最高年份均为2014年（当年价格57.9亿元、可比价格42.2亿元，二者差距最大）；十几年间大体保持较好增长势头，但2003年（较2002年有所减少）和2007年（较2006年有所减少）两个年份的增加值较前一年有所下降，其余年份均呈现上升态势。（摘编自苏杨等主编《中国文化遗产事业发展报告（2015～2016）》）
【注】计算或比较不同时期的经济数据时，用某一时期产品的平均价值作为固定的计算尺度，这种平均价格叫可比价格。可比价格计算出的指标，可以消除价格变动因素的影响，便于对不同时期进行历史对比，以观察国民经济的发展情况。

材料三：要真正了解或融入一个城市与国家，最直接也是最重要的途径就是参观博物馆。北京每年接待的上亿游客中，相当一部分要参观北京的博物馆。博物馆对于旅游经济的拉动难以用数字衡量，它更多的是一种潜移默化的宣传和教育作用。通过品牌价值的提升和精神核心的建立，实现对旅游经济的长远影响，这也是博物馆对国民经济的间接贡献。（摘编自王小润等《博物馆能否成为旅游经济新坐标》）`;

export const AGIEVAL_2018_MOZI_PASSAGE = `材料一：日前，中国科学院在京召开新闻发布会对外宣布，“墨子号”量子科学实验卫星提前并圆满实现全部既定科学目标，为我国在未来继续引领世界量子通信研究奠定了坚实的基础。量子通信主要研究内容包括量子密钥分发和量子隐形传态。量子密钥分发通过量子态的传输，使遥远两地的用户可以共享无条件安全的密钥，利用该密钥对信息进行一次一密的严格加密。这是目前人类唯一已知的不可窃听、不可破译的无条件安全的通信方式。量子通信的另一重要内容量子隐形传态，是利用量子纠缠特性，将物质的未知量子态精确传递到遥远地点，而不用传递物质本身，通过隐形传输实现信息传递。（摘编自吴月辉《“墨子号”，抢占量子科技创新制高点》，《人民日报》2017年8月10日）

材料二：潘建伟的导师安东·蔡林格说，潘建伟的团队在量子互联网的发展方面冲到了领先地位。量子互联网是由卫星和地面设备构成的能够在全球范围分享量子信息的网络。这将使不可破解的全球加密通信成为可能，同时也使我们可以开展一些新的控制远距离量子联系的实验。目前，潘建伟的团队计划发射第二颗卫星，他们还在中国的天宫二号空间站上进行着一项太空量子实验。潘建伟说，未来五年“还会取得很多精彩的成果，一个新的时代已经到来”。潘建伟是一个有着无穷热情的乐观主义者。他低调地表达了自己的信心，称中国政府将会支持下一个宏伟计划——一项投资20亿美元的量子通信、量子计量和量子计算的五年计划，与此形成对照的是欧洲2016年宣布的旗舰项目，投资额为12亿美元。（摘编自伊丽莎白·吉布尼《一位把量子通信带到太空又带回地球的物理学家》，《自然》2017年12月）

材料三：日本《读卖新闻》5月2日报道：在中国南部广东省东莞市郊外的丘陵地带，中国刚刚建成了大型实验设施“中国散裂中子源”，该实验设施建设费用达到23亿元人民币，3月正式投入运行。中国是继美国、英国、日本之后第四个拥有同样设施的国家。日本的J-PARC加速器设施中心主任齐藤直人说：“虽然日本在技术和经验上领先，但中国发展得实在太快了，亚洲的中心正在从日本向中国转移。”使用人造卫星的实验要耗费巨额资金，欧洲和日本还在犹豫不决。日本的研究人员认为，“在基础科学领域，中国正在跨入他国难以涉足的领域，领先世界”。（摘编自《参考消息》2018年5月7日）`;

export const AGIEVAL_2018_DAYANG_PASSAGE = `“大洋一号”是中国第一艘现代化的综合性远洋科学考察船。自1995年以来，这艘船经历了大洋矿产资源研究开发专项的多个远洋调查航次和大陆架勘查多个航次的任务。今年，它又完成了历时45天、航程6208海里的综合海试任务。对不熟悉的人而言，（ ）。在这里，重力和ADCP实验室、磁力实验室、地震实验室、综合电子实验室、地质实验室、生物基因实验室、深拖和超短基线实验室等各种实验室________，分布在第三、四层船舱。由于船上配备了很多先进设备，人不用下水就能进行海底勘探。比如，深海可视采样系统可以将海底微地形地貌图像传到科学考察船上，犹如有了千里眼，海底世界可以________，并可根据需要________地抓取海底表面的岩石样品和采集海底水样；深海浅层岩芯取样钻机可以在深海底比较坚硬的岩石上钻取岩芯。

“大洋一号”的远航活动，与郑和下西洋相呼应。600年前，伟大的航海家郑和七下西洋，在世界航海史上留下了光辉的一页。600年后，“大洋一号”不断进步，在《联合国海洋法公约》的法律框架下，探索海洋奥秘，开发海洋资源，以实际行动为人类和平利用海洋作出了中国人民的贡献。`;

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
  [
    28,
    {
      sourceSha256: "c5a9d07128b0c7c3ff896be1fbe6f85f51449ae8741d25441e49757216826d94",
      note: "修正2017年山东卷《谈审美移情》第1题原文OCR错字“最早吧移情”",
      passageReplacements: [["最早吧移情", "最早把移情"]],
    },
  ],
  [
    29,
    {
      sourceSha256: "4e4bd34b0a6f27f701473731514f9f67f93c338d30229f016817b7b508aab4a1",
      note: "修正2017年山东卷《谈审美移情》第2题原文与D项OCR错字",
      passageReplacements: [["最早吧移情", "最早把移情"]],
      optionReplacements: [["让自我的必灵丰富化", "让自我的心灵丰富化"]],
    },
  ],
  [
    30,
    {
      sourceSha256: "617e7af578b2057d65c662d3171d9ddc8240db648420dc6c47a46a47cdb35253",
      note: "修正2017年山东卷《谈审美移情》第3题原文与D项OCR错字",
      passageReplacements: [["最早吧移情", "最早把移情"]],
      optionReplacements: [["此时主题的情感", "此时主体的情感"]],
    },
  ],
  [
    69,
    {
      sourceSha256: "9bf6dfc85b1e133237e30f467b160a4d672b3d9ba7571872a249e4969b4e7bf8",
      note: "修正2019年全国卷III《论传统表演艺术的保护与传承》第1题原文与选项OCR错漏字",
      passageReplacements: [
        ["資源", "资源"],
        ["非质文化遗产", "非物质文化遗产"],
        ["两不仅局限于艺水团体", "而不应仅局限于艺术团体"],
        ["各类民间表演艺术过充分提炼", "各类民间表演艺术经过充分提炼"],
        ["《飞弦路春》", "《飞弦踏春》"],
        ["画方音乐", "西方音乐"],
        ["才特合", "才符合"],
        ["規律", "规律"],
      ],
      optionReplacements: [
        ["台舞改编", "舞台改编"],
        ["应当免西式改编", "应当避免西式改编"],
      ],
    },
  ],
  [
    70,
    {
      sourceSha256: "4e04b9d725e282922c6dac1f2c8d8580d04d43239f0ed23ef6dd9c38f1c04609",
      note: "依据2019年全国卷III（四川卷同卷）补全“志愿服务”实用类文本三则材料并修正OCR错字",
      passage: AGIEVAL_2019_VOLUNTEER_PASSAGE,
    },
  ],
  [
    71,
    {
      sourceSha256: "29219024f658471b0761c1fe972c8baf5692938f1a361a4aef5d2bc13907b5f3",
      note: "依据2019年全国卷III（四川卷同卷）补全“志愿服务”实用类文本三则材料并修正OCR错字",
      passage: AGIEVAL_2019_VOLUNTEER_PASSAGE,
    },
  ],
  [
    73,
    {
      sourceSha256: "dc66082329e0d489a409e5abc4a07ecaa4d605484d73cc69bcea97e2b2dcb9d1",
      note: "修正2019年全国卷III《孙子吴起列传》文化常识题B项OCR错字“暴殓酷刑”",
      optionReplacements: [["暴殓酷刑", "暴敛酷刑"]],
    },
  ],
  [
    75,
    {
      sourceSha256: "1daad6aa21576cbdfc023b80c8bca3dda758e05257da315cbe4ed3f0ebe56bd7",
      note: "修正2019年全国卷III《插田歌》赏析题C项OCR错字“白裙绿水”",
      optionReplacements: [["白裙绿水", "白裙绿衣"]],
    },
  ],
  [
    76,
    {
      sourceSha256: "798b0914169ff96b41969808aaa7c86ee20ff0df33c0163ee58f7430a5835b66",
      note: "修正2019年全国卷III“嫦娥四号”语言文字运用题OCR错字",
      passageReplacements: [
        ["欲求背面", "月球背面"],
        ["有一个人类“第一次”", "又一个人类“第一次”"],
      ],
    },
  ],
  [
    80,
    {
      sourceSha256: "664a773236adb52825aca6fe2845fe1c1f108441c8158a0c40555a62620a7942",
      note: "修正2020年全国卷III《钟南山：苍生在上》访谈第1题原文OCR重字“弃弃文从戎”",
      passageReplacements: [["弃弃文从戎", "弃文从戎"]],
    },
  ],
  [
    81,
    {
      sourceSha256: "1a15157e9720aa28f0e3a0d31d746127e145144a302b3a54e2f4194f737799ae",
      note: "修正2020年全国卷III《钟南山：苍生在上》访谈第2题原文OCR重字“弃弃文从戎”",
      passageReplacements: [["弃弃文从戎", "弃文从戎"]],
    },
  ],
  [
    84,
    {
      sourceSha256: "ac91d29b0f4f9038638f340979ed92b6379b70dca557bb1478ad04ca412566e7",
      note: "修正2020年全国卷III《晋书·王彪之传》文言概括题A项OCR错字“军师”",
      optionReplacements: [["军师", "军事"]],
    },
  ],
  [
    86,
    {
      sourceSha256: "5057eb11e9d2ca13ba77f0f5855774145439c327d11e815e241e4e1bbd5dd1c7",
      note: "补全2020年全国卷III陆游《苦笋》诗句缺失的注释标号①②",
      passageReplacements: [
        ["藜藿盘中忽眼明，", "藜藿盘中忽眼明①，"],
        ["我见魏征殊媚妩，", "我见魏征殊媚妩②，"],
      ],
    },
  ],
  [
    98,
    {
      sourceSha256: "dbd5faccc2e0bb026576884d325cecc65d50a1c3253f33e0ba23daffe3fdd609",
      note: "修正2021年全国乙卷“家常菜”语段OCR错字",
      passageReplacements: [
        ["“家常莱”", "“家常菜”"],
        ["烹任", "烹饪"],
        ["烧莱做饭", "烧菜做饭"],
      ],
    },
  ],
  [
    99,
    {
      sourceSha256: "e518ef315c61785ab4101d15cc77df6ee22e174fe27d60c259264504a219dca9",
      note: "修正2021年全国乙卷“家常菜”语段OCR错字",
      passageReplacements: [
        ["“家常莱”", "“家常菜”"],
        ["烹任", "烹饪"],
        ["烧莱做饭", "烧菜做饭"],
      ],
    },
  ],
  [
    100,
    {
      sourceSha256: "140d71bf1c8c11cdcc24388e1bc61557729dbb112d1868cfb299e0bd45cf0df5",
      note: "修正2021年全国乙卷“家常菜”语段OCR错字",
      passageReplacements: [
        ["“家常莱”", "“家常菜”"],
        ["烹任", "烹饪"],
        ["烧莱做饭", "烧菜做饭"],
      ],
    },
  ],
  [
    110,
    {
      sourceSha256: "d1d9423abe502ba612fe1f78c4939ec7b1c2cf972ba8963638884506d503756b",
      note: "修正2009年山东卷词语运用题选项OCR错字",
      optionReplacements: [
        ["提体供", "提供"],
        ["出得靠人", "还得靠人"],
        ["一挥而就", "一蹴而就"],
      ],
    },
  ],
  [
    121,
    {
      sourceSha256: "2847d4d71e9d255f586f3920113aedb9dacf3607b3ebcfd66a0b6823d132b762",
      note: "依据2020年天津市高考语文真题补全非连续性文本阅读材料二与材料三并修正OCR错字",
      passage: AGIEVAL_2020_TIANJIN_PASSAGE,
    },
  ],
  [
    122,
    {
      sourceSha256: "a57e52c2e10a4951415ad5088ba8d60caae8d6072b30363b9392b90ef3a3aaa0",
      note: "依据2020年天津市高考语文真题补全非连续性文本阅读材料二与材料三并修正题干漏字",
      passage: AGIEVAL_2020_TIANJIN_PASSAGE,
      question: "根据以上三则材料，下列理解正确的一项是（   ）",
    },
  ],
  [
    123,
    {
      sourceSha256: "4a1e9a8eb1a78630f1f3c7b439f79a773676cafdd00e7ba821f0156895cb8772",
      note: "依据2020年天津市高考语文真题补全非连续性文本阅读材料二与材料三并修正选项OCR错字",
      passage: AGIEVAL_2020_TIANJIN_PASSAGE,
      optionReplacements: [
        ["歇、颜字体", "欧、颜字体"],
        ["时代格印", "时代烙印"],
      ],
    },
  ],
  [
    145,
    {
      sourceSha256: "1f8815e1998766255afa21dcd731fb1a52ac44c716f5595016ed0737fd9c4df6",
      note: "修正2020年全国卷III（四川卷）陆游《苦笋》标题后冗余句号",
      passageReplacements: [["苦笋。陆游。", "苦笋  陆游。"]],
    },
  ],
  [
    159,
    {
      sourceSha256: "9847407daf014b6f5d8c98c773bda4698bb736628c6c3490af2671f8218983ad",
      note: "依据2018年全国卷III（四川卷）实用类文本阅读真题补全中国图书零售市场三则材料",
      passage: AGIEVAL_2018_BOOK_MARKET_PASSAGE,
    },
  ],
  [
    160,
    {
      sourceSha256: "a158f090ec2e1cb9b0df8147c05f6878f49fa8122d674fe9c6998b9494af424c",
      note: "依据2018年全国卷III（四川卷）实用类文本阅读真题补全中国图书零售市场三则材料",
      passage: AGIEVAL_2018_BOOK_MARKET_PASSAGE,
    },
  ],
  [
    167,
    {
      sourceSha256: "96757406f938ebb88db6afbc31241861265a16e14259e4e82829b4162576c12d",
      note: "修正2019年全国卷III（四川卷）《论传统表演艺术的保护与传承》第1题原文与选项OCR错漏字",
      passageReplacements: [
        ["資源", "资源"],
        ["非质文化遗产", "非物质文化遗产"],
        ["各类民间表演艺术过充分提炼", "各类民间表演艺术经过充分提炼"],
        ["《飞弦路春》", "《飞弦踏春》"],
        ["才特合", "才符合"],
        ["規律", "规律"],
      ],
      optionReplacements: [
        ["台舞改编", "舞台改编"],
        ["应当免西式改编", "应当避免西式改编"],
      ],
    },
  ],
  [
    168,
    {
      sourceSha256: "eb77567a902ed3cd3cf147af892ab0a77ce28dd9523cf4cf66397e37f33ca936",
      note: "修正2019年全国卷III（四川卷）《论传统表演艺术的保护与传承》第2题原文OCR错字",
      passageReplacements: [
        ["資源", "资源"],
        ["非质文化遗产", "非物质文化遗产"],
        ["各类民间表演艺术过充分提炼", "各类民间表演艺术经过充分提炼"],
        ["《飞弦路春》", "《飞弦踏春》"],
        ["才特合", "才符合"],
        ["規律", "规律"],
      ],
    },
  ],
  [
    169,
    {
      sourceSha256: "4a00af3182fffd0e764dd76ebede2fc477590d9087fa9685eb5f38f9da43f4f7",
      note: "修正2019年全国卷III（四川卷）《论传统表演艺术的保护与传承》第3题原文OCR错字",
      passageReplacements: [
        ["資源", "资源"],
        ["非质文化遗产", "非物质文化遗产"],
        ["各类民间表演艺术过充分提炼", "各类民间表演艺术经过充分提炼"],
        ["《飞弦路春》", "《飞弦踏春》"],
        ["才特合", "才符合"],
        ["規律", "规律"],
      ],
    },
  ],
  [
    170,
    {
      sourceSha256: "59e3e0324440930a7139244cc091a777cb964b64e439982ab85e225cf9dcaa9b",
      note: "修正2019年全国卷III（四川卷）“志愿服务”材料二OCR错字",
      passageReplacements: [
        ["增长取业技能", "增长职业技能"],
        ["价值オ得以彰显", "价值才得以彰显"],
      ],
    },
  ],
  [
    171,
    {
      sourceSha256: "3e04cf839ebce145ccdfda5f30fbb439f73819baf3891d592edb10b3a853a49c",
      note: "修正2019年全国卷III（四川卷）“志愿服务”材料二OCR错字",
      passageReplacements: [
        ["增长取业技能", "增长职业技能"],
        ["价值オ得以彰显", "价值才得以彰显"],
      ],
    },
  ],
  [
    174,
    {
      sourceSha256: "c9b5c27738059cdbf4da56695bf12eaa5672185f172e354a27a468f232bb7b96",
      note: "修正2019年全国卷III（四川卷）《孙子吴起列传》文化常识题B、C项OCR错漏字",
      passageReplacements: [["谢吴起吴起于是", "谢吴起 吴起于是"]],
      optionReplacements: [
        ["暴殓酷刑", "暴敛酷刑"],
        ["战国时期韩、赵、燕三国", "战国时期的韩、赵、燕三国"],
      ],
    },
  ],
  [
    191,
    {
      sourceSha256: "daffe4dc8d06a569db2e2579b88af86f9c9c2c4a3ea31fd1285acd91c06dd96f",
      note: "依据2017年全国卷III（四川卷）实用类文本阅读真题补全博物馆事业增加值材料二与材料三",
      passage: AGIEVAL_2017_MUSEUM_PASSAGE,
    },
  ],
  [
    215,
    {
      sourceSha256: "c86ccc21e9e8d8f36773b028eaadbe6e2bcdfedd65adab1a3262889f303381c9",
      note: "修正2020年福建卷（全国卷I）篆刻语段与题干OCR错字",
      passageReplacements: [["艺木家", "艺术家"]],
      question: "依次填入文中横线上的词语，全部恰当的一项是（   ）",
    },
  ],
  [
    216,
    {
      sourceSha256: "61dc710def12980b2856ae454ac48ab41707cc9519e4ac557abf1b2687fcf819",
      note: "修正2020年福建卷（全国卷I）篆刻语段OCR错字",
      passageReplacements: [["艺木家", "艺术家"]],
    },
  ],
  [
    217,
    {
      sourceSha256: "6be2cacafb5f063e11010b085540b75b9df8323ba6a223f4c7e9aa6b7cb40148",
      note: "修正2020年福建卷（全国卷I）篆刻语段OCR错字",
      passageReplacements: [["艺木家", "艺术家"]],
    },
  ],
  [
    222,
    {
      sourceSha256: "2b3ac8a8892293b243b7ca5feead95583a30d0142175b2524dc8303aad9ac4fc",
      note: "依据2018年全国卷I（福建卷）实用类文本阅读真题还原被第7题选项误替的材料三并修正材料一OCR错字",
      passage: AGIEVAL_2018_MOZI_PASSAGE,
    },
  ],
  [
    224,
    {
      sourceSha256: "7e2213c8a87f2de1be12eca98222c8446ed89c3c5ed21712499d32c3768505f1",
      note: "依据2018年全国卷I（福建卷）“大洋一号”语言文字运用真题补全含括号补写处的首段",
      passage: AGIEVAL_2018_DAYANG_PASSAGE,
    },
  ],
  [
    225,
    {
      sourceSha256: "a5d7617b03ad01e04bfbadf0ec66f830c7055edb66225fc2ef4c89df2a7334ed",
      note: "依据2008年福建省高考语文真题《民间艺术与民俗生活》修复被下题覆盖的C、D选项及原文OCR错字",
      passageReplacements: [
        ["变逆", "变迁"],
        ["愿有", "原有"],
        ["往流行", "很流行"],
        ["情杯", "情怀"],
        ["脱象", "现象"],
        ["根粒于", "植根于"],
      ],
      options: [
        "(A)民间艺术的创作主体是广大民众，它能直接反映民众的审美情趣，这是民间艺术之所以质朴、醇厚的重要原因。",
        "(B)民间艺术的鲜明特征之一是它具有浓郁的民俗色彩，离开民俗就谈不上民间艺术。",
        "(C)民间艺术和民俗生活息息相关，一位远离民俗生活的艺术家是永远创作不出优秀的民间艺术作品的。",
        "(D)民间艺术的产生与发展总是与当时的民俗生活相适应的，因此，我们不能离开特定时代的民俗生活去评价民间艺术。",
      ],
    },
  ],
  [
    226,
    {
      sourceSha256: "61d646b6e734e5c419dc0f5007aa8457593765d58d821383a4b3081ff06334ad",
      note: "修正2008年福建省高考语文真题《民间艺术与民俗生活》原文OCR错字",
      passageReplacements: [
        ["变逆", "变迁"],
        ["愿有", "原有"],
        ["往流行", "很流行"],
        ["情杯", "情怀"],
        ["脱象", "现象"],
        ["根粒于", "植根于"],
      ],
    },
  ],
  [
    243,
    {
      sourceSha256: "c908f397e1bf6e323d355b6cb1af82710b7b838c46d01e59a4c7a22893526af8",
      note: "修正2021年新高考I卷（山东卷）语段OCR错字“宣讲内客”",
      passageReplacements: [["宣讲内客", "宣讲内容"]],
    },
  ],
  [
    244,
    {
      sourceSha256: "ef33917788afabb69e3eae2b7b3cfd5e8fe65978dbe26ed1927be837b05d1f78",
      note: "修正2021年新高考I卷（山东卷）语段OCR错字“宣讲内客”",
      passageReplacements: [["宣讲内客", "宣讲内容"]],
    },
  ],
]);

export const AGIEVAL_REPAIR_COUNT = AGIEVAL_REPAIRS.size;
export const AGIEVAL_REPAIRED_OUTPUT_COUNT = 44;

function applyRequiredOptionReplacements(options, replacements, repairKey) {
  let updated = [...options];
  for (const [search, replacement] of replacements ?? []) {
    const index = updated.findIndex((opt) => opt.includes(search));
    if (index === -1) {
      throw new Error("AGIEval repair row " + (repairKey + 1) + " options no longer contain " + JSON.stringify(search));
    }
    updated[index] = updated[index].replace(search, replacement);
  }
  return updated;
}

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
      options: repair.optionReplacements
        ? applyRequiredOptionReplacements(record.options, repair.optionReplacements, sourceIndex)
        : repair.options ?? record.options,
    },
    note: repair.note,
  };
}

export function normalizeAgievalText(value) {
  return String(value ?? "")
    .normalize("NFC")
    .replace(/\r\n?/gu, "\n")
    .replace(/<\/?a\b[^>]*>/giu, "")
    .replace(/学科\.?网/gu, "")
    .replace(/<庄子\.秋水>/gu, "《庄子·秋水》")
    .replace(/<(古文观止|中国目录学史|五藏山经)>/gu, "《$1》")
    .replace(/从左传》开始/gu, "从《左传》开始")
    .replace(/吏的缘文为奸/gu, "吏得缘文为奸")
    .replace(/(?<!_)__([^_\n]+)__(?!_)/gu, "$1")
    .replace(/(材料[一二三四五六七八九十\d]+[：:])。/gu, "$1")
    .replace(/。。/gu, "。")
    .replace(/。．/gu, "。")
    .replace(/([。！？；”])[ \t]{4,}/gu, "$1\n")
    .replace(/([^\s])[ \t]{4,}([^\s])/gu, "$1________$2")
    .replace(/[ \t]+\n/gu, "\n")
    .replace(/\n[ \t]+/gu, "\n")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

export function normalizeAgievalQuestion(value, label = "") {
  let normalized = normalizeAgievalText(value);
  normalized = normalized.replace(/^\d+\s*[、.．]?\s*(?=下列|关于|根据|对|依次|文中|下面)/u, "");
  if (label && new RegExp(`(?:[（(]\\s*[）)]|项是)\\s*${label}$`, "u").test(normalized)) {
    normalized = normalized.replace(new RegExp(`${label}$`, "u"), "").trim();
  }
  normalized = normalized.replace(/\s*[（(]\s*[）)]\s*$/u, "").trim();
  return normalized;
}

export function stripAgievalOptionLabel(value) {
  return normalizeAgievalText(value)
    .replace(/^\s*(?:[（(]\s*[A-DＡ-Ｄ]\s*[）)]\s*)+/u, "")
    .replace(/^\s*[A-DＡ-Ｄ]\s*[.．、:：]\s*/u, "")
    .replace(/^\s*[、.．]\s*/u, "")
    .replace(/[，,]\s*$/u, "")
    .trim();
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
  const fields = [record.passage ?? "", normalizeAgievalQuestion(record.question, record.label), ...record.options.map(stripAgievalOptionLabel)];
  const normalized = fields.map((value) => normalizeAgievalText(value).normalize("NFKC").replace(/\s+/gu, ""));
  return digest(normalized.join("\n"));
}

function stableId(sourceIndex) {
  return digest(`agieval:v1.1:gaokao-chinese:${sourceIndex}`).slice(0, 32);
}

function convertGroup(group) {
  const { record, sourceIndex, sources, repairNotes } = group;
  const passage = normalizeAgievalText(record.passage);
  const question = normalizeAgievalQuestion(record.question, record.label);
  const options = record.options.map(stripAgievalOptionLabel);
  const optionByLabel = new Map(options.map((option, index) => [String.fromCharCode(65 + index), option]));
  const paper = sources.join("；同题亦见：");
  const duplicateNote = sources.length > 1 ? `；合并 ${sources.length} 个内容完全相同的试卷来源` : "";
  const repairNote = repairNotes.length ? `；EduLoop人工校订：${repairNotes.join("；")}` : "";
  const skillTag = passage ? "阅读理解" : "语言运用";

  return {
    id: stableId(sourceIndex),
    subject: "语文",
    grade: "高三",
    type: "单选题",
    difficulty: "一般",
    sourcePaper: `${paper}（AGIEval v1.1 MIT许可导入；固定提交 ${AGIEVAL_COMMIT}；源文件SHA-256 ${AGIEVAL_SOURCE_SHA256}${repairNote}${duplicateNote}）`,
    stem: passage ? `${passage}\n\n${question}` : question,
    options: {
      A: optionByLabel.get("A") ?? "",
      B: optionByLabel.get("B") ?? "",
      C: optionByLabel.get("C") ?? "",
      D: optionByLabel.get("D") ?? "",
    },
    answer: record.label,
    solutions: [`AGIEval v1.1 原始数据未提供解析。参考答案为 ${record.label}。`],
    tags: ["高考语文", skillTag],
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
