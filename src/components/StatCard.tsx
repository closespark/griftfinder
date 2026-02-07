interface StatCardProps {
  label: string;
  value: string | number;
  sublabel?: string;
  highlight?: boolean;
}

export function StatCard({ label, value, sublabel, highlight = false }: StatCardProps) {
  return (
    <div className={`border ${highlight ? 'border-red-500/50 bg-red-950/10' : 'border-green-500/20 bg-green-950/5'} p-4`}>
      <div className={`font-mono text-xs uppercase tracking-wider ${highlight ? 'text-red-400' : 'text-green-500/70'}`}>
        {label}
      </div>
      <div className={`mt-2 font-mono text-3xl font-bold ${highlight ? 'text-red-400' : 'text-green-400'}`}>
        {value}
      </div>
      {sublabel && (
        <div className={`mt-1 font-mono text-xs ${highlight ? 'text-red-400/60' : 'text-green-400/60'}`}>
          {sublabel}
        </div>
      )}
    </div>
  );
}
