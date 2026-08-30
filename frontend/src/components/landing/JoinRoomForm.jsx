import { useEffect, useState } from 'react';
import { useSession } from '../../context/SessionContext.jsx';
import { CONFIG } from '../../config.js';

export default function JoinRoomForm({ prefillCode }) {
  const { joinRoom, busy, landingError, clearLandingError } = useSession();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');

  useEffect(() => {
    if (prefillCode) setCode(prefillCode.toUpperCase());
  }, [prefillCode]);

  function handleSubmit(e) {
    e.preventDefault();
    joinRoom(name.trim(), code.trim());
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

      <label className="field">
        <span className="field__label">Room code</span>
        <input
          type="text"
          maxLength={CONFIG.ROOM_CODE_PREFIX.length + CONFIG.ROOM_CODE_LENGTH}
          placeholder={`${CONFIG.ROOM_CODE_PREFIX}______`}
          autoComplete="off"
          required
          value={code}
          onChange={(e) => {
            setCode(e.target.value.toUpperCase());
            if (landingError) clearLandingError();
          }}
          style={{ textTransform: 'uppercase', fontFamily: 'var(--font-mono)', letterSpacing: '0.08em' }}
        />
      </label>

      <button type="submit" className="btn btn--primary btn--block" disabled={busy}>
        {busy ? 'Joining…' : (
          <>
            Join room <span className="btn__arrow"></span>
          </>
        )}
      </button>
      <p className="field__hint">
        Room codes starts with "<code>P2P</code>".
      </p>
    </form>
  );
}
