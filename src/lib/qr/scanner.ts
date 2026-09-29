// Reading QR codes from the camera.
//
// Chrome on Android reads QR codes itself, through BarcodeDetector. Safari
// does not, and every browser on an iPhone is Safari underneath, so there jsQR
// reads them. It is loaded only when a reader opens the scanner, so nobody who
// never scans downloads it. Frames never leave the device.

/** The part of the Barcode Detection API used here. TypeScript's DOM types lack it. */
interface NativeDetector {
  detect(source: CanvasImageSource): Promise<readonly { rawValue: string }[]>;
}

interface NativeDetectorClass {
  new (options: { formats: string[] }): NativeDetector;
  getSupportedFormats(): Promise<string[]>;
}

/** Reads the QR code in one frame, or null when there is none. */
type Reader = (video: HTMLVideoElement) => Promise<string | null>;

/**
 * How often a frame is read. Fast enough that a code is picked up as soon as
 * it is steady in view, slow enough that a phone does not warm up doing it.
 */
const READ_EVERY_MS = 150;

/**
 * The widest a frame is read at. A code held up to a phone fills much of the
 * picture, so this is plenty, and jsQR's time grows with every pixel.
 */
const READ_WIDTH = 640;

async function nativeReader(): Promise<Reader | null> {
  const Detector = (globalThis as { BarcodeDetector?: NativeDetectorClass }).BarcodeDetector;
  if (Detector === undefined) return null;
  if (!(await Detector.getSupportedFormats()).includes("qr_code")) return null;

  const detector = new Detector({ formats: ["qr_code"] });
  return async (video) => (await detector.detect(video))[0]?.rawValue ?? null;
}

async function jsQrReader(): Promise<Reader> {
  const { default: jsQR } = await import("jsqr");
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d", { willReadFrequently: true });

  return (video) => {
    if (context === null) return Promise.resolve(null);
    const scale = Math.min(1, READ_WIDTH / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * scale);
    canvas.height = Math.round(video.videoHeight * scale);
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    // The app's codes are dark on light, so the inverted pass is wasted time.
    const code = jsQR(frame.data, frame.width, frame.height, { inversionAttempts: "dontInvert" });
    return Promise.resolve(code?.data ?? null);
  };
}

/** Why the camera could not be used. */
export type CameraProblem = "blocked" | "missing" | "unknown";

function problemOf(error: unknown): CameraProblem {
  if (error instanceof DOMException && error.name === "NotAllowedError") return "blocked";
  if (error instanceof DOMException && error.name === "NotFoundError") return "missing";
  return "unknown";
}

/**
 * Whether this device is one people scan with: a touch screen with a camera.
 * A laptop may have a camera, but nobody holds a laptop up to a code.
 */
export async function canScan(): Promise<boolean> {
  if (!matchMedia("(pointer: coarse)").matches) return false;
  // Missing outside a secure context, such as the dev server opened over the
  // network on a phone, whatever TypeScript's types say.
  if (!("mediaDevices" in navigator)) return false;
  const devices = await navigator.mediaDevices.enumerateDevices();
  return devices.some((device) => device.kind === "videoinput");
}

/**
 * Shows the back camera in `video` and reads every code that comes into view,
 * until the returned function is called. Each code is passed to `onRead`, as
 * often as it stays in view: the caller decides what to do with it.
 */
export async function scan(
  video: HTMLVideoElement,
  onRead: (text: string) => void,
): Promise<{ stop: () => void } | { problem: CameraProblem }> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });
  } catch (error) {
    // The reader said no, or there is no camera. Nothing can prevent either,
    // and the scanner says which one it was.
    return { problem: problemOf(error) };
  }

  video.srcObject = stream;
  // iOS shows a camera feed inline only when told to, and plays it only muted.
  video.setAttribute("playsinline", "");
  video.muted = true;
  await video.play();

  const read = (await nativeReader()) ?? (await jsQrReader());
  // An object, so a stop that lands while a frame is being read is seen after it.
  const run = { isStopped: false, timer: 0 };

  const next = async (): Promise<void> => {
    // Nothing to read until the first frame has arrived.
    const text = video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA ? await read(video) : null;
    if (run.isStopped) return;
    if (text !== null) onRead(text);
    run.timer = window.setTimeout(() => void next(), READ_EVERY_MS);
  };
  void next();

  return {
    stop: () => {
      run.isStopped = true;
      window.clearTimeout(run.timer);
      for (const track of stream.getTracks()) track.stop();
      video.srcObject = null;
    },
  };
}
