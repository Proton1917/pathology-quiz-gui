#!/usr/bin/env node
"use strict";

const fs = require("node:fs");
const path = require("node:path");
const childProcess = require("node:child_process");

const projectRoot = path.resolve(__dirname, "..");
const defaultDocPath = path.join(projectRoot, "诊断学基础知识试题11.25 11(1)(1).doc");
const defaultIndexPath = path.join(projectRoot, "index.html");

const args = process.argv.slice(2);
const shouldUpdate = args.includes("--update");
const docPathArg = args.find((a) => a.startsWith("--doc="))?.slice("--doc=".length);
const indexPathArg = args.find((a) => a.startsWith("--index="))?.slice("--index=".length);

const resolvedDocPath = path.isAbsolute(docPathArg ?? defaultDocPath)
  ? (docPathArg ?? defaultDocPath)
  : path.resolve(projectRoot, docPathArg ?? defaultDocPath);
const resolvedIndexPath = path.isAbsolute(indexPathArg ?? defaultIndexPath)
  ? (indexPathArg ?? defaultIndexPath)
  : path.resolve(projectRoot, indexPathArg ?? defaultIndexPath);

const decodeHtml = (input) => {
  let text = String(input ?? "");
  text = text.replace(/&nbsp;|&#160;/g, " ");
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)));
  text = text.replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
  return text;
};

const textFromParagraphInner = (innerHtml) => {
  const withoutTags = String(innerHtml ?? "").replace(/<[^>]*>/g, "");
  return decodeHtml(withoutTags).replace(/[\s\u00A0]+/g, " ").trim();
};

const normalizePrompt = (raw) => {
  let prompt = String(raw ?? "").trim();
  prompt = prompt.replace(/[\u000c\u200b]/g, "");
  prompt = prompt.replace(/^\d+\s*[．.、]\s*/, "");
  prompt = prompt.replace(/\(\s*\)/g, "（）").replace(/（\s*）/g, "（）");
  prompt = prompt.replace(/[\s\u00A0]+/g, " ").trim();
  prompt = prompt.replace(/[÷]+$/g, "");
  return prompt;
};

const normalizeOptionText = (raw) => {
  let text = String(raw ?? "").trim();
  text = text.replace(/[\u000c\u200b]/g, "");
  // 仅去掉明确的“选项字母+标点”前缀，避免误伤“A型血/B型血”等
  text = text.replace(/^[A-E]\s*[．.、]\s*/i, "");
  text = text.replace(/[\s\u00A0]+/g, " ").trim();
  return text;
};

const isHeaderLine = (text) => {
  if (!text) return true;
  return (
    text === "诊断学基础知识试题集" ||
    /^第三篇\s*实验诊断$/.test(text) ||
    /^第[一二三四五六七八九十百]+章/.test(text) ||
    text === "选择题" ||
    /A型题|B型题|多项选择题/.test(text)
  );
};

const isPromptLine = (text) => /(?:\(\s*\)|（\s*）)/.test(text);

const parseDocToQuestions = (docHtml) => {
  const paragraphs = [];
  const paragraphRe = /<p\s+class="([^"]+)"[^>]*>([\s\S]*?)<\/p>/gi;
  let match;
  while ((match = paragraphRe.exec(docHtml))) {
    const className = match[1];
    const inner = match[2];
    const text = textFromParagraphInner(inner);
    if (!text) continue;

    const isHighlighted =
      /<b>/.test(inner) || /class="s1"/.test(inner) || className === "p3" || className === "p5";
    paragraphs.push({ text, isHighlighted });
  }

  const questions = [];
  let current = null;

  const finalize = () => {
    if (!current) return;

    const prompt = normalizePrompt(current.prompt);
    const rawOptions = current.options
      .map((o) => ({ text: normalizeOptionText(o.text), isCorrect: !!o.isCorrect }))
      .filter((o) => o.text)
      .filter((o) => !o.text.includes("题目有问题"));

    if (!prompt || rawOptions.length === 0) {
      current = null;
      return;
    }

    const dedup = new Map();
    for (const opt of rawOptions) {
      const prev = dedup.get(opt.text);
      if (prev) prev.isCorrect ||= opt.isCorrect;
      else dedup.set(opt.text, { ...opt });
    }

    const options = [...dedup.values()];
    const labeled = options.map((opt, idx) => ({
      label: String.fromCharCode(65 + idx),
      text: opt.text,
      _isCorrect: opt.isCorrect,
    }));
    const answers = labeled.filter((o) => o._isCorrect).map((o) => o.label);

    questions.push({
      prompt,
      options: labeled.map(({ label, text }) => ({ label, text })),
      answers,
      multi: answers.length > 1,
      answer_text: "",
      open: false,
    });

    current = null;
  };

  for (const p of paragraphs) {
    if (isHeaderLine(p.text)) {
      finalize();
      continue;
    }

    if (isPromptLine(p.text)) {
      finalize();
      current = { prompt: p.text, options: [] };
      continue;
    }

    if (!current) continue;
    current.options.push({ text: p.text, isCorrect: p.isHighlighted });
  }
  finalize();

  for (const q of questions) q.multi = (q.answers || []).length > 1;
  return questions;
};

