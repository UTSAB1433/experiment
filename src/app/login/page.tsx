import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'

export default function LoginPage() {
  return (
    <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
            <ChevronLeft className="text-white rotate-180" />
          </div>
          <h2 className="text-2xl font-bold">Command Login</h2>
        </div>
        
        <form className="space-y-6" action="#" method="POST">
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Account ID</label>
            <input 
              type="text" 
              name="id" 
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="e.g. alpha_lead"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-300 mb-1">Password</label>
            <input 
              type="password" 
              name="pass" 
              required
              className="w-full bg-slate-800 border border-slate-700 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500 transition"
              placeholder="Initial password"
            />
          </div>
          <button 
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-900/20"
          >
            Enter Command Center
          </button>
        </form>
        
        <div className="mt-6 text-center text-sm text-slate-500">
          <p>Remember: Change ID/Password after login.</p>
          <p className="mt-2">
            <Link href="/" className="text-blue-400 hover:underline">Back to Map Interface</Link>
          </p>
        </div>
      </div>
    </div>
  )
}
