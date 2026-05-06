#!/usr/bin/env node
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BLOCK_START = '<!-- markco-comments';
const BLOCK_END = '-->';
const VERSION = 2;
const ZWS = '​';

// --- Sanitization ---

function sanitizeForStorage(text) {
  return text.replace(/-->/g, `--${ZWS}>`);
}

function restoreFromStorage(text) {
  return text.replace(new RegExp(`--${ZWS}>`, 'g'), '-->');
}

function deepSanitize(comments) {
  return comments.map(c => ({
    ...c,
    anchor: { ...c.anchor, text: sanitizeForStorage(c.anchor.text) },
    content: sanitizeForStorage(c.content),
    replies: c.replies?.map(r => ({
      ...r,
      content: sanitizeForStorage(r.content),
    })),
  }));
}

function deepRestore(comments) {
  return comments.map(c => ({
    ...c,
    anchor: { ...c.anchor, text: restoreFromStorage(c.anchor.text) },
    content: restoreFromStorage(c.content),
    replies: c.replies?.map(r => ({
      ...r,
      content: restoreFromStorage(r.content),
    })),
  }));
}

// --- Code context detection (ported from CommentService.ts) ---

function isInsideCodeContext(text, position) {
  const before = text.substring(0, position);

  const fenceMatches = before.match(/```/g);
  if (fenceMatches !== null && fenceMatches.length % 2 === 1) {
    return true;
  }

  if (position > 0 && text[position - 1] === '`') {
    if (!(position >= 3 && text.substring(position - 3, position) === '```')) {
      return true;
    }
  }

  const lastBacktickIndex = before.lastIndexOf('`');
  if (lastBacktickIndex !== -1) {
    const isCodeFenceBacktick = before.substring(lastBacktickIndex).startsWith('```');
    if (!isCodeFenceBacktick) {
      const lineStart = before.lastIndexOf('\n', lastBacktickIndex) + 1;
      const lineEnd = text.indexOf('\n', position);
      const line = text.substring(lineStart, lineEnd === -1 ? text.length : lineEnd);
      const positionInLine = position - lineStart;

      const beforeInLine = line.substring(0, positionInLine);
      const afterInLine = line.substring(positionInLine);
      const backticksBeforeInLine = (beforeInLine.match(/(?<!`)`(?!`)/g) || []).length;
      const backticksAfterInLine = (afterInLine.match(/(?<!`)`(?!`)/g) || []).length;

      if (backticksBeforeInLine % 2 === 1 && backticksAfterInLine > 0) {
        return true;
      }
    }
  }

  return false;
}

function findCommentBlockStart(text) {
  let searchStart = text.length;

  while (searchStart > 0) {
    const index = text.lastIndexOf(BLOCK_START, searchStart - 1);
    if (index === -1) return -1;
    if (!isInsideCodeContext(text, index)) return index;
    searchStart = index;
  }

  return -1;
}

// --- Position helpers (replace VS Code document.positionAt) ---

function positionAt(text, offset) {
  let line = 0;
  let lastNewline = -1;
  for (let i = 0; i < offset; i++) {
    if (text[i] === '\n') {
      line++;
      lastNewline = i;
    }
  }
  return { line, char: offset - lastNewline - 1 };
}

// --- Anchor search ---

function buildSearchableText(text) {
  const blockStart = findCommentBlockStart(text);
  if (blockStart === -1) return { searchable: text, blockStart: -1, blockLength: 0 };

  const blockEnd = text.indexOf(BLOCK_END, blockStart);
  if (blockEnd === -1) return { searchable: text.substring(0, blockStart), blockStart, blockLength: 0 };

  const blockLength = (blockEnd + BLOCK_END.length) - blockStart;
  const searchable = text.substring(0, blockStart) + text.substring(blockEnd + BLOCK_END.length);
  return { searchable, blockStart, blockLength };
}

