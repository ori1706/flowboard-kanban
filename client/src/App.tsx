import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { clsx } from 'clsx';
import Logo from '@/components/Logo';
import BoardsHome from '@/components/BoardsHome';
import BoardPage from '@/components/BoardPage';
import CardModalHost from '@/components/CardModalHost';
import SearchPalette from '@/components/SearchPalette';
import { api } from '@/lib/api';
import type { CardDetail } from '@/types';
import { getToken, setToken } from '@/lib/session';

export default function App() {
  const [route, setRoute] = useState<{ name: 'boards' } | { name: 'board'; id: string }>({
    name: 'boards',
  });
  const [modalCard, setModalCard] = useState<{
    boardId: string;
    detail: CardDetail;
  } | null>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  const bootstrap = useQuery({
    queryKey: ['bootstrap'],
    queryFn: async () => {
      if (!getToken()) {
        const r = (await api.authDemo()) as { token: string };
        setToken(r.token);
      }
      const me = (await api.me()) as Record<string, string>;
      return me;
    },
  });

  const openBoard = useCallback((id: string) => setRoute({ name: 'board', id }), []);
  const openCard = useCallback(
    async (cardId: string, boardId: string) => {
      const detail = (await api.cardDetail(cardId)) as CardDetail;
      setModalCard({ boardId, detail });
    },
    [],
  );

  const headline = useMemo(() => 'FlowBoard', []);

  /** Cmd/Ctrl+K search */
  useEffect(() => {
    function kd(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(true);
      }
    }
    window.addEventListener('keydown', kd);
    return () => window.removeEventListener('keydown', kd);
  }, []);

  if (bootstrap.isLoading || !bootstrap.data) {
    return (
      <div className="flex h-full min-h-[480px] items-center justify-center text-sm text-teal-200/80">
        Bootstrapping workspace…
      </div>
    );
  }

  return (
    <div className="flowboard-shell relative flex h-full min-h-[620px] flex-col text-slate-100">
      <header className="flex shrink-0 items-center gap-4 border-b border-white/10 bg-slate-950/55 px-4 py-3 backdrop-blur-xl">
        <button
          type="button"
          className={clsx(
            'flex cursor-pointer items-center gap-3 text-left outline-none ring-teal-400/40 focus-visible:ring-2',
            route.name === 'boards' && 'opacity-80',
          )}
          onClick={() => setRoute({ name: 'boards' })}
        >
          <Logo className="h-9 w-9 shadow-glass rounded-lg" />
          <div className="leading-tight">
            <div className="text-base font-semibold tracking-tight text-white">{headline}</div>
            <div className="text-xs text-slate-400">Kanban for teams who ship</div>
          </div>
        </button>
        <button
          type="button"
          onClick={() => setSearchOpen(true)}
          className="ml-auto flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-sm text-slate-300 hover:border-teal-500/35 hover:bg-white/10"
        >
          Search boards…{' '}
          <kbd className="rounded border border-white/15 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">
            ⌘K
          </kbd>
        </button>
        <div className="hidden text-xs text-slate-500 sm:flex sm:flex-col sm:text-right">
          <span>Signed in as</span>
          <span className="font-medium text-slate-200">{bootstrap.data.name}</span>
        </div>
      </header>

      <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
        {route.name === 'boards' ? (
          <BoardsHome onOpen={openBoard} />
        ) : (
          <BoardPage
            boardId={route.id}
            onCardOpen={(cid) => void openCard(cid, route.id)}
            onNavigateHome={() => setRoute({ name: 'boards' })}
          />
        )}
      </main>

      <SwitchUser />
      <SearchPalette open={searchOpen} onClose={() => setSearchOpen(false)} onPickCard={openCard} />

      <div
        id="flowboard-modal-root"
        className="pointer-events-none absolute inset-0 z-[100] overflow-hidden [&>*]:pointer-events-auto"
      />

      <CardModalHost
        modal={modalCard}
        onClose={() => setModalCard(null)}
        portalId="flowboard-modal-root"
      />
    </div>
  );
}

function SwitchUser() {
  const [email, setEmail] = useState('alex@flowboard.dev');

  const m = useMutation({
    mutationFn: async () => {
      const r = (await api.login(email, 'demo1234')) as { token: string };
      setToken(r.token);
      window.location.reload();
    },
  });

  return (
    <div className="absolute bottom-3 right-3 z-50 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-slate-950/80 px-3 py-2 text-xs backdrop-blur">
      <span className="text-slate-500">Presence demo</span>
      <select
        className="rounded-lg border border-white/10 bg-slate-950 px-2 py-1 outline-none ring-teal-400/40 focus-visible:ring-2"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
      >
        <option value="demo@flowboard.dev">You (demo@flowboard.dev)</option>
        <option value="alex@flowboard.dev">Alex (alex@flowboard.dev)</option>
      </select>
      <button
        type="button"
        disabled={m.isPending}
        onClick={() => m.mutate()}
        className="rounded-lg bg-teal-500/90 px-2 py-1 font-semibold text-slate-950 hover:bg-teal-400"
      >
        Switch & reload
      </button>
    </div>
  );
}
