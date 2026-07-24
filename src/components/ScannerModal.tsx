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
          video: { facingMode: "environment" },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
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

        if (mode === "barcode") {
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
          controlsRef.current = controls;
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
