# Security Specification - Kalian Club

## Data Invariants
1. **Financial Data Isolation**: Records in `finanzas`, `caja_eventos`, and `pagos_*` collections must only be accessible by users with the `admin` role.
2. **Identity Integrity**: No user can modify their own `role` field.
3. **Relational Consistency**: A session cannot be created for a course that does not exist.
4. **Member Privacy**: PII in the `socios` collection (email, phone, etc.) must only be readable by the owner or an admin. Public profile info can be shared if necessary (though not currently specified).
5. **Session Control**: Only the assigned teacher of a course or an admin can modify sessions for that course. The 'portero' can only update attendance-related fields if applicable.
6. **Immutable IDs**: Key fields like `cursoId`, `socioId`, and `fecha` in established records should be immutable.

## The "Dirty Dozen" Payloads (Attacker Payloads)

1. **Privilege Escalation**: 
   - `PATCH /users/{myUid} { "role": "admin" }` -> Expected: PERMISSION_DENIED
2. **Financial Data Scraping**:
   - `GET /caja_eventos` (as authenticated non-admin) -> Expected: PERMISSION_DENIED
3. **Identity Spoofing**:
   - `CREATE /socios/DNI123 { "uid": "notMe", ... }` -> Expected: PERMISSION_DENIED
4. **Shadow Course Update**:
   - `PATCH /cursos/curso1 { "isVerified": true, "ghostRecord": true }` -> Expected: PERMISSION_DENIED (via strict schema check)
5. **PII Leakage**:
   - `GET /socios/OTHER_DNI` (as authenticated non-admin) -> Expected: PERMISSION_DENIED
6. **Orphaned Session Injection**:
   - `CREATE /cursos/NON_EXISTENT/sesiones/ses1 { ... }` -> Expected: PERMISSION_DENIED
7. **Unauthorized Attendance Marking**:
   - `PATCH /asistencia_eventos/as1` (as authenticated non-portero/non-admin) -> Expected: PERMISSION_DENIED
8. **Public Registry Poisoning**:
   - `CREATE /academias/aca1 { ... }` (as non-admin) -> Expected: PERMISSION_DENIED
9. **Large ID Attack**:
   - `CREATE /cursos/A_VERY_LONG_ID_EXCEEDING_128_CHARS_JUNK_DATA_... { ... }` -> Expected: PERMISSION_DENIED
10. **Timestamp Fraud**:
    - `CREATE /pagos_mensuales/p1 { "fechaActualizacion": "2020-01-01" }` (Old timestamp) -> Expected: PERMISSION_DENIED (Must be server time)
11. **Admin Lookup Bypass**:
    - `GET /finanzas/f1` (Signed in but role is null) -> Expected: PERMISSION_DENIED
12. **Negative Aporto Attack**:
    - `CREATE /eventos/ev1 { "precio_estandar": -100 }` -> Expected: PERMISSION_DENIED

## Test Plan (Draft)
The test runner `firestore.rules.test.ts` will verify these scenarios using the Firebase Rules Unit Testing library.
