import type { Metadata } from 'next';
import GuardianViewer from '../components/Guardian';

export const metadata: Metadata = {
  title: '함께 보는 마음 | 오늘의 정원',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
};
export default function Page() { return <GuardianViewer/>; }
