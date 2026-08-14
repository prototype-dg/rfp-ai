// Two-phase parallel RFP generation simulation
// Node 22 — uses built-in fetch

const fs = require('fs');

let API_KEY = process.env.OPENAI_API_KEY || '';
let BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1';
const TOKEN = process.env.GENSPARK_TOKEN || '';
if (API_KEY.includes('GENSPARK_TOKEN') || !API_KEY) API_KEY = TOKEN;

const MODEL = 'gpt-5-mini';

console.log(`API_KEY prefix: ${API_KEY.slice(0,14)}...`);
console.log(`BASE_URL: ${BASE_URL}`);

const RFP = {
  title: 'Data Platform Modernization',
  ref: 'AND/PROC/2026/5499',
  budget: 'USD 2,000,000',
  deadline: '2026-09-13',
  issuer: 'Andersen Software Engineering Group, Warsaw',
  background: `Entity O is being established as a fully segregated Operating Unit within the Crown Prince's Court 
Oracle ERP environment. Data is fragmented across Oracle EBS, MSSQL Time & Attendance, and flat files. 
No central warehouse. Management relies on static BI Publisher reports; finance/HR reconcile spreadsheets manually. 
Strictly on-premise deployment mandated for data sovereignty (Secret/Confidential classification).`,
  objectives: `1. Centralized governed data warehouse aligned with CPC enterprise architecture.
2. Advanced reporting and self-service BI using Tableau.
3. Secure integration of source systems; future AI-readiness.
4. Metadata management, RBAC, and lineage tracking.`,
  scope: `1. Architecture & Build: Medallion architecture (Bronze/Silver/Gold), batch and incremental ETL/ELT pipelines.
2. Data Migration: ~1TB from Oracle EBS, MSSQL T&A, Short Visit DB.
3. BI: Tableau Server on-prem, integrated with Active Directory.
4. Dashboards: 7 core management dashboards + 41 reports (Finance, HR, Procurement).
5. Governance: Data catalog, automated lineage, row/column-level security.
6. Enablement: Training (Admin/Analyst/Business) + SOPs.`,
  tech: `1. Strictly On-Premise (CPC Data Center). No cloud.
2. Active Directory integration. Granular RBAC (row/value level). Secret/Confidential.
3. Separated storage and compute.
4. Open-source, license-free core stack — enterprise-grade.
5. Non-disruptive Oracle SOA integration.
6. Tableau as BI tool.`,
  scoring: [
    {c:'Technical Approach & Methodology', w:30},
    {c:'Functional Fit & Solution Quality', w:25},
    {c:'Team Qualifications & Experience', w:20},
    {c:'Financial Proposal', w:15},
    {c:'Implementation Plan & Timeline', w:10},
  ]
};

const SECTIONS = [
  '1. PROJECT BACKGROUND AND CONTEXT',
  '2. PROJECT OBJECTIVES',
  '3. SCOPE OF WORK',
  '4. TECHNICAL REQUIREMENTS AND ARCHITECTURE',
  '5. EVALUATION CRITERIA',
  '6. VENDOR QUALIFICATION REQUIREMENTS',
  '7. SUBMISSION REQUIREMENTS AND TIMELINE',
  '8. TERMS AND CONDITIONS',
];

async function callLLM(system, user, label) {
  const t0 = Date.now();
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model: MODEL, temperature: 0.3,
      messages: [{ role:'system', content:system }, { role:'user', content:user }] }),
  });
  const data = await res.json();
  const elapsed = (Date.now() - t0) / 1000;
  if (!data.choices) throw new Error(`No choices: ${JSON.stringify(data).slice(0,300)}`);
  const content = data.choices[0].message.content;
  const tok = data.usage?.completion_tokens || 0;
  console.log(`  [${label.slice(0,38)}] ${elapsed.toFixed(1)}s | ${tok} tokens | ${content.length} chars`);
  return { content, elapsed };
}

