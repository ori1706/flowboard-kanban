import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import clsx from 'clsx';
import { formatDistanceToNowStrict } from 'date-fns';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';
import type { KeyboardEvent as ReactKb } from 'react';
import type { BoardDetail, CardDetail } from '@/types';
import { api } from '@/lib/api';

type Props = {
  modal: { boardId: string; detail: CardDetail } | null;
  onClose: () => void;
  portalId: string;
};

export default function CardModalHost({ modal, onClose, portalId }: Props) {
  const el = typeof document !== 'undefined' ? document.getElementById(portalId) : null;

  useEffect(() => {
    function esc(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', esc);
    return () => window.removeEventListener('keydown', esc);
  }, [onClose]);

  if (!modal || !el) return null;

  return createPortal(<CardInner modal={modal} onClose={onClose} />, el);
}

function CardInner({
  modal,
  onClose,
}: {
  modal: NonNullable<Props['modal']>;
  onClose: () => void;
}) {
  const qc = useQueryClient();

  const { data: detail } = useQuery({
    queryKey: ['card', modal.detail.id],
    queryFn: () => api.cardDetail(modal.detail.id) as Promise<CardDetail>,
    initialData: modal.detail,
    enabled: Boolean(modal.detail.id),
  });

  if (!detail) return null;

  const board = qc.getQueryData(['board', modal.boardId]) as BoardDetail | undefined;
  const palette = board?.labels?.length ? board.labels : detail.labels;

  const patch = useMutation({
    mutationFn: (payload: Record<string, unknown>) => api.patchCard(detail.id, payload) as Promise<BoardDetail>,
    onSuccess: (b) => {
      qc.setQueryData(['board', modal.boardId], b);
      void qc.invalidateQueries({ queryKey: ['card', modal.detail.id] });
    },
  });

  const commentMut = useMutation({
    mutationFn: (body: string) =>
      api.comment(detail.id, body) as Promise<{ detail: CardDetail; board: BoardDetail }>,
    onSuccess: (res) => {
      qc.setQueryData(['board', modal.boardId], res.board);
      qc.setQueryData(['card', modal.detail.id], res.detail);
    },
  });

  const checklistMut = useMutation({
    mutationFn: ({ itemId, done }: { itemId: string; done: boolean }) =>
      api.checklistItemPatch(itemId, { done }) as Promise<BoardDetail>,
    onSuccess: (b) => qc.setQueryData(['board', modal.boardId], b),
  });

  const checklistAdd = useMutation({
    mutationFn: () =>
      api.checklist(detail.id, 'New checklist') as Promise<{ board: BoardDetail }>,
    onSuccess: (r) => qc.setQueryData(['board', modal.boardId], r.board),
  });

  const selectedLabelIds = new Set(detail.labels.map((x) => x.id));

  return (
    <div
      className="animate-fade-in relative flex h-full w-full flex-col items-stretch bg-slate-950/82 py-10 backdrop-blur-sm"
      data-card-modal-open="true"
    >
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default bg-slate-950/70 outline-none ring-inset ring-teal-400/30 focus-visible:ring-2"
        onClick={onClose}
      />
      <div className="relative z-10 mx-auto flex max-h-[92%] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-white/15 bg-slate-900 shadow-glass flex-initial">
        <div className="flex items-start justify-between border-b border-white/10 px-5 py-3">
          <input
            className="flex-1 bg-transparent text-xl font-semibold tracking-tight text-white outline-none"
            defaultValue={detail.title}
            onBlur={(e) => {
              const v = e.target.value.trim();
              if (v && v !== detail.title) patch.mutate({ title: v });
            }}
          />
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-2 py-1 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
          >
            Close
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-auto px-5 py-4 text-sm">
          {(detail.coverImage || detail.coverColor) && (
            <div
              className="h-40 w-full overflow-hidden rounded-xl border border-white/10"
              style={
                detail.coverImage
                  ? {
                      backgroundImage: `url(${detail.coverImage})`,
                      backgroundSize: 'cover',
                      backgroundPosition: 'center',
                    }
                  : { backgroundColor: detail.coverColor ?? '#334155' }
              }
            />
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Cover hex
              <input
                placeholder="#334155"
                defaultValue={detail.coverColor ?? ''}
                onBlur={(e) => patch.mutate({ coverColor: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              Cover image URL
              <input
                defaultValue={detail.coverImage ?? ''}
                onBlur={(e) => patch.mutate({ coverImage: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs"
              />
            </label>
            <label className="block text-[11px] font-semibold uppercase tracking-wide text-slate-400 sm:col-span-2">
              Due date
              <input
                type="date"
                defaultValue={detail.dueDate ?? ''}
                onChange={(e) => patch.mutate({ dueDate: e.target.value || null })}
                className="mt-1 w-full rounded-lg border border-white/10 bg-slate-950 px-2 py-1 text-xs"
              />
            </label>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Labels</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {palette.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => {
                    const next = new Set(selectedLabelIds);
                    if (next.has(l.id)) next.delete(l.id);
                    else next.add(l.id);
                    patch.mutate({ labelIds: [...next] });
                  }}
                  className={clsx(
                    'rounded-full px-2 py-0.5 text-[11px] font-bold text-slate-950 ring-2 ring-transparent',
                    selectedLabelIds.has(l.id) ? 'ring-white' : 'opacity-60',
                  )}
                  style={{ backgroundColor: l.color }}
                >
                  {l.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Description · Markdown</div>
            <textarea
              className="mt-2 min-h-[120px] w-full rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 font-mono text-xs leading-relaxed text-slate-100 outline-none ring-teal-400/35 focus-visible:ring-2"
              defaultValue={detail.description}
              onBlur={(e) => patch.mutate({ description: e.target.value })}
            />
            <div className="markdown-body mt-3 max-w-none space-y-2 text-sm leading-relaxed text-slate-200 [&_a]:text-teal-300 [&_code]:rounded [&_code]:bg-slate-800/80 [&_code]:px-1 [&_pre]:overflow-x-auto [&_pre]:rounded-lg [&_pre]:bg-slate-950 [&_pre]:p-3 [&_strong]:text-white [&_ul]:list-disc [&_ul]:pl-5">
              <Markdown remarkPlugins={[remarkGfm]}>{detail.description || '_No description yet_'}</Markdown>
            </div>
          </div>

          <div>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Checklists</div>
              <button
                type="button"
                onClick={() => checklistAdd.mutate()}
                className="text-xs font-semibold text-teal-300 hover:text-teal-100"
              >
                + checklist
              </button>
            </div>
            {detail.checklists.map((cl) => {
              const done = cl.items.filter((i) => i.done).length;
              const total = cl.items.length || 1;
              const pct = Math.round((done / total) * 100);
              return (
                <div key={cl.id} className="mb-4 rounded-xl border border-white/10 bg-slate-950/55 p-3">
                  <div className="font-medium text-white">{cl.title}</div>
                  <div className="mt-2 h-1.5 w-full rounded-full bg-slate-800">
                    <div className="h-full rounded-full bg-teal-500 transition-all" style={{ width: `${pct}%` }} />
                  </div>
                  <div className="mt-3 space-y-2">
                    {cl.items.map((it) => (
                      <label key={it.id} className="flex cursor-pointer gap-2 text-xs text-slate-200">
                        <input
                          type="checkbox"
                          checked={it.done}
                          onChange={(e) => checklistMut.mutate({ itemId: it.id, done: e.target.checked })}
                        />
                        <span>{it.text}</span>
                      </label>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          <div>
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Comments</div>
            <Composer
              draftId={`fb-draft-${detail.id}`}
              placeholder="Leave a threaded note…"
              onSubmit={(b) => {
                if (b.trim()) commentMut.mutate(b);
              }}
            />
            <div className="mt-3 space-y-3">
              {detail.comments.map((c) => (
                <div key={c.id} className="flex gap-3 rounded-xl border border-white/5 bg-slate-950/40 p-3">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img src={c.user.avatarUrl} alt="" className="h-9 w-9 rounded-full ring-2 ring-teal-500/20" />
                  <div>
                    <div className="text-xs font-semibold text-white">{c.user.name}</div>
                    <div className="text-[11px] text-slate-500">{reldate(c.createdAt)}</div>
                    <div className="mt-2 text-sm leading-relaxed text-slate-200">{c.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="border-t border-white/10 pb-8 pt-4">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Activity</div>
            <ul className="mt-3 space-y-2 text-xs text-slate-300">
              {detail.activities.map((a) => (
                <li key={a.id} className="flex gap-2">
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img src={a.user.avatarUrl} alt="" className="h-7 w-7 rounded-full opacity-85" />
                  <div className="min-w-0">
                    <div className="text-slate-100">{summarizeActivity(a)}</div>
                    <div className="mt-1 text-[11px] text-slate-500">{reldate(a.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}

function Composer({
  draftId,
  onSubmit,
  placeholder,
}: {
  draftId: string;
  onSubmit: (b: string) => void;
  placeholder: string;
}) {
  const [val, setVal] = useState('');
  function push() {
    if (!val.trim()) return;
    onSubmit(val);
    setVal('');
  }
  function kd(e: ReactKb<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      push();
    }
  }
  return (
    <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
      <textarea
        id={draftId}
        value={val}
        onChange={(e) => setVal(e.target.value)}
        rows={3}
        placeholder={`${placeholder} (⌘/Ctrl + Enter)`}
        onKeyDown={kd}
        className="min-h-[88px] w-full flex-1 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-sm outline-none ring-teal-400/35 focus-visible:ring-2 sm:min-w-0"
      />
      <button
        type="button"
        onClick={() => push()}
        className="shrink-0 rounded-xl bg-teal-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 sm:self-stretch sm:py-2"
      >
        Comment
      </button>
    </div>
  );
}

function reldate(iso: string) {
  return formatDistanceToNowStrict(new Date(iso), { addSuffix: true });
}

function summarizeActivity(a: CardDetail['activities'][number]): string {
  const p = a.payload as Record<string, string | undefined>;
  const actor = `${a.user.name}`;
  switch (a.type) {
    case 'card_moved_list':
      return `${actor} moved this card · ${p.fromListName ?? 'List'} → ${p.toListName ?? 'List'}`;
    case 'comment_added':
      return `${actor} added a comment`;
    case 'checklist_toggle':
      return `${actor} updated checklist progress`;
    case 'checklist_created':
      return `${actor} attached a checklist`;
    case 'card_created':
      return `${actor} created this card`;
    case 'card_renamed':
      return `${actor} renamed this card`;
    default:
      return `${actor} ${a.type.replace(/_/g, ' ')}`;
  }
}
