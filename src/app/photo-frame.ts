/** Decode a local capture and re-render it without camera metadata. */
export async function loadPhotoFrame(file: File, maxSide: number) {
  if (!file.type.startsWith('image/') || file.size > 15_000_000) throw new Error('15MB보다 작은 사진을 골라 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    try { await image.decode(); }
    catch { throw new Error('사진을 열지 못했어요. JPG 또는 PNG로 다시 올려 주세요.'); }
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('사진을 열지 못했어요.');
    const scale = Math.min(1, maxSide / Math.max(image.naturalWidth, image.naturalHeight));
    const frame = document.createElement('canvas');
    frame.width = Math.max(1, Math.round(image.naturalWidth * scale));
    frame.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = frame.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('사진을 준비하지 못했어요.');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, frame.width, frame.height);
    ctx.drawImage(image, 0, 0, frame.width, frame.height);
    return frame;
  } finally { URL.revokeObjectURL(url); }
}
