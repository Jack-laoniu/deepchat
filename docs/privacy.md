# 需求闯关（Need Quest）隐私政策

生效日期：{{EFFECTIVE_DATE}}
运营者：{{OPERATOR}}
联系方式：{{CONTACT}}

需求闯关是一个小游戏：你说一句模糊的需求，它用故事、聊天和选择题帮你把真实情况说清楚，最后生成一份需求清单。本政策说明我们在两种使用方式下会处理哪些信息、为什么处理、保存多久。

我们**没有账号系统**，不要求你提供姓名、手机号或邮箱；**不投放广告**，**不出售**任何数据，**不用你的数据训练模型**。

## 一、在 ChatGPT、Claude 等 AI 助手里使用

这时游戏由 AI 助手调用我们的工具 `start_need_quest` 启动：

- **我们收到的**：助手根据对话写好的一份关卡内容（需求描述、剧情、选项）。它可能包含你在这次对话里告诉助手的、与这个需求有关的情况。
- **我们怎么用**：只检查格式是否正确，然后原样交回给助手显示游戏。**不保存**，也不转发给任何其他服务。
- **游戏过程和结果**：你在游戏里的选择、打字或语音说的话、最后的需求总结，都在助手的界面里处理，并作为消息发回给那个助手。这部分由 OpenAI、Anthropic 等助手提供方按它们自己的隐私政策处理，不经过我们的服务器。
- 服务器可能留有标准的技术日志（访问时间、IP 地址、请求路径），只用于排查故障和防止滥用。

## 二、在我们的网站上直接玩（{{SITE}}）

网页版需要我们的服务器调用大模型来生成关卡，所以会处理更多信息：

| 信息 | 用途 | 发给谁 | 保存多久 |
| --- | --- | --- | --- |
| 你输入的需求、游戏中的回答和原话 | 生成关卡、角色即时回应、终章改写、「继续聊需求」 | 我们配置的大模型服务（见第四节） | 相同需求的关卡在内存里缓存，服务重启即清除；最近 30 份生成的关卡（含需求原文）存在服务器上用于排查质量问题，更早的自动删除 |
| 本设备上的「角色记忆」（你以前闯过的需求摘要） | 让角色记得你之前的情况，不重复提问 | 随生成请求一起发给大模型服务 | 我们不单独保存；你可以在首页查看、逐条删除或整个关掉 |
| 台词文本（仅在开启服务器朗读时） | 把台词转成语音 | 语音合成服务 | 不保存 |
| IP 地址 | 限制频率、防止刷量 | 不发给第三方 | 只在内存里保留约 1 小时 |
| 页面出错时的错误信息和当前关卡内容 | 修复程序错误 | 不发给第三方 | 写进服务器日志，随日志轮转删除 |
| 需求原文的前 40 个字 | 运行日志，排查问题 | 不发给第三方 | 随日志轮转删除 |

**只存在你自己设备上的**（浏览器本地存储，不上传）：角色记忆（最多 8 条）、和角色的亲密度、测试访问码。清除浏览器网站数据即可全部删除。

**语音输入**：使用浏览器自带的语音识别。部分浏览器（例如 Chrome）会把录音发到浏览器厂商的服务器识别，这部分由浏览器厂商处理。不想这样可以直接打字。

**分享和邀请**：分享海报在你的设备上生成。「让朋友帮我选」会生成一个带有你需求原文的链接，收到链接的人能看到这句需求，请只发给你愿意让他看到的人。

## 三、预订入口和「找本地导游」（只在我们的网站上）

- **预订入口**：通关后可能显示酒店、门票、流量卡等合作平台的链接。点开就离开了我们的网站，之后由那个平台按它自己的隐私政策处理你的信息。部分链接是推广链接，你在那里下单我们可能获得佣金，不影响你的价格；我们不会因此收到你的个人信息。
- **找本地导游**：只有你自己填写并勾选同意后，我们才会保存你填的称呼、联系方式、补充说明，以及这一局生成的需求单（行程偏好、预算、你的原话等），用来转给我们合作的本地导游，由导游联系你。这些信息存在我们的服务器上，保存 12 个月，或在你要求时提前删除（联系 {{CONTACT}}）。我们只把它转给为你匹配的导游，不出售，也不用于其他用途。

