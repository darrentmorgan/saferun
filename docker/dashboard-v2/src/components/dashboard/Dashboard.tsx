import { useState, useEffect } from 'react'
import { Sidebar } from '@/components/layout/Sidebar'
import { Header } from '@/components/layout/Header'
import { KPICards } from '@/components/dashboard/KPICards'
import { ViolationsFeed } from '@/components/dashboard/ViolationsFeed'
import { LiveLogsPage } from '@/components/logs/LiveLogsPage'
import { ViolationsPage } from '@/components/violations/ViolationsPage'
import { AnalyticsPage } from '@/components/analytics/AnalyticsPage'
import { cn } from '@/lib/utils'

export function Dashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(true)
  const [currentView, setCurrentView] = useState('dashboard')

  // Handle URL hash changes for navigation
  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1) // Remove the '#'
      if (hash) {
        setCurrentView(hash)
      }
    }

    // Set initial view from URL hash
    handleHashChange()
    
    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  return (
    <div className="flex h-screen bg-background">
      {/* Sidebar */}
      <Sidebar isOpen={sidebarOpen} onToggle={() => setSidebarOpen(!sidebarOpen)} />
      
      {/* Main Content */}
      <div className={cn(
        "flex-1 flex flex-col overflow-hidden transition-all duration-300",
        sidebarOpen ? "ml-64" : "ml-16"
      )}>
        {/* Header */}
        <Header onMenuClick={() => setSidebarOpen(!sidebarOpen)} />
        
        {/* Main Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto p-6">
          <div className="max-w-7xl mx-auto space-y-6">
            {/* Render content based on current view */}
            {currentView === 'logs' ? (
              <LiveLogsPage />
            ) : currentView === 'violations' ? (
              <ViolationsPage />
            ) : currentView === 'analytics' ? (
              <AnalyticsPage />
            ) : (
              <>
                {/* Page Title */}
                <div className="mb-8">
                  <h1 className="text-3xl font-bold tracking-tight">GDPR Compliance Dashboard</h1>
                  <p className="text-muted-foreground mt-2">
                    Real-time monitoring of PII violations and AI request compliance
                  </p>
                </div>

                {/* KPI Cards */}
                <KPICards />

                {/* Main Content Grid */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                  {/* Violations Feed - Takes 2/3 width */}
                  <div className="lg:col-span-2">
                    <ViolationsFeed />
                  </div>
                  
                  {/* Quick Stats - Takes 1/3 width */}
                  <div className="space-y-6">
                    <div className="bg-card rounded-lg border p-6">
                      <h3 className="text-lg font-semibold mb-4">Quick Stats</h3>
                      <div className="text-sm text-muted-foreground">
                        Charts and additional metrics will be added in Phase 2
                      </div>
                    </div>
                  </div>
                </div>
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  )
}