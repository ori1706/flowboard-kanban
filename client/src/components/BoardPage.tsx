/* eslint-disable @typescript-eslint/no-floating-promises */
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { clsx } from 'clsx';
import { differenceInCalendarDays } from 'date-fns';
import { useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKb } from 'react';
import type { Socket } from 'socket.io-client';
import { api } from '@/lib/api';
import { getClientId } from '@/lib/session';
import { createSocketInstance } from '@/lib/socket';
import type { BoardDetail, CardLite, KanbanList, PresenceViewer } from '@/types';

function lidCard(board: BoardDetail, cardId: string): string | undefined {
  return board.lists.find((l) => l.cards.some((c) => c.id === cardId))?.id;
}

function betweenPositions(before?: number | null, after?: number | null): number {
  if (before != null && after != null) {
    const mid = (before + after) / 2;
    return Math.abs(before - after) < 1e-9 ? before + 1e-6 : mid;
  }
  if (before != null) return before + 1000;
  if (after != null) return after - 1000;
  return 1000;
}

function parseId(s: string) {
  const i = String(s).indexOf('|');
  if (i < 1) return { type: '', id: '' };
  return { type: String(s).slice(0, i), id: String(s).slice(i + 1) };
}

export default function BoardPage({
  boardId,
  onCardOpen,
  onNavigateHome,
}: {
  boardId: string;
  onCardOpen: (cid: string) => void;
  onNavigateHome: () => void;
}) {
  const qc = useQueryClient();
  const [active, setActive] = useState<{ kind: 'card' | 'list'; payload: unknown } | null>(null);
  const [presence, setPresence] = useState<PresenceViewer[]>([]);
  const [pulse, setPulse] = useState<Record<string, true>>({});

  const boardRef = useRef<BoardDetail | undefined>();

  const { data: board, isLoading } = useQuery({
    queryKey: ['board', boardId],
    queryFn: () => api.board(boardId) as Promise<BoardDetail>,
  });

  boardRef.current = board;

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 8 },
    }),
  );

  const listOrder = useMemo(() => board?.lists.map((l) => `list|${l.id}`) ?? [], [board]);

  useEffect(() => {
    function onKb(e: KeyboardEvent) {
      if (document.querySelector('[data-card-modal-open="true"]')) return;
      const t = e.target as HTMLElement;
      if (t.closest('input,textarea,button,select,[contenteditable]')) return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') return;
      if ((e.metaKey || e.ctrlKey) && e.key === 'Escape') return;
      /** Placeholder shortcuts — delegated to DOM list focus handlers */
    }
    window.addEventListener('keydown', onKb);
    return () => window.removeEventListener('keydown', onKb);
  }, []);

  useEffect(() => {
    let s: Socket | null | undefined;
    async function hook() {
      s = createSocketInstance();
      if (!s || !boardId) return;
      s.off('presence:update');
      s.off('board:update');
      s.emit('board:join', { boardId, clientId: getClientId() });
      s.on(
        'presence:update',
        (msg: { boardId?: string; viewers?: PresenceViewer[] }) => {
          if (msg.boardId !== boardId) return;
          setPresence(Array.isArray(msg.viewers) ? msg.viewers : []);
        },
      );
      s.on(
        'board:update',
        (msg: { boardId: string; board: BoardDetail; originClientId?: string }) => {
          if (msg.boardId !== boardId) return;
          if (msg.originClientId === getClientId()) return;
          const prev = boardRef.current;
          const next = msg.board;
          qc.setQueryData(['board', boardId], next);
          /** Pulse touched cards across lists/moves */
          const ids: Record<string, true> = {};
          if (prev && next && prev.updatedAt !== next.updatedAt) {
          const prevPos = new Map<string, { lid: string; pos: number }>();
            for (const l of prev.lists) {
              for (const c of l.cards) prevPos.set(c.id, { lid: l.id, pos: c.position });
            }
            for (const l of next.lists) {
              for (const c of l.cards) {
                const o = prevPos.get(c.id);
                if (o && (o.lid !== l.id || o.pos !== c.position)) ids[c.id] = true;
              }
            }
            setPulse(ids);
            setTimeout(() => setPulse({}), 900);
          }
        },
      );
    }
    void hook();
    return () => {
      if (s) {
        s.emit('board:leave', { boardId });
        s.off('presence:update');
        s.off('board:update');
        s.disconnect();
      }
    };
  }, [boardId, qc]);

  const reorderLists = async (sortedIds: string[]) => {
    if (!board) return;
    let last = board as BoardDetail;
    for (let i = 0; i < sortedIds.length; i++) {
      const id = sortedIds[i]!;
      // eslint-disable-next-line no-await-in-loop
      last = (await api.patchList(id, { position: (i + 1) * 1000 })) as BoardDetail;
    }
    qc.setQueryData(['board', boardId], last);
  };

  const applyBoard = (b: BoardDetail) => qc.setQueryData(['board', boardId], b);

  const dragStart = ({ active }: DragStartEvent) => {
    const { type } = parseId(String(active.id));
    if (type === 'card') {
      const id = parseId(String(active.id)).id;
      const c = board?.lists.flatMap((l) => l.cards).find((x) => x.id === id);
      setActive({ kind: 'card', payload: c });
      return;
    }
    if (type === 'list') {
      const id = parseId(String(active.id)).id;
      const l = board?.lists.find((x) => x.id === id);
      setActive({ kind: 'list', payload: l });
      return;
    }
    setActive(null);
  };

  const dragEnd = async ({ active, over }: DragEndEvent) => {
    const tmp = active;
    setActive(null);
    const b = qc.getQueryData(['board', boardId]) as BoardDetail | undefined;
    if (!b || !over) return;

    const a = parseId(String(tmp.id));

    /** List reorder */
    if (a.type === 'list') {
      const o = parseId(String(over.id));
      const ordered = b.lists.map((l) => l.id);
      const oldIdx = ordered.indexOf(a.id);
      if (o.type !== 'list') return;
      const newIdx = ordered.indexOf(o.id);
      if (oldIdx < 0 || newIdx < 0 || oldIdx === newIdx) return;
      await reorderLists(arrayMove(ordered, oldIdx, newIdx));
      return;
    }

    if (a.type !== 'card') return;
    const cardId = a.id;
    let targetListId: string | null = null;
    let insertIndex = 0;
    const o = parseId(String(over.id));
    let overCardId: string | null = null;

    if (o.type === 'card') {
      overCardId = o.id;
      targetListId = lidCard(b, o.id) ?? null;
    } else if (o.type === 'drop') {
      targetListId = o.id;
      insertIndex = b.lists.find((l) => l.id === o.id)?.cards.length ?? 0;
    } else if (o.type === 'list') {
      targetListId = o.id;
      insertIndex = b.lists.find((l) => l.id === o.id)?.cards.length ?? 0;
    }
    if (!targetListId) return;

    const sourceListId = lidCard(b, cardId)!;
    const sourceList = b.lists.find((l) => l.id === sourceListId)!;
    const targetList = b.lists.find((l) => l.id === targetListId)!;
    const card = sourceList.cards.find((c) => c.id === cardId)!;

    /** Index when dropping on card */
    if (overCardId) {
      const idx = targetList.cards.findIndex((c) => c.id === overCardId);
      insertIndex = idx < 0 ? targetList.cards.length : idx;
      if (sourceListId === targetListId) {
        const from = sourceList.cards.findIndex((c) => c.id === cardId);
        if (from < insertIndex) insertIndex -= 1;
      }
    }

    /** Same list reposition */
    if (sourceListId === targetListId) {
      const oldIdx = sourceList.cards.findIndex((c) => c.id === cardId);
      if (insertIndex === oldIdx) return;
      const nextOrder = arrayMove(sourceList.cards, oldIdx, insertIndex).map((c) => c.id);
      let last = b as BoardDetail;
      for (let i = 0; i < nextOrder.length; i++) {
        const cid = nextOrder[i]!;
        last = (await api.patchCard(cid, { position: (i + 1) * 1000 })) as BoardDetail;
      }
      qc.setQueryData(['board', boardId], last);
      return;
    }

    /** Cross list */
    const tgtCardsWithout = targetList.cards.filter((c) => c.id !== cardId);
    const cloned = [...tgtCardsWithout];
    const safeIdx = Math.max(0, Math.min(insertIndex, cloned.length));
    cloned.splice(safeIdx, 0, card);
    const before = cloned[safeIdx - 1]?.position;
    const after = cloned[safeIdx + 1]?.position;
    const position = betweenPositions(before ?? null, after ?? null);
    const nextBoard = await api.patchCard(cardId, { listId: targetListId, position });
    qc.setQueryData(['board', boardId], nextBoard as BoardDetail);
  };

  if (isLoading || !board) return <div className="p-8 text-sm text-slate-400">Loading workspace…</div>;

  const othersHere = presence.filter((p) => p.clientId !== getClientId());

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div className="flex shrink-0 flex-wrap items-center gap-4 border-b border-white/10 bg-slate-950/40 px-6 py-3 backdrop-blur">
        <button
          type="button"
          className="text-xs font-medium uppercase tracking-wider text-slate-400 hover:text-teal-300"
          onClick={onNavigateHome}
        >
          ← Boards
        </button>
        <div className="min-w-[1px] flex-1" />
        <h1 className="text-xl font-semibold tracking-tight text-white">{board.name}</h1>
        <div className="flex min-w-[1px] flex-1 justify-end gap-3">
          {othersHere.length > 0 && (
            <div className="flex items-center gap-2 text-xs text-slate-300">
              <span className="text-slate-500">Viewing</span>
              {othersHere.map((v) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={`${v.userId}_${v.clientId}`}
                  src={v.avatarUrl}
                  alt={v.name}
                  title={`${v.name} is viewing this board`}
                  className="h-7 w-7 rounded-full ring-2 ring-teal-500/35"
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <AddListRow board={board} onApplyBoard={applyBoard} />

      <DndContext
        sensors={sensors}
        collisionDetection={closestCorners}
        onDragStart={dragStart}
        onDragEnd={(e) => void dragEnd(e)}
      >
        <div className="flex min-h-0 flex-1 gap-4 overflow-x-auto px-6 py-6">
          <SortableContext items={listOrder} strategy={horizontalListSortingStrategy}>
            {board.lists.map((list) => (
              <SortableLane
                key={list.id}
                boardId={board.id}
                list={list}
                pulse={pulse}
                onCardOpen={onCardOpen}
                highlightCard={
                  active?.kind === 'card' ? (active.payload as CardLite | undefined)?.id : undefined
                }
              />
            ))}
          </SortableContext>
        </div>
        <DragOverlay dropAnimation={{ duration: 180, easing: 'ease-out' }}>
          {active?.kind === 'card' && active.payload ? (
            <CardFace card={active.payload as CardLite} pulse={false} />
          ) : active?.kind === 'list' && active.payload ? (
            <div className="w-72 rounded-2xl border border-teal-500/35 bg-slate-900 p-4 shadow-xl">
              <div className="font-semibold text-white">{(active.payload as KanbanList).name}</div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {board.lists.every((l) => l.cards.length === 0) && (
        <EmptyLanesHint className="pointer-events-none absolute inset-x-0 bottom-8 flex justify-center" />
      )}
    </div>
  );
}

function AddListRow({ board, onApplyBoard }: { board: BoardDetail; onApplyBoard: (b: BoardDetail) => void }) {
  const [name, setName] = useState('');
  const m = useMutation({
    mutationFn: () => api.createList(board.id, name.trim() || 'New list') as Promise<BoardDetail>,
    onSuccess: (b) => {
      onApplyBoard(b);
      setName('');
    },
  });
  return (
    <div className="flex gap-2 border-b border-white/5 px-6 py-2">
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Add a list…"
        className="w-64 rounded-lg border border-white/10 bg-slate-950/60 px-3 py-1.5 text-sm outline-none ring-teal-400/35 focus-visible:ring-2"
      />
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate()}
        className="rounded-lg bg-white/10 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/15"
      >
        + Add list
      </button>
    </div>
  );
}

function SortableLane({
  boardId,
  list,
  pulse,
  onCardOpen,
  highlightCard,
}: {
  boardId: string;
  list: KanbanList;
  pulse: Record<string, true>;
  onCardOpen: (id: string) => void;
  highlightCard?: string;
}) {
  const qc = useQueryClient();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `list|${list.id}`,
    data: { type: 'list', listId: list.id },
  });
  const style = { transform: CSS.Transform.toString(transform), transition };

  const { setNodeRef: setDropRef, isOver } = useDroppable({ id: `drop|${list.id}` });

  const cardIds = list.cards.map((c) => `card|${c.id}`);

  const [title, setTitle] = useState(list.name);
  useEffect(() => setTitle(list.name), [list.name]);

  const mRename = useMutation({
    mutationFn: () => api.patchList(list.id, { name: title }) as Promise<BoardDetail>,
    onSuccess: (b) => qc.setQueryData(['board', boardId], b),
  });

  const mDel = useMutation({
    mutationFn: () => api.deleteList(list.id) as Promise<BoardDetail>,
    onSuccess: (b) => qc.setQueryData(['board', boardId], b),
  });

  const mCard = useMutation({
    mutationFn: (t: string) => api.createCard(list.id, t || 'Untitled') as Promise<BoardDetail>,
    onSuccess: (b) => qc.setQueryData(['board', boardId], b),
  });

  /** Keyboard shortcuts per focused list handled via tabindex */
  function onLaneKeyDown(e: ReactKb<HTMLDivElement>) {
    if (e.defaultPrevented || e.repeat) return;
    if (document.querySelector('[data-card-modal-open="true"]')) return;
    const t = e.target as HTMLElement;
    if (!t.closest('[data-list-surface="true"]')) return;
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;
    if (e.key === 'n') {
      e.preventDefault();
      mCard.mutate('');
    }
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'shadow-glass flex w-72 shrink-0 flex-col rounded-2xl border bg-slate-950/70 backdrop-blur-xl',
        isDragging ? 'border-teal-400/50 opacity-60' : 'border-white/10',
        isOver && 'ring-2 ring-teal-500/25',
      )}
      data-list-surface="true"
      tabIndex={0}
      onKeyDown={onLaneKeyDown}
    >
      <div className="flex items-center gap-2 border-b border-white/5 px-3 py-2" {...attributes} {...listeners}>
        <input
          className="min-w-0 flex-1 bg-transparent text-sm font-semibold text-white outline-none"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() => {
            if (title.trim() && title !== list.name) mRename.mutate();
          }}
        />
        <button
          type="button"
          className="rounded-md p-1 text-xs text-slate-500 hover:bg-white/10 hover:text-rose-300"
          onClick={() => {
            if (confirm('Delete this list and its cards?')) mDel.mutate();
          }}
        >
          ×
        </button>
      </div>

      <div ref={setDropRef} className="flex min-h-[120px] flex-1 flex-col gap-2 overflow-y-auto px-2 py-2">
        <SortableContext items={cardIds} strategy={verticalListSortingStrategy}>
          {list.cards.map((c) => (
            <SortableCard
              key={c.id}
              card={c}
              pulse={Boolean(pulse[c.id])}
              onCardOpen={onCardOpen}
              highlight={highlightCard === c.id}
            />
          ))}
        </SortableContext>
      </div>

      <div className="border-t border-white/5 px-2 py-2">
        <AddCardComposer listId={list.id} />
      </div>
    </div>
  );
}

