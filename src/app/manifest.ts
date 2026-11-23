import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: '/',
    name: '오늘의 정원',
    short_name: '오늘의 정원',
    description: '하루의 마음을 기록하고 작은 회복 행동을 함께하는 정원',
    lang: 'ko',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#eef3ee',
    theme_color: '#24463d',
    icons: [
      { src: '/app-icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app-icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
    ],
  };
}
