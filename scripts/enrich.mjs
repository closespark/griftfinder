#!/usr/bin/env node
/**
 * GriftFinder Enrichment Pipeline
 * Queries new APIs for all existing entities and inserts into new Supabase tables.
 * Respects rate limits. Streams progress to stdout.
 */

const SUPABASE_URL = 'https://qrvjaonjnwmpgnmqhfuq.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFydmphb25qbndtcGdubXFoZnVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNDc0MTksImV4cCI6MjA4NTkyMzQxOX0.9AKXv0T_pmd8YdQZOQh_YO711ny5MXKO87T8doEoYvU';

const CONGRESS_KEY = '4X9okPALbm234ofjohGVau0QscOVZbmHRy8lexZK';
const REGULATIONS_KEY = 'P9bfIh1ulpKYY39qrt1E3bgodT4tMmKuSgwVYrl9';
const OPEN_STATES_KEY = '0d0bf1f4-7a35-48b6-9f60-8a164e048aef';
const GOVINFO_KEY = 'fN97elAMQsoc520o2l6kaSdqgJ5ZgxlIIr51rpsg';

// ── Rate limiters ──────────────────────────────────────────────────────────
// Congress.gov: 5000/hr = ~1.4/sec → use 1/sec
// Regulations.gov: 50/min = ~0.8/sec → use 1 per 1.5s
// Federal Register: no formal limit → use 2/sec
// DOGE API: no formal limit → use 2/sec
// Open States: undocumented → use 1/sec
// Supabase: generous → no throttle needed

const RATE_LIMITS = {
  congress_gov: 1100,    // ms between requests
  regulations_gov: 1600,
  federal_register: 600,
  doge_api: 600,
  open_states: 1100,
};

// States to investigate — add new states here to extend the pipeline
const TARGET_STATES = ['MN', 'VA'];

const lastCall = {};
async function rateLimit(source) {
  const delay = RATE_LIMITS[source] || 1000;
  const now = Date.now();
  const last = lastCall[source] || 0;
  const wait = Math.max(0, delay - (now - last));
  if (wait > 0) await sleep(wait);
  lastCall[source] = Date.now();
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ── Logging ────────────────────────────────────────────────────────────────
const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const RED = '\x1b[31m';
const CYAN = '\x1b[36m';
const DIM = '\x1b[2m';

function log(icon, msg) { console.log(`${DIM}${new Date().toISOString().slice(11, 19)}${RESET} ${icon} ${msg}`); }
function ok(msg) { log(`${GREEN}[OK]${RESET}`, msg); }
function info(msg) { log(`${CYAN}[>>]${RESET}`, msg); }
function warn(msg) { log(`${YELLOW}[!!]${RESET}`, msg); }
function fail(msg) { log(`${RED}[ERR]${RESET}`, msg); }
function header(msg) { console.log(`\n${GREEN}${'─'.repeat(60)}${RESET}\n${GREEN}  ${msg}${RESET}\n${GREEN}${'─'.repeat(60)}${RESET}`); }

// ── Supabase helpers ───────────────────────────────────────────────────────
const SB_HEADERS = {
  'apikey': SUPABASE_KEY,
  'Authorization': `Bearer ${SUPABASE_KEY}`,
  'Content-Type': 'application/json',
  'Prefer': 'resolution=merge-duplicates,return=minimal',
};

async function sbGet(table, params = '') {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?${params}`, { headers: SB_HEADERS });
  if (!res.ok) { fail(`Supabase GET ${table}: ${res.status}`); return []; }
  return res.json();
}

async function sbUpsert(table, rows) {
  if (!rows || rows.length === 0) return 0;
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: 'POST',
    headers: SB_HEADERS,
    body: JSON.stringify(rows),
  });
  if (!res.ok) {
    const err = await res.text();
    fail(`Supabase upsert ${table}: ${res.status} — ${err.slice(0, 200)}`);
    return 0;
  }
  return rows.length;
}

async function sbPatch(table, id, updates) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: SB_HEADERS,
    body: JSON.stringify(updates),
  });
  if (!res.ok) {
    const err = await res.text();
    fail(`Supabase PATCH ${table}: ${res.status} — ${err.slice(0, 200)}`);
    return false;
  }
  return true;
}

async function sbLogEnrichment(entityId, source, endpoint, recordsFound, status = 'success', errorMsg = null) {
  await sbUpsert('enrichment_log', [{
    entity_id: entityId,
    source,
    endpoint,
    records_found: recordsFound,
    status,
    error_message: errorMsg,
  }]);
}

// Check if an entity has already been enriched by a given source
// Returns true if a log entry exists (skip this entity)
async function alreadyEnriched(entityId, source) {
  const rows = await sbGet('enrichment_log', `select=id&entity_id=eq.${entityId}&source=eq.${source}&limit=1`);
  return rows.length > 0;
}

// ── API fetchers ───────────────────────────────────────────────────────────

async function fetchJSON(url, headers = {}) {
  try {
    const res = await fetch(url, { headers });
    if (res.status === 429) {
      warn(`Rate limited on ${url.split('?')[0]} — backing off 30s`);
      await sleep(30000);
      const retry = await fetch(url, { headers });
      if (!retry.ok) return null;
      return retry.json();
    }
    if (!res.ok) {
      if (res.status !== 404) fail(`HTTP ${res.status} from ${url.split('?')[0]}`);
      return null;
    }
    return res.json();
  } catch (e) {
    fail(`Fetch error: ${e.message}`);
    return null;
  }
}

// ── 1. Congress.gov — sponsored legislation ────────────────────────────────

async function enrichCongressSponsored(entity, bioguideId) {
  await rateLimit('congress_gov');
  info(`Congress.gov: Sponsored bills for ${entity.canonical_name} (${bioguideId})`);

  const data = await fetchJSON(
    `https://api.congress.gov/v3/member/${bioguideId}/sponsored-legislation?api_key=${CONGRESS_KEY}&limit=50&format=json`
  );
  if (!data?.sponsoredLegislation) {
    warn(`  No sponsored legislation found`);
    await sbLogEnrichment(entity.id, 'congress_gov', 'sponsored-legislation', 0, 'empty');
    return;
  }

  const rows = data.sponsoredLegislation.map(b => ({
    entity_id: entity.id,
    bioguide_id: bioguideId,
    action_type: 'bill_sponsored',
    source: 'congress_gov',
    congress_number: b.congress || null,
    bill_type: b.type?.toLowerCase() || null,
    bill_number: String(b.number || ''),
    bill_title: b.title || null,
    bill_url: b.url || null,
    policy_area: b.policyArea?.name || null,
    action_date: b.introducedDate || null,
    latest_action_text: b.latestAction?.text || null,
    latest_action_date: b.latestAction?.actionDate || null,
    raw_payload: b,
  }));

  const inserted = await sbUpsert('legislative_actions', rows);
  ok(`  ${inserted} sponsored bills inserted`);
  await sbLogEnrichment(entity.id, 'congress_gov', 'sponsored-legislation', inserted);
}

