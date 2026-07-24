"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

type Status = "starting" | "scanning" | "denied" | "unsupported" | "processing";

// A "ready" video frame needs at least this many pixels of width — during
// stream setup videoWidth can transiently report a small bogus value (a
// real camera never legitimately reports single digits) before settling on
// the actual frame size.
const MIN_READY_WIDTH = 50;

export interface ScanResult {
  type: "upc" | "text";
  value: string;
}

export default function ScannerModal({
  onResult,
  onClose,
}: {
  onResult: (result: ScanResult) => void;
  onClose: () => void;
}) {
  const [status, setStatus] = useState<Status>("starting");
  const [debugLine, setDebugLine] = useState("");
  const [errorLine, setErrorLine] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);
  // App.tsx defines onResult fresh on every render (not wrapped in
  // useCallback) — putting it in the setup effect's deps would restart the
  // camera on every unrelated parent re-render. Read the latest version via
  // a ref instead, kept current on every render, so the effect can safely
  // run once per modal mount.
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;

  // TEMPORARY: on-screen diagnostics for "camera doesn't recognize
  // anything" reports that haven't reproduced with a fake test camera.
  // Remove once confirmed fixed from a device screenshot.
  useEffect(() => {
    const id = setInterval(() => {
      const v = videoRef.current;
      const s = streamRef.current;
      const track = s?.getVideoTracks()[0];
      setDebugLine(
        `status=${status} vw=${v?.videoWidth ?? "-"} vh=${v?.videoHeight ?? "-"} ` +
          `readyState=${v?.readyState ?? "-"} paused=${v?.paused ?? "-"} ` +
          `trackState=${track?.readyState ?? "-"} settings=${JSON.stringify(track?.getSettings?.() ?? {})}`,
      );
    }, 400);
    return () => clearInterval(id);
  }, [status]);

  // Runs once per modal open, not per mode switch — barcode/label-text used
  // to be separate tabs, each restarting the camera and its own effect
  // instance on switch. That was the source of a whole category of bugs
  // (races between a cancelled effect and its still-resolving async setup).
  // Now the camera starts once, barcode decoding runs continuously in the
  // background for the whole session, and "Capture" (OCR) is available at
  // any time against whatever's currently in frame — no mode, no restart,
  // no race.
  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      setStatus("starting");
      setErrorLine("");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // ideal (not exact/required) width+height: a real hint improves
          // decode/OCR quality over whatever low-res default the browser
          // might otherwise pick, without forcing a landscape crop — that
          // came from also pinning aspectRatio, which combined with
          // object-fit: cover cropped a wide frame down to a thin vertical
          // strip on a portrait viewport (looked exactly like being zoomed
          // way in). No aspectRatio constraint + object-fit: contain below
          // means whatever shape stream we get is shown in full, never
          // cropped.
          video: { facingMode: "environment", width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as
          | (MediaTrackCapabilities & { zoom?: { min: number }; focusMode?: string[] })
          | undefined;
        const advanced: MediaTrackConstraintSet[] = [];
        // Some devices (mainly Android/Chrome) start a track at >1x
        // optical/digital zoom by default. Not supported on iOS Safari
        // (capabilities.zoom is undefined there) — harmless no-op.
        if (capabilities?.zoom) advanced.push({ zoom: capabilities.zoom.min } as unknown as MediaTrackConstraintSet);
        // Continuous autofocus matters a lot for reading a barcode or label
        // held a few inches from the lens — without it some devices default
        // to a fixed focus distance that's fine for a normal photo but too
        // soft up close to decode. Also unsupported on iOS Safari; no-op.
        if (capabilities?.focusMode?.includes("continuous")) {
          advanced.push({ focusMode: "continuous" } as unknown as MediaTrackConstraintSet);
        }
        if (track && advanced.length) {
          try {
            await track.applyConstraints({ advanced });
          } catch {
            // Not fatal — worst case the user is stuck with the platform default.
          }
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          // play() resolving doesn't reliably mean videoWidth/videoHeight
          // reflect the real frame size yet — videoWidth can briefly report
          // a bogus tiny value before settling, so a plain truthy check
          // isn't enough. Capturing a frame before it's really ready
          // produces a near-empty canvas, which makes canvas.toBlob() hand
          // back null and crashes downstream code expecting a real Blob.
          const deadline = Date.now() + 4000;
          while (videoRef.current.videoWidth < MIN_READY_WIDTH && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        setStatus("scanning");

        const { BrowserMultiFormatReader } = await import("@zxing/browser");
        const reader = new BrowserMultiFormatReader();
        // Note: don't reference the `controls` returned below from inside
        // this callback — on a fast/clean scan it can fire before that
        // `await` resolves and assigns it, throwing a temporal-dead-zone
        // ReferenceError that zxing's scan loop swallows silently (this
        // callback then never gets to call onResult). controlsRef is
        // already-initialized (starts as null) so it's safe to read here.
        const controls = await reader.decodeFromStream(stream, videoRef.current!, (result) => {
          if (result && !cancelled) {
            controlsRef.current?.stop();
            onResultRef.current({ type: "upc", value: result.getText() });
          }
        });
        // The modal could have closed while decodeFromStream was still
        // resolving — stop rather than leak a running loop nothing else
        // will ever stop.
        if (cancelled) {
          controls.stop();
        } else {
          controlsRef.current = controls;
        }
      } catch (err) {
        if (!cancelled) {
          setStatus((err as DOMException)?.name === "NotAllowedError" ? "denied" : "unsupported");
          setErrorLine(`error: ${(err as Error)?.name ?? "?"}: ${(err as Error)?.message ?? String(err)}`);
        }
      }
    }

    start();

    return () => {
      cancelled = true;
      controlsRef.current?.stop();
      controlsRef.current = null;
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function captureAndReadText() {
    if (!videoRef.current || videoRef.current.videoWidth < MIN_READY_WIDTH) return;
    setStatus("processing");

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    ctx?.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    const { default: Tesseract } = await import("tesseract.js");
    // Self-hosted rather than tesseract.js's CDN defaults (jsdelivr) — avoids
    // a third-party runtime dependency for a core scanning feature, and
    // works in network environments that don't allow arbitrary CDN fetches
    // from the browser. See public/tesseract/.
    const {
      data: { text },
    } = await Tesseract.recognize(canvas, "eng", {
      workerPath: "/tesseract/worker.min.js",
      corePath: "/tesseract/core",
      langPath: "/tesseract",
    });

    // Label photos come back noisy (ingredient panel text, etc). Take the
    // longest clean word run as a best-effort product/brand name guess and
    // let the existing search UI's filtering do the real work from there.
    const cleaned = text
      .split(/\n+/)
      .map((line) => line.trim())
      .filter((line) => line.length > 2 && /[A-Za-z]/.test(line))
      .sort((a, b) => b.length - a.length)[0];

    onResultRef.current({ type: "text", value: cleaned ?? "" });
  }

  return (
    <div className="scanner-overlay">
      <div className="scanner-header">
        <button className="scanner-close" onClick={onClose} aria-label="Close scanner">
          ✕
        </button>
        <p className="scanner-title">Scan a barcode or the product label</p>
      </div>

      <div className="scanner-viewport">
        <video ref={videoRef} className="scanner-video" playsInline muted />
        {status === "scanning" && <div className="scanner-reticle" />}
        {status === "denied" && (
          <div className="scanner-message">
            Camera access was denied. You can still search by typing the product or brand name above.
          </div>
        )}
        {status === "unsupported" && (
          <div className="scanner-message">
            Camera scanning isn&apos;t available on this device/browser. You can still search by typing above.
          </div>
        )}
        {status === "starting" && <div className="scanner-message">Starting camera…</div>}
        {status === "processing" && <div className="scanner-message">Reading label text…</div>}
        <div className="scanner-debug">
          {debugLine}
          {errorLine && (
            <>
              <br />
              {errorLine}
            </>
          )}
        </div>
      </div>

      <div className="scanner-footer">
        <p className="scanner-hint">
          Barcodes are recognized automatically. No barcode, or hard to read? Frame the product name and tap capture.
        </p>
        <button className="scanner-capture" onClick={captureAndReadText} disabled={status !== "scanning"}>
          Capture label text
        </button>
      </div>
    </div>
  );
}
