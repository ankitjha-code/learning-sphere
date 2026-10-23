import { useSearchParams } from 'react-router-dom';
import { PageHeader, Tabs } from '@/components/ui';
import { NotesTab } from './NotesTab';
import { TasksTab } from './TasksTab';
import { CalendarTab } from './CalendarTab';
import { LinksTab } from './LinksTab';
import { BookmarksTab } from './BookmarksTab';
import { FilesTab } from './FilesTab';
import { TransferTab } from './TransferTab';

const TABS = [
  { value: 'notes', label: 'Notes' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'calendar', label: 'Calendar' },
  { value: 'links', label: 'Links' },
  { value: 'bookmarks', label: 'Bookmarks' },
  { value: 'files', label: 'Files' },
  { value: 'transfer', label: 'Import and export' },
] as const;

type TabValue = (typeof TABS)[number]['value'];

export default function WorkspacePage() {
  const [params, setParams] = useSearchParams();
  const raw = params.get('tab');
  // Deep links such as ?note=<id> or ?new=note imply the notes tab.
  const tab: TabValue = TABS.some((t) => t.value === raw) ? (raw as TabValue) : 'notes';

  const changeTab = (v: string) => {
    // Switching tabs drops tab-specific params (selected note, prefilled link).
    setParams(v === 'notes' ? {} : { tab: v });
  };

  return (
    <div>
      <PageHeader title="My workspace" description="Your private notes, tasks, calendar, saved links, bookmarks and files. Only you can see them." />
      <Tabs value={tab} onValueChange={changeTab} tabs={TABS.map((t) => ({ value: t.value, label: t.label }))} className="mb-5" />
      {tab === 'notes' && <NotesTab />}
      {tab === 'tasks' && <TasksTab />}
      {tab === 'calendar' && <CalendarTab />}
      {tab === 'links' && <LinksTab />}
      {tab === 'bookmarks' && <BookmarksTab />}
      {tab === 'files' && <FilesTab />}
      {tab === 'transfer' && <TransferTab />}
    </div>
  );
}
