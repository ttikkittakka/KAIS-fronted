'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

export const cameraSupported = () => typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext;

const cameraError = (error: unknown) => {
  const name = error && typeof error === 'object' && 'name' in error ? String(error.name) : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return '카메라 권한이 꺼져 있어요. 브라우저 주소창의 권한 설정에서 카메라를 허용해 주세요.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return '사용할 수 있는 카메라를 찾지 못했어요.';
  if (name === 'NotReadableError') return '다른 앱이 카메라를 쓰고 있어요. 그 앱을 닫고 다시 시도해 주세요.';
  return '카메라를 열지 못했어요. 사진 선택으로 올려도 괜찮아요.';
};

/** Live in-app camera. The frame is only handed to onShot as a JPEG file; nothing is stored here. */
export default function CameraCapture({ onShot, onClose }: { onShot: (file: File) => void; onClose: () => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [facing, setFacing] = useState<'environment' | 'user'>('environment');
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let active = true;
    navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: facing }, width: { ideal: 1600 }, height: { ideal: 1600 } }, audio: false })
      .then(s => {
        if (!active) { s.getTracks().forEach(t => t.stop()); return; }
        stream = s;
        if (video.current) { video.current.srcObject = s; void video.current.play().then(() => active && setReady(true)).catch(() => active && setError(cameraError(null))); }
      })
      .catch(e => { if (active) setError(cameraError(e)); });
    // Stopping every track turns the camera light off as soon as the sheet closes.
    return () => { active = false; stream?.getTracks().forEach(t => t.stop()); };
  }, [facing]);

  useEffect(() => {
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  const shoot = () => {
    const v = video.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth; canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) { setError(cameraError(null)); return; }
    // The front camera preview is mirrored, so the saved photo matches what the user saw.
    if (facing === 'user') { ctx.translate(canvas.width, 0); ctx.scale(-1, 1); }
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(blob => {
      if (!blob) { setError('사진을 만들지 못했어요. 다시 찍어 주세요.'); return; }
      onShot(new File([blob], 'camera.jpg', { type: 'image/jpeg' }));
      onClose();
    }, 'image/jpeg', 0.92);
  };

  // Portal: an animated (transformed) ancestor would otherwise trap the sheet inside the scrolling panel.
  return createPortal(<div className="camera-sheet" role="dialog" aria-modal="true" aria-label="사진 촬영">
    <video ref={video} className={'camera-video' + (facing === 'user' ? ' camera-video--mirror' : '')} playsInline muted aria-hidden="true"/>
    {!ready && !error && <p className="camera-status" role="status">카메라를 준비하고 있어요…</p>}
    {error && <p className="camera-status camera-status--error" role="alert">{error}</p>}
    <div className="camera-controls">
      <button type="button" className="camera-round" onClick={onClose} aria-label="촬영 닫기" autoFocus>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18"/></svg>
      </button>
      <button type="button" className="camera-shutter" disabled={!ready} onClick={shoot} aria-label="찍기"><i/></button>
      <button type="button" className="camera-round" onClick={() => { setReady(false); setError(''); setFacing(facing === 'user' ? 'environment' : 'user'); }} aria-label="앞뒤 카메라 바꾸기">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 8h3l1.5-2h7L17 8h3v11H4V8Z"/><path d="M9 13.5a3 3 0 0 1 5.2-2M15 12.5a3 3 0 0 1-5.2 2M14.2 9.6v1.9h-1.9M9.8 16.4v-1.9h1.9"/></svg>
      </button>
    </div>
  </div>, document.querySelector('.phone-frame') ?? document.body);
}
