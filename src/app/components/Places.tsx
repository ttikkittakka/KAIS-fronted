'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { Button } from '@astryxdesign/core/Button';
import type { CircleMarker, Map as LeafletMap } from 'leaflet';
import { PLACES, kmBetween, markPlace, placeLog, rankPlaces, type Place, type PlaceStatus, type Position } from '../places';
import { localDay } from '../daily-checkin';
import type { AnswerValue } from '../questions';
import { Icon } from './PetIcon';

function SeoulMap({ place, onSelect }: { place: Place | undefined; onSelect: (id: Place['id']) => void }) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<LeafletMap | null>(null);
  const markers = useRef<CircleMarker[]>([]);
  const select = useRef(onSelect);
  const [failure, setFailure] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => { select.current = onSelect; }, [onSelect]);
  useEffect(() => {
    let mounted = true;
    const el = element.current;
    if (!el) return;
    void import('leaflet').then(module => {
      if (!mounted) return;
      const L = module.default;
      const map = L.map(el, { scrollWheelZoom: false, zoomControl: true, attributionControl: true }).setView([37.55, 127.00], 11);
      instance.current = map;
      const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        minZoom: 5, maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
      }).addTo(map);
      tiles.on('tileerror', () => setFailure(true));
      tiles.on('tileload', () => setFailure(false));
      markers.current = PLACES.map(point => L.circleMarker([point.lat, point.lon], {
        radius: 7, color: '#fff', weight: 2, fillColor: '#295648', fillOpacity: 1,
      }).addTo(map).bindTooltip(point.name).on('click', () => select.current(point.id)));
      setReady(true);
    }).catch(() => { if (mounted) setFailure(true); });
    return () => { mounted = false; instance.current?.remove(); instance.current = null; markers.current = []; };
  }, []);
  useEffect(() => {
    const map = instance.current;
    if (!map || !ready) return;
    markers.current.forEach((marker, i) => {
      const active = PLACES[i].id === place?.id;
      marker.setStyle({ radius: active ? 10 : 7, fillColor: active ? '#ad552c' : '#295648' });
    });
    if (place) map.panTo([place.lat, place.lon], { animate: false });
  }, [place, ready]);
  return <div className="places-map-wrap">
    <div className="places-map" ref={element} role="region" aria-label="서울 추천 장소 지도"/>
    {failure && <p className="places-map-status" role="status">지도 배경 연결을 기다리는 중이에요. 장소 목록을 먼저 볼 수 있어요.</p>}
  </div>;
}

const FILTERS = [['all', '둘러보기'], ['saved', '갈 곳'], ['visited', '다녀온 곳']] as const;
type Filter = typeof FILTERS[number][0];

