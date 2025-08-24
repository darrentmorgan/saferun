import { useState, useEffect } from 'react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { 
  AlertTriangle, 
  Copy, 
  Download, 
  Shield, 
  Clock, 
  FileText,
  Eye,
  CheckCircle,
  XCircle,
  AlertCircle,
  ArrowRight,
  Globe,
  User,
  Activity
} from 'lucide-react'
import { formatTimestamp, formatRiskLevel } from '@/lib/utils'
import { violationsApi } from '@/services/api'
import type { ViolationDetail } from '@/types'

interface ViolationDetailModalProps {
  violationId: string | null
  isOpen: boolean
  onClose: () => void
}

export function ViolationDetailModal({ violationId, isOpen, onClose }: ViolationDetailModalProps) {
  const [violation, setViolation] = useState<ViolationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState('overview')

  // Fetch violation details when modal opens
  useEffect(() => {
    if (isOpen && violationId) {
      fetchViolationDetail(violationId)
    } else if (!isOpen) {
      // Reset state when modal closes
      setViolation(null)
      setError(null)
      setActiveTab('overview')
    }
  }, [isOpen, violationId])

  const fetchViolationDetail = async (id: string) => {
    try {
      setIsLoading(true)
      setError(null)
      
      const detail = await violationsApi.getViolationDetail(id)
      setViolation(detail)
    } catch (err) {
      console.error('Failed to fetch violation detail:', err)
      setError(err instanceof Error ? err.message : 'Failed to load violation details')
    } finally {
      setIsLoading(false)
    }
  }

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text)
      // You might want to add a toast notification here
      console.log(`${label} copied to clipboard`)
    } catch (err) {
      console.error('Failed to copy to clipboard:', err)
    }
  }

  const formatJsonData = (data: any) => {
    if (!data) return 'No data'
    if (typeof data === 'string') {
      try {
        return JSON.stringify(JSON.parse(data), null, 2)
      } catch {
        return data
      }
    }
    return JSON.stringify(data, null, 2)
  }

  const getEnforcementActionIcon = (action: string) => {
    switch (action) {
      case 'block':
        return <XCircle className="h-4 w-4 text-red-500" />
      case 'allow':
        return <CheckCircle className="h-4 w-4 text-green-500" />
      case 'sanitize':
        return <Shield className="h-4 w-4 text-blue-500" />
      case 'warn':
        return <AlertCircle className="h-4 w-4 text-amber-500" />
      default:
        return <Activity className="h-4 w-4 text-gray-500" />
    }
  }

  if (!isOpen) return null

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden">
        <DialogHeader className="pb-4">
          <DialogTitle className="flex items-center space-x-2">
            <Eye className="h-5 w-5 text-blue-600" />
            <span>PII Violation Details</span>
            {violation && (
              <Badge variant={formatRiskLevel(violation.risk_level || 'unknown').variant}>
                {violation.risk_level?.toUpperCase()}
              </Badge>
            )}
          </DialogTitle>
        </DialogHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <Activity className="h-8 w-8 animate-spin mx-auto mb-2 text-blue-600" />
              <p>Loading violation details...</p>
            </div>
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
          <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
            <TabsList className="grid w-full grid-cols-5">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="request">Request</TabsTrigger>
              <TabsTrigger value="response">Response</TabsTrigger>
              <TabsTrigger value="enforcement">Enforcement</TabsTrigger>
              <TabsTrigger value="context">Context</TabsTrigger>
            </TabsList>

            <ScrollArea className="max-h-[65vh]">

              {/* Overview Tab */}
              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Violation Summary */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center">
                        <AlertTriangle className="h-4 w-4 mr-2" />
                        Violation Summary
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Type:</span>
                        <Badge variant="outline">
                          {violation.violation_type.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Category:</span>
                        <span className="text-sm font-medium">{violation.violation_category}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Risk Level:</span>
                        <Badge variant={formatRiskLevel(violation.risk_level || 'unknown').variant}>
                          {violation.risk_level?.toUpperCase()}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Confidence:</span>
                        <span className="text-sm font-medium">
                          {Math.round(violation.confidence_score * 100)}%
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Data Detection */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center">
                        <Shield className="h-4 w-4 mr-2" />
                        Data Detection
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <label className="text-sm text-muted-foreground">Detected Text:</label>
                        <div className="mt-1 p-2 bg-red-50 border border-red-200 rounded text-sm font-mono">
                          <span className="text-red-700">{violation.detected_text}</span>
                        </div>
                      </div>
                      <div className="flex items-center my-2">
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span className="ml-2 text-sm text-muted-foreground">Redacted as:</span>
                      </div>
                      <div>
                        <div className="p-2 bg-gray-50 border border-gray-200 rounded text-sm font-mono">
                          <span className="text-gray-600">{violation.redacted_text}</span>
                        </div>
                      </div>
                      {violation.field_path && (
                        <div>
                          <label className="text-sm text-muted-foreground">Field Path:</label>
                          <div className="mt-1 p-2 bg-blue-50 border border-blue-200 rounded text-sm font-mono">
                            <span className="text-blue-700">{violation.field_path}</span>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  {/* GDPR Compliance */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center">
                        <FileText className="h-4 w-4 mr-2" />
                        GDPR Compliance
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Article:</span>
                        <Badge variant="secondary" className="text-blue-600">
                          {violation.gdpr_article || 'Not specified'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Legal Basis:</span>
                        <span className="text-sm font-medium text-right max-w-48">
                          {violation.legal_basis || 'Not specified'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Data Source:</span>
                        <span className="text-sm font-medium">{violation.data_source}</span>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Basic Info */}
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center">
                        <Clock className="h-4 w-4 mr-2" />
                        Basic Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Detected At:</span>
                        <span className="text-sm font-medium">
                          {formatTimestamp(violation.detected_at)}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Provider:</span>
                        <Badge variant="secondary">
                          {violation.provider?.toUpperCase() || 'Unknown'}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Violation ID:</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono">{violation.violation_id}</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyToClipboard(violation.violation_id, 'Violation ID')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </TabsContent>

              {/* Request Tab */}
              <TabsContent value="request" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Request Metadata</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Method:</span>
                        <Badge variant="outline">{violation.method}</Badge>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Endpoint:</span>
                        <span className="text-sm font-mono">{violation.endpoint}</span>
                      </div>
                      {violation.user_agent && (
                        <div>
                          <span className="text-sm text-muted-foreground">User Agent:</span>
                          <p className="text-sm font-mono mt-1 p-2 bg-gray-50 rounded">
                            {violation.user_agent}
                          </p>
                        </div>
                      )}
                      {violation.client_ip && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Client IP:</span>
                          <span className="text-sm font-mono">{violation.client_ip}</span>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Request Size</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {violation.request_size_bytes ? 
                          `${(violation.request_size_bytes / 1024).toFixed(1)} KB` : 
                          'Unknown'
                        }
                      </div>
                      <p className="text-sm text-muted-foreground">Request payload size</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Request Headers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-48">
                      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
                        {formatJsonData(violation.request_headers)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Request Body</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
                        {formatJsonData(violation.request_body)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Response Tab */}
              <TabsContent value="response" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Response Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {violation.response_status}
                      </div>
                      <p className="text-sm text-muted-foreground">HTTP status code</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Response Time</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {violation.response_time_ms}ms
                      </div>
                      <p className="text-sm text-muted-foreground">Processing time</p>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium">Response Size</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-2xl font-bold">
                        {violation.response_size_bytes ? 
                          `${(violation.response_size_bytes / 1024).toFixed(1)} KB` : 
                          'Unknown'
                        }
                      </div>
                      <p className="text-sm text-muted-foreground">Response payload size</p>
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Response Headers</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-48">
                      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
                        {formatJsonData(violation.response_headers)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium">Response Body</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ScrollArea className="h-64">
                      <pre className="text-xs bg-gray-50 p-3 rounded border overflow-auto">
                        {formatJsonData(violation.response_body)}
                      </pre>
                    </ScrollArea>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* Enforcement Tab */}
              <TabsContent value="enforcement" className="space-y-4">
                {violation.enforcement_actions ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm font-medium flex items-center">
                            <Shield className="h-4 w-4 mr-2" />
                            Enforcement Summary
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Mode:</span>
                            <Badge variant="secondary">
                              {violation.enforcement_actions.enforcement_mode.toUpperCase()}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Action:</span>
                            <div className="flex items-center space-x-2">
                              {getEnforcementActionIcon(violation.enforcement_actions.action)}
                              <span className="text-sm font-medium">
                                {violation.enforcement_actions.action}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Data Modified:</span>
                            <Badge variant={violation.enforcement_actions.data_modified ? "destructive" : "secondary"}>
                              {violation.enforcement_actions.data_modified ? 'Yes' : 'No'}
                            </Badge>
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="text-sm text-muted-foreground">Processing Time:</span>
                            <span className="text-sm font-medium">
                              {violation.enforcement_actions.processing_time_ms}ms
                            </span>
                          </div>
                        </CardContent>
                      </Card>

                      <Card>
                        <CardHeader>
                          <CardTitle className="text-sm font-medium">Applied Actions</CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {violation.enforcement_actions.applied_actions.map((action, index) => (
                              <div key={index} className="flex items-center space-x-2">
                                <CheckCircle className="h-3 w-3 text-green-500" />
                                <span className="text-sm">{action.replace(/_/g, ' ')}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    </div>

                    {violation.enforcement_actions.block_reason && (
                      <Card className="border-red-200 bg-red-50">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-red-800">
                            Block Reason
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-sm text-red-700">
                            {violation.enforcement_actions.block_reason}
                          </p>
                        </CardContent>
                      </Card>
                    )}

                    {violation.enforcement_actions.warnings.length > 0 && (
                      <Card className="border-amber-200 bg-amber-50">
                        <CardHeader>
                          <CardTitle className="text-sm font-medium text-amber-800">
                            Warnings
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="space-y-2">
                            {violation.enforcement_actions.warnings.map((warning, index) => (
                              <div key={index} className="flex items-start space-x-2">
                                <AlertCircle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                                <span className="text-sm text-amber-700">{warning}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    )}
                  </div>
                ) : (
                  <Card>
                    <CardContent className="pt-6">
                      <div className="text-center py-8">
                        <Activity className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                        <p className="text-lg font-medium text-muted-foreground mb-2">
                          No Enforcement Actions
                        </p>
                        <p className="text-sm text-muted-foreground">
                          This violation was detected in monitor mode with no enforcement actions taken.
                        </p>
                      </div>
                    </CardContent>
                  </Card>
                )}
              </TabsContent>

              {/* Context Tab */}
              <TabsContent value="context" className="space-y-4">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center">
                        <Globe className="h-4 w-4 mr-2" />
                        Request Context
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Audit ID:</span>
                        <div className="flex items-center space-x-2">
                          <span className="text-sm font-mono">{violation.audit_id}</span>
                          <Button 
                            variant="ghost" 
                            size="sm"
                            onClick={() => copyToClipboard(violation.audit_id, 'Audit ID')}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                      {violation.correlation_id && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">Correlation ID:</span>
                          <div className="flex items-center space-x-2">
                            <span className="text-sm font-mono">{violation.correlation_id}</span>
                            <Button 
                              variant="ghost" 
                              size="sm"
                              onClick={() => copyToClipboard(violation.correlation_id!, 'Correlation ID')}
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                          </div>
                        </div>
                      )}
                      <div className="flex items-center justify-between">
                        <span className="text-sm text-muted-foreground">Audit Timestamp:</span>
                        <span className="text-sm font-medium">
                          {formatTimestamp(violation.audit_timestamp)}
                        </span>
                      </div>
                    </CardContent>
                  </Card>

                  <Card>
                    <CardHeader>
                      <CardTitle className="text-sm font-medium flex items-center">
                        <User className="h-4 w-4 mr-2" />
                        Client Information
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      {violation.client_ip && (
                        <div className="flex items-center justify-between">
                          <span className="text-sm text-muted-foreground">IP Address:</span>
                          <span className="text-sm font-mono">{violation.client_ip}</span>
                        </div>
                      )}
                      {violation.user_agent && (
                        <div>
                          <span className="text-sm text-muted-foreground">User Agent:</span>
                          <p className="text-xs font-mono mt-1 p-2 bg-gray-50 rounded break-all">
                            {violation.user_agent}
                          </p>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </div>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-sm font-medium flex items-center">
                      <FileText className="h-4 w-4 mr-2" />
                      Export Options
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center space-x-2">
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => copyToClipboard(JSON.stringify(violation, null, 2), 'Violation Data')}
                      >
                        <Copy className="h-4 w-4 mr-2" />
                        Copy as JSON
                      </Button>
                      <Button variant="outline" size="sm">
                        <Download className="h-4 w-4 mr-2" />
                        Export Report
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </ScrollArea>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}