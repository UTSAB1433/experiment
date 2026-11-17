import { MapPin, Shield, Sword, Users, Globe, ChevronRight, AlertTriangle, Zap, TrendingUp } from 'lucide-react'

export default function GameDashboard() {
  const events = [
    { id: 1, title: 'Random Event: Monsoon', desc: 'Coastal territories slowed by 15%', impact: 'Beta Team' },
    { id: 2, title: 'Advanced Tactic: Flank', desc: 'Alpha Team captures Northern Sector', impact: 'Alpha Team' },
    { id: 3, title: 'Third Party Exploit', desc: 'Resource trade disrupted in Central Asia', impact: 'Third Party' },
  ]

  return (
    <div className="min-h-screen flex flex-col bg-slate-950">
      {/* Map Interface Prominence */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-700 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Globe className="text-blue-400 w-8 h-8" />
            <h1 className="text-2xl font-bold tracking-tight">Global Strategy War</h1>
          </div>
          <div className="flex items-center gap-4">
            <div className="bg-blue-600/20 text-blue-400 px-3 py-1 rounded-full text-sm font-medium border border-blue-500/30">
              Session Active (Persistent)
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 relative map-container overflow-hidden flex flex-col items-center justify-center p-4">
        {/* Map Overlay Borders (Prominent) */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-slate-900/80 pointer-events-none" />
        <div className="absolute inset-0 border-[20px] border-blue-500/20 pointer-events-none" />
        <div className="absolute inset-4 border-[10px] border-red-500/20 pointer-events-none" />
        
        <div className="relative z-10 w-full max-w-6xl grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Command Center Panel */}
          <div className="lg:col-span-3 bg-slate-900/95 border border-slate-700 rounded-2xl p-6 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold flex items-center gap-3">
                <Shield className="text-blue-400" /> Territory Coverage Map
              </h2>
              <div className="flex gap-2">
                <button className="bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-lg text-sm font-medium border border-slate-700 transition">
                  Deploy Units
                </button>
                <button className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded-lg text-sm font-medium transition shadow-lg shadow-blue-900/20">
                  Start War
                </button>
              </div>
            </div>

            {/* Map Interface Simulation */}
            <div className="aspect-[16/9] bg-slate-800 rounded-xl border border-slate-700 overflow-hidden relative mb-6 flex items-center justify-center">
              <img 
                src="/assets/WhatsApp Image 2026-11-17 at 8.28.14 PM.jpeg" 
                alt="Global Map Context" 
                className="absolute inset-0 w-full h-full object-cover opacity-40"
              />
              <div className="absolute inset-0 flex items-center justify-center">
                <div className="bg-slate-900/80 backdrop-blur-md p-8 rounded-2xl border border-slate-700 text-center">
                  <h3 className="text-xl font-bold mb-2 flex items-center justify-center gap-2">
                    <MapPin className="text-green-400" /> Active Territories
                  </h3>
                  <p className="text-slate-400 text-sm">Borders and coverage displayed in real-time</p>
                </div>
              </div>
              {/* Borders Visualization Overlays */}
              <div className="absolute top-1/4 left-1/4 w-32 h-32 border-2 border-blue-500 rounded-full animate-pulse" />
              <div className="absolute bottom-1/4 right-1/4 w-40 h-20 border-2 border-red-500 rounded-lg animate-pulse" />
            </div>

            {/* Resources & Upgrades */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex items-center gap-2 text-blue-400 mb-2"><Sword size={20}/></div>
                <h4 className="font-bold text-lg">Alpha Army</h4>
                <p className="text-sm text-slate-400 mt-1">Drone Swarm / Orbital Strike</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex items-center gap-2 text-red-400 mb-2"><Sword size={20}/></div>
                <h4 className="font-bold text-lg">Beta Army</h4>
                <p className="text-sm text-slate-400 mt-1">Submarine Blockade / Cyber Breach</p>
              </div>
              <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
                <div className="flex items-center gap-2 text-yellow-400 mb-2"><Users size={20}/></div>
                <h4 className="font-bold text-lg">Third Parties</h4>
                <p className="text-sm text-slate-400 mt-1">Exploit & Trade</p>
              </div>
            </div>
          </div>

          {/* Sidebar: Events & Outcomes */}
          <div className="lg:col-span-1 flex flex-col gap-6">
            <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-6 shadow-2xl flex-1">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <AlertTriangle className="text-yellow-400" /> Random Events
              </h3>
              <div className="space-y-4">
                {events.map(event => (
                  <div key={event.id} className="bg-slate-800/50 p-3 rounded-lg border border-slate-700/50">
                    <div className="flex justify-between items-start mb-1">
                      <span className="text-sm font-bold text-slate-300">{event.title}</span>
                      <span className="text-[10px] bg-slate-700 px-2 py-0.5 rounded text-slate-400">{event.impact}</span>
                    </div>
                    <p className="text-xs text-slate-500">{event.desc}</p>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-slate-900/95 border border-slate-700 rounded-2xl p-6 shadow-2xl">
              <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
                <TrendingUp className="text-green-400" /> War Outcomes
              </h3>
              <div className="text-sm text-slate-400 space-y-2">
                <p><span className="text-slate-300 font-medium">Win/Loss Logic:</span> Calculated by territory coverage.</p>
                <p><span className="text-slate-300 font-medium">Advanced Tactics:</span> Enabled for leaders.</p>
              </div>
            </div>
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 border-t border-slate-700 p-4 text-center text-slate-500 text-sm">
        Global Strategy War Game &copy; 2026. Accessible via link. Persistent session enabled.
      </footer>
    </div>
  )
}
