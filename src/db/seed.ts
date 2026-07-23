export async function initDb(db: D1Database) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS rfps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT,
      category TEXT,
      budget TEXT,
      deadline TEXT,
      scope TEXT,
      tech_requirements TEXT,
      content TEXT,
      stage TEXT DEFAULT 'draft',
      created_at TEXT,
      updated_at TEXT
    )`,
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
      shortlisted INTEGER DEFAULT 0,
      fit_score INTEGER,
      fit_rationale TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      question TEXT NOT NULL,
      answer TEXT,
      vendor_id INTEGER,
      published INTEGER DEFAULT 0,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS proposals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER,
      technical_proposal TEXT,
      financial_proposal REAL,
      technical_score REAL,
      status TEXT DEFAULT 'submitted',
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      proposal_id INTEGER,
      vendor_id INTEGER,
      technical_score REAL,
      financial_score REAL,
      experience_score REAL,
      total_score REAL,
      ai_summary TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS recommendations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      top_vendor TEXT,
      rankings_json TEXT,
      summary TEXT,
      created_at TEXT
    )`,
    `CREATE TABLE IF NOT EXISTS email_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      vendor_id INTEGER,
      recipient TEXT,
      subject TEXT,
      body TEXT,
      email_type TEXT,
      status TEXT DEFAULT 'simulated',
      created_at TEXT
    )`,
  ]

  for (const sql of statements) {
    await db.prepare(sql).run()
  }
}

