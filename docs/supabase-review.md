# Supabase — Full Review

## 1. Client & config

**File:** `src/lib/supabase/client.ts`

- **Client:** `createClient(supabaseUrl, supabaseAnonKey)` from `@supabase/supabase-js`.
- **Env:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Placeholders used if unset so the app builds without credentials.
- **Guard:** `isSupabaseConfigured()` — true only when both env vars are set. Used to skip Supabase calls and show “configure Supabase” messaging when not set.

**`.env.example`** documents: Supabase URL/key, Mapbox token, optional Twitter tweet IDs.

---

## 2. Tables used (by name)

| Table | Purpose | Used by |
|------|--------|--------|
| **entities** | People/orgs; canonical name, type, aliases | Network, stories, entity pages, search, dashboard |
| **signals** | Ralph detections (e.g. CROSS_CAMPAIGN) | Network (cross-campaign), story classifier, dashboard |
| **mmix_entries** | Investigation queue (active/investigating) | Investigations, entity investigations, story classifier, dashboard |
| **relationships** | Links between entities (source/target) | Network, entity relationships |
| **fec_disbursements** | FEC campaign disbursements | Network (money flows), stories (vendor siphoning), entity disbursements |
| **screening_results** | Watchlist/sanctions matches | Entity dossier, story classifier |
| **kb_nodes** | Knowledge-graph / bridge scores | Network (sizing), story classifier |
| **story_coverage** | Published stories (record_type = publication) | Stories page, dashboard |
| **politician_universe** | Politician list | Search, universe stats |
| **corporate_filings** | Corporate filings by entity name | Entity dossier |
| **court_cases** | Court cases by entity name | Entity dossier |
| **federal_awards** | Federal awards by entity name | Entity dossier |

---

## 3. Queries (by function)

| Function | Tables | Notes |
|----------|--------|--------|
| `getActiveInvestigations` | mmix_entries | status in ['active','investigating'] |
| `getAllInvestigations` | mmix_entries | All, ordered by entered_at |
| `getTopEntities` | entities | Order by updated_at |
| `getEntity` | entities | By id |
| `getRecentSignals` | signals | Order by detected_at |
| `getEntitySignals` | signals | By entity_id |
| `getSignalCounts` | signals | Aggregates by signal_type |
| `getStories` | story_coverage | record_type = publication |
| `getEntityDisbursements` | fec_disbursements | By entity_id, order by amount |
| `getEntityScreenings` | screening_results | entity_name ilike |
| `getEntityRelationships` | relationships | source or target = entityId, is_current |
| `getEntityInvestigations` | mmix_entries | By entity_id |
| `getEntityFilings` | corporate_filings | entity_name ilike |
| `getEntityCourtCases` | court_cases | entity_name ilike |
| `getEntityAwards` | federal_awards | entity_name ilike |
| `searchEntities` | entities | canonical_name ilike |
| `searchPoliticians` | politician_universe | name ilike |
| `getDashboardStats` | entities, signals, mmix_entries, story_coverage | Counts only |
| `getMoneyNetwork` | signals, relationships, fec_disbursements, entities, kb_nodes | Full network payload |
| `getStoryClassificationData` | signals, mmix_entries, relationships, entities, fec_disbursements, screening_results, kb_nodes | Full classifier payload |
| `getUniverseStats` | politician_universe | Count |

---

## 4. Types vs schema

- **Entity:** id, canonical_name, normalized_name, entity_type, aliases, metadata, created_at, updated_at.
- **Signal:** id, signal_type, entity_id, source_api, strength, promoted, idempotency_key, detected_at, details.
- **MmixEntry:** id, entity_id, entity_name, priority, status, thesis, signal_ids, sources_*, findings, entered_at, expires_at, updated_at.
- **StoryPublication:** id, record_type, topic, angle, entity_id (nullable), fact_hashes, details, published_at.
- **FecDisbursement:** All fields currently typed as required. In practice **entity_id**, **committee_id**, **committee_name** can be null/empty; network and story code already handle that. Consider `entity_id?: string | null` and optional committee fields.
- **ScreeningResult, Relationship, Politician:** Match usage; Relationship uses source_entity_id, target_entity_id.

---

## 5. Error handling

- Most queries: on error log and return `[]` or `null`. No global error boundary; pages get empty data.
- `getMoneyNetwork` and `getStoryClassificationData`: no explicit error handling; Supabase errors surface as thrown or empty arrays.

---

## 6. Limits & pagination

- **getMoneyNetwork:** relationships 500, entities 1000, kb_nodes 1000; disbursements paginated (1000 per page until empty).
- **getStoryClassificationData:** signals 2000, mmix 200, relationships 1000, entities 1000, screenings 500, kb_nodes 1000; disbursements paginated 1000 per page.
- Entity/search list limits: 20–50 typically; entity dossier detail queries 50.

---

## 7. RLS / auth

- Client uses **anon** key only; no `supabase.auth` usage in this codebase.
- Row-level security (RLS) is configured in Supabase project, not in app code. Ensure anon policy allows read on all tables this app reads.

---

## 8. Why TOTAL FLOW / FEC RECORDS can be 0

- **FEC RECORDS** = `disbursements.length` from `getMoneyNetwork()` → `fec_disbursements` rows.
- **TOTAL FLOW** = sum of `disbursement_amount` over those same rows.
- If **fec_disbursements** is empty (or not readable), both stay 0. NODES and CONNECTIONS still come from **entities** and **relationships**.

---

## 9. Recommendations

1. **Types:** Make `FecDisbursement.entity_id` (and committee fields) optional/nullable to match DB and network/story logic.
2. **Errors:** Add try/catch or `.then()` error handling for `getMoneyNetwork` and `getStoryClassificationData` so UI can show a “failed to load” state instead of silent empty data.
3. **RLS:** Confirm anon read access for: entities, signals, mmix_entries, relationships, fec_disbursements, screening_results, kb_nodes, story_coverage, politician_universe, corporate_filings, court_cases, federal_awards.
4. **Data:** Populate **fec_disbursements** (e.g. from Ralph/FEC pipeline) to get non-zero TOTAL FLOW and payment links on the network.
