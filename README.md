# Pheonix Esport V2

## Run locally
1. Install Node.js 18+.
2. Open this folder in Terminal.
3. Run `npm install`
4. Run `npm start`
5. Open `http://localhost:3000`

## Included
- Express backend
- SQLite database
- Tournament API
- Registration API
- Leaderboard API
- Responsive esports frontend
- Payment-method selection (UPI, PhonePe, Google Pay, Paytm)

## Important for live payments
This project intentionally does NOT fake or directly process real payments. To accept real money, connect a legitimate payment gateway (for example, a gateway that supports UPI) and verify payment server-side using its official API/webhooks. Never put secret payment keys in frontend JavaScript.

## Production admin
The admin section is a feature preview. Before production, add authentication, role-based authorization, input validation, rate limiting, HTTPS, secure secrets, and payment webhook verification.
