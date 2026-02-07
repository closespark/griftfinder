interface DataPanelProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

export function DataPanel({ title, children, className = '' }: DataPanelProps) {
  return (
    <div className={`border border-green-500/30 bg-black/80 backdrop-blur-sm ${className}`}>
      {/* Terminal header bar */}
      <div className="border-b border-green-500/30 bg-green-950/20 px-4 py-2">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="h-3 w-3 rounded-full bg-red-500/60"></div>
            <div className="h-3 w-3 rounded-full bg-yellow-500/60"></div>
            <div className="h-3 w-3 rounded-full bg-green-500/60"></div>
          </div>
          <span className="font-mono text-xs text-green-400 uppercase tracking-wider">
            {title}
          </span>
        </div>
      </div>
      
      {/* Content area */}
      <div className="p-4 font-mono text-sm text-green-400">
        {children}
      </div>
    </div>
  );
}
