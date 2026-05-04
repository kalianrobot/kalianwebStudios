# Security Specification - Kalian App

## 1. Data Invariants
- A **Reservation** (`reservas`) cannot exist without a valid `eventoId`.
- A **Reservation** must specify the number of people, which must be at least 1.
- An **Event** (`eventos`) must have its `aforo_reservado` field updated atomically when a reservation is made.
- **Socio** profiles (`socios`) can only be modified by admins, but users can read their own profile (linked by UID).

## 2. The "Dirty Dozen" Payloads

### Payload 1: Unauthorized Admin Promotion
- **Target:** `users/{uid}`
- **Attack:** Change `role` to 'admin'
- **Result:** PERMISSION_DENIED

### Payload 2: Ghost Field Injection
- **Target:** `reservas/{id}`
- **Attack:** Include `isAdmin: true` in reservation data.
- **Result:** PERMISSION_DENIED (via `isValidReserva` helper)

### Payload 3: Negative Capacity
- **Target:** `reservas/{id}`
- **Attack:** `numPersonas: -10`
- **Result:** PERMISSION_DENIED

### Payload 4: ID Poisoning
- **Target:** `eventos/{id}`
- **Attack:** Create event with 2KB string ID.
- **Result:** PERMISSION_DENIED (via `isValidId`)

### Payload 5: Aforo Spoofing
- **Target:** `eventos/{id}`
- **Attack:** Directly update `aforo_reservado` without creating a reservation.
- **Result:** PERMISSION_DENIED (via `existsAfter` check in rules)

### Payload 6: Ownership Takeover
- **Target:** `reservas/{id}`
- **Attack:** Update `uidTitular` of someone else's reservation.
- **Result:** PERMISSION_DENIED

### Payload 7: Fake Socio
- **Target:** `reservas/{id}`
- **Attack:** Set `esSocio: true` without being a socio.
- **Result:** PERMISSION_DENIED (relational check)

### Payload 8: Price Manipulation
- **Target:** `reservas/{id}`
- **Attack:** Set a lower `totalPagar` than calculated.
- **Result:** PERMISSION_DENIED (Price validation logic)

### Payload 9: Past Reservation
- **Target:** `reservas/{id}`
- **Attack:** Create reservation for an event that happened 1 year ago.
- **Result:** PERMISSION_DENIED

### Payload 10: Email Spoofing
- **Target:** `users/{uid}`
- **Attack:** Set email to an admin email without verification.
- **Result:** PERMISSION_DENIED

### Payload 11: Mass Scraping
- **Target:** `reservas` (list)
- **Attack:** Query all reservations without filtering by UID.
- **Result:** PERMISSION_DENIED

### Payload 12: Terminal State Bypass
- **Target:** `reservas/{id}` (update)
- **Attack:** Change `estado` from 'cancelado' back to 'pendiente'.
- **Result:** PERMISSION_DENIED

## 3. Test Runner (Mock)
See `firestore.rules.test.ts` (conceptual).
