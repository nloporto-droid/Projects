import { useRef, useState } from "react";

interface Props {
  onLoad: (gpxText: string, fileName: string) => void;
  fileName?: string;
}

export function FileUpload({ onLoad, fileName }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setDragging] = useState(false);

  function handleFile(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      onLoad(String(reader.result ?? ""), file.name);
    };
    reader.readAsText(file);
  }

  return (
    <div
      className={`file-drop ${isDragging ? "file-drop--active" : ""}`}
      onClick={() => inputRef.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files?.[0];
        if (file) handleFile(file);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".gpx,application/gpx+xml"
        hidden
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFile(file);
        }}
      />
      {fileName ? (
        <span>
          Loaded <strong>{fileName}</strong> — click to replace
        </span>
      ) : (
        <span>Drop a .gpx file here, or click to choose one</span>
      )}
    </div>
  );
}
