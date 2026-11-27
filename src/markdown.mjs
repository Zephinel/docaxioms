// Markdown parsing built on remark (CommonMark + GFM) and github-slugger.
// Replaces regex-based Markdown scanning while preserving exact source offsets and line ranges.
import GithubSlugger from "github-slugger";
import { parse, postprocess, preprocess } from "micromark";
import { gfm } from "micromark-extension-gfm";
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

// The kinds of token that are a link's target: inline and definition destinations, and the address inside `<...>`.
// A bare address is prose that reads as a link, so it is not among them.
const TARGET_TOKENS = new Set(["resourceDestinationString", "definitionDestinationString", "autolinkProtocol", "autolinkEmail"]);

/**
 * `text` with the destination of every link, image and link definition removed, and all else kept: titles, code
 * and prose stay as they are, so that comparing two such texts lets only link targets differ. The ranges come from
 * the parser's own tokens, the same parse that remark builds its tree from.
 */
export function withoutLinkTargets(text) {
  const events = postprocess(parse({ extensions: [gfm()] }).document().write(preprocess()(text, undefined, true)));
  const ranges = events
    .filter(([kind, token]) => kind === "enter" && TARGET_TOKENS.has(token.type))
    .map(([, token]) => [token.start.offset, token.end.offset])
    .sort((a, b) => a[0] - b[0]);
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
