import { NextRequest, NextResponse } from 'next/server'

export async function POST(request: NextRequest) {
  const body = await request.json()
  const { id, pass } = body
  
  // Mock authentication logic (persistent session via cookies)
  // In production, use database and JWT
  const accounts = {
    'alpha_lead': 'Alpha@123',
    'alpha_cmd': 'AlphaCmd@123',
    'beta_lead': 'Beta@123',
    'beta_cmd': 'BetaCmd@123',
    'third_party': 'Third@123'
  }
  
  if (accounts[id] === pass) {
    const response = NextResponse.json({ success: true, role: id.includes('alpha') ? 'Alpha' : id.includes('beta') ? 'Beta' : 'Third Party' })
    response.cookies.set('session', 'active', { httpOnly: true, maxAge: 604800 }) // 1 week persistent
    return response
  }
  
  return NextResponse.json({ success: false, error: 'Invalid credentials' }, { status: 401 })
}
