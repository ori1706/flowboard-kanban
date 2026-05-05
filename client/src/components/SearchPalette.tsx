import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { api } from '@/lib/api';

type Hit = {
  cardId: string;
  title: string;
  descriptionPreview: string;
  boardId: string;
  boardName: string;
  listName: string;
};

export default function SearchPalette({
  open,
  onClose,
  onPickCard,
}: {
  open: boolean;
  onClose: () => void;
  onPickCard: (cardId: string, boardId: string) => void;
}) {
  const [q, setQ] = useState('');

  const qk = useMemo(() => q.trim(), [q]);

  const { data } = useQuery({
    queryKey: ['search', qk],
    queryFn: () => api.search(qk) as Promise<Hit[]>,
    enabled: open && qk.length >= 2,
  });

  useEffect(() => {
    if (!open) setQ('');
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-[120] flex items-start justify-center bg-slate-950/70 p-4 pt-24 backdrop-blur-sm"
      onClick={onClose}
      onKeyDown={(e) => e.key === 'Escape' && onClose()}
      role="presentation"
    >
      <div
        className="w-full max-w-xl rounded-2xl border border-white/10 bg-slate-900/95 p-3 shadow-glass"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal
      >
        <input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search card titles and descriptions…"
          className="w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none ring-teal-400/40 focus-visible:ring-2"
        />
        <div className="mt-2 max-h-80 overflow-auto text-sm">
          {qk.length < 2 && (
            <div className="px-2 py-6 text-center text-slate-500">Type at least 2 characters</div>
          )}
          {qk.length >= 2 && data?.length === 0 && (
            <div className="px-2 py-6 text-center text-slate-500">No matches</div>
          )}
          {data?.map((h) => (
            <button
              key={h.cardId}
              type="button"
              className="mb-1 w-full rounded-xl px-2 py-2 text-left hover:bg-white/5"
              onClick={() => {
                onPickCard(h.cardId, h.boardId);
                onClose();
              }}
            >
              <div className="font-medium text-white">{h.title}</div>
              <div className="text-xs text-slate-500">
                {h.boardName} · {h.listName}
              </div>
              {h.descriptionPreview && (
                <div className="mt-1 line-clamp-2 text-xs text-slate-400">{h.descriptionPreview}</div>
              )}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
