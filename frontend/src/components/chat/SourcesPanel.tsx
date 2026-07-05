import { useState } from "react";
import type { ChatCitation } from "@/types/api";

export function SourcesPanel({ citations }: { citations: ChatCitation[] }): JSX.Element | null {
  const [expanded, setExpanded] = useState(false);

  if (citations.length === 0) return null;

  return (
    <div className="mt-2 w-full">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800"
        aria-expanded={expanded}
      >
        <span className={`transition-transform ${expanded ? "rotate-90" : ""}`} aria-hidden="true">
          &#9656;
        </span>
        Sources ({citations.length})
      </button>

      {expanded && (
        <ul className="mt-2 flex flex-col gap-2">
          {citations.map((citation, index) => (
            <li
              key={`${citation.document_name}-${citation.page_number}-${index}`}
              className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs"
            >
              <div className="mb-1 flex items-center gap-2">
                <sup className="citation-marker">{index + 1}</sup>
                <span className="font-medium text-slate-800">{citation.document_name}</span>
                <span className="text-slate-400">&middot; p.{citation.page_number}</span>
              </div>
              <p className="text-slate-600">{citation.excerpt}</p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
