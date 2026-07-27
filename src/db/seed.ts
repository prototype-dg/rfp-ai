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
  const count = await db.prepare('SELECT COUNT(*) as cnt FROM vendors').first<{ cnt: number }>()
  if ((count?.cnt || 0) > 0) return

  // Vendor list from vendors_db.csv (uploaded 2025-07-24) — 15 vendors from CPC preferred supplier pool
  const vendors = [
    {
      name: 'Andersen',
      category: 'IT Consulting',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Dmitry Gibert',
      contact_email: 'd.gibert@andersenlab.com',
      specializations: 'Custom software development; Oracle EBS Implementation; ERP (Oracle EBS R12); CRM development; AI/ML development; AI & data platforms; Data warehouse; ETL; Tableau; Data engineering; Cloud migration; IT transformation; Digital transformation; Managed services; IT staff augmentation; Government solutions',
      certifications: 'ISO 9001; CMMI Level 3; Current supplier — 3 projects completed, working for past 12 months',
      erp_experience: 'Government Oracle EBS R12 implementations — 8 years UAE government experience; Medallion DWH — 4 years data warehouse delivery; CRM platform development for government entities — Salesforce and custom CRM; AI/ML development and data platform engineering for UAE public sector; IT transformation and digital modernisation projects for Abu Dhabi government; MENA government project delivery track record',
    },
    {
      name: 'EPAM Systems',
      category: 'IT Consulting',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Sarah Al Hashimi',
      contact_email: 'sarah.epam@epam.ae',
      specializations: 'Custom software development; Oracle EBS Implementation; ERP (Oracle EBS R12); CRM development; AI/ML development; AI & data platforms; Data warehouse; ETL; Tableau; Data engineering; Cloud migration; IT transformation; Digital transformation; Managed services; Staff augmentation; Government solutions',
      certifications: 'ISO 27001; ISO 9001; CMMI Level 5; Oracle Gold Partner',
      erp_experience: 'Oracle EBS ERP implementations worldwide — 12+ years; MENA government projects — 5 years; Medallion DWH and data engineering for government entities; CRM platform development — Salesforce and custom CRM for public sector; AI/ML development and data platform engineering; IT transformation and digital modernisation for UAE government clients; UAE government project delivery track record; Abu Dhabi public sector experience',
    },
    {
      name: 'Oracle Corporation',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Omar Khouri',
      contact_email: 'omar.oracle@oracle.ae',
      specializations: 'Oracle EBS Implementation; ERP solutions; Database management; Cloud infrastructure; HCM; SCM',
      certifications: '',
      erp_experience: 'Global enterprise technology leader for database and business applications. TRN: 1003456789, Dubai',
    },
    {
      name: 'Accenture Middle East',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Layla Nasser',
      contact_email: 'layla.accenture@accenture.ae',
      specializations: 'Oracle EBS Implementation; SAP ERP; Managed services; AI solutions; Cloud strategy; IT consulting',
      certifications: '',
      erp_experience: 'Global professional services firm driving digital transformation. TRN: 1004567890, Abu Dhabi',
    },
    {
      name: 'IBM Middle East',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Kamal Tannous',
      contact_email: 'kamal.ibm@ibm.ae',
      specializations: 'Hybrid cloud; AI/ML solutions; Managed IT services; Enterprise application management; Security',
      certifications: '',
      erp_experience: 'Hybrid cloud and enterprise AI solutions provider. TRN: 1005678901, Dubai',
    },
    {
      name: 'Infosys Technologies',
      category: 'IT Consulting',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Rajiv Menon',
      contact_email: 'rajiv.infosys@infosys.ae',
      specializations: 'Application development; Oracle EBS Implementation; ERP (SAP/Oracle); IT consulting; Staff augmentation',
      certifications: '',
      erp_experience: 'Global next-generation digital services and consulting. TRN: 1006789012, Dubai',
    },
    {
      name: 'Tata Consultancy Services',
      category: 'IT Consulting',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Vikram Rao',
      contact_email: 'vikram.tcs@tcs.ae',
      specializations: 'Software development; ERP solutions (SAP/Oracle); Cloud migration; Managed services; Data analytics',
      certifications: '',
      erp_experience: 'Global IT services and business solutions provider. TRN: 1007890123, Abu Dhabi',
    },
    {
      name: 'Wipro Technologies',
      category: 'IT Consulting',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Abdul Rehman',
      contact_email: 'abdul.wipro@wipro.ae',
      specializations: 'IT consulting; Cloud enablement; ERP implementations; Data analytics; Application maintenance',
      certifications: '',
      erp_experience: 'Global IT consulting and business process services. TRN: 1008901234, Dubai',
    },
    {
      name: 'HCLTech',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Fatima Al Mazroui',
      contact_email: 'fatima.hcl@hcltech.ae',
      specializations: 'Digital transformation; Engineering services; Cloud solutions; Managed services; Application development',
      certifications: '',
      erp_experience: 'Global technology company specializing in digital and engineering. TRN: 1009012345, Abu Dhabi',
    },
    {
      name: 'Tech Mahindra',
      category: 'IT Consulting',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Youssef El Sayed',
      contact_email: 'youssef.techm@techm.ae',
      specializations: 'Application development; Network solutions; IT outsourcing; Staff augmentation; Cloud services',
      certifications: '',
      erp_experience: 'IT services and digital transformation provider. TRN: 1000123456, Dubai',
    },
    {
      name: 'DXC Technology',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Hassan Qureshi',
      contact_email: 'hassan.dxc@dxc.ae',
      specializations: 'Managed services; IT outsourcing; Multi-cloud management; Cybersecurity; Application modernization',
      certifications: '',
      erp_experience: 'Global IT services and multi-cloud environment specialist. TRN: 1001234568, Abu Dhabi',
    },
    {
      name: 'Cognizant Technology Solutions',
      category: 'IT Consulting',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Nadia Aoun',
      contact_email: 'nadia.cognizant@cognizant.ae',
      specializations: 'Software development; AI/ML; Digital engineering; ERP implementations (SAP/Oracle); Data platforms',
      certifications: '',
      erp_experience: 'Global digital engineering and business consulting firm. TRN: 1002345679, Dubai',
    },
    {
      name: 'Capgemini Middle East',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Pierre Accad',
      contact_email: 'pierre.capgemini@capgemini.ae',
      specializations: 'Cloud; Data & AI; Application development; Managed services; Intelligent automation',
      certifications: '',
      erp_experience: 'Global leader in consulting and technology services. TRN: 1003456780, Abu Dhabi',
    },
    {
      name: 'Deloitte Digital Middle East',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Rami Khoury',
      contact_email: 'rami.deloitte@deloitte.ae',
      specializations: 'Technology consulting; ERP implementations (Oracle EBS/SAP); Custom development; Cloud strategy; Data analytics',
      certifications: '',
      erp_experience: 'Technology consulting arm of Deloitte focusing on digital transformation. TRN: 1004567891, Dubai',
    },
    {
      name: 'Al Ghurair IT Solutions',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Medium',
      contact_name: 'Essa Al Ghurair',
      contact_email: 'essa@alghurairit.ae',
      specializations: 'IT infrastructure; Managed services; Staff augmentation; Business applications; ERP support',
      certifications: '',
      erp_experience: 'Local UAE IT solutions provider with deep regional expertise. TRN: 1005678902, Dubai',
    },
    {
      name: 'Microsoft Gulf',
      category: 'IT & Digital Transformation',
      country: 'UAE',
      size: 'Large',
      contact_name: 'Samir Boutros',
      contact_email: 'samir.microsoft@microsoft.ae',
      specializations: 'Azure cloud; Dynamics 365 ERP; Power Platform; AI services; Managed cloud operations; Custom development (.NET)',
      certifications: '',
      erp_experience: 'Global leader in enterprise software and cloud platforms. TRN: 1006789013, Abu Dhabi',
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
}
