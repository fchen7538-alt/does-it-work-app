"use client";

import { useEffect, useRef, useState } from "react";
import type { IScannerControls } from "@zxing/browser";

type Mode = "barcode" | "text";
type Status = "starting" | "scanning" | "denied" | "unsupported" | "processing";

// A "ready" video frame needs at least this many pixels of width — during
// stream setup/renegotiation videoWidth can transiently report a small
// bogus value (a real camera never legitimately reports single digits)
// before settling on the actual frame size.
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
  const [mode, setMode] = useState<Mode>("barcode");
  const [status, setStatus] = useState<Status>("starting");
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const controlsRef = useRef<IScannerControls | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("unsupported");
        return;
      }
      setStatus("starting");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          // No width/height/aspectRatio hints: an "ideal" 16:9 landscape
          // constraint here was actively causing the "too zoomed in"
          // complaint, not fixing it — on a phone held in portrait, the
          // viewport is tall and narrow, and object-fit: cover crops a wide
          // landscape frame down to a thin vertical center strip, which
          // looks just like being zoomed way in. Let the browser pick its
          // natural default for the current orientation instead.
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        // Some devices (mainly Android/Chrome) start a track at >1x
        // optical/digital zoom by default. Not supported at all on iOS
        // Safari (capabilities.zoom is simply undefined there, so this is a
        // no-op) — the real iOS fix is the object-fit change below, not
        // this. Where it is supported, reset to the lowest (widest) value
        // explicitly rather than trusting the platform default.
        const track = stream.getVideoTracks()[0];
        const capabilities = track?.getCapabilities?.() as (MediaTrackCapabilities & { zoom?: { min: number } }) | undefined;
        if (track && capabilities?.zoom) {
          try {
            await track.applyConstraints({ advanced: [{ zoom: capabilities.zoom.min } as unknown as MediaTrackConstraintSet] });
          } catch {
            // Not fatal — worst case the user is stuck with the platform default zoom.
          }
        }
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
          // play() resolving doesn't reliably mean videoWidth/videoHeight
          // reflect the real frame size yet — during stream setup/renegotiation
          // (e.g. right after switching scan modes) videoWidth can briefly
          // report a bogus tiny value before settling, so a plain truthy
          // check isn't enough. Capturing a frame before it's really ready
          // produces a near-empty canvas, which makes canvas.toBlob() hand
          // back null and crashes downstream code expecting a real Blob.
          const deadline = Date.now() + 4000;
          while (videoRef.current.videoWidth < MIN_READY_WIDTH && Date.now() < deadline) {
            await new Promise((resolve) => setTimeout(resolve, 100));
          }
        }
        setStatus("scanning");

        // By the time execution reaches here, the getUserMedia/zoom/
        // videoWidth-polling awaits above may have taken long enough that
        // the mode already switched away (e.g. user tapped "Scan label
        // text" before the camera even finished setting up) — cleanup for
        // this effect instance already ran. Starting the barcode decode
        // loop anyway just to stop it a moment later still lets it run
        // (and burn CPU against the *new* stream on the same video element,
        // since zxing reads live from the DOM element) for as long as
        // decodeFromStream takes to resolve — skip it entirely instead.
        if (mode === "barcode" && !cancelled) {
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
              onResult({ type: "upc", value: result.getText() });
            }
          });
          // Mode could still have switched away while decodeFromStream
          // itself was resolving — same reasoning as above, stop rather
          // than leak in that case too.
          if (cancelled) {
            controls.stop();
          } else {
            controlsRef.current = controls;
          }
        }
      } catch (err) {
        if (!cancelled) {
          setStatus((err as DOMException)?.name === "NotAllowedError" ? "denied" : "unsupported");
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
  }, [mode]);

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

    onResult({ type: "text", value: cleaned ?? "" });
  }

  return (
    <div className="scanner-overlay">
      <div className="scanner-header">
        <button className="scanner-close" onClick={onClose} aria-label="Close scanner">
          ✕
        </button>
        <div className="scanner-modetabs">
          <button
            className={`scanner-modetab ${mode === "barcode" ? "on" : ""}`}
            onClick={() => setMode("barcode")}
          >
            Scan barcode
          </button>
          <button className={`scanner-modetab ${mode === "text" ? "on" : ""}`} onClick={() => setMode("text")}>
            Scan label text
          </button>
        </div>
      </div>

      <div className="scanner-viewport">
        <video ref={videoRef} className="scanner-video" playsInline muted />
        {status === "scanning" && mode === "barcode" && <div className="scanner-reticle" />}
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
      </div>

      <div className="scanner-footer">
        {mode === "barcode" ? (
          <p className="scanner-hint">Point the camera at the barcode on the bottle.</p>
        ) : (
          <>
            <p className="scanner-hint">Frame the product name on the label, then capture.</p>
            <button className="scanner-capture" onClick={captureAndReadText} disabled={status !== "scanning"}>
              Capture
            </button>
          </>
        )}
      </div>
    </div>
  );
}
