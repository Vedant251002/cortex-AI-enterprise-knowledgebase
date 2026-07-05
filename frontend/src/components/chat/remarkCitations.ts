import { findAndReplace } from "mdast-util-find-and-replace";
import type { Root } from "mdast";
import type { Plugin } from "unified";

const CITATION_PATTERN = /\[(\d+)\]/g;

/**
 * Remark plugin that converts inline `[1]`, `[2]`, ... citation markers
 * found in plain text nodes into `citationMarker` mdast nodes, which
 * react-markdown then renders via a custom component (see CitationMarkdown).
 * Using a proper remark transform (rather than string-splitting the raw
 * markdown) keeps normal markdown syntax around citations intact.
 */
export const remarkCitations: Plugin<[], Root> = () => {
  return (tree) => {
    findAndReplace(tree, [
      CITATION_PATTERN,
      (_match: string, num: string) => ({
        type: "citationMarker",
        value: num,
      }),
    ]);
  };
};

declare module "mdast" {
  interface CitationMarkerNode {
    type: "citationMarker";
    value: string;
  }

  interface PhrasingContentMap {
    citationMarker: CitationMarkerNode;
  }
}
