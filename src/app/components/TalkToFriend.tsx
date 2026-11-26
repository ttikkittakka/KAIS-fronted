'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import Image from 'next/image';
import { CompanionArt } from './Companions';
import { FEELINGS, INTERACTIONS, friendReply, unlockLabel, type Emotion, type InteractionId } from '../chat';
import { recordUtterance } from '../voice';
import { unlocked, type Growth, type TreeLevel } from '../pet-growth';
import type { CompanionId } from '../companions';
import { DEMO_PLANT_MOODS, type DemoPlantControls } from '../demo-plant';
import type { Outfit } from '../wardrobe';
import { Icon } from './PetIcon';
import { HelpSheet, PetMenu, type MenuItem } from './PetMenu';
import PlantBriefing from './PlantBriefing';

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

function MicButton({ speech, className }: { speech: Speech; className: string }) {
  return <button type="button" className={className} aria-pressed={speech.listening} onClick={speech.toggle}
    aria-label={speech.listening ? '듣고 있어요. 누르면 말하기를 마쳐요' : '마이크로 말하기'}><Icon name="mic"/></button>;
}

type Message = { id: number; from: 'me' | 'friend' | 'action'; text: string; safety?: boolean; support?: boolean };
type Flags = { safety?: boolean; support?: boolean };
const REPLY_DELAY_MS = 650; // a short "typing" pause reads as listening, not as a machine

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
  const [messages, setMessages] = useState<Message[]>(() => [{ id: 0, from: 'friend', text: intro }]);
  const [typing, setTyping] = useState(false);
  const [open, setOpen] = useState(false);
  const [menu, setMenu] = useState<'actions' | 'moods' | null>(null);
  const [help, setHelp] = useState(false);
  const [saveError, setSaveError] = useState('');
  const nextId = useRef(1);
  const opener = useRef<HTMLElement | null>(null);
  const timers = useRef(new Set<ReturnType<typeof setTimeout>>());
  useEffect(() => { const pending = timers.current; return () => pending.forEach(clearTimeout); }, []);

  const add = (from: Message['from'], text: string, flags: Flags = {}) =>
    setMessages(all => [...all.slice(-60), { id: nextId.current++, from, text, ...flags }]);
  const respond = (text: string, emotion: Emotion, flags: Flags = {}, play = true) => {
    add('friend', text, flags);
    setBubble(text);
    if (flags.safety) setSafety(true);
    if (flags.support) setSupport(true);
    if (play) setEmote({ kind: emotion, key: Date.now() });
  };
  const say = (raw: string) => {
    const full = raw.trim();
    if (!full) return;
    const reply = friendReply(full); // screened before the cap, so a long dictation cannot hide a crisis phrase
    const text = full.slice(0, 300);
    add('me', text);
    try { recordUtterance(text); setSaveError(''); } catch { setSaveError('이야기의 단어 수를 저장하지 못했어요. 대화는 계속할 수 있어요.'); }
    setTyping(true);
    const timer = setTimeout(() => { timers.current.delete(timer); setTyping(false); respond(reply.text, reply.emotion, { safety: reply.safety, support: reply.support }); }, REPLY_DELAY_MS);
    timers.current.add(timer);
  };
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
          {speech.supported && <MicButton speech={speech} className="talk-mic"/>}
          <button type="button" className="talk-open" onClick={event => openChat(event.currentTarget)}>
            <Icon name="chat"/><span>{speech.listening ? '듣고 있어요. 다 말하면 마이크를 한 번 더 눌러요' : `${name}에게 이야기하기`}</span>
          </button>
        </div>
      </div>
    </div>
    {open && <ChatSheet id={id} stage={growth.tree.stage.level} name={name} messages={messages} typing={typing} speech={speech} saveError={saveError}
      actions={INTERACTIONS.filter(action => unlocked(growth, action.unlock))} onSend={say} onInteract={kind => interact(kind)} onClose={closeChat}/>}
    {help && <HelpSheet name={name} growth={growth} onDemoChange={demoControls?.onChange} onClose={() => { setHelp(false); giveBackFocus(); }}/>}
  </>;
}

function ChatSheet({ id, stage, name, messages, typing, speech, saveError, actions, onSend, onInteract, onClose }: {
  id: CompanionId; stage: TreeLevel; name: string; messages: Message[]; typing: boolean; speech: Speech; saveError: string;
  actions: readonly (typeof INTERACTIONS)[number][]; onSend: (text: string) => void; onInteract: (kind: InteractionId) => void; onClose: () => void;
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
  const error = speech.error || saveError;
  // Portal: the screen's entry animation (a transform) would otherwise trap the sheet inside the scroller.
  return createPortal(<section className="chat-sheet" role="dialog" aria-modal="false" aria-labelledby="chat-title">
    <header className="chat-head">
      <Image className="chat-avatar" src={`/trees/${id}-${stage}.webp`} alt="" width={44} height={44} unoptimized/>
      <div><h2 id="chat-title">{name}</h2><p>대화는 저장되지 않아요 · 자주 쓴 단어 수만 기기에 남아요</p></div>
      <button type="button" ref={close} className="chat-close" onClick={onClose} aria-label="대화 닫기"><Icon name="close"/></button>
    </header>
    <ol className="chat-log" ref={log} aria-live="polite">
      {messages.map(m => <li key={m.id} className={'chat-msg chat-msg--' + m.from}>{m.text}
        {m.safety && <a className="chat-help" href="#safety">도움 받을 수 있는 곳 보기</a>}
        {m.support && <a className="chat-help" href="#support">지원 제도 신청 도우미 열기</a>}</li>)}
      {speech.listening && speech.heard && <li className="chat-msg chat-msg--me chat-msg--live">{speech.heard}</li>}
      {typing && <li className="chat-msg chat-msg--friend chat-typing" aria-label={`${name}가 답을 쓰고 있어요`}><i/><i/><i/></li>}
    </ol>
    <div className="chat-feelings" role="group" aria-label="지금 마음 전하기">
      {FEELINGS.map(feeling => <button key={feeling.label} type="button" onClick={() => onSend(feeling.text)}>{feeling.label}</button>)}
    </div>
    <div className="chat-actions" role="group" aria-label={`${name}와 함께하기`}>
      {actions.map(action => <button key={action.id} type="button" onClick={() => onInteract(action.id)}><Icon name={action.id} size={20}/><span>{action.label}</span></button>)}
    </div>
    {error && <p className="chat-error" role="alert">{error}</p>}
    <form className="chat-compose" onSubmit={event => { event.preventDefault(); onSend(text); setText(''); }}>
      {speech.supported && <MicButton speech={speech} className="chat-mic"/>}
      <label htmlFor="chat-text" className="sr-only">{name}에게 보낼 말</label>
      <input id="chat-text" value={text} maxLength={300} enterKeyHint="send" autoComplete="off" onChange={event => setText(event.target.value)}
        placeholder={speech.listening ? '듣고 있어요…' : '마음을 편하게 적어 보세요'}/>
      <button type="submit" className="chat-send" disabled={!text.trim()} aria-label="보내기"><Icon name="send"/></button>
    </form>
    <p className="chat-note">음성은 브라우저가 글자로 바꿔요(Chrome은 Google 서버 사용). 위급하면 109 · 112 · 119로 연락해 주세요.</p>
  </section>, document.querySelector('.phone-frame') ?? document.body);
}
