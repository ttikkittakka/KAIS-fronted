'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { CompanionArt } from './Companions';
import { FEELINGS, GREETING, INTERACTIONS, friendReply, unlockLabel, type Emotion, type InteractionId } from '../chat';
import { recordUtterance } from '../voice';
import { unlocked, type Growth, type TreeLevel } from '../pet-growth';
import type { CompanionId } from '../companions';
import { DEMO_PLANT_MOODS, type DemoPlantControls } from '../demo-plant';
import type { Outfit } from '../wardrobe';
import { Icon } from './PetIcon';
import { HelpSheet, PetMenu, type MenuItem } from './PetMenu';
import PlantBriefing from './PlantBriefing';
import { usePersonalGarden } from './PersonalGarden';
import { EDRUG_KEY_HEADER, GOV24_KEY_HEADER, OPENAI_KEY_HEADER } from '../../lib/provider-keys';
import { medicineDetailUrl } from '../plant-briefing';
import { PLANT_CHAT_HISTORY_LIMIT, PLANT_CHAT_TEXT_LIMIT, type PlantChatReply, type PlantChatSource } from '../plant-chat';

// Minimal shape of the browser's speech API (Chrome/Edge/Safari prefix it as webkitSpeechRecognition).
type Recognition = { lang: string; interimResults: boolean; continuous: boolean; start(): void; stop(): void; abort(): void;
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null;
  onerror: ((e: { error: string }) => void) | null; onend: (() => void) | null };
type RecognitionCtor = new () => Recognition;
const speechApi = () => typeof window === 'undefined' ? undefined
  : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);
const speechError = (code: string) => code === 'not-allowed' || code === 'service-not-allowed'
  ? '마이크 권한이 꺼져 있어요. 브라우저 설정에서 마이크를 허용하거나 글로 들려주세요.'
  : code === 'no-speech' ? '소리가 들리지 않았어요. 마이크를 다시 눌러 말해 줄래요?'
    : code === 'aborted' ? '' : '음성을 알아듣지 못했어요. 글로 들려줘도 괜찮아요.';

/** One recognition at a time. When the user stops talking, the sentence goes to onFinal (like pressing send). */
function useSpeech(onFinal: (text: string) => void) {
  const [supported, setSupported] = useState(false);
  const [listening, setListening] = useState(false);
  const [heard, setHeard] = useState('');
  const [error, setError] = useState('');
  const recognition = useRef<Recognition | null>(null);
  const deliver = useRef(onFinal);
  useEffect(() => { deliver.current = onFinal; });
  useEffect(() => {
    queueMicrotask(() => setSupported(!!speechApi()));
    // Leaving mid-dictation cancels it: detach first so the abort's end event delivers nothing.
    return () => { const r = recognition.current; if (r) { r.onresult = r.onerror = r.onend = null; r.abort(); } };
  }, []);
  const toggle = () => {
    if (recognition.current) { recognition.current.stop(); return; }
    const Api = speechApi();
    if (!Api) return;
    const r = new Api();
    r.lang = 'ko-KR'; r.interimResults = true; r.continuous = false;
    let latest = '';
    r.onresult = event => { latest = Array.from(event.results).map(part => part[0].transcript).join(' '); setHeard(latest); };
    r.onerror = event => setError(speechError(event.error));
    r.onend = () => { recognition.current = null; setListening(false); setHeard(''); if (latest.trim()) deliver.current(latest); };
    recognition.current = r;
    setHeard(''); setError(''); setListening(true);
    try { r.start(); } catch { recognition.current = null; setListening(false); setError('마이크를 시작하지 못했어요.'); }
  };
  return { supported, listening, heard, error, toggle };
}
type Speech = ReturnType<typeof useSpeech>;

function MicButton({ speech, className, disabled }: { speech: Speech; className: string; disabled?: boolean }) {
  return <button type="button" className={className} disabled={disabled && !speech.listening} aria-pressed={speech.listening} onClick={speech.toggle}
    aria-label={speech.listening ? '듣고 있어요. 누르면 말하기를 마쳐요' : '마이크로 말하기'}><Icon name="mic"/></button>;
}

type Message = PlantChatReply & { id: number; from: 'me' | 'friend' | 'action' };
type Flags = Omit<PlantChatReply, 'text'>;
const REPLY_DELAY_MS = 650; // a short "typing" pause reads as listening, not as a machine

