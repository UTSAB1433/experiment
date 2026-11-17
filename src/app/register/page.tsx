import Link from 'next/link'
import { Users, MapPin, Shield, Sword, Globe } from 'lucide-react'

export default function RegisterPage() {
  const roles = [
    { name: 'Team Alpha Leader', power: 'Orbital Strike', army: 'Drone Swarm', color: 'text-blue-400' },
    { name: 'Team Alpha Commander', power: 'Tactical Shield', army: 'Mechanized Infantry', color: 'text-blue-400' },
    { name: 'Team Beta Leader', power: 'Cyber Breach', army: 'Submarine Blockade', color: 'text-red-400' },
    { name: 'Team Beta Commander', power: 'EMP Pulse', army: 'Stealth Fleet', color: 'text-red-400' },
    { name: 'Third Party Diplomat', power: 'Resource Exploit', army: 'Mercenary Corps', color: 'text-yellow-400' },
  ]

  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl">
        <header className="mb-8 flex items-center gap-3">
          <Globe className="text-blue-400 w-8 h-8" />
          <h1 className="text-3xl font-bold">Role Assignment</h1>
        </header>
        
        <p className="text-slate-400 mb-8 max-w-2xl">
          Select your role. Each role has unique powers and armies. No common units across teams.
          <br className="hidden md:block" />
          Initial IDs/Passwords are generated upon registration. Session persists automatically.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {roles.map((role, i) => (
            <div key={i} className="bg-slate-900 border border-slate-700 rounded-2xl p-6 hover:border-blue-500/50 transition group">
              <div className={`flex items-center gap-3 mb-4 ${role.color}`}>
                <Shield size={24} />
                <h3 className="font-bold text-lg">{role.name}</h3>
              </div>
              <div className="space-y-2 text-sm text-slate-400 mb-6">
                <p><span className="text-slate-300 font-medium">Unique Power:</span> {role.power}</p>
                <p><span className="text-slate-300 font-medium">Army Units:</span> {role.army}</p>
              </div>
              <button className="w-full bg-slate-800 hover:bg-slate-700 text-white font-medium py-2 rounded-lg transition border border-slate-700 group-hover:border-blue-500/50">
                Claim Role
              </button>
            </div>
          ))}
        </div>

        <div className="mt-12 text-center">
          <Link href="/" className="inline-flex items-center gap-2 text-blue-400 hover:underline">
            <MapPin size={18} /> Return to Global Map
          </Link>
        </div>
      </div>
    </div>
  )
}
