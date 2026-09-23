"use client";

import {
  createElement,
  useMemo,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { isSafeLink } from "../cms_schemas";

const allowedTags = new Set([
  "p",
  "br",
  "strong",
  "em",
  "u",
  "s",
  "ul",
  "ol",
  "li",
  "h2",
  "h3",
  "blockquote",
  "a",
]);
const discardedTags = new Set([
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "svg",
  "math",
  "template",
]);
const subscribe = () => () => {};
const clientSnapshot = () => true;
const serverSnapshot = () => false;

/** An inert template is never inserted into the document. Build fresh React
 * elements from approved tags; discard all event handlers, styles and resources. */
function formattedNodes(html: string): ReactNode[] {
  const template = document.createElement("template");
  template.innerHTML = html;
  function readNodes(nodes: NodeListOf<ChildNode>, depth = 0): ReactNode[] {
    if (depth > 40) return [];
    return Array.from(nodes).map((node, index) => {
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (!(node instanceof Element)) return null;
      const tag = node.tagName.toLowerCase();
      if (discardedTags.has(tag)) return null;
      const children = readNodes(node.childNodes, depth + 1);
      if (!allowedTags.has(tag)) return children;
      if (tag === "br") return createElement("br", { key: index });
      if (tag === "a") {
        const href = node.getAttribute("href") ?? "";
        return createElement(
          "a",
          {
            key: index,
            href: href && isSafeLink(href) ? href : undefined,
            title: node.getAttribute("title") ?? undefined,
          },
          children,
        );
      }
      return createElement(tag, { key: index }, children);
    });
  }
  return readNodes(template.content.childNodes);
}

export function RichTextEditorPreview({ text }: { text: string }) {
  const mounted = useSyncExternalStore(
    subscribe,
    clientSnapshot,
    serverSnapshot,
  );
  const content = useMemo(
    () => (mounted ? formattedNodes(text) : text.replace(/<[^>]*>/g, "")),
    [mounted, text],
  );
  return <section className="cms-block cms-richtext">{content}</section>;
}