function useConversation(intro: string, trackWords: boolean, onReply?: (text: string, emotion: Emotion, flags: Flags, play: boolean) => void) {
  const keys = usePersonalGarden()?.apiKeys;
  const [messages, setMessages] = useState<Message[]>(() => [{ id: 0, from: 'friend', text: intro }]);
  const [typing, setTyping] = useState(false);
  const [error, setError] = useState('');
  const nextId = useRef(1);
  const pending = useRef<AbortController | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => { pending.current?.abort(); clearTimeout(timer.current); }, []);

  const add = (from: Message['from'], text: string, flags: Flags = {}) =>
    setMessages(all => [...all.slice(-60), { id: nextId.current++, from, text, ...flags }]);
  const respond = (text: string, emotion: Emotion, flags: Flags = {}, play = true) => {
    add('friend', text, flags);
    onReply?.(text, emotion, flags, play);
  };
  const say = (raw: string) => {
    const full = raw.trim();
    if (!full) return false;
    const reply = friendReply(full); // Screen the whole dictation before limiting what can be sent.
    if (pending.current && !reply.safety) return false;
    pending.current?.abort();
    clearTimeout(timer.current);
    const text = full.slice(0, PLANT_CHAT_TEXT_LIMIT);
    add('me', text, { safety: reply.safety });
    setError('');
    if (trackWords) try { recordUtterance(text); } catch { setError('이야기의 단어 수를 저장하지 못했어요.'); }
    const defaultReply = () => respond(reply.text, reply.emotion, { safety: reply.safety, support: reply.support });
    if (reply.safety) {
      pending.current = null;
      setTyping(false);
      defaultReply();
      return true;
    }

    const run = new AbortController();
    pending.current = run;
    setTyping(true);
    const done = () => {
      if (pending.current === run) { pending.current = null; setTyping(false); }
    };
    if (!keys?.openai) {
      timer.current = setTimeout(() => { done(); defaultReply(); }, REPLY_DELAY_MS);
      return true;
    }

    const turns = messages.filter(message => message.id !== 0 && message.from !== 'action' && !message.safety)
      .slice(-(PLANT_CHAT_HISTORY_LIMIT - 1)).map(message => ({
        role: message.from === 'me' ? 'user' : 'assistant', text: message.text.slice(0, PLANT_CHAT_TEXT_LIMIT),
      }));
    void fetch('/api/plant-chat', {
      method: 'POST', cache: 'no-store',
      headers: {
        'Content-Type': 'application/json', [OPENAI_KEY_HEADER]: keys.openai,
        ...(keys.edrug ? { [EDRUG_KEY_HEADER]: keys.edrug } : {}),
        ...(keys.gov24 ? { [GOV24_KEY_HEADER]: keys.gov24 } : {}),
      },
      body: JSON.stringify({ turns: [...turns, { role: 'user', text }] }),
      signal: AbortSignal.any([run.signal, AbortSignal.timeout(32_000)]),
    }).then(async response => {
      if (!response.ok) throw new Error('chat-unavailable');
      const answer = await response.json() as PlantChatReply;
      if (!answer.text || typeof answer.text !== 'string') throw new Error('invalid-reply');
      if (!run.signal.aborted) respond(answer.text, reply.emotion, answer);
    }).catch(() => {
      if (!run.signal.aborted) {
        setError('OpenAI 연결을 확인해 주세요. 지금은 기본 답변으로 이어가요.');
        defaultReply();
      }
    }).finally(done);
    return true;
  };
  return { messages, typing, error, connected: !!keys?.openai, add, respond, say };
}

/** The friend's home, filling the screen: help balloon, level and diary shortcut on top, the friend with its
 *  speech bubble in the middle, the mic + chat bar at the bottom. Sentences live only in memory; only word
 *  counts are saved (voice.ts). */
