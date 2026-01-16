import { HugeiconsIcon } from '@hugeicons/react';
import {
  LinkSquare02Icon,
  CheckmarkCircle02Icon,
  Calendar03Icon,
  Wallet01Icon,
  ChartLineData01Icon,
  SparklesIcon,
  UserMultiple02Icon,
  MoneyBag02Icon,
  Store01Icon,
  Analytics01Icon,
  ArrowUp01Icon,
} from '@hugeicons/core-free-icons';

interface SidebarProps {
  activeItem: string;
  onItemClick: (id: string) => void;
  user?: {
    name: string;
    initials: string;
  };
}

const navIcons: Record<string, React.ComponentType> = {
  partnerships: LinkSquare02Icon,
  approvals: CheckmarkCircle02Icon,
  schedule: Calendar03Icon,
  payments: Wallet01Icon,
  executive: ChartLineData01Icon,
  ask: SparklesIcon,
  accounts: UserMultiple02Icon,
  pipeline: MoneyBag02Icon,
  inventory: Store01Icon,
  forecast: Analytics01Icon,
};

interface NavItem {
  id: string;
  label: string;
  badge?: number;
  isBeta?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV_SECTIONS: Record<string, NavSection> = {
  activate: {
    label: 'Activate',
    items: [
      { id: 'partnerships', label: 'Partnerships', badge: 4 },
      { id: 'approvals', label: 'Approvals' },
      { id: 'schedule', label: 'Schedule', isBeta: true },
      { id: 'payments', label: 'Payments' },
      { id: 'executive', label: 'Executive Overview' },
      { id: 'ask', label: 'Ask PlayMaker' },
    ],
  },
  accounts: {
    label: 'Accounts',
    items: [
      { id: 'accounts', label: 'Accounts' },
    ],
  },
  sales: {
    label: 'Sales',
    items: [
      { id: 'pipeline', label: 'Deal Pipeline', badge: 9 },
      { id: 'inventory', label: 'Inventory' },
      { id: 'forecast', label: 'Forecast' },
    ],
  },
};

export function Sidebar({ activeItem, onItemClick, user = { name: 'Sameer Mehra', initials: 'SM' } }: SidebarProps) {
  return (
    <aside className="w-56 bg-slate-800 text-white flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 pb-6">
        <div className="flex items-center gap-2">
          <div className="text-xl font-bold">
            <span className="text-white">Play</span>
            <span className="relative">
              <span className="text-white">Maker</span>
              <svg className="absolute -top-1 -right-3 w-4 h-4 text-white/80" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M7 17L17 7M17 7H7M17 7V17" />
              </svg>
            </span>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 overflow-y-auto">
        {Object.entries(NAV_SECTIONS).map(([key, section]) => (
          <div key={key} className="mb-4">
            <div className="px-3 py-2 text-xs font-medium text-slate-400 uppercase tracking-wider">
              {section.label}
            </div>
            {section.items.map((item) => {
              const Icon = navIcons[item.id];
              const isActive = activeItem === item.id;
              
              return (
                <button
                  key={item.id}
                  onClick={() => onItemClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-slate-700 text-white'
                      : 'text-slate-300 hover:bg-slate-700/50 hover:text-white'
                  }`}
                >
                  {Icon && <HugeiconsIcon icon={Icon} size={18} />}
                  <span className="flex-1 text-left">{item.label}</span>
                  {item.isBeta && (
                    <span className="px-1.5 py-0.5 text-[10px] font-medium bg-teal-500/20 text-teal-400 rounded">
                      beta
                    </span>
                  )}
                  {item.badge && (
                    <span className="px-2 py-0.5 text-xs font-medium bg-teal-500 text-white rounded-full">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-700">
        <button className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-slate-700/50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-teal-500 flex items-center justify-center text-xs font-medium">
            {user.initials}
          </div>
          <span className="flex-1 text-left text-sm text-slate-200">{user.name}</span>
          <HugeiconsIcon icon={ArrowUp01Icon} size={16} className="text-slate-400" />
        </button>
      </div>
    </aside>
  );
}