async function enrichCongressCosponsored(entity, bioguideId) {
  await rateLimit('congress_gov');
  info(`Congress.gov: Cosponsored bills for ${entity.canonical_name}`);

  const data = await fetchJSON(
    `https://api.congress.gov/v3/member/${bioguideId}/cosponsored-legislation?api_key=${CONGRESS_KEY}&limit=50&format=json`
  );
  if (!data?.cosponsoredLegislation) {
    warn(`  No cosponsored legislation found`);
    await sbLogEnrichment(entity.id, 'congress_gov', 'cosponsored-legislation', 0, 'empty');
    return;
  }

  const rows = data.cosponsoredLegislation.map(b => ({
    entity_id: entity.id,
    bioguide_id: bioguideId,
    action_type: 'bill_cosponsored',
    source: 'congress_gov',
    congress_number: b.congress || null,
    bill_type: b.type?.toLowerCase() || null,
    bill_number: String(b.number || ''),
    bill_title: b.title || null,
    bill_url: b.url || null,
    policy_area: b.policyArea?.name || null,
    action_date: b.introducedDate || null,
    latest_action_text: b.latestAction?.text || null,
    latest_action_date: b.latestAction?.actionDate || null,
    raw_payload: b,
  }));

  const inserted = await sbUpsert('legislative_actions', rows);
  ok(`  ${inserted} cosponsored bills inserted`);
  await sbLogEnrichment(entity.id, 'congress_gov', 'cosponsored-legislation', inserted);
}

// ── 2. Federal Register — regulatory actions by entity name ────────────────

async function enrichFederalRegister(entity) {
  await rateLimit('federal_register');
  const name = entity.canonical_name;
  info(`Federal Register: searching "${name}"`);

  const encoded = encodeURIComponent(name);
  const data = await fetchJSON(
    `https://www.federalregister.gov/api/v1/documents.json?conditions[term]=${encoded}&per_page=20&order=newest`
  );
  if (!data?.results || data.results.length === 0) {
    warn(`  No Federal Register results`);
    await sbLogEnrichment(entity.id, 'federal_register', 'documents', 0, 'empty');
    return;
  }

  const rows = data.results.map(d => ({
    document_number: d.document_number,
    title: d.title,
    doc_type: d.type,
    subtype: d.subtype || null,
    abstract: d.abstract || null,
    agencies: d.agencies || [],
    publication_date: d.publication_date || null,
    effective_date: d.effective_on || null,
    signing_date: d.signing_date || null,
    docket_ids: d.docket_ids || [],
    cfr_references: d.cfr_references || [],
    html_url: d.html_url || null,
    pdf_url: d.pdf_url || null,
    executive_order_number: d.executive_order_number || null,
    significant: d.significant || false,
    entity_id: entity.id,
    raw_payload: d,
  }));

  const inserted = await sbUpsert('regulatory_actions', rows);
  ok(`  ${inserted} Federal Register docs inserted`);
  await sbLogEnrichment(entity.id, 'federal_register', 'documents', inserted);
}

