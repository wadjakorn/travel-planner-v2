// Sign-in screen, Account menu, Settings panel, Invite modal

const { useState: useS_ac, useEffect: useE_ac } = React;

/* ============================================================
   SIGN IN SCREEN
   ============================================================ */
function SignInScreen({ onSignIn, t }) {
  return (
    <div className="signin-wrap">
      <div className="signin-bg">
        <div className="signin-blob b1"/>
        <div className="signin-blob b2"/>
        <div className="signin-blob b3"/>
      </div>
      <div className="signin-card">
        <div className="signin-brand">
          <svg viewBox="0 0 32 32" fill="currentColor" width="36" height="36"><path d="M16 3.2c-3.4 0-5.5 2-7.6 2-2.2 0-4.6-1.9-6.6.5C-.6 8.5.4 14.6 3.6 19.7c1.6 2.5 3.7 5.3 6.5 5.2 2.6-.1 3.6-1.7 6.7-1.7 3.1 0 4 1.7 6.7 1.6 2.8-.1 4.6-2.6 6.3-5.1 1.9-2.9 2.7-5.7 2.7-5.9-.1 0-5.2-2-5.3-7.9 0-4.9 4-7.3 4.2-7.4-2.3-3.4-5.9-3.8-7.2-3.9-3.3-.3-6 1.9-7.5 1.9z"/></svg>
          <h1>Wander</h1>
        </div>

        <div className="signin-hero">
          <h2>{t.welcome}</h2>
          <p>{t.welcome_sub}</p>
        </div>

        <div className="signin-buttons">
          <button className="signin-btn google" onClick={() => onSignIn('a1')}>
            <svg viewBox="0 0 18 18" width="18" height="18">
              <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.71v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.61z"/>
              <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.83.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.34A9 9 0 0 0 9 18z"/>
              <path fill="#FBBC05" d="M3.97 10.71a5.41 5.41 0 0 1 0-3.42V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.34z"/>
              <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58A9 9 0 0 0 9 0 9 9 0 0 0 .96 4.95l3.01 2.34C4.68 5.16 6.66 3.58 9 3.58z"/>
            </svg>
            <span>{t.continue_google}</span>
          </button>
          <button className="signin-btn apple" onClick={() => onSignIn('a1')}>
            <svg viewBox="0 0 24 24" width="18" height="18" fill="currentColor"><path d="M16.4 1.4c0 1-.4 2-1.1 2.7-.7.9-1.9 1.5-2.9 1.5-.1-1 .4-2.1 1-2.7.7-.8 1.9-1.4 3-1.5zM21 17.6c-.5 1.2-.8 1.7-1.5 2.7-.9 1.4-2.3 3.2-4 3.2-1.5 0-1.9-1-4-1-2 0-2.5 1-4 1-1.7 0-3-1.6-3.9-3-2.6-3.6-2.9-7.8-1.3-10.1 1.1-1.6 3-2.6 4.7-2.6 1.8 0 2.9 1 4.4 1 1.4 0 2.3-1 4.3-1 1.6 0 3.2.8 4.4 2.3-3.9 2.1-3.3 7.7 1 7.5z"/></svg>
            <span>{t.continue_apple}</span>
          </button>
          <button className="signin-btn email">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3 7l9 6 9-6"/></svg>
            <span>{t.continue_email}</span>
          </button>
        </div>

        <p className="signin-terms">{t.terms_note}</p>
      </div>
    </div>
  );
}

/* ============================================================
   ACCOUNT MENU (avatar dropdown)
   ============================================================ */
