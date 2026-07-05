interface QueryErrorStateProps {
  message?: string;
  onRetry: () => void;
}

export function QueryErrorState({ message, onRetry }: QueryErrorStateProps): JSX.Element {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-red-200 bg-red-50 p-8 text-center">
      <p className="text-sm font-semibold text-red-800">Failed to load data</p>
      {message && <p className="max-w-md text-sm text-red-700">{message}</p>}
      <button
        type="button"
        onClick={onRetry}
        className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700"
      >
        Retry
      </button>
    </div>
  );
}