function findAllAnchors(text, searchText) {
  const { searchable, blockStart, blockLength } = buildSearchableText(text);
  const results = [];
  let fromIndex = 0;
  let occurrence = 1;

  while (true) {
    const index = searchable.indexOf(searchText, fromIndex);
    if (index === -1) break;

    if (isInsideCodeContext(searchable, index)) {
      fromIndex = index + 1;
      continue;
    }

    let originalIndex = index;
    if (blockStart !== -1 && index >= blockStart) {
      originalIndex = index + blockLength;
    }

    const start = positionAt(text, originalIndex);
    const end = positionAt(text, originalIndex + searchText.length);

    results.push({
      text: searchText,
      startLine: start.line,
      startChar: start.char,
      endLine: end.line,
      endChar: end.char,
      occurrence,
    });

    occurrence++;
    fromIndex = index + 1;
  }

  return results;
}

function findFirstAnchor(text, searchText) {
  const { searchable, blockStart, blockLength } = buildSearchableText(text);
  const index = searchable.indexOf(searchText);
  if (index === -1) return null;
  if (isInsideCodeContext(searchable, index)) return null;

  let originalIndex = index;
  if (blockStart !== -1 && index >= blockStart) {
    originalIndex = index + blockLength;
  }

  const start = positionAt(text, originalIndex);
  const end = positionAt(text, originalIndex + searchText.length);

  return {
    text: searchText,
    startLine: start.line,
    startChar: start.char,
    endLine: end.line,
    endChar: end.char,
  };
}

// --- File I/O ---

function readFile(filePath) {
  const raw = readFileSync(filePath, 'utf-8');
  const hasCRLF = raw.includes('\r\n');
  const text = hasCRLF ? raw.replace(/\r\n/g, '\n') : raw;
  return { text, hasCRLF };
}

function writeFile(filePath, text, hasCRLF) {
  const output = hasCRLF ? text.replace(/\n/g, '\r\n') : text;
  writeFileSync(filePath, output, 'utf-8');
}

// --- Block parsing ---

function extractComments(text) {
  const blockStart = findCommentBlockStart(text);
  if (blockStart === -1) return { version: VERSION, comments: [] };

  const blockEnd = text.indexOf(BLOCK_END, blockStart);
  if (blockEnd === -1) return { version: VERSION, comments: [] };

  const jsonStart = blockStart + BLOCK_START.length;
  const jsonText = text.substring(jsonStart, blockEnd).trim();

  if (!jsonText.startsWith('{')) return { version: VERSION, comments: [] };

  const data = JSON.parse(jsonText);
  data.comments = deepRestore(data.comments || []);
  return data;
}

function replaceBlock(text, newBlock) {
  const blockStart = findCommentBlockStart(text);

  if (newBlock === null) {
    if (blockStart === -1) return text;
    const blockEnd = text.indexOf(BLOCK_END, blockStart);
    if (blockEnd === -1) return text;
    let before = text.substring(0, blockStart);
    before = before.replace(/\n+$/, '');
    const after = text.substring(blockEnd + BLOCK_END.length);
    return before + after;
  }

  if (blockStart === -1) {
    let base = text.replace(/\n+$/, '');
    return base + '\n\n' + newBlock;
  }

  const blockEnd = text.indexOf(BLOCK_END, blockStart);
  if (blockEnd === -1) return text;
  return text.substring(0, blockStart) + newBlock + text.substring(blockEnd + BLOCK_END.length);
}

function buildBlock(data) {
  const sanitized = { ...data, comments: deepSanitize(data.comments) };
  return `${BLOCK_START}\n${JSON.stringify(sanitized, null, 2)}\n${BLOCK_END}`;
}

// --- Subcommand handlers ---

function cmdParse(filePath) {
  const { text } = readFile(filePath);
  const data = extractComments(text);
  process.stdout.write(JSON.stringify(data, null, 2) + '\n');
}

