import { medicineLabelsFromText } from './medicine-label';
import { loadPhotoFrame } from './photo-frame';

/** Only OCR code and language data are fetched. The source image stays in the browser worker. */
export async function readMedicinePhoto(file: File, signal: AbortSignal) {
  const frame = await loadPhotoFrame(file, 1600);
  const deadline = AbortSignal.any([signal, AbortSignal.timeout(45_000)]);
  const { createWorker, PSM } = await import('tesseract.js');
  let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
  let stop: (() => void) | undefined;
  try {
    deadline.throwIfAborted();
    const work = async () => {
      const active = await createWorker(['kor', 'eng']);
      if (deadline.aborted) {
        await active.terminate();
        deadline.throwIfAborted();
      }
      worker = active;
      // Treat a close-up of a single line and a short block of label text alike.
      await active.setParameters({ tessedit_pageseg_mode: PSM.SINGLE_BLOCK });
      const { data } = await active.recognize(frame);
      // A noisy read can suggest a retake, never a label match.
      return data.confidence >= 65 ? medicineLabelsFromText(data.text) : [];
    };
    const cancelled = new Promise<never>((_, reject) => {
      stop = () => reject(deadline.reason);
      deadline.addEventListener('abort', stop, { once: true });
    });
    return await Promise.race([cancelled, work()]);
  } finally {
    if (stop) deadline.removeEventListener('abort', stop);
    frame.width = 0; frame.height = 0;
    if (worker) await worker.terminate();
  }
}
