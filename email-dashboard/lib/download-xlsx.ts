/** Client-only: builds a workbook from rows (header + data) and triggers download. */
export async function downloadAoAAsXlsx(
  rows: (string | number)[][],
  filenameBase: string,
  sheetName = "Export"
): Promise<void> {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  const safeName = sheetName.replace(/[/\\?*[\]:]/g, "").slice(0, 31) || "Export";
  XLSX.utils.book_append_sheet(wb, ws, safeName);
  const ab = XLSX.write(wb, { bookType: "xlsx", type: "array" });
  const blob = new Blob([ab], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${filenameBase}-${new Date().toISOString().slice(0, 10)}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
