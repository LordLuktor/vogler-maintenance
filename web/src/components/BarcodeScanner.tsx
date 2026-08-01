import { useEffect, useRef, useState } from "react";
import { BrowserMultiFormatReader } from "@zxing/browser";

export default function BarcodeScanner({ onDetected, onClose }: { onDetected: (code: string) => void; onClose: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const reader = new BrowserMultiFormatReader();
    let cancelled = false;
    let controls: { stop: () => void } | undefined;

    reader
      .decodeFromVideoDevice(undefined, videoRef.current!, (result, err, ctrl) => {
        controls = ctrl;
        if (cancelled) return;
        if (result) {
          ctrl.stop();
          onDetected(result.getText());
        }
        // NotFoundException fires continuously while no barcode is in frame yet — expected, not an error.
      })
      .catch(() => {
        if (!cancelled) setError("Couldn't access the camera. Check permissions and try again.");
      });

    return () => {
      cancelled = true;
      controls?.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        padding: 16
      }}
    >
      <div style={{ width: "100%", maxWidth: 480 }}>
        {error ? (
          <p style={{ color: "white" }}>{error}</p>
        ) : (
          <>
            <video ref={videoRef} style={{ width: "100%", borderRadius: 8 }} muted />
            <p style={{ color: "white", textAlign: "center", marginTop: 8 }}>Point the camera at a barcode</p>
          </>
        )}
        <button type="button" className="btn btn-block" style={{ background: "#e2e4e9", marginTop: 12 }} onClick={onClose}>
          Cancel
        </button>
      </div>
    </div>
  );
}
