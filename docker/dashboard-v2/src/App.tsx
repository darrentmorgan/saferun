import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Dashboard } from '@/components/dashboard/Dashboard'
import '@/index.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5, // 5 minutes
      gcTime: 1000 * 60 * 10, // 10 minutes
      retry: 2,
    },
  },
})

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <div className="min-h-screen bg-background text-foreground">
        <Dashboard />
      </div>
    </QueryClientProvider>
  )
}

export default App