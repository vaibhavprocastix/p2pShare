import { useRef, useState } from 'react';
import { useSession } from '../../context/SessionContext.jsx';

export default function Dropzone() {
  const { dropFiles } = useSession();
  const inputRef = useRef(null);
  const [isDragOver, setIsDragOver] = useState(false);

  function openPicker() {
    inputRef.current?.click();
  }

  function handleInputChange(e) {
    const files = Array.from(e.target.files || []);
    if (files.length) dropFiles(files);
    e.target.value = '';
  }

  function handleDrop(e) {
    e.preventDefault();
    e.stopPropagation();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer?.files || []);
    if (files.length) dropFiles(files);
  }

  return (
    <div
      className={`dropzone${isDragOver ? ' is-dragover' : ''}`}
      tabIndex={0}
      role="button"
      aria-label="Drop files here or click to browse"
      onClick={openPicker}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          openPicker();
        }
      }}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
      }}
      onDrop={handleDrop}
    >
      <input type="file" ref={inputRef} multiple hidden onChange={handleInputChange} />
      <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" />
        <polyline points="17 8 12 3 7 8" />
        <line x1="12" y1="3" x2="12" y2="15" />
      </svg>
      <p className="dropzone__title">Drop files to share</p>
      <p className="dropzone__sub">or click to browse — everyone in the room can download them</p>
    </div>
  );
}