// ── 3. DOGE API — contracts & grants ───────────────────────────────────────
// Response format: { success: true, result: { contracts: [...] }, meta: { total_results: N } }

async function enrichDogeContracts() {
  header('DOGE API: Loading terminated contracts');
  let page = 1;
  let total = 0;

  while (true) {
    await rateLimit('doge_api');
    const data = await fetchJSON(
      `https://api.doge.gov/savings/contracts?page=${page}&per_page=500`
    );
    const contracts = data?.result?.contracts;
    if (!contracts || contracts.length === 0) break;

    const rows = contracts.map(c => ({
      piid: c.piid || `doge-c-${page}-${Math.random().toString(36).slice(2, 8)}`,
      agency: c.agency || null,
      vendor_name: c.vendor || null,
      vendor_name_normalized: (c.vendor || '').toUpperCase().trim() || null,
      total_value: c.value || null,
      obligated_amount: c.obligated_amount || null,
      claimed_savings: c.savings || null,
      fpds_status: c.fpds_status || null,
      deletion_date: c.deleted_date || null,
      description: c.description || null,
      raw_payload: c,
    }));

    const inserted = await sbUpsert('doge_contracts', rows);
    total += inserted;
    info(`  Page ${page}: ${inserted} contracts (${total} total, API says ${data?.meta?.total_results || '?'} exist)`);
    if (contracts.length < 500) break;
    page++;
  }
  ok(`DOGE contracts complete: ${total} total`);
}

async function enrichDogeGrants() {
  header('DOGE API: Loading terminated grants');
  let page = 1;
  let total = 0;

  while (true) {
    await rateLimit('doge_api');
    const data = await fetchJSON(
      `https://api.doge.gov/savings/grants?page=${page}&per_page=500`
    );
    const grants = data?.result?.grants;
    if (!grants || grants.length === 0) break;

    const rows = grants.map(g => ({
      grant_date: g.date || null,
      agency: g.agency || null,
      recipient_name: g.recipient || null,
      recipient_name_normalized: (g.recipient || '').toUpperCase().trim() || null,
      grant_value: g.value || null,
      claimed_savings: g.savings || null,
      description: g.description || null,
      raw_payload: g,
    }));

    const inserted = await sbUpsert('doge_grants', rows);
    total += inserted;
    info(`  Page ${page}: ${inserted} grants (${total} total, API says ${data?.meta?.total_results || '?'} exist)`);
    if (grants.length < 500) break;
    page++;
  }
  ok(`DOGE grants complete: ${total} total`);
}

// ── 4. Congress.gov — resolve bioguide IDs ─────────────────────────────────
// The ?name= param on Congress.gov is broken (returns all members sorted by updateDate).
// Instead: use known IDs for key targets + state-based member lists for the rest.

