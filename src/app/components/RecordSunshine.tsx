import type { AccountRecords } from '../../lib/account-records/model';
export default function RecordSunshine({ day }: { day: AccountRecords }) {
  const labels={reflection:'돌아보기',participation:'성장하기',firstCare:'첫 돌봄 완료'};
  return <article className="record-card"><h3>이 날의 햇살</h3><ul className="record-care-list">
    {day.rewards.map(r=><li key={r.event_key}><span>{labels[r.reason]}</span><strong>+{r.delta}</strong></li>)}
  </ul><p className="saved-text">{day.rewards.length ? `이 날 모은 햇살 ${day.rewards.reduce((n,r)=>n+r.delta,0)}` : '이 날 받은 햇살이 없어요.'}</p></article>;
}
