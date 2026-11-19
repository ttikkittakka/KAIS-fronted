import { notFound } from 'next/navigation';

export default async function AiMindPrototypePage() {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { default: Prototype } = await import('./Prototype');
  return <Prototype />;
}
