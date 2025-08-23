import { Menu, Download, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

interface HeaderProps {
  onMenuClick: () => void
}

export function Header({ onMenuClick }: HeaderProps) {
  return (
    <header className="bg-card border-b border-border px-6 py-4">
      <div className="flex items-center justify-between">
        {/* Left side - Menu toggle */}
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon"
            onClick={onMenuClick}
            className="mr-4"
          >
            <Menu className="h-5 w-5" />
          </Button>
          
          <div className="hidden sm:block">
            <nav className="flex space-x-4">
              <span className="text-sm font-medium text-muted-foreground">
                Last updated: {new Date().toLocaleTimeString()}
              </span>
            </nav>
          </div>
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center space-x-2">
          <Button variant="outline" size="sm">
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
          
          <Button variant="outline" size="sm">
            <Download className="h-4 w-4 mr-2" />
            Export
          </Button>
        </div>
      </div>
    </header>
  )
}