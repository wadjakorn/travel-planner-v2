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

type Props = {
  tripId: string;
  notes: NoteRow[];
  activeId: string | null;
  canEdit?: boolean;
};

export function NotesView({
  tripId,
  notes,
  activeId,
  canEdit = true,
}: Props) {
  const checklists = notes.filter((n) => n.kind === 'checklist');
  const docs = notes.filter((n) => n.kind === 'doc');
  const active = notes.find((n) => n.id === activeId) ?? notes[0] ?? null;

  return (
    <div className="px-6 py-6">
      <header className="mb-4 flex items-center justify-between">
        <div>
          <div className="text-xs uppercase tracking-wide text-zinc-500">
            Reminders
          </div>
          <h1 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
            Notes &amp; checklists
          </h1>
          <div className="text-sm text-zinc-500">
            {checklists.length} checklists · {docs.length} docs
          </div>
        </div>
        {canEdit ? (
          <div className="flex gap-2">
            <form action={addNoteAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <input type="hidden" name="kind" value="checklist" />
              <input type="hidden" name="title" value="New checklist" />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
              >
                <Plus width={14} height={14} />
                New checklist
              </button>
            </form>
            <form action={addNoteAction}>
              <input type="hidden" name="tripId" value={tripId} />
              <input type="hidden" name="kind" value="doc" />
              <input type="hidden" name="title" value="New doc" />
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-full border border-zinc-300 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-200 dark:hover:bg-zinc-900"
              >
                <Plus width={14} height={14} />
                New doc
              </button>
            </form>
          </div>
        ) : null}
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[300px_1fr]">
        <aside className="space-y-6 border-r border-zinc-200 pr-4 dark:border-zinc-800">
          <NoteListSection
            label="Checklists"
            tripId={tripId}
            items={checklists}
            activeId={active?.id ?? null}
          />
          <NoteListSection
            label="Docs"
            tripId={tripId}
            items={docs}
            activeId={active?.id ?? null}
          />
          {notes.length === 0 ? (
            <p className="text-sm text-zinc-500">
              No notes yet. Create one above.
            </p>
          ) : null}
        </aside>

        <main className="min-h-[400px]">
          {active ? (
            <NoteDetail note={active} canEdit={canEdit} />
          ) : (
            <EmptyDetail />
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
}: {
  label: string;
  tripId: string;
  items: NoteRow[];
  activeId: string | null;
}) {
  if (items.length === 0) return null;
  return (
    <section>
      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
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
                    ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
                    : 'text-zinc-700 hover:bg-zinc-50 dark:text-zinc-300 dark:hover:bg-zinc-900'
                }`}
              >
                <NoteIcon width={16} height={16} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{n.title}</span>
                  <span className="block truncate text-xs text-zinc-500">
                    {n.kind === 'checklist'
                      ? `${done}/${total} · ${formatRel(n.updatedAt)}`
                      : `Doc · ${formatRel(n.updatedAt)}`}
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

function NoteDetail({ note, canEdit }: { note: NoteRow; canEdit: boolean }) {
  return (
    <article className="rounded-2xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950">
      <header className="mb-4 flex items-start justify-between gap-3">
        {canEdit ? (
          <form action={renameNoteAction} className="flex-1">
            <input type="hidden" name="noteId" value={note.id} />
            <input
              name="title"
              defaultValue={note.title}
              className="w-full bg-transparent text-xl font-semibold text-zinc-900 outline-none focus:ring-1 focus:ring-zinc-300 dark:text-zinc-50 dark:focus:ring-zinc-700"
            />
            <div className="mt-1 text-xs text-zinc-500">
              Last edited {formatRel(note.updatedAt)} · press Enter to save
            </div>
          </form>
        ) : (
          <div className="flex-1">
            <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">
              {note.title}
            </h2>
            <div className="mt-1 text-xs text-zinc-500">
              Last edited {formatRel(note.updatedAt)}
            </div>
          </div>
        )}
        {canEdit ? (
          <form action={removeNoteAction}>
            <input type="hidden" name="noteId" value={note.id} />
            <button
              type="submit"
              aria-label="Delete note"
              className="rounded-full p-2 text-zinc-500 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
            >
              <Trash width={16} height={16} />
            </button>
          </form>
        ) : null}
      </header>

      {note.kind === 'checklist' ? (
        <ChecklistBody noteId={note.id} items={note.items} canEdit={canEdit} />
      ) : (
        <DocBody noteId={note.id} body={note.body ?? ''} canEdit={canEdit} />
      )}
    </article>
  );
}

function ChecklistBody({
  noteId,
  items,
  canEdit,
}: {
  noteId: string;
  items: NoteRow['items'];
  canEdit: boolean;
}) {
  return (
    <div className="flex flex-col gap-2">
      {items.map((it) => (
        <div key={it.id} className="flex items-center gap-3">
          {canEdit ? (
            <form action={toggleChecklistItemAction}>
              <input type="hidden" name="itemId" value={it.id} />
              <button
                type="submit"
                aria-label={it.done ? 'Mark incomplete' : 'Mark complete'}
                className={`flex h-5 w-5 items-center justify-center rounded border transition-colors ${
                  it.done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
                }`}
              >
                {it.done ? <Check width={12} height={12} /> : null}
              </button>
            </form>
          ) : (
            <span
              className={`flex h-5 w-5 items-center justify-center rounded border ${
                it.done
                  ? 'border-emerald-500 bg-emerald-500 text-white'
                  : 'border-zinc-300 bg-white dark:border-zinc-700 dark:bg-zinc-900'
              }`}
            >
              {it.done ? <Check width={12} height={12} /> : null}
            </span>
          )}
          <span
            className={`flex-1 text-sm ${
              it.done
                ? 'text-zinc-400 line-through'
                : 'text-zinc-800 dark:text-zinc-200'
            }`}
          >
            {it.text}
          </span>
          {canEdit ? (
            <form action={removeChecklistItemAction}>
              <input type="hidden" name="itemId" value={it.id} />
              <button
                type="submit"
                aria-label="Remove item"
                className="rounded-full p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950"
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
            placeholder="Add item…"
            required
            className="flex-1 rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-50"
          />
          <button
            type="submit"
            className="inline-flex items-center gap-1 rounded-full bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
          >
            <Plus width={14} height={14} />
            Add
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
}: {
  noteId: string;
  body: string;
  canEdit: boolean;
}) {
  if (!canEdit) {
    return (
      <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-800 dark:text-zinc-200">
        {body || (
          <span className="italic text-zinc-500">(No content)</span>
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
        className="w-full resize-y rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm leading-relaxed text-zinc-800 outline-none focus:border-zinc-400 dark:border-zinc-800 dark:bg-zinc-950 dark:text-zinc-200"
        placeholder="Write something…"
      />
      <div className="flex justify-end">
        <button
          type="submit"
          className="rounded-full bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-50 dark:text-zinc-900 dark:hover:bg-zinc-200"
        >
          Save
        </button>
      </div>
    </form>
  );
}

function EmptyDetail() {
  return (
    <div className="flex h-full items-center justify-center rounded-2xl border border-dashed border-zinc-300 p-12 text-center dark:border-zinc-700">
      <div>
        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300">
          No notes yet
        </p>
        <p className="mt-1 text-sm text-zinc-500">
          Create a checklist or doc to get started.
        </p>
      </div>
    </div>
  );
}

function formatRel(d: Date): string {
  const diffMs = Date.now() - d.getTime();
  const min = Math.floor(diffMs / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}
