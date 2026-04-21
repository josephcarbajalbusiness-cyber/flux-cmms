// Generador de PDF profesional usando jsPDF + autotable
// Instalar: npm install jspdf jspdf-autotable
// Tipos: npm install -D @types/jspdf

import type { ServiceReport, Tenant, Supply, ChecklistItem } from "@/types/database";

// Importación dinámica para no bloquear el bundle inicial
async function loadJsPDF() {
  const [{ default: jsPDF }, { default: autoTable }] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  return { jsPDF, autoTable };
}

export async function generateReportPDF(report: ServiceReport, tenant: Tenant): Promise<void> {
  const { jsPDF, autoTable } = await loadJsPDF();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "letter" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let y = margin;

  // ── Paleta de colores ──────────────────────────────────
  const PRIMARY = [37, 99, 235];    // blue-600
  const DARK = [30, 41, 59];        // slate-800
  const MUTED = [100, 116, 139];    // slate-500
  const LIGHT_BG = [248, 250, 252]; // slate-50
  const SUCCESS = [22, 163, 74];    // green-600

  // ── Helpers ────────────────────────────────────────────
  const setColor = (r: number, g: number, b: number) => doc.setTextColor(r, g, b);
  const fillRect = (x: number, fy: number, w: number, h: number, r: number, g: number, b: number) => {
    doc.setFillColor(r, g, b);
    doc.rect(x, fy, w, h, "F");
  };
  const addLine = (lx: number, ly: number, r: number, g: number, b: number) => {
    doc.setDrawColor(r, g, b);
    doc.line(lx, ly, pageWidth - margin, ly);
  };

  // ── ENCABEZADO ─────────────────────────────────────────
  fillRect(0, 0, pageWidth, 40, ...PRIMARY as [number, number, number]);

  // Logo del tenant (si existe)
  if (tenant.logo_url) {
    try {
      const img = await fetchImageAsBase64(tenant.logo_url);
      doc.addImage(img, "PNG", margin, 8, 30, 15);
    } catch {
      // Sin logo si falla la carga
    }
  }

  // Nombre de empresa y título
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(255, 255, 255);
  doc.text(tenant.name, pageWidth / 2, 14, { align: "center" });

  doc.setFontSize(10);
  doc.setFont("helvetica", "normal");
  doc.text("REPORTE DE SERVICIO TÉCNICO", pageWidth / 2, 22, { align: "center" });

  // Folio y estado
  doc.setFontSize(9);
  doc.text(`Folio: ${report.report_number ?? "N/A"}`, pageWidth - margin, 14, { align: "right" });
  doc.text(
    `Estado: ${report.status.toUpperCase()}`,
    pageWidth - margin, 20, { align: "right" }
  );
  doc.text(
    `Fecha: ${new Date(report.created_at).toLocaleDateString("es-MX", { dateStyle: "long" })}`,
    pageWidth - margin, 26, { align: "right" }
  );

  y = 48;

  // ── INFORMACIÓN GENERAL ────────────────────────────────
  fillRect(margin, y, pageWidth - margin * 2, 8, ...LIGHT_BG as [number, number, number]);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  setColor(...DARK as [number, number, number]);
  doc.text("INFORMACIÓN GENERAL", margin + 3, y + 5.5);
  y += 12;

  const infoData = [
    ["Activo / Máquina", report.assets?.name ?? "—", "Ubicación", report.assets?.location ?? "—"],
    ["Categoría", report.assets?.category ?? "—", "N° Serie", report.assets?.serial_number ?? "—"],
    ["Técnico", report.profiles?.full_name ?? "—", "Tipo Servicio", formatServiceType(report.service_type)],
    ["Prioridad", formatPriority(report.priority), "Recibe", report.report_details?.client_name ?? "—"],
  ];

  autoTable(doc, {
    startY: y,
    body: infoData,
    theme: "plain",
    styles: { fontSize: 8, cellPadding: 2 },
    columnStyles: {
      0: { fontStyle: "bold", textColor: MUTED as unknown as string, cellWidth: 35 },
      1: { cellWidth: 55 },
      2: { fontStyle: "bold", textColor: MUTED as unknown as string, cellWidth: 35 },
      3: { cellWidth: 55 },
    },
    margin: { left: margin, right: margin },
  });

  y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;

  // ── TIEMPOS DE SERVICIO ────────────────────────────────
  const details = report.report_details;
  if (details?.started_at) {
    fillRect(margin, y, pageWidth - margin * 2, 8, ...LIGHT_BG as [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(...DARK as [number, number, number]);
    doc.text("TIEMPOS DE SERVICIO", margin + 3, y + 5.5);
    y += 12;

    const duration = details.started_at && details.finished_at
      ? Math.round((new Date(details.finished_at).getTime() - new Date(details.started_at).getTime()) / 60000)
      : null;

    const timeData = [
      [
        "Inicio", formatDateTime(details.started_at),
        "Fin", formatDateTime(details.finished_at ?? ""),
        "Duración", duration !== null ? `${duration} minutos` : "—",
      ],
      [
        "GPS Inicio",
        details.start_latitude ? `${details.start_latitude.toFixed(6)}, ${details.start_longitude?.toFixed(6)}` : "—",
        "GPS Fin",
        details.end_latitude ? `${details.end_latitude.toFixed(6)}, ${details.end_longitude?.toFixed(6)}` : "—",
        "", "",
      ],
    ];

    autoTable(doc, {
      startY: y,
      body: timeData,
      theme: "plain",
      styles: { fontSize: 8, cellPadding: 2 },
      columnStyles: {
        0: { fontStyle: "bold", textColor: MUTED as unknown as string, cellWidth: 25 },
        1: { cellWidth: 45 },
        2: { fontStyle: "bold", textColor: MUTED as unknown as string, cellWidth: 20 },
        3: { cellWidth: 45 },
        4: { fontStyle: "bold", textColor: MUTED as unknown as string, cellWidth: 22 },
        5: { cellWidth: 25 },
      },
      margin: { left: margin, right: margin },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── CHECKLIST ─────────────────────────────────────────
  if (details?.checklist?.items?.length) {
    fillRect(margin, y, pageWidth - margin * 2, 8, ...LIGHT_BG as [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(...DARK as [number, number, number]);
    doc.text("LISTA DE INSPECCIÓN", margin + 3, y + 5.5);
    y += 12;

    const checkRows = details.checklist.items.map((item: ChecklistItem) => [
      item.checked ? "✓" : "✗",
      item.label,
      item.notes ?? "",
    ]);

    autoTable(doc, {
      startY: y,
      head: [["", "Punto de Inspección", "Observación"]],
      body: checkRows,
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: "bold" },
      columnStyles: {
        0: {
          cellWidth: 10, halign: "center",
          textColor: checkRows.map(r => r[0] === "✓" ? SUCCESS : [200, 50, 50]) as unknown as string,
        },
        1: { cellWidth: 100 },
        2: { cellWidth: 60 },
      },
      margin: { left: margin, right: margin },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── INSUMOS ────────────────────────────────────────────
  const supplies = details?.supplies as Supply[] | undefined;
  if (supplies && supplies.length > 0) {
    if (y > pageHeight - 60) { doc.addPage(); y = margin; }

    fillRect(margin, y, pageWidth - margin * 2, 8, ...LIGHT_BG as [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(...DARK as [number, number, number]);
    doc.text("INSUMOS Y REFACCIONES", margin + 3, y + 5.5);
    y += 12;

    const totalCost = supplies.reduce((acc, s) => acc + (s.cost ?? 0) * s.qty, 0);

    autoTable(doc, {
      startY: y,
      head: [["SKU", "Descripción", "Cantidad", "Unidad", "Costo Unit.", "Subtotal"]],
      body: [
        ...supplies.map((s) => [
          s.sku ?? "—",
          s.name,
          s.qty.toString(),
          s.unit,
          s.cost != null ? `$${s.cost.toFixed(2)}` : "—",
          s.cost != null ? `$${(s.cost * s.qty).toFixed(2)}` : "—",
        ]),
        ["", "", "", "", "TOTAL", `$${totalCost.toFixed(2)}`],
      ],
      theme: "striped",
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: PRIMARY, textColor: [255, 255, 255], fontStyle: "bold" },
      margin: { left: margin, right: margin },
    });

    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 6;
  }

  // ── DIAGNÓSTICO Y OBSERVACIONES ────────────────────────
  if (details?.observations || details?.diagnosis || details?.recommendations) {
    if (y > pageHeight - 70) { doc.addPage(); y = margin; }

    fillRect(margin, y, pageWidth - margin * 2, 8, ...LIGHT_BG as [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(...DARK as [number, number, number]);
    doc.text("DIAGNÓSTICO Y OBSERVACIONES", margin + 3, y + 5.5);
    y += 12;

    const textSections = [
      { label: "Observaciones", text: details.observations },
      { label: "Diagnóstico", text: details.diagnosis },
      { label: "Recomendaciones", text: details.recommendations },
    ].filter((s) => s.text);

    for (const section of textSections) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(8);
      setColor(...MUTED as [number, number, number]);
      doc.text(section.label.toUpperCase(), margin, y);
      y += 4;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      setColor(...DARK as [number, number, number]);
      const lines = doc.splitTextToSize(section.text!, pageWidth - margin * 2);
      doc.text(lines, margin, y);
      y += lines.length * 5 + 4;
    }
  }

  // ── EVIDENCIA FOTOGRÁFICA ──────────────────────────────
  const allPhotos = [
    ...(details?.photos?.before ?? []).map((u: string) => ({ url: u, label: "ANTES" })),
    ...(details?.photos?.during ?? []).map((u: string) => ({ url: u, label: "DURANTE" })),
    ...(details?.photos?.after ?? []).map((u: string) => ({ url: u, label: "DESPUÉS" })),
    ...(details?.photos?.extra ?? []).map((u: string) => ({ url: u, label: "EXTRA" })),
  ];

  if (allPhotos.length > 0) {
    doc.addPage();
    y = margin;

    fillRect(margin, y, pageWidth - margin * 2, 8, ...LIGHT_BG as [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(...DARK as [number, number, number]);
    doc.text("EVIDENCIA FOTOGRÁFICA", margin + 3, y + 5.5);
    y += 12;

    const photoWidth = 55;
    const photoHeight = 42;
    let col = 0;
    const cols = 3;
    const colGap = 5;

    for (const photo of allPhotos) {
      try {
        const base64 = await fetchImageAsBase64(photo.url);
        const x = margin + col * (photoWidth + colGap);

        doc.addImage(base64, "JPEG", x, y, photoWidth, photoHeight);
        doc.setFontSize(7);
        doc.setFont("helvetica", "bold");
        setColor(...MUTED as [number, number, number]);
        doc.text(photo.label, x + photoWidth / 2, y + photoHeight + 4, { align: "center" });

        col++;
        if (col >= cols) {
          col = 0;
          y += photoHeight + 12;
          if (y > pageHeight - photoHeight - 20) {
            doc.addPage();
            y = margin;
          }
        }
      } catch {
        // Omitir foto si no carga
      }
    }

    y += photoHeight + 12;
  }

  // ── FIRMAS ─────────────────────────────────────────────
  if (details?.technician_signature || details?.client_signature) {
    if (y > pageHeight - 80) { doc.addPage(); y = margin; }

    fillRect(margin, y, pageWidth - margin * 2, 8, ...LIGHT_BG as [number, number, number]);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    setColor(...DARK as [number, number, number]);
    doc.text("FIRMAS DE CONFORMIDAD", margin + 3, y + 5.5);
    y += 16;

    const sigWidth = 70;
    const sigHeight = 25;

    if (details.technician_signature) {
      try {
        const base64 = await fetchImageAsBase64(details.technician_signature);
        doc.addImage(base64, "PNG", margin, y, sigWidth, sigHeight);
      } catch { /* sin firma */ }
      addLine(margin, y + sigHeight + 4, ...MUTED as [number, number, number]);
      doc.setFontSize(7);
      setColor(...MUTED as [number, number, number]);
      doc.text("Firma del Técnico", margin, y + sigHeight + 9);
      doc.text(report.profiles?.full_name ?? "", margin, y + sigHeight + 13);
    }

    if (details.client_signature) {
      const cx = pageWidth / 2 + 5;
      try {
        const base64 = await fetchImageAsBase64(details.client_signature);
        doc.addImage(base64, "PNG", cx, y, sigWidth, sigHeight);
      } catch { /* sin firma */ }
      addLine(cx, y + sigHeight + 4, ...MUTED as [number, number, number]);
      doc.setFontSize(7);
      setColor(...MUTED as [number, number, number]);
      doc.text("Firma del Cliente", cx, y + sigHeight + 9);
      doc.text(details.client_name ?? "", cx, y + sigHeight + 13);
    }

    y += sigHeight + 20;
  }

  // ── PIE DE PÁGINA en todas las páginas ─────────────────
  const totalPages = doc.internal.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    fillRect(0, pageHeight - 10, pageWidth, 10, ...PRIMARY as [number, number, number]);
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text(
      `${tenant.name} • Reporte ${report.report_number ?? ""} • Generado el ${new Date().toLocaleString("es-MX")}`,
      pageWidth / 2, pageHeight - 4, { align: "center" }
    );
    doc.text(`Página ${i} de ${totalPages}`, pageWidth - margin, pageHeight - 4, { align: "right" });
  }

  // ── Descargar ──────────────────────────────────────────
  doc.save(`Reporte-${report.report_number ?? report.id}-${tenant.name}.pdf`);
}

// ── Helpers ────────────────────────────────────────────────
async function fetchImageAsBase64(url: string): Promise<string> {
  const response = await fetch(url);
  const blob = await response.blob();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("es-MX", {
    day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

function formatServiceType(type: string): string {
  const map: Record<string, string> = {
    preventive: "Preventivo",
    corrective: "Correctivo",
    predictive: "Predictivo",
    installation: "Instalación",
  };
  return map[type] ?? type;
}

function formatPriority(p: string): string {
  const map: Record<string, string> = {
    low: "Baja", normal: "Normal", high: "Alta", critical: "Crítica",
  };
  return map[p] ?? p;
}