const chunkString = (text, size) => {
  const chunks = [];
  for (let i = 0; i < text.length; i += size) chunks.push(text.slice(i, i + size));
  return chunks;
};

const generateIndexBlock = (questions) => {
  const json = JSON.stringify(questions);
  const chunks = chunkString(json, 10000);
  const chunkLines = chunks.map((c) => `      ${JSON.stringify(c)},`).join("\n");

  return [
    "    const LAB_EXTRA_DOC_1125 = (() => {",
    "      const text = [",
    chunkLines,
    "      ].join(\"\");",
    "      const parsed = JSON.parse(text);",
    "      // 个别题在源文档里夹杂备注，避免污染选项",
    "      parsed.forEach((q) => {",
    "        if (q.prompt !== \"血尿见于（）\") return;",
    "        const badLabels = q.options",
    "          .filter((opt) => opt.text && opt.text.includes(\"题目有问题\"))",
    "          .map((opt) => opt.label);",
    "        if (!badLabels.length) return;",
    "        q.options = q.options.filter((opt) => !badLabels.includes(opt.label));",
    "        q.answers = q.answers.filter((a) => !badLabels.includes(a));",
    "      });",
    "      // 题型一律按答案数量推导，避免 multi 标记不一致",
    "      parsed.forEach((q) => {",
    "        q.multi = (q.answers || []).length > 1;",
    "      });",
    "      return parsed;",
    "    })();",
    "",
  ].join("\n");
};

const run = () => {
  const docHtml = childProcess.execFileSync("textutil", ["-convert", "html", "-stdout", resolvedDocPath], {
    encoding: "utf8",
  });
  const questions = parseDocToQuestions(docHtml);
  const withAnswers = questions.filter((q) => (q.answers || []).length > 0).length;
  console.log(
    JSON.stringify(
      {
        docPath: path.relative(projectRoot, resolvedDocPath),
        questions: questions.length,
        withAnswers,
        withoutAnswers: questions.length - withAnswers,
      },
      null,
      2
    )
  );

  if (!shouldUpdate) return;

  const indexHtml = fs.readFileSync(resolvedIndexPath, "utf8");
  const startNeedle = "    const LAB_EXTRA_DOC_1125 = (() => {";
  const anchorNeedle = "    const labSection = DATA.find";
  const start = indexHtml.indexOf(startNeedle);
  if (start === -1) {
    throw new Error(`无法在 ${path.relative(projectRoot, resolvedIndexPath)} 中定位 LAB_EXTRA_DOC_1125 起始位置`);
  }
  const anchor = indexHtml.indexOf(anchorNeedle, start);
  if (anchor === -1) {
    throw new Error(`无法在 ${path.relative(projectRoot, resolvedIndexPath)} 中定位 labSection 注入锚点`);
  }

  const next = indexHtml.slice(0, start) + generateIndexBlock(questions) + indexHtml.slice(anchor);
  fs.writeFileSync(resolvedIndexPath, next, "utf8");
  console.log(`Updated ${path.relative(projectRoot, resolvedIndexPath)}`);
};

try {
  run();
} catch (err) {
  // eslint-disable-next-line no-console
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
}
