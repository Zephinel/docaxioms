// Markdown parsing built on remark (CommonMark + GFM) and github-slugger.
// Replaces regex-based Markdown scanning while preserving exact source offsets and line ranges.
import GithubSlugger from "github-slugger";
import { toString } from "mdast-util-to-string";
import remarkGfm from "remark-gfm";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { visit } from "unist-util-visit";

const parser = unified().use(remarkParse).use(remarkGfm);

const safeDecode = (text) => {
  try { return decodeURIComponent(text); } catch { return text; }
};

/** Parse a Markdown document once and expose AST-derived queries. */
export function parseMarkdown(text) {
  const tree = parser.parse(text);
  const lines = text.split("\n");

  const definitions = new Map();
  visit(tree, "definition", (node) => {
    const id = node.identifier.toLowerCase();
    if (!definitions.has(id)) definitions.set(id, node.url);
  });

  // Headings with GitHub-identical anchors and section text slices.
  const slugger = new GithubSlugger();
  const sections = [];
  visit(tree, "heading", (node) => {
    const start = node.position.start.line - 1;
    const title = toString(node);
    sections.push({
      level: node.depth,
      line: lines[start] ?? "",
      title,
      anchor: slugger.slug(title),
      start,
      text: "",
    });
  });
  for (let i = 0; i < sections.length; i += 1) {
    const current = sections[i];
    const next = sections.slice(i + 1).find((candidate) => candidate.level <= current.level);
    current.end = next ? next.start : lines.length;
    current.text = lines.slice(current.start, current.end).join("\n");
  }

  // Extract link and image targets from any AST subtree (inline + resolved references; footnotes excluded).
  const linksIn = (subtree) => {
    const urls = [];
    visit(subtree, (node) => {
      if ((node.type === "link" || node.type === "image") && node.url) {
        urls.push(node.url);
      } else if (node.type === "linkReference" || node.type === "imageReference") {
        const url = definitions.get(node.identifier.toLowerCase());
        if (url) urls.push(url);
      }
    });
    return urls;
  };

  // Explicit <a id="..."> / <a name="..."> anchors mapped to their nearest enclosing block
  // (paragraph, listItem, tableRow, or blockquote).
  const explicitAnchors = new Map();
  const blockTypes = new Set(["paragraph", "listItem", "tableRow", "blockquote"]);
  const walkAnchors = (node, enclosing) => {
    const nextEnclosing = blockTypes.has(node.type) ? node : enclosing;
    if (node.type === "html") {
      for (const match of node.value.matchAll(/<a\b[^>]*(?:^|\s)(?:id|name)=(?:"([^"]+)"|'([^']+)')/gi)) {
        const id = match[1] ?? match[2];
        if (!explicitAnchors.has(id)) {
          const holder = nextEnclosing ?? node;
          explicitAnchors.set(id, text.slice(holder.position.start.offset, holder.position.end.offset));
        }
      }
    }
    if (node.children) for (const child of node.children) walkAnchors(child, nextEnclosing);
  };
  walkAnchors(tree, null);

  // Inline code spans (fenced code blocks are `code` nodes and never included here).
  const inlineCodes = [];
  visit(tree, "inlineCode", (node) => {
    inlineCodes.push({ value: node.value, line: node.position?.start.line ?? 1 });
  });

  // HTML comments outside code blocks, matched against the raw source slice so offsets and line numbers
  // stay exact even when remark strips blockquote prefixes or list indentation from `node.value`.
  const htmlComments = [];
  visit(tree, "html", (node) => {
    const baseOffset = node.position.start.offset;
    const rawSlice = text.slice(baseOffset, node.position.end.offset);
    for (const match of rawSlice.matchAll(/<!--([\s\S]*?)-->/g)) {
      const start = baseOffset + match.index;
      const end = start + match[0].length;
      const line = text.slice(0, start).split("\n").length;
      htmlComments.push({ raw: match[0], body: match[1], start, end, line });
    }
  });

  // Helper to blank offset ranges while preserving line numbers.
  const blankRanges = (ranges, filler = "") => {
    if (!ranges.length) return text;
    ranges.sort((a, b) => a[0] - b[0]);
    let out = "";
    let cursor = 0;
    for (const [start, end] of ranges) {
      if (start < cursor) continue;
      out += text.slice(cursor, start);
      out += text.slice(start, end).replace(/[^\n]/g, filler);
      cursor = end;
    }
    out += text.slice(cursor);
    return out;
  };

  // Source text with ONLY fenced code blocks (``` / ~~~) blanked out, preserving newlines.
  const fencedRanges = [];
  visit(tree, "code", (node) => {
    if (!node.position) return;
    const slice = text.slice(node.position.start.offset, node.position.end.offset);
    if (/^[ \t]{0,3}(?:`{3,}|~{3,})/.test(slice)) {
      fencedRanges.push([node.position.start.offset, node.position.end.offset]);
    }
  });
  const withoutFencesText = blankRanges(fencedRanges, "");

  // Source text with fenced code blocks and HTML comments blanked out (for fallback table row scanning).
  const withoutFencesAndComments = blankRanges(
    [...fencedRanges, ...htmlComments.map((c) => [c.start, c.end])],
    "",
  );

  // Source text with fenced code blocks and inline code blanked out, preserving newlines.
  const codeRanges = [...fencedRanges];
  visit(tree, "inlineCode", (node) => {
    if (node.position) codeRanges.push([node.position.start.offset, node.position.end.offset]);
  });
  const withoutCode = blankRanges(codeRanges, " ");

  // Prose text nodes (for review aids such as evolutionary phrasing detection).
  const proseSegments = [];
  visit(tree, "text", (node) => {
    proseSegments.push({ value: node.value, line: node.position?.start.line ?? 1 });
  });

  const passage = (anchor) => {
    const wanted = safeDecode(anchor);
    const section = sections.find((one) => one.anchor === wanted)
      ?? sections.find((one) => one.anchor === wanted.toLowerCase());
    if (section) return section.text;
    return explicitAnchors.get(wanted) ?? explicitAnchors.get(wanted.toLowerCase());
  };

  return {
    tree,
    text,
    lines,
    definitions,
    sections,
    links: () => linksIn(tree),
    linksIn,
    passage,
    inlineCodes,
    htmlComments,
    withoutFences: withoutFencesText,
    withoutFencesAndComments,
    withoutCode,
    proseSegments,
  };
}

/** The index of the `]` that closes the `[` at `open`, skipping escaped brackets; -1 when there is none. */
function closingBracket(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === "\\") { i += 1; continue; }
    if (text[i] === "[") depth += 1;
    else if (text[i] === "]" && --depth === 0) return i;
  }
  return -1;
}

/** The [start, end) of the link destination at or after `from`: `<...>`, or a run without spaces whose parentheses balance (CommonMark). */
function destinationAt(text, from) {
  let start = from;
  while (/[ \t\n]/.test(text[start] ?? "")) start += 1;
  let end = start;
  if (text[start] === "<") {
    end += 1;
    while (end < text.length && text[end] !== ">" && text[end] !== "\n") end += text[end] === "\\" ? 2 : 1;
    return [start, Math.min(end + 1, text.length)];
  }
  let depth = 0;
  while (end < text.length && !/\s/.test(text[end])) {
    if (text[end] === "\\") { end += 2; continue; }
    if (text[end] === "(") depth += 1;
    else if (text[end] === ")" && depth-- === 0) break;
    end += 1;
  }
  return [start, Math.min(end, text.length)];
}

/**
 * `text` with the destination of every link, image and link definition removed, and all else kept: titles, code
 * and prose stay as they are, so that comparing two such texts lets only link targets differ.
 */
export function withoutLinkTargets(text) {
  const tree = parser.parse(text);
  const ranges = [];
  visit(tree, (node) => {
    if (!node.position || !["link", "image", "definition"].includes(node.type)) return;
    const start = node.position.start.offset;
    const end = node.position.end.offset;
    if (node.type === "definition") {
      const close = closingBracket(text, start);
      if (close !== -1 && text[close + 1] === ":") ranges.push(destinationAt(text, close + 2));
      return;
    }
    const open = node.type === "image" ? start + 1 : start;
    if (text[open] !== "[") {
      // An autolink, `<url>` or a bare address: the whole of it is the target.
      ranges.push(text[start] === "<" ? [start + 1, end - 1] : [start, end]);
      return;
    }
    const last = node.children?.at(-1)?.position?.end.offset;
    const close = last !== undefined && text[last] === "]" ? last : closingBracket(text, open);
    if (close !== -1 && text[close + 1] === "(") ranges.push(destinationAt(text, close + 2));
  });
  ranges.sort((a, b) => a[0] - b[0]);
  let out = "";
  let cursor = 0;
  for (const [start, end] of ranges) {
    if (start < cursor) continue;
    out += text.slice(cursor, start);
    cursor = end;
  }
  return out + text.slice(cursor);
}

/** Blank ONLY fenced code blocks (``` / ~~~) from arbitrary text while preserving line numbers and indented code. */
export function withoutFences(text) {
  return text.replace(/^(```|~~~)[\s\S]*?^\1[^\n]*$/gm, (block) => block.replace(/[^\n]/g, ""));
}

/** Extract markdown link and image targets from a snippet using the same AST rules. */
export function extractLinkTargets(snippet, extraDefinitions = new Map()) {
  const parsed = parseMarkdown(snippet);
  const targets = [];
  visit(parsed.tree, (node) => {
    if ((node.type === "link" || node.type === "image") && node.url) {
      targets.push(node.url);
    } else if (node.type === "linkReference" || node.type === "imageReference") {
      const id = node.identifier.toLowerCase();
      const url = parsed.definitions.get(id) ?? extraDefinitions.get(id);
      if (url) targets.push(url);
    }
  });
  return targets;
}
