export async function initDb(db: D1Database) {
  const statements = [
    // RFPs - multi-RFP support, richer fields
    `CREATE TABLE IF NOT EXISTS rfps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ref_number TEXT,
      title TEXT,
      category TEXT,
      budget TEXT,
      deadline TEXT,
      scope TEXT,
      tech_requirements TEXT,
      objectives TEXT,
      background TEXT,
      content TEXT,
      stage TEXT DEFAULT 'draft',
      created_at TEXT,
      updated_at TEXT
    )`,
    // Vendors - global pool (not per-RFP)
    `CREATE TABLE IF NOT EXISTS vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      category TEXT,
      country TEXT,
      size TEXT,
      contact_name TEXT,
      contact_email TEXT,
      specializations TEXT,
      certifications TEXT,
      erp_experience TEXT,
      fit_score INTEGER,
      fit_rationale TEXT,
      registered_at TEXT DEFAULT (datetime('now'))
    )`,
    // Per-RFP vendor shortlisting
    `CREATE TABLE IF NOT EXISTS rfp_vendors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfp_id INTEGER NOT NULL,
      vendor_id INTEGER NOT NULL,
      shortlisted INTEGER DEFAULT 0,
      fit_score INTEGER,
      fit_rationale TEXT,
      UNIQUE(rfp_id, vendor_id)
    )`,
    // Questions per RFP — includes source column to track origin (vendor_email | manual | ai)
    `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfp_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT,
      vendor_id INTEGER,
      published INTEGER DEFAULT 0,
      source TEXT DEFAULT 'manual',
      created_at TEXT
    )`,
    // Proposals per RFP — is_real_submission distinguishes Andersen (real) from simulated vendors
    `CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfp_id INTEGER NOT NULL,
      vendor_id INTEGER,
      technical_proposal TEXT,
      financial_proposal REAL,
      technical_score REAL,
      status TEXT DEFAULT 'submitted',
      is_real_submission INTEGER DEFAULT 0,
      created_at TEXT
    )`,
    // Evaluations per proposal — 3-dimension scoring: business / technical / financial
    `CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfp_id INTEGER NOT NULL,
      proposal_id INTEGER,
      vendor_id INTEGER,
      business_score REAL,
      technical_score REAL,
      financial_score REAL,
      experience_score REAL,
      total_score REAL,
      ai_summary TEXT,
      created_at TEXT
    )`,
    // Recommendations per RFP
    `CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfp_id INTEGER NOT NULL,
      top_vendor TEXT,
      rankings_json TEXT,
      summary TEXT,
      created_at TEXT
    )`,
    // Email log per RFP — has_pdf tracks whether invitation email had RFP PDF attached
    `CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfp_id INTEGER NOT NULL,
      vendor_id INTEGER,
      recipient TEXT,
      subject TEXT,
      body TEXT,
      email_type TEXT,
      status TEXT DEFAULT 'simulated',
      has_pdf INTEGER DEFAULT 0,
      created_at TEXT
    )`,
    // Scoring models per RFP — stores the full 3-dimension JSON model
    `CREATE TABLE IF NOT EXISTS scoring_models (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      rfp_id INTEGER NOT NULL,
      model_json TEXT,
      created_at TEXT
    )`,
  ]
  for (const sql of statements) {
    await db.prepare(sql).run()
  }

  // ALTER TABLE migrations — safely add columns that may not exist in older deployments
  // These are no-ops if the column already exists (SQLite does not support IF NOT EXISTS for columns)
  const alterMigrations = [
    // questions.source
    `ALTER TABLE questions ADD COLUMN source TEXT DEFAULT 'manual'`,
    // proposals.is_real_submission
    `ALTER TABLE proposals ADD COLUMN is_real_submission INTEGER DEFAULT 0`,
    // evaluations.business_score
    `ALTER TABLE evaluations ADD COLUMN business_score REAL`,
    // email_log.has_pdf
    `ALTER TABLE email_log ADD COLUMN has_pdf INTEGER DEFAULT 0`,
    // email_log.from_email — sender address of inbound emails
    `ALTER TABLE email_log ADD COLUMN from_email TEXT`,
    // email_log.email_body_html — full HTML body of received email
    `ALTER TABLE email_log ADD COLUMN email_body_html TEXT`,
    // email_log.has_attachment — whether there was an Excel/file attachment
    `ALTER TABLE email_log ADD COLUMN has_attachment INTEGER DEFAULT 0`,
    // email_log.resend_email_id — Resend's email_id for the received email
    `ALTER TABLE email_log ADD COLUMN resend_email_id TEXT`,
    // questions.email_log_id — link question to the inbound email that contained it
    `ALTER TABLE questions ADD COLUMN email_log_id INTEGER`,
    // questions.needs_manual — 1 if LLM could not confidently answer; requires manual entry
    `ALTER TABLE questions ADD COLUMN needs_manual INTEGER DEFAULT 0`,
    // rfps.arch_doc_text — extracted text from uploaded Conceptual Solution Architecture PDF
    `ALTER TABLE rfps ADD COLUMN arch_doc_text TEXT`,
    // rfps.brd_doc_text — extracted text from uploaded Business Requirements Document PDF
    `ALTER TABLE rfps ADD COLUMN brd_doc_text TEXT`,
    // proposals.proposed_duration — vendor's stated project duration from their proposal
    `ALTER TABLE proposals ADD COLUMN proposed_duration TEXT`,
    // proposals.pdf_attachment_url — URL/base64 of the received PDF proposal attachment
    `ALTER TABLE proposals ADD COLUMN pdf_attachment_url TEXT`,
    // proposals.pdf_filename — original filename of the PDF attachment
    `ALTER TABLE proposals ADD COLUMN pdf_filename TEXT`,
    // evaluations.scoring_details_json — JSON array of per-criterion scoring with justifications
    `ALTER TABLE evaluations ADD COLUMN scoring_details_json TEXT`,
    // evaluations.is_real — 1 if this is a real LLM evaluation (Andersen), 0 if simulated
    `ALTER TABLE evaluations ADD COLUMN is_real INTEGER DEFAULT 0`,
    // email_log.email_category — AI-classified category: 'questions'|'proposal'|'plain_email'|'decline'
    `ALTER TABLE email_log ADD COLUMN email_category TEXT`,
    // rfp_vendors.status — vendor participation status per RFP: 'active' | 'declined'
    `ALTER TABLE rfp_vendors ADD COLUMN status TEXT DEFAULT 'active'`,
    // rfp_vendors.declined_at — timestamp when vendor declined participation
    `ALTER TABLE rfp_vendors ADD COLUMN declined_at TEXT`,
    // proposals.budget_amount — extracted financial bid value (numeric)
    `ALTER TABLE proposals ADD COLUMN budget_amount REAL`,
    // proposals.budget_currency — currency of the bid (AED, USD, etc.)
    `ALTER TABLE proposals ADD COLUMN budget_currency TEXT`,
    // proposals.timeline_months — extracted implementation timeline in months
    `ALTER TABLE proposals ADD COLUMN timeline_months INTEGER`,
    // proposals.executive_summary — LLM-extracted 2–3 sentence summary of the proposal
    `ALTER TABLE proposals ADD COLUMN executive_summary TEXT`,
    // proposals.key_strengths — LLM-extracted bullet list of vendor strengths from proposal
    `ALTER TABLE proposals ADD COLUMN key_strengths TEXT`,
    // proposals.proposal_attachments — JSON array of all submitted documents
    // Each entry: { r2_key, filename, size_bytes, content_type, label, text_chars }
    // label is auto-detected: 'technical', 'commercial', 'other'
    `ALTER TABLE proposals ADD COLUMN proposal_attachments TEXT`,
    // proposals.questions_responded — 1 if vendor already responded to Q&A
    `ALTER TABLE rfp_vendors ADD COLUMN questions_responded INTEGER DEFAULT 0`,
    // proposals.updated_at — timestamp of last update (added later; original table only had created_at)
    `ALTER TABLE proposals ADD COLUMN updated_at TEXT`,
    // rfps.scoring_matrix — JSON array of evaluation criteria with weights, editable by procurement manager
    `ALTER TABLE rfps ADD COLUMN scoring_matrix TEXT`,
    // vendors enrichment columns — v17
    `ALTER TABLE vendors ADD COLUMN founded_year INTEGER`,
    `ALTER TABLE vendors ADD COLUMN hq_city TEXT`,
    `ALTER TABLE vendors ADD COLUMN website TEXT`,
    `ALTER TABLE vendors ADD COLUMN public_sector_refs TEXT`,
    `ALTER TABLE vendors ADD COLUMN platforms TEXT`,
    `ALTER TABLE vendors ADD COLUMN annual_revenue_usd TEXT`,
    // proposals AI evaluation columns — v26
    `ALTER TABLE proposals ADD COLUMN evaluation_data TEXT`,
    `ALTER TABLE proposals ADD COLUMN ai_total_score REAL`,
    `ALTER TABLE proposals ADD COLUMN ai_recommendation TEXT`,
    `ALTER TABLE proposals ADD COLUMN ai_validation_status TEXT`,
    `ALTER TABLE proposals ADD COLUMN ai_evaluated_at TEXT`,
    `ALTER TABLE proposals ADD COLUMN ai_compliance_score REAL`,
    `ALTER TABLE proposals ADD COLUMN ai_quality_score REAL`,
    `ALTER TABLE proposals ADD COLUMN ai_commercial_score REAL`,
    // rfps requirement glossary — v26
    `ALTER TABLE rfps ADD COLUMN requirement_glossary TEXT`,
    // questions.emailed_at — timestamp when Q&A answer was actually emailed to vendors via Send Answers
    // NULL = not yet sent; non-null = sent. Used for "published" count in status bar.
    `ALTER TABLE questions ADD COLUMN emailed_at TEXT`,
    // async OCR job tracking — v27
    // ocr_job_status: null | 'pending_scoring' | 'pending_budget' | 'done'
    // ocr_job_text: raw OCR text from sidecar (stored so callback can score it)
    // ocr_budget_text: raw OCR text from commercial PDF sidecar
    `ALTER TABLE proposals ADD COLUMN ocr_job_status TEXT`,
    `ALTER TABLE proposals ADD COLUMN ocr_job_text TEXT`,
    `ALTER TABLE proposals ADD COLUMN ocr_budget_text TEXT`,
    // v28: extract-once architecture
    // proposals.proposal_full_text — merged OCR text of ALL uploaded files, populated at submission time
    // rfps.rfp_full_text — plain-text version of the generated RFP document, populated at generate time
    // rfps.arch_doc_r2_key / rfps.brd_doc_r2_key — R2 keys for the uploaded source docs
    `ALTER TABLE proposals ADD COLUMN proposal_full_text TEXT`,
    `ALTER TABLE rfps ADD COLUMN rfp_full_text TEXT`,
    `ALTER TABLE rfps ADD COLUMN arch_doc_r2_key TEXT`,
    `ALTER TABLE rfps ADD COLUMN brd_doc_r2_key TEXT`,
    // v49: OCR readiness tracking — how many file-ocr-complete callbacks are still expected
    // Set to ocrFired at submission time; decremented by each file-ocr-complete callback.
    // When it reaches 0 → status is set to 'ready_for_evaluation'.
    `ALTER TABLE proposals ADD COLUMN ocr_pending_files INTEGER DEFAULT 0`,
  ]
  for (const sql of alterMigrations) {
    try {
      await db.prepare(sql).run()
    } catch (_) {
      // Column already exists — safe to ignore
    }
  }
}

