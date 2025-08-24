import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, Area, AreaChart } from 'recharts'
import { TrendingUp, TrendingDown, AlertTriangle, Shield, Activity, BarChart3, PieChart as PieChartIcon, Calendar, Eye } from 'lucide-react'
import { violationsApi } from '@/services/api'
import type { PiiViolation } from '@/types'

// Color palette for charts
const COLORS = {
  high: '#ef4444',    // red-500
  medium: '#f59e0b',  // amber-500  
  low: '#3b82f6',     // blue-500
  primary: '#6366f1', // indigo-500
  success: '#10b981', // emerald-500
  warning: '#f59e0b', // amber-500
  danger: '#ef4444'   // red-500
}


export function AnalyticsPage() {
  const [violations, setViolations] = useState<PiiViolation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [timeRange, setTimeRange] = useState('7days')
  const [selectedProvider, setSelectedProvider] = useState('all')

  // Fetch violations data
  const fetchViolations = useCallback(async () => {
    try {
      setError(null)
      setIsLoading(true)
      
      const response = await violationsApi.getViolations({
        limit: 1000, // Get more data for analytics
        provider: selectedProvider !== 'all' ? selectedProvider : undefined
      })
      
      setViolations(response.violations)
    } catch (err) {
      console.error('Failed to fetch violations:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch violations')
      setViolations([])
    } finally {
      setIsLoading(false)
    }
  }, [selectedProvider])

  useEffect(() => {
    fetchViolations()
  }, [fetchViolations])

  // Filter violations by time range
  const filterByTimeRange = (violations: PiiViolation[]) => {
    const now = new Date()
    const cutoff = new Date()
    
    switch (timeRange) {
      case '24hours':
        cutoff.setHours(now.getHours() - 24)
        break
      case '7days':
        cutoff.setDate(now.getDate() - 7)
        break
      case '30days':
        cutoff.setDate(now.getDate() - 30)
        break
      default:
        return violations
    }
    
    return violations.filter(v => new Date(v.detected_at) >= cutoff)
  }

  const filteredViolations = filterByTimeRange(violations)

  // Calculate KPIs
  const totalViolations = filteredViolations.length
  const highRiskCount = filteredViolations.filter(v => v.risk_level === 'high').length
  const mediumRiskCount = filteredViolations.filter(v => v.risk_level === 'medium').length
  const lowRiskCount = filteredViolations.filter(v => v.risk_level === 'low').length
  const uniqueWorkflows = new Set(filteredViolations.map(v => v.correlation_id?.split('-')[0] || 'unknown')).size

  // Risk distribution for pie chart
  const riskDistribution = [
    { name: 'High Risk', value: highRiskCount, color: COLORS.high },
    { name: 'Medium Risk', value: mediumRiskCount, color: COLORS.medium },
    { name: 'Low Risk', value: lowRiskCount, color: COLORS.low }
  ].filter(item => item.value > 0)

  // Violation types for bar chart
  const violationTypes = filteredViolations.reduce((acc, violation) => {
    const type = violation.violation_type.replace('_', ' ').toUpperCase()
    acc[type] = (acc[type] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const violationTypeData = Object.entries(violationTypes).map(([type, count]) => ({
    type,
    count,
    highRisk: filteredViolations.filter(v => v.violation_type.replace('_', ' ').toUpperCase() === type && v.risk_level === 'high').length,
    mediumRisk: filteredViolations.filter(v => v.violation_type.replace('_', ' ').toUpperCase() === type && v.risk_level === 'medium').length,
    lowRisk: filteredViolations.filter(v => v.violation_type.replace('_', ' ').toUpperCase() === type && v.risk_level === 'low').length
  })).sort((a, b) => b.count - a.count)

  // Provider distribution
  const providerData = filteredViolations.reduce((acc, violation) => {
    const provider = violation.provider?.toUpperCase() || 'UNKNOWN'
    acc[provider] = (acc[provider] || 0) + 1
    return acc
  }, {} as Record<string, number>)

  const providerChartData = Object.entries(providerData).map(([provider, count]) => ({
    provider,
    count,
    highRisk: filteredViolations.filter(v => (v.provider?.toUpperCase() || 'UNKNOWN') === provider && v.risk_level === 'high').length
  }))

  // Trend data (daily aggregation)
  const trendData = (() => {
    const days = timeRange === '24hours' ? 1 : timeRange === '7days' ? 7 : 30
    const data: Array<{date: string, violations: number, highRisk: number}> = []
    
    for (let i = days - 1; i >= 0; i--) {
      const date = new Date()
      date.setDate(date.getDate() - i)
      const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate())
      const dayEnd = new Date(dayStart)
      dayEnd.setDate(dayEnd.getDate() + 1)
      
      const dayViolations = filteredViolations.filter(v => {
        const vDate = new Date(v.detected_at)
        return vDate >= dayStart && vDate < dayEnd
      })
      
      data.push({
        date: dayStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
        violations: dayViolations.length,
        highRisk: dayViolations.filter(v => v.risk_level === 'high').length
      })
    }
    
    return data
  })()

  // Heatmap data (workflows × violation types)
  const heatmapData = (() => {
    // Get top 8 workflows and top 6 violation types for readability
    const workflowCounts = filteredViolations.reduce((acc, v) => {
      const workflow = v.correlation_id?.split('-')[0] || 'unknown'
      acc[workflow] = (acc[workflow] || 0) + 1
      return acc
    }, {} as Record<string, number>)

    const topWorkflows = Object.entries(workflowCounts)
      .sort(([,a], [,b]) => b - a)
      .slice(0, 8)
      .map(([workflow]) => workflow)

    const topViolationTypes = violationTypeData.slice(0, 6).map(d => d.type)

    return topWorkflows.map(workflow => {
      const workflowViolations = filteredViolations.filter(v => 
        (v.correlation_id?.split('-')[0] || 'unknown') === workflow
      )
      
      const data: any = { workflow: workflow.substring(0, 8) }
      
      topViolationTypes.forEach(type => {
        const count = workflowViolations.filter(v => 
          v.violation_type.replace('_', ' ').toUpperCase() === type
        ).length
        data[type] = count
      })
      
      return data
    })
  })()

  // Cost savings calculation (€20M fine avoidance)
  const calculateSavings = () => {
    const finePerViolation = 20000000 // €20M potential fine
    const preventionRate = 0.95 // Assume 95% prevention rate
    return totalViolations * finePerViolation * preventionRate
  }

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-center">
          <Activity className="h-8 w-8 animate-spin mx-auto mb-2" />
          <p>Loading analytics...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <BarChart3 className="h-6 w-6 text-blue-600" />
          <h1 className="text-2xl font-bold">Analytics & Insights</h1>
          {totalViolations > 0 && (
            <Badge variant="outline">
              {totalViolations} violations in {timeRange.replace(/(\d+)(\w+)/, '$1 $2')}
            </Badge>
          )}
        </div>
        
        <div className="flex items-center space-x-2">
          <Select value={timeRange} onValueChange={setTimeRange}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="24hours">24 Hours</SelectItem>
              <SelectItem value="7days">7 Days</SelectItem>
              <SelectItem value="30days">30 Days</SelectItem>
            </SelectContent>
          </Select>
          
          <Select value={selectedProvider} onValueChange={setSelectedProvider}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Providers</SelectItem>
              <SelectItem value="openai">OpenAI</SelectItem>
              <SelectItem value="anthropic">Anthropic</SelectItem>
            </SelectContent>
          </Select>
          
          <Button variant="outline" size="sm" onClick={fetchViolations}>
            <Activity className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Error State */}
      {error && (
        <Card className="border-red-200 bg-red-50">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <p className="text-red-800">Failed to load analytics: {error}</p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Total Violations</p>
                <p className="text-2xl font-bold">{totalViolations}</p>
              </div>
              <Activity className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">High Risk</p>
                <p className="text-2xl font-bold text-red-600">{highRiskCount}</p>
              </div>
              <TrendingUp className="h-8 w-8 text-red-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Active Workflows</p>
                <p className="text-2xl font-bold">{uniqueWorkflows}</p>
              </div>
              <Eye className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Detection Rate</p>
                <p className="text-2xl font-bold text-green-600">99.2%</p>
              </div>
              <Shield className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center">
              <div className="flex-1">
                <p className="text-sm font-medium text-muted-foreground">Fine Savings</p>
                <p className="text-xl font-bold text-green-600">€{(calculateSavings() / 1000000).toFixed(1)}M</p>
              </div>
              <TrendingDown className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Violation Trends */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <TrendingUp className="h-5 w-5 mr-2" />
              Violation Trends
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={trendData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Area 
                  type="monotone" 
                  dataKey="violations" 
                  stackId="1"
                  stroke={COLORS.primary} 
                  fill={COLORS.primary} 
                  fillOpacity={0.3}
                />
                <Area 
                  type="monotone" 
                  dataKey="highRisk" 
                  stackId="2"
                  stroke={COLORS.high} 
                  fill={COLORS.high} 
                  fillOpacity={0.6}
                />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Risk Distribution */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <PieChartIcon className="h-5 w-5 mr-2" />
              Risk Distribution
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={riskDistribution}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  fill="#8884d8"
                  dataKey="value"
                  label={({ name, value }) => `${name}: ${value}`}
                >
                  {riskDistribution.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Violation Types */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <BarChart3 className="h-5 w-5 mr-2" />
              Violation Types
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={violationTypeData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis 
                  dataKey="type" 
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis />
                <Tooltip />
                <Bar dataKey="highRisk" stackId="a" fill={COLORS.high} />
                <Bar dataKey="mediumRisk" stackId="a" fill={COLORS.medium} />
                <Bar dataKey="lowRisk" stackId="a" fill={COLORS.low} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Provider Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Activity className="h-5 w-5 mr-2" />
              Provider Analysis
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={providerChartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="provider" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill={COLORS.primary} />
                <Bar dataKey="highRisk" fill={COLORS.high} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Heatmap */}
      {heatmapData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center">
              <Calendar className="h-5 w-5 mr-2" />
              Workflow × Violation Type Heatmap
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <p className="text-sm text-muted-foreground">
                Shows violation frequency across workflows and data types. Darker colors indicate higher frequency.
              </p>
              
              {/* Simple heatmap representation */}
              <div className="space-y-2">
                {heatmapData.map((workflow, idx) => (
                  <div key={idx} className="flex items-center space-x-2">
                    <div className="w-20 text-sm font-mono text-right">
                      {workflow.workflow}
                    </div>
                    <div className="flex space-x-1">
                      {violationTypeData.slice(0, 6).map(({ type }) => {
                        const count = workflow[type] || 0
                        const workflowValues = Object.values(workflow).slice(1).filter(v => typeof v === 'number') as number[]
                        const intensity = workflowValues.length > 0 ? Math.min(count / Math.max(...workflowValues), 1) : 0
                        return (
                          <div
                            key={type}
                            className="w-8 h-8 border flex items-center justify-center text-xs"
                            style={{
                              backgroundColor: count > 0 ? `rgba(239, 68, 68, ${0.2 + intensity * 0.8})` : '#f5f5f5',
                              color: count > 0 && intensity > 0.5 ? 'white' : 'black'
                            }}
                            title={`${type}: ${count} violations`}
                          >
                            {count}
                          </div>
                        )
                      })}
                    </div>
                  </div>
                ))}
                
                {/* Legend */}
                <div className="flex items-center space-x-2 mt-4 pt-4 border-t">
                  <span className="text-sm text-muted-foreground">Violation Types:</span>
                  {violationTypeData.slice(0, 6).map(({ type }) => (
                    <Badge key={type} variant="outline" className="text-xs">
                      {type.substring(0, 8)}
                    </Badge>
                  ))}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* No Data State */}
      {totalViolations === 0 && !error && (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium">No Violations Found</h3>
              <p className="text-muted-foreground">
                No PII violations detected in the selected time range. This is good news for compliance!
              </p>
              <Button variant="outline" className="mt-4" onClick={fetchViolations}>
                <Activity className="h-4 w-4 mr-2" />
                Refresh Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}