import React, { useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  Check,
  Copy,
  Download,
  Eye,
  Printer,
  QrCode,
  X,
} from 'lucide-react';
import {
  RackSummaryItem,
  formatKg,
  getFixedRackQrUrl,
  getZoneColorPalette,
} from './rackZoneTheme';

interface RackQrModalProps {
  rackSummary: RackSummaryItem;
  onClose: () => void;
  onPreviewPublicView: (rackCode: string) => void;
}

async function createBrandedStickerDataUrl(
  rackCode: string,
  zone: string,
  capacityKg: number,
  qrUrl: string,
  hexPrimary: string,
  hexLight: string
): Promise<string> {
  const qrDataUrl = await QRCode.toDataURL(qrUrl, {
    width: 560,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: {
      dark: '#0f172a',
      light: '#ffffff',
    },
  });

  const canvas = document.createElement('canvas');
  canvas.width = 760;
  canvas.height = 960;
  const ctx = canvas.getContext('2d');
  if (!ctx) return qrDataUrl;

  // Background
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Outer Border
  ctx.strokeStyle = hexPrimary;
  ctx.lineWidth = 10;
  ctx.strokeRect(16, 16, canvas.width - 32, canvas.height - 32);

  // Zone Header Banner
  ctx.fillStyle = hexPrimary;
  ctx.fillRect(21, 21, canvas.width - 42, 168);

  // Header Brand Line
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.font = '700 22px system-ui, -apple-system, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('FELIX STORE · FIXED RACK QR', canvas.width / 2, 68);

  // Huge Rack Code
  ctx.fillStyle = '#ffffff';
  ctx.font = '800 66px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(`RACK ${rackCode.toUpperCase()}`, canvas.width / 2, 144);

  // Zone Sub-band
  ctx.fillStyle = hexLight;
  ctx.fillRect(21, 189, canvas.width - 42, 64);
  ctx.fillStyle = hexPrimary;
  ctx.font = '700 26px system-ui, -apple-system, sans-serif';
  ctx.fillText(`${zone} · Cap ${formatKg(capacityKg)} kg`, canvas.width / 2, 230);

  // QR Image
  const img = new Image();
  img.src = qrDataUrl;
  await new Promise<void>((resolve) => {
    img.onload = () => resolve();
    img.onerror = () => resolve();
  });
  ctx.drawImage(img, (canvas.width - 520) / 2, 286, 520, 520);

  // Footer instructions
  ctx.fillStyle = '#0f172a';
  ctx.font = '800 26px system-ui, -apple-system, sans-serif';
  ctx.fillText('SCAN FOR LIVE FABRIC STOCK', canvas.width / 2, 854);

  ctx.fillStyle = '#475569';
  ctx.font = '600 20px system-ui, -apple-system, sans-serif';
  ctx.fillText('No password needed to view · Staff Manage inside', canvas.width / 2, 892);

  ctx.fillStyle = '#64748b';
  ctx.font = '600 15px ui-monospace, monospace';
  ctx.fillText(qrUrl.slice(0, 68), canvas.width / 2, 926);

  return canvas.toDataURL('image/png');
}

