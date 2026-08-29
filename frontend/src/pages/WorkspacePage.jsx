import { useSession } from '../context/SessionContext.jsx';
import WorkspaceHeader from '../components/workspace/WorkspaceHeader.jsx';
import MeshVisualization from '../components/workspace/MeshVisualization.jsx';
import PeerList from '../components/workspace/PeerList.jsx';
import Dropzone from '../components/workspace/Dropzone.jsx';
import FileList from '../components/workspace/FileList.jsx';

export default function WorkspacePage() {
  const { room } = useSession();

  if (!room) return null;

  return (
    <main className="screen screen--workspace">
      <WorkspaceHeader />
      <MeshVisualization />

      <section className="ws-body">
        <PeerList />

        <div className="transfer-col">
          <Dropzone />
          <FileList />
        </div>
      </section>
    </main>
  );
}
