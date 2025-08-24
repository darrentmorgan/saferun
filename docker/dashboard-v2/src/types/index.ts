export interface PiiViolation {
  violation_id: string
  violation_type: string
  violation_category: string
  detected_text: string
  redacted_text: string
  confidence_score: number
  field_path?: string
  data_source: string
  gdpr_article?: string
  legal_basis?: string
  detected_at: string
  correlation_id?: string
  endpoint?: string
  provider?: string
  risk_level?: 'high' | 'medium' | 'low'
}

export interface GatewayLog {
  timestamp: string
  level: string
  message: string
  correlationId?: string
  method?: string
  url?: string
  statusCode?: number
  duration?: string
  provider?: string
  violations?: number
}

export interface DashboardStats {
  totalViolations: number
  highRiskViolations: number
  mediumRiskViolations: number
  lowRiskViolations: number
  activeConnections: number
  lastUpdated: string
}

export interface ViolationsResponse {
  violations: PiiViolation[]
  metadata: {
    count: number
    limit: number
    timeRange: string
    source: string
  }
}

export interface LogsResponse {
  logs: GatewayLog[]
  count: number
}

export interface PiiStatus {
  detection_engine: {
    enabled: boolean
    patterns_loaded: number
    confidence_threshold: number
    categories: string[]
  }
  policy: {
    loaded: boolean
    file_path: string
  }
  compliance: {
    gdpr_articles: string[]
    risk_levels: string[]
    data_categories: string[]
  }
  features: {
    request_scanning: boolean
    response_scanning: boolean
    database_logging: boolean
    whitelist_filtering: boolean
    format_preserving_redaction: boolean
  }
}

export interface FilterOptions {
  dateRange: {
    start: Date | null
    end: Date | null
  }
  riskLevels: string[]
  violationTypes: string[]
  providers: string[]
  searchQuery: string
}

export interface ExportRequest {
  filters: Partial<FilterOptions>
  format: 'csv' | 'pdf'
  includeRedacted?: boolean
}

export interface ViolationDetail extends PiiViolation {
  audit_id: string
  audit_timestamp: string
  method: string
  request_headers: Record<string, any>
  request_body: Record<string, any>
  response_status: number
  response_headers: Record<string, any>
  response_body: Record<string, any>
  response_time_ms: number
  request_size_bytes: number | null
  response_size_bytes: number | null
  user_agent: string | null
  client_ip: string | null
  enforcement_actions?: {
    enforcement_id: string
    enforcement_mode: string
    action: string
    applied_actions: string[]
    block_reason?: string
    warnings: string[]
    data_modified: boolean
    processing_time_ms: number | null
    action_timestamp: string
  }
}