import { useState } from 'react';
import { useSession } from '../../context/SessionContext.jsx';
import { CONFIG } from '../../config.js';

export default function CreateRoomForm() {
  const { createRoom, busy, landingError, clearLandingError } = useSession();
  const [name, setName] = useState('');

  function handleSubmit(e) {
    e.preventDefault();
    createRoom(name.trim());
  }

  return (
    <form className="panel-form" onSubmit={handleSubmit} noValidate>
      <label className="field">
        <span className="field__label">Enter your display name</span>
        <input
          type="text"
          maxLength={CONFIG.MAX_NAME_LENGTH}
          placeholder=""
          autoComplete="off"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            if (landingError) clearLandingError();
          }}
        />
      </label>

      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Creating…' :(
          <>
            Create room <span className="btn__arrow"></span>
          </>
        )}
      </button>
      <p className="field__hint">
        You'll get a shareable 6-character room code as the host. Rooms hold up to{' '}
        <strong>{CONFIG.MAX_ROOM_CAPACITY} peers</strong>.
      </p>
    </form>
  );
}