export async function seedVendors(db: D1Database) {
  // Vendor seed version — bump this string to force a full reseed on next deploy
  const SEED_VERSION = 'v2-global-2025'

  // Check if we've already seeded this version via a meta table
  await db.prepare(`CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)`).run()
  const meta = await db.prepare('SELECT value FROM app_meta WHERE key=?').bind('vendor_seed_version').first<{ value: string }>()
  if (meta?.value === SEED_VERSION) return  // Already up to date

  // Wipe old vendors (clean slate for version bump) and reseed
  await db.prepare('DELETE FROM vendors').run()

  // Global vendor pool — no MENA/UAE/Dubai region specifics
  const vendors = [
    {
      name: 'Andersen',
      category: 'IT Consulting',
      country: 'Poland',
      size: 'Large',
      contact_name: 'Dmitry Gibert',
      contact_email: 'd.gibert@andersenlab.com',
      specializations: 'Custom software development; Oracle EBS Implementation; ERP (Oracle EBS R12); CRM development; AI/ML development; AI & data platforms; Data warehouse; ETL; Tableau; Data engineering; Cloud migration; IT transformation; Digital transformation; Managed services; IT staff augmentation; Government solutions',
      certifications: 'ISO 9001; CMMI Level 3; Current supplier — 3 projects completed, working for past 12 months',
      erp_experience: 'Government Oracle EBS R12 implementations — 8 years professional services experience; Medallion DWH — 4 years data warehouse delivery; CRM platform development for government entities — Salesforce and custom CRM; AI/ML development and data platform engineering for enterprise sector; IT transformation and digital modernisation projects for global enterprise clients',
    },
    {
      name: 'EPAM Systems',
      category: 'IT Consulting',
      country: 'USA',
      size: 'Large',
      contact_name: 'Sarah Kowalski',
      contact_email: 'sarah.kowalski@epam.com',
      specializations: 'Custom software development; Oracle EBS Implementation; ERP (Oracle EBS R12); CRM development; AI/ML development; AI & data platforms; Data warehouse; ETL; Tableau; Data engineering; Cloud migration; IT transformation; Digital transformation; Managed services; Staff augmentation; Government solutions',
      certifications: 'ISO 27001; ISO 9001; CMMI Level 5; Oracle Gold Partner',
      erp_experience: 'Oracle EBS ERP implementations worldwide — 12+ years; Large-scale government projects across Europe and North America — 5 years; Medallion DWH and data engineering for government entities; CRM platform development — Salesforce and custom CRM for public sector; AI/ML development and data platform engineering; IT transformation and digital modernisation for enterprise clients',
    },
    {
      name: 'Oracle Corporation',
      category: 'IT & Digital Transformation',
      country: 'USA',
      size: 'Large',
      contact_name: 'James Carter',
      contact_email: 'james.carter@oracle.com',
      specializations: 'Oracle EBS Implementation; ERP solutions; Database management; Cloud infrastructure; HCM; SCM',
      certifications: '',
      erp_experience: 'Global enterprise technology leader for database and business applications; Oracle EBS implementations across 140+ countries; OCI cloud infrastructure and autonomous database services',
    },
    {
      name: 'Accenture',
      category: 'IT & Digital Transformation',
      country: 'Ireland',
      size: 'Large',
      contact_name: 'Marie Dubois',
      contact_email: 'marie.dubois@accenture.com',
      specializations: 'Oracle EBS Implementation; SAP ERP; Managed services; AI solutions; Cloud strategy; IT consulting',
      certifications: '',
      erp_experience: 'Global professional services firm driving digital transformation across 120 countries; deep expertise in large-scale ERP rollouts for government and regulated industries; AI-powered process automation',
    },
    {
      name: 'IBM',
      category: 'IT & Digital Transformation',
      country: 'USA',
      size: 'Large',
      contact_name: 'Thomas Berg',
      contact_email: 'thomas.berg@ibm.com',
      specializations: 'Hybrid cloud; AI/ML solutions; Managed IT services; Enterprise application management; Security',
      certifications: '',
      erp_experience: 'Hybrid cloud and enterprise AI solutions provider; IBM watsonx AI platform implementation; Red Hat OpenShift cloud-native deployments; enterprise cybersecurity and managed detection & response',
    },
    {
      name: 'Infosys Technologies',
      category: 'IT Consulting',
      country: 'India',
      size: 'Large',
      contact_name: 'Rajiv Menon',
      contact_email: 'rajiv.menon@infosys.com',
      specializations: 'Application development; Oracle EBS Implementation; ERP (SAP/Oracle); IT consulting; Staff augmentation',
      certifications: '',
      erp_experience: 'Global next-generation digital services and consulting; Oracle and SAP ERP implementations for Fortune 500 clients; cloud modernisation and AI-driven automation programmes',
    },
    {
      name: 'Tata Consultancy Services',
      category: 'IT Consulting',
      country: 'India',
      size: 'Large',
      contact_name: 'Vikram Rao',
      contact_email: 'vikram.rao@tcs.com',
      specializations: 'Software development; ERP solutions (SAP/Oracle); Cloud migration; Managed services; Data analytics',
      certifications: '',
      erp_experience: 'Global IT services and business solutions provider operating in 50+ countries; large-scale SAP and Oracle implementations; cognitive automation and analytics platforms',
    },
    {
      name: 'Wipro Technologies',
      category: 'IT Consulting',
      country: 'India',
      size: 'Large',
      contact_name: 'Anita Sharma',
      contact_email: 'anita.sharma@wipro.com',
      specializations: 'IT consulting; Cloud enablement; ERP implementations; Data analytics; Application maintenance',
      certifications: '',
      erp_experience: 'Global IT consulting and business process services; Oracle ERP cloud migrations; SAP S/4HANA implementations for manufacturing and utilities sectors; hyperscaler cloud engineering',
    },
    {
      name: 'HCLTech',
      category: 'IT & Digital Transformation',
      country: 'India',
      size: 'Large',
      contact_name: 'Elena Fischer',
      contact_email: 'elena.fischer@hcltech.com',
      specializations: 'Digital transformation; Engineering services; Cloud solutions; Managed services; Application development',
      certifications: '',
      erp_experience: 'Global technology company specializing in digital and engineering services; superscaler cloud and infrastructure managed services; IoT and embedded systems engineering for industrial clients',
    },
    {
      name: 'Tech Mahindra',
      category: 'IT Consulting',
      country: 'India',
      size: 'Large',
      contact_name: 'Piotr Nowak',
      contact_email: 'piotr.nowak@techmahindra.com',
      specializations: 'Application development; Network solutions; IT outsourcing; Staff augmentation; Cloud services',
      certifications: '',
      erp_experience: 'IT services and digital transformation provider; 5G and telecom network solutions; cloud-native application development; business process outsourcing for banking and insurance',
    },
    {
      name: 'DXC Technology',
      category: 'IT & Digital Transformation',
      country: 'USA',
      size: 'Large',
      contact_name: 'Lucas Müller',
      contact_email: 'lucas.muller@dxc.com',
      specializations: 'Managed services; IT outsourcing; Multi-cloud management; Cybersecurity; Application modernization',
      certifications: '',
      erp_experience: 'Global IT services and multi-cloud environment specialist; legacy application modernisation and migration to cloud; end-to-end cybersecurity managed services',
    },
    {
      name: 'Cognizant Technology Solutions',
      category: 'IT Consulting',
      country: 'USA',
      size: 'Large',
      contact_name: 'Claire Martin',
      contact_email: 'claire.martin@cognizant.com',
      specializations: 'Software development; AI/ML; Digital engineering; ERP implementations (SAP/Oracle); Data platforms',
      certifications: '',
      erp_experience: 'Global digital engineering and business consulting firm; AI-first transformation programmes; Oracle and SAP ERP implementations across healthcare, banking, and retail sectors',
    },
    {
      name: 'Capgemini',
      category: 'IT & Digital Transformation',
      country: 'France',
      size: 'Large',
      contact_name: 'Pierre Lefebvre',
      contact_email: 'pierre.lefebvre@capgemini.com',
      specializations: 'Cloud; Data & AI; Application development; Managed services; Intelligent automation',
      certifications: '',
      erp_experience: 'Global leader in consulting and technology services; SAP and Oracle ERP transformation programmes for public sector clients in Europe; cloud data platform and AI engineering',
    },
    {
      name: 'Deloitte Digital',
      category: 'IT & Digital Transformation',
      country: 'USA',
      size: 'Large',
      contact_name: 'Markus Schneider',
      contact_email: 'markus.schneider@deloitte.com',
      specializations: 'Technology consulting; ERP implementations (Oracle EBS/SAP); Custom development; Cloud strategy; Data analytics',
      certifications: '',
      erp_experience: 'Technology consulting arm of Deloitte focusing on digital transformation; Oracle EBS and SAP S/4HANA rollouts for government ministries and large enterprises; cloud strategy and data analytics advisory',
    },
    {
      name: 'SoftServe',
      category: 'IT Consulting',
      country: 'Ukraine',
      size: 'Medium',
      contact_name: 'Oleksandr Kovalenko',
      contact_email: 'o.kovalenko@softserve.com',
      specializations: 'Custom software development; AI/ML engineering; Data platforms; Cloud-native development; Staff augmentation',
      certifications: 'ISO 27001; ISO 9001',
      erp_experience: 'Eastern European technology services provider with strong public sector track record; AI and ML platform development; cloud-native microservices for government digital services; data engineering and analytics',
    },
    {
      name: 'Microsoft',
      category: 'IT & Digital Transformation',
      country: 'USA',
      size: 'Large',
      contact_name: 'Sophie Lambert',
      contact_email: 'sophie.lambert@microsoft.com',
      specializations: 'Azure cloud; Dynamics 365 ERP; Power Platform; AI services; Managed cloud operations; Custom development (.NET)',
      certifications: '',
      erp_experience: 'Global leader in enterprise software and cloud platforms; Dynamics 365 and Azure migrations for government and regulated industries; Microsoft 365 and Copilot AI deployments; Power Platform low-code automation',
    },
  ]

  for (const v of vendors) {
    await db.prepare(
      `INSERT INTO vendors (name, category, country, size, contact_name, contact_email, specializations, certifications, erp_experience)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(
      v.name, v.category, v.country, v.size,
      v.contact_name, v.contact_email,
      v.specializations, v.certifications, v.erp_experience
    ).run()
  }

  // Record seed version so future deploys don't reseed unless version bumps
  await db.prepare('INSERT OR REPLACE INTO app_meta (key, value) VALUES (?, ?)').bind('vendor_seed_version', SEED_VERSION).run()
}
