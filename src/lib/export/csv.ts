export type CsvData = {
  headers: string[];
  rows: string[][];
};

export function formatCsvValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  let str = String(value).trim();

  if (str.includes('"') || str.includes(",") || str.includes("\n")) {
    str = `"${str.replace(/"/g, '""')}"`;
  }

  return str;
}

export function generateCsvString(data: CsvData): string {
  const headerLine = data.headers.map(formatCsvValue).join(",");
  const dataLines = data.rows.map((row) =>
    row.map(formatCsvValue).join(","),
  );
  return [headerLine, ...dataLines].join("\n");
}

export function downloadCsvFile(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);

  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";

  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
}

export function extractTableData(table: HTMLTableElement): CsvData {
  const headers: string[] = [];
  const rows: string[][] = [];

  const thead = table.querySelector("thead");
  if (thead) {
    const headerRow = thead.querySelector("tr:last-child");
    if (headerRow) {
      headerRow.querySelectorAll("th").forEach((th) => {
        headers.push(th.textContent?.trim() ?? "");
      });
    }
  }

  const tbody = table.querySelector("tbody");
  if (tbody) {
    tbody.querySelectorAll(":scope > tr").forEach((tr) => {
      const row: string[] = [];
      tr.querySelectorAll(":scope > td, :scope > th").forEach((cell) => {
        row.push(cell.textContent?.trim() ?? "");
      });
      if (row.length > 0) rows.push(row);
    });
  }

  return { headers, rows };
}