function AccountMenu({ accounts, activeId, onSwitch, onAddAccount, onInvite, onSettings, onSignOut, t }) {
  const I = window.Ico;
  const [open, setOpen] = useS_ac(false);
  const active = accounts.find(a => a.id === activeId) || accounts[0];

  useE_ac(() => {
    if (!open) return;
    const onClick = () => setOpen(false);
    setTimeout(() => window.addEventListener('click', onClick, { once: true }));
  }, [open]);

  return (
    <div className="acct-wrap" onClick={(e) => e.stopPropagation()}>
      <button className="acct-trigger" onClick={() => setOpen(!open)}>
        <span className="acct-avatar" style={{background: active.avatar}}>{active.initials}</span>
      </button>

      {open && (
        <div className="acct-menu fade-in-fast">
          <div className="acct-active">
            <span className="acct-avatar lg" style={{background: active.avatar}}>{active.initials}</span>
            <div>
              <div className="acct-name">{active.name}</div>
              <div className="acct-email">{active.email}</div>
            </div>
          </div>

          <div className="acct-divider"/>

          <div className="acct-section-label">{t.your_accounts}</div>
          {accounts.filter(a => a.id !== active.id).map(a => (
            <button key={a.id} className="acct-row" onClick={() => { onSwitch(a.id); setOpen(false); }}>
              <span className="acct-avatar" style={{background: a.avatar}}>{a.initials}</span>
              <div className="acct-row-body">
                <div className="acct-row-name">{a.name}</div>
                <div className="acct-row-email">{a.email}</div>
              </div>
            </button>
          ))}
          <button className="acct-row" onClick={() => { onAddAccount(); setOpen(false); }}>
            <span className="acct-avatar dashed"><I.Plus /></span>
            <div className="acct-row-body">
              <div className="acct-row-name">{t.add_account}</div>
            </div>
          </button>

          <div className="acct-divider"/>

          <button className="acct-action" onClick={() => { onInvite(); setOpen(false); }}>
            <I.Share />
            <span>{t.invite_collaborator}</span>
          </button>
          <button className="acct-action" onClick={() => { onSettings(); setOpen(false); }}>
            <I.Settings />
            <span>{t.settings}</span>
          </button>
          <button className="acct-action danger" onClick={() => { onSignOut(); setOpen(false); }}>
            <I.External />
            <span>{t.sign_out}</span>
          </button>
        </div>
      )}
    </div>
  );
}

/* ============================================================
   SETTINGS MODAL
   ============================================================ */
