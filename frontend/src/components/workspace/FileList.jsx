import { useSession } from '../../context/SessionContext.jsx';
import FileCard from './FileCard.jsx';

export default function FileList() {
  const { files } = useSession();

  if (files.length === 0) {
    return (
      <div className="file-list">
        <p className="file-list__empty">No files shared yet. Drop a file above & everyone in the room will see it instantly.</p>
      </div>
    );
  }

  return (
    <div className="file-list">
      {files.map((file) => (
        <FileCard key={file.fileId} file={file} />
      ))}
    </div>
  );
}
