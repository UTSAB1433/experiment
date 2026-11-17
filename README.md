# Global Strategy War Game

## Overview
Complex global map-based strategy game website based on WhatsApp chat context.

## Requirements Met
- [x] **Global Map Interface**: Prominent map with borders showing territory coverage (using WhatsApp context image as base, enhanced with borders).
- [x] **Two Teams & Third Parties**: Team Alpha, Team Beta, and Third Parties with unique powers/armies (no common units).
- [x] **Roles & Passwords**: Unique IDs/Passwords assigned. Change ID/Pass after login functionality included.
- [x] **Resources & Bases**: Infrastructure for captured areas, upgrades, and unlocks.
- [x] **Random Events & Outcomes**: Realistic war outcomes, advanced tactics, and random events logic.
- [x] **Persistent Session**: Login persists via cookies (no repeated login).
- [x] **Initial Credentials**: Provided in the main page and registration logic.
- [x] **Deployment**: Ready for GitHub deployment (Next.js framework).

## Initial IDs/Passwords
| Role | Initial ID | Initial Password |
|------|------------|------------------|
| Team Alpha Leader | `alpha_lead` | `Alpha@123` |
| Team Alpha Commander | `alpha_cmd` | `AlphaCmd@123` |
| Team Beta Leader | `beta_lead` | `Beta@123` |
| Team Beta Commander | `beta_cmd` | `BetaCmd@123` |
| Third Party Diplomat | `third_party` | `Third@123` |

## Project Structure
- `/src/app/page.tsx`: Main landing page with map interface and initial credentials.
- `/src/app/login/page.tsx`: Login interface.
- `/src/app/register/page.tsx`: Role assignment interface.
- `/src/app/dashboard/page.tsx`: Game dashboard with events and outcomes.
- `/src/app/api/login/route.ts`: Authentication API (persistent session).
- `/src/assets/`: Reference images from WhatsApp chat and context.

## Deployment
1. Ensure Node.js is installed.
2. Run `npm install --legacy-peer-deps`
3. Run `npm run dev` to start local server.
4. Push to GitHub for online deployment (GitHub Pages / Vercel / Netlify).

## Context Images
- `WhatsApp Image 2026-11-17 at 8.28.14 PM.jpeg` (Source context)
- `image-1.png` to `image-4.png` (Reference designs)

## License
MIT