export async function seedVendors(db: D1Database) {
  const count = await db.prepare('SELECT COUNT(*) as cnt FROM vendors').first<{ cnt: number }>()
  if ((count?.cnt || 0) > 0) return

  const vendors = [
    { name: 'SAP Middle East', category: 'IT & Digital Transformation', country: 'UAE', size: 'Large', contact_name: 'Mohammed Al Rashid', contact_email: 'mrashid@sap.com', specializations: 'ERP,SAP S/4HANA,Government,HR,Finance', certifications: 'ISO 27001,SOC 2,SAP Partner', erp_experience: 'Government, Banking, Oil & Gas - 20+ years' },
    { name: 'Oracle UAE', category: 'IT & Digital Transformation', country: 'UAE', size: 'Large', contact_name: 'Sarah Johnson', contact_email: 'sjohnson@oracle.com', specializations: 'ERP,Oracle Cloud,Government,Finance,Procurement', certifications: 'ISO 27001,ISO 9001', erp_experience: 'Government sector ERP - 15+ years' },
    { name: 'Microsoft Gulf', category: 'IT & Digital Transformation', country: 'UAE', size: 'Large', contact_name: 'Khalid Al Mansoori', contact_email: 'kmansoori@microsoft.com', specializations: 'ERP,Dynamics 365,Government,Digital Transformation', certifications: 'ISO 27001,SOC 2,Microsoft Gold Partner', erp_experience: 'Public sector Dynamics 365 - 10+ years' },
    { name: 'Andersen Lab', category: 'IT Consulting', country: 'UAE', size: 'Medium', contact_name: 'David Gibert', contact_email: 'd.gibert@andersenlab.com', specializations: 'ERP,Custom Development,Integration,Government', certifications: 'ISO 9001,CMMI Level 3', erp_experience: 'Government ERP implementations - 8 years' },
    { name: 'Infor MENA', category: 'IT & Digital Transformation', country: 'UAE', size: 'Large', contact_name: 'Ahmad Khalil', contact_email: 'akhalil@infor.com', specializations: 'ERP,Infor CloudSuite,Government,HR,Payroll', certifications: 'ISO 27001', erp_experience: 'MENA government projects - 12 years' },
    { name: 'IFS Middle East', category: 'IT & Digital Transformation', country: 'UAE', size: 'Medium', contact_name: 'Rania El Sayed', contact_email: 'relsayed@ifs.com', specializations: 'ERP,IFS Cloud,Asset Management,Government', certifications: 'ISO 27001,ISO 9001', erp_experience: 'Government & utilities - 10 years' },
    { name: 'Odoo Gulf', category: 'IT & Digital Transformation', country: 'UAE', size: 'Small', contact_name: 'Yusuf Al Hamdan', contact_email: 'yhamdan@odoo.com', specializations: 'ERP,Odoo,SME,Retail', certifications: 'ISO 9001', erp_experience: 'SME implementations - 5 years' },
    { name: 'Epicor MENA', category: 'IT & Digital Transformation', country: 'UAE', size: 'Medium', contact_name: 'Nada Farouk', contact_email: 'nfarouk@epicor.com', specializations: 'ERP,Manufacturing,Distribution', certifications: 'ISO 27001', erp_experience: 'Manufacturing ERP - 8 years' },
    { name: 'Unit4 Gulf', category: 'IT & Digital Transformation', country: 'UAE', size: 'Medium', contact_name: 'Tariq Mahmoud', contact_email: 'tmahmoud@unit4.com', specializations: 'ERP,Unit4,Government,Education,Finance', certifications: 'ISO 27001,SOC 2', erp_experience: 'Public sector - 9 years' },
    { name: 'Sage Middle East', category: 'IT & Digital Transformation', country: 'UAE', size: 'Medium', contact_name: 'Layla Nassif', contact_email: 'lnassif@sage.com', specializations: 'ERP,Sage,Finance,Accounting,SME', certifications: 'ISO 9001', erp_experience: 'SME and mid-market - 6 years' },
    { name: 'Netsuite MENA', category: 'IT & Digital Transformation', country: 'UAE', size: 'Medium', contact_name: 'Bassam Khalil', contact_email: 'bkhalil@netsuite.com', specializations: 'ERP,NetSuite,Cloud,Finance,CRM', certifications: 'ISO 27001', erp_experience: 'Cloud ERP mid-market - 7 years' },
    { name: 'Workday Gulf', category: 'IT & Digital Transformation', country: 'UAE', size: 'Large', contact_name: 'Hessa Al Nuaimi', contact_email: 'hnuaimi@workday.com', specializations: 'ERP,Workday,HR,Finance,Payroll,Government', certifications: 'ISO 27001,SOC 2', erp_experience: 'Government HR/Finance cloud - 8 years' },
    { name: 'Deltek MENA', category: 'IT & Digital Transformation', country: 'UAE', size: 'Small', contact_name: 'Omar Said', contact_email: 'osaid@deltek.com', specializations: 'ERP,Project Management,Government Contracting', certifications: 'ISO 9001', erp_experience: 'Government contracting ERP - 5 years' },
    { name: 'JD Edwards UAE', category: 'IT & Digital Transformation', country: 'UAE', size: 'Large', contact_name: 'Fatima Al Balushi', contact_email: 'fbalushi@oracle.com', specializations: 'ERP,JD Edwards,Oracle,Government,Distribution', certifications: 'ISO 27001', erp_experience: 'Government and utilities - 14 years' },
    { name: 'Acumatica Gulf', category: 'IT & Digital Transformation', country: 'UAE', size: 'Small', contact_name: 'Rashid Al Mazrouei', contact_email: 'rmazrouei@acumatica.com', specializations: 'ERP,Acumatica,Cloud,Construction,Distribution', certifications: 'ISO 9001', erp_experience: 'Construction & distribution - 4 years' },
    { name: 'Ramco Systems UAE', category: 'IT & Digital Transformation', country: 'India', size: 'Medium', contact_name: 'Priya Nair', contact_email: 'pnair@ramco.com', specializations: 'ERP,HR,Payroll,Aviation,Government', certifications: 'ISO 27001,ISO 9001', erp_experience: 'Government HR & Payroll MENA - 10 years' },
  ]

  for (const v of vendors) {
    await db.prepare(
      `INSERT INTO vendors (name, category, country, size, contact_name, contact_email, specializations, certifications, erp_experience)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(v.name, v.category, v.country, v.size, v.contact_name, v.contact_email, v.specializations, v.certifications, v.erp_experience).run()
  }
}