function SettingsModal({ settings, setSettings, onClose, t }) {
  const I = window.Ico;
  const update = (k, v) => setSettings(s => ({...s, [k]: v}));

  useE_ac(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal settings-modal" onClick={(e)=>e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="modal-eyebrow">Account</div>
            <h2 className="modal-title">{t.settings_title}</h2>
          </div>
          <button className="icon-btn" onClick={onClose}><I.Close /></button>
        </header>

        <div className="modal-body settings-body">
          {/* Appearance */}
          <section className="set-section">
            <h3 className="set-section-title">{t.appearance}</h3>
            <div className="set-theme-grid">
              {[
                { id: 'light', label: t.light, preview: 'light' },
                { id: 'dark', label: t.dark, preview: 'dark' },
                { id: 'system', label: t.system, preview: 'split' },
              ].map(o => (
                <button
                  key={o.id}
                  className={`theme-tile ${settings.theme === o.id ? 'sel' : ''}`}
                  onClick={() => update('theme', o.id)}
                >
                  <div className={`theme-preview theme-${o.preview}`}>
                    <div className="tp-bar"/>
                    <div className="tp-card"/>
                    <div className="tp-card"/>
                  </div>
                  <span className="theme-label">{o.label}</span>
                </button>
              ))}
            </div>
          </section>

          {/* Language */}
          <section className="set-section">
            <h3 className="set-section-title">{t.language}</h3>
            <div className="set-lang-grid">
              {[
                { id: 'en', label: 'English', sub: 'English', flag: '🇬🇧' },
                { id: 'th', label: 'ไทย', sub: 'Thai', flag: '🇹🇭' },
              ].map(o => (
                <button
                  key={o.id}
                  className={`lang-tile ${settings.lang === o.id ? 'sel' : ''}`}
                  onClick={() => update('lang', o.id)}
                >
                  <span className="lang-flag">{o.flag}</span>
                  <div>
                    <div className="lang-label">{o.label}</div>
                    <div className="lang-sub">{o.sub}</div>
                  </div>
                  {settings.lang === o.id && <span className="lang-check"><I.Check /></span>}
                </button>
              ))}
            </div>
          </section>

          {/* Units */}
          <section className="set-section">
            <h3 className="set-section-title">{t.units}</h3>
            <div className="set-toggle-row">
              {[
                { id: 'metric', label: t.metric },
                { id: 'imperial', label: t.imperial },
              ].map(o => (
                <button
                  key={o.id}
                  className={`set-toggle-btn ${settings.units === o.id ? 'sel' : ''}`}
                  onClick={() => update('units', o.id)}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </section>

          {/* Notifications + Privacy */}
          <section className="set-section">
            <h3 className="set-section-title">{t.notifications}</h3>
            <SetSwitch label={t.email_updates} on={settings.notifEmail} onToggle={() => update('notifEmail', !settings.notifEmail)}/>
            <SetSwitch label={t.push_alerts} on={settings.notifPush} onToggle={() => update('notifPush', !settings.notifPush)}/>
          </section>
          <section className="set-section">
            <h3 className="set-section-title">{t.privacy}</h3>
            <SetSwitch label={t.public_trip} on={settings.publicTrip} onToggle={() => update('publicTrip', !settings.publicTrip)}/>
          </section>
        </div>

        <footer className="modal-foot">
          <span style={{flex:1}}/>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </footer>
      </div>
    </div>
  );
}

function SetSwitch({ label, on, onToggle }) {
  return (
    <label className="set-row">
      <span>{label}</span>
      <button className={`set-switch ${on?'on':''}`} onClick={onToggle}>
        <span className="set-switch-thumb"/>
      </button>
    </label>
  );
}

/* ============================================================
   INVITE MODAL
   ============================================================ */
function InviteModal({ invites, setInvites, onClose, t }) {
  const I = window.Ico;
  const [email, setEmail] = useS_ac('');
  const [role, setRole] = useS_ac('editor');
  const [copied, setCopied] = useS_ac(false);

  useE_ac(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const send = () => {
    if (!email) return;
    const initials = email.charAt(0).toUpperCase();
    const colors = ['#ef476f','#06d6a0','#118ab2','#f59e0b','#9d4edd'];
    setInvites([...invites, {
      id: 'i'+Date.now(),
      email, name: null, role, status: 'pending',
      avatar: colors[invites.length % colors.length], initials,
    }]);
    setEmail('');
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal invite-modal" onClick={(e)=>e.stopPropagation()}>
        <header className="modal-head">
          <div>
            <div className="modal-eyebrow">Collaborate</div>
            <h2 className="modal-title">{t.invite_title}</h2>
            <div style={{fontSize:13, color:'var(--cm-fg-2)', marginTop:4}}>{t.invite_sub}</div>
          </div>
          <button className="icon-btn" onClick={onClose}><I.Close /></button>
        </header>

        <div className="modal-body">
          <div className="invite-input-row">
            <input
              type="email"
              placeholder={t.invite_placeholder}
              value={email}
              onChange={(e)=>setEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && send()}
            />
            <select value={role} onChange={(e)=>setRole(e.target.value)}>
              <option value="editor">{t.role_editor}</option>
              <option value="viewer">{t.role_viewer}</option>
            </select>
            <button className="btn btn-primary" onClick={send} disabled={!email}>{t.send_invite}</button>
          </div>

          <div className="invite-link-row">
            <div className="invite-link-icon"><I.Globe /></div>
            <div className="invite-link-body">
              <div className="invite-link-title">Anyone with the link can view</div>
              <div className="invite-link-url">wander.app/trip/jp-spring-2026</div>
            </div>
            <button className="mc-btn-ghost" onClick={() => { setCopied(true); setTimeout(()=>setCopied(false), 1500); }}>
              {copied ? <><I.Check/> Copied</> : <><I.External/> {t.copy_link}</>}
            </button>
          </div>

          <div className="invite-list">
            <div className="invite-list-label">People with access</div>
            {invites.map(inv => (
              <div key={inv.id} className="invite-row">
                <span className="acct-avatar" style={{background: inv.avatar}}>{inv.initials}</span>
                <div className="invite-row-body">
                  <div className="invite-row-name">{inv.name || inv.email}</div>
                  {inv.name && <div className="invite-row-email">{inv.email}</div>}
                </div>
                <span className={`invite-status ${inv.status}`}>{t[inv.status]}</span>
                <select className="invite-role" defaultValue={inv.role}>
                  <option value="editor">{t.role_editor}</option>
                  <option value="viewer">{t.role_viewer}</option>
                </select>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

window.SignInScreen = SignInScreen;
window.AccountMenu = AccountMenu;
window.SettingsModal = SettingsModal;
window.InviteModal = InviteModal;
