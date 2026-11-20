'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import AuthBoundary from './AuthBoundary';
import RecordSessionBoundary from './RecordSessionBoundary';

export default function AppEntry({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (pathname === '/demo' || pathname === '/guardian' || pathname === '/install') return children;
  return <AuthBoundary><RecordSessionBoundary>{children}</RecordSessionBoundary></AuthBoundary>;
}
