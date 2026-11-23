import { SAFETY_CONTACTS, SAFETY_SOURCE, SAFETY_VERIFIED_AT } from '../safety';

/** A plain hash link so any screen can open the safety center without prop drilling. */
export function HelpLink() {
  return <a className="icon-button help-link" href="#safety" aria-label="도움 받을 수 있는 곳" title="도움 받을 수 있는 곳">
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="3.5"/><path d="m6 6 3.5 3.5M18 6l-3.5 3.5M6 18l3.5-3.5M18 18l-3.5-3.5"/></svg>
  </a>;
}

// Wording follows 설계안 v2 §6.5: no auto-report, no guardian contact, no operator on standby.
export default function SafetyCenter() {
  return <div className="settings-content safety-center">
    <section className="settings-card"><h2>혼자 견디지 않아도 돼요</h2><p>이야기할 사람이 필요하다면 아래 전문 상담으로 바로 연결할 수 있어요. 이 앱은 위기를 해결하거나 누군가 계속 지켜보는 서비스가 아니에요.</p></section>
    <ul className="safety-list">{SAFETY_CONTACTS.map(contact => <li key={contact.number}>
      <a className="safety-call" href={'tel:' + contact.number}><strong>{contact.number}</strong><span>{contact.name}</span><small>{contact.note}</small></a>
    </li>)}</ul>
    <a className="settings-menu" href="#support"><strong>상담 지원 제도 살펴보기</strong><span>심리상담 바우처, 정신건강복지센터, 청년 마음건강 <span aria-hidden="true">→</span></span></a>
    <p className="privacy-note">전화는 이 기기에서 직접 걸려요. 앱은 누구에게도 자동으로 연락하거나 신고하지 않아요. 연락처 확인일 {SAFETY_VERIFIED_AT} · <a href={SAFETY_SOURCE.url} target="_blank" rel="noreferrer">{SAFETY_SOURCE.label}</a></p>
  </div>;
}
