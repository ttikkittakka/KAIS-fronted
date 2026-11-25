'use client';

import { useRef, useState } from 'react';
import { Button } from '@astryxdesign/core/Button';
import { nativeDevice, nativePhoto } from '../native-bridge';
import CameraCapture, { cameraSupported } from './CameraCapture';
import { Icon } from './PetIcon';

export default function MissionPhotoInput({ label, disabled, uploadOnly, onPhoto }: {
  label: string; disabled?: boolean; uploadOnly?: boolean; onPhoto: (photo: File) => void;
}) {
  const upload = useRef<HTMLInputElement>(null);
  const camera = useRef<HTMLInputElement>(null);
  const [shooting, setShooting] = useState(false);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState('');
  const forward = (photo?: File) => { if (photo && !disabled) { setError(''); onPhoto(photo); } };

  async function capture() {
    setError('');
    if (!nativeDevice()) {
      if (cameraSupported()) setShooting(true);
      else camera.current?.click();
      return;
    }
    setOpening(true);
    try { forward(await nativePhoto() ?? undefined); }
    catch (error) { setError(error instanceof Error ? error.message : '카메라를 열지 못했어요.'); }
    finally { setOpening(false); }
  }

  return <>
    <div className="quiet-actions">
      {!uploadOnly && <Button icon={<Icon name="camera" size={18}/>} label={label + ' 촬영'} isLoading={opening}
        isDisabled={disabled} onClick={() => void capture()}/>}
      <Button icon={<Icon name="upload" size={18}/>} label={label + ' 선택'} isDisabled={disabled || opening} onClick={() => upload.current?.click()}/>
    </div>
    <input ref={upload} type="file" accept="image/*" aria-label={label + ' 파일'} hidden onChange={event => {
      const photo = event.target.files?.[0];
      event.target.value = '';
      forward(photo);
    }}/>
    {!uploadOnly && <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={event => {
      const photo = event.target.files?.[0];
      event.target.value = '';
      forward(photo);
    }}/>}
    {shooting && <CameraCapture onShot={forward} onClose={() => setShooting(false)}/>}
    {error && <p role="alert" className="quiet-note">{error}</p>}
  </>;
}
