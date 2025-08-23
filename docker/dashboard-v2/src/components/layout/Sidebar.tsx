import { Shield, Activity, AlertTriangle, Settings, HelpCircle, ScrollText } from 'lucide-react'
import { cn } from '@/lib/utils'

interface SidebarProps {
  isOpen: boolean
  onToggle: () => void
}

interface NavigationItem {
  name: string
  icon: any
  href: string
  current: boolean
}

const navigationItems: NavigationItem[] = [
  { name: 'Dashboard', icon: Shield, href: '#dashboard', current: false },
  { name: 'Violations', icon: AlertTriangle, href: '#violations', current: false },
  { name: 'Live Logs', icon: ScrollText, href: '#logs', current: false },
  { name: 'Activity', icon: Activity, href: '#activity', current: false },
  { name: 'Settings', icon: Settings, href: '#settings', current: false },
  { name: 'Help', icon: HelpCircle, href: '#help', current: false },
]

export function Sidebar({ isOpen }: SidebarProps) {
  const currentHash = typeof window !== 'undefined' ? window.location.hash.slice(1) || 'dashboard' : 'dashboard'
  
  return (
    <div className={cn(
      "fixed inset-y-0 left-0 z-50 bg-card border-r border-border transition-all duration-300",
      isOpen ? "w-64" : "w-16"
    )}>
      <div className="flex h-full flex-col">
        {/* Logo */}
        <div className="flex h-16 items-center px-4 border-b border-border">
          <div className="flex items-center">
            <Shield className="h-8 w-8 text-primary" />
            {isOpen && (
              <div className="ml-3">
                <h1 className="text-lg font-semibold">RunSafe</h1>
                <p className="text-xs text-muted-foreground">GDPR Dashboard</p>
              </div>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="mt-5 flex-1 space-y-1 px-2">
          {navigationItems.map((item) => {
            const Icon = item.icon
            const isActive = currentHash === item.href.slice(1) // Remove '#' from href
            
            return (
              <a
                key={item.name}
                href={item.href}
                className={cn(
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors',
                  isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className={cn(
                  'h-5 w-5 flex-shrink-0',
                  isOpen ? 'mr-3' : 'mx-auto'
                )} />
                {isOpen && <span>{item.name}</span>}
              </a>
            )
          })}
        </nav>

        {/* Status Indicator */}
        <div className="p-4 border-t border-border">
          <div className="flex items-center">
            <div className="h-2 w-2 bg-green-500 rounded-full animate-pulse" />
            {isOpen && (
              <span className="ml-2 text-xs text-muted-foreground">
                Gateway Online
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}