async function phase1() {
  console.log('\n═══ PHASE 1: Outline ═══');
  const t0 = Date.now();
  const system = `Senior procurement consultant. Produce a detailed RFP outline as a shared blueprint for parallel section writers.
Define ALL canonical terms, key figures, dates. Output ONLY valid JSON — no markdown fences.`;
  const user = `RFP: ${RFP.title} | Ref: ${RFP.ref} | Issuer: ${RFP.issuer} | Budget: ${RFP.budget} | Deadline: ${RFP.deadline}
BACKGROUND: ${RFP.background}
OBJECTIVES: ${RFP.objectives}
SCOPE: ${RFP.scope}
TECH: ${RFP.tech}
SCORING: ${JSON.stringify(RFP.scoring)}

Output JSON:
{
  "canonical_terms": { "key": "Exact Name To Use Everywhere" },
  "key_figures": { "key": "exact value" },
  "sections": [
    { "number":"1", "title":"PROJECT BACKGROUND AND CONTEXT",
      "key_points":["..."], "cross_refs":["..."], "approx_length":"3-4 paragraphs" }
  ],
  "appendices": [{ "id":"A", "title":"...", "content_summary":"..." }]
}`;

  const { content, elapsed } = await callLLM(system, user, 'OUTLINE');
  let outline;
  try {
    let c = content.trim().replace(/^```[a-z]*\n?/, '').replace(/\n?```$/, '');
    outline = JSON.parse(c);
    const t = Object.keys(outline.canonical_terms||{}).length;
    const f = Object.keys(outline.key_figures||{}).length;
    const s = (outline.sections||[]).length;
    console.log(`  Parsed OK — ${t} terms, ${f} figures, ${s} sections`);
  } catch(e) {
    console.log(`  Parse warning: ${e.message}`);
    outline = { raw: content, parse_error: true };
  }
  console.log(`  Phase 1 done: ${((Date.now()-t0)/1000).toFixed(1)}s`);
  return { outline, elapsed: (Date.now()-t0)/1000 };
}

async function phase2(outline) {
  console.log('\n═══ PHASE 2: 8 sections in parallel ═══');
  const t0 = Date.now();
  const ctx = outline.parse_error
    ? outline.raw.slice(0,3000)
    : JSON.stringify(outline, null, 2).slice(0,3500);

  const system = `Professional procurement writer. Generate ONE assigned section of a formal RFP.
RULES: Use ONLY canonical terms and figures from the shared outline. No invented names/numbers.
Do NOT include headings for other sections. Formal procurement English. 3-6 paragraphs or structured subsections.`;

  const tasks = SECTIONS.map(async (sec) => {
    let brief = '';
    if (!outline.parse_error) {
      const num = sec.split('.')[0].trim();
      const found = (outline.sections||[]).find(s => String(s.number) === num);
      if (found) brief = `\nSection brief: ${JSON.stringify(found)}`;
    }
    const user = `SHARED OUTLINE:\n${ctx}\n\nASSIGNED SECTION: ${sec}${brief}\n\nWrite this section now. Start directly with content (no title header needed).`;
    const { content, elapsed } = await callLLM(system, user, sec);
    return { title: sec, content, elapsed };
  });

  const sections = await Promise.all(tasks);
  const wall = (Date.now()-t0)/1000;
  console.log(`  Phase 2 wall clock: ${wall.toFixed(1)}s`);
  return { sections, elapsed: wall };
}

