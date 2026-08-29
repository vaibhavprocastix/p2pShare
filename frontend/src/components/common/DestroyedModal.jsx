import { useSession } from '../../context/SessionContext.jsx';

export default function DestroyedModal() {
  const { destroyedModal, dismissDestroyedModal } = useSession();

  if (!destroyedModal) return null;

  return (
    <div className="modal-backdrop">
      <div className="modal" role="alertdialog" aria-modal="true">
        <h3>{destroyedModal.title}</h3>
        <p>{destroyedModal.body}</p>
        <button className="btn btn--primary" type="button" onClick={dismissDestroyedModal}>
          Back to landing
        </button>
      </div>
    </div>
  );
}