async function cmdSerialize(filePath) {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const input = JSON.parse(Buffer.concat(chunks).toString('utf-8'));

  const { text, hasCRLF } = readFile(filePath);

  if (!input.comments || input.comments.length === 0) {
    const updated = replaceBlock(text, null);
    writeFile(filePath, updated, hasCRLF);
    process.stdout.write('{"ok":true,"action":"removed"}\n');
    return;
  }

  const block = buildBlock(input);
  const updated = replaceBlock(text, block);
  writeFile(filePath, updated, hasCRLF);
  process.stdout.write('{"ok":true,"action":"written"}\n');
}

function cmdFindAnchor(filePath, searchText, occurrence) {
  const { text } = readFile(filePath);
  let results = findAllAnchors(text, searchText);

  if (occurrence !== undefined) {
    results = results.filter(r => r.occurrence === occurrence);
  }

  process.stdout.write(JSON.stringify(results, null, 2) + '\n');
}

function cmdReconcile(filePath) {
  const { text, hasCRLF } = readFile(filePath);
  const data = extractComments(text);
  const summary = { updated: [], orphaned: [], unchanged: [] };
  let modified = false;

  for (const comment of data.comments) {
    const found = findFirstAnchor(text, comment.anchor.text);

    if (found) {
      const posChanged =
        found.startLine !== comment.anchor.startLine ||
        found.startChar !== comment.anchor.startChar ||
        found.endLine !== comment.anchor.endLine ||
        found.endChar !== comment.anchor.endChar;
      const wasOrphaned = comment.orphaned === true;

      if (posChanged || wasOrphaned) {
        comment.anchor.startLine = found.startLine;
        comment.anchor.startChar = found.startChar;
        comment.anchor.endLine = found.endLine;
        comment.anchor.endChar = found.endChar;
        comment.orphaned = false;
        modified = true;
        summary.updated.push({ id: comment.id, anchor: comment.anchor });
      } else {
        summary.unchanged.push({ id: comment.id });
      }
    } else if (!comment.orphaned) {
      comment.orphaned = true;
      modified = true;
      summary.orphaned.push({ id: comment.id, text: comment.anchor.text });
    } else {
      summary.orphaned.push({ id: comment.id, text: comment.anchor.text });
    }
  }

  if (modified) {
    const block = buildBlock(data);
    const updated = replaceBlock(text, block);
    writeFile(filePath, updated, hasCRLF);
  }

  process.stdout.write(JSON.stringify(summary, null, 2) + '\n');
}

// --- CLI dispatcher ---

function parseArgs(args) {
  const result = { positional: [] };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--text' && i + 1 < args.length) {
      result.text = args[++i];
    } else if (args[i] === '--occurrence' && i + 1 < args.length) {
      result.occurrence = parseInt(args[++i], 10);
    } else {
      result.positional.push(args[i]);
    }
  }
  return result;
}

function usage() {
  process.stderr.write(`Usage:
  markco.mjs parse <file>
  markco.mjs serialize <file>          (reads JSON from stdin)
  markco.mjs find-anchor <file> --text "text" [--occurrence N]
  markco.mjs reconcile <file>
`);
  process.exit(1);
}

async function main() {
  const [,, subcommand, ...rest] = process.argv;
  if (!subcommand) usage();

  const args = parseArgs(rest);
  const filePath = args.positional[0];

  if (!filePath && subcommand !== 'help') {
    process.stderr.write('Error: file path required\n');
    process.exit(1);
  }

  const resolved = filePath ? resolve(filePath) : '';

  try {
    switch (subcommand) {
      case 'parse':
        cmdParse(resolved);
        break;
      case 'serialize':
        await cmdSerialize(resolved);
        break;
      case 'find-anchor':
        if (!args.text) {
          process.stderr.write('Error: --text required for find-anchor\n');
          process.exit(1);
        }
        cmdFindAnchor(resolved, args.text, args.occurrence);
        break;
      case 'reconcile':
        cmdReconcile(resolved);
        break;
      default:
        usage();
    }
  } catch (err) {
    if (err.code === 'ENOENT') {
      process.stderr.write(`Error: file not found: ${filePath}\n`);
      process.exit(1);
    }
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
