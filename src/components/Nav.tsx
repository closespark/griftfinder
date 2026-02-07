'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/', label: 'HOME' },
  { href: '/stories', label: 'STORIES' },
  { href: '/entities', label: 'ENTITIES' },
  { href: '/investigations', label: 'INVESTIGATIONS' },
  { href: '/network', label: 'NETWORK' },
  { href: '/search', label: 'SEARCH' },
  { href: '/doge', label: 'DOGE' },
  { href: '/analysis', label: 'ANALYSIS' },
];

export function Nav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-green-500/20 bg-black/95 backdrop-blur sticky top-0 z-50">
      <div className="mx-auto max-w-6xl px-4">
        <div className="flex items-center justify-between h-12">
          <Link href="/" className="flex items-center gap-2">
            <span className="font-mono text-lg font-bold text-white">
              GRIFT<span className="text-green-400">FINDER</span>
            </span>
          </Link>
          <div className="flex items-center gap-1">
            {links.map((link) => {
              const active = pathname === link.href;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`px-3 py-1.5 font-mono text-xs transition-colors ${
                    active
                      ? 'text-green-400 bg-green-950/40 border border-green-500/30'
                      : 'text-zinc-500 hover:text-green-400'
                  }`}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </nav>
  );
}