export default function Places({ energy }: { energy?: AnswerValue }) {
  const [log, setLog] = useState(placeLog);
  const [filter, setFilter] = useState<Filter>('all');
  const [position, setPosition] = useState<Position>();
  const [selected, setSelected] = useState<Place['id']>();
  const [notice, setNotice] = useState('');
  const [locating, setLocating] = useState(false);
  const rail = useRef<HTMLDivElement>(null);
  const places = rankPlaces(energy, position).filter(place => filter === 'all' || log[place.id]?.status === filter);
  const center = PLACES.find(place => place.id === selected);
  const select = (id: Place['id']) => {
    setSelected(id);
    const card = rail.current?.querySelector<HTMLElement>('[data-place="' + id + '"]');
    if (card && rail.current) rail.current.scrollTo({ left: card.offsetLeft - rail.current.offsetLeft });
  };
  const location = () => {
    if (!navigator.geolocation || !window.isSecureContext) { setNotice('HTTPS로 열면 내 위치에 가까운 순서를 볼 수 있어요.'); return; }
    setLocating(true); setNotice('');
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      setPosition({ lat: coords.latitude, lon: coords.longitude });
      setLocating(false); setNotice('내 위치와 서울 장소의 거리로 순서를 정했어요.');
    }, () => { setLocating(false); setNotice('위치를 확인하지 못했어요. 서울 추천 장소는 그대로 볼 수 있어요.'); }, { timeout: 7000, maximumAge: 0, enableHighAccuracy: false });
  };

  function mark(id: Place['id'], status: PlaceStatus) {
    try {
      const next = markPlace(id, status, localDay());
      setLog(next); setNotice(!next[id] ? '장소 목록에서 뺐어요.' : status === 'saved' ? '갈 곳에 저장했어요.' : '다녀온 곳으로 기록했어요.');
    } catch { setNotice('장소를 저장하지 못했어요.'); }
  }

  return <div className="work-area places-area">
    <header className="places-heading"><div><h2>가볍게 걸어볼 곳</h2><p>서울의 공원과 산책길</p></div>
      <Button label="내 위치로 정렬" icon={<Icon name="target" size={20}/>} isIconOnly isLoading={locating} onClick={location}/>
    </header>
    <SeoulMap place={center} onSelect={id => { if (filter !== 'all' && log[id]?.status !== filter) setFilter('all'); select(id); }}/>
    <div className="places-control"><nav className="quiet-segmented" aria-label="장소 종류">{FILTERS.map(([id, label]) =>
      <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setSelected(undefined); }}>{label}</button>)}</nav>
      {places.length > 1 && <div className="places-arrows"><Button label="이전 장소" icon={<Icon name="back" size={18}/>} isIconOnly onClick={() => rail.current?.scrollBy({ left: -290 })}/>
        <Button label="다음 장소" icon={<Icon name="arrow" size={18}/>} isIconOnly onClick={() => rail.current?.scrollBy({ left: 290 })}/></div>}
    </div>
    {places.length ? <div className="places-rail" ref={rail} key={filter} aria-label="사진으로 장소 둘러보기" tabIndex={0}>
      {places.map(place => <article className={'place-card' + (selected === place.id ? ' place-active' : '')} key={place.id} data-place={place.id}>
        <button type="button" className="place-image" onClick={() => setSelected(place.id)} aria-label={place.name + ' 지도에서 보기'}>
          <Image src={'/places/' + place.id + '.webp'} alt={place.name + ' 산책 풍경'} fill sizes="(max-width: 480px) 75vw, 296px" unoptimized/>
          <span>{place.kind}</span>
        </button>
        <div className="place-body"><div className="place-title"><div><h3>{place.name}</h3><small>{place.district}{position ? ' · ' + kmBetween(position, place).toFixed(1) + ' km' : ''}</small></div>
          <div className="quiet-actions">
            <Button label={log[place.id]?.status === 'saved' ? '갈 곳에서 빼기' : '갈 곳에 저장'} icon={<Icon name="bookmark" size={17}/>} isIconOnly variant={log[place.id]?.status === 'saved' ? 'primary' : 'secondary'} onClick={() => mark(place.id, 'saved')}/>
            <Button label={log[place.id]?.status === 'visited' ? '방문 기록 취소' : '다녀온 곳으로 표시'} icon={<Icon name="check" size={17}/>} isIconOnly variant={log[place.id]?.status === 'visited' ? 'primary' : 'secondary'} onClick={() => mark(place.id, 'visited')}/>
          </div></div><p>{place.detail}</p>
          <a className="quiet-link" href={'https://map.naver.com/p/search/' + encodeURIComponent(place.name)} target="_blank" rel="noopener noreferrer">지도 앱에서 찾기 <Icon name="arrow" size={14}/></a>
        </div>
      </article>)}
    </div> : <div className="quiet-card"><p>{filter === 'saved' ? '나중에 갈 곳을 북마크로 모아 보세요.' : '다녀온 장소에서 체크를 눌러 기록해요.'}</p><Button label="추천 장소 보기" onClick={() => setFilter('all')}/></div>}
    {notice && <p role="status" className="quiet-status">{notice}</p>}
    <details className="quiet-disclosure places-credits"><summary>장소 사진 출처</summary><ul>
      {PLACES.map(place => <li key={place.id}><a href={'https://commons.wikimedia.org/wiki/File:' + place.file} target="_blank" rel="noreferrer">{place.name} · {place.photographer}</a> · <a href={'https://creativecommons.org/licenses/by-sa/' + place.license + '/'} target="_blank" rel="noreferrer">{'CC BY-SA ' + place.license}</a> · 크기 조정</li>)}
    </ul></details>
  </div>;
}