export function RackQrModal({
  rackSummary,
  onClose,
  onPreviewPublicView,
}: RackQrModalProps) {
  const [useCurrentOrigin, setUseCurrentOrigin] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);

  const palette = useMemo(
    () => getZoneColorPalette(rackSummary.rack.zone),
    [rackSummary.rack.zone]
  );

  const qrUrl = useMemo(
    () => getFixedRackQrUrl(rackSummary.rack.code, useCurrentOrigin),
    [rackSummary.rack.code, useCurrentOrigin]
  );

  useEffect(() => {
    let active = true;
    QRCode.toDataURL(qrUrl, {
      width: 480,
      margin: 2,
      errorCorrectionLevel: 'H',
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((url) => {
        if (active) setQrDataUrl(url);
      })
      .catch(() => {
        if (active) setQrDataUrl('');
      });
    return () => {
      active = false;
    };
  }, [qrUrl]);

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(qrUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const handleDownloadSticker = async () => {
    setIsDownloading(true);
    try {
      const stickerUrl = await createBrandedStickerDataUrl(
        rackSummary.rack.code,
        rackSummary.rack.zone,
        rackSummary.rack.capacityKg,
        qrUrl,
        palette.hexPrimary,
        palette.hexLight
      );
      const a = document.createElement('a');
      a.href = stickerUrl;
      a.download = `Rack_${rackSummary.rack.code}_Fixed_QR.png`;
      a.click();
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintSticker = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-300 shadow-2xl overflow-hidden my-auto">
        {/* Modal Header */}
        <div className={`${palette.headerBg} ${palette.headerText} px-5 py-4 flex items-center justify-between gap-3 no-print`}>
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-10 w-10 rounded-xl bg-white/15 border border-white/25 flex items-center justify-center shrink-0">
              <QrCode size={20} />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-extrabold font-mono truncate">
                Fixed QR · Rack {rackSummary.rack.code}
              </h3>
              <p className={`text-xs truncate ${palette.headerSubtext}`}>
                {rackSummary.rack.zone}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] min-w-[44px] rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center cursor-pointer transition"
            aria-label="Close QR modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Printable Sticker Preview */}
        <div className="p-4 sm:p-6 space-y-4">
          <div
            id="rack-qr-print-area"
            className={`rounded-2xl border-2 ${palette.cardBorder} bg-white overflow-hidden max-w-sm mx-auto`}
          >
            <div className={`${palette.headerBg} ${palette.headerText} px-4 py-3 text-center`}>
              <p className="text-[11px] font-bold uppercase tracking-wider opacity-90">
                Felix Store · Fixed Rack Tag
              </p>
              <p className="text-2xl font-extrabold font-mono tracking-tight mt-0.5">
                RACK {rackSummary.rack.code}
              </p>
            </div>
            <div className={`${palette.surfaceBg} border-b ${palette.surfaceBorder} px-4 py-2 text-center`}>
              <p className={`text-xs font-extrabold ${palette.accentText}`}>
                {rackSummary.rack.zone} · Cap {formatKg(rackSummary.rack.capacityKg)} kg
              </p>
            </div>

            <div className="p-5 flex flex-col items-center justify-center bg-white">
              {qrDataUrl ? (
                <img
                  src={qrDataUrl}
                  alt={`Fixed QR code for Rack ${rackSummary.rack.code}`}
                  className="w-52 h-52 sm:w-56 sm:h-56 object-contain"
                />
              ) : (
                <div className="w-52 h-52 bg-slate-100 rounded-xl animate-pulse" />
              )}
              <p className="text-xs font-extrabold text-slate-900 mt-2 text-center">
                Scan to view live fabric inside this rack
              </p>
              <p className="text-[11px] text-slate-500 text-center mt-0.5">
                Public view (No password) · Tap Manage inside to update
              </p>
            </div>
          </div>

          {/* Fixed URL Info & Origin Toggle */}
          <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2 no-print">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-extrabold text-slate-700">
                Fixed Permanent Rack Link
              </span>
              <button
                type="button"
                onClick={() => setUseCurrentOrigin((v) => !v)}
                className="text-[11px] font-bold text-blue-700 hover:underline cursor-pointer"
              >
                {useCurrentOrigin ? 'Switch to Permanent App URL' : 'Use Current Preview URL'}
              </button>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="text"
                readOnly
                value={qrUrl}
                className="flex-1 px-2.5 py-2 bg-white border border-slate-300 rounded-lg text-[11px] font-mono text-slate-700 outline-none"
              />
              <button
                type="button"
                onClick={handleCopyUrl}
                className="min-h-[40px] px-3 py-1.5 rounded-lg border border-slate-300 bg-white hover:bg-slate-100 text-slate-800 text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copied ? <Check size={14} className="text-emerald-600" /> : <Copy size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 no-print">
            <button
              type="button"
              onClick={handlePrintSticker}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer size={15} />
              <span>Print Sticker</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadSticker}
              disabled={isDownloading}
              className="min-h-[44px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-900 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50"
            >
              <Download size={15} />
              <span>{isDownloading ? 'Saving...' : 'Download PNG'}</span>
            </button>

            <button
              type="button"
              onClick={() => onPreviewPublicView(rackSummary.rack.code)}
              className={`min-h-[44px] px-3.5 py-2.5 rounded-xl ${palette.headerBg} hover:opacity-95 text-white text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer`}
            >
              <Eye size={15} />
              <span>Test Public View</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

interface BulkRackQrPrintModalProps {
  rackSummaries: RackSummaryItem[];
  onClose: () => void;
}

export function BulkRackQrPrintModal({
  rackSummaries,
  onClose,
}: BulkRackQrPrintModalProps) {
  const [qrMap, setQrMap] = useState<Record<string, string>>({});
  const [zoneFilter, setZoneFilter] = useState<string>('ALL');

  const zones = useMemo(
    () => Array.from(new Set(rackSummaries.map((s) => s.rack.zone))).filter(Boolean),
    [rackSummaries]
  );

  const visibleRacks = useMemo(
    () =>
      rackSummaries.filter(
        (s) => zoneFilter === 'ALL' || s.rack.zone === zoneFilter
      ),
    [rackSummaries, zoneFilter]
  );

  useEffect(() => {
    let active = true;
    Promise.all(
      visibleRacks.map(async (item) => {
        const url = getFixedRackQrUrl(item.rack.code, false);
        const dataUrl = await QRCode.toDataURL(url, {
          width: 300,
          margin: 1,
          errorCorrectionLevel: 'H',
          color: { dark: '#0f172a', light: '#ffffff' },
        });
        return [item.rack.id, dataUrl] as const;
      })
    ).then((entries) => {
      if (!active) return;
      const next: Record<string, string> = {};
      entries.forEach(([id, url]) => {
        next[id] = url;
      });
      setQrMap(next);
    });

    return () => {
      active = false;
    };
  }, [visibleRacks]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-5">
      <div className="bg-white rounded-2xl max-w-5xl w-full max-h-[92vh] flex flex-col border border-slate-300 shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2.5">
            <QrCode size={20} className="text-emerald-400 shrink-0" />
            <div>
              <h3 className="text-base font-extrabold">
                Print Fixed Rack QR Labels ({visibleRacks.length})
              </h3>
              <p className="text-xs text-slate-300">
                Zone-colored permanent QR stickers for warehouse racks
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <select
              value={zoneFilter}
              onChange={(e) => setZoneFilter(e.target.value)}
              className="min-h-[40px] px-3 py-1.5 rounded-xl bg-slate-800 border border-slate-700 text-xs font-bold text-white outline-none"
            >
              <option value="ALL">All Zones ({rackSummaries.length})</option>
              {zones.map((z) => (
                <option key={z} value={z}>
                  {z}
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[40px] px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Printer size={15} />
              <span>Print All Labels</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              className="min-h-[40px] min-w-[40px] rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 flex items-center justify-center cursor-pointer"
              aria-label="Close bulk QR modal"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Printable Grid */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 bg-slate-100">
          <div
            id="rack-qr-print-area"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4"
          >
            {visibleRacks.map((item) => {
              const palette = getZoneColorPalette(item.rack.zone);
              const dataUrl = qrMap[item.rack.id];
              return (
                <div
                  key={item.rack.id}
                  className={`rounded-2xl border-2 ${palette.cardBorder} bg-white overflow-hidden break-inside-avoid`}
                >
                  <div className={`${palette.headerBg} ${palette.headerText} px-3.5 py-2.5 flex items-center justify-between gap-2`}>
                    <span className="text-lg font-extrabold font-mono">
                      RACK {item.rack.code}
                    </span>
                    <span className="text-[11px] font-bold opacity-90">
                      {formatKg(item.rack.capacityKg)} kg
                    </span>
                  </div>
                  <div className={`${palette.surfaceBg} border-b ${palette.surfaceBorder} px-3.5 py-1.5`}>
                    <p className={`text-[11px] font-extrabold truncate ${palette.accentText}`}>
                      {item.rack.zone}
                    </p>
                  </div>
                  <div className="p-4 flex flex-col items-center justify-center">
                    {dataUrl ? (
                      <img
                        src={dataUrl}
                        alt={`QR Rack ${item.rack.code}`}
                        className="w-40 h-40 object-contain"
                      />
                    ) : (
                      <div className="w-40 h-40 bg-slate-100 rounded-xl" />
                    )}
                    <p className="text-[11px] font-extrabold text-slate-900 mt-1.5">
                      Scan for Live Rack Stock
                    </p>
                    <p className="text-[10px] text-slate-500">
                      Felix Store · No login needed to view
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
