import type { PiiViolation, DashboardStats, ViolationsResponse, LogsResponse, GatewayLog, ViolationDetail } from '@/types'

const API_BASE_URL = '/api'

// Generic API request function
async function apiRequest<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`
  
  const response = await fetch(url, {
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
    ...options,
  })

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${response.statusText}`)
  }

  const result = await response.json()
  return result
}

// Gateway Logs API
export const gatewayLogsApi = {
  // Get gateway logs with optional filtering
  async getLogs(params?: {
    limit?: number
    level?: string
    provider?: string
    aiRequestsOnly?: boolean
    since?: string
  }): Promise<LogsResponse> {
    const searchParams = new URLSearchParams()
    
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.level && params.level !== 'all') searchParams.set('level', params.level)
    if (params?.provider && params.provider !== 'all') searchParams.set('provider', params.provider)
    if (params?.aiRequestsOnly) searchParams.set('ai_requests_only', 'true')
    if (params?.since) searchParams.set('since', params.since)

    const query = searchParams.toString()
    const endpoint = `/logs${query ? `?${query}` : ''}`
    
    const response = await apiRequest<GatewayLog[]>(endpoint)
    
    // Transform gateway response to expected LogsResponse format
    return {
      logs: response,
      count: response.length
    }
  },

  // Get recent logs for real-time updates
  async getRecentLogs(since: string): Promise<LogsResponse> {
    return await this.getLogs({ since, limit: 50 })
  }
}

// PII Violations API
export const violationsApi = {
  // Get PII violations with filtering and pagination
  async getViolations(params?: {
    limit?: number
    offset?: number
    riskLevel?: string
    violationType?: string
    provider?: string
    gdprArticle?: string
    search?: string
    startDate?: string
    endDate?: string
  }): Promise<ViolationsResponse> {
    const searchParams = new URLSearchParams()
    
    if (params?.limit) searchParams.set('limit', params.limit.toString())
    if (params?.offset) searchParams.set('offset', params.offset.toString())
    if (params?.riskLevel && params.riskLevel !== 'all') searchParams.set('risk_level', params.riskLevel)
    if (params?.violationType && params.violationType !== 'all') searchParams.set('violation_type', params.violationType)
    if (params?.provider && params.provider !== 'all') searchParams.set('provider', params.provider)
    if (params?.gdprArticle && params.gdprArticle !== 'all') searchParams.set('gdpr_article', params.gdprArticle)
    if (params?.search) searchParams.set('search', params.search)
    if (params?.startDate) searchParams.set('start_date', params.startDate)
    if (params?.endDate) searchParams.set('end_date', params.endDate)

    const query = searchParams.toString()
    const endpoint = `/violations${query ? `?${query}` : ''}`
    
    return await apiRequest<ViolationsResponse>(endpoint)
  },

  // Get recent violations for dashboard
  async getRecentViolations(limit: number = 5): Promise<PiiViolation[]> {
    const response = await this.getViolations({ limit })
    return response.violations
  },

  // Get detailed violation information
  async getViolationDetail(violationId: string): Promise<ViolationDetail> {
    const endpoint = `/violations/${violationId}`
    const response = await apiRequest<{ violation: ViolationDetail }>(endpoint)
    return response.violation
  }
}

// Dashboard Stats API
export const dashboardApi = {
  // Get dashboard statistics
  async getStats(): Promise<DashboardStats> {
    // Since /api/stats doesn't exist, use the data-based approach
    return await this.getStatsFromData()
  },

  // Get system health status  
  async getHealth(): Promise<{ status: string; timestamp: string }> {
    // Health endpoint is at root level without /api prefix
    const url = '/health'
    const response = await fetch(url, {
      headers: {
        'Content-Type': 'application/json'
      }
    })

    if (!response.ok) {
      throw new Error(`Health check failed: ${response.status} ${response.statusText}`)
    }

    return await response.json()
  },

  // Get stats from violations data (since /api/stats doesn't exist)
  async getStatsFromData(): Promise<DashboardStats> {
    try {
      const violations = await apiRequest<ViolationsResponse>('/violations?limit=1000')
      
      const totalViolations = violations.violations.length
      const highRisk = violations.violations.filter(v => v.risk_level === 'high').length
      const mediumRisk = violations.violations.filter(v => v.risk_level === 'medium').length
      const lowRisk = violations.violations.filter(v => v.risk_level === 'low').length
      
      return {
        totalViolations,
        highRiskViolations: highRisk,
        mediumRiskViolations: mediumRisk,
        lowRiskViolations: lowRisk,
        activeConnections: 1, // Default value since we can't get this from violations
        lastUpdated: new Date().toISOString()
      }
    } catch (error) {
      // Fallback to empty stats if violations API fails
      return {
        totalViolations: 0,
        highRiskViolations: 0,
        mediumRiskViolations: 0,
        lowRiskViolations: 0,
        activeConnections: 0,
        lastUpdated: new Date().toISOString()
      }
    }
  }
}

// Export functionality
export const exportApi = {
  // Export violations as CSV
  async exportViolationsCSV(params?: {
    riskLevel?: string
    violationType?: string
    provider?: string
    startDate?: string
    endDate?: string
  }): Promise<Blob> {
    const searchParams = new URLSearchParams()
    
    if (params?.riskLevel && params.riskLevel !== 'all') searchParams.set('risk_level', params.riskLevel)
    if (params?.violationType && params.violationType !== 'all') searchParams.set('violation_type', params.violationType)
    if (params?.provider && params.provider !== 'all') searchParams.set('provider', params.provider)
    if (params?.startDate) searchParams.set('start_date', params.startDate)
    if (params?.endDate) searchParams.set('end_date', params.endDate)

    const query = searchParams.toString()
    const endpoint = `/export/violations/csv${query ? `?${query}` : ''}`
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`)
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status} ${response.statusText}`)
    }
    
    return await response.blob()
  },

  // Export violations as PDF
  async exportViolationsPDF(params?: {
    riskLevel?: string
    violationType?: string
    provider?: string
    startDate?: string
    endDate?: string
  }): Promise<Blob> {
    const searchParams = new URLSearchParams()
    
    if (params?.riskLevel && params.riskLevel !== 'all') searchParams.set('risk_level', params.riskLevel)
    if (params?.violationType && params.violationType !== 'all') searchParams.set('violation_type', params.violationType)
    if (params?.provider && params.provider !== 'all') searchParams.set('provider', params.provider)
    if (params?.startDate) searchParams.set('start_date', params.startDate)
    if (params?.endDate) searchParams.set('end_date', params.endDate)

    const query = searchParams.toString()
    const endpoint = `/export/violations/pdf${query ? `?${query}` : ''}`
    
    const response = await fetch(`${API_BASE_URL}${endpoint}`)
    if (!response.ok) {
      throw new Error(`Export failed: ${response.status} ${response.statusText}`)
    }
    
    return await response.blob()
  }
}

// Utility function to download blob as file
export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  window.URL.revokeObjectURL(url)
}