import { useState, useEffect, useCallback } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { ScrollArea } from '@/components/ui/scroll-area'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { AlertTriangle, Search, Filter, Download, Eye, FileText, Loader2, AlertCircle } from 'lucide-react'
import { formatTimestamp, formatRiskLevel } from '@/lib/utils'
import { violationsApi, exportApi, downloadBlob } from '@/services/api'
import { ViolationDetailModal } from '@/components/violations/ViolationDetailModal'
import type { PiiViolation } from '@/types'


export function ViolationsPage() {
  const [violations, setViolations] = useState<PiiViolation[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [riskFilter, setRiskFilter] = useState('all')
  const [typeFilter, setTypeFilter] = useState('all')
  const [providerFilter, setProviderFilter] = useState('all')
  const [gdprFilter, setGdprFilter] = useState('all')
  const [currentPage, setCurrentPage] = useState(1)
  const [totalCount, setTotalCount] = useState(0)
  const [selectedViolationId, setSelectedViolationId] = useState<string | null>(null)
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false)
  const itemsPerPage = 10

  // Fetch violations from API
  const fetchViolations = useCallback(async () => {
    try {
      setError(null)
      setIsLoading(true)
      
      const response = await violationsApi.getViolations({
        limit: itemsPerPage,
        offset: (currentPage - 1) * itemsPerPage,
        riskLevel: riskFilter,
        violationType: typeFilter,
        provider: providerFilter,
        gdprArticle: gdprFilter,
        search: searchQuery || undefined
      })
      
      setViolations(response.violations)
      setTotalCount(response.metadata.count)
    } catch (err) {
      console.error('Failed to fetch violations:', err)
      setError(err instanceof Error ? err.message : 'Failed to fetch violations')
      setViolations([])
      setTotalCount(0)
    } finally {
      setIsLoading(false)
    }
  }, [currentPage, riskFilter, typeFilter, providerFilter, gdprFilter, searchQuery])

  // Load violations when filters change
  useEffect(() => {
    fetchViolations()
  }, [fetchViolations])

  // Reset to first page when filters change
  useEffect(() => {
    setCurrentPage(1)
  }, [riskFilter, typeFilter, providerFilter, gdprFilter, searchQuery])


  const totalPages = Math.ceil(totalCount / itemsPerPage)

  // Export functions
  const handleExportCSV = async () => {
    try {
      setIsExporting(true)
      const blob = await exportApi.exportViolationsCSV({
        riskLevel: riskFilter,
        violationType: typeFilter,
        provider: providerFilter
      })
      
      const filename = `violations-${new Date().toISOString().split('T')[0]}.csv`
      downloadBlob(blob, filename)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleExportPDF = async () => {
    try {
      setIsExporting(true)
      const blob = await exportApi.exportViolationsPDF({
        riskLevel: riskFilter,
        violationType: typeFilter,
        provider: providerFilter
      })
      
      const filename = `violations-report-${new Date().toISOString().split('T')[0]}.pdf`
      downloadBlob(blob, filename)
    } catch (err) {
      console.error('Export failed:', err)
      alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  // Retry function
  const handleRetry = () => {
    setError(null)
    fetchViolations()
  }

  // Modal handlers
  const handleViewDetails = (violationId: string) => {
    setSelectedViolationId(violationId)
    setIsDetailModalOpen(true)
  }

  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false)
    setSelectedViolationId(null)
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center space-x-2">
          <AlertTriangle className="h-6 w-6 text-amber-600" />
          <h1 className="text-2xl font-bold">PII Violations</h1>
          <Badge variant="outline">
            {totalCount} violations
          </Badge>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin" />}
        </div>
        
        <div className="flex items-center space-x-2">
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportCSV}
            disabled={isExporting || error !== null}
          >
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
            Export CSV
          </Button>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleExportPDF}
            disabled={isExporting || error !== null}
          >
            {isExporting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <FileText className="h-4 w-4 mr-2" />}
            Export PDF
          </Button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <Card className="border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950">
          <CardContent className="pt-6">
            <div className="flex items-center space-x-2">
              <AlertCircle className="h-5 w-5 text-red-600" />
              <div className="flex-1">
                <p className="text-sm text-red-800 dark:text-red-200">
                  Failed to connect to gateway API: {error}
                </p>
                <p className="text-xs text-red-600 dark:text-red-400 mt-1">
                  No violations available. Check if the gateway service is running.
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleRetry}>
                Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center text-lg">
            <Filter className="h-5 w-5 mr-2" />
            Filters & Search
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Search */}
          <div className="flex items-center space-x-2">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search violations, types, or correlation IDs..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="max-w-md"
            />
          </div>

          {/* Filter Row */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <label className="text-sm font-medium mb-1 block">Risk Level</label>
              <Select value={riskFilter} onValueChange={setRiskFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Risk Levels</SelectItem>
                  <SelectItem value="high">High Risk</SelectItem>
                  <SelectItem value="medium">Medium Risk</SelectItem>
                  <SelectItem value="low">Low Risk</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Violation Type</label>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="eu_passport">EU PASSPORT</SelectItem>
                  <SelectItem value="credit_card">CREDIT CARD</SelectItem>
                  <SelectItem value="email">EMAIL</SelectItem>
                  <SelectItem value="iban">IBAN</SelectItem>
                  <SelectItem value="phone">PHONE</SelectItem>
                  <SelectItem value="ssn">SSN</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">Provider</label>
              <Select value={providerFilter} onValueChange={setProviderFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Providers</SelectItem>
                  <SelectItem value="openai">OPENAI</SelectItem>
                  <SelectItem value="anthropic">ANTHROPIC</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div>
              <label className="text-sm font-medium mb-1 block">GDPR Article</label>
              <Select value={gdprFilter} onValueChange={setGdprFilter}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Articles</SelectItem>
                  <SelectItem value="Article 6">Article 6</SelectItem>
                  <SelectItem value="Article 9">Article 9</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('')
                  setRiskFilter('all')
                  setTypeFilter('all')
                  setProviderFilter('all')
                  setGdprFilter('all')
                  setCurrentPage(1)
                }}
                className="w-full"
              >
                Clear Filters
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Violations Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Violations ({totalCount})</CardTitle>
            <div className="text-sm text-muted-foreground">
              {error ? 'No data available' : `Page ${currentPage} of ${totalPages}`}
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[600px] w-full">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[120px]">Risk Level</TableHead>
                  <TableHead className="w-[120px]">Type</TableHead>
                  <TableHead>Detected Data</TableHead>
                  <TableHead>Redacted</TableHead>
                  <TableHead className="w-[100px]">Provider</TableHead>
                  <TableHead className="w-[100px]">GDPR</TableHead>
                  <TableHead className="w-[140px]">Detected At</TableHead>
                  <TableHead className="w-[100px]">Confidence</TableHead>
                  <TableHead className="w-[80px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {violations.map((violation) => {
                  const riskConfig = formatRiskLevel(violation.risk_level || 'unknown')
                  
                  return (
                    <TableRow key={violation.violation_id} className="font-mono text-sm">
                      <TableCell>
                        <Badge variant={riskConfig.variant}>
                          {violation.risk_level?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">
                          {violation.violation_type.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <code className="bg-red-100 dark:bg-red-900/20 px-2 py-1 rounded text-red-700 dark:text-red-300 text-xs">
                          {violation.detected_text}
                        </code>
                      </TableCell>
                      <TableCell>
                        <code className="bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded text-gray-600 dark:text-gray-400 text-xs">
                          {violation.redacted_text}
                        </code>
                      </TableCell>
                      <TableCell>
                        {violation.provider && (
                          <Badge variant="secondary">
                            {violation.provider.toUpperCase()}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-blue-600 dark:text-blue-400">
                          {violation.gdpr_article}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {formatTimestamp(violation.detected_at)}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs">
                          {Math.round(violation.confidence_score * 100)}%
                        </span>
                      </TableCell>
                      <TableCell>
                        <Button 
                          variant="ghost" 
                          size="sm"
                          onClick={() => handleViewDetails(violation.violation_id)}
                          title="View detailed information"
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  )
                })}

                {violations.length === 0 && !isLoading && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center py-12">
                      {error ? (
                        <div className="flex flex-col items-center space-y-3">
                          <AlertCircle className="h-12 w-12 text-red-500" />
                          <div className="text-center">
                            <p className="text-lg font-medium text-red-800 dark:text-red-200">
                              No violations available
                            </p>
                            <p className="text-sm text-red-600 dark:text-red-400">
                              API connection failed. Check if the gateway service is running.
                            </p>
                          </div>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center space-y-3">
                          <AlertTriangle className="h-12 w-12 text-muted-foreground" />
                          <div className="text-center">
                            <p className="text-lg font-medium text-muted-foreground">
                              No violations found
                            </p>
                            <p className="text-sm text-muted-foreground">
                              {totalCount === 0 ? 'No PII violations detected yet' : 'No violations match the current filters'}
                            </p>
                          </div>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-4">
            <div className="text-sm text-muted-foreground">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, totalCount)} of {totalCount} violations
            </div>
            <div className="flex items-center space-x-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.max(1, currentPage - 1))}
                disabled={currentPage === 1 || isLoading}
              >
                Previous
              </Button>
              <span className="text-sm">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(Math.min(totalPages, currentPage + 1))}
                disabled={currentPage === totalPages || isLoading}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Violation Detail Modal */}
      <ViolationDetailModal
        violationId={selectedViolationId}
        isOpen={isDetailModalOpen}
        onClose={handleCloseDetailModal}
      />
    </div>
  )
}