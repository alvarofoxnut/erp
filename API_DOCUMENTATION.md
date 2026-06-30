# Makhana ERP - API Documentation

Base URL: `http://localhost:5000/api`

All protected routes require: `Authorization: Bearer <accessToken>`

## Authentication

### POST /auth/login
```json
{ "email": "admin@makhanaerp.com", "password": "admin123" }
```
Response: `{ user, accessToken }` + refresh token cookie

### POST /auth/refresh
Refresh access token using refresh token cookie.

### POST /auth/logout
Requires auth. Clears refresh token.

### GET /auth/me
Returns current user profile.

---

## Users (Admin only)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /users | List users (paginated) |
| GET | /users/:id | Get user |
| POST | /users | Create user |
| PUT | /users/:id | Update user |
| DELETE | /users/:id | Deactivate user |

---

## Manufacturing

### Raw Purchases
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /manufacturing/raw-purchases | vendor, lotNumber, quantity, purchaseRate, date, notes |
| GET | /manufacturing/raw-purchases | ?page&limit&search&startDate&endDate |

### Machine Entries (WIP)
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /manufacturing/machine-entries | lotNumber, quantitySent, date, notes |
| GET | /manufacturing/machine-entries | ?page&limit&search&startDate&endDate |

### Quality Production
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /manufacturing/quality-productions | date, lotNumber, quantity6No, quantity5No, quantity4No, quantityOthers |
| GET | /manufacturing/quality-productions | ?page&limit&search&startDate&endDate |

### Finished Production
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /manufacturing/finished-productions | date, finishedQuantity, productionMode (manual/proportionate), consumed6No, consumed5No, consumed4No |
| GET | /manufacturing/finished-productions | ?page&limit&startDate&endDate |

### GET /manufacturing/production-trend
Returns monthly production trend data.

---

## Trading

### Items
| Method | Endpoint |
|--------|----------|
| GET/POST | /trading/items |
| PUT/DELETE | /trading/items/:id |

### Parties
| Method | Endpoint |
|--------|----------|
| GET/POST | /trading/parties |
| PUT/DELETE | /trading/parties/:id |

Query: `?type=vendor|customer|both`

### Purchases
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /trading/purchases | date, party, item, quantity, amount |
| GET | /trading/purchases | ?page&limit&search&startDate&endDate |

### Sales
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /trading/sales | date, party, item, quantity, amount |
| GET | /trading/sales | ?page&limit&search&startDate&endDate |

---

## Inventory

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /inventory/summary | Current stock levels |
| GET | /inventory/ledger | Stock movement ledger |
| GET | /inventory/lot/:lotNumber | Lot-wise stock |
| GET | /inventory/trend | Inventory trend chart data |

Ledger query: `?category&item&lotNumber&movementType&startDate&endDate&page&limit`

---

## Accounting

### Expenses
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /accounting/expenses | date, type (direct/indirect/personal), category, amount, paymentMode |
| GET | /accounting/expenses | ?type&startDate&endDate&page&limit |
| GET | /accounting/expenses/summary | Expense summary by type |

### Invoices
| Method | Endpoint | Body |
|--------|----------|------|
| POST | /accounting/invoices | invoiceNumber, date, partyName, items, amount, gstDetails, paymentMode, paidAmount |
| GET | /accounting/invoices | ?paymentStatus&search&startDate&endDate |
| PATCH | /accounting/invoices/:id/payment | { paidAmount } |
| GET | /accounting/invoices/pending | Pending payment invoices |

### Ledgers
| Method | Endpoint |
|--------|----------|
| GET | /accounting/ledgers |
| GET | /accounting/ledgers/:id/entries |

---

## Reports

All support `?startDate&endDate&financialYear=true`

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /reports/stock | Stock report |
| GET | /reports/production | Production report |
| GET | /reports/sales | Sales report |
| GET | /reports/purchase | Purchase report |
| GET | /reports/vendors | Vendor report |
| GET | /reports/customers | Customer report |
| GET | /reports/expenses | Expense report |
| GET | /reports/profit-loss | P&L report |
| GET | /reports/lot/:lotNumber | Lot-wise report |
| GET | /reports/export/:reportType | Excel export |

---

## Dashboard

### GET /dashboard
Returns: stock summary, sales/expense/profit summaries, pending payments, chart data.

---

## Response Format

### Success
```json
{
  "success": true,
  "message": "Success",
  "data": {},
  "pagination": { "total": 100, "page": 1, "limit": 10, "totalPages": 10 }
}
```

### Error
```json
{
  "success": false,
  "message": "Error message",
  "errors": [{ "field": "email", "message": "Valid email required" }]
}
```

## Database Collections

- users, parties, items, ledgers, ledgerentries
- stockLedger, rawPurchases, machineEntries, qualityProductions, finishedProductions
- purchases, sales, expenses, invoices, auditlogs

## Stock Categories

`raw_material`, `wip`, `quality_6no`, `quality_5no`, `quality_4no`, `quality_others`, `finished_goods`, `trading`

## Movement Types

`purchase`, `production`, `consumption`, `sales`, `returns`, `transfer`
