// Phase 6 — Notes & checklists view. Two-column: left rail = list of
// checklists + docs; right pane = active note detail. Selection driven
// by ?n= search param. Plain-text doc body for now (rich-text editor
// deferred to Phase 11).

import Link from 'next/link';
import { Plus, Note as NoteIcon, Trash, Check } from '@/components/icons';
import {
  addNoteAction,
  removeNoteAction,
  renameNoteAction,
  updateDocBodyAction,
  addChecklistItemAction,
  toggleChecklistItemAction,
  removeChecklistItemAction,
} from '@/app/actions/notes';
import type { NoteRow } from '@/lib/note-queries';
import { tFor, tServer } from '@/lib/i18n';

type T = ReturnType<typeof tFor>;

// Default titles of new notes are stored data, not UI copy (i18n Decision 4).
const NEW_CHECKLIST_TITLE = 'New checklist';
const NEW_DOC_TITLE = 'New doc';

type Props = {
  tripId: string;
  notes: NoteRow[];
  activeId: string | null;
  canEdit?: boolean;
};

export async function NotesView({
  tripId,
  notes,
  activeId,
  canEdit = true,
}: Props) {
  const t = await tServer();
  const checklists = notes.filter((n) => n.kind === 'checklist');
  const docs = notes.filter((n) => n.kind === 'doc');
  const active = notes.find((n) => n.id === activeId) ?? notes[0] ?? null;

  return (
    <div className="px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-muted">
            {t('notes_eyebrow')}
          </div>
          <h1 className="text-2xl font-semibold text-foreground">
            {t('notes_title')}
          </h1>
          <div className="text-sm text-muted">
            {t('notes_count', { checklists: checklists.length, docs: docs.length })}
          </div>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <form action={addNoteAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <input type="hidden" name="kind" value="checklist" />
              <input type="hidden" name="title" value={NEW_CHECKLIST_TITLE} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
              >
                <Plus width={14} height={14} />
                {t('notes_new_checklist')}
              </button>
            </form>
            <form action={addNoteAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <input type="hidden" name="kind" value="doc" />
              <input type="hidden" name="title" value={NEW_DOC_TITLE} />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-2 text-sm text-muted hover:bg-surface-2"
              >
                <Plus width={14} height={14} />
                {t('notes_new_doc')}
              </button>
            </form>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-6 border-r border-border pr-4">
          <NoteListSection
            label={t('notes_checklists')}
            tripId={tripId}
            items={checklists}
            activeId={active?.id ?? null}
            t={t}
          />
          <NoteListSection
            label={t('notes_docs')}
            tripId={tripId}
            items={docs}
            activeId={active?.id ?? null}
            t={t}
          />
          {notes.length === 0 ? (
            <p className="text-sm text-muted">
              {t('notes_empty_list')}
            </p>
          ) : null}
        </aside>

        <main className="min-h-[400px]">
          {active ? (
            <NoteDetail note={active} canEdit={canEdit} t={t} />
          ) : (
            <EmptyDetail t={t} />
          )}
        </main>
      </div>
    </div>
  );
}

function NoteListSection({
  label,
  tripId,
  items,
  activeId,
  t,
}: {
  label: string;
  tripId: string;
  items: NoteRow[];
  activeId: string | null;
  t: T;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
        {label}
      </div>
      <ul className="flex flex-col gap-1">
        {items.map((n) => {
          const done = n.items.filter((i) => i.done).length;
          const total = n.items.length;
          return (
            <li key={n.id}>
              <Link
                href={`/trip/${tripId}/notes?n=${n.id}`}
                className={`flex items-start gap-2 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                  n.id === activeId
                    ? 'bg-surface-2 text-foreground'
                    : 'text-muted hover:bg-surface-2'
                }`}
              >
                <NoteIcon width={16} height={16} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{n.title}</span>
                  <span className="block truncate text-xs text-muted">
                    {n.kind === 'checklist'
                      ? `${done}/${total} · ${formatRel(n.updatedAt, t)}`
                      : t('notes_doc_meta', { when: formatRel(n.updatedAt, t) })}
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function NoteDetail({ note, canEdit, t }: { note: NoteRow; canEdit: boolean; t: T }) {
  return (
    <article className="rounded-2xl border border-border bg-surface p-5">
      <header className="mb-4 flex items-start justify-between gap-3">
        {canEdit ? (
          <form action={renameNoteAction} className="flex-1">
            <input type="hidden" name="noteId" value={note.id} />
            <input
              name="title"
              defaultValue={note.title}
              className="w-full bg-transparent text-xl font-semibold text-foreground outline-none focus:ring-1 focus:ring-ring"
            />
            <div className="mt-1 text-xs text-muted">
              {t('notes_last_edited_enter', { when: formatRel(note.updatedAt, t) })}
            </div>
          </form>
        ) : (
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-foreground">
              {note.title}
            </h2>
            <div className="mt-1 text-xs text-muted">
              {t('notes_last_edited', { when: formatRel(note.updatedAt, t) })}
            </div>
          </div>
        )}
        {canEdit ? (
          <form action={removeNoteAction}>
            <input type="hidden" name="noteId" value={note.id} />
            <button
              type="submit"
              aria-label={t('notes_delete_aria')}
              className="rounded-full p-2 text-muted hover:bg-danger/10 hover:text-danger"
            >
              <Trash width={16} height={16} />
            </button>
          </form>
        ) : null}
      </header>

      {note.kind === 'checklist' ? (
        <ChecklistBody noteId={note.id} items={note.items} canEdit={canEdit} t={t} />
      ) : (
        <DocBody noteId={note.id} body={note.body ?? ''} canEdit={canEdit} t={t} />
      )}
    </article>
  );
}

function ChecklistBody({
  noteId,
  items,
  canEdit,
  t,
}: {
  noteId: string;
  items: NoteRow['items'];
  canEdit: boolean;
  t: T;
}) {
  return (
    <div className="flex flex-col gap-2 pointer-coarse:gap-0">
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-3 pointer-coarse:min-h-11">
          {canEdit ? (
            <form action={toggleChecklistItemAction}>
              <input type="hidden" name="itemId" value={it.id} />
              <button
                type="submit"
                aria-label={it.done ? t('notes_mark_incomplete_aria') : t('notes_mark_complete_aria')}
                className={`tp-hit flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                  it.done
                    ? 'border-success bg-success text-success-foreground'
                    : 'border-input bg-surface'
                }`}
              >
                {it.done ? <Check width={12} height={12} /> : null}
              </button>
            </form>
          ) : (
            <span
              className={`flex h-5 w-5 items-center justify-center rounded border ${
                it.done
                  ? 'border-success bg-success text-success-foreground'
                  : 'border-input bg-surface'
              }`}
            >
              {it.done ? <Check width={12} height={12} /> : null}
            </span>
          )}
          <span
            className={`flex-1 text-sm ${
              it.done
                ? 'text-muted/60 line-through'
                : 'text-foreground'
            }`}
          >
            {it.text}
          </span>
          {canEdit ? (
            <form action={removeChecklistItemAction}>
              <input type="hidden" name="itemId" value={it.id} />
              <button
                type="submit"
                aria-label={t('notes_delete_item_aria')}
                className="tp-hit rounded-full p-1.5 text-muted hover:bg-danger/10 hover:text-danger"
              >
                <Trash width={14} height={14} />
              </button>
            </form>
          ) : null}
        </div>
      ))}

      {canEdit ? (
        <form
          action={addChecklistItemAction}
          className="mt-3 flex items-center gap-2"
        >
          <input type="hidden" name="noteId" value={noteId} />
          <input
            name="text"
            placeholder={t('notes_add_item_placeholder')}
            required
            className="flex-1 rounded-lg border border-input bg-surface px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-full bg-brand px-3 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
          >
            <Plus width={14} height={14} />
            {t('notes_add_item')}
          </button>
        </form>
      ) : null}
    </div>
  );
}

function DocBody({
  noteId,
  body,
  canEdit,
  t,
}: {
  noteId: string;
  body: string;
  canEdit: boolean;
  t: T;
}) {
  if (!canEdit) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
        {body || (
          <span className="italic text-muted">{t('notes_no_content')}</span>
        )}
      </p>
    );
  }
  return (
    <form action={updateDocBodyAction} className="flex flex-col gap-2">
      <input type="hidden" name="noteId" value={noteId} />
      <textarea
        name="body"
        defaultValue={body}
        rows={12}
        className="w-full resize-y rounded-lg border border-input bg-surface px-3 py-2 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted focus-visible:ring-2 focus-visible:ring-ring"
        placeholder={t('notes_doc_placeholder')}
      />
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-full bg-brand px-4 py-2 text-sm font-medium text-brand-foreground hover:bg-brand/90"
        >
          {t('save')}
        </button>
      </div>
    </form>
  );
}

function EmptyDetail({ t }: { t: T }) {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-border p-12 text-center">
      <div>
        <p className="text-sm font-medium text-foreground">
          {t('notes_empty_title')}
        </p>
        <p className="mt-1 text-sm text-muted">
          {t('notes_empty_body')}
        </p>
      </div>
    </div>
  );
}

function formatRel(d: Date, t: T): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return t('notes_rel_just_now');
  if (min < 60) return t('notes_rel_min', { n: min });
  const hr = Math.floor(min / 60);
  if (hr < 24) return t('notes_rel_hour', { n: hr });
  const day = Math.floor(hr / 24);
  if (day < 7) return t('notes_rel_day', { n: day });
  // Date formatting follows the language in i18n P6.
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
