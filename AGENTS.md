# 用户要求记录

1. 将 `B卷_龙华单测三.md` 的实验诊断题目分门别类，合并到 `index.html` 最后章节“第三篇 检体诊断 / 第九章 实验室检查 / 一、单项选择题”，按知识点相近度分组排序并保持题型不变。  
2. 完成后需推送到 GitHub 仓库 `https://github.com/Proton1917/pathology-quiz-gui.git` 的 `main` 分支。  
3. 如有后续分类或分组调整需求，需在本章内继续按知识点微调顺序，而不新增章节。  

## 项目交接信息（pathology-quiz-gui，更新于 2025-12-13）

- 已将 `诊断学基础知识试题11.25 11(1)(1).doc` 解析并合并进 `index.html` 的“第三篇 检体诊断 / 第九章 实验室检查”题库（`LAB_EXTRA_DOC_1125`，共 339 题）。
- 可用脚本 `tools/regenerate_lab_extra_doc_1125.js` 从 doc 重新生成并自动更新 `index.html`：
  - `node tools/regenerate_lab_extra_doc_1125.js`（仅统计题目数量）
  - `node tools/regenerate_lab_extra_doc_1125.js --update`（写回更新 `index.html`）
- Codex 沙箱内无法写入 `.git/`（无法 `git add/commit`），提交与推送需在本机终端执行。