const KNOWN_BIOGUIDES = {
  'ilhan omar': { bioguideId: 'O000173', fullName: 'Omar, Ilhan', state: 'Minnesota', party: 'Democratic' },
  'rashida tlaib': { bioguideId: 'T000481', fullName: 'Tlaib, Rashida', state: 'Michigan', party: 'Democratic' },
  'pramila jayapal': { bioguideId: 'J000298', fullName: 'Jayapal, Pramila', state: 'Washington', party: 'Democratic' },
  'andre carson': { bioguideId: 'C001072', fullName: 'Carson, Andre', state: 'Indiana', party: 'Democratic' },
  'keith ellison': { bioguideId: 'E000288', fullName: 'Ellison, Keith', state: 'Minnesota', party: 'Democratic' },
  'lateefah simon': { bioguideId: 'S001232', fullName: 'Simon, Lateefah', state: 'California', party: 'Democratic' },
  'betty mccollum': { bioguideId: 'M001143', fullName: 'McCollum, Betty', state: 'Minnesota', party: 'Democratic' },
  'tom emmer': { bioguideId: 'E000294', fullName: 'Emmer, Tom', state: 'Minnesota', party: 'Republican' },
  'amy klobuchar': { bioguideId: 'K000367', fullName: 'Klobuchar, Amy', state: 'Minnesota', party: 'Democratic' },
  'tina smith': { bioguideId: 'S001203', fullName: 'Smith, Tina', state: 'Minnesota', party: 'Democratic' },
  'angie craig': { bioguideId: 'C001119', fullName: 'Craig, Angie', state: 'Minnesota', party: 'Democratic' },
  'brad finstad': { bioguideId: 'F000475', fullName: 'Finstad, Brad', state: 'Minnesota', party: 'Republican' },
  'michelle fischbach': { bioguideId: 'F000470', fullName: 'Fischbach, Michelle', state: 'Minnesota', party: 'Republican' },
  'pete stauber': { bioguideId: 'S001212', fullName: 'Stauber, Pete', state: 'Minnesota', party: 'Republican' },
  'dean phillips': { bioguideId: 'P000616', fullName: 'Phillips, Dean', state: 'Minnesota', party: 'Democratic' },
  'tim walz': { bioguideId: 'W000799', fullName: 'Walz, Timothy J.', state: 'Minnesota', party: 'Democratic' },
  // ── Virginia delegation ──
  'mark warner': { bioguideId: 'W000805', fullName: 'Warner, Mark R.', state: 'Virginia', party: 'Democratic' },
  'tim kaine': { bioguideId: 'K000384', fullName: 'Kaine, Tim', state: 'Virginia', party: 'Democratic' },
  'rob wittman': { bioguideId: 'W000804', fullName: 'Wittman, Robert J.', state: 'Virginia', party: 'Republican' },
  'robert wittman': { bioguideId: 'W000804', fullName: 'Wittman, Robert J.', state: 'Virginia', party: 'Republican' },
  'jen kiggans': { bioguideId: 'K000399', fullName: 'Kiggans, Jennifer A.', state: 'Virginia', party: 'Republican' },
  'jennifer kiggans': { bioguideId: 'K000399', fullName: 'Kiggans, Jennifer A.', state: 'Virginia', party: 'Republican' },
  'bobby scott': { bioguideId: 'S000185', fullName: 'Scott, Robert C. "Bobby"', state: 'Virginia', party: 'Democratic' },
  'robert scott': { bioguideId: 'S000185', fullName: 'Scott, Robert C. "Bobby"', state: 'Virginia', party: 'Democratic' },
  'jennifer mcclellan': { bioguideId: 'M001227', fullName: 'McClellan, Jennifer L.', state: 'Virginia', party: 'Democratic' },
  'john mcguire': { bioguideId: 'M001239', fullName: 'McGuire, John J. III', state: 'Virginia', party: 'Republican' },
  'ben cline': { bioguideId: 'C001118', fullName: 'Cline, Ben', state: 'Virginia', party: 'Republican' },
  'eugene vindman': { bioguideId: 'V000138', fullName: 'Vindman, Eugene Simon', state: 'Virginia', party: 'Democratic' },
  'don beyer': { bioguideId: 'B001292', fullName: 'Beyer, Donald S. Jr.', state: 'Virginia', party: 'Democratic' },
  'donald beyer': { bioguideId: 'B001292', fullName: 'Beyer, Donald S. Jr.', state: 'Virginia', party: 'Democratic' },
  'morgan griffith': { bioguideId: 'G000568', fullName: 'Griffith, H. Morgan', state: 'Virginia', party: 'Republican' },
  'suhas subramanyam': { bioguideId: 'S001230', fullName: 'Subramanyam, Suhas', state: 'Virginia', party: 'Democratic' },
  'james walkinshaw': { bioguideId: 'W000831', fullName: 'Walkinshaw, James R.', state: 'Virginia', party: 'Democratic' },
  // ── Non-congressional ──
  'tom perez': null, // DNC chair / Maryland AG
  'jacob frey': null, // Minneapolis Mayor
  'danny avula': null, // Richmond Mayor
  'cynthia newbille': null, // Richmond City Council
  'katherine jordan': null, // Richmond City Council
  'andrew breton': null, // Richmond City Council
  'kenya gibson': null, // Richmond City Council
  'sarah abubaker': null, // Richmond City Council
  'stephanie lynch': null, // Richmond City Council
  'ellen robertson': null, // Richmond City Council
  'reva trammell': null, // Richmond City Council
  'nicole jones': null, // Richmond City Council
  'betsy carr': null, // VA House of Delegates (state-level, not federal)
  'rae cousins': null, // VA House of Delegates
  'lamont bagby': null, // VA State Senate
};

// Cache of state member lists so we only fetch once per state
const stateMemberCache = new Map();

async function getStateMembers(state) {
  if (stateMemberCache.has(state)) return stateMemberCache.get(state);
  await rateLimit('congress_gov');
  // Try current congress (119th) first
  const data = await fetchJSON(
    `https://api.congress.gov/v3/member/congress/119/${state}?api_key=${CONGRESS_KEY}&limit=50&format=json`
  );
  const members = data?.members || [];
  // Also try 118th for recently departed members
  await rateLimit('congress_gov');
  const data2 = await fetchJSON(
    `https://api.congress.gov/v3/member/congress/118/${state}?api_key=${CONGRESS_KEY}&limit=50&format=json`
  );
  const all = [...members, ...(data2?.members || [])];
  // Deduplicate by bioguideId
  const deduped = new Map();
  for (const m of all) deduped.set(m.bioguideId, m);
  const result = Array.from(deduped.values());
  stateMemberCache.set(state, result);
  return result;
}

