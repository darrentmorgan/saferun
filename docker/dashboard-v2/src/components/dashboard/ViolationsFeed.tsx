import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { AlertTriangle, Eye, Clock, MapPin, Loader2 } from 'lucide-react'
import { formatTimestamp, formatRiskLevel } from '@/lib/utils'
import { violationsApi } from '@/services/api'
import { ViolationDetailModal } from './ViolationDetailModal'
import type { PiiViolation } from '@/types'


export function ViolationsFeed() {
  const [violations, setViolations] = useState<PiiViolation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(null)
  const [modalOpen, setModalOpen] = useState(false)

  useEffect(() => {
    const fetchRecentViolations = async () => {
      try {
        setError(null)
        const recentViolations = await violationsApi.getRecentViolations(3)
        setViolations(recentViolations)
      } catch (err) {
        console.error('Failed to fetch recent violations:', err)
        setError(err instanceof Error ? err.message : 'Failed to fetch violations')
        setViolations([])
      } finally {
        setIsLoading(false)
      }
    }

    fetchRecentViolations()
  }, [])

  const handleViewDetails = (violationId: string) => {
    setSelectedViolationId(violationId)
    setModalOpen(true)
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center">
            <AlertTriangle className="h-5 w-5 mr-2 text-amber-600" />
            Recent PII Violations
            {isLoading && <Loader2 className="h-4 w-4 ml-2 animate-spin" />}
          </CardTitle>
          <Button variant="outline" size="sm" onClick={() => window.location.hash = 'violations'}>
            View All
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {violations.map((violation) => {
          const riskConfig = formatRiskLevel(violation.risk_level || 'unknown')
          
          return (
            <div
              key={violation.violation_id}
              className={`p-4 rounded-lg border ${
                violation.risk_level === 'high' ? 'violation-high' :
                violation.risk_level === 'medium' ? 'violation-medium' :
                'violation-low'
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  {/* Header */}
                  <div className="flex items-center space-x-2 mb-2">
                    <Badge variant={riskConfig.variant}>
                      {violation.violation_type.toUpperCase()}
                    </Badge>
                    <Badge variant="outline">
                      {violation.provider?.toUpperCase()}
                    </Badge>
                    <span className="text-xs text-muted-foreground">
                      {violation.gdpr_article}
                    </span>
                  </div>

                  {/* Content */}
                  <div className="space-y-2">
                    <div className="flex items-center space-x-4 text-sm">
                      <span className="font-medium">Detected:</span>
                      <code className="bg-red-100 dark:bg-red-900/20 px-2 py-1 rounded text-red-700 dark:text-red-300">
                        {violation.detected_text}
                      </code>
                      <span className="text-muted-foreground">→</span>
                      <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400">
                        {violation.redacted_text}
                      </code>
                    </div>

                    <div className="flex items-center space-x-4 text-xs text-muted-foreground">
                      <span className="flex items-center">
                        <Clock className="h-3 w-3 mr-1" />
                        {formatTimestamp(violation.detected_at)}
                      </span>
                      <span className="flex items-center">
                        <MapPin className="h-3 w-3 mr-1" />
                        {violation.data_source}
                      </span>
                      <span>
                        Confidence: {Math.round(violation.confidence_score * 100)}%
                      </span>
                      {violation.correlation_id && (
                        <span>
                          ID: {violation.correlation_id.substring(0, 8)}...
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="ml-4">
                  <Button 
                    variant="ghost" 
                    size="sm"
                    onClick={() => handleViewDetails(violation.violation_id)}
                  >
                    <Eye className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          )
        })}

        {violations.length === 0 && !isLoading && (
          <div className="text-center py-8 text-muted-foreground">
            <AlertTriangle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <p>{error ? 'Failed to load violations - API connection failed' : 'No PII violations detected in the last 24 hours'}</p>
          </div>
        )}
      </CardContent>
      
      <ViolationDetailModal
        violationId={selectedViolationId}
        open={modalOpen}
        onOpenChange={(open) => {
          setModalOpen(open)
          if (!open) {
            setSelectedViolationId(null)
          }
        }}
      />
    </Card>
  )
}