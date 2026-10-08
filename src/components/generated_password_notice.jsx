import { useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';

// Shown once, right after an admin creates an account without typing a password. The server
// only returns this password in that one response, so it cannot be shown again later.
function GeneratedPasswordNotice({ password }) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(password);
      setCopied(true);
    } catch {
      setCopied(false); // the password stays visible, so it can still be selected and copied by hand
    }
  };

  return (
    <div className="generated-password-notice">
      <span className="generated-password-label">Temporary password</span>
      <code className="generated-password-value">{password}</code>
      <button type="button" className="bs-back-btn generated-password-copy" onClick={copy}>
        {copied ? <><FiCheck /> Copied</> : <><FiCopy /> Copy</>}
      </button>
      <p className="generated-password-note">Give this to the customer. It will not be shown again.</p>
    </div>
  );
}

export default GeneratedPasswordNotice;
