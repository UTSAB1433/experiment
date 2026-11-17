import type { NextPage } from 'next'
import Head from 'next/head'
import Link from 'next/link'
import { MapPin, Shield, Sword, Users, Globe, ChevronRight } from 'lucide-react'

const Home: NextPage = () => {
  // Initial IDs/Passwords for members (provided per requirements)
  const initialAccounts = [
    { role: 'Team Alpha Leader', id: 'alpha_lead', pass: 'Alpha@123' },
    { role: 'Team Alpha Commander', id: 'alpha_cmd', pass: 'AlphaCmd@123' },
    { role: 'Team Beta Leader', id: 'beta_lead', pass: 'Beta@123' },
    { role: 'Team Beta Commander', id: 'beta_cmd', pass: 'BetaCmd@123' },
    { role: 'Third Party Diplomat', id: 'third_party', pass: 'Third@123' },
  ]

  return (
    <div className="min-h-screen flex flex-col">
      <Head>
        <title>Global Strategy War Game</title>
        <meta name="description" content="Complex global map-based strategy game" />
      </Head>

      {/* Header */}
      <header className="bg-slate-900/90 backdrop-blur-md border-b border-slate-700 p-4 sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-2">
            <Globe className="text-blue-400 w-8 h-8" />
            <h1 className="text-2xl font-bold tracking-tight">Global Strategy War</h1>
          </div>
          <nav className="flex gap-6">
            <Link href="/login" className="text-slate-300 hover:text-white transition">Login</Link>
            <Link href="/register" className="bg-blue-600 hover:bg-blue-500 px-4 py-2 rounded text-sm font-medium transition">Join War</Link>
          </nav>
        </div>
      </header>

      {/* Main Content - Map Interface Prominence */}
      <main className="flex-1 relative map-container overflow-hidden flex flex-col items-center justify-center">
        {/* Map Overlay Borders (Prominent) */}
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-slate-900/50 to-slate-900/80 pointer-events-none" />
        
        {/* Territory Borders Visualization */}
        <div className="absolute inset-0 border-[20px] border-blue-500/20 pointer-events-none" />
        <div className="absolute inset-4 border-[10px] border-red-500/20 pointer-events-none" />
        
        {/* Central Game Interface Card */}
        <div className="relative z-10 bg-slate-900/95 border border-slate-700 p-8 rounded-2xl shadow-2xl max-w-4xl w-full">
          <h2 className="text-3xl font-extrabold mb-6 text-center flex items-center justify-center gap-3">
            <Shield className="text-blue-400" />
            Command Center
          </h2>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 text-blue-400 mb-2"><Sword size={20}/></div>
              <h3 className="font-bold text-lg">Team Alpha</h3>
              <p className="text-sm text-slate-400 mt-1">Unique Powers: Orbital Strike, Drone Swarm</p>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 text-red-400 mb-2"><Sword size={20}/></div>
              <h3 className="font-bold text-lg">Team Beta</h3>
              <p className="text-sm text-slate-400 mt-1">Unique Powers: Cyber Breach, Submarine Blockade</p>
            </div>
            <div className="bg-slate-800 p-4 rounded-xl border border-slate-700">
              <div className="flex items-center gap-2 text-yellow-400 mb-2"><Users size={20}/></div>
              <h3 className="font-bold text-lg">Third Parties</h3>
              <p className="text-sm text-slate-400 mt-1">Exploit regions, trade resources</p>
            </div>
          </div>

          {/* Initial Account Provision */}
          <div className="bg-slate-800/50 p-6 rounded-xl border border-slate-700/50">
            <h3 className="font-bold text-xl mb-4 flex items-center gap-2"><MapPin className="text-green-400" /> Initial Access Credentials</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {initialAccounts.map((acc, i) => (
                <div key={i} className="bg-slate-900 p-3 rounded-lg border border-slate-700">
                  <div className="text-xs font-semibold text-slate-500 uppercase">{acc.role}</div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span>ID:</span> <span className="font-mono text-green-400">{acc.id}</span>
                  </div>
                  <div className="mt-1 flex justify-between text-sm">
                    <span>Pass:</span> <span className="font-mono text-green-400">{acc.pass}</span>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-xs text-slate-500 mt-4 italic">Note: Change ID/Pass immediately after login. Session persists.</p>
          </div>

          {/* Features List */}
          <div className="mt-8 grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="flex items-start gap-3 text-sm">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1"><ChevronRight size={14} className="text-white"/></div>
              <div>
                <span className="font-bold">Resources & Bases:</span> Capture areas, build upgrades, unlock tech.
              </div>
            </div>
            <div className="flex items-start gap-3 text-sm">
              <div className="w-6 h-6 bg-blue-500 rounded-full flex items-center justify-center flex-shrink-0 mt-1"><ChevronRight size={14} className="text-white"/></div>
              <div>
                <span className="font-bold">Realistic Outcomes:</span> Random events, advanced tactics, win/loss logic.
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="bg-slate-900 border-t border-slate-700 p-4 text-center text-slate-500 text-sm">
        Global Strategy War Game &copy; 2026. Accessible via link. Persistent session enabled.
      </footer>
    </div>
  )
}

export default Home