function qualityCheck(outline, sections) {
  console.log('\n═══ QUALITY ANALYSIS ═══');
  if (outline.parse_error) { console.log('  ⚠ outline parse error'); return; }

  const canonical = outline.canonical_terms || {};
  const figures   = outline.key_figures    || {};

  console.log(`\n  Canonical terms (${Object.keys(canonical).length}):`);
  Object.entries(canonical).forEach(([k,v]) => console.log(`    · ${k}: "${v}"`));

  console.log(`\n  Key figures (${Object.keys(figures).length}):`);
  Object.entries(figures).forEach(([k,v]) => console.log(`    · ${k}: "${v}"`));

  console.log('\n  Term usage across sections:');
  let ok=0, total=0;
  Object.entries(canonical).forEach(([k,v]) => {
    total++;
    const root = v.toLowerCase().split('(')[0].trim().split(' ').slice(0,3).join(' ');
    const count = sections.filter(s => s.content.toLowerCase().includes(root)).length;
    const sym = count >= 1 ? '✅' : '⚠ ';
    if (count >= 1) ok++;
    console.log(`    ${sym} "${v}" → ${count}/${sections.length} sections`);
  });
  console.log(`  Score: ${ok}/${total} terms consistent`);

  console.log('\n  Opening paragraph duplication:');
  let dup = false;
  for (let i=0; i<sections.length; i++) for (let j=i+1; j<sections.length; j++) {
    const w1 = new Set(sections[i].content.slice(0,300).toLowerCase().split(/\s+/).filter(w=>w.length>4));
    const w2 = new Set(sections[j].content.slice(0,300).toLowerCase().split(/\s+/).filter(w=>w.length>4));
    const inter = [...w1].filter(w=>w2.has(w)).length;
    const ratio = inter / Math.max(w1.size,1);
    if (ratio > 0.55) {
      console.log(`    ⚠ ${(ratio*100).toFixed(0)}% overlap: "${sections[i].title.slice(0,28)}" ↔ "${sections[j].title.slice(0,28)}"`);
      dup = true;
    }
  }
  if (!dup) console.log('    ✅ No significant duplication detected');
}

async function main() {
  console.log('='.repeat(62));
  console.log('  Option A: Two-Phase Parallel RFP — SIMULATION');
  console.log(`  Source: RFP 11 — ${RFP.title} (${RFP.ref})`);
  console.log('='.repeat(62));
  const wall0 = Date.now();

  const { outline, elapsed: t1 } = await phase1();
  const { sections, elapsed: t2 } = await phase2(outline);

  qualityCheck(outline, sections);

  console.log('\n═══ SECTION PREVIEWS (first 500 chars each) ═══');
  let totalChars = 0;
  sections.forEach(({title, content, elapsed}) => {
    totalChars += content.length;
    console.log(`\n${'─'.repeat(58)}`);
    console.log(`  ${title}  (${elapsed.toFixed(1)}s | ${content.length} chars)`);
    console.log('─'.repeat(58));
    console.log(content.slice(0,500) + (content.length > 500 ? '\n  [...]' : ''));
  });

  const wallTotal = (Date.now()-wall0)/1000;
  const seqSum = sections.reduce((a,s) => a+s.elapsed, 0);

  console.log(`\n${'═'.repeat(62)}`);
  console.log('  TIMING SUMMARY');
  console.log(`  Phase 1 — Outline:               ${t1.toFixed(1)}s`);
  console.log(`  Phase 2 — ${SECTIONS.length} sections parallel:   ${t2.toFixed(1)}s  (wall clock)`);
  console.log(`  Total:                            ${wallTotal.toFixed(1)}s`);
  console.log(`  + PDF render (VPS):               ~12s`);
  console.log(`  Projected end-to-end:             ~${Math.ceil(wallTotal+12)}s`);
  console.log('─'.repeat(62));
  console.log(`  Sequential equivalent (sum):      ${seqSum.toFixed(1)}s`);
  console.log(`  Parallelism speedup:              ${(seqSum/t2).toFixed(1)}x`);
  console.log(`  Total content:                    ${totalChars.toLocaleString()} chars`);
  console.log(`${'═'.repeat(62)}`);

  fs.writeFileSync('/home/user/webapp/sim_output.json',
    JSON.stringify({outline, sections, timing:{phase1:t1,phase2:t2,total:wallTotal}}, null, 2));
  console.log('\n  Full output → /home/user/webapp/sim_output.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
