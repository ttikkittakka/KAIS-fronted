import { notFound } from 'next/navigation';

export default async function CareCompletionPreviewPage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { default: Preview } = await import('./Preview');
  return <Preview/>;
}
