'use client';

import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import AuthBoundary from './AuthBoundary';
import RecordSessionBoundary from './RecordSessionBoundary';

export default function AppSessionBoundary({ children, serverAccount = false }: { children: ReactNode; serverAccount?: boolean }) {
  const pathname = usePathname();
  if (pathname === '/demo' || pathname === '/guardian' || pathname === '/install') return children;
  // This isolated visual preview must not mount account readers or local record locks.
  if (process.env.NODE_ENV === 'development' && ['/dev/care-completion', '/dev/ai-mind'].includes(pathname)) return children;
  return <AuthBoundary serverAccount={serverAccount}><RecordSessionBoundary>{children}</RecordSessionBoundary></AuthBoundary>;
}
