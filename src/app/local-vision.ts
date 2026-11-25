import type { VisionKind } from './mission-photo';
import { loadPhotoFrame } from './photo-frame';

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

const objectCategories = {
  cup: ['cup'],
  book: ['book'],
  meal: ['sandwich', 'hot dog', 'pizza', 'donut', 'cake'],
};

export async function checkMissionPhoto(file: File, kind: Exclude<VisionKind, 'music'>) {
  const frame = await loadPhotoFrame(file, 768);
  try {
    const { FilesetResolver, ObjectDetector, PoseLandmarker } = await import('@mediapipe/tasks-vision');
    const wasm = await FilesetResolver.forVisionTasks(VISION_WASM);
    if (kind !== 'arms') {
      const model = await ObjectDetector.createFromOptions(wasm, {
        baseOptions: { modelAssetPath: OBJECT, delegate: 'CPU' }, runningMode: 'IMAGE',
        maxResults: 3, categoryAllowlist: objectCategories[kind], scoreThreshold: 0.7,
      });
      try {
        return model.detect(frame).detections.some(item => {
          const box = item.boundingBox;
          return !!box && box.width * box.height >= frame.width * frame.height * 0.12;
        });
      }
      finally { model.close(); }
    }
    const model = await PoseLandmarker.createFromOptions(wasm, {
      baseOptions: { modelAssetPath: POSE, delegate: 'CPU' }, runningMode: 'IMAGE', numPoses: 1,
    });
    try { return armsRaised(model.detect(frame).landmarks[0]); }
    finally { model.close(); }
  } finally { frame.width = 0; frame.height = 0; }
}
