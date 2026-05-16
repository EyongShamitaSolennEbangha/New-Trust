# TrustLedger Backend — API Reference

Express + MongoDB backend for the TrustLedger Financial Agreement Ecosystem.

---

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Set up environment
cp .env.example .env
# Edit .env with your credentials

# 3. Seed development data
npm run seed

# 4. Start development server
npm run dev

# 5. Start production server
npm start
```

Server runs on `http://localhost:5000`

---

## Project Structure

```
src/
├── server.js                    # Entry point
├── config/
│   ├── database.js              # MongoDB connection
│   ├── redis.js                 # Redis + OTP/cache helpers
│   ├── logger.js                # Winston logger
│   ├── socket.js                # Socket.IO real-time events
│   └── cron.js                  # Scheduled jobs
├── models/
│   ├── User.model.js            # Users, identity, trust score
│   ├── Agreement.model.js       # Financial agreements
│   ├── Payment.model.js         # Payment records
│   ├── Notification.model.js    # In-app notifications
│   ├── Dispute.model.js         # Dispute management
│   └── AuditLog.model.js        # Tamper-proof audit chain
├── controllers/
│   ├── auth.controller.js       # Register, login, verify, reset
│   ├── agreement.controller.js  # Full agreement lifecycle
│   ├── payment.controller.js    # Record, confirm, dispute
│   ├── user.controller.js       # Profile, identity, admin
│   └── misc.controllers.js      # Trust score, notifications,
│                                #   disputes, public, admin
├── routes/
│   ├── auth.routes.js
│   ├── user.routes.js
│   ├── agreement.routes.js
│   ├── payment.routes.js
│   ├── verification.routes.js   # Public one-time link
│   ├── notification.routes.js
│   ├── trustScore.routes.js
│   ├── dispute.routes.js
│   ├── public.routes.js         # verify.trustledger.com
│   ├── admin.routes.js
│   └── webhook.routes.js        # Stripe webhooks
├── middleware/
│   ├── auth.middleware.js       # JWT protect, restrictTo, roles
│   ├── errorHandler.js          # Global error handler
│   ├── upload.middleware.js     # Multer memory storage
│   └── auditLog.middleware.js   # Tamper-proof audit trail
├── services/
│   ├── email.service.js         # Nodemailer templates
│   ├── sms.service.js           # Twilio OTP + reminders
│   ├── cloudinary.service.js    # Photo uploads
│   ├── faceMatch.service.js     # AWS Rekognition AI matching
│   ├── trustScore.service.js    # AI trust score engine
│   └── notification.service.js  # In-app + real-time
├── utils/
│   ├── AppError.js              # Operational error class
│   ├── catchAsync.js            # Async error wrapper
│   ├── jwt.utils.js             # Token sign/verify/send
│   ├── encryption.utils.js      # AES-256, SHA-256, tokens
│   ├── response.utils.js        # Standardised responses
│   └── seeder.js                # Dev data seeder
└── validators/
    └── validate.js              # express-validator runner
```

---

## Authentication

All protected routes require:
```
Authorization: Bearer <accessToken>
```

Access tokens expire in **7 days**. Use the refresh endpoint to get a new one.

---

## API Endpoints

### 🔐 Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/register` | ❌ | Create account |
| POST | `/login` | ❌ | Login, get tokens |
| POST | `/logout` | ✅ | Blacklist token |
| POST | `/refresh-token` | ❌ | Get new access token |
| GET | `/verify-email/:token` | ❌ | Confirm email address |
| POST | `/resend-verification` | ✅ | Resend email verification |
| POST | `/send-phone-otp` | ✅ | Send OTP to phone |
| POST | `/verify-phone-otp` | ✅ | Verify phone OTP |
| POST | `/forgot-password` | ❌ | Send password reset email |
| PATCH | `/reset-password/:token` | ❌ | Set new password |
| PATCH | `/change-password` | ✅ | Change current password |
| GET | `/me` | ✅ | Get logged-in user |

**Register body:**
```json
{
  "firstName": "Chidi",
  "lastName": "Okeke",
  "email": "chidi@example.com",
  "phone": "+2348011111111",
  "password": "SecurePass@123"
}
```

**Login body:**
```json
{ "email": "chidi@example.com", "password": "SecurePass@123" }
```

**Login response:**
```json
{
  "success": true,
  "data": {
    "accessToken": "eyJ...",
    "refreshToken": "eyJ...",
    "user": { ... }
  }
}
```

---