function SortableCard({
  card,
  pulse,
  onCardOpen,
  highlight,
}: {
  card: CardLite;
  pulse: boolean;
  onCardOpen: (id: string) => void;
  highlight?: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: `card|${card.id}`,
  });
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={clsx(
        'outline-none ring-teal-400/35 focus-visible:ring-2',
        isDragging ? 'opacity-40' : '',
        pulse && 'fb-highlight-pulse',
      )}
      {...attributes}
      {...listeners}
      tabIndex={0}
      data-card-id={card.id}
      onKeyDown={(e) => {
        if (document.querySelector('[data-card-modal-open="true"]')) return;
        if (e.target instanceof HTMLInputElement) return;
        if (e.key === 'e') {
          e.preventDefault();
          onCardOpen(card.id);
        }
      }}
    >
      <button
        type="button"
        onClick={() => onCardOpen(card.id)}
        className={clsx(
          'w-full rounded-xl border border-white/10 bg-slate-900/80 p-3 text-left text-sm transition hover:border-teal-500/40',
          highlight && 'border-teal-400/50',
        )}
      >
        <CardFace card={card} pulse={false} />
      </button>
    </div>
  );
}

function CardFace({ card, pulse }: { card: CardLite; pulse: boolean }) {
  return (
    <div className={clsx('space-y-2', pulse && 'fb-highlight-pulse')}>
      {(card.coverImage || card.coverColor) && (
        <div
          className="h-14 w-full rounded-lg border border-white/10"
          style={
            card.coverImage
              ? {
                  backgroundImage: `url(${card.coverImage})`,
                  backgroundSize: 'cover',
                  backgroundPosition: 'center',
                }
              : { backgroundColor: card.coverColor ?? '#334155' }
          }
        />
      )}
      <div className="font-medium leading-snug text-white">{card.title}</div>
      <div className="flex flex-wrap gap-1">
        {card.labels.map((l) => (
          <span
            key={l.id}
            className="rounded px-1.5 py-0.5 text-[10px] font-semibold text-slate-950"
            style={{ backgroundColor: l.color }}
          >
            {l.name}
          </span>
        ))}
      </div>
      {card.dueDate && <DueBadge dateIso={card.dueDate} />}
      {card.members.length > 0 && (
        <div className="flex -space-x-1 pt-1">
          {card.members.slice(0, 5).map((m) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img key={m.id} src={m.avatarUrl} alt="" className="h-7 w-7 rounded-full ring-2 ring-slate-900" />
          ))}
        </div>
      )}
    </div>
  );
}

