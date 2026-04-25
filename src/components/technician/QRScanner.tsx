import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";

interface Props {
  onScan: (code: string) => void;
  onClose: () => void;
}

export default function QRScanner({ onScan, onClose }: Props) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = "qr-scanner-container";
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  useEffect(() => {
    const scanner = new Html5Qrcode(containerId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" }, // cámara trasera
        { fps: 10, qrbox: { width: 250, height: 250 } },
        (decodedText) => {
          // Éxito — detener cámara y devolver resultado
          scanner.stop().catch(() => {});
          onScan(decodedText);
        },
        () => {} // error silencioso por frame (no muestres nada)
      )
      .then(() => setStarted(true))
      .catch((err: Error) => {
        setError(
          err.message.includes("Permission")
            ? "Permiso de cámara denegado. Habilítalo en la configuración del navegador."
            : `No se pudo iniciar la cámara: ${err.message}`
        );
      });

    return () => {
      scanner.stop().catch(() => {});
    };
  }, [onScan]);

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-4 bg-black/80">
        <div>
          <p className="text-white font-semibold">Escanear código QR</p>
          <p className="text-slate-400 text-xs mt-0.5">Apunta la cámara al código del equipo</p>
        </div>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center text-white text-lg hover:bg-white/20 transition-colors"
        >
          ✕
        </button>
      </div>

      {/* Scanner area */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4">
        {error ? (
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-20 h-20 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <span className="text-4xl">📷</span>
            </div>
            <p className="text-red-400 text-sm">{error}</p>
            <button
              onClick={onClose}
              className="bg-white text-slate-800 font-semibold px-6 py-2.5 rounded-xl text-sm"
            >
              Cerrar
            </button>
          </div>
        ) : (
          <>
            {/* Visor de cámara */}
            <div className="relative">
              <div id={containerId} className="rounded-2xl overflow-hidden" style={{ width: 300, height: 300 }} />

              {/* Marco animado sobre el visor */}
              {started && (
                <div className="absolute inset-0 pointer-events-none">
                  {/* Esquinas del marco */}
                  {[
                    "top-3 left-3 border-t-4 border-l-4 rounded-tl-xl",
                    "top-3 right-3 border-t-4 border-r-4 rounded-tr-xl",
                    "bottom-3 left-3 border-b-4 border-l-4 rounded-bl-xl",
                    "bottom-3 right-3 border-b-4 border-r-4 rounded-br-xl",
                  ].map((cls, i) => (
                    <div key={i} className={`absolute w-8 h-8 border-blue-400 ${cls}`} />
                  ))}

                  {/* Línea de escaneo animada */}
                  <div className="absolute left-3 right-3 top-3 bottom-3 overflow-hidden rounded-xl">
                    <div
                      className="absolute left-0 right-0 h-0.5 bg-blue-400/70"
                      style={{
                        animation: "scanLine 2s linear infinite",
                        boxShadow: "0 0 8px 2px rgba(96, 165, 250, 0.5)",
                      }}
                    />
                  </div>
                </div>
              )}

              {/* Spinner mientras carga */}
              {!started && !error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-2xl">
                  <div className="w-8 h-8 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>

            <p className="text-slate-400 text-sm text-center max-w-xs">
              El código QR se detecta automáticamente al enfocarlo
            </p>
          </>
        )}
      </div>

      {/* Ingreso manual */}
      <ManualInput onSubmit={onScan} />

      <style>{`
        @keyframes scanLine {
          0%   { top: 8px; }
          50%  { top: calc(100% - 8px); }
          100% { top: 8px; }
        }
      `}</style>
    </div>
  );
}

function ManualInput({ onSubmit }: { onSubmit: (code: string) => void }) {
  const [code, setCode] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="bg-black/80 px-4 pb-8 pt-4 space-y-3">
      {!open ? (
        <button
          onClick={() => setOpen(true)}
          className="w-full text-center text-slate-400 text-sm py-2 border border-slate-700 rounded-xl hover:border-slate-500 transition-colors"
        >
          ⌨️ Ingresar código manualmente
        </button>
      ) : (
        <div className="flex gap-2">
          <input
            autoFocus
            value={code}
            onChange={(e) => setCode(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && code.trim() && onSubmit(code.trim())}
            placeholder="Ej: ASSET-001"
            className="flex-1 bg-slate-800 border border-slate-600 rounded-xl px-3.5 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 font-mono"
          />
          <button
            onClick={() => code.trim() && onSubmit(code.trim())}
            disabled={!code.trim()}
            className="bg-blue-600 hover:bg-blue-700 disabled:opacity-40 text-white px-4 rounded-xl text-sm font-semibold transition-colors"
          >
            Ir
          </button>
        </div>
      )}
    </div>
  );
}