### 👤 Users — `/api/users`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| GET | `/profile` | ✅ | Any | Get own profile |
| PATCH | `/profile` | ✅ | Any | Update profile |
| POST | `/avatar` | ✅ | Any | Upload profile photo |
| GET | `/stats` | ✅ | Any | Get own stats |
| PATCH | `/notification-preferences` | ✅ | Any | Update notification prefs |
| POST | `/verify-identity` | ✅ | Any | Submit ID + selfie for AI verification |
| GET | `/:id/profile` | ✅ | Any | View another user's profile |
| GET | `/` | ✅ | Admin | Get all users |
| PATCH | `/:id/status` | ✅ | Admin | Suspend / ban / activate account |

**Submit identity verification** — multipart/form-data:
```
idFront: <image file>        (required)
idBack:  <image file>        (optional)
selfie:  <image file>        (required)
idType:  national_id | passport | drivers_license | voters_card
idNumber: <string>
```

AI face match runs automatically. If ≥80% match → `isIdentityVerified: true` instantly.

---

### 📄 Agreements — `/api/agreements`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ (ID verified) | Create agreement |
| GET | `/` | ✅ | Get my agreements |
| GET | `/all` | ✅ Admin | Get all agreements |
| GET | `/:id` | ✅ | Get single agreement |
| DELETE | `/:id/cancel` | ✅ | Cancel draft/pending agreement |
| GET | `/:id/verify-integrity` | ✅ | Verify SHA-256 tamper check |
| POST | `/:id/in-person/initiate` | ✅ Creditor | Generate OTP for in-person |
| POST | `/:id/in-person/complete` | ✅ Debtor | Submit OTP to verify in-person |
| POST | `/:id/sign/creditor` | ✅ Creditor | Creditor signs agreement |
| POST | `/:id/remote/generate-link` | ✅ Creditor | Generate secure link for debtor |
| PATCH | `/:id/default` | ✅ Creditor | Mark agreement as defaulted |

**Create agreement body:**
```json
{
  "debtorPhone": "+2348022222222",
  "principalAmount": 50000,
  "currency": "NGN",
  "interestRate": 5,
  "interestType": "simple",
  "purpose": "Business capital",
  "repaymentType": "lump_sum",
  "dueDate": "2025-12-31",
  "verificationMode": "in_person",
  "notes": "Repayment in full by end of year"
}
```

#### In-Person Flow
```
1. POST /agreements/:id/in-person/initiate   → OTP sent to creditor's phone
2. Creditor reads OTP to debtor in person
3. POST /agreements/:id/in-person/complete   → { otp, signature }
4. POST /agreements/:id/sign/creditor        → { signature }
5. Agreement status → "active"
```

#### Remote Flow
```
1. POST /agreements/:id/remote/generate-link → link emailed/SMSed to debtor
2. Debtor visits: GET /api/verification/:token   → sees agreement preview
3. Debtor submits: POST /api/verification/:token/submit
   (multipart: idFront, selfie, signature)
4. AI face match runs → if passed, debtor auto-signed
5. POST /agreements/:id/sign/creditor        → activates agreement
```

---

### 💰 Payments — `/api/payments`

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | `/` | ✅ Debtor | Record a payment (cash/bank/card) |
| GET | `/` | ✅ | Get my payment history |
| GET | `/agreement/:agreementId` | ✅ Party | Get all payments for agreement |
| PATCH | `/:id/confirm` | ✅ Creditor | Confirm payment received |
| PATCH | `/:id/dispute` | ✅ Party | Dispute a payment |

**Record payment body** — multipart/form-data:
```
agreementId: <mongoId>
amount: 25000
paymentMethod: cash | bank_transfer | card | mobile_money | crypto | other
notes: "First instalment"
receipt: <image file>  (optional)
```

When creditor **confirms**, the agreement `remainingBalance` decreases automatically.
If `remainingBalance` hits 0, agreement status → `completed`.
Trust scores for both parties recalculate after each confirmation.

---

### 🔍 Public Verification — `/api/verification`

No authentication required. These routes power `verify.trustledger.com`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/:token` | Preview agreement before submitting (from emailed link) |
| POST | `/:token/submit` | Submit ID photo + selfie + signature |

**Submit body** — multipart/form-data:
```
idFront:   <image file>  (required)
selfie:    <image file>  (required)
signature: <base64 string>
```

---

### 🌐 Public Portal — `/api/public`

Rate-limited: 30 requests per 15 minutes per IP. No auth.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/defaulters?name=John&page=1` | Search public defaulter registry |
| GET | `/agreements/:agreementId/verify` | Verify agreement integrity publicly |
| GET | `/users/:id/profile` | View a user's public trust profile |
| GET | `/info` | Platform info |

---

### 🔔 Notifications — `/api/notifications`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/` | Get my notifications (paginated) |
| GET | `/unread-count` | Get unread count |
| PATCH | `/mark-read` | Mark notifications as read `{ ids: [...] }` |
| DELETE | `/:id` | Delete a notification |

---

