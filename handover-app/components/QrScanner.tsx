'use client';

import { useEffect, useRef, useState } from 'react';
import { parseAssetId } from '@/lib/assetId';

type Detector = { detect: (src: CanvasImageSource) => Promise<{ rawValue: string }[]> };

interface Props {
  onResult: (assetId: string) => void;
  onClose: () => void;
}

// Full-screen camera view that reads a unit plate QR code and returns its asset ID.
// Uses the browser's BarcodeDetector where available (Android Chrome) and jsQR otherwise (iPhone).
export function QrScanner({ onResult, onClose }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const doneRef = useRef(false);
  const [error, setError] = useState('');
  const [hint, setHint] = useState('Point the camera at the QR code on the unit plate');

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let cancelled = false;
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d', { willReadFrequently: true });

    const finish = (raw: string) => {
      const id = parseAssetId(raw);
      if (!id) {
        setHint('That QR code isn’t an Acme Hire unit plate. Try the plate on the unit.');
        return false;
      }
      doneRef.current = true;
      if ('vibrate' in navigator) navigator.vibrate?.(60);
      onResult(id);
      return true;
    };

    (async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser can’t open the camera. Type the serial ID instead.');
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        setError('Camera access was blocked. Allow camera access for this site, or type the serial ID instead.');
        return;
      }
      if (cancelled) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play().catch(() => {});

      const Native = (globalThis as unknown as { BarcodeDetector?: new (o: { formats: string[] }) => Detector }).BarcodeDetector;
      let detector: Detector | null = null;
      if (Native) {
        try { detector = new Native({ formats: ['qr_code'] }); } catch { detector = null; }
      }
      const jsQR = detector ? null : (await import('jsqr')).default;

      let busy = false;
      const tick = async () => {
        if (cancelled || doneRef.current) return;
        frame = requestAnimationFrame(tick);
        if (busy || video.readyState < 2 || !video.videoWidth) return;
        busy = true;
        try {
          if (detector) {
            const codes = await detector.detect(video);
            for (const c of codes) if (finish(c.rawValue)) break;
          } else if (jsQR && ctx) {
            // Downscale large frames: faster and still easily readable for a plate-sized code.
            const scale = Math.min(1, 640 / video.videoWidth);
            canvas.width = Math.round(video.videoWidth * scale);
            canvas.height = Math.round(video.videoHeight * scale);
            ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' });
            if (code?.data) finish(code.data);
          }
        } catch {
          // A failed frame is normal; keep scanning.
        } finally {
          busy = false;
        }
      };
      frame = requestAnimationFrame(tick);
    })();

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((t) => t.stop());
    };
  }, [onResult]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 bg-black text-white flex flex-col" role="dialog" aria-modal="true" aria-label="Scan unit QR code">
      <div className="flex items-center justify-between px-4 py-3">
        <span className="text-xs font-black uppercase tracking-wider">Scan unit plate</span>
        <button
          type="button"
          onClick={onClose}
          className="min-h-11 min-w-11 px-3 text-sm font-bold uppercase tracking-wide border border-white/30 rounded-sm active:bg-white/10"
        >
          Cancel
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        {!error && (
          <video ref={videoRef} className="absolute inset-0 w-full h-full object-cover" playsInline muted />
        )}
        {!error && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="w-64 h-64 max-w-[70vw] max-h-[70vw] border-4 border-amber-400 rounded-md shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
          </div>
        )}
        {error && (
          <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
            <p className="text-base leading-relaxed">{error}</p>
          </div>
        )}
      </div>
      {!error && (
        <p className="px-4 py-4 text-center text-sm text-white/80" aria-live="polite">{hint}</p>
      )}
    </div>
  );
}

export function ScanButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="shrink-0 min-h-11 px-3 inline-flex items-center gap-1.5 border-2 border-amber-400 text-amber-700 rounded-sm text-xs font-black uppercase tracking-wide active:bg-amber-50 transition-colors"
      aria-label="Scan the unit's QR code"
    >
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
        <path d="M1 5V1H5M11 1H15V5M15 11V15H11M5 15H1V11" stroke="currentColor" strokeWidth="1.8" strokeLinecap="square"/>
        <path d="M4 8H12" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
      Scan
    </button>
  );
}
