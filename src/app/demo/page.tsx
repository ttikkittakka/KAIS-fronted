import type { Metadata } from 'next';
import { Demo } from './surface';

export const metadata: Metadata = { title: '오늘의 정원 체험', robots: { index: false, follow: false } };
export default function Page() { return <Demo/>; }