function normalizeForMatch(name) {
  return name.toLowerCase().replace(/[^a-z ]/g, '').trim();
}

async function findBioguideId(name) {
  const nameKey = normalizeForMatch(name);

  // Check known IDs first (no API call needed)
  if (nameKey in KNOWN_BIOGUIDES) {
    return KNOWN_BIOGUIDES[nameKey]; // may be null for non-congress people
  }

  // Try matching against target state members
  const nameParts = nameKey.split(/\s+/);
  const lastName = nameParts[nameParts.length - 1];
  const firstName = nameParts[0];

  for (const state of TARGET_STATES) {
    const members = await getStateMembers(state);
    for (const m of members) {
      const mName = normalizeForMatch(m.name || '');
      // Congress.gov uses "LastName, FirstName" format
      if (mName.includes(lastName) && mName.includes(firstName)) {
        return { bioguideId: m.bioguideId, fullName: m.name, state: m.state, party: m.partyName };
      }
    }
  }

  // No match — this person is probably not a congress member
  return null;
}

// ── 5. Open States — state legislator bills ────────────────────────────────

async function enrichOpenStates(entity) {
  const name = entity.canonical_name;
  const entityState = entity.metadata?.state || null;

  // Determine which state jurisdictions to search
  const statesToSearch = entityState
    ? [entityState.toLowerCase()]
    : TARGET_STATES.map(s => s.toLowerCase());

  let data = null;
  for (const st of statesToSearch) {
    await rateLimit('open_states');
    info(`Open States: searching people "${name}" in ${st.toUpperCase()}`);
    const encoded = encodeURIComponent(name);
    const result = await fetchJSON(
      `https://v3.openstates.org/people?name=${encoded}&jurisdiction=ocd-jurisdiction/country:us/state:${st}/government`,
      { 'X-API-KEY': OPEN_STATES_KEY }
    );
    if (result?.results && result.results.length > 0) {
      data = result;
      break;
    }
  }

  if (!data?.results || data.results.length === 0) {
    await sbLogEnrichment(entity.id, 'open_states', 'people', 0, 'empty');
    return;
  }

  const person = data.results[0];
  ok(`  Found: ${person.name} (${person.current_role?.title || 'unknown role'})`);

  // Save the Open States ID crosswalk
  await sbUpsert('politician_ids', [{
    entity_id: entity.id,
    id_type: 'open_states',
    id_value: person.id,
    source: 'open_states',
  }]);

  // Derive jurisdiction from the person's ID (e.g. ocd-person/... contains state in jurisdiction)
  // Use the person's jurisdiction or fall back to matching from current_role
  const personJurisdiction = person.jurisdiction?.id
    || person.current_role?.org_classification && `ocd-jurisdiction/country:us/state:${(person.current_role?.district || '').split('/')[0] || 'mn'}/government`
    || `ocd-jurisdiction/country:us/state:${(entityState || 'mn').toLowerCase()}/government`;

  // Now get their bills
  await rateLimit('open_states');
  const bills = await fetchJSON(
    `https://v3.openstates.org/bills?sponsor=${encodeURIComponent(person.id)}&jurisdiction=${encodeURIComponent(personJurisdiction)}&per_page=50`,
    { 'X-API-KEY': OPEN_STATES_KEY }
  );
  if (!bills?.results || bills.results.length === 0) {
    warn(`  No state bills found`);
    await sbLogEnrichment(entity.id, 'open_states', 'bills', 0, 'empty');
    return;
  }

  const rows = bills.results.map(b => ({
    entity_id: entity.id,
    action_type: 'bill_sponsored',
    source: 'open_states',
    bill_type: b.identifier?.split(' ')[0]?.toLowerCase() || null,
    bill_number: b.identifier || null,
    bill_title: b.title || null,
    bill_url: b.openstates_url || null,
    action_date: b.created_at?.slice(0, 10) || null,
    latest_action_text: b.latest_action_description || null,
    latest_action_date: b.latest_action_date || null,
    subjects: b.subject || [],
    raw_payload: b,
  }));

  const inserted = await sbUpsert('legislative_actions', rows);
  ok(`  ${inserted} state bills inserted`);
  await sbLogEnrichment(entity.id, 'open_states', 'bills', inserted);
}

// ── 6. Regulations.gov — comments by entity name ──────────────────────────

