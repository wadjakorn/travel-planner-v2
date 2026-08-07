'use client';

import Link, { useLinkStatus } from 'next/link';
import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from './ui/cn';
import { usePendingSaves } from '@/components/pending-saves';

// Feedback where the finger is. useLinkStatus only reports for the Link it is
// rendered inside, which is exactly what a per-row spinner needs — the global
// bar at the top of the window is easy to miss on a phone.
function LinkSpinner({ idle }: { idle?: ReactNode }) {
  const { pending } = useLinkStatus();
  if (!pending) return <>{idle}</>;
  return (
    <span className={styles.linkSpinner} role="status" aria-label="Loading">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden>
        <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" opacity="0.25" />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

export function Chevron({ className }: { className?: string; 'aria-hidden'?: boolean }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="m9 18 6-6-6-6" />
    </svg>
  );
}
import styles from './settings-folio.module.css';

export type SettingsFolioSection = {
  id: string;
  label: string;
  danger?: boolean;
};

type SettingsFolioProps = {
  scopeLabel: string;
  scopeTitle: string;
  sections: SettingsFolioSection[];
  // Which pane is open. Lives in the URL (?s=), not in component state: server
  // actions here redirect (createInviteAction), and in-memory state would snap
  // back to the first section on every one of them — and on refresh, and on a
  // shared link.
  //
  // Its ABSENCE also carries meaning on a phone: no ?s= means "show me the
  // list of sections". Desktop has room for the list and a pane at once, so
  // there it just falls back to the first section.
  active?: string;
  navLabel?: string;
  className?: string;
  children: ReactNode;
};

type SettingsPaneProps = {
  id: string;
  title: string;
  description?: string;
  className?: string;
  children: ReactNode;
};

type SettingsFieldProps = {
  label: string;
  hint?: string;
  className?: string;
  children: ReactNode;
};

type SettingsSegmentedProps = {
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  defaultValue: string;
  hint?: string;
  className?: string;
};

type SettingsDeferredProps = {
  title: string;
  reason: string;
  className?: string;
};

type SettingsNoticeProps = {
  children: ReactNode;
  className?: string;
};

export function SettingsFolio({
  scopeLabel,
  scopeTitle,
  sections,
  active: activeProp,
  navLabel,
  className,
  children,
}: SettingsFolioProps) {
  const { pendingCount } = usePendingSaves();
  const saving = pendingCount > 0;
  const fallback = sections[0]?.id ?? '';
  const chosen = sections.find((s) => s.id === activeProp);
  const active = chosen?.id ?? fallback;
  // Phone layout is a list that drills into one section, so it needs to know
  // whether the user actually picked one.
  const drilledIn = Boolean(chosen);

  return (
    <div
      className={cn(styles.folio, drilledIn ? styles.folioDrilled : styles.folioList, className)}
    >
      <aside className={styles.stub}>
        <div className={styles.stubHead}>
          <div className={styles.stubK}>{scopeLabel}</div>
          <div className={styles.stubV}>{scopeTitle}</div>
        </div>
        <nav className={styles.stubNav} aria-label={navLabel ?? `${scopeLabel} settings sections`}>
          {sections.map((section, index) => {
            const current = active === section.id;
            if (saving && !current) {
              return (
                <span
                  key={section.id}
                  aria-disabled="true"
                  title="Finish saving first"
                  className={cn(
                    styles.stubButton,
                    styles.stubButtonDisabled,
                    section.danger && styles.stubButtonDanger,
                  )}
                >
                  <span className={styles.stubNumber}>
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  <span>{section.label}</span>
                </span>
              );
            }
            return (
              <Link
                key={section.id}
                href={`?s=${section.id}`}
                scroll={false}
                className={cn(styles.stubButton, section.danger && styles.stubButtonDanger)}
                aria-current={current ? 'true' : undefined}
              >
                <span className={styles.stubNumber}>{String(index + 1).padStart(2, '0')}</span>
                <span>{section.label}</span>
                <LinkSpinner idle={<Chevron className={styles.stubChevron} aria-hidden />} />
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.panes}>
        {/* Phone only: the way back out of a section. Desktop always shows the
            list beside the pane, so this would be noise there. */}
        <Link href="?" scroll={false} className={styles.paneBack}>
          <LinkSpinner idle={<Chevron className={styles.paneBackIcon} aria-hidden />} />
          All {scopeLabel.toLowerCase()} settings
        </Link>
        {Children.map(children, (child) => {
          if (!isValidElement<SettingsPaneProps>(child)) return child;
          return cloneElement(
            child as ReactElement<SettingsPaneProps & HTMLAttributes<HTMLElement>>,
            {
              hidden: child.props.id !== active,
            },
          );
        })}
      </div>
    </div>
  );
}

export function SettingsPane({
  id,
  title,
  description,
  className,
  children,
  ...props
}: SettingsPaneProps & HTMLAttributes<HTMLElement>) {
  return (
    <section
      id={`p-${id}`}
      className={cn(styles.pane, className)}
      aria-labelledby={`${id}-title`}
      {...props}
    >
      <header className={styles.paneHead}>
        <h2 id={`${id}-title`} className={styles.paneTitle}>
          {title}
        </h2>
        {description ? <p className={styles.paneLead}>{description}</p> : null}
      </header>
      {children}
    </section>
  );
}

export function SettingsField({
  label,
  hint,
  className,
  children,
}: SettingsFieldProps) {
  return (
    <div className={cn(styles.field, className)}>
      <div className={styles.fieldLabel}>{label}</div>
      <div>{children}</div>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </div>
  );
}

export function SettingsSegmented({
  name,
  label,
  options,
  defaultValue,
  hint,
  className,
}: SettingsSegmentedProps) {
  return (
    <fieldset className={cn(styles.segmentedField, className)}>
      <legend className={styles.fieldLabel}>{label}</legend>
      <div className={styles.segmented} role="radiogroup" aria-label={label}>
        {options.map((option) => (
          <label key={option.value} className={styles.segmentOption}>
            <input
              type="radio"
              name={name}
              value={option.value}
              defaultChecked={option.value === defaultValue}
              className={styles.segmentInput}
            />
            <span className={styles.segmentControl}>{option.label}</span>
          </label>
        ))}
      </div>
      {hint ? <p className={styles.fieldHint}>{hint}</p> : null}
    </fieldset>
  );
}

export function SettingsDeferred({
  title,
  reason,
  className,
}: SettingsDeferredProps) {
  return (
    <div className={cn(styles.deferred, className)}>
      <span className={styles.deferredStamp}>Not yet</span>
      <div className={styles.deferredTitle}>{title}</div>
      <div className={styles.deferredReason}>{reason}</div>
    </div>
  );
}

export function SettingsNotice({ children, className }: SettingsNoticeProps) {
  return <div className={cn(styles.notice, className)}>{children}</div>;
}
