// Email copy is server-only, so it lives apart from the UI catalogs that are
// sent to the browser. zh-CN defines the shape; other locales are typed to it.
// Each template renders `before` paragraphs, an optional link (`action` is its
// label in HTML; plain text shows the URL), then `after` paragraphs.

export const zhCNEmails = {
  passwordReset: {
    subject: "重置你的 EduLoop 密码",
    before: ["有人请求重置你的 EduLoop 密码。请在 30 分钟内打开以下链接："],
    action: "在 30 分钟内重置密码",
    after: ["如果不是你发起的请求，可以忽略这封邮件。"],
  },
  emailVerification: {
    subject: "验证你的 EduLoop 邮箱",
    before: ["请在 24 小时内打开链接，并输入你注册账号或刚设置的密码，以完成 EduLoop 邮箱登录设置："],
    action: "在 24 小时内验证邮箱",
    after: [
      "未验证且从未使用的密码注册会在 30 天后自动删除；重新发送邮件不会延长该期限。",
      "如果你没有注册账号或设置登录密码，不要打开链接，也不要向任何人提供密码。",
    ],
  },
  emailChangeVerification: {
    subject: "确认更改 EduLoop 登录邮箱",
    before: ["有人请求将这个地址设为 EduLoop 登录邮箱。请在 60 分钟内确认："],
    action: "在 60 分钟内确认新邮箱",
    after: ["如果不是你发起的请求，可以忽略这封邮件，原登录邮箱不会改变。"],
  },
  emailChanged: {
    subject: "你的 EduLoop 登录邮箱已更改",
    before: ["你的 EduLoop 登录邮箱已更改为 {newEmail}，所有旧登录会话都已退出。", "如果不是你操作，请立即联系平台支持。"],
    action: "",
    after: [],
  },
  providerDisconnected: {
    subject: "你的 EduLoop {provider} 登录连接已移除",
    before: ["你的 EduLoop 账号已移除 {provider} 登录连接，所有旧登录会话都已退出。", "如果不是你操作，请立即重置密码并联系平台支持。"],
    action: "",
    after: [],
  },
  passwordChanged: {
    subject: "你的 EduLoop 密码已更新",
    before: ["你的 EduLoop 密码已更新，所有旧登录会话和未使用的账号验证链接都已失效。", "如果不是你操作，请立即联系平台支持并检查邮箱账号安全。"],
    action: "",
    after: [],
  },
  accountDeleted: {
    subject: "你的 EduLoop 账号已删除",
    before: [
      "你的 EduLoop 账号、登录方式和在线学习数据已永久删除，所有登录会话都已失效。题目反馈中的身份关联和自由文本已清除；不含报告人身份的安全审核状态与操作记录会随题库保留。备份中的删除数据会按隐私说明中的保留周期轮换清除。",
      "如果不是你操作，请立即联系平台支持并检查邮箱账号安全。",
    ],
    action: "",
    after: [],
  },
  learningDataDeleted: {
    subject: "你的 EduLoop 学习数据已删除",
    before: [
      "你的 EduLoop 在线学习数据已永久删除。题目反馈中的身份关联和自由文本已清除；不含报告人身份的安全审核状态与操作记录会随题库保留。登录账号和登录方式仍然保留；备份中的删除数据会按隐私说明中的保留周期轮换清除。",
      "如果不是你操作，请立即重置密码并联系平台支持。",
    ],
    action: "",
    after: [],
  },
  sessionsRevoked: {
    subject: "你的 EduLoop 登录会话已全部退出",
    before: ["你的 EduLoop 登录会话已全部退出，未使用的账号安全链接也已失效。密码、登录邮箱和社交登录连接没有改变。", "如果不是你操作，请立即重置密码并联系平台支持。"],
    action: "",
    after: [],
  },
  dueReviewDigest: {
    subject: "今天有 {count} 道错题等你复习",
    before: ["今天有 {count} 道错题到了复习时间。花几分钟回顾一下，让它们真正变成你的知识。"],
    action: "开始复习",
    after: [],
  },
  weeklySummary: {
    subject: "你的 EduLoop 本周学习小结",
    before: ["过去一周你练习了 {attempts} 题，正确率 {rate}%，有 {activeDays} 天坚持练习，当前连续学习 {streak} 天。"],
    action: "查看成长记录",
    after: [],
  },
  weeklySummaryEmpty: {
    subject: "你的 EduLoop 本周学习小结",
    before: ["过去一周还没有练习记录。完成 1 题就能点亮今天，重新开始也完全没问题。"],
    action: "查看成长记录",
    after: [],
  },
  unsubscribe: {
    dueReviewDigest: "不想再收到复习提醒？",
    weeklySummary: "不想再收到每周小结？",
    link: "退订",
  },
};

type Strings<T> = { [K in keyof T]: T[K] extends string ? string : T[K] extends string[] ? string[] : Strings<T[K]> };
export type EmailCatalog = Strings<typeof zhCNEmails>;
