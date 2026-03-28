"use client";

function saveBlob(blob: Blob, filename: string) {
  const objectUrl = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = objectUrl;
  link.download = filename;
  link.rel = "noreferrer";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000);
}

function openDirectDownload(url: string, filename: string) {
  const link = document.createElement("a");

  link.href = url;
  link.download = filename;
  link.target = "_blank";
  link.rel = "noreferrer noopener";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

export async function downloadRemoteFileInBrowser(url: string, filename: string) {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Download failed with status ${response.status}`);
    }

    const blob = await response.blob();
    saveBlob(blob, filename);
  } catch {
    openDirectDownload(url, filename);
  }
}
