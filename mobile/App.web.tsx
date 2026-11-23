import React from 'react';
import { gardenUrl } from './garden-url';

export default function App() {
  const url = typeof window === 'undefined' ? null : gardenUrl();
  return <main style={{ minHeight: '100dvh', background: '#eef3ee', display: 'grid', placeItems: 'center' }}>
    <section style={{ textAlign: 'center', color: '#24463d', fontFamily: 'system-ui', padding: '28px' }}>
      <div aria-hidden style={{ fontSize: 44 }}>🌱</div>
      <h1>오늘의 정원</h1>
      <p>하루의 마음을 남기고, 작은 미션 하나를 골라요.</p>
      {url && <a href={url.href} style={{ display: 'inline-block', padding: '13px 26px', marginTop: 12, borderRadius: 14, color: 'white', background: '#24463d', textDecoration: 'none' }}>웹 정원 열기</a>}
    </section>
  </main>;
}