- **分享给朋友**：你点「邀请同行的人」或「请朋友帮我参谋」时，我们会把这一关的内容、你做过的选择和你填的名字存到服务器上，生成一个链接。**拿到链接的人都能看到这些内容**，请只发给你想让他看到的人。朋友玩完点「发给你」时，他的选择、填的名字和需求单也存进同一份分享里，只有拿着这个链接的人能看到。分享内容保存 60 天后自动删除，你也可以联系我们提前删除。

## 四、第三方资源

页面会从 Google Fonts（fonts.googleapis.com、fonts.gstatic.com）加载字体和表情图片，Google 会因此获得你的 IP 地址和浏览器信息。

## 五、大模型服务提供方

网页版关卡由我们在服务器上配置的大模型服务生成，目前使用：{{PROVIDERS}}。你的需求和回答会按上表发送给它们，由它们依照各自的 API 数据政策处理。这些服务可能位于你所在国家或地区之外。

## 六、未成年人

本服务不面向 14 周岁以下的儿童。如果你未满 14 周岁，请在监护人同意和陪同下使用。若发现我们无意中处理了儿童信息，请联系我们删除。

## 七、你的权利

因为没有账号，我们无法把数据和某个具体的人对应起来。你仍然可以：

- 随时在首页关闭或删除角色记忆，或清除浏览器数据；
- 联系我们（{{CONTACT}}），说明大致时间和需求内容，要求删除服务器上可能留存的关卡存档或日志，我们会在 15 个工作日内处理；
- 就本政策提出疑问或投诉。

**请不要**在需求里填写身份证号、银行卡号、病历、密码等敏感信息，游戏并不需要它们。

## 八、政策变更

政策有实质变化时，我们会更新本页的生效日期，并在网站首页提示。

---

# Need Quest Privacy Policy

Effective: {{EFFECTIVE_DATE}} · Operator: {{OPERATOR}} · Contact: {{CONTACT}}

Need Quest is a small game that turns a vague need into a clear plan through stories, chats and choices. There are **no accounts**, **no ads**, we **do not sell** data, and we **do not train models** on it.

**Inside ChatGPT, Claude or other AI assistants.** The assistant calls our `start_need_quest` tool with a level it wrote, which may include details you shared with it in this conversation about this need. We only validate the format and return it; we **do not store or forward** it. Your choices, typed or spoken answers and the final summary are handled inside the assistant and sent back to it, under the assistant provider's own privacy policy. Our server may keep standard technical logs (time, IP address, path) for troubleshooting and abuse prevention.

**On our website ({{SITE}}).** To generate levels, our server sends your need, your in-game answers and the on-device "character memory" to the model provider(s) we use ({{PROVIDERS}}), and, if server speech is on, dialogue text to a text-to-speech service. Identical needs are cached in memory until restart; the latest 30 generated levels (including the need text) are kept on the server for quality debugging and older ones are deleted automatically. IP addresses are held in memory for about an hour for rate limiting. Client error reports and the first 40 characters of each need go into server logs, which rotate. Character memory (up to 8 entries), closeness with characters and the access code stay in your browser's local storage; you can view, delete or turn off memory on the home page. Voice input uses your browser's speech recognition, which some browsers process on the vendor's servers. Invite links contain your need text. Fonts and emoji images load from Google Fonts.

**Booking links and local guides (our website only).** After a quest we may show links to partner sites (hotels, tours, eSIMs). Some are affiliate links: we may earn a commission at no cost to you, and the partner's own privacy policy applies once you leave our site. If — and only if — you fill in the "ask a local guide" form and tick the consent box, we store your name, contact details, note and the trip brief from your quest, and pass them only to the local guide matched to you. We keep them for 12 months or until you ask us to delete them ({{CONTACT}}). We never sell them.

**Sharing with friends.** When you invite a travel companion or ask a friend for advice, we store the level, the choices you made and the name you entered, and create a link. Anyone with the link can see them, so only send it to people you want to see it. When your friend sends their answers back, their choices, name and need list are stored in the same share. Shares are deleted automatically after 60 days, or earlier on request.

**Children.** Not directed at children under 14 (under 13 where that is the applicable age).

**Your choices.** Turn off or delete memory, clear browser data, or contact us at {{CONTACT}} to request deletion of any server-side archive or logs; we respond within 15 business days. Please don't enter ID numbers, card numbers, medical records or passwords — the game doesn't need them.
