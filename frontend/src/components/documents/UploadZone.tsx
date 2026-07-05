import { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { DOCUMENT_CATEGORIES, type DocumentCategory } from "@/types/api";

interface UploadZoneProps {
  onUpload: (file: File, category: DocumentCategory) => void;
  isUploading: boolean;
  /** Real byte-level upload progress (0-100), or null before the first progress event fires. */
  uploadProgress?: number | null;
}

export function UploadZone({ onUpload, isUploading, uploadProgress = null }: UploadZoneProps): JSX.Element {
  const [category, setCategory] = useState<DocumentCategory>("general");
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    const file = acceptedFiles[0];
    if (file) setPendingFile(file);
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    multiple: false,
    disabled: isUploading,
  });

  function handleConfirmUpload(): void {
    if (!pendingFile) return;
    onUpload(pendingFile, category);
    setPendingFile(null);
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
          isDragActive ? "border-brand-500 bg-brand-50" : "border-slate-300 bg-slate-50"
        } ${isUploading ? "cursor-not-allowed opacity-60" : "cursor-pointer"}`}
      >
        <input {...getInputProps()} />
        <span className="text-2xl" aria-hidden="true">
          &#128228;
        </span>
        <p className="text-sm font-medium text-slate-700">
          {isDragActive ? "Drop the file here" : "Drag & drop a file, or click to browse"}
        </p>
        <p className="text-xs text-slate-400">PDF, DOCX, TXT and similar document formats</p>
      </div>

      {pendingFile && (
        <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-slate-50 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-slate-800">{pendingFile.name}</p>
            <p className="text-xs text-slate-500">{(pendingFile.size / 1024).toFixed(1)} KB</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as DocumentCategory)}
              className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm capitalize focus:border-brand-500 focus:outline-none"
            >
              {DOCUMENT_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleConfirmUpload}
              disabled={isUploading}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-brand-700 disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isUploading ? "Uploading..." : "Upload"}
            </button>
            <button
              type="button"
              onClick={() => setPendingFile(null)}
              disabled={isUploading}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isUploading && (
        <div className="mt-3">
          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-150"
              style={{ width: `${uploadProgress ?? 0}%` }}
            />
          </div>
          <p className="mt-1 text-right text-xs text-slate-400">
            {uploadProgress === null ? "Uploading…" : `${uploadProgress}%`}
          </p>
        </div>
      )}
    </div>
  );
}
