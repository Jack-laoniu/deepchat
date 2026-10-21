# 需求闯关

一句模糊需求 → 一局多邻国式小游戏 → 一份理清楚的方案。

AI 先盲猜一个方案，用户一关一关地点选、滑卡、拖工具修坑、扛 Boss。每个选择都是一条真实情况；选错了会「炸」出坑，赌一把可能翻车。通关后得到方案清单，以及一份区分「已确认 / 待核实 / 接受的风险」的上下文，可直接交给任意 AI 继续出详细方案。

```bash
npm install
npm run dev           # 本地玩
npm test              # 规则测试
npm run build:widget  # 单文件 HTML，用于嵌入 ChatGPT Apps / Claude
```

- `src/lesson/` 关卡格式、规则、交付物、给大模型的生成提示词（与界面无关）
- `src/rounds/` 五种玩法：点选、滑卡、滑杆、修坑、Boss
- `src/lessons/` 示例关卡
- 插画：Google Noto 表情（静态 SVG + Lottie 动画），关卡里只需写 emoji 字符
