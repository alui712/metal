import type { LibraryRecording } from "./types";

export type UploadResponse = { duplicate: boolean; recording: LibraryRecording };

/** Uploads one file as the raw request body, reporting progress (XHR: fetch has no upload progress). */
export function uploadRecording(file: File, onProgress: (loaded: number, total: number) => void): Promise<UploadResponse> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/recordings");
    xhr.setRequestHeader("x-metal-filename", encodeURIComponent(file.name));
    xhr.setRequestHeader("x-metal-last-modified", String(file.lastModified));
    xhr.setRequestHeader("Content-Type", "application/octet-stream");
    xhr.upload.onprogress = (e) => onProgress(e.loaded, e.lengthComputable ? e.total : file.size);
    xhr.onload = () => {
      let body: { error?: string } & Partial<UploadResponse> = {};
      try {
        body = JSON.parse(xhr.responseText);
      } catch {
        /* non-JSON error page */
      }
      if (xhr.status >= 200 && xhr.status < 300 && body.recording) resolve(body as UploadResponse);
      else reject(new Error(body.error ?? `Upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Upload failed — is the METAL server running?"));
    xhr.send(file);
  });
}

export async function fetchRecordingStatus(ids: string[]): Promise<{ workerOnline: boolean; recordings: LibraryRecording[] }> {
  const res = await fetch(`/api/recordings?ids=${ids.map(encodeURIComponent).join(",")}`, { cache: "no-store" });
  if (!res.ok) throw new Error(`Status check failed (${res.status})`);
  return res.json();
}

export const isProcessing = (r: LibraryRecording) => r.status === "imported" || r.status === "processing";
