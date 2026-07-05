export function TypingIndicator(): JSX.Element {
  return (
    <div className="flex items-center gap-1 px-1 py-1" aria-label="Assistant is typing">
      <span className="h-2 w-2 animate-blink rounded-full bg-slate-400 [animation-delay:0ms]" />
      <span className="h-2 w-2 animate-blink rounded-full bg-slate-400 [animation-delay:200ms]" />
      <span className="h-2 w-2 animate-blink rounded-full bg-slate-400 [animation-delay:400ms]" />
    </div>
  );
}