async function enrichRegulations(entity) {
  await rateLimit('regulations_gov');
  const name = entity.canonical_name;
  info(`Regulations.gov: searching "${name}"`);

  const encoded = encodeURIComponent(name);
  const data = await fetchJSON(
    `https://api.regulations.gov/v4/documents?filter%5BsearchTerm%5D=${encoded}&filter%5BdocumentType%5D=Rule&page%5Bsize%5D=10&api_key=${REGULATIONS_KEY}`
  );
  if (!data?.data || data.data.length === 0) {
    await sbLogEnrichment(entity.id, 'regulations_gov', 'documents', 0, 'empty');
    return;
  }

  const rows = data.data.map(d => ({
    document_id: d.id,
    docket_id: d.attributes?.docketId || null,
    commenter_name: null,
    organization: null,
    agency_id: d.attributes?.agencyId || null,
    title: d.attributes?.title || null,
    posted_date: d.attributes?.postedDate?.slice(0, 10) || null,
    document_type: d.attributes?.documentType || null,
    entity_id: entity.id,
    raw_payload: d,
  }));

  const inserted = await sbUpsert('regulatory_comments', rows);
  ok(`  ${inserted} regulatory docs inserted`);
  await sbLogEnrichment(entity.id, 'regulations_gov', 'documents', inserted);
}

// ── MAIN ───────────────────────────────────────────────────────────────────

