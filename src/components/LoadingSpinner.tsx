export function LoadingSpinner() {
  return (
    <div className="flex items-center justify-center p-8">
      <div className="flex items-center gap-3">
        <div className="h-5 w-5 animate-spin rounded-full border-2 border-green-500 border-t-transparent"></div>
        <span className="font-mono text-sm text-green-400">Loading data...</span>
      </div>
    </div>
  );
}
