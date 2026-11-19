'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import AuthBoundary from './AuthBoundary';
import RecordSessionBoundary from './RecordSessionBoundary';

export default function AppSessionBoundary({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  // This isolated visual preview must not mount account readers or local record locks.
  if (process.env.NODE_ENV === 'development' && ['/dev/care-completion', '/dev/ai-mind'].includes(pathname)) return children;
  return <AuthBoundary><RecordSessionBoundary>{children}</RecordSessionBoundary></AuthBoundary>;
}
