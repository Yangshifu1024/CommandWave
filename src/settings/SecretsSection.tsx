import { useEffect, useState } from "react";

import {
  decryptSecret,
  encryptSecret,
  isUnlocked,
  lockVault,
  unlockVault,
  type SecretBlob,
} from "../terminal/secrets";
import { secretsDelete, secretsList, secretsUpsert } from "../terminal/ipc";

/**
 * Settings section for the encrypted secrets vault: unlock with a master
 * password, add/remove secrets, and reference them from trigger send-text
 * / auto-answer payloads via {secret:name}.
 */
export function SecretsSection() {
  const [entries, setEntries] = useState<SecretBlob[]>([]);
  const [unlocked, setUnlocked] = useState(false);
  const [master, setMaster] = useState("");
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  const refresh = () => void secretsList().then(setEntries);
  useEffect(() => {
    refresh();
    setUnlocked(isUnlocked());
  }, []);

  const unlock = async () => {
    const ok = await unlockVault(master, entries);
    setError(ok ? null : "wrong master password");
    setUnlocked(ok);
    setMaster("");
  };

  const add = async () => {
    if (!name.trim() || !value) return;
    try {
      const blob = { name: name.trim(), ...(await encryptSecret(value)) };
      await secretsUpsert(blob);
      setName("");
      setValue("");
      refresh();
    } catch (e) {
      setError(String(e));
    }
  };

  const reveal = async (blob: SecretBlob) => {
    try {
      const plain = await decryptSecret(blob);
      await navigator.clipboard.writeText(plain);
      setError(`"${blob.name}" copied to clipboard`);
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <section className="settings-section">
      <h3>Secrets Vault</h3>
      <p className="section-hint">
        AES-GCM encrypted in the app config dir; the master password is
        never stored. Reference secrets in trigger/auto-answer send-text as
        {" {secret:name}"}.
      </p>
      {!unlocked ? (
        <div className="trigger-row">
          <input
            type="password"
            placeholder="master password"
            value={master}
            onChange={(e) => setMaster(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void unlock()}
          />
          <button type="button" className="settings-add-btn" onClick={() => void unlock()}>
            {entries.length === 0 ? "Create vault" : "Unlock"}
          </button>
        </div>
      ) : (
        <>
          <div className="trigger-row">
            <input
              type="text"
              placeholder="name"
              value={name}
              spellCheck={false}
              onChange={(e) => setName(e.target.value)}
            />
            <input
              type="password"
              placeholder="value"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void add()}
            />
            <button type="button" className="settings-add-btn" onClick={() => void add()}>
              Add secret
            </button>
            <button type="button" className="profile-mini-btn" title="Lock" onClick={() => { lockVault(); setUnlocked(false); }}>
              🔒
            </button>
          </div>
          {entries.map((e) => (
            <div key={e.name} className="trigger-row">
              <span className="arrangement-name">{e.name}</span>
              <button type="button" className="settings-add-btn" onClick={() => void reveal(e)}>
                Copy value
              </button>
              <button
                type="button"
                className="profile-mini-btn"
                aria-label="Delete secret"
                onClick={() => {
                  void secretsDelete(e.name);
                  setEntries((list) => list.filter((x) => x.name !== e.name));
                }}
              >
                −
              </button>
            </div>
          ))}
        </>
      )}
      {error && <p className="section-hint">{error}</p>}
    </section>
  );
}
