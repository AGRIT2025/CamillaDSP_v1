import { useState } from 'react'
import { Dashboard } from '@/components/Dashboard/Dashboard'
import { VolumeControl } from '@/components/VolumeControl/VolumeControl'
import { Devices } from '@/components/Devices/Devices'
import { Filters } from '@/components/Filters/Filters'
import { Mixers } from '@/components/Mixers/Mixers'
import { Pipeline } from '@/components/Pipeline/Pipeline'
import { Crossovers } from '@/components/Crossovers/Crossovers'

type Tab = 'vumeters' | 'eq' | 'crossover' | 'mixer' | 'extras' | 'pipeline'

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'vumeters',  label: 'VU Meters & Dynamic',  icon: '◉' },
  { id: 'eq',       label: 'Equalizer IIR',    icon: '∿' },
  { id: 'crossover',label: 'Crossovers',      icon: '⤮' },
  { id: 'mixer',    label: 'Mixer Matrix',    icon: '⊞' },
  { id: 'extras',   label: 'Extras',        icon: '⚙' },
  { id: 'pipeline', label: 'Pipeline',      icon: '→' },
]

export default function App() {
  const [activeTab, setActiveTab] = useState<Tab>('vumeters')

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col">
      {/* Header */}
      <header className="border-b border-[#2a2a38] bg-[#0d0d14] px-6 py-4 flex items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#6366f1] flex items-center justify-center text-white font-bold text-sm">
            C
          </div>
          <div>
            <h1 className="text-sm font-semibold text-[#f0f0ff]">CamillaDSP</h1>
            <p className="text-[10px] text-[#55556a]">Audio Processing Engine</p>
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar nav */}
        <nav className="w-44 border-r border-[#2a2a38] bg-[#0d0d14] p-3 flex flex-col gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors text-left ${
                activeTab === tab.id
                  ? 'bg-[#6366f120] text-[#6366f1]'
                  : 'text-[#8888aa] hover:text-[#f0f0ff] hover:bg-[#16161e]'
              }`}
            >
              <span className="text-base leading-none">{tab.icon}</span>
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Contenido */}
        <main className="flex-1 p-6 overflow-y-auto">
          <div className="max-w-5xl mx-auto">
            {activeTab === 'vumeters'   && <VolumeControl />}
            {activeTab === 'eq'        && <Filters />}
            {activeTab === 'crossover'  && <Crossovers />}
            {activeTab === 'mixer'     && <Mixers />}
            {activeTab === 'extras'    && <Dashboard />}
            {activeTab === 'pipeline' && <Pipeline />}
          </div>
        </main>
      </div>
    </div>
  )
}
