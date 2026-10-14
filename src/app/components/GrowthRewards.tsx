'use client';

import { useState } from 'react';
import { GROWTH_MILESTONES, OPTIONAL_CARE_MODULES, extraCareUnlocked } from '../growth-rewards';
import { shopItem } from '../shop-catalog';
import { acknowledgeGrowthReward, type shopSnapshot } from '../shop-store';
type Snapshot = ReturnType<typeof shopSnapshot>;
export function GrowthProgress({ snapshot, onOpen }: { snapshot: Snapshot | null; onOpen: () => void }) {
  const pending = snapshot?.state.rewards.some(grant => !grant.seenAt);
  return <button type="button" className="growth-progress" onClick={onOpen}>
    <span>{pending ? '새로운 성장 보상이 도착했어요' : '함께한 날의 작은 선물'}</span>
    <strong>누적 활동 {snapshot?.activeDays ?? '—'}일 <span aria-hidden="true">→</span></strong>
  </button>;
}
export function GrowthRewardsScreen({ snapshot, error, onRetry, onChange, onPlace, onExtra }: {
  snapshot: Snapshot | null; error: string; onRetry: () => void; onChange: (next: Snapshot) => void; onPlace: (id: string) => void; onExtra: () => void;
}) {
  const [saveError, setSaveError] = useState('');
  return <div className="growth-content">
    <p className="growth-intro">나를 돌본 날이 <strong>{snapshot?.activeDays ?? '—'}일</strong> 쌓였어요.</p>
    <p className="shop-caption">연속 출석이 아니에요. 쉬어 간 날에도 쌓인 시간과 받은 선물은 그대로예요.</p>
    {(error || saveError) && <div className="shop-error" role="alert"><p>{error || saveError}</p><p>보상을 저장하지 못했더라도 완료한 활동 기록은 유지돼요.</p><button type="button" onClick={() => { setSaveError(''); onRetry(); }}>다시 확인하기</button></div>}
    {GROWTH_MILESTONES.map(milestone => {
      const grant = snapshot?.state.rewards.find(entry => entry.id === milestone.id);
      const remaining = Math.max(0, milestone.days - (snapshot?.activeDays ?? 0));
      return <section key={milestone.id} className="growth-reward-card" aria-labelledby={milestone.id + '-title'}>
        <p className="eyebrow">누적 {milestone.days}일 · {grant ? '선물 지급 완료' : remaining === 0 && snapshot ? '지급 대기' : '함께 쌓아 가는 중'}</p>
        <h2 id={milestone.id + '-title'}>{grant ? milestone.title : milestone.days + '일의 작은 선물'}</h2>
        <p>{grant ? milestone.description : '서두르지 않아도 괜찮아요. ' + remaining + '일의 돌봄이 더 쌓이면 만날 수 있어요.'}</p>
        <ul className="growth-gifts">{milestone.itemIds.map(id => { const item = shopItem(id)!; return <li key={id}><span aria-hidden="true">{item.icon}</span><div><strong>{item.name}</strong><small>기념 선물 · 임시 아이콘</small></div>{grant && <button type="button" className="shop-secondary" onClick={() => onPlace(id)}>정원에 배치하기</button>}</li>; })}</ul>
        {grant && !grant.seenAt && <button type="button" className="shop-secondary" onClick={() => { try { onChange(acknowledgeGrowthReward(grant.id)); setSaveError(''); } catch (cause) { setSaveError(cause instanceof Error ? cause.message : '확인 상태를 저장하지 못했어요.'); } }}>선물 확인했어요</button>}
        {milestone.id === 'days-100' && grant && <div className="growth-extra"><p>기본 돌봄 3개는 그대로예요. 마음이 내킬 때만 추가 공간에 들러도 좋아요.</p><button type="button" className="shop-secondary" onClick={onExtra}>선택형 돌봄 둘러보기</button></div>}
      </section>;
    })}
    <p className="shop-storage-note">활동일은 오늘의 나 응답 4개 또는 기본 돌봄을 완료한 날짜로 세어요. 하루 여러 활동도 1일이며, 작성 중인 기록과 미래 날짜는 제외해요. 기록 당시 기기 현지 날짜를 유지해요. 기존 기록도 같은 기준으로 포함해요.</p>
  </div>;
}
export function OptionalCareScreen({ snapshot, onHome }: { snapshot: Snapshot | null; onHome: () => void }) {
  const unlocked = !!snapshot && extraCareUnlocked(snapshot.state.rewards);
  return <div className="growth-content">
    {unlocked ? <><h2>마음이 내킬 때, 잠깐</h2><p className="shop-caption">추가 과제나 완료 횟수는 없어요. 참여하지 않아도 햇살, 성장, 기념 선물은 그대로예요.</p>{OPTIONAL_CARE_MODULES.map(module => <details className="growth-reward-card" key={module.id}><summary>{module.title}</summary><p>{module.prompt}</p></details>)}</> : <p>누적 활동 100일 선물을 받으면 열리는 선택형 공간이에요.</p>}
    <button type="button" className="primary-button" onClick={onHome}>정원으로 돌아가기</button>
  </div>;
}