### 🏆 Trust Score — `/api/trust-score`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/me` | My trust score + breakdown |
| GET | `/me/breakdown` | Detailed scoring breakdown |
| GET | `/me/history` | Trust score history |
| POST | `/me/recalculate` | Trigger manual recalculation |
| GET | `/user/:id` | View another user's trust score |

**Trust Score Breakdown:**
```json
{
  "paymentHistory": 320,       // 40% weight (max 400)
  "agreementCompletion": 210,  // 30% weight (max 300)
  "behaviourPatterns": 150,    // 20% weight (max 200)
  "communityFeedback": 60,     // 10% weight (max 100)
  "identityBonus": 50,         // flat bonus for verified ID
  "total": 790
}
```

**Trust Levels:**
| Score | Level |
|-------|-------|
| 0–299 | Unverified |
| 300–499 | Bronze |
| 500–699 | Silver |
| 700–899 | Gold |
| 900–1000 | Platinum |

---

### ⚖️ Disputes — `/api/disputes`

| Method | Endpoint | Auth | Role | Description |
|--------|----------|------|------|-------------|
| POST | `/` | ✅ | Any party | Open a dispute |
| GET | `/` | ✅ | Any | My disputes |
| GET | `/all` | ✅ | Admin | All disputes |
| GET | `/:id` | ✅ | Party | Get dispute detail |
| POST | `/:id/messages` | ✅ | Party | Add message to dispute |
| PATCH | `/:id/resolve` | ✅ | Admin/Mod | Resolve dispute |

**Open dispute body** — multipart/form-data:
```
agreementId: <mongoId>
reason: payment_not_received | payment_amount_incorrect | fraud | ...
description: "Detailed explanation (min 20 chars)"
evidence: <up to 5 image files>
```

---

### 🛡️ Admin — `/api/admin`

All routes require `role: admin`.

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/dashboard` | Platform-wide statistics |
| GET | `/audit-logs` | Tamper-proof audit log chain |
| PATCH | `/users/:id/list-defaulter` | Manually list user as defaulter |
| PATCH | `/users/:id/remove-defaulter` | Remove user from defaulter list |

---

### 🔗 Webhooks — `/api/webhooks`

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/stripe` | Stripe payment events (raw body) |

---

## Real-Time Events (Socket.IO)

Connect with:
```js
const socket = io('http://localhost:5000', {
  auth: { token: '<accessToken>' }
});

// Join agreement room
socket.emit('join:agreement', agreementId);
```

**Events emitted by server:**

| Event | Trigger | Payload |
|-------|---------|---------|
| `notification:new` | Any notification | `{ type, title, message, data }` |
| `trustScore:updated` | Score recalculated | `{ score, level, breakdown }` |
| `payment:new` | Payment recorded | `{ amount, currency, status }` |
| `agreement:statusChanged` | Status change | `{ status, remainingBalance }` |

---

## Scheduled Cron Jobs

| Schedule | Job |
|----------|-----|
| Every day @ 08:00 | Send payment reminders (3 days & 1 day before due) |
| Every day @ 00:00 | Auto-default agreements 30+ days overdue |
| Every hour | Expire unused remote verification links |
| Every day @ 02:00 | Nightly trust score recalculation for active users |

---

## Security Features

| Feature | Implementation |
|---------|---------------|
| Password hashing | bcryptjs, 12 salt rounds |
| Access tokens | JWT, 7-day expiry |
| Refresh tokens | JWT, 30-day expiry, separate secret |
| Token blacklist | Redis on logout |
| Data encryption (at rest) | AES-256-GCM (ID numbers, sensitive fields) |
| Data encryption (in transit) | TLS/HTTPS |
| Document integrity | SHA-256 hash on every agreement |
| Audit trail | Chained SHA-256 hash log (tamper detection) |
| Rate limiting | Global (100/15min), Auth (10/15min), Public (30/15min) |
| Account lockout | 5 failed logins → 2-hour lock |
| Input sanitisation | mongo-sanitize, xss-clean, hpp |
| File uploads | Memory only, type-checked, 5MB limit |
| Role-based access | user / moderator / admin |

---

## Environment Variables

See `.env.example` for the full list. Key variables:

```env
MONGO_URI=mongodb+srv://...
JWT_SECRET=<64+ chars>
ENCRYPTION_KEY=<exactly 32 chars>
TWILIO_ACCOUNT_SID=...
CLOUDINARY_CLOUD_NAME=...
AWS_ACCESS_KEY_ID=...      # For face matching
STRIPE_SECRET_KEY=...
```

---

## Seed Accounts (Development)

After running `npm run seed`:

| Role | Email | Password |
|------|-------|----------|
| Admin | admin@trustledger.com | Admin@1234! |
| Creditor | chidi@example.com | Password@123 |
| Debtor | amaka@example.com | Password@123 |
| Unverified | emeka@example.com | Password@123 |
