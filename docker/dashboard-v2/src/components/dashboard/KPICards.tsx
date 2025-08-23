import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { AlertTriangle, Activity, Loader2 } from 'lucide-react'
import { dashboardApi } from '@/services/api'
import type { DashboardStats } from '@/types'

export function KPICards() {
  const [stats, setStats] = useState<DashboardStats | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const fetchStats = async () => {
      try {
        setError(null)
        const dashboardStats = await dashboardApi.getStats()
        setStats(dashboardStats)
      } catch (err) {
        console.error('Failed to fetch dashboard stats:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch stats')
        // Set empty stats when API fails
        setStats({
          totalViolations: 0,
          highRiskViolations: 0,
          mediumRiskViolations: 0,
          lowRiskViolations: 0,
          activeConnections: 0,
          lastUpdated: new Date().toISOString()
        })
      } finally {
        setIsLoading(false)
      }
    }

    fetchStats()
  }, [])
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {/* Total Violations */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Total Violations</CardTitle>
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold flex items-center">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.totalViolations || 0}
          </div>
          <p className="text-xs text-muted-foreground">
            {error ? 'API connection failed' : 'Total violations detected'}
          </p>
        </CardContent>
      </Card>

      {/* High Risk */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">High Risk</CardTitle>
          <Badge variant="destructive" className="h-6">
            Critical
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-red-600 flex items-center">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.highRiskViolations || 0}
          </div>
          <p className="text-xs text-muted-foreground">
            {error ? 'API connection failed' : 'Requires immediate attention'}
          </p>
        </CardContent>
      </Card>

      {/* Medium Risk */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">Medium Risk</CardTitle>
          <Badge variant="outline" className="h-6 border-amber-500 text-amber-600">
            Warning
          </Badge>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold text-amber-600 flex items-center">
            {isLoading ? <Loader2 className="h-6 w-6 animate-spin" /> : stats?.mediumRiskViolations || 0}
          </div>
          <p className="text-xs text-muted-foreground">
            {error ? 'API connection failed' : 'Review within 24 hours'}
          </p>
        </CardContent>
      </Card>

      {/* System Status */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">System Status</CardTitle>
          <Activity className="h-4 w-4 text-green-500" />
        </CardHeader>
        <CardContent>
          <div className="flex items-center space-x-2">
            {isLoading ? (
              <Loader2 className="h-5 w-5 animate-spin" />
            ) : (
              <>
                <div className={`h-3 w-3 rounded-full ${error ? 'bg-red-500' : 'bg-green-500'} animate-pulse`} />
                <span className="text-lg font-semibold">
                  {error ? 'Offline' : 'Online'}
                </span>
              </>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {error ? 'API connection failed' : `${stats?.activeConnections || 0} active connections`}
          </p>
        </CardContent>
      </Card>
    </div>
  )
}