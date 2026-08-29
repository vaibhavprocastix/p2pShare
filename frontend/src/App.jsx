import { SessionProvider, useSession } from './context/SessionContext.jsx';
import LandingPage from './pages/LandingPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import ToastStack from './components/common/ToastStack.jsx';
import DestroyedModal from './components/common/DestroyedModal.jsx';

function Shell() {
  const { screen } = useSession();
  return (
    <>
      <div className="bg-grid" aria-hidden="true" />
      {screen === 'landing' ? <LandingPage /> : <WorkspacePage />}
      <ToastStack />
      <DestroyedModal />
    </>
  );
}

export default function App() {
  return (
    <SessionProvider>
      <Shell />
    </SessionProvider>
  );
}
