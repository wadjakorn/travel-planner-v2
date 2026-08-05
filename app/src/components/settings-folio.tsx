'use client';

import Link from 'next/link';
import {
  Children,
  cloneElement,
  isValidElement,
  type HTMLAttributes,
  type ReactElement,
  type ReactNode,
} from 'react';
import { cn } from './ui/cn';
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
  const fallback = sections[0]?.id ?? '';
  const active = sections.some((s) => s.id === activeProp) ? activeProp : fallback;

  return (
    <div className={cn(styles.folio, className)}>
      <aside className={styles.stub}>
        <div className={styles.stubHead}>
          <div className={styles.stubK}>{scopeLabel}</div>
          <div className={styles.stubV}>{scopeTitle}</div>
        </div>
        <nav className={styles.stubNav} aria-label={navLabel ?? `${scopeLabel} settings sections`}>
          {sections.map((section, index) => {
            const current = active === section.id;
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
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className={styles.panes}>
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