export default function TalkToFriend({ id, name, low, intro, sceneClass, children, growth, outfit, news, onOpen, onWriteDiary, demoControls }: {
  id: CompanionId; name: string; low: boolean; intro: string; sceneClass: string; children: ReactNode;
  growth: Growth; outfit?: Outfit; news?: ReactNode; onOpen: (view: 'dress' | 'support') => void; onWriteDiary: () => void;
  demoControls?: DemoPlantControls;
}) {
  const [bubble, setBubble] = useState(intro);
  // Once a crisis reply appears, the help link stays until the user leaves this screen, whatever comes next.
  const [safety, setSafety] = useState(false);
  const [support, setSupport] = useState(false);
  const [emote, setEmote] = useState<{ kind: Emotion; key: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<'actions' | 'moods' | null>(null);
  const [help, setHelp] = useState(false);
  const opener = useRef<HTMLElement | null>(null);
  const { messages, typing, error, connected, add, respond, say } = useConversation(intro, true, (text, emotion, flags, play) => {
    setBubble(text.length > 105 ? text.slice(0, 105) + '…' : text);
    if (flags.safety) setSafety(true);
    if (flags.support) setSupport(true);
    if (play) setEmote({ kind: emotion, key: Date.now() });
  });
  // A gesture on the character already played its own animation, so only the words follow.
  const interact = (kind: InteractionId, byGesture = false) => {
    const action = INTERACTIONS.find(entry => entry.id === kind)!;
    if (!unlocked(growth, action.unlock)) { respond(`조금 더 함께 자라면 같이 할 수 있어! ${unlockLabel(action.unlock!)}에 열려요.`, 'curious'); return; }
    add('action', action.done);
    respond(action.line, action.emotion, {}, !byGesture);
  };
  const speech = useSpeech(say);
  const remember = (from?: Element | null) => { opener.current = from instanceof HTMLElement ? from : document.activeElement instanceof HTMLElement ? document.activeElement : null; };
  // The bubble re-mounts with every new line, so a detached opener hands focus to the talk bar instead.
  const giveBackFocus = () => requestAnimationFrame(() => (opener.current?.isConnected ? opener.current : document.querySelector<HTMLElement>('.talk-open'))?.focus());
  const openChat = (from?: Element | null) => { remember(from); setMenu(null); setOpen(true); };
  const closeChat = () => { setOpen(false); giveBackFocus(); };
  const closeMenu = () => { setMenu(null); giveBackFocus(); };
  const toggleMenu = (from?: Element | null) => { if (menu) closeMenu(); else { remember(from); setOpen(false); setMenu('actions'); } };
  const openHelp = (from: HTMLElement) => { remember(from); setMenu(null); setHelp(true); };
  const pick = (choice: string) => {
    if (choice === 'set-mood' && demoControls) { setMenu('moods'); return; }
    if (menu === 'moods') {
      const mood = DEMO_PLANT_MOODS.find(option => option.id === choice);
      if (mood) demoControls?.onChange({ mood: mood.id });
      closeMenu();
      return;
    }
    setMenu(null);
    if (choice === 'talk') openChat(opener.current);
    else if (choice === 'dress' || choice === 'support') onOpen(choice);
    else { interact(choice as InteractionId); giveBackFocus(); }
  };
  const mood = demoControls?.settings.mood;
  const expression = mood === 'auto' ? undefined : mood;
  const menuItems: MenuItem[] = menu === 'moods'
    ? DEMO_PLANT_MOODS.map(option => ({ ...option, selected: option.id === mood }))
    : [
    ...(demoControls ? [{ id: 'set-mood', label: '기분', icon: 'smile' } as const] : []),
    ...INTERACTIONS.map(action => ({ id: action.id, label: action.label, icon: action.id, locked: unlocked(growth, action.unlock) ? undefined : unlockLabel(action.unlock!) })),
    { id: 'talk', label: '이야기하기', icon: 'talk' }, { id: 'dress', label: '옷 입히기', icon: 'dress' }, { id: 'support', label: '도움 찾기', icon: 'support' },
  ];
  const live = speech.listening ? speech.heard || '듣고 있어요… 말을 마치면 전해 줄게요' : bubble;
  const hearts = '♥︎'.repeat(growth.bond.level) + '♡︎'.repeat(3 - growth.bond.level);

  return <>
    <div className={sceneClass + (menu ? ' pet-scene--menu' : '') + (open ? ' pet-scene--chat' : '') + (outfit?.head ? ' pet-scene--hat' : '')}>
      <div className="pet-ground" aria-hidden="true"/>
      <div className="pet-hud">
        <button type="button" className="pet-help" onClick={event => openHelp(event.currentTarget)} aria-label="도움말: 함께 노는 법과 성장 단계">
          <Icon name="help" size={20}/><span>도움말</span></button>
        <button type="button" className="pet-level" onClick={event => openHelp(event.currentTarget)} aria-haspopup="dialog"
          aria-label={demoControls ? `성장 조절 · ${growth.tree.stage.name} · 친밀도 ${growth.bond.level}단계` : `${name} ${growth.tree.stage.name}, 함께 자란 날 ${growth.tree.days}일. 성장 도움말 열기`}>
          <strong>{growth.tree.stage.name}{demoControls && <Icon name="edit" size={13}/>}</strong><span aria-hidden="true">{hearts}</span></button>
        <button type="button" className="pet-diary-shortcut" onClick={onWriteDiary} aria-label="오늘 일기 바로가기">
          <Icon name="journal" size={23}/></button>
      </div>
      {news && <div className="pet-news">{news}</div>}
      {menu && <button type="button" className="pet-menu-backdrop" aria-label="메뉴 닫기" tabIndex={-1} onClick={closeMenu}/>}
      <div className="pet-stage">
        {children}
        {!menu && <button type="button" key={speech.listening ? 'live' : live} className={'friend-bubble' + (speech.listening ? ' friend-bubble--listening' : '')}
          onClick={event => openChat(event.currentTarget)} aria-label={`${name}: ${live}. 눌러서 대화 열기`}>{live}</button>}
        <p className="sr-only" aria-live="polite">{bubble}</p>
        <div className="hero-plant"><CompanionArt id={id} stage={growth.tree.stage.level} low={expression ? expression === 'low' : low} expression={expression} emote={emote} outfit={outfit} className="plant-art"
          onInteract={kind => interact(kind, true)} onTap={() => toggleMenu(document.activeElement)}/></div>
        {menu && <PetMenu key={menu} items={menuItems} onPick={pick} onClose={closeMenu}
          label={menu === 'moods' ? '식물 기분' : undefined} onBack={menu === 'moods' ? () => setMenu('actions') : undefined}/>}
      </div>
      <div className="pet-bottom">
        <PlantBriefing name={name}/>
        {safety && !open && <a className="friend-help" href="#safety">혼자 견디지 않아도 돼요 · 도움 받을 수 있는 곳 보기 →</a>}
        {support && !open && <a className="friend-help friend-help--support" href="#support">지원 제도 신청 도우미 열기 →</a>}
        {speech.error && !open && <p className="talk-error" role="alert">{speech.error}</p>}
        <div className="talk-bar">
          {speech.supported && <MicButton speech={speech} className="talk-mic" disabled={typing}/>}
          <button type="button" className="talk-open" onClick={event => openChat(event.currentTarget)}>
            <Icon name="chat"/><span>{speech.listening ? '듣고 있어요. 다 말하면 마이크를 한 번 더 눌러요' : `${name}에게 이야기하기`}</span>
          </button>
        </div>
      </div>
    </div>
    {open && <ChatSheet id={id} stage={growth.tree.stage.level} name={name} messages={messages} typing={typing} speech={speech} error={error} connected={connected}
      actions={INTERACTIONS.filter(action => unlocked(growth, action.unlock))} onSend={say} onInteract={kind => interact(kind)} onClose={closeChat}/>}
    {help && <HelpSheet name={name} growth={growth} onDemoChange={demoControls?.onChange} onClose={() => { setHelp(false); giveBackFocus(); }}/>}
  </>;
}

export function HomePlantChat({ name, onSupport }: { name: string; onSupport: () => void }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const conversation = useConversation(GREETING, false);
  const speech = useSpeech(conversation.say);
  const close = () => { setOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  return <>
    <button ref={trigger} type="button" className="plant-briefing-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <Icon name="chat" size={17}/>화분과 대화하기
    </button>
    {open && <ChatSheet id="bonsai" stage={1} name={name} {...conversation} speech={speech} onSend={conversation.say}
      onClose={close} onSupport={() => { close(); onSupport(); }} safetyHref="/demo#safety"/>}
  </>;
}

function ChatSheet({ id, stage, name, messages, typing, speech, error, connected, actions, onSend, onInteract, onClose, onSupport, safetyHref = '#safety' }: {
  id: CompanionId; stage: TreeLevel; name: string; messages: Message[]; typing: boolean; speech: Speech; error: string; connected: boolean;
  actions?: readonly (typeof INTERACTIONS)[number][]; onSend: (text: string) => boolean; onInteract?: (kind: InteractionId) => void; onClose: () => void;
  onSupport?: () => void; safetyHref?: string;
}) {
  const [text, setText] = useState('');
  const log = useRef<HTMLOListElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const closer = useRef(onClose);
  useEffect(() => { closer.current = onClose; });
  useEffect(() => {
    close.current?.focus(); // keyboard and screen-reader users land inside the sheet
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') closer.current(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, []);
  useEffect(() => { const el = log.current; if (el) el.scrollTop = el.scrollHeight; }, [messages.length, typing, speech.heard]);
  const notice = speech.error || error;
  // Portal: the screen's entry animation (a transform) would otherwise trap the sheet inside the scroller.
  return createPortal(<section className="chat-sheet" role="dialog" aria-modal="false" aria-labelledby="chat-title">
    <header className="chat-head">
      <Image className="chat-avatar" src={`/trees/${id}-${stage}.webp`} alt="" width={44} height={44} unoptimized/>
      <div><h2 id="chat-title">{name}</h2><p>{connected ? 'OpenAI 연결 · 보낸 말과 최근 대화로 답해요' : '기기에서 기본 답변을 사용해요'}</p></div>
      <button type="button" ref={close} className="chat-close" onClick={onClose} aria-label="대화 닫기"><Icon name="close"/></button>
    </header>
    <ol className="chat-log" ref={log} aria-live="polite">
      {messages.map(m => <li key={m.id} className={'chat-msg chat-msg--' + m.from}>{m.text}
        {m.source && <ChatSources source={m.source} typing={typing} onSend={onSend}/>}
        {m.from === 'friend' && m.safety && <a className="chat-help" href={safetyHref}>도움 받을 수 있는 곳 보기</a>}
        {m.support && (onSupport ? <button type="button" className="chat-help" onClick={onSupport}>지원 제도 조회 열기</button>
          : <a className="chat-help" href="#support">지원 제도 신청 도우미 열기</a>)}</li>)}
      {speech.listening && speech.heard && <li className="chat-msg chat-msg--me chat-msg--live">{speech.heard}</li>}
      {typing && <li className="chat-msg chat-msg--friend chat-typing" aria-label={`${name}가 답을 쓰고 있어요`}><i/><i/><i/></li>}
    </ol>
    <div className="chat-feelings" role="group" aria-label="지금 마음 전하기">
      {FEELINGS.map(feeling => <button key={feeling.label} type="button" disabled={typing} onClick={() => onSend(feeling.text)}>{feeling.label}</button>)}
    </div>
    {!!actions?.length && <div className="chat-actions" role="group" aria-label={`${name}와 함께하기`}>
      {actions.map(action => <button key={action.id} type="button" onClick={() => onInteract?.(action.id)}><Icon name={action.id} size={20}/><span>{action.label}</span></button>)}
    </div>}
    {notice && <p className="chat-error" role="alert">{notice}</p>}
    <form className="chat-compose" onSubmit={event => { event.preventDefault(); if (onSend(text)) setText(''); }}>
      {speech.supported && <MicButton speech={speech} className="chat-mic" disabled={typing}/>}
      <label htmlFor="chat-text" className="sr-only">{name}에게 보낼 말</label>
      <input id="chat-text" value={text} maxLength={PLANT_CHAT_TEXT_LIMIT} enterKeyHint="send" autoComplete="off" onChange={event => setText(event.target.value)}
        placeholder={speech.listening ? '듣고 있어요…' : '마음을 편하게 적어 보세요'}/>
      <button type="submit" className="chat-send" disabled={!text.trim()} aria-label="보내기"><Icon name="send"/></button>
    </form>
    <p className="chat-note">음성은 브라우저가 글자로 바꿔요(Chrome은 Google 서버 사용). 위급하면 109 · 112 · 119로 연락해 주세요.</p>
  </section>, document.querySelector('.phone-frame') ?? document.body);
}

function ChatSources({ source, typing, onSend }: { source: PlantChatSource; typing: boolean; onSend: (text: string) => boolean }) {
  if (source.kind === 'medicine-options') return <ul className="chat-sources">{source.names.map(name => <li key={name}>
    <button type="button" className="shop-secondary" disabled={typing} onClick={() => onSend(name + ' 약 정보 알려줘')}>{name}</button>
  </li>)}</ul>;
  if (source.kind === 'policies') return <ul className="chat-sources">{source.items.map(item => <li key={item.id}>
    <strong>{item.name}</strong>{item.agency && <small>{item.agency}</small>}{item.summary && <p>{item.summary}</p>}
    <a href={item.url || 'https://www.gov.kr/'} target="_blank" rel="noreferrer">정부24 공식 안내 ↗</a>
  </li>)}</ul>;
  const product = source.product;
  const sections = [['효능', product.effect], ['공식 복용 방법', product.howToUse],
    ['알레르기·사용상 주의사항', product.precautions], ['함께 복용할 때 주의사항', product.interactions]];
  return <div className="chat-sources">
    <strong>{product.name}</strong>{product.manufacturer && <small>{product.manufacturer}</small>}
    {sections.map(([label, value]) => <details key={label}>
      <summary>{label}</summary><p>{value || '제품의 상세 허가사항이나 포장을 확인해 주세요.'}</p>
    </details>)}
    <a href={medicineDetailUrl(product.code)} target="_blank" rel="noreferrer">식약처 제품 정보 ↗</a>
  </div>;
}
