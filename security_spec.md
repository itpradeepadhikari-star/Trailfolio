# Trailfolio Security Specification (Payload-First TDD)

## 1. Data Invariants
1. **No PII in Public Collections**: `/publicProfiles/{userId}` never stores email, phone, or address; only public display metadata (`displayName`, `handle`, `bio`, `homeBase`, `avatarUrl`, aggregate counts).
2. **Ownership Integrity**: Every `/treks/{trekId}` and `/treks/{trekId}/waypoints/{waypointId}` must match `ownerId == request.auth.uid` on write, with verified email (`request.auth.token.email_verified == true`), and `ownerId` is immutable after creation.
3. **Master Gate Relational Sync**: Waypoints cannot be created or edited unless the parent `/treks/{trekId}` exists, belongs to `request.auth.uid`, and is currently in `'active'` status (except atomic `trekIsPublic` sync via `getAfter()` when toggling trek visibility).
4. **Terminal State Locking**: Once a trek reaches `status: 'completed'`, its route geometry, metrics, title, and `completedAt` are immutable; only `isPublic` and `updatedAt` may be toggled by the owner.
5. **Strict Key & Size Bounds**: Every document enforces `hasAll` + `hasOnly` on create and `affectedKeys().hasOnly(...)` on update, strict ID regex (`^[a-zA-Z0-9_-]+$`), coordinate ranges (`[-90, 90]`, `[-180, 180]`), and bounded photo arrays (`size() <= 2`, each item `<= 350000` chars).
6. **Temporal Integrity**: `createdAt`, `startedAt`, `reachedAt`, `completedAt` (when transitioning), and `updatedAt` must equal `request.time`.

## 2. Dirty Dozen Adversarial Payloads (Must Return PERMISSION_DENIED)
1. **Unauthenticated Trek Create**: `POST /treks/t1` with `request.auth == null`.
2. **Unverified Email Write**: `POST /treks/t1` with `email_verified: false`.
3. **Identity Spoofing**: `POST /treks/t1` with `ownerId: "victim_uid"` while authenticated as `"attacker_uid"`.
4. **Shadow/Ghost Field Injection**: `POST /publicProfiles/u1` including extra field `isAdmin: true` or `email: "leak@example.com"`.
5. **ID Poisoning**: `POST /treks/invalid$id_with_1500_chars...` failing `isValidId()`.
6. **Create Directly as Completed**: `POST /treks/t1` with `status: "completed"` instead of `"active"`.
7. **Timestamp Forgery**: `POST /treks/t1` with `startedAt` set to a past client timestamp instead of `request.time`.
8. **Post-Completion Route Tampering**: `UPDATE /treks/t1` (where `existing().status == 'completed'`) attempting to modify `distanceKm` or revert `status` to `'active'`.
9. **Orphaned Waypoint Creation**: `POST /treks/nonexistent/waypoints/w1` where parent trek does not exist.
10. **Waypoint Injection on Completed Trek**: `POST /treks/completed_trek/waypoints/w2` where parent trek `status == 'completed'`.
11. **Array Exhaustion / Oversized Payload**: `POST /treks/t1/waypoints/w1` with `photos` array of length 5 or string `> 350000` chars.
12. **Private Trek Query Scraping**: `LIST /treks` without filter or reading another user's `isPublic == false` trek or waypoints.