async function main() {
  console.log(`
${GREEN}╔══════════════════════════════════════════════════════════╗
║          GRIFTFINDER ENRICHMENT PIPELINE                 ║
║          Rate-limited • Realtime • Idempotent            ║
╚══════════════════════════════════════════════════════════╝${RESET}
`);

  // Load existing entities
  header('Loading existing data from Supabase');
  let entities = await sbGet('entities', 'select=*&limit=500');
  const politicians = await sbGet('politician_universe', 'select=*&limit=500');
  ok(`${entities.length} entities loaded`);
  ok(`${politicians.length} politicians loaded`);

  // ── Phase 0: Bootstrap — ensure all known targets exist as entities ──────
  header(`PHASE 0: Bootstrap Missing Targets (${TARGET_STATES.join(', ')})`);
  const existingNames = new Set(entities.map(e => normalizeForMatch(e.canonical_name)));
  const BOOTSTRAP_TARGETS = [
    // ── Minnesota ──
    { name: 'Angie Craig', state: 'MN', party: 'D', district: '2nd' },
    { name: 'Brad Finstad', state: 'MN', party: 'R', district: '1st' },
    { name: 'Michelle Fischbach', state: 'MN', party: 'R', district: '7th' },
    { name: 'Pete Stauber', state: 'MN', party: 'R', district: '8th' },
    { name: 'Dean Phillips', state: 'MN', party: 'D', district: '3rd' },
    { name: 'Tim Walz', state: 'MN', party: 'D', district: 'Governor (former CD-1)' },
    // ── Virginia ──
    { name: 'Mark Warner', state: 'VA', party: 'D', district: 'Senate' },
    { name: 'Tim Kaine', state: 'VA', party: 'D', district: 'Senate' },
    { name: 'Rob Wittman', state: 'VA', party: 'R', district: '1st' },
    { name: 'Jen Kiggans', state: 'VA', party: 'R', district: '2nd' },
    { name: 'Bobby Scott', state: 'VA', party: 'D', district: '3rd' },
    { name: 'Jennifer McClellan', state: 'VA', party: 'D', district: '4th' },
    { name: 'John McGuire', state: 'VA', party: 'R', district: '5th' },
    { name: 'Ben Cline', state: 'VA', party: 'R', district: '6th' },
    { name: 'Eugene Vindman', state: 'VA', party: 'D', district: '7th' },
    { name: 'Don Beyer', state: 'VA', party: 'D', district: '8th' },
    { name: 'Morgan Griffith', state: 'VA', party: 'R', district: '9th' },
    { name: 'Suhas Subramanyam', state: 'VA', party: 'D', district: '10th' },
    { name: 'James Walkinshaw', state: 'VA', party: 'D', district: '11th' },
    // ── Richmond, VA — City Officials ──
    { name: 'Danny Avula', state: 'VA', party: 'D', district: 'Richmond Mayor' },
    { name: 'Cynthia Newbille', state: 'VA', party: 'D', district: 'Richmond Council 7th (President)' },
    { name: 'Katherine Jordan', state: 'VA', party: 'D', district: 'Richmond Council 2nd (VP)' },
    { name: 'Andrew Breton', state: 'VA', party: 'D', district: 'Richmond Council 1st' },
    { name: 'Kenya Gibson', state: 'VA', party: 'D', district: 'Richmond Council 3rd' },
    { name: 'Sarah Abubaker', state: 'VA', party: 'D', district: 'Richmond Council 4th' },
    { name: 'Stephanie Lynch', state: 'VA', party: 'D', district: 'Richmond Council 5th' },
    { name: 'Ellen Robertson', state: 'VA', party: 'D', district: 'Richmond Council 6th' },
    { name: 'Reva Trammell', state: 'VA', party: 'D', district: 'Richmond Council 8th' },
    { name: 'Nicole Jones', state: 'VA', party: 'D', district: 'Richmond Council 9th' },
    // ── Richmond, VA — State Legislators ──
    { name: 'Betsy Carr', state: 'VA', party: 'D', district: 'VA House 78th' },
    { name: 'Rae Cousins', state: 'VA', party: 'D', district: 'VA House 79th' },
    { name: 'Lamont Bagby', state: 'VA', party: 'D', district: 'VA Senate 14th' },
  ];
  let bootstrapped = 0;
  for (const t of BOOTSTRAP_TARGETS) {
    if (existingNames.has(normalizeForMatch(t.name))) {
      info(`${t.name} already exists in entities`);
      continue;
    }
    const row = {
      canonical_name: t.name,
      normalized_name: normalizeForMatch(t.name),
      entity_type: 'person',
      aliases: [],
      metadata: { state: t.state, party: t.party, district: t.district, bootstrap: true },
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    const inserted = await sbUpsert('entities', [row]);
    if (inserted > 0) {
      ok(`Bootstrapped entity: ${t.name} (${t.party}-${t.state})`);
      bootstrapped++;
    }
  }
  if (bootstrapped > 0) {
    ok(`${bootstrapped} new entities bootstrapped — reloading entity list`);
    entities = await sbGet('entities', 'select=*&limit=500');
  } else {
    ok('All targets already present');
  }

  // Identify politician entities (people who might be in Congress)
  const personEntities = entities.filter(e => e.entity_type === 'person');
  ok(`${personEntities.length} person entities to enrich`);

  // ── Phase 1: DOGE data (global, not per-entity) ─────────────────────────
  // Skip if data already exists in Supabase — no need to re-download 30k records every run
  header('PHASE 1: DOGE Data Ingestion');
  const existingContracts = await sbGet('doge_contracts', 'select=id&limit=1');
  const existingGrants = await sbGet('doge_grants', 'select=id&limit=1');
  if (existingContracts.length > 0 && existingGrants.length > 0) {
    ok('DOGE data already in Supabase — skipping download (delete rows to force re-fetch)');
  } else {
    if (existingContracts.length === 0) await enrichDogeContracts();
    if (existingGrants.length === 0) await enrichDogeGrants();
  }

  // ── Phase 2: Resolve bioguide IDs for known politicians ─────────────────
  header('PHASE 2: Congress.gov — Resolve Bioguide IDs');
  const bioguideMap = new Map(); // entity_id -> bioguideId
  let skipped = 0;

  for (const entity of personEntities) {
    const match = await findBioguideId(entity.canonical_name);
    if (match) {
      ok(`${entity.canonical_name} → ${match.bioguideId} (${match.fullName}, ${match.state} ${match.party})`);
      bioguideMap.set(entity.id, match.bioguideId);

      // Save crosswalk
      await sbUpsert('politician_ids', [{
        entity_id: entity.id,
        id_type: 'bioguide',
        id_value: match.bioguideId,
        source: 'congress_gov',
      }]);
    } else {
      skipped++;
      info(`${entity.canonical_name} — not a federal legislator, skipping Congress.gov`);
    }
  }
  ok(`Resolved ${bioguideMap.size} bioguide IDs (${skipped} non-congressional people skipped)`);

  // ── Phase 3: Congressional legislation per entity ───────────────────────
  header('PHASE 3: Congress.gov — Sponsored & Cosponsored Legislation');
  let p3Skipped = 0;
  for (const [entityId, bioguideId] of bioguideMap) {
    const entity = entities.find(e => e.id === entityId);
    if (!entity) continue;
    if (await alreadyEnriched(entityId, 'congress_gov')) {
      p3Skipped++;
      continue;
    }
    try {
      await enrichCongressSponsored(entity, bioguideId);
      await enrichCongressCosponsored(entity, bioguideId);
    } catch (e) {
      fail(`Congress enrichment error for ${entity.canonical_name}: ${e.message}`);
    }
  }
  if (p3Skipped) ok(`Skipped ${p3Skipped} already-enriched entities`);

  // ── Phase 4: Federal Register per entity ────────────────────────────────
  header('PHASE 4: Federal Register — Regulatory Actions');
  let p4Skipped = 0;
  for (const entity of personEntities) {
    if (await alreadyEnriched(entity.id, 'federal_register')) {
      p4Skipped++;
      continue;
    }
    try {
      await enrichFederalRegister(entity);
    } catch (e) {
      fail(`Federal Register error for ${entity.canonical_name}: ${e.message}`);
    }
  }
  if (p4Skipped) ok(`Skipped ${p4Skipped} already-enriched entities`);

  // ── Phase 5: Open States (MN state legislators) ─────────────────────────
  header(`PHASE 5: Open States — State Legislators (${TARGET_STATES.join(', ')})`);

  // Filter out entities that are clearly not legislators (family members, unnamed people, orgs, etc.)
  const NON_LEGISLATOR_PATTERNS = [
    /not disclosed/i, /\bunknown\b/i, /\bsibling/i, /\bbrother\b/i, /\bsister\b/i,
    /\bdaughter\b/i, /\bson\b/i, /\bmother\b/i, /\bfather\b/i, /\bwife\b/i, /\bhusband\b/i,
    /\bspouse\b/i, /\bchild/i, /\bfamily\b/i, /\btotal,?\s*names?\b/i,
    /\byounger\b/i, /\bolder\b/i, /\belder\b/i, /\bminor\b/i,
    /\bllc\b/i, /\binc\b/i, /\bcorp\b/i, /\bfoundation\b/i, /\bcommittee\b/i,
    /\bgroup\b/i, /\bpartners\b/i, /\bassociates\b/i, /\bconsulting\b/i,
  ];
  function isPlausibleLegislator(name) {
    if (!name || name.length < 4) return false;
    // Must have at least a first and last name (2+ words)
    if (name.trim().split(/\s+/).length < 2) return false;
    return !NON_LEGISLATOR_PATTERNS.some(p => p.test(name));
  }

  const legislatorCandidates = personEntities.filter(e => isPlausibleLegislator(e.canonical_name));
  const p5Filtered = personEntities.length - legislatorCandidates.length;
  if (p5Filtered) ok(`Filtered out ${p5Filtered} non-legislator entities`);

  let p5Skipped = 0;
  for (const entity of legislatorCandidates) {
    if (await alreadyEnriched(entity.id, 'open_states')) {
      p5Skipped++;
      continue;
    }
    try {
      await enrichOpenStates(entity);
    } catch (e) {
      fail(`Open States error for ${entity.canonical_name}: ${e.message}`);
    }
  }
  if (p5Skipped) ok(`Skipped ${p5Skipped} already-enriched entities`);

  // ── Phase 6: Regulations.gov per entity ─────────────────────────────────
  header('PHASE 6: Regulations.gov — Regulatory Documents');
  let p6Skipped = 0;
  for (const entity of entities) {
    if (await alreadyEnriched(entity.id, 'regulations_gov')) {
      p6Skipped++;
      continue;
    }
    try {
      await enrichRegulations(entity);
    } catch (e) {
      fail(`Regulations.gov error for ${entity.canonical_name}: ${e.message}`);
    }
  }
  if (p6Skipped) ok(`Skipped ${p6Skipped} already-enriched entities`);

  // ── Phase 7: Cross-reference DOGE vendors with existing entities ────────
  header('PHASE 7: DOGE Cross-Reference');
  const dogeContracts = await sbGet('doge_contracts', 'select=id,vendor_name_normalized&entity_id=is.null&limit=5000');
  info(`${dogeContracts.length} unmatched DOGE contracts to cross-reference`);

  let dogeMatches = 0;
  const entityNamesNorm = new Map(entities.map(e => [e.canonical_name.toUpperCase().trim(), e.id]));

  for (const dc of dogeContracts) {
    if (!dc.vendor_name_normalized) continue;
    // Check for exact or partial match
    for (const [eName, eId] of entityNamesNorm) {
      if (dc.vendor_name_normalized.includes(eName) || eName.includes(dc.vendor_name_normalized)) {
        await sbPatch('doge_contracts', dc.id, { entity_id: eId });
        ok(`  DOGE match: "${dc.vendor_name_normalized}" → entity ${eName}`);
        dogeMatches++;
        break;
      }
    }
  }
  ok(`${dogeMatches} DOGE vendor-entity matches found`);

  // ── Summary ─────────────────────────────────────────────────────────────
  header('ENRICHMENT COMPLETE');
  const legActions = await sbGet('legislative_actions', 'select=id&limit=1&order=id', true);
  const regActions = await sbGet('regulatory_actions', 'select=id&limit=1&order=id', true);
  const dContracts = await sbGet('doge_contracts', 'select=id&limit=1&order=id', true);
  const dGrants = await sbGet('doge_grants', 'select=id&limit=1&order=id', true);
  const polIds = await sbGet('politician_ids', 'select=id&limit=1&order=id', true);

  // Get counts
  const counts = await Promise.all([
    sbGet('legislative_actions', 'select=id&limit=10000'),
    sbGet('regulatory_actions', 'select=id&limit=10000'),
    sbGet('doge_contracts', 'select=id&limit=10000'),
    sbGet('doge_grants', 'select=id&limit=10000'),
    sbGet('politician_ids', 'select=id&limit=10000'),
    sbGet('enrichment_log', 'select=id&limit=10000'),
  ]);

  console.log(`
${GREEN}Results:${RESET}
  Legislative actions:  ${counts[0].length}
  Regulatory actions:   ${counts[1].length}
  DOGE contracts:       ${counts[2].length}
  DOGE grants:          ${counts[3].length}
  Politician IDs:       ${counts[4].length}
  Enrichment log:       ${counts[5].length}
`);
}

main().catch(e => { fail(`Fatal: ${e.message}`); process.exit(1); });
