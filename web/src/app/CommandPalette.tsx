import { useEffect, useMemo, useState } from 'react';
import { Command } from 'cmdk';
import { Dialog as RDialog } from 'radix-ui';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  MagnifyingGlassIcon,
  ArrowRightIcon,
  NotePencilIcon,
  SparkleIcon,
  HammerIcon,
  BooksIcon,
  PathIcon,
  CodeIcon,
  BriefcaseIcon,
  ChatsCircleIcon,
  HandshakeIcon,
  FileTextIcon,
  NotebookIcon,
  ExamIcon,
  KanbanIcon,
  GearSixIcon,
} from '@phosphor-icons/react';
import { WORKSPACE_LABELS, type Workspace } from '@shared/roles';
import { useSession, useSwitchWorkspace } from '@/lib/session';
import { api } from '@/lib/api';
import { Spinner } from '@/components/ui';
import { NAV } from './nav';

export type SearchHit = { type: string; id: string; title: string; subtitle?: string; url: string };

const TYPE_ICON: Record<string, typeof BooksIcon> = {
  resource: BooksIcon,
  track: PathIcon,
  topic: PathIcon,
  problem: CodeIcon,
  job: BriefcaseIcon,
  thread: ChatsCircleIcon,
  mentor: HandshakeIcon,
  project: HammerIcon,
  note: NotebookIcon,
  assessment: ExamIcon,
  application: KanbanIcon,
  resume: FileTextIcon,
};

const TYPE_LABEL: Record<string, string> = {
  resource: 'Library',
  track: 'Roadmaps',
  topic: 'Lessons',
  problem: 'CodeLab problems',
  job: 'Jobs',
  thread: 'Community',
  mentor: 'Mentors',
  project: 'Projects',
  note: 'Notes',
  assessment: 'Assessments',
  application: 'Applications',
  resume: 'Resumes',
};

function useDebounced<T>(value: T, ms: number) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function CommandPalette({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const me = useSession();
  const navigate = useNavigate();
  const sw = useSwitchWorkspace();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 200);

  const search = useQuery({
    queryKey: ['search', dq],
    queryFn: () => api.get<{ results: SearchHit[] }>(`/search?q=${encodeURIComponent(dq)}`),
    enabled: open && dq.length >= 2,
    staleTime: 30_000,
  });

  const grouped = useMemo(() => {
    const g: Record<string, SearchHit[]> = {};
    for (const r of search.data?.results ?? []) (g[r.type] ??= []).push(r);
    return g;
  }, [search.data]);

  const go = (url: string) => {
    onOpenChange(false);
    setQ('');
    navigate(url);
  };

  const goWorkspace = async (w: Workspace, to: string) => {
    onOpenChange(false);
    setQ('');
    if (w !== me.workspace) await sw.mutateAsync({ workspace: w });
    navigate(to);
  };

  return (
    <RDialog.Root open={open} onOpenChange={onOpenChange}>
      <RDialog.Portal>
        <RDialog.Overlay className="fixed inset-0 z-50 bg-[#0d1020]/45 backdrop-blur-[3px]" />
        <RDialog.Content
          className="fixed left-1/2 top-[12vh] z-50 w-[calc(100vw-24px)] max-w-[600px] -translate-x-1/2 overflow-hidden rounded-xl border border-border bg-surface shadow-3"
          aria-describedby={undefined}
        >
          <RDialog.Title className="sr-only">Search and commands</RDialog.Title>
          <Command label="Search and commands" shouldFilter={false} className="flex max-h-[70vh] flex-col">
            <div className="flex items-center gap-3 border-b border-border px-4">
              <MagnifyingGlassIcon size={18} className="text-subtle" />
              <Command.Input
                value={q}
                onValueChange={setQ}
                placeholder="Search lessons, problems, jobs, notes… or type a command"
                className="h-14 flex-1 bg-transparent text-[15.5px] outline-none placeholder:text-subtle"
              />
              {search.isFetching && <Spinner size={16} className="text-subtle" />}
            </div>
            <Command.List className="min-h-0 flex-1 overflow-y-auto p-2">
              <Command.Empty className="px-3 py-6 text-center text-[13.5px] text-muted">
                {dq.length < 2 ? 'Type at least 2 characters to search.' : search.isFetching ? 'Searching…' : `No results for "${dq}".`}
              </Command.Empty>

              {Object.entries(grouped).map(([type, hits]) => {
                const Icon = TYPE_ICON[type] ?? ArrowRightIcon;
                return (
                  <Command.Group key={type} heading={TYPE_LABEL[type] ?? type} className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle">
                    {hits.map((h) => (
                      <Item key={`${h.type}:${h.id}`} value={`${h.type}:${h.id}`} onSelect={() => go(h.url)} icon={<Icon size={16} />} title={h.title} subtitle={h.subtitle} />
                    ))}
                  </Command.Group>
                );
              })}

              {q.length < 2 && (
                <>
                  <Group heading="Quick actions">
                    <Item value="ask-ai" onSelect={() => go('/app/ai')} icon={<SparkleIcon size={16} />} title="Ask the AI Council" />
                    <Item value="new-note" onSelect={() => go('/app/workspace?new=note')} icon={<NotePencilIcon size={16} />} title="New note" />
                    <Item value="new-project" onSelect={() => go('/app/projects?new=1')} icon={<HammerIcon size={16} />} title="Start a project" />
                    <Item value="settings" onSelect={() => go('/app/settings')} icon={<GearSixIcon size={16} />} title="Settings" />
                  </Group>
                  {me.workspaces.map((w) => (
                    <Group key={w} heading={WORKSPACE_LABELS[w].label}>
                      {NAV[w].flatMap((g) => g.items).map((it) => (
                        <Item
                          key={`${w}:${it.to}`}
                          value={`${w}:${it.to}`}
                          onSelect={() => goWorkspace(w, it.to)}
                          icon={<it.icon size={16} />}
                          title={it.label}
                        />
                      ))}
                    </Group>
                  ))}
                </>
              )}
            </Command.List>
            <div className="flex items-center justify-between border-t border-border bg-surface-2 px-4 py-2.5 text-[11.5px] text-subtle">
              <span>Results include only what you have access to.</span>
              <span>↑↓ to move · Enter to open · Esc to close</span>
            </div>
          </Command>
        </RDialog.Content>
      </RDialog.Portal>
    </RDialog.Root>
  );
}

function Group({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <Command.Group
      heading={heading}
      className="[&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:pb-1.5 [&_[cmdk-group-heading]]:pt-3 [&_[cmdk-group-heading]]:text-[11px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-subtle"
    >
      {children}
    </Command.Group>
  );
}

function Item({ value, onSelect, icon, title, subtitle }: { value: string; onSelect: () => void; icon: React.ReactNode; title: string; subtitle?: string }) {
  return (
    <Command.Item
      value={value}
      onSelect={onSelect}
      className="flex cursor-pointer items-center gap-3 rounded-md px-3 py-2 text-[13.5px] data-[selected=true]:bg-accent-soft data-[selected=true]:text-accent-text"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-surface-2 text-muted ring-1 ring-inset ring-border">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate">{title}</span>
        {subtitle && <span className="block truncate text-[12px] text-subtle">{subtitle}</span>}
      </span>
    </Command.Item>
  );
}
