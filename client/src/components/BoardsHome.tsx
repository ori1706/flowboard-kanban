import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { formatDistanceToNowStrict } from 'date-fns';
import { useState } from 'react';
import { clsx } from 'clsx';
import { api } from '@/lib/api';
import type { BoardDetail, BoardSummary } from '@/types';

const COVERS = [
  { name: 'Flow teal', value: 'linear-gradient(135deg,#2dd4bf,#6366f1)' },
  { name: 'Sunset', value: 'linear-gradient(135deg,#f97316,#db2777)' },
  { name: 'Lagoon', value: 'linear-gradient(135deg,#064e3b,#22d3ee)' },
  { name: 'Ink', value: 'linear-gradient(135deg,#312e81,#0f172a)' },
];

export default function BoardsHome({ onOpen }: { onOpen: (id: string) => void }) {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['boards'],
    queryFn: () => api.boards() as Promise<BoardSummary[]>,
  });

  const [open, setOpen] = useState(false);
  const [name, setName] = useState('New board');
  const [cov, setCov] = useState(COVERS[0].value);

  const m = useMutation({
    mutationFn: () => api.createBoard(name.trim() || 'New board', cov) as Promise<BoardDetail>,
    onSuccess: (b) => {
      qc.setQueryData(['board', b.id], b);
      void qc.invalidateQueries({ queryKey: ['boards'] });
      setOpen(false);
      onOpen(b.id);
    },
  });

  if (isLoading || !data) {
    return <div className="p-10 text-sm text-teal-200/75">Gathering boards…</div>;
  }

  return (
    <div className="animate-fade-in relative flex min-h-0 flex-1 flex-col gap-6 overflow-auto px-8 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-white">Your boards</h1>
          <p className="mt-1 text-sm text-slate-400">Ship faster with buttery drag-and-drop lanes.</p>
        </div>
        <button
          type="button"
          className="rounded-xl bg-teal-500 px-5 py-2 text-sm font-semibold text-slate-950 hover:bg-teal-400 active:translate-y-[0.5px]"
          onClick={() => setOpen(true)}
        >
          + New board
        </button>
      </div>

      <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
        {data.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => onOpen(b.id)}
            className="group text-left outline-none ring-teal-400/35 focus-visible:ring-2"
          >
            <div className="shadow-glass rounded-3xl border border-white/12 bg-slate-950/85 p-5 backdrop-blur-xl transition group-hover:border-teal-500/35">
              <div className="mb-4 h-12 w-full rounded-xl border border-white/10" style={{ backgroundImage: b.coverGradient }} />
              <div className="text-lg font-semibold text-white">{b.name}</div>
              <div className="mt-1 flex flex-wrap gap-2 text-xs text-slate-400">
                <span>{b.listCount} lists</span>
                <span>·</span>
                <span>{b.labelCount} labels</span>
                <span>·</span>
                <span>updated {formatDistanceToNowStrict(new Date(b.updatedAt), { addSuffix: true })}</span>
              </div>
            </div>
          </button>
        ))}
      </div>

      {open && (
        <div className="absolute inset-0 z-50 flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-slate-900/95 p-6 shadow-glass">
            <h2 className="text-lg font-semibold text-white">Create board</h2>
            <label className="mt-4 block text-xs font-medium text-slate-400">Name</label>
            <input
              className="mt-1 w-full rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm outline-none ring-teal-400/40 focus-visible:ring-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <div className="mt-4 text-xs font-medium text-slate-400">Cover gradient</div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              {COVERS.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setCov(c.value)}
                  className={clsx(
                    'flex items-center gap-2 rounded-xl border px-2 py-2 text-left text-xs text-slate-200',
                    cov === c.value ? 'border-teal-400/70' : 'border-white/10 hover:border-white/20',
                  )}
                >
                  <span className="h-8 w-10 rounded-lg" style={{ backgroundImage: c.value }} />
                  {c.name}
                </button>
              ))}
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                className="rounded-lg px-3 py-1.5 text-sm text-slate-300 hover:bg-white/5"
                onClick={() => setOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={m.isPending}
                onClick={() => m.mutate()}
                className="rounded-lg bg-teal-500 px-4 py-1.5 text-sm font-semibold text-slate-950 hover:bg-teal-400"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
