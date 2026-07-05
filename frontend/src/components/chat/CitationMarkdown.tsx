import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { remarkCitations } from "@/components/chat/remarkCitations";

// react-markdown's `Components` map is keyed by standard HTML tag names, so
// our custom `citationMarker` mdast node type (produced by remarkCitations)
// isn't representable in its type. We extend the map locally with a single
// cast at the point of use — the runtime contract (a component receiving
// `{ value: string }`-like props from the citationMarker node) is guaranteed
// by remarkCitations, which is the only producer of this node type.
type CitationMarkerProps = { value?: string };
type ExtendedComponents = Components & {
  citationMarker?: (props: CitationMarkerProps) => JSX.Element;
};

function CitationBadge({ value }: CitationMarkerProps): JSX.Element {
  return <sup className="citation-marker">{value ?? ""}</sup>;
}

const components: ExtendedComponents = {
  citationMarker: CitationBadge,
};

export function CitationMarkdown({ content }: { content: string }): JSX.Element {
  return (
    <div className="markdown-body text-sm leading-relaxed">
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkCitations]}
        components={components as Components}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
