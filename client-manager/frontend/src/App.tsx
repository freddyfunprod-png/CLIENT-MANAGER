import { useState } from 'react'
import type { Page } from './types'
import Sidebar from './components/Sidebar'
import Dashboard from './pages/Dashboard'
import Scraper from './pages/Scraper'
import Leads from './pages/Leads'
import Clients from './pages/Clients'
import DailyPlan from './pages/DailyPlan'
import Checklists from './pages/Checklists'
import Goals from './pages/Goals'
import AIMessages from './pages/AIMessages'

export default function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null)

  const renderPage = () => {
    switch (page) {
      case 'dashboard':  return <Dashboard onNavigate={setPage} />
      case 'scraper':    return <Scraper onNavigate={setPage} />
      case 'leads':      return <Leads onNavigate={setPage} />
      case 'clients':    return <Clients onOpenChecklist={(id) => { setSelectedClientId(id); setPage('checklists') }} />
      case 'daily-plan': return <DailyPlan />
      case 'checklists': return <Checklists preselectedClientId={selectedClientId} />
      case 'goals':      return <Goals />
      case 'ai-messages':return <AIMessages />
      default:           return <Dashboard onNavigate={setPage} />
    }
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ background: 'var(--bg-base)' }}>
      <Sidebar current={page} onNavigate={setPage} />
      <main className="flex-1 overflow-y-auto">
        <div className="p-6">
          {renderPage()}
        </div>
      </main>
    </div>
  )
}
