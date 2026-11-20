import type { VisionKind } from './mission-policy';

const VISION_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.2.3/wasm';
const POSE = 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task';
const OBJECT = 'https://storage.googleapis.com/mediapipe-models/object_detector/efficientdet_lite0/int8/1/efficientdet_lite0.tflite';

type Landmark = { y: number; visibility: number };
export function armsRaised(points: Landmark[] | undefined) {
  if (!points || points.length < 17) return false;
  // Shoulders, elbows and wrists. Facial landmarks are not used or retained.
  return [[11, 13, 15], [12, 14, 16]].every(([s, e, w]) =>
    [s, e, w].every(index => points[index].visibility >= 0.6) &&
    points[w].y < points[s].y - 0.025 && points[e].y < points[s].y + 0.12);
}

async function loadFrame(file: File) {
  if (!file.type.startsWith('image/') || file.size > 15_000_000) throw new Error('15MB보다 작은 사진을 골라 주세요.');
  const url = URL.createObjectURL(file);
  try {
    const image = new window.Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('사진을 열지 못했어요.');
    const scale = Math.min(1, 768 / Math.max(image.naturalWidth, image.naturalHeight));
    const frame = document.createElement('canvas');
    frame.width = Math.round(image.naturalWidth * scale);
    frame.height = Math.round(image.naturalHeight * scale);
    const ctx = frame.getContext('2d');
    if (!ctx) throw new Error('카메라 장면을 준비하지 못했어요.');
    ctx.drawImage(image, 0, 0, frame.width, frame.height);
    return frame;
  } finally { URL.revokeObjectURL(url); }
}

export async function checkMissionPhoto(file: File, kind: VisionKind) {
  const frame = await loadFrame(file);
  try {
    const { FilesetResolver, ObjectDetector, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const wasm = await FilesetResolver.forVisionTasks(VISION_WASM);
    if (kind === 'cup') {
      const model = await ObjectDetector.createFromOptions(wasm, {
        baseOptions: { modelAssetPath: OBJECT, delegate: 'CPU' }, runningMode: 'IMAGE',
        maxResults: 3, categoryAllowlist: ['cup'], scoreThreshold: 0.55,
      });
      try { return model.detect(frame).detections.some(item => item.categories.some(value => value.categoryName === 'cup')); }
      finally { model.close(); }
    }
    const model = await PoseLandmarker.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: POSE, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1,
    });
    try { return armsRaised(model.detect(frame).landmarks[0]); }
    finally { model.close(); }
  } finally { frame.width = 0; frame.height = 0; }
}
