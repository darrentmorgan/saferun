import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  ChevronDown, 
  ChevronRight, 
  Copy, 
  Download,
  AlertTriangle,
  Shield,
  Clock,
  Server,
  Eye,
  FileText,
  Zap,
  Activity
} from 'lucide-react'
import { formatTimestamp, formatRiskLevel } from '@/lib/utils'
import { violationsApi } from '@/services/api'
import type { ViolationDetail } from '@/types'

interface ViolationDetailModalProps {
  violationId: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ViolationDetailModal({ violationId, open, onOpenChange }: ViolationDetailModalProps) {
  const [violation, setViolation] = useState<ViolationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(['detection', 'request']))

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections)
    if (newExpanded.has(section)) {
      newExpanded.delete(section)
    } else {
      newExpanded.add(section)
    }
    setExpandedSections(newExpanded)
  }

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text)
    // In a real app, you'd show a toast notification here
    console.log(`${label} copied to clipboard`)
  }

  const exportViolationData = () => {
    if (!violation) return
    
    const exportData = {
      violation_id: violation.violation_id,
      violation_type: violation.violation_type,
      detected_at: violation.detected_at,
      risk_level: violation.risk_level,
      correlation_id: violation.correlation_id,
      detected_text: violation.detected_text,
      redacted_text: violation.redacted_text,
      confidence_score: violation.confidence_score,
      gdpr_article: violation.gdpr_article,
      endpoint: violation.endpoint,
      method: violation.method,
      provider: violation.provider,
      enforcement_actions: violation.enforcement_actions
    }
    
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `violation_${violation.violation_id}_${new Date().toISOString().slice(0, 10)}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }

  const highlightPiiInText = (text: string, piiText: string) => {
    if (!text || !piiText) return text
    const parts = text.split(new RegExp(`(${piiText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'))
    return parts.map((part, index) => 
      part.toLowerCase() === piiText.toLowerCase() 
        ? <span key={index} className="bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300 px-1 rounded">{part}</span>
        : part
    )
  }

  useEffect(() => {
    const fetchViolationDetail = async () => {
      if (!violationId || !open) return
      
      setIsLoading(true)
      setError(null)
      
      try {
        const detail = await violationsApi.getViolationDetail(violationId)
        setViolation(detail)
      } catch (err) {
        console.error('Failed to fetch violation detail:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch violation details')
      } finally {
        setIsLoading(false)
      }
    }

    fetchViolationDetail()
  }, [violationId, open])

  if (!open || !violationId) return null

  const riskConfig = violation ? formatRiskLevel(violation.risk_level || 'unknown') : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center space-x-2">
            <AlertTriangle className="h-5 w-5 text-amber-600" />
            <span>PII Violation Details</span>
            {violation && (
              <Badge variant={riskConfig?.variant || 'default'}>
                {violation.violation_type.toUpperCase()}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <Activity className="h-6 w-6 animate-spin mr-2" />
            <span>Loading violation details...</span>
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-center space-x-2">
                <AlertTriangle className="h-5 w-5 text-red-600" />
                <p className="text-red-800">Failed to load violation details: {error}</p>
              </div>
            </CardContent>
          </Card>
        )}

        {violation && (
          <div className="space-y-4">
            {/* Header Actions */}
            <div className="flex justify-between items-center">
              <div className="flex items-center space-x-2">
                <Badge variant={riskConfig?.variant || 'default'}>
                  {riskConfig?.label}
                </Badge>
                <Badge variant="outline">{violation.provider?.toUpperCase()}</Badge>
                {violation.gdpr_article && (
                  <Badge variant="outline">{violation.gdpr_article}</Badge>
                )}
              </div>
              <div className="flex space-x-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => copyToClipboard(violation.correlation_id || '', 'Correlation ID')}
                >
                  <Copy className="h-4 w-4 mr-1" />
                  Copy ID
                </Button>
                <Button variant="outline" size="sm" onClick={exportViolationData}>
                  <Download className="h-4 w-4 mr-1" />
                  Export
                </Button>
              </div>
            </div>

            {/* Detection Details */}
            <Collapsible open={expandedSections.has('detection')} onOpenChange={() => toggleSection('detection')}>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Eye className="h-4 w-4" />
                        <span>Detection Details</span>
                      </div>
                      {expandedSections.has('detection') ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </CardTitle>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Detected Text</p>
                        <code className="bg-red-100 dark:bg-red-900/20 px-2 py-1 rounded text-red-700 dark:text-red-300 text-sm">
                          {violation.detected_text}
                        </code>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Redacted Text</p>
                        <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400 text-sm">
                          {violation.redacted_text}
                        </code>
                      </div>
                    </div>
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Confidence Score</p>
                        <div className="flex items-center space-x-2">
                          <div className="w-full bg-gray-200 rounded-full h-2">
                            <div 
                              className={`h-2 rounded-full ${
                                violation.confidence_score >= 0.8 ? 'bg-red-500' :
                                violation.confidence_score >= 0.6 ? 'bg-amber-500' : 'bg-green-500'
                              }`}
                              style={{ width: `${violation.confidence_score * 100}%` }}
                            />
                          </div>
                          <span className="text-sm">{Math.round(violation.confidence_score * 100)}%</span>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Category</p>
                        <p className="text-sm text-muted-foreground capitalize">{violation.violation_category}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Field Path</p>
                        <p className="text-sm text-muted-foreground font-mono">{violation.field_path || 'N/A'}</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Detected At</p>
                        <div className="flex items-center text-sm text-muted-foreground">
                          <Clock className="h-3 w-3 mr-1" />
                          {formatTimestamp(violation.detected_at)}
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Legal Basis</p>
                        <p className="text-sm text-muted-foreground">{violation.legal_basis || 'Not specified'}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            {/* Request Context */}
            <Collapsible open={expandedSections.has('request')} onOpenChange={() => toggleSection('request')}>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Server className="h-4 w-4" />
                        <span>Request Context</span>
                      </div>
                      {expandedSections.has('request') ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </CardTitle>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Method & Endpoint</p>
                        <p className="font-mono text-sm">
                          <span className="bg-blue-100 dark:bg-blue-900/30 px-1 rounded">{violation.method}</span>
                          {' '}
                          <span>{violation.endpoint}</span>
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Response Status</p>
                        <p className={`text-sm ${
                          violation.response_status >= 200 && violation.response_status < 300 ? 'text-green-600' :
                          violation.response_status >= 400 ? 'text-red-600' : 'text-amber-600'
                        }`}>
                          {violation.response_status}
                        </p>
                      </div>
                    </div>
                    
                    {/* Request Body */}
                    <div>
                      <p className="text-sm font-medium mb-2">Request Body</p>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <pre className="text-xs whitespace-pre-wrap">
                          {JSON.stringify(violation.request_body, null, 2).split('\n').map((line, index) => (
                            <div key={index}>
                              {highlightPiiInText(line, violation.detected_text)}
                            </div>
                          ))}
                        </pre>
                      </div>
                    </div>

                    {/* Headers */}
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-2">Request Headers</p>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <pre className="text-xs">
                            {JSON.stringify(violation.request_headers, null, 2)}
                          </pre>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-2">Response Headers</p>
                        <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                          <pre className="text-xs">
                            {JSON.stringify(violation.response_headers, null, 2)}
                          </pre>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            {/* Response Context */}
            <Collapsible open={expandedSections.has('response')} onOpenChange={() => toggleSection('response')}>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <FileText className="h-4 w-4" />
                        <span>Response Context</span>
                      </div>
                      {expandedSections.has('response') ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </CardTitle>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Response Time</p>
                        <p className="text-sm text-muted-foreground">{violation.response_time_ms}ms</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Request Size</p>
                        <p className="text-sm text-muted-foreground">
                          {violation.request_size_bytes ? `${violation.request_size_bytes} bytes` : 'N/A'}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Response Size</p>
                        <p className="text-sm text-muted-foreground">
                          {violation.response_size_bytes ? `${violation.response_size_bytes} bytes` : 'N/A'}
                        </p>
                      </div>
                    </div>
                    
                    <div>
                      <p className="text-sm font-medium mb-2">Response Body</p>
                      <div className="bg-gray-50 dark:bg-gray-800 p-3 rounded-lg">
                        <pre className="text-xs whitespace-pre-wrap">
                          {JSON.stringify(violation.response_body, null, 2)}
                        </pre>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>

            {/* Enforcement Actions */}
            {violation.enforcement_actions && (
              <Collapsible open={expandedSections.has('enforcement')} onOpenChange={() => toggleSection('enforcement')}>
                <CollapsibleTrigger asChild>
                  <Card className="cursor-pointer hover:bg-accent/50 border-amber-200">
                    <CardHeader className="pb-3">
                      <CardTitle className="text-base flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Shield className="h-4 w-4 text-amber-600" />
                          <span>Enforcement Actions</span>
                        </div>
                        {expandedSections.has('enforcement') ? 
                          <ChevronDown className="h-4 w-4" /> : 
                          <ChevronRight className="h-4 w-4" />
                        }
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Card className="border-amber-200">
                    <CardContent className="pt-6 space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <p className="text-sm font-medium mb-1">Enforcement Mode</p>
                          <Badge variant="outline">{violation.enforcement_actions.enforcement_mode.toUpperCase()}</Badge>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-1">Action Taken</p>
                          <Badge variant={violation.enforcement_actions.action === 'block' ? 'destructive' : 'outline'}>
                            {violation.enforcement_actions.action.toUpperCase()}
                          </Badge>
                        </div>
                      </div>

                      <div>
                        <p className="text-sm font-medium mb-2">Applied Actions</p>
                        <div className="flex flex-wrap gap-1">
                          {violation.enforcement_actions.applied_actions.map((action, index) => (
                            <Badge key={index} variant="secondary" className="text-xs">
                              {action}
                            </Badge>
                          ))}
                        </div>
                      </div>

                      {violation.enforcement_actions.block_reason && (
                        <div>
                          <p className="text-sm font-medium mb-1">Block Reason</p>
                          <p className="text-sm text-red-600 bg-red-50 p-2 rounded">
                            {violation.enforcement_actions.block_reason}
                          </p>
                        </div>
                      )}

                      {violation.enforcement_actions.warnings.length > 0 && (
                        <div>
                          <p className="text-sm font-medium mb-2">Warnings</p>
                          <div className="space-y-1">
                            {violation.enforcement_actions.warnings.map((warning, index) => (
                              <p key={index} className="text-sm text-amber-600 bg-amber-50 p-2 rounded">
                                {warning}
                              </p>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <p className="text-sm font-medium mb-1">Data Modified</p>
                          <Badge variant={violation.enforcement_actions.data_modified ? 'default' : 'outline'}>
                            {violation.enforcement_actions.data_modified ? 'Yes' : 'No'}
                          </Badge>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-1">Processing Time</p>
                          <p className="text-sm text-muted-foreground">
                            {violation.enforcement_actions.processing_time_ms ? `${violation.enforcement_actions.processing_time_ms}ms` : 'N/A'}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm font-medium mb-1">Action Timestamp</p>
                          <p className="text-sm text-muted-foreground">
                            {formatTimestamp(violation.enforcement_actions.action_timestamp)}
                          </p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </CollapsibleContent>
              </Collapsible>
            )}

            {/* Metadata */}
            <Collapsible open={expandedSections.has('metadata')} onOpenChange={() => toggleSection('metadata')}>
              <CollapsibleTrigger asChild>
                <Card className="cursor-pointer hover:bg-accent/50">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center justify-between">
                      <div className="flex items-center space-x-2">
                        <Zap className="h-4 w-4" />
                        <span>Metadata</span>
                      </div>
                      {expandedSections.has('metadata') ? 
                        <ChevronDown className="h-4 w-4" /> : 
                        <ChevronRight className="h-4 w-4" />
                      }
                    </CardTitle>
                  </CardHeader>
                </Card>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Card>
                  <CardContent className="pt-6 space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Correlation ID</p>
                        <div className="flex items-center space-x-2">
                          <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                            {violation.correlation_id}
                          </code>
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            onClick={() => copyToClipboard(violation.correlation_id || '', 'Correlation ID')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Audit ID</p>
                        <code className="text-sm bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
                          {violation.audit_id}
                        </code>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Client IP</p>
                        <p className="text-sm text-muted-foreground font-mono">{violation.client_ip || 'Not recorded'}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">User Agent</p>
                        <p className="text-sm text-muted-foreground truncate" title={violation.user_agent || ''}>
                          {violation.user_agent || 'Not recorded'}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <p className="text-sm font-medium mb-1">Audit Timestamp</p>
                        <p className="text-sm text-muted-foreground">{formatTimestamp(violation.audit_timestamp)}</p>
                      </div>
                      <div>
                        <p className="text-sm font-medium mb-1">Data Source</p>
                        <p className="text-sm text-muted-foreground">{violation.data_source}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </CollapsibleContent>
            </Collapsible>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}