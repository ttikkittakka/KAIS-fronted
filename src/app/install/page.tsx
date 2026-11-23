import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: '오늘의 정원 설치' };
export default function Install() {
  return <main className="app-shell"><div className="phone-frame"><section className="screen work-screen">
    <div className="work-area"><header className="quiet-intro"><div className="quiet-glyph" aria-hidden="true">🌱</div><h1>오늘의 정원 설치</h1><p>휴대폰 홈 화면에서 정원을 바로 열어요.</p></header>
      <div className="quiet-card"><h2>iPhone</h2><p>Safari의 공유 메뉴에서 ‘홈 화면에 추가’를 눌러요.</p></div>
      <div className="quiet-card"><h2>Android</h2><p>Chrome 메뉴에서 ‘홈 화면에 추가’ 또는 ‘앱 설치’를 눌러요.</p></div>
      <div className="quiet-actions"><Link href="/" className="quiet-link">정원 열기</Link><Link href="/demo" className="quiet-link">체험하기</Link></div>
    </div>
  </section></div></main>;
}