function DueBadge({ dateIso }: { dateIso: string }) {
  const diff = differenceInCalendarDays(new Date(`${dateIso}T12:00:00`), new Date(new Date().toDateString()));
  const tone =
    diff < 0 ? 'bg-red-500/85 text-white' : diff <= 3 ? 'bg-amber-400/95 text-slate-950' : 'bg-emerald-500/80 text-slate-950';
  return <div className={clsx('inline-block rounded-md px-1.5 py-0.5 text-[10px] font-bold', tone)}>{dateIso}</div>;
}

function AddCardComposer({ listId }: { listId: string }) {
  const [v, setV] = useState('');
  const qc = useQueryClient();
  const m = useMutation({
    mutationFn: () => api.createCard(listId, v.trim()),
    onSuccess: (nb) => {
      qc.setQueryData(['board', (nb as BoardDetail).id], nb);
      setV('');
    },
  });
  return (
    <form
      className="flex gap-1"
      onSubmit={(e) => {
        e.preventDefault();
        if (v.trim()) m.mutate();
      }}
    >
      <input
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder="+ Add a card"
        className="min-w-0 flex-1 rounded-lg border border-white/10 bg-slate-950/60 px-2 py-1 text-xs outline-none ring-teal-400/30 focus-visible:ring-2"
      />
      <button type="submit" className="rounded-lg bg-teal-500/90 px-2 py-1 text-xs font-semibold text-slate-950">
        Add
      </button>
    </form>
  );
}

function EmptyLanesHint({ className }: { className?: string }) {
  return (
    <div className={className}>
      <div className="rounded-2xl border border-dashed border-white/15 bg-slate-950/40 px-6 py-4 text-center text-sm text-slate-400">
        <div className="mx-auto mb-3 h-24 w-32 rounded-xl bg-gradient-to-br from-teal-500/20 to-indigo-500/20 blur-sm" aria-hidden />
        Drag lists to reorder · drop cards anywhere ·{' '}
        <kbd className="rounded bg-white/10 px-1">n</kbd> adds a card to the focused list
      </div>
    </div>
  );
}
