// ============================================================
// CPC RFP TOOL - Multi-RFP Edition
// ============================================================
'use strict';
const API = '/api';

// ============================================================
// INTERNATIONALISATION (Arabic / English)
// ============================================================
var _currentLang = localStorage.getItem('cpc_lang') || 'en';

var I18N = {
  en: {
    // Sidebar
    org_name:        "Crown Prince's Court",
    product_name:    'AI RFP Management',
    nav_overview:    'Overview',
    nav_dashboard:   'Dashboard',
    nav_procurement: 'Procurement',
    nav_rfps:        'All RFPs',
    nav_vendors:     'Vendor Registry',
    nav_analytics:   'Analytics',
    nav_reports:     'Reports',
    user_name:       'Procurement Manager',
    user_role:       'CPC · Abu Dhabi',
    // Header
    lang_btn:        'AR',
    // Page titles
    page_dashboard:        'Dashboard',
    page_dashboard_sub:    'AI-Powered Procurement Overview',
    page_rfps:             'All RFPs',
    page_rfps_sub:         'Manage Active & Historic Procurement',
    page_vendors:          'Vendor Registry',
    page_vendors_sub:      'Global Vendor Pool & Performance',
    page_reports:          'Reports & Analytics',
    page_reports_sub:      'Cross-RFP Performance Metrics',
    // Lifecycle bar
    stage_publish:   'Publish RFP',
    stage_invite:    'Invite',
    stage_qa:        'Q&A',
    stage_proposals: 'Proposals',
    stage_award:     'Award',
    // RFP tabs
    tab_generate:  'Generate',
    tab_vendors:   'Vendors',
    tab_qa:        'Q&A',
    tab_proposals: 'Proposals',
    // Dashboard cards
    dash_active_rfps:   'Active RFPs',
    dash_total_vendors: 'Total Vendors',
    dash_proposals:     'Proposals',
    dash_awarded:       'Awarded',
    // Stage labels
    stage_label_draft:               'Draft',
    stage_label_published:           'Published',
    stage_label_qa_open:             'Q&A Open',
    stage_label_submissions_closed:  'Submissions Closed',
    stage_label_evaluation:          'Evaluation',
    stage_label_awarded:             'Awarded',
    // Common buttons / labels
    btn_new_rfp:     '+ New RFP',
    btn_save:        'Save',
    btn_cancel:      'Cancel',
    btn_back:        'Back',
    btn_generate:    'Generate RFP',
    btn_publish:     'Publish RFP',
    btn_edit:        'Edit',
    btn_delete:      'Delete',
    btn_invite:      'Send Invitations',
    btn_evaluate:    'Evaluate All',
    btn_award:       'Award Contract',
    btn_add:         'Add',
    btn_remove:      'Remove',
    btn_comms:       'Comms',
    // RFP Generate tab labels
    gen_rfp_params:       'RFP Parameters',
    gen_scoring_matrix:   'Evaluation Scoring Matrix',
    gen_edit_matrix:      'Edit Matrix',
    gen_save_matrix:      'Save Matrix',
    gen_rfp_preview:      'RFP Preview',
    gen_generate_ai:      'Generate with AI',
    gen_matrix_hint:      'Define criteria and weights used in AI generation and vendor evaluation. Weights must sum to 100%.',
    // Scoring matrix table headers + footer
    sm_th_criterion:    'Criterion',
    sm_th_weight:       'Weight',
    sm_th_description:  'Description',
    sm_add_criterion:   'Add Criterion',
    sm_total:           'Total',
    sm_must_100:        '⚠ must be 100%',
    sm_ok:              '✓',
    sm_weights_error:   'Weights must sum to 100%. Current total:',
    sm_saved:           'Scoring matrix saved.',
    // Scoring matrix default criteria (display only — kept EN in generated docs)
    sm_crit_technical:  'Technical Approach & Methodology',
    sm_crit_functional: 'Functional Fit & Solution Quality',
    sm_crit_team:       'Team Qualifications & Experience',
    sm_crit_financial:  'Financial Proposal',
    sm_crit_impl:       'Implementation Plan & Timeline',
    // Vendors tab header buttons
    vendors_ai_suggest:   'AI Suggested Vendors',
    vendors_send_inv:     'Send Invitations',
    vendors_section_title:'Vendor Shortlist & Participation',
    inv_send_pdf_btn:     'Send Invitations + PDF',
    inv_modal_title:      'Send RFP Invitations',
    inv_sending_to:       'Sending to',
    inv_shortlisted:      'shortlisted vendors.',
    inv_real_email:       'A real email will be sent to',
    inv_all_simulated:    'All emails will be simulated.',
    inv_others_simulated: 'All others are simulated.',
    // Q&A tab
    qa_no_questions_title:'No vendor questions yet',
    qa_no_questions_sub:  'Vendors submit questions by replying to the RFP invitation email with an Excel attachment.',
    qa_no_questions_hint: 'If you received an email but questions are not showing, try',
    qa_re_extract_link:   'Re-extract Questions',
    qa_re_extract_btn:    'Re-extract',
    qa_re_extract_full:   'Re-extract Questions from Emails',
    qa_ai_answer_all:     'AI Answer All',
    qa_publish_approved:  'Send Answers',
    qa_close_qa:          'Close Q&A',
    qa_closed_label:      'Q&A Closed',
    qa_manual_required:   'Manual Required',
    qa_awaiting_approval: 'Awaiting Approval',
    qa_unanswered:        'Unanswered',
    qa_via_email:         'Via Email',
    qa_ai_draft_btn:      'AI Draft',
    qa_manual_edit_btn:   'Manual Edit',
    qa_approve_send_btn:  'Approve',
    qa_approve_btn:       'Approve',
    qa_ai_draft_label:    'AI Draft Answer',
    qa_ai_no_answer:      'AI could not generate an answer',
    qa_manual_input_msg:  'This question requires manual input. Please edit and provide an answer before publishing.',
    qa_manual_warning_hd: 'question(s) require manual answers',
    qa_manual_warning_sub:'AI could not generate answers for highlighted questions. Please provide manual answers before publishing.',
    qa_blocked_title:     'Blocked:',
    qa_need_manual_answers:'question(s) need manual answers',
    qa_answering:         'AI Answering...',
    qa_re_extracting:     'Re-extracting...',
    // Proposals tab
    prop_vendors_submit:  'Vendors submit proposals via the secure submission portal link included in their invitation email.',
    prop_evaluate_ai:     'Evaluate with AI',
    prop_evaluating:      'Evaluating…',
    prop_view_btn:        'View',
    prop_award_btn:       'Award',
    prop_awarded_badge:   'Awarded',
    prop_recommended:     'Recommended',
    prop_not_awarded:     'Not Awarded',
    prop_submitted:       'Submitted',
    prop_review_badge:    'Review',
    prop_files:           'file',
    prop_files_pl:        'files',
    prop_no_docs:         'No documents attached',
    // Proposal panel tabs
    panel_tab_summary:    'Summary',
    panel_tab_compliance: 'Compliance',
    panel_tab_scoring:    'Scoring',
    panel_tab_verdict:    'AI Verdict',
    // Proposal panel — summary tab
    panel_budget_lbl:       'Budget',
    panel_timeline_lbl:     'Timeline',
    panel_tech_summary:     'Technical Summary',
    panel_key_strengths:    'Key Strengths',
    panel_docs_submitted:   'Submitted Documents',
    panel_no_docs:          'No documents',
    panel_budget_manual_hd: 'Budget not auto-extracted — manual entry required',
    panel_budget_manual_sub:'The AI could not find a clear "Total" line in the proposal. Enter the total budget to unlock full commercial scoring.',
    panel_save_reevaluate:  'Save & Re-evaluate',
    panel_low_confidence:   'Low confidence — verify manually',
    // Proposal panel — compliance tab
    panel_comp_disq:        '🚨 Mandatory Requirement(s) Not Met — Proposal Automatically Disqualified',
    panel_comp_th_req:      'Requirement',
    panel_comp_th_mand:     'Mandatory',
    panel_comp_th_met:      'Met?',
    panel_comp_th_depth:    'AI Depth',
    panel_comp_th_just:     'Justification',
    panel_comp_must:        'MUST',
    panel_comp_should:      'should',
    panel_comp_no_data:     'No compliance data yet',
    panel_comp_no_data_sub: 'Run AI evaluation to generate the compliance matrix.',
    // Proposal panel — scoring tab
    panel_score_overall:    'Overall AI Score',
    panel_score_compliance: 'Compliance Score',
    panel_score_quality:    'Quality Score',
    panel_score_commercial: 'Commercial Score',
    panel_score_comp_desc:  'Mandatory + optional requirement coverage',
    panel_score_qual_desc:  'AI-assessed depth, clarity & feasibility',
    panel_score_comm_desc:  'Budget vs. RFP ceiling ratio',
    panel_score_pending:    'Commercial score excluded — budget needs manual entry (see Executive Summary tab)',
    panel_score_validated:  'Budget manually validated and included in scoring',
    panel_score_no_data:    'No scoring data yet',
    panel_score_no_data_sub:'Run AI evaluation to see the detailed scoring breakdown.',
    // Proposal panel — verdict tab
    panel_verdict_reasoning:'Reasoning',
    panel_verdict_strong:   'Strong Points',
    panel_verdict_risks:    'Risks & Weak Points',
    panel_verdict_orig_att: 'Original Attachments',
    panel_verdict_no_docs:  'No documents',
    panel_verdict_no_data:  'No AI verdict yet',
    panel_verdict_no_data_sub:'Run an evaluation to get the AI recommendation, compliance matrix, and full scoring breakdown.',
    panel_eval_single_btn:  'Evaluate this Proposal',
    panel_eval_footer_btn:  'Evaluate with AI',
    panel_score_score_lbl:  'Score:',
    panel_manual_validated: 'Budget manually validated and included in scoring',
    // Q&A badge labels (Published already exists as qa_published)
    badge_published:        'Published',
    badge_awaiting:         'Awaiting Approval',
    badge_unanswered:       'Unanswered',
    lbl_loading:     'Loading…',
    lbl_no_data:     'No data yet',
    lbl_search:      'Search…',
    lbl_filter:      'Filter',
    lbl_status:      'Status',
    lbl_score:       'Score',
    lbl_vendor:      'Vendor',
    lbl_date:        'Date',
    lbl_actions:     'Actions',
    lbl_ref:         'RFP Reference',
    lbl_title:       'Title',
    lbl_category:    'Category',
    lbl_budget:      'Budget',
    lbl_deadline:    'Deadline',
    lbl_stage:       'Stage',
    // Notifications panel
    notif_panel_title:  'Notifications',
    notif_mark_read:    'Mark all read',
    notif_none:         'No notifications yet',
    notif_dismiss:      'Dismiss',
    // Dashboard stats
    dash_total_rfps:    'Total RFPs',
    dash_win_rate:      'Win Rate',
    dash_avg_duration:  'Avg Duration',
    dash_vendor_pool:   'Vendor Pool',
    dash_proposals_lbl: 'Proposals',
    dash_emails_sent:   'Emails Sent',
    dash_active_suffix: 'active',
    dash_awarded_suffix:'awarded',
    dash_per_rfp:       'per RFP cycle',
    dash_reg_vendors:   'registered vendors',
    dash_total_recv:    'total received',
    dash_inv_replies:   'invitations & replies',
    dash_stage_breakdown:'RFP Stage Breakdown',
    dash_quick_actions: 'Quick Actions',
    dash_no_rfp_data:   'No RFP data yet',
    // Quick-action buttons (dashboard)
    qa_btn_new_rfp:     'New RFP',
    qa_btn_all_rfps:    'All RFPs',
    qa_btn_vendors:     'Vendors',
    qa_btn_reports:     'Reports',
    // RFP list page
    active_procurements:'Active Procurements',
    rfps_in_progress:   'RFP(s) in progress',
    archived_contracts: 'Archived — Awarded Contracts',
    completed_procs:    'completed procurement(s)',
    no_active_rfps:     'No active procurements — all RFPs have been awarded!',
    // RFP card
    card_created:       'Created',
    card_deadline:      'Deadline:',
    card_no_deadline:   'No deadline set',
    card_open:          'Open',
    card_complete:      'Complete',
    card_completed:     'Completed',
    card_awarded_badge: 'Awarded',
    // Empty states
    no_rfps_title:      'No RFPs Yet',
    no_rfps_sub:        'Create your first RFP to start the procurement process',
    btn_create_rfp:     'Create New RFP',
    // Form labels (generate tab)
    form_project_title: 'Project Title',
    form_category:      'Category',
    form_budget_aed:    'Budget (AED)',
    form_deadline:      'Submission Deadline',
    form_background:    'Project Background',
    form_objectives:    'Objectives',
    form_scope:         'Scope of Work',
    form_tech_req:      'Technical Requirements',
    // Category options
    cat_it:             'IT & Digital Transformation',
    cat_consulting:     'Consulting Services',
    cat_infrastructure: 'Infrastructure',
    cat_professional:   'Professional Services',
    cat_data:           'Data & Analytics',
    // Vendors tab
    vendors_shortlisted:'shortlisted',
    vendors_inv_status: 'Invitation status and vendor responses tracked below',
    vendors_none_title: 'No vendors shortlisted yet',
    vendors_none_sub:   'Use AI Suggested Vendors to auto-shortlist, or add vendors manually from the pool below.',
    vendors_show_pool:  'Show full vendor pool',
    vendors_not_shortlisted: 'not shortlisted',
    // Invite modal
    invite_q_deadline:  'Questions Deadline',
    invite_s_deadline:  'Submission Deadline',
    invite_notes:       'Additional Notes',
    invite_notes_ph:    'Any special instructions for vendors...',
    // Q&A tab stats
    qa_pending:         'pending',
    qa_awaiting:        'awaiting approval',
    qa_published:       'sent to vendors',
    qa_need_manual:     'need manual input',
    // Proposals tab
    proposals_received: 'proposal(s) received',
    proposals_evaluated:'AI-evaluated',
    proposals_none:     'No proposals received yet.',
    proposals_submitted:'Submitted Proposals',
    // Table headers (proposals)
    th_vendor:          'Vendor',
    th_date:            'Date',
    th_budget:          'Budget',
    th_duration:        'Duration',
    th_files:           'Files',
    th_ai_score:        'AI Score',
    th_status:          'Status',
    th_actions:         'Actions',
    // Vendor table headers
    th_specializations: 'Specializations',
    th_fit_score:       'AI Fit Score',
    th_participation:   'Participation Status',
    th_shortlist:       'Shortlist',
    // Vendor registry page
    vpage_heading:      'Global Vendor Registry',
    vpage_registered:   'registered vendors',
    vpage_th_vendor:    'Vendor',
    vpage_th_category:  'Category',
    vpage_th_specs:     'Specializations',
    // Vendor detail — section headers
    vsec_company:       'Company',
    vsec_contact:       'Contact',
    vsec_tech_profile:  'Technical Profile',
    vsec_industry:      'Industry Experience',
    // Vendor detail — field labels
    vfld_country:       'Country',
    vfld_hq:            'Headquarters',
    vfld_website:       'Website',
    vfld_revenue:       'Annual Revenue',
    vfld_contact_name:  'Contact Name',
    vfld_contact_email: 'Contact Email',
    vfld_email_editable:'(editable)',
    vfld_platforms:     'Platforms & Technologies',
    vfld_specializations:'Specializations',
    vfld_certifications:'Certifications',
    vfld_exp_summary:   'Experience Summary',
    vfld_pub_sector:    'Public Sector References',
    vfld_est:           'Est.',
    // Vendor categories (DB values)
    vcat_it_consulting: 'IT Consulting',
    vcat_it_digital:    'IT & Digital Transformation',
    // Vendor size labels (DB values)
    vsize_large:        'Large',
    vsize_medium:       'Medium',
    // Vendor country labels (DB values)
    vcountry_uae:       'UAE',
    // Vendor invitation / participation status badges
    vstatus_not_invited:'Not Invited',
    vstatus_invited:    'Invited',
    vstatus_simulated:  'Simulated',
    vstatus_declined:   'Declined',
    vstatus_replied:    'replied',
    vstatus_no_comms:   'No Comms',
    // Settings page
    settings_title:         'Settings',
    settings_sub:           'Manage application configuration',
    settings_categories_hd: 'RFP Categories',
    settings_categories_sub:'Customise the list of categories available when creating an RFP.',
    settings_cat_add_ph:    'New category name',
    settings_cat_add_btn:   'Add',
    settings_cat_saved:     'Categories saved.',
    settings_cat_reset:     'Restore defaults',
    settings_procurement_email_hd: 'Procurement Contact Email',
    settings_procurement_email_sub: 'Displayed to vendors in the vendor portal when they are declined or need to reach out.',
    settings_procurement_email_ph:  'procurement@cpc.gov.ae',
    settings_procurement_email_save:'Save Email',
    settings_procurement_email_saved:'Contact email saved.',
    // Command palette
    cmd_placeholder:    'Search RFPs, vendors, pages\u2026',
    // Notification drawer
    notif_drawer_title: 'Notifications',
    notif_mark_all:     'Mark all read',
    notif_clear_all:    'Clear all',
    notif_empty_title:  'All caught up!',
    notif_empty_sub:    'New alerts for Q&A, proposals, and awards will appear here.',
    // Stage action banner
    sab_draft:          'This RFP is a draft. Fill in the details and generate the document.',
    sab_draft_btn:      'Go to Generate',
    sab_published:      'RFP published. Invite shortlisted vendors to start the Q&A period.',
    sab_published_btn:  'Go to Vendors',
    sab_qa_open:        'Q&A period is open. Review and answer vendor questions.',
    sab_qa_open_btn:    'Go to Q&A',
    sab_subs_closed:    'Submissions closed. Evaluate received proposals.',
    sab_subs_closed_btn:'Go to Proposals',
    sab_awarded:        'Contract awarded. This RFP is complete.',
    // Contextual action cards (dashboard 2.2)
    ctx_drafts_hd:      'Drafts awaiting generation',
    ctx_drafts_btn:     'Open',
    ctx_qa_hd:          'Pending Q&A questions',
    ctx_qa_btn:         'Answer',
    ctx_props_hd:       'Proposals awaiting evaluation',
    ctx_props_btn:      'Evaluate',
    ctx_award_hd:       'Awaiting award decision',
    ctx_award_btn:      'Decide',
    // Q&A tab extras
    qa_filter_all:      'All',
    qa_filter_pending:  'Pending',
    qa_filter_approved: 'Approved',
    qa_filter_published:'Published',
    qa_edit_answer_btn: 'Edit Answer',
    qa_save_answer_btn: 'Save Answer',
    qa_ai_tooltip:      'AI will draft answers for all unanswered questions. You can review and edit each draft before approving.',
    qa_publish_confirm_title: 'Send Answers to Vendors?',
    qa_publish_confirm_body:  'The following answers will be emailed to all shortlisted vendors:',
    // Proposals tab extras
    prop_evaluate_all_btn:'Evaluate All',
    prop_reevaluate_btn:  'Re-evaluate All',
    prop_award_this_btn:  'Award This Vendor',
    prop_award_in_panel:  'Award Contract',
    // Confirm dialogs
    confirm_close_qa_title: 'Close Q&A Period?',
    confirm_close_qa_body:  'Vendors will no longer be able to submit questions. This action cannot be undone.',
    confirm_award_title:    'Award Contract?',
    confirm_award_body:     'This will mark the contract as awarded to',
    confirm_delete_title:   'Confirm Delete',
    confirm_destructive_btn:'Confirm',
    confirm_cancel_btn:     'Cancel',
    // Vendor registry extras
    vendor_export_csv:      'Export CSV',
    vendor_edit_mode_btn:   'Edit',
    vendor_save_mode_btn:   'Save Changes',
    vendor_procurement_history_hd: 'Procurement History',
    vendor_ph_no_rfps:      'This vendor has not participated in any RFPs yet.',
    // Vendor comms extras
    comms_jump_latest:      'Jump to Latest',
    comms_char_count:       'characters',
    comms_rfp_ref:          'RFP Reference',
    comms_markdown_hint:    'Markdown supported',
    // Vendor tab extras
    vendor_pending_invite:  'Pending Invite',
    vendor_invite_prompt:   'Send invitation now?',
    vendor_invite_yes:      'Send Invite',
    vendor_invite_later:    'Later',
    vendor_filter_all:      'All',
    vendor_filter_shortlisted:'Shortlisted',
    vendor_filter_invited:  'Invited',
    vendor_match_score:     'Match',
    // Create RFP modal fix (11.1)
    create_rfp_modal_hint:  "Fill in detailed requirements on the Generate tab after creation.",
    // Preview toolbar (5.1)
    preview_copy_all:       'Copy All',
    preview_export_pdf:     'Export PDF',
    // Auto-save (5.2)
    autosave_restored:      'Draft restored from auto-save.',
    autosave_discard:       'Discard',
    autosave_restore:       'Restore',
    // Version snapshot (5.5)
    snapshot_saved:         'Version snapshot saved before overwrite.',
    snapshot_view:          'View Snapshots',
    snapshot_restore:       'Restore this version',
    // Reports charts (12.1)
    reports_monthly_title:  'Monthly RFP Activity',
    reports_stage_funnel:   'Stage Funnel',
    reports_vendor_perf:    'Top Vendors by Score',
    // Inline form validation (14.1)
    val_required:           'This field is required.',
    val_email:              'Please enter a valid email address.',
    val_min_length:         'Must be at least {n} characters.',
    // RFP list filter bar (3.2)
    filter_stage:           'Stage',
    filter_category:        'Category',
    filter_sort:            'Sort',
    filter_sort_newest:     'Newest first',
    filter_sort_oldest:     'Oldest first',
    filter_sort_az:         'A → Z',
    filter_sort_score:      'Score',
    filter_view_grid:       'Grid',
    filter_view_list:       'List',
    filter_all:             'All',
    // 3.3 Archived badge
    archived_rfps:          'Archived',
    // 3.4 card 3-dot menu
    card_menu_open:         'Open RFP',
    card_menu_archive:      'Archive',
    card_menu_delete:       'Delete',
    // 13.1 declined contact
    submit_declined_contact_prefix: 'For further assistance, please contact:',
    // 13.3 submission confirmation
    submit_confirm_email_sent: 'A confirmation email has been sent to your registered address.',
  },
  ar: {
    // Sidebar
    org_name:        'ديوان ولي العهد',
    product_name:    'نظام إدارة طلبات العروض',
    nav_overview:    'نظرة عامة',
    nav_dashboard:   'لوحة التحكم',
    nav_procurement: 'المشتريات',
    nav_rfps:        'طلبات العروض',
    nav_vendors:     'سجل الموردين',
    nav_analytics:   'التحليلات',
    nav_reports:     'التقارير',
    user_name:       'مدير المشتريات',
    user_role:       'ديوان ولي العهد · أبوظبي',
    // Header
    lang_btn:        'EN',
    // Page titles
    page_dashboard:        'لوحة التحكم',
    page_dashboard_sub:    'نظرة عامة على المشتريات المدعومة بالذكاء الاصطناعي',
    page_rfps:             'طلبات العروض',
    page_rfps_sub:         'إدارة المشتريات الحالية والتاريخية',
    page_vendors:          'سجل الموردين',
    page_vendors_sub:      'قائمة الموردين العالميين والأداء',
    page_reports:          'التقارير والتحليلات',
    page_reports_sub:      'مقاييس الأداء عبر طلبات العروض',
    // Lifecycle bar
    stage_publish:   'نشر الطلب',
    stage_invite:    'الدعوة',
    stage_qa:        'الأسئلة',
    stage_proposals: 'العروض',
    stage_award:     'الترسية',
    // RFP tabs
    tab_generate:  'إنشاء',
    tab_vendors:   'الموردون',
    tab_qa:        'الأسئلة',
    tab_proposals: 'العروض',
    // Dashboard cards
    dash_active_rfps:   'طلبات نشطة',
    dash_total_vendors: 'إجمالي الموردين',
    dash_proposals:     'العروض المقدمة',
    dash_awarded:       'العقود المرساة',
    // Stage labels
    stage_label_draft:               'مسودة',
    stage_label_published:           'منشور',
    stage_label_qa_open:             'الأسئلة مفتوحة',
    stage_label_submissions_closed:  'التقديم مغلق',
    stage_label_evaluation:          'التقييم',
    stage_label_awarded:             'مرسى',
    // Common buttons / labels
    btn_new_rfp:     '+ طلب عرض جديد',
    btn_save:        'حفظ',
    btn_cancel:      'إلغاء',
    btn_back:        'رجوع',
    btn_generate:    'إنشاء طلب العرض',
    btn_publish:     'نشر طلب العرض',
    btn_edit:        'تعديل',
    btn_delete:      'حذف',
    btn_invite:      'إرسال الدعوات',
    btn_evaluate:    'تقييم الجميع',
    btn_award:       'ترسية العقد',
    btn_add:         'إضافة',
    btn_remove:      'إزالة',
    btn_comms:       'مراسلة',
    // RFP Generate tab labels
    gen_rfp_params:       'معايير طلب العرض',
    gen_scoring_matrix:   'مصفوفة التقييم',
    gen_edit_matrix:      'تعديل المصفوفة',
    gen_save_matrix:      'حفظ المصفوفة',
    gen_rfp_preview:      'معاينة الطلب',
    gen_generate_ai:      'إنشاء بالذكاء الاصطناعي',
    gen_matrix_hint:      'حدد المعايير والأوزان المستخدمة في الإنشاء والتقييم. يجب أن تكون مجموع الأوزان 100%.',
    // Scoring matrix table headers + footer
    sm_th_criterion:    'المعيار',
    sm_th_weight:       'الوزن',
    sm_th_description:  'الوصف',
    sm_add_criterion:   'إضافة معيار',
    sm_total:           'المجموع',
    sm_must_100:        '⚠ يجب أن يكون 100%',
    sm_ok:              '✓',
    sm_weights_error:   'يجب أن يكون مجموع الأوزان 100%. المجموع الحالي:',
    sm_saved:           'تم حفظ مصفوفة التقييم.',
    // Scoring matrix default criteria (EN kept in generated docs — Arabic for UI display)
    sm_crit_technical:  'المنهجية والمقاربة التقنية',
    sm_crit_functional: 'الملاءمة الوظيفية وجودة الحل',
    sm_crit_team:       'مؤهلات الفريق وخبرته',
    sm_crit_financial:  'العرض المالي',
    sm_crit_impl:       'خطة التنفيذ والجدول الزمني',
    // Vendors tab header buttons
    vendors_ai_suggest:   'الموردون المقترحون بالذكاء الاصطناعي',
    vendors_send_inv:     'إرسال الدعوات',
    vendors_section_title:'قائمة الموردين والمشاركة',
    inv_send_pdf_btn:     'إرسال الدعوات + PDF',
    inv_modal_title:      'إرسال دعوات طلب العرض',
    inv_sending_to:       'إرسال إلى',
    inv_shortlisted:      'مورد مختار.',
    inv_real_email:       'سيُرسل بريد إلكتروني حقيقي إلى',
    inv_all_simulated:    'جميع الرسائل ستُحاكى.',
    inv_others_simulated: 'جميع الآخرين محاكاة.',
    // Q&A tab
    qa_no_questions_title:'لا توجد أسئلة من الموردين بعد',
    qa_no_questions_sub:  'يرسل الموردون أسئلتهم بالرد على بريد دعوة طلب العرض مع مرفق Excel.',
    qa_no_questions_hint: 'إذا استلمت بريدًا إلكترونيًا ولا تظهر الأسئلة، جرّب',
    qa_re_extract_link:   'إعادة استخراج الأسئلة',
    qa_re_extract_btn:    'إعادة استخراج',
    qa_re_extract_full:   'إعادة استخراج الأسئلة من الرسائل',
    qa_ai_answer_all:     'إجابة الكل بالذكاء الاصطناعي',
    qa_publish_approved:  'إرسال الإجابات',
    qa_close_qa:          'إغلاق الأسئلة',
    qa_closed_label:      'الأسئلة مغلقة',
    qa_manual_required:   'يتطلب إدخالاً يدوياً',
    qa_awaiting_approval: 'بانتظار الموافقة',
    qa_unanswered:        'بدون إجابة',
    qa_via_email:         'عبر البريد الإلكتروني',
    qa_ai_draft_btn:      'مسودة ذكاء اصطناعي',
    qa_manual_edit_btn:   'تعديل يدوي',
    qa_approve_send_btn:  'موافقة',
    qa_approve_btn:       'موافقة',
    qa_ai_draft_label:    'مسودة إجابة الذكاء الاصطناعي',
    qa_ai_no_answer:      'تعذّر على الذكاء الاصطناعي توليد إجابة',
    qa_manual_input_msg:  'يتطلب هذا السؤال إدخالاً يدوياً. يرجى التعديل وإضافة إجابة قبل النشر.',
    qa_manual_warning_hd: 'سؤال(أسئلة) تتطلب إجابات يدوية',
    qa_manual_warning_sub:'تعذّر على الذكاء الاصطناعي توليد إجابات للأسئلة المميزة. يرجى إدخالها يدوياً قبل النشر.',
    qa_blocked_title:     'محظور:',
    qa_need_manual_answers:'سؤال(أسئلة) تحتاج إجابات يدوية',
    qa_answering:         'جارٍ الإجابة...',
    qa_re_extracting:     'جارٍ إعادة الاستخراج...',
    // Proposals tab
    prop_vendors_submit:  'يرسل الموردون عروضهم عبر رابط بوابة التقديم المؤمّن المُدرج في بريد الدعوة.',
    prop_evaluate_ai:     'تقييم بالذكاء الاصطناعي',
    prop_evaluating:      'جارٍ التقييم…',
    prop_view_btn:        'عرض',
    prop_award_btn:       'ترسية',
    prop_awarded_badge:   'مُرسى',
    prop_recommended:     'موصى به',
    prop_not_awarded:     'غير مُرسى',
    prop_submitted:       'مقدَّم',
    prop_review_badge:    'مراجعة',
    prop_files:           'ملف',
    prop_files_pl:        'ملفات',
    prop_no_docs:         'لا توجد مستندات مرفقة',
    // Proposal panel tabs
    panel_tab_summary:    'الملخص',
    panel_tab_compliance: 'الامتثال',
    panel_tab_scoring:    'التقييم',
    panel_tab_verdict:    'حكم الذكاء الاصطناعي',
    // Proposal panel — summary tab
    panel_budget_lbl:       'الميزانية',
    panel_timeline_lbl:     'الجدول الزمني',
    panel_tech_summary:     'الملخص التقني',
    panel_key_strengths:    'نقاط القوة الرئيسية',
    panel_docs_submitted:   'المستندات المقدمة',
    panel_no_docs:          'لا توجد مستندات',
    panel_budget_manual_hd: 'لم تُستخرج الميزانية تلقائيًا — يلزم الإدخال اليدوي',
    panel_budget_manual_sub:'تعذّر على الذكاء الاصطناعي إيجاد سطر "الإجمالي" في العرض. أدخل الميزانية الإجمالية لفتح التقييم التجاري الكامل.',
    panel_save_reevaluate:  'حفظ وإعادة التقييم',
    panel_low_confidence:   'ثقة منخفضة — تحقق يدوياً',
    // Proposal panel — compliance tab
    panel_comp_disq:        '🚨 متطلب(ات) إلزامية غير مستوفاة — العرض مستبعد تلقائيًا',
    panel_comp_th_req:      'المتطلب',
    panel_comp_th_mand:     'إلزامي',
    panel_comp_th_met:      'مستوفى؟',
    panel_comp_th_depth:    'عمق الذكاء الاصطناعي',
    panel_comp_th_just:     'المبرر',
    panel_comp_must:        'لازم',
    panel_comp_should:      'مفضّل',
    panel_comp_no_data:     'لا توجد بيانات امتثال بعد',
    panel_comp_no_data_sub: 'شغّل تقييم الذكاء الاصطناعي لإنشاء مصفوفة الامتثال.',
    // Proposal panel — scoring tab
    panel_score_overall:    'النتيجة الإجمالية للذكاء الاصطناعي',
    panel_score_compliance: 'نتيجة الامتثال',
    panel_score_quality:    'نتيجة الجودة',
    panel_score_commercial: 'النتيجة التجارية',
    panel_score_comp_desc:  'تغطية المتطلبات الإلزامية والاختيارية',
    panel_score_qual_desc:  'العمق والوضوح والجدوى بتقييم الذكاء الاصطناعي',
    panel_score_comm_desc:  'نسبة الميزانية إلى سقف طلب العرض',
    panel_score_pending:    'النتيجة التجارية مستبعدة — الميزانية تحتاج إدخالاً يدوياً (انظر تبويب الملخص)',
    panel_score_validated:  'الميزانية مُتحققة يدوياً ومدرجة في التقييم',
    panel_score_no_data:    'لا توجد بيانات تقييم بعد',
    panel_score_no_data_sub:'شغّل تقييم الذكاء الاصطناعي للاطلاع على تفاصيل التقييم.',
    // Proposal panel — verdict tab
    panel_verdict_reasoning:'المبررات',
    panel_verdict_strong:   'نقاط القوة',
    panel_verdict_risks:    'المخاطر ونقاط الضعف',
    panel_verdict_orig_att: 'المرفقات الأصلية',
    panel_verdict_no_docs:  'لا توجد مستندات',
    panel_verdict_no_data:  'لا يوجد حكم ذكاء اصطناعي بعد',
    panel_verdict_no_data_sub:'شغّل التقييم للحصول على توصية الذكاء الاصطناعي ومصفوفة الامتثال وتفاصيل التقييم.',
    panel_eval_single_btn:  'تقييم هذا العرض',
    panel_eval_footer_btn:  'تقييم بالذكاء الاصطناعي',
    panel_score_score_lbl:  'النتيجة:',
    panel_manual_validated: 'الميزانية مُتحققة يدوياً ومدرجة في التقييم',
    // Q&A badge labels
    badge_published:        'منشور',
    badge_awaiting:         'بانتظار الموافقة',
    badge_unanswered:       'بدون إجابة',
    lbl_loading:     'جاري التحميل…',
    lbl_no_data:     'لا توجد بيانات',
    lbl_search:      'بحث…',
    lbl_filter:      'تصفية',
    lbl_status:      'الحالة',
    lbl_score:       'النقاط',
    lbl_vendor:      'المورد',
    lbl_date:        'التاريخ',
    lbl_actions:     'الإجراءات',
    lbl_ref:         'رقم الطلب',
    lbl_title:       'العنوان',
    lbl_category:    'الفئة',
    lbl_budget:      'الميزانية',
    lbl_deadline:    'الموعد النهائي',
    lbl_stage:       'المرحلة',
    // Notifications panel
    notif_panel_title:  'الإشعارات',
    notif_mark_read:    'تحديد الكل كمقروء',
    notif_none:         'لا توجد إشعارات',
    notif_dismiss:      'تجاهل',
    // Dashboard stats
    dash_total_rfps:    'إجمالي الطلبات',
    dash_win_rate:      'معدل الترسية',
    dash_avg_duration:  'متوسط المدة',
    dash_vendor_pool:   'قائمة الموردين',
    dash_proposals_lbl: 'العروض',
    dash_emails_sent:   'رسائل مُرسلة',
    dash_active_suffix: 'نشط',
    dash_awarded_suffix:'مُرسى',
    dash_per_rfp:       'لكل دورة طلب',
    dash_reg_vendors:   'مورد مسجل',
    dash_total_recv:    'إجمالي المستلم',
    dash_inv_replies:   'دعوات وردود',
    dash_stage_breakdown:'توزيع مراحل الطلبات',
    dash_quick_actions: 'الإجراءات السريعة',
    dash_no_rfp_data:   'لا توجد بيانات بعد',
    // Quick-action buttons (dashboard)
    qa_btn_new_rfp:     'طلب جديد',
    qa_btn_all_rfps:    'كل الطلبات',
    qa_btn_vendors:     'الموردون',
    qa_btn_reports:     'التقارير',
    // RFP list page
    active_procurements:'المشتريات النشطة',
    rfps_in_progress:   'طلب(ات) قيد التنفيذ',
    archived_contracts: 'الأرشيف — عقود مُرساة',
    completed_procs:    'عملية(عمليات) شراء مكتملة',
    no_active_rfps:     'لا توجد مشتريات نشطة — تم ترسية جميع الطلبات!',
    // RFP card
    card_created:       'تاريخ الإنشاء',
    card_deadline:      'الموعد النهائي:',
    card_no_deadline:   'لا يوجد موعد نهائي',
    card_open:          'فتح',
    card_complete:      'مكتمل',
    card_completed:     'مكتمل',
    card_awarded_badge: 'مرسى',
    // Empty states
    no_rfps_title:      'لا توجد طلبات بعد',
    no_rfps_sub:        'أنشئ أول طلب عرض أسعار لبدء عملية الشراء',
    btn_create_rfp:     'إنشاء طلب جديد',
    // Form labels (generate tab)
    form_project_title: 'عنوان المشروع',
    form_category:      'الفئة',
    form_budget_aed:    'الميزانية (درهم)',
    form_deadline:      'الموعد النهائي للتقديم',
    form_background:    'خلفية المشروع',
    form_objectives:    'الأهداف',
    form_scope:         'نطاق العمل',
    form_tech_req:      'المتطلبات التقنية',
    // Category options
    cat_it:             'تقنية المعلومات والتحول الرقمي',
    cat_consulting:     'خدمات الاستشارات',
    cat_infrastructure: 'البنية التحتية',
    cat_professional:   'الخدمات المهنية',
    cat_data:           'البيانات والتحليلات',
    // Vendors tab
    vendors_shortlisted:'مختار',
    vendors_inv_status: 'حالة الدعوة وردود الموردين مُتتبَّعة أدناه',
    vendors_none_title: 'لا يوجد موردون مختارون بعد',
    vendors_none_sub:   'استخدم "الموردون المقترحون بالذكاء الاصطناعي" للاختيار التلقائي، أو أضف موردين يدوياً من القائمة أدناه.',
    vendors_show_pool:  'عرض قائمة الموردين الكاملة',
    vendors_not_shortlisted: 'غير مختار',
    // Invite modal
    invite_q_deadline:  'الموعد النهائي للأسئلة',
    invite_s_deadline:  'الموعد النهائي للتقديم',
    invite_notes:       'ملاحظات إضافية',
    invite_notes_ph:    'أي تعليمات خاصة للموردين...',
    // Q&A tab stats
    qa_pending:         'في الانتظار',
    qa_awaiting:        'بانتظار الموافقة',
    qa_published:       'تم الإرسال',
    qa_need_manual:     'تحتاج إدخالاً يدوياً',
    // Proposals tab
    proposals_received: 'عرض(عروض) مستلمة',
    proposals_evaluated:'مُقيَّم بالذكاء الاصطناعي',
    proposals_none:     'لم تُستلم أي عروض بعد.',
    proposals_submitted:'العروض المقدمة',
    // Table headers (proposals)
    th_vendor:          'المورد',
    th_date:            'التاريخ',
    th_budget:          'الميزانية',
    th_duration:        'المدة',
    th_files:           'الملفات',
    th_ai_score:        'تقييم الذكاء الاصطناعي',
    th_status:          'الحالة',
    th_actions:         'الإجراءات',
    // Vendor table headers
    th_specializations: 'التخصصات',
    th_fit_score:       'مدى الملاءمة',
    th_participation:   'حالة المشاركة',
    th_shortlist:       'القائمة المختصرة',
    // Vendor registry page
    vpage_heading:      'سجل الموردين العالمي',
    vpage_registered:   'مورد مسجل',
    vpage_th_vendor:    'المورد',
    vpage_th_category:  'الفئة',
    vpage_th_specs:     'التخصصات',
    // Vendor detail — section headers
    vsec_company:       'بيانات الشركة',
    vsec_contact:       'جهة الاتصال',
    vsec_tech_profile:  'الملف التقني',
    vsec_industry:      'الخبرة القطاعية',
    // Vendor detail — field labels
    vfld_country:       'البلد',
    vfld_hq:            'المقر الرئيسي',
    vfld_website:       'الموقع الإلكتروني',
    vfld_revenue:       'الإيرادات السنوية',
    vfld_contact_name:  'اسم جهة الاتصال',
    vfld_contact_email: 'البريد الإلكتروني',
    vfld_email_editable:'(قابل للتعديل)',
    vfld_platforms:     'المنصات والتقنيات',
    vfld_specializations:'التخصصات',
    vfld_certifications:'الشهادات والاعتمادات',
    vfld_exp_summary:   'ملخص الخبرة',
    vfld_pub_sector:    'مراجع القطاع الحكومي',
    vfld_est:           'تأسست',
    // Vendor categories (DB values)
    vcat_it_consulting: 'استشارات تقنية المعلومات',
    vcat_it_digital:    'تقنية المعلومات والتحول الرقمي',
    // Vendor size labels (DB values)
    vsize_large:        'كبيرة',
    vsize_medium:       'متوسطة',
    // Vendor country labels (DB values)
    vcountry_uae:       'الإمارات',
    // Vendor invitation / participation status badges
    vstatus_not_invited:'غير مدعو',
    vstatus_invited:    'مدعو',
    vstatus_simulated:  'محاكى',
    vstatus_declined:   'رفض',
    vstatus_replied:    'رد',
    vstatus_no_comms:   'بلا تواصل',
    // Settings page
    settings_title:         'الإعدادات',
    settings_sub:           'إدارة إعدادات التطبيق',
    settings_categories_hd: 'فئات طلبات العروض',
    settings_categories_sub:'تخصيص قائمة الفئات المتاحة عند إنشاء طلب عرض.',
    settings_cat_add_ph:    'اسم الفئة الجديدة',
    settings_cat_add_btn:   'إضافة',
    settings_cat_saved:     'تم حفظ الفئات.',
    settings_cat_reset:     'استعادة الافتراضي',
    settings_procurement_email_hd: 'بريد إلكتروني للتواصل مع المشتريات',
    settings_procurement_email_sub: 'يُعرض للموردين في بوابة التقديم عند رفضهم أو الحاجة للتواصل.',
    settings_procurement_email_ph:  'procurement@cpc.gov.ae',
    settings_procurement_email_save:'حفظ البريد الإلكتروني',
    settings_procurement_email_saved:'تم حفظ البريد الإلكتروني.',
    cmd_placeholder:    'البحث في الطلبات والموردين…',
    notif_drawer_title: 'الإشعارات',
    notif_mark_all:     'تحديد الكل كمقروء',
    notif_clear_all:    'مسح الكل',
    notif_empty_title:  'لا توجد إشعارات جديدة!',
    notif_empty_sub:    'ستظهر هنا تنبيهات الأسئلة والعروض والترسية.',
    sab_draft:          'هذا الطلب مسودة. أدخل التفاصيل وقم بإنشاء الوثيقة.',
    sab_draft_btn:      'إنشاء',
    sab_published:      'تم نشر الطلب. ادعُ الموردين المختارين للبدء في فترة الأسئلة.',
    sab_published_btn:  'الموردون',
    sab_qa_open:        'فترة الأسئلة مفتوحة. راجع أسئلة الموردين وأجب عليها.',
    sab_qa_open_btn:    'الأسئلة',
    sab_subs_closed:    'التقديم مغلق. قيّم العروض المستلمة.',
    sab_subs_closed_btn:'العروض',
    sab_awarded:        'تم ترسية العقد. اكتمل هذا الطلب.',
    ctx_drafts_hd:      'مسودات تنتظر الإنشاء',
    ctx_drafts_btn:     'فتح',
    ctx_qa_hd:          'أسئلة معلقة في Q&A',
    ctx_qa_btn:         'الإجابة',
    ctx_props_hd:       'عروض تنتظر التقييم',
    ctx_props_btn:      'تقييم',
    ctx_award_hd:       'تنتظر قرار الترسية',
    ctx_award_btn:      'قرار',
    qa_filter_all:      'الكل',
    qa_filter_pending:  'معلق',
    qa_filter_approved: 'موافق عليه',
    qa_filter_published:'منشور',
    qa_edit_answer_btn: 'تعديل الإجابة',
    qa_save_answer_btn: 'حفظ الإجابة',
    qa_ai_tooltip:      'سيُعدّ الذكاء الاصطناعي إجابات للأسئلة غير المجاب عنها. يمكنك المراجعة والتعديل قبل الموافقة.',
    qa_publish_confirm_title: 'نشر جميع الإجابات الموافق عليها؟',
    qa_publish_confirm_body:  'ستُرسل الإجابات التالية بالبريد إلى جميع الموردين المختارين:',
    prop_evaluate_all_btn:'تقييم الجميع',
    prop_reevaluate_btn:  'إعادة تقييم الجميع',
    prop_award_this_btn:  'ترسية هذا المورد',
    prop_award_in_panel:  'ترسية العقد',
    confirm_close_qa_title: 'إغلاق فترة الأسئلة؟',
    confirm_close_qa_body:  'لن يتمكن الموردون من تقديم أسئلة. لا يمكن التراجع عن هذا الإجراء.',
    confirm_award_title:    'ترسية العقد؟',
    confirm_award_body:     'سيُسجَّل العقد كمُرسى إلى',
    confirm_delete_title:   'تأكيد الحذف',
    confirm_destructive_btn:'تأكيد',
    confirm_cancel_btn:     'إلغاء',
    vendor_export_csv:      'تصدير CSV',
    vendor_edit_mode_btn:   'تعديل',
    vendor_save_mode_btn:   'حفظ التغييرات',
    vendor_procurement_history_hd: 'سجل المشتريات',
    vendor_ph_no_rfps:      'لم يشارك هذا المورد في أي طلبات بعد.',
    comms_jump_latest:      'الانتقال للأحدث',
    comms_char_count:       'حرف',
    comms_rfp_ref:          'مرجع الطلب',
    comms_markdown_hint:    'Markdown مدعوم',
    vendor_pending_invite:  'دعوة معلقة',
    vendor_invite_prompt:   'إرسال الدعوة الآن؟',
    vendor_invite_yes:      'إرسال الدعوة',
    vendor_invite_later:    'لاحقاً',
    vendor_filter_all:      'الكل',
    vendor_filter_shortlisted:'مختار',
    vendor_filter_invited:  'مدعو',
    vendor_match_score:     'ملاءمة',
    create_rfp_modal_hint:  'أدخل تفاصيل المتطلبات في تبويب الإنشاء بعد الإنشاء.',
    preview_copy_all:       'نسخ الكل',
    preview_export_pdf:     'تصدير PDF',
    autosave_restored:      'تم استعادة المسودة من الحفظ التلقائي.',
    autosave_discard:       'تجاهل',
    autosave_restore:       'استعادة',
    snapshot_saved:         'تم حفظ نسخة احتياطية قبل الكتابة فوق.',
    snapshot_view:          'عرض النسخ',
    snapshot_restore:       'استعادة هذه النسخة',
    reports_monthly_title:  'نشاط طلبات العروض الشهري',
    reports_stage_funnel:   'مسار المراحل',
    reports_vendor_perf:    'أفضل الموردين بالتقييم',
    val_required:           'هذا الحقل مطلوب.',
    val_email:              'يرجى إدخال بريد إلكتروني صحيح.',
    val_min_length:         'يجب أن يكون على الأقل {n} أحرف.',
    filter_stage:           'المرحلة',
    filter_category:        'الفئة',
    filter_sort:            'الترتيب',
    filter_sort_newest:     'الأحدث أولاً',
    filter_sort_oldest:     'الأقدم أولاً',
    filter_sort_az:         'أ → ي',
    filter_sort_score:      'التقييم',
    filter_view_grid:       'شبكة',
    filter_view_list:       'قائمة',
    filter_all:             'الكل',
    archived_rfps:          'الأرشيف',
    card_menu_open:         'فتح الطلب',
    card_menu_archive:      'أرشفة',
    card_menu_delete:       'حذف',
    submit_declined_contact_prefix: 'للمزيد من المساعدة، يرجى التواصل مع:',
    submit_confirm_email_sent: 'تم إرسال بريد تأكيد إلى عنوانك المسجل.',
  }
};

function t(key) {
  var lang = _currentLang;
  return (I18N[lang] && I18N[lang][key]) || (I18N['en'] && I18N['en'][key]) || key;
}

// ── Vendor field translation helpers ────────────────────────────────────────
// Specialization tag translation map  (English → Arabic)
var SPEC_MAP_AR = {
  'Custom software development':      'تطوير البرمجيات المخصصة',
  'Oracle EBS Implementation':        'تطبيق Oracle EBS',
  'ERP (Oracle EBS R12)':             'تخطيط الموارد (Oracle EBS R12)',
  'CRM development':                  'تطوير أنظمة إدارة علاقات العملاء',
  'AI/ML development':                'تطوير الذكاء الاصطناعي/التعلم الآلي',
  'AI & data platforms':              'منصات الذكاء الاصطناعي والبيانات',
  'Data warehouse':                   'مستودعات البيانات',
  'ETL':                              'ETL',
  'Tableau':                          'Tableau',
  'Data engineering':                 'هندسة البيانات',
  'Cloud migration':                  'هجرة الخدمات السحابية',
  'IT transformation':                'التحول التقني',
  'Digital transformation':           'التحول الرقمي',
  'Managed services':                 'الخدمات المُدارة',
  'IT staff augmentation':            'توفير كوادر تقنية',
  'Government solutions':             'حلول القطاع الحكومي',
  'Cloud infrastructure':             'البنية التحتية السحابية',
  'HCM':                              'إدارة رأس المال البشري',
  'SCM':                              'إدارة سلاسل التوريد',
  'SAP ERP':                          'SAP ERP',
  'Hybrid cloud':                     'السحابة الهجينة',
  'Managed IT services':              'خدمات تقنية المعلومات المُدارة',
  'Enterprise application management':'إدارة تطبيقات المؤسسات',
  'Security':                         'الأمن المعلوماتي',
  'Application development':          'تطوير التطبيقات',
  'IT consulting':                    'استشارات تقنية المعلومات',
  'Staff augmentation':               'توسيع الفرق التقنية',
  'Azure cloud':                      'سحابة Azure',
  'Dynamics 365 ERP':                 'Dynamics 365 ERP',
  'Power Platform':                   'Power Platform',
  'Intelligent automation':           'الأتمتة الذكية',
  'Engineering services':             'الخدمات الهندسية',
  'Cybersecurity':                    'الأمن السيبراني',
  'Application modernization':        'تحديث التطبيقات',
  'Network solutions':                'حلول الشبكات',
  'IT outsourcing':                   'الاستعانة بمصادر تقنية خارجية',
  'Business applications':            'تطبيقات الأعمال',
  'ERP support':                      'دعم أنظمة تخطيط الموارد',
  'ISO 9001':                         'ISO 9001',
  'ISO 27001':                        'ISO 27001',
  'CMMI Level 3':                     'CMMI المستوى 3',
  'CMMI Level 5':                     'CMMI المستوى 5',
  'Oracle Gold Partner':              'شريك Oracle الذهبي',
};

// Translate a single specialization/platform tag
function tSpec(tag) {
  if (_currentLang !== 'ar') return tag;
  return SPEC_MAP_AR[tag.trim()] || tag;
}

// Translate a vendor category string stored in DB
function tVendorCat(cat) {
  if (!cat) return '';
  if (_currentLang !== 'ar') return cat;
  var map = { 'IT Consulting': t('vcat_it_consulting'), 'IT & Digital Transformation': t('vcat_it_digital') };
  return map[cat] || cat;
}

// Translate a vendor size string stored in DB
function tVendorSize(size) {
  if (!size) return '';
  if (_currentLang !== 'ar') return size;
  var map = { 'Large': t('vsize_large'), 'Medium': t('vsize_medium') };
  return map[size] || size;
}

// Translate a vendor country string stored in DB
function tVendorCountry(country) {
  if (!country) return '';
  if (_currentLang !== 'ar') return country;
  var map = { 'UAE': t('vcountry_uae') };
  return map[country] || country;
}

// Render a semicolon-separated or comma-separated tag list with translation
function tSpecTagList(str, separator) {
  if (!str) return '<span style="font-size:0.84rem;color:#9a8c78">–</span>';
  var sep = separator || /[,;]/;
  return str.split(sep).filter(Boolean).map(function(s) {
    return '<span class="tag" style="white-space:normal;max-width:none;word-break:break-word;margin-bottom:2px">'
      + escHtml(tSpec(s.trim())) + '</span>';
  }).join('');
}
// ── End vendor helpers ───────────────────────────────────────────────────────

function applyTranslations() {
  var isAr = _currentLang === 'ar';
  // direction + lang attribute
  document.documentElement.setAttribute('lang', isAr ? 'ar' : 'en');
  document.documentElement.setAttribute('dir',  isAr ? 'rtl' : 'ltr');
  // Update header date locale
  if (typeof updateHeaderDate === 'function') updateHeaderDate();
  // All elements with data-i18n
  document.querySelectorAll('[data-i18n]').forEach(function(el) {
    var key = el.getAttribute('data-i18n');
    el.textContent = t(key);
  });
  // Lang toggle button label
  var btn = document.getElementById('langToggleBtn');
  if (btn) btn.textContent = t('lang_btn');
  // Back button text
  var backBtn = document.getElementById('backBtn');
  if (backBtn) {
    var icon = backBtn.querySelector('i');
    backBtn.innerHTML = '';
    if (icon) backBtn.appendChild(icon);
    backBtn.appendChild(document.createTextNode(' ' + t('btn_back')));
  }
  // Update STAGE_LABELS for lifecycle bar
  STAGE_LABELS = [
    t('stage_publish'), t('stage_invite'), t('stage_qa'),
    t('stage_proposals'), t('stage_award')
  ];
  // Update RFP_TABS labels
  RFP_TABS[0].label = t('tab_generate');
  RFP_TABS[1].label = t('tab_vendors');
  RFP_TABS[2].label = t('tab_qa');
  RFP_TABS[3].label = t('tab_proposals');
  // Update pageTitles
  pageTitles.dashboard = [t('page_dashboard'), t('page_dashboard_sub')];
  pageTitles.rfps      = [t('page_rfps'),      t('page_rfps_sub')];
  pageTitles.vendors   = [t('page_vendors'),   t('page_vendors_sub')];
  pageTitles.reports   = [t('page_reports'),   t('page_reports_sub')];
  // Re-render current page header if on a standard page
  if (appState && appState.currentPage && pageTitles[appState.currentPage]) {
    var info = pageTitles[appState.currentPage];
    var ptEl = document.getElementById('pageTitle');
    var psEl = document.getElementById('pageSubtitle');
    if (ptEl && !appState.currentRfpId) ptEl.textContent = info[0];
    if (psEl && !appState.currentRfpId) psEl.textContent = info[1];
  }
  // Re-render lifecycle bar if visible
  if (appState && appState.currentRfp && document.getElementById('lifecycleBar') &&
      document.getElementById('lifecycleBar').style.display !== 'none') {
    renderLifecycleBar(appState.currentRfp);
  }
  // Re-render tab bar if visible
  if (appState && appState.currentRfpId && document.getElementById('rfpTabsBar') &&
      document.getElementById('rfpTabsBar').style.display !== 'none') {
    renderRfpTabs(appState.currentRfpTab, appState.currentRfpId, appState.unreadQA);
  }
}

// ── Sidebar toggle (mobile) ──────────────────────────────────────────────────
function toggleSidebar() {
  var sidebar = document.querySelector('.cpc-sidebar');
  var overlay = document.getElementById('sidebarOverlay');
  if (!sidebar || !overlay) return;
  var isOpen = sidebar.classList.contains('open');
  if (isOpen) {
    sidebar.classList.remove('open');
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  } else {
    sidebar.classList.add('open');
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden'; // prevent body scroll while drawer is open
  }
}

// Close sidebar when a nav item is clicked on mobile
document.addEventListener('click', function(e) {
  var navItem = e.target.closest('.nav-item');
  if (navItem && window.innerWidth <= 768) {
    var sidebar = document.querySelector('.cpc-sidebar');
    var overlay = document.getElementById('sidebarOverlay');
    if (sidebar) sidebar.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
    document.body.style.overflow = '';
  }
});

// 1.3 — setLang: switch to explicit lang value; called by pill buttons
function setLang(lang) {
  if (lang !== 'en' && lang !== 'ar') return;
  _currentLang = lang;
  localStorage.setItem('cpc_lang', lang);
  applyTranslations();
  // Update pill active state
  var btnEn = document.getElementById('langBtnEn');
  var btnAr = document.getElementById('langBtnAr');
  if (btnEn) btnEn.classList.toggle('active', lang === 'en');
  if (btnAr) btnAr.classList.toggle('active', lang === 'ar');
  // Re-render current page content to pick up translated labels
  if (appState && appState.currentPage) {
    var pageRenderFn = pages[appState.currentPage];
    if (pageRenderFn && !appState.currentRfpId) {
      pageRenderFn();
    }
  }
}

// Legacy toggle (kept for any old references)
function switchLang() {
  setLang(_currentLang === 'en' ? 'ar' : 'en');
}

let appState = {
  currentPage: 'dashboard',
  currentRfpId: null,
  currentRfpTab: 'generate',
  rfps: [],
  vendors: [],
  rfpVendors: [],
  questions: [],
  proposals: [],
  emails: [],
  receivedEmails: [],
  currentRfp: null,
  previousPage: null,
  unreadQA: 0,         // count of unanswered questions (> 0 shows badge on Q&A tab)
  unreadProposals: 0,  // count of new portal submissions (> 0 shows badge on Proposals tab)
  unreadVendors: 0,    // count of new vendor events (declines + incoming emails) → red badge on Vendors tab
  notifications: [],
  unreadNotifications: 0,
};

// ============================================================
// UTILITIES
// ============================================================
function showToast(msg, type, duration) {
  type = type || 'info';
  duration = duration || 4000;
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.className = 'toast show ' + type;
  setTimeout(function() { t.className = 'toast'; }, duration);
}

// ============================================================
// NOTIFICATION SYSTEM — bell icon + popup cards
// ============================================================
var _notifIdCounter = 0;

function addNotification(type, title, message, rfpId, tab, vendorId) {
  const id = ++_notifIdCounter;
  const notif = {
    id: id,
    type: type,          // 'email' | 'questions' | 'proposal' | 'info'
    title: title,
    message: message,
    rfpId: rfpId || null,
    tab: tab || null,
    vendorId: vendorId || null,
    time: new Date(),
    read: false,
  };
  appState.notifications.unshift(notif);
  if (appState.notifications.length > 50) appState.notifications.pop();
  appState.unreadNotifications = appState.notifications.filter(function(n){ return !n.read; }).length;
  updateBellBadge();
  showNotifPopup(notif);
}

function updateBellBadge() {
  const badge = document.getElementById('bellBadge');
  const count = appState.unreadNotifications;
  if (badge) {
    badge.textContent = count > 9 ? '9+' : String(count);
    badge.style.display = count > 0 ? 'flex' : 'none';
  }
}

function showNotifPopup(notif) {
  const icons = { email: 'fa-envelope', questions: 'fa-question-circle', proposal: 'fa-inbox', info: 'fa-info-circle', decline: 'fa-times-circle', stage: 'fa-flag' };
  const colors = { email: '#BA9765', questions: '#745B35', proposal: '#BA9765', info: '#6b7280', decline: '#dc2626', stage: '#16a34a' };
  const icon = icons[notif.type] || 'fa-bell';
  const color = colors[notif.type] || '#6b7280';
  const popupId = 'notif-popup-' + notif.id;
  const navigateBtn = (notif.rfpId && (notif.tab || notif.vendorId))
    ? '<button onclick="navigateFromNotif(' + notif.id + ')" style="background:' + color + ';color:white;border:none;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer;margin-right:6px">View</button>'
    : '';
  const popup = document.createElement('div');
  popup.id = popupId;
  popup.style.cssText = 'position:fixed;bottom:' + (80 + appState.notifications.filter(function(n,i){ return i < 5 && !n.popupDismissed; }).length * 0) + 'px;right:20px;z-index:10000;background:white;border:1px solid #e5e7eb;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.15);padding:14px 16px;min-width:300px;max-width:380px;animation:notifSlideIn 0.35s ease;border-left:4px solid ' + color;
  popup.innerHTML = '<div style="display:flex;align-items:flex-start;gap:10px">'
    + '<div style="width:32px;height:32px;border-radius:50%;background:' + color + '22;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    + '<i class="fas ' + icon + '" style="color:' + color + ';font-size:0.875rem"></i></div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-weight:700;font-size:0.82rem;color:#1f2937;margin-bottom:2px">' + escHtml(notif.title) + '</div>'
    + '<div style="font-size:0.77rem;color:#6b7280;line-height:1.4">' + escHtml(notif.message) + '</div>'
    + '<div style="margin-top:8px;display:flex;align-items:center">' + navigateBtn
    + '<button onclick="dismissNotifPopup(\x27' + popupId + '\x27,' + notif.id + ')" style="background:#f3f4f6;color:#374151;border:none;border-radius:6px;padding:4px 10px;font-size:0.75rem;cursor:pointer">' + t('notif_dismiss') + '</button>'
    + '</div></div>'
    + '<button onclick="dismissNotifPopup(\x27' + popupId + '\x27,' + notif.id + ')" style="background:none;border:none;cursor:pointer;color:#9ca3af;font-size:1rem;line-height:1;padding:0;margin-left:4px">&times;</button>'
    + '</div>';
  // Stack popups
  var existingPopups = document.querySelectorAll('[id^="notif-popup-"]');
  var offset = 20;
  existingPopups.forEach(function(p) { offset += p.offsetHeight + 10; });
  popup.style.bottom = offset + 'px';
  document.body.appendChild(popup);
  // Auto-dismiss after 8 seconds
  setTimeout(function() { dismissNotifPopup(popupId, notif.id); }, 8000);
}

function dismissNotifPopup(popupId, notifId) {
  const popup = document.getElementById(popupId);
  if (popup) {
    popup.style.animation = 'notifSlideOut 0.3s ease forwards';
    setTimeout(function() { if (popup.parentNode) popup.parentNode.removeChild(popup); repositionPopups(); }, 300);
  }
  const notif = appState.notifications.find(function(n){ return n.id === notifId; });
  if (notif) notif.popupDismissed = true;
}

function repositionPopups() {
  var popups = Array.from(document.querySelectorAll('[id^="notif-popup-"]'));
  var offset = 20;
  popups.forEach(function(p) {
    p.style.bottom = offset + 'px';
    offset += p.offsetHeight + 10;
  });
}

function navigateFromNotif(notifId) {
  const notif = appState.notifications.find(function(n){ return n.id === notifId; });
  if (!notif) return;
  markNotifRead(notifId);
  dismissNotifPopup('notif-popup-' + notifId, notifId);
  if (notif.rfpId && notif.vendorId) {
    // Navigate to vendor-specific communications page
    navigateTo('vendor_comms', { rfpId: notif.rfpId, vendorId: notif.vendorId });
  } else if (notif.rfpId && notif.tab) {
    navigateTo('rfp_detail', { rfpId: notif.rfpId });
    setTimeout(function() { switchRfpTab(notif.tab, notif.rfpId); }, 400);
  }
}

function markNotifRead(notifId) {
  const notif = appState.notifications.find(function(n){ return n.id === notifId; });
  if (notif) notif.read = true;
  appState.unreadNotifications = appState.notifications.filter(function(n){ return !n.read; }).length;
  updateBellBadge();
}

function markAllNotifsRead() {
  appState.notifications.forEach(function(n){ n.read = true; });
  appState.unreadNotifications = 0;
  updateBellBadge();
}

// 1.2 — Notification drawer toggle (slide-in drawer from right)
function toggleNotifPanel() {
  var panel = document.getElementById('notifPanel');
  var overlay = document.getElementById('notifDrawerOverlay');
  if (!panel) return;
  var isOpen = panel.classList.contains('open');
  if (isOpen) {
    panel.classList.remove('open');
    if (overlay) overlay.classList.remove('open');
  } else {
    renderNotifPanel();
    panel.classList.add('open');
    if (overlay) overlay.classList.add('open');
    markAllNotifsRead();
  }
}

function renderNotifPanel() {
  var panel = document.getElementById('notifPanel');
  if (!panel) return;
  const typeColors = { email: '#BA9765', questions: '#745B35', proposal: '#BA9765', info: '#6b7280', decline: '#dc2626', stage: '#16a34a' };
  const typeIcons  = { email: 'fa-envelope', questions: 'fa-question-circle', proposal: 'fa-inbox', info: 'fa-info-circle', decline: 'fa-times-circle', stage: 'fa-flag' };

  let html = '<div class="notif-drawer-header">'
    + '<span style="font-weight:700;font-size:0.9rem;color:#1f2937"><i class="fas fa-bell" style="margin-right:0.5rem" style="color:var(--cpc-gold-deep)"></i>' + t('notif_drawer_title') + '</span>'
    + '<div style="display:flex;gap:8px;align-items:center">'
    + '<button onclick="markAllNotifsRead();renderNotifPanel()" style="font-size:0.72rem;color:var(--cpc-gold-deep);background:none;border:none;cursor:pointer;padding:3px 6px;border-radius:4px;border:1px solid var(--cpc-gold-light)">' + t('notif_mark_all') + '</button>'
    + '<button onclick="appState.notifications=[];renderNotifPanel()" style="font-size:0.72rem;color:#9ca3af;background:none;border:none;cursor:pointer;padding:3px 6px;border-radius:4px;border:1px solid #e5e7eb">' + t('notif_clear_all') + '</button>'
    + '<button onclick="toggleNotifPanel()" style="background:none;border:none;cursor:pointer;color:#9ca3af;padding:3px 6px;font-size:1rem"><i class="fas fa-times"></i></button>'
    + '</div></div>';

  html += '<div class="notif-drawer-body">';
  if (appState.notifications.length === 0) {
    html += '<div style="padding:3rem 2rem;text-align:center">'
      + '<i class="fas fa-bell" style="font-size:2.2rem;color:#d1d5db;display:block;margin-bottom:0.75rem"></i>'
      + '<div style="font-weight:600;font-size:0.9rem;color:#6b7280;margin-bottom:0.35rem">' + t('notif_empty_title') + '</div>'
      + '<div style="font-size:0.78rem;color:#9ca3af;line-height:1.5">' + t('notif_empty_sub') + '</div></div>';
  } else {
    appState.notifications.forEach(function(n) {
      const color = typeColors[n.type] || '#6b7280';
      const icon = typeIcons[n.type] || 'fa-bell';
      const timeStr = n.time ? n.time.toLocaleString('en-AE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
      const unreadDot = !n.read ? '<span style="width:8px;height:8px;border-radius:50%;background:var(--cpc-gold);display:inline-block;flex-shrink:0"></span>' : '';
      const bg = n.read ? '' : 'background:#fefbf6;';
      html += '<div style="padding:12px 18px;border-bottom:1px solid #f3f4f6;display:flex;gap:10px;align-items:flex-start;' + bg + (n.rfpId && n.tab ? 'cursor:pointer;' : '') + '" '
        + (n.rfpId && n.tab ? 'onclick="navigateFromNotif(' + n.id + ');toggleNotifPanel()"' : '') + '>'
        + '<div style="width:32px;height:32px;border-radius:50%;background:' + color + '22;display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:2px">'
        + '<i class="fas ' + icon + '" style="color:' + color + ';font-size:0.78rem"></i></div>'
        + '<div style="flex:1;min-width:0">'
        + '<div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><span style="font-weight:600;font-size:0.82rem;color:#1f2937">' + escHtml(n.title) + '</span>' + unreadDot + '</div>'
        + '<div style="font-size:0.77rem;color:#6b7280;line-height:1.45">' + escHtml(n.message) + '</div>'
        + '<div style="font-size:0.7rem;color:#9ca3af;margin-top:4px">' + timeStr + '</div>'
        + '</div></div>';
    });
  }
  html += '</div>';
  html += '<div class="notif-drawer-footer">'
    + '<div style="font-size:0.72rem;color:#9ca3af;text-align:center">' + appState.notifications.length + ' notification' + (appState.notifications.length !== 1 ? 's' : '') + ' total</div>'
    + '</div>';
  panel.innerHTML = html;
}

function showModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}

function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}

function setContent(html) {
  document.getElementById('pageContent').innerHTML = html;
}

function escHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function scoreBar(val) {
  val = val || 0;
  return '<div class="score-bar"><div class="score-fill" style="width:' + val + '%"></div></div>';
}

// Returns short label text for an attachment label value
function attachmentLabelText(label) {
  if (label === 'technical') return 'Technical';
  if (label === 'commercial') return 'Commercial';
  return 'Document';
}

// Returns colour-coded pill HTML for an attachment label
function attachmentLabelPill(label) {
  var colors = {
    technical:  'background:#eff6ff;color:var(--cpc-ink);border:1px solid #bfdbfe',
    commercial: 'background:#f0fdf4;color:#15803d;border:1px solid #bbf7d0',
    other:      'background:#f9fafb;color:#6b7280;border:1px solid #e5e7eb',
  };
  var style = colors[label] || colors.other;
  return '<span style="' + style + ';font-size:0.65rem;font-weight:700;padding:1px 6px;border-radius:4px;text-transform:uppercase;letter-spacing:0.04em">' + attachmentLabelText(label) + '</span>';
}

function stageBadgeClass(stage) {
  const map = {
    draft: 'stage-draft',
    published: 'stage-published',
    qa_open: 'stage-qa_open',
    submissions_closed: 'stage-submissions_closed',
    evaluation: 'stage-evaluation',
    awarded: 'stage-awarded',
  };
  return map[stage] || 'stage-draft';
}

function stageLabelMap(stage) {
  var map = {
    draft:               t('stage_label_draft'),
    published:           t('stage_label_published'),
    qa_open:             t('stage_label_qa_open'),
    submissions_closed:  t('stage_label_submissions_closed'),
    evaluation:          t('stage_label_submissions_closed'),   // legacy compat
    awarded:             t('stage_label_awarded'),
  };
  return map[stage] || stage;
}

function setLoading(el, loading, text) {
  if (!el) return;
  if (loading) {
    el.disabled = true;
    el.dataset.originalText = el.innerHTML;
    el.innerHTML = '<span class="spinner" style="margin-right:6px"></span>' + (text || 'Processing...');
  } else {
    el.disabled = false;
    el.innerHTML = el.dataset.originalText || text || '';
  }
}

async function apiCall(method, path, data) {
  try {
    const opts = { method: method, headers: { 'Content-Type': 'application/json' } };
    if (data !== undefined) opts.body = JSON.stringify(data);
    const r = await fetch(API + path, opts);
    const json = await r.json();
    if (!r.ok) throw new Error(json.error || json.message || 'Request failed (' + r.status + ')');
    return json;
  } catch(e) {
    showToast(e.message, 'error');
    throw e;
  }
}

function updateHeaderDate() {
  var locale = _currentLang === 'ar' ? 'ar-AE' : 'en-AE';
  document.getElementById('headerDate').textContent = new Date().toLocaleDateString(locale, {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}
updateHeaderDate();

document.getElementById('modalOverlay').addEventListener('click', function(e) {
  if (e.target.id === 'modalOverlay') closeModal();
});

// ============================================================
// NAVIGATION
// ============================================================
var pageTitles = {
  dashboard:  [t('page_dashboard'), t('page_dashboard_sub')],
  rfps:       [t('page_rfps'),      t('page_rfps_sub')],
  vendors:    [t('page_vendors'),   t('page_vendors_sub')],
  reports:    [t('page_reports'),   t('page_reports_sub')],
  settings:   ['Settings',          'Application Settings'],
};

document.getElementById('mainNav').addEventListener('click', function(e) {
  const link = e.target.closest('[data-page]');
  if (!link) return;
  e.preventDefault();
  navigateTo(link.dataset.page);
});

function navigateTo(page, opts) {
  opts = opts || {};
  appState.previousPage = appState.currentPage;
  appState.currentPage = page;
  appState.currentRfpId = opts.rfpId || null;
  appState.currentRfpTab = opts.tab || 'generate';

  // Close notification drawer if open
  var notifPanel = document.getElementById('notifPanel');
  var notifOverlay = document.getElementById('notifDrawerOverlay');
  if (notifPanel) notifPanel.classList.remove('open');
  if (notifOverlay) notifOverlay.classList.remove('open');

  // nav active state
  document.querySelectorAll('[data-page]').forEach(function(el) {
    el.classList.toggle('active', el.dataset.page === page);
  });

  // header title
  const info = pageTitles[page] || [page, ''];
  document.getElementById('pageTitle').textContent = opts.title || info[0];
  document.getElementById('pageSubtitle').textContent = opts.subtitle || info[1];

  // back button
  const backBtn = document.getElementById('backBtn');
  if (page === 'rfp_detail' || page === 'vendor_comms') {
    backBtn.style.display = 'inline-flex';
  } else {
    backBtn.style.display = 'none';
  }

  // 1.1 — Breadcrumb bar
  updateBreadcrumb(page, opts);

  // 4.2 — Stage action banner — hide until rfp_detail sets it
  var sab = document.getElementById('stageActionBanner');
  if (sab) sab.classList.remove('visible');

  // hide lifecycle / tabs by default
  document.getElementById('lifecycleBar').style.display = 'none';
  document.getElementById('rfpTabsBar').style.display = 'none';

  setContent('<div style="display:flex;align-items:center;justify-content:center;height:160px"><div class="spinner" style="width:36px;height:36px;border-width:4px"></div></div>');

  const fn = pages[page];
  if (fn) fn(opts);
}

// 1.1 — Breadcrumb logic
function updateBreadcrumb(page, opts) {
  var bar = document.getElementById('breadcrumbBar');
  if (!bar) return;
  if (page === 'rfp_detail' && opts && opts.rfpId) {
    var rfpTitle = (appState.currentRfp && appState.currentRfp.title) || ('RFP #' + opts.rfpId);
    bar.innerHTML = '<i class="fas fa-home bc-item" onclick="navigateTo(\x27dashboard\x27)" title="Dashboard"></i>'
      + '<span class="bc-sep">›</span>'
      + '<span class="bc-item" onclick="navigateTo(\x27rfps\x27)">All RFPs</span>'
      + '<span class="bc-sep">›</span>'
      + '<span class="bc-current" id="bcRfpTitle">' + escHtml(rfpTitle.slice(0,48)) + '</span>';
    bar.classList.add('visible');
  } else if (page === 'vendor_comms' && opts && opts.rfpId) {
    bar.innerHTML = '<i class="fas fa-home bc-item" onclick="navigateTo(\x27dashboard\x27)" title="Dashboard"></i>'
      + '<span class="bc-sep">›</span>'
      + '<span class="bc-item" onclick="navigateTo(\x27rfps\x27)">All RFPs</span>'
      + '<span class="bc-sep">›</span>'
      + '<span class="bc-item" onclick="navigateTo(\x27rfp_detail\x27,{rfpId:' + opts.rfpId + '})">RFP #' + opts.rfpId + '</span>'
      + '<span class="bc-sep">›</span>'
      + '<span class="bc-current">Comms</span>';
    bar.classList.add('visible');
  } else {
    bar.classList.remove('visible');
  }
}

function goBack() {
  if (appState.currentPage === 'vendor_comms' && appState.currentRfpId) {
    navigateTo('rfp_detail', { rfpId: appState.currentRfpId, tab: 'vendors' });
  } else {
    navigateTo('rfps');
  }
}

// ============================================================
// LIFECYCLE BAR
// ============================================================
// 5 stages — Evaluation removed; renamed per v9 spec
var STAGES = ['draft','published','qa_open','submissions_closed','awarded'];
var STAGE_LABELS = [t('stage_publish'), t('stage_invite'), t('stage_qa'), t('stage_proposals'), t('stage_award')];
var STAGE_ICONS = ['fa-paper-plane','fa-envelope-open-text','fa-comments','fa-inbox','fa-trophy'];

// Explicit completion/active flags — keyed by rfpId, set when each milestone is reached
// Keys: publish, invite, qa, proposals, award
var _stageCompleted = {};
var _stageActive    = {};

function getCompletedFlags(rfpId) {
  return _stageCompleted[rfpId] || {};
}

function getActiveFlags(rfpId) {
  return _stageActive[rfpId] || {};
}

function markStageCompleted(rfpId, key) {
  if (!_stageCompleted[rfpId]) _stageCompleted[rfpId] = {};
  _stageCompleted[rfpId][key] = true;
  // Clear active for this key — it's now done
  if (_stageActive[rfpId]) delete _stageActive[rfpId][key];
  // Award implies proposals also done
  if (key === 'award') {
    _stageCompleted[rfpId]['proposals'] = true;
    if (_stageActive[rfpId]) delete _stageActive[rfpId]['proposals'];
  }
}

function markStageActive(rfpId, key) {
  if (!_stageActive[rfpId]) _stageActive[rfpId] = {};
  _stageActive[rfpId][key] = true;
  // Never active if already completed
  if (_stageCompleted[rfpId] && _stageCompleted[rfpId][key]) {
    delete _stageActive[rfpId][key];
  }
}

function renderLifecycleBar(rfp) {
  if (!rfp) return;
  const rfpId = rfp.id;
  const flags  = getCompletedFlags(rfpId);
  const active = getActiveFlags(rfpId);

  // Stage order: publish(0), invite(1), qa(2), proposals(3), award(4)
  // completed → lc-done (gold check)
  // active    → lc-active (black icon + pulse)
  // else      → lc-pending (gray)
  const completionMap = [flags.publish, flags.invite, flags.qa, flags.proposals, flags.award];
  const activeMap     = [active.publish, active.invite, active.qa, active.proposals, active.award];

  let html = '';
  for (let i = 0; i < STAGES.length; i++) {
    let cls;
    if (completionMap[i]) {
      cls = 'lc-done';
    } else if (activeMap[i]) {
      cls = 'lc-active';
    } else {
      cls = 'lc-pending';
    }
    const icon = completionMap[i] ? 'fa-check' : STAGE_ICONS[i];
    var tooltipText = completionMap[i] ? (STAGE_LABELS[i] + ' — Completed') : (activeMap[i] ? STAGE_LABELS[i] + ' — In Progress' : STAGE_LABELS[i] + ' — Pending');
    html += '<div class="lc-step ' + cls + '" style="position:relative">';
    html += '<div class="lc-node">';
    html += '<div class="lc-circle" title="' + tooltipText + '"><i class="fas ' + icon + '" style="font-size:0.72rem;line-height:1"></i></div>';
    html += '<div class="lc-label">' + escHtml(STAGE_LABELS[i]) + '</div>';
    html += '</div>';
    html += '<div class="lc-tooltip">' + tooltipText + '</div>';
    if (i < STAGES.length - 1) html += '<div class="lc-connector"></div>';
    html += '</div>';
  }

  document.getElementById('lifecycleBar').innerHTML = '<div class="lifecycle-bar">' + html + '</div>';
  document.getElementById('lifecycleBar').style.display = 'block';
}

// ============================================================
// RFP TABS BAR
// ============================================================
var RFP_TABS = [
  { id: 'generate',   icon: 'fa-file-alt',  label: t('tab_generate') },
  { id: 'vendors',    icon: 'fa-building',  label: t('tab_vendors') },
  { id: 'qa',         icon: 'fa-comments',  label: t('tab_qa') },
  { id: 'proposals',  icon: 'fa-inbox',     label: t('tab_proposals') },
];

// 4.3 — unreadComms counter for the Vendors tab (comms badge)
function renderRfpTabs(activeTab, rfpId, qaBadge) {
  let html = '<div class="rfp-tabs">';
  RFP_TABS.forEach(function(tab) {
    const isActive = tab.id === activeTab;
    // Q&A badge
    const qaBadgeHtml = (tab.id === 'qa' && qaBadge) ? '<span style="background:#ef4444;color:white;border-radius:10px;padding:1px 6px;font-size:0.68rem;margin-left:4px;font-weight:700">' + (typeof qaBadge === 'number' && qaBadge > 0 ? qaBadge : '!') + '</span>' : '';
    // Proposals badge
    const propsBadgeCount = appState.unreadProposals || 0;
    const propsBadgeHtml = (tab.id === 'proposals' && propsBadgeCount > 0) ? '<span style="background:#ef4444;color:white;border-radius:10px;padding:1px 6px;font-size:0.68rem;margin-left:4px;font-weight:700">' + propsBadgeCount + '</span>' : '';
    // Vendors tab badge — new declines or incoming emails
    const vendorsBadgeCount = appState.unreadVendors || 0;
    const commsBadgeHtml = (tab.id === 'vendors' && vendorsBadgeCount > 0) ? '<span style="background:#ef4444;color:white;border-radius:10px;padding:1px 6px;font-size:0.68rem;margin-left:4px;font-weight:700">' + vendorsBadgeCount + '</span>' : '';
    html += '<div class="rfp-tab' + (isActive ? ' active' : '') + '" onclick="switchRfpTab(\x27' + tab.id + '\x27,' + rfpId + ')">';
    html += '<i class="fas ' + tab.icon + '"></i>' + escHtml(tab.label) + qaBadgeHtml + propsBadgeHtml + commsBadgeHtml;
    html += '</div>';
  });
  html += '</div>';
  document.getElementById('rfpTabsBar').innerHTML = html;
  document.getElementById('rfpTabsBar').style.display = 'block';
}

function switchRfpTab(tab, rfpId) {
  appState.currentRfpTab = tab;
  // Clear Q&A unread badge when user navigates to the Q&A tab
  if (tab === 'qa' && appState.unreadQA) {
    appState.unreadQA = 0;   // clear badge when user navigates to Q&A
  }
  // Clear proposals badge when user navigates to the Proposals tab
  if (tab === 'proposals' && appState.unreadProposals) {
    appState.unreadProposals = 0;
  }
  // Clear vendors badge when user navigates to the Vendors tab
  if (tab === 'vendors' && appState.unreadVendors) {
    appState.unreadVendors = 0;
  }
  renderRfpTabs(tab, rfpId, appState.unreadQA);
  const rfp = appState.currentRfp;
  const tabFn = rfpTabs[tab];
  if (tabFn) {
    setContent('<div style="display:flex;align-items:center;justify-content:center;height:120px"><div class="spinner" style="width:32px;height:32px;border-width:3px"></div></div>');
    tabFn(rfpId, rfp);
  }
}

// ============================================================
// INIT
// ============================================================
async function init() {
  // Apply saved language before first render
  applyTranslations();
  // 1.3 — Set correct active pill button on load
  var savedLang = localStorage.getItem('cpc_lang') || 'en';
  var btnEn = document.getElementById('langBtnEn');
  var btnAr = document.getElementById('langBtnAr');
  if (btnEn) btnEn.classList.toggle('active', savedLang === 'en');
  if (btnAr) btnAr.classList.toggle('active', savedLang === 'ar');

  // Set header date
  var headerDate = document.getElementById('headerDate');
  if (headerDate) {
    headerDate.textContent = new Date().toLocaleDateString('en-AE', { weekday:'short', year:'numeric', month:'short', day:'numeric' });
  }

  // 1.4 — Global keyboard shortcuts
  document.addEventListener('keydown', function(e) {
    // Cmd+K / Ctrl+K — open command palette
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      openCmdPalette();
      return;
    }
    // Escape — close modals, panels
    if (e.key === 'Escape') {
      // Close command palette
      closeCmdPalette();
      // Close notification drawer
      var notifPanel = document.getElementById('notifPanel');
      var notifOverlay = document.getElementById('notifDrawerOverlay');
      if (notifPanel && notifPanel.classList.contains('open')) {
        notifPanel.classList.remove('open');
        if (notifOverlay) notifOverlay.classList.remove('open');
      }
      // Close confirm dialog
      var confirmOverlay = document.getElementById('confirmDialogOverlay');
      if (confirmOverlay && confirmOverlay.classList.contains('open')) {
        confirmOverlay.classList.remove('open');
      }
      // 5.4 — Escape closes scoring matrix modal
      var modalOverlay = document.getElementById('modalOverlay');
      if (modalOverlay && modalOverlay.classList.contains('open')) {
        closeModal();
      }
      // Close proposal side panel
      if (document.getElementById('proposalSidePanel')) {
        closeProposalPanel();
      }
    }
  });

  // 14.5 — Trap focus in modal when open
  document.getElementById('modalOverlay').addEventListener('keydown', function(e) {
    if (e.key !== 'Tab') return;
    var focusable = this.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])');
    if (!focusable.length) return;
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (e.shiftKey ? document.activeElement === first : document.activeElement === last) {
      e.preventDefault();
      (e.shiftKey ? last : first).focus();
    }
  });

  try { await apiCall('POST', '/init', {}); } catch(e) {}
  navigateTo('dashboard');
}

// ── 1.4 Command palette ──────────────────────────────────────────────────────
function openCmdPalette() {
  var overlay = document.getElementById('cmdPaletteOverlay');
  var input   = document.getElementById('cmdInput');
  if (!overlay) return;
  overlay.classList.add('open');
  if (input) { input.value = ''; input.focus(); }
  renderCmdResults();
}

function closeCmdPalette() {
  var overlay = document.getElementById('cmdPaletteOverlay');
  if (overlay) overlay.classList.remove('open');
}

function renderCmdResults() {
  var input   = document.getElementById('cmdInput');
  var results = document.getElementById('cmdResults');
  var empty   = document.getElementById('cmdEmpty');
  if (!results) return;
  var q = (input ? input.value : '').toLowerCase().trim();

  // Build items: nav pages + RFPs from state
  var items = [
    { icon: 'fa-chart-pie',    label: 'Dashboard',        sub: 'Page', action: function(){ navigateTo('dashboard'); closeCmdPalette(); } },
    { icon: 'fa-layer-group',  label: 'All RFPs',         sub: 'Page', action: function(){ navigateTo('rfps'); closeCmdPalette(); } },
    { icon: 'fa-building',     label: 'Vendor Registry',  sub: 'Page', action: function(){ navigateTo('vendors'); closeCmdPalette(); } },
    { icon: 'fa-chart-bar',    label: 'Reports',          sub: 'Page', action: function(){ navigateTo('reports'); closeCmdPalette(); } },
    { icon: 'fa-cog',          label: 'Settings',         sub: 'Page', action: function(){ navigateTo('settings'); closeCmdPalette(); } },
    { icon: 'fa-plus-circle',  label: 'New RFP',          sub: 'Action', action: function(){ closeCmdPalette(); showCreateRfpModal(); } },
  ];
  // Add RFPs from appState
  (appState.rfps || []).forEach(function(rfp) {
    items.push({
      icon: 'fa-file-alt',
      label: rfp.title || 'Untitled RFP',
      sub: (rfp.stage || 'draft').replace(/_/g,' '),
      action: function(){ navigateTo('rfp_detail', { rfpId: rfp.id }); closeCmdPalette(); }
    });
  });
  // Add vendors from state
  (appState.vendors || []).forEach(function(v) {
    items.push({
      icon: 'fa-building',
      label: v.name || 'Vendor',
      sub: v.category || 'Vendor',
      action: function(){ navigateTo('vendors'); closeCmdPalette(); setTimeout(function(){ viewVendorDetail(v.id); }, 400); }
    });
  });

  var filtered = q ? items.filter(function(item){ return item.label.toLowerCase().includes(q) || item.sub.toLowerCase().includes(q); }) : items;

  if (filtered.length === 0) {
    results.innerHTML = '';
    if (empty) empty.style.display = 'block';
    return;
  }
  if (empty) empty.style.display = 'none';
  results.innerHTML = filtered.slice(0, 8).map(function(item, idx) {
    return '<div class="cmd-item" data-idx="' + idx + '" onclick="cmdItemClick(' + idx + ')">'
      + '<i class="fas ' + item.icon + '"></i>'
      + '<span>' + escHtml(item.label) + '</span>'
      + '<span class="cmd-item-sub">' + escHtml(item.sub) + '</span>'
      + '</div>';
  }).join('');
  // Store filtered for keyboard nav
  document.getElementById('cmdPalette')._cmdItems = filtered;
}

function cmdItemClick(idx) {
  var palette = document.getElementById('cmdPalette');
  var items = palette ? palette._cmdItems : [];
  if (items && items[idx]) items[idx].action();
}

function handleCmdKey(e) {
  var results = document.getElementById('cmdResults');
  if (!results) return;
  var items = results.querySelectorAll('.cmd-item');
  var selected = results.querySelector('.cmd-item.selected');
  var selIdx = selected ? parseInt(selected.dataset.idx) : -1;
  if (e.key === 'ArrowDown') {
    e.preventDefault();
    var next = selIdx < items.length - 1 ? selIdx + 1 : 0;
    items.forEach(function(el){ el.classList.remove('selected'); });
    if (items[next]) items[next].classList.add('selected');
  } else if (e.key === 'ArrowUp') {
    e.preventDefault();
    var prev = selIdx > 0 ? selIdx - 1 : items.length - 1;
    items.forEach(function(el){ el.classList.remove('selected'); });
    if (items[prev]) items[prev].classList.add('selected');
  } else if (e.key === 'Enter') {
    if (selected) { selected.click(); }
    else if (items.length > 0) { items[0].click(); }
  }
}

// ── 14.4 Confirm dialog helper ────────────────────────────────────────────────
function showConfirm(opts, onConfirm, onCancel) {
  // opts: { title, body, type='danger'|'warning'|'info', list=[], confirmText, cancelText }
  var type = opts.type || 'danger';
  var iconMap = { danger: 'fa-trash-alt', warning: 'fa-exclamation-triangle', info: 'fa-info-circle' };
  var iconEl   = document.getElementById('confirmIcon');
  var titleEl  = document.getElementById('confirmTitle');
  var bodyEl   = document.getElementById('confirmBody');
  var listEl   = document.getElementById('confirmList');
  var actionsEl = document.getElementById('confirmActions');
  var overlay  = document.getElementById('confirmDialogOverlay');
  if (!overlay) return;

  iconEl.className = 'confirm-icon ' + type;
  iconEl.innerHTML = '<i class="fas ' + (iconMap[type] || 'fa-question-circle') + '"></i>';
  titleEl.textContent = opts.title || 'Are you sure?';
  bodyEl.innerHTML = opts.body || '';
  if (opts.list && opts.list.length > 0) {
    listEl.style.display = '';
    listEl.innerHTML = '<ul style="margin:0;padding-left:1.2rem">' + opts.list.map(function(l){ return '<li>' + escHtml(l) + '</li>'; }).join('') + '</ul>';
  } else {
    listEl.style.display = 'none';
    listEl.innerHTML = '';
  }
  actionsEl.innerHTML = '<button class="btn-ghost" id="confirmCancelBtn">' + (opts.cancelText || t('confirm_cancel_btn')) + '</button>'
    + '<button class="btn-primary" id="confirmOkBtn" style="background:' + (type === 'danger' ? '#dc2626' : type === 'warning' ? '#d97706' : 'var(--cpc-gold)') + ';border-color:' + (type === 'danger' ? '#dc2626' : type === 'warning' ? '#d97706' : 'var(--cpc-gold)') + '">' + (opts.confirmText || t('confirm_destructive_btn')) + '</button>';

  overlay.classList.add('open');
  document.getElementById('confirmOkBtn').focus();

  document.getElementById('confirmOkBtn').onclick = function() {
    overlay.classList.remove('open');
    if (onConfirm) onConfirm();
  };
  document.getElementById('confirmCancelBtn').onclick = function() {
    overlay.classList.remove('open');
    if (onCancel) onCancel();
  };
}

// ── 14.2 Skeleton loading helper ─────────────────────────────────────────────
function skeletonCards(count, cols) {
  cols = cols || 2;
  var cards = '';
  for (var i = 0; i < count; i++) {
    cards += '<div class="skeleton-card">'
      + '<div class="skeleton skeleton-title" style="width:' + (45 + Math.random()*30) + '%"></div>'
      + '<div class="skeleton skeleton-text" style="width:' + (60 + Math.random()*30) + '%"></div>'
      + '<div class="skeleton skeleton-text" style="width:' + (40 + Math.random()*20) + '%"></div>'
      + '</div>';
  }
  return '<div style="display:grid;grid-template-columns:repeat(' + cols + ',1fr);gap:1rem">' + cards + '</div>';
}

function skeletonTable(rows, cols) {
  rows = rows || 5; cols = cols || 4;
  var rowsHtml = '';
  for (var i = 0; i < rows; i++) {
    var cells = '';
    for (var j = 0; j < cols; j++) {
      cells += '<td><div class="skeleton skeleton-text" style="width:' + (50 + Math.random()*40) + '%"></div></td>';
    }
    rowsHtml += '<tr>' + cells + '</tr>';
  }
  return rowsHtml;
}

// ── 14.1 Inline form validation helpers ──────────────────────────────────────
function setFieldError(fieldId, msg) {
  var el = document.getElementById(fieldId);
  if (!el) return;
  el.style.borderColor = '#dc2626';
  var errId = fieldId + '_err';
  var existing = document.getElementById(errId);
  if (existing) existing.remove();
  var err = document.createElement('div');
  err.id = errId;
  err.style.cssText = 'font-size:0.72rem;color:#dc2626;margin-top:2px';
  err.textContent = msg;
  el.parentNode.insertBefore(err, el.nextSibling);
}

function clearFieldError(fieldId) {
  var el = document.getElementById(fieldId);
  if (el) el.style.borderColor = '';
  var existing = document.getElementById(fieldId + '_err');
  if (existing) existing.remove();
}

function validateRequired(fieldId, label) {
  var el = document.getElementById(fieldId);
  if (!el || !el.value.trim()) {
    setFieldError(fieldId, (label || 'This field') + ' ' + t('val_required'));
    return false;
  }
  clearFieldError(fieldId);
  return true;
}

// ============================================================
// PAGE: DASHBOARD
// ============================================================
var pages = {};

pages.dashboard = async function() {
  // Show skeleton immediately — no blank page while waiting for API
  setContent(skeletonCards(6));

  // Fetch stats AND rfps in parallel — only fetch rfps if not already cached
  var defaultStats = { totalRfps:0, activeRfps:0, awardedRfps:0, winRate:0, totalVendors:0, totalProposals:0, totalEmails:0, avgDuration:null, stageBreakdown:[] };
  var statsPromise = apiCall('GET', '/stats').catch(function(){ return defaultStats; });
  var rfpsPromise = (appState.rfps && appState.rfps.length)
    ? Promise.resolve(appState.rfps)
    : apiCall('GET', '/rfps').catch(function(){ return []; });

  var results = await Promise.all([statsPromise, rfpsPromise]);
  var stats = results[0];
  var rfps  = results[1];
  appState.rfps = rfps; // cache so context cards are accurate

  const stageBreakdown = stats.stageBreakdown || [];
  const maxStage = stageBreakdown.reduce(function(m,s){ return Math.max(m, s.cnt); }, 1);

  // KPI cards
  const kpis = [
    { label:t('dash_total_rfps'),      value: stats.totalRfps || 0,      icon:'fa-layer-group',   color:'#745B35', sub: (stats.activeRfps||0) + ' ' + t('dash_active_suffix'),  trend: stats.totalRfps > 0 ? 0 : null },
    { label:t('dash_win_rate'),        value: (stats.winRate||0) + '%',  icon:'fa-trophy',        color:'#BA9765', sub: (stats.awardedRfps||0) + ' ' + t('dash_awarded_suffix'), trend: null },
    { label:t('dash_avg_duration'),    value: stats.avgDuration ? stats.avgDuration + 'd' : 'N/A', icon:'fa-clock', color:'#065f46', sub: t('dash_per_rfp'), trend: null },
    { label:t('dash_vendor_pool'),     value: stats.totalVendors || 0,   icon:'fa-building',      color:'#BA9765', sub: t('dash_reg_vendors'), trend: null },
    { label:t('dash_proposals_lbl'),   value: stats.totalProposals || 0, icon:'fa-inbox',         color:'#dc6803', sub: t('dash_total_recv'), trend: stats.totalProposals > 0 ? null : null },
    { label:t('dash_emails_sent'),     value: stats.totalEmails || 0,    icon:'fa-envelope',      color:'#1d4ed8', sub: t('dash_inv_replies'), trend: null },
  ];
  // 2.1 — KPI trend indicators (compare to previous period via stats.prev if available)
  let kpiHtml = '';
  kpis.forEach(function(k) {
    var trendHtml = '';
    if (k.trend !== undefined && k.trend !== null) {
      var up = k.trend >= 0;
      trendHtml = '<span style="font-size:0.7rem;font-weight:600;color:' + (up ? '#059669' : '#dc2626') + ';background:' + (up ? '#d1fae5' : '#fee2e2') + ';border-radius:4px;padding:1px 5px;margin-left:4px">'
        + (up ? '↑' : '↓') + ' ' + Math.abs(k.trend) + '%</span>';
    }
    kpiHtml += '<div class="stat-card" style="cursor:default">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between">'
      + '<div style="width:40px;height:40px;border-radius:10px;background:' + k.color + '18;display:flex;align-items:center;justify-content:center">'
      + '<i class="fas ' + k.icon + '" style="color:' + k.color + ';font-size:1rem"></i></div>'
      + '<div style="text-align:right"><div class="stat-value" style="color:' + k.color + '">' + k.value + '</div>' + trendHtml + '</div>'
      + '</div>'
      + '<div class="stat-label">' + k.label + '</div>'
      + '<div style="font-size:0.72rem;color:#9ca3af;margin-top:2px">' + k.sub + '</div>'
      + '</div>';
  });

  // Build clickable stage bars (2.3)
  var stageBarClickable = '';
  if (stageBreakdown.length > 0) {
    stageBreakdown.forEach(function(s) {
      var h = Math.max(8, Math.round((s.cnt / maxStage) * 50));
      stageBarClickable += '<div style="display:flex;flex-direction:column;align-items:center;gap:4px;flex:1;cursor:pointer" title="' + stageLabelMap(s.stage) + ': ' + s.cnt + '" onclick="navigateTo(\x27rfps\x27,{filterStage:\x27' + s.stage + '\x27})"><div style="font-size:0.7rem;font-weight:700;color:#374151">' + s.cnt + '</div><div class="mini-bar-item" style="height:' + h + 'px" onmouseover="this.style.opacity=\x270.65\x27" onmouseout="this.style.opacity=\x271\x27"></div><div style="font-size:0.65rem;color:#9ca3af;text-align:center">' + stageLabelMap(s.stage) + '</div></div>';
    });
  } else { stageBarClickable = '<div style="color:#9ca3af;font-size:0.85rem;padding:1rem">' + t('dash_no_rfp_data') + '</div>'; }

  // Contextual action cards (2.2)
  var contextCards = '';
  var _dRfps = (appState.rfps||[]).filter(function(r){ return r.stage==='draft'; });
  var _qRfps = (appState.rfps||[]).filter(function(r){ return r.stage==='qa_open'; });
  var _cRfps = (appState.rfps||[]).filter(function(r){ return r.stage==='submissions_closed'; });
  if (_dRfps.length) contextCards += '<div class="card" style="padding:0.875rem 1rem;border-left:3px solid var(--cpc-gold);cursor:pointer;margin-bottom:0" onclick="navigateTo(\x27rfps\x27,{filterStage:\x27draft\x27})"><div style="font-size:0.72rem;color:var(--cpc-gold);font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Action Needed</div><div style="font-size:0.88rem;font-weight:600;color:#1f2937;margin-top:2px">' + _dRfps.length + ' draft RFP' + (_dRfps.length>1?'s':'') + ' awaiting publish</div></div>';
  if (_qRfps.length) { var _pqa = _qRfps.reduce(function(n,r){ return n+(r.pending_qa||0); },0); if (_pqa) contextCards += '<div class="card" style="padding:0.875rem 1rem;border-left:3px solid #f59e0b;cursor:pointer;margin-bottom:0" onclick="navigateTo(\x27rfps\x27,{filterStage:\x27qa_open\x27})"><div style="font-size:0.72rem;color:#f59e0b;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Pending Q&amp;A</div><div style="font-size:0.88rem;font-weight:600;color:#1f2937;margin-top:2px">' + _pqa + ' unanswered question' + (_pqa>1?'s':'') + '</div></div>'; }
  if (_cRfps.length) contextCards += '<div class="card" style="padding:0.875rem 1rem;border-left:3px solid #10b981;cursor:pointer;margin-bottom:0" onclick="navigateTo(\x27rfps\x27,{filterStage:\x27submissions_closed\x27})"><div style="font-size:0.72rem;color:#10b981;font-weight:700;text-transform:uppercase;letter-spacing:0.05em">Ready to Evaluate</div><div style="font-size:0.88rem;font-weight:600;color:#1f2937;margin-top:2px">' + _cRfps.length + ' RFP' + (_cRfps.length>1?'s':'') + ' ready for award</div></div>';
  if (!contextCards) contextCards = '<div style="color:#9ca3af;font-size:0.85rem;padding:0.25rem 0">' + t('dash_no_rfp_data') + '</div>';

  setContent(
    '<div style="display:flex;flex-direction:column;gap:1.25rem">'
    // KPI grid
    + '<div style="display:grid;grid-template-columns:repeat(6,1fr);gap:0.875rem">' + kpiHtml + '</div>'
    // Row 2: clickable stage bars + pipeline actions
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">'
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;font-size:0.9rem;margin:0 0 0.5rem"><i class="fas fa-chart-bar cpc-gold" style="margin-right:0.5rem"></i>' + t('dash_stage_breakdown') + ' <span style="font-size:0.7rem;color:#9ca3af;font-weight:400">(click to filter)</span></h3>'
    + '<div class="mini-bar" style="align-items:flex-end;gap:8px">' + stageBarClickable + '</div>'
    + '</div>'
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;color:#1f2937;font-size:0.9rem;margin:0 0 0.75rem"><i class="fas fa-bolt cpc-gold" style="margin-right:0.5rem"></i>Pipeline Actions</h3>'
    + '<div style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:0.75rem">' + contextCards + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.5rem;border-top:1px solid #f3f4f6;padding-top:0.75rem">'
    + '<button class="btn-primary" style="flex-direction:column;padding:0.75rem;justify-content:center" onclick="showCreateRfpModal()"><i class="fas fa-plus-circle" style="font-size:1.1rem;margin-bottom:3px"></i><span style="font-size:0.78rem">' + t('qa_btn_new_rfp') + '</span></button>'
    + '<button class="btn-secondary" style="flex-direction:column;padding:0.75rem;justify-content:center" onclick="navigateTo(\x27rfps\x27)"><i class="fas fa-layer-group" style="font-size:1.1rem;margin-bottom:3px"></i><span style="font-size:0.78rem">' + t('qa_btn_all_rfps') + '</span></button>'
    + '<button class="btn-ghost" style="flex-direction:column;padding:0.75rem;justify-content:center" onclick="navigateTo(\x27vendors\x27)"><i class="fas fa-building" style="font-size:1.1rem;margin-bottom:3px"></i><span style="font-size:0.78rem">' + t('qa_btn_vendors') + '</span></button>'
    + '<button class="btn-ghost" style="flex-direction:column;padding:0.75rem;justify-content:center" onclick="navigateTo(\x27reports\x27)"><i class="fas fa-chart-line" style="font-size:1.1rem;margin-bottom:3px"></i><span style="font-size:0.78rem">' + t('qa_btn_reports') + '</span></button>'
    + '</div></div>'
    + '</div>'
    + '</div>'
  );};

// ============================================================
// PAGE: ALL RFPs
// ============================================================
pages.rfps = async function() {
  setContent(skeletonCards(6));
  const [rfps, rfpSummary] = await Promise.all([
    apiCall('GET', '/rfps').catch(function(){ return []; }),
    apiCall('GET', '/rfps/summary').catch(function(){ return {}; })
  ]);
  appState.rfps = rfps;
  appState.rfpSummary = rfpSummary || {};

  if (rfps.length === 0) {
    setContent(
      '<div style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:400px;gap:1.25rem">'
      + '<div style="width:80px;height:80px;border-radius:50%;background:#f3f4f6;display:flex;align-items:center;justify-content:center">'
      + '<i class="fas fa-file-circle-plus" style="font-size:2rem;color:#d1d5db"></i></div>'
      + '<div style="text-align:center"><h2 style="font-size:1.25rem;font-weight:700;color:#374151;margin:0 0 0.5rem">' + t('no_rfps_title') + '</h2>'
      + '<p style="color:#9ca3af;margin:0">' + t('no_rfps_sub') + '</p></div>'
      + '<button class="btn-primary" onclick="showCreateRfpModal()"><i class="fas fa-plus"></i>' + t('btn_create_rfp') + '</button>'
      + '</div>'
    );
    return;
  }

  // Split into active and archived (awarded = archived)
  const activeRfps = rfps.filter(function(r){ return r.stage !== 'awarded'; });
  const archivedRfps = rfps.filter(function(r){ return r.stage === 'awarded'; });

  function buildRfpCard(rfp) {
    const stage = rfp.stage || 'draft';
    const isArchived = stage === 'awarded';
    const badgeCls = stageBadgeClass(stage);
    const stageLabel = stageLabelMap(stage);
    const stageIdx = STAGES.indexOf(stage);
    const dateStr = rfp.created_at ? new Date(rfp.created_at).toLocaleDateString('en-AE', {year:'numeric',month:'short',day:'numeric'}) : '-';
    const progressPct = isArchived ? 100 : Math.round(((stageIdx + 1) / STAGES.length) * 100);

    // Per-RFP activity counts from summary endpoint
    var sm = (appState.rfpSummary || {})[rfp.id] || {};
    var unansweredQ    = sm.unanswered_questions   || 0;
    var unreadEmails   = sm.unread_emails           || 0;
    var declinedV      = sm.declined_vendors        || 0;
    var unevaluatedP   = sm.unevaluated_proposals   || 0;

    // Activity pill builder — only shown when count > 0
    function actPill(icon, count, color, title) {
      if (!count) return '';
      return '<span title="' + title + '" style="display:inline-flex;align-items:center;gap:3px;background:' + color + '1a;color:' + color + ';border:1px solid ' + color + '33;border-radius:20px;padding:2px 7px;font-size:0.7rem;font-weight:700">'
        + '<i class="fas ' + icon + '" style="font-size:0.62rem"></i>' + count + '</span>';
    }

    var activityPills = actPill('fa-question-circle', unansweredQ, '#7c3aed', unansweredQ + ' unanswered question(s)')
      + actPill('fa-envelope',       unreadEmails,  '#2563eb', unreadEmails  + ' unread email(s)')
      + actPill('fa-times-circle',   declinedV,     '#dc2626', declinedV     + ' vendor(s) declined')
      + actPill('fa-robot',          unevaluatedP,  '#d97706', unevaluatedP  + ' proposal(s) not evaluated');

    return '<div class="rfp-card" onclick="openRfp(' + rfp.id + ')" style="' + (isArchived ? 'opacity:0.85;border-left:4px solid var(--cpc-gold)' : '') + '">'
      + '<div style="display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:0.75rem">'
      + '<div style="flex:1;min-width:0">'
      + '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.3rem;flex-wrap:wrap">'
      + '<span style="font-size:0.72rem;color:#9ca3af;font-family:monospace">' + escHtml(rfp.ref_number||'') + '</span>'
      + '<span class="stage-badge ' + badgeCls + '">' + stageLabel + '</span>'
      + (isArchived ? '<span style="background:#d1fae5;color:#065f46;border-radius:4px;padding:1px 6px;font-size:0.68rem;font-weight:700"><i class="fas fa-trophy" style="margin-right:0.25rem"></i>' + t('card_awarded_badge') + '</span>' : '')
      + '</div>'
      + '<h3 style="font-weight:700;color:#1f2937;font-size:0.97rem;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(rfp.title||'Untitled RFP') + '</h3>'
      + '<p style="color:#6b7280;font-size:0.8rem;margin:0.2rem 0 0">' + escHtml(rfp.category||'') + ' &bull; ' + t('card_created') + ' ' + dateStr + '</p>'
      + '</div>'
      + '<div style="margin-left:1rem;text-align:right;flex-shrink:0">'
      + (isArchived
        ? '<div style="font-size:1.1rem;font-weight:700;color:#065f46"><i class="fas fa-trophy"></i></div><div style="font-size:0.7rem;color:#9ca3af">' + t('card_completed') + '</div>'
        : '<div style="font-size:1.5rem;font-weight:700;color:var(--cpc-ink)">' + progressPct + '%</div><div style="font-size:0.7rem;color:#9ca3af">' + t('card_complete') + '</div>')
      + '</div>'
      + '</div>'
      // Progress bar
      + '<div style="margin-bottom:0.5rem">'
      + '<div style="height:4px;border-radius:2px;background:#e5e7eb;overflow:hidden">'
      + '<div style="height:100%;background:' + (isArchived ? 'var(--cpc-gold)' : 'linear-gradient(90deg,var(--cpc-ink),var(--cpc-gold))') + ';width:' + progressPct + '%;border-radius:2px;transition:width 0.3s ease"></div>'
      + '</div></div>'
      // Activity pills row — only rendered when there's something to show
      + (activityPills ? '<div style="display:flex;gap:5px;flex-wrap:wrap;margin-bottom:0.5rem">' + activityPills + '</div>' : '')
      + '<div style="display:flex;align-items:center;justify-content:space-between">'
      + '<div style="font-size:0.78rem;color:#9ca3af">'
      + (rfp.deadline ? '<i class="fas fa-calendar-alt" style="margin-right:4px"></i>' + t('card_deadline') + ' ' + new Date(rfp.deadline).toLocaleDateString(_currentLang === 'ar' ? 'ar-AE' : 'en-AE') : '<i class="fas fa-infinity" style="margin-right:4px"></i>' + t('card_no_deadline'))
      + '</div>'
      + '<div style="font-size:0.78rem;color:' + (isArchived ? '#065f46' : 'var(--cpc-ink)') + ';font-weight:600">' + t('card_open') + ' <i class="fas fa-arrow-right" style="margin-left:4px"></i></div>'
      + '</div>'
      + '<div style="display:flex;gap:0.5rem;border-top:1px solid #f3f4f6;padding-top:0.625rem;margin-top:0.5rem" onclick="event.stopPropagation()">'
      + '<button class="btn-ghost btn-sm" onclick="event.stopPropagation();openRfp(' + rfp.id + ')" style="flex:1;justify-content:center"><i class="fas fa-arrow-right"></i> ' + t('card_menu_open') + '</button>'
      + (!isArchived ? '<button class="btn-ghost btn-sm" onclick="event.stopPropagation();archiveRfp(' + rfp.id + ')" title="' + t('card_menu_archive') + '"><i class="fas fa-archive"></i></button>' : '')
      + '<button class="btn-ghost btn-sm" onclick="event.stopPropagation();deleteRfpConfirm(' + rfp.id + ')" title="' + t('card_menu_delete') + '" style="color:#ef4444"><i class="fas fa-trash"></i></button>'
      + '</div>'
      + '</div>';
  }

  let activeCardsHtml = '';
  activeRfps.forEach(function(rfp) { activeCardsHtml += buildRfpCard(rfp); });

  let archivedCardsHtml = '';
  archivedRfps.forEach(function(rfp) { archivedCardsHtml += buildRfpCard(rfp); });

  // 3.2 — filter/sort state
  var _rfpFilter = window._rfpFilter || { stage: '', sort: 'newest', view: 'grid' };
  window._rfpFilter = _rfpFilter;

  function filterAndSortRfps(list) {
    var out = list.slice();
    if (_rfpFilter.stage) out = out.filter(function(r){ return r.stage === _rfpFilter.stage; });
    if (_rfpFilter.sort === 'newest') out.sort(function(a,b){ return (b.id||0)-(a.id||0); });
    else if (_rfpFilter.sort === 'oldest') out.sort(function(a,b){ return (a.id||0)-(b.id||0); });
    else if (_rfpFilter.sort === 'az') out.sort(function(a,b){ return (a.title||'').localeCompare(b.title||''); });
    return out;
  }

  var filteredActive   = filterAndSortRfps(activeRfps);
  var filteredArchived = filterAndSortRfps(archivedRfps);

  var stageOpts = ['','draft','published','qa_open','submissions_closed'].map(function(s){
    return '<option value="' + s + '"' + (_rfpFilter.stage === s ? ' selected' : '') + '>'
      + (s ? stageLabelMap(s) : 'All Stages') + '</option>';
  }).join('');

  var gridCols = _rfpFilter.view === 'list' ? '1fr' : 'repeat(2,1fr)';

  // Compact filter strip: stage + sort + view toggle (no New RFP — that stays separate on the right)
  var filterStrip = '<div style="display:flex;align-items:center;gap:5px">'
    + '<select style="border:1px solid #e5e7eb;border-radius:6px;padding:2px 6px;font-size:0.75rem;background:white;color:#374151;height:26px;cursor:pointer" onchange="window._rfpFilter.stage=this.value;pages.rfps()">' + stageOpts + '</select>'
    + '<select style="border:1px solid #e5e7eb;border-radius:6px;padding:2px 6px;font-size:0.75rem;background:white;color:#374151;height:26px;cursor:pointer" onchange="window._rfpFilter.sort=this.value;pages.rfps()">'
    + '<option value="newest"' + (_rfpFilter.sort==='newest'?' selected':'') + '>Newest</option>'
    + '<option value="oldest"' + (_rfpFilter.sort==='oldest'?' selected':'') + '>Oldest</option>'
    + '<option value="az"' + (_rfpFilter.sort==='az'?' selected':'') + '>A–Z</option>'
    + '</select>'
    + '<div style="display:inline-flex;border:1px solid #e5e7eb;border-radius:6px;height:30px;flex-shrink:0">'
    + '<button onclick="window._rfpFilter.view=\x27grid\x27;pages.rfps()" style="border:none;padding:0 12px;display:flex;align-items:center;gap:5px;background:' + (_rfpFilter.view==='grid'?'var(--cpc-ink)':'white') + ';color:' + (_rfpFilter.view==='grid'?'white':'#6b7280') + ';cursor:pointer;font-size:0.75rem;font-weight:500;border-radius:5px 0 0 5px" title="Grid view"><i class="fas fa-th-large" style="font-size:0.7rem"></i> Grid</button>'
    + '<button onclick="window._rfpFilter.view=\x27list\x27;pages.rfps()" style="border:none;border-left:1px solid #e5e7eb;padding:0 12px;display:flex;align-items:center;gap:5px;background:' + (_rfpFilter.view==='list'?'var(--cpc-ink)':'white') + ';color:' + (_rfpFilter.view==='list'?'white':'#6b7280') + ';cursor:pointer;font-size:0.75rem;font-weight:500;border-radius:0 5px 5px 0" title="List view"><i class="fas fa-list" style="font-size:0.7rem"></i> List</button>'
    + '</div>'
    + '</div>';

  let content = '<div style="display:flex;flex-direction:column;gap:1.5rem">'
    // Row 1: title + New RFP button (these two never compete for space)
    + '<div style="display:flex;align-items:center;gap:0.75rem">'
    + '<div><h2 style="font-weight:700;color:#1f2937;font-size:1rem;margin:0">' + t('active_procurements') + '</h2>'
    + '<p style="color:#9ca3af;font-size:0.82rem;margin:0">' + activeRfps.length + ' ' + t('rfps_in_progress') + '</p></div>'
    + '<div style="margin-left:auto">'
    + '<button class="btn-primary" style="white-space:nowrap" onclick="showCreateRfpModal()"><i class="fas fa-plus"></i>' + t('btn_new_rfp') + '</button>'
    + '</div>'
    + '</div>'
    // Row 2: filter strip on its own line — always has full width, never squeezes
    + '<div style="display:flex;align-items:center;gap:8px">'
    + filterStrip
    + '</div>';

  var filteredActiveCards = '';
  filteredActive.forEach(function(rfp) { filteredActiveCards += buildRfpCard(rfp); });
  var filteredArchivedCards = '';
  filteredArchived.forEach(function(rfp) { filteredArchivedCards += buildRfpCard(rfp); });

  if (filteredActive.length === 0) {
    content += '<div class="card" style="padding:2rem;text-align:center;color:#9ca3af"><i class="fas fa-check-circle" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i><p>' + (_rfpFilter.stage ? 'No RFPs match this filter' : t('no_active_rfps')) + '</p></div>';
  } else {
    content += '<div style="display:grid;grid-template-columns:' + gridCols + ';gap:1rem">' + filteredActiveCards + '</div>';
  }

  if (archivedRfps.length > 0) {
    content += '<div style="border-top:2px solid #e5e7eb;padding-top:1.25rem">'
      + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:#d1fae5;display:flex;align-items:center;justify-content:center">'
      + '<i class="fas fa-archive" style="color:#065f46;font-size:0.875rem"></i></div>'
      + '<div><h3 style="font-weight:700;color:#374151;font-size:0.92rem;margin:0">' + t('archived_contracts') + '</h3>'
      + '<p style="font-size:0.78rem;color:#9ca3af;margin:0">'
      + '<span style="background:#d1fae5;color:#065f46;border-radius:10px;padding:1px 8px;font-weight:700;font-size:0.78rem;margin-right:6px">' + archivedRfps.length + '</span>'
      + t('completed_procs') + '</p>'
      + '</div></div>'
      + '<div style="display:grid;grid-template-columns:' + gridCols + ';gap:1rem">' + filteredArchivedCards + '</div>'
      + '</div>';
  }

  content += '</div>';
  setContent(content);
};

function openRfp(rfpId) {
  navigateTo('rfp_detail', { rfpId: rfpId });
}

async function deleteRfpConfirm(rfpId) {
  if (!confirm('Permanently delete this RFP? This cannot be undone.')) return;
  try {
    await apiCall('DELETE', '/rfps/' + rfpId);
    showToast('RFP deleted.', 'success');
    // If we're viewing this RFP's detail page, go back to the list
    if (appState.currentRfp && String(appState.currentRfp.id) === String(rfpId)) {
      navigateTo('rfps');
    } else {
      pages.rfps();
    }
  } catch(e) {
    showToast('Delete failed: ' + (e.message || e), 'error');
  }
}

async function archiveRfp(rfpId) {
  // "Archive" sets the stage to 'awarded' so the card moves to the Archived section.
  // A real archive stage could be added later; for now this mirrors the existing pattern.
  if (!confirm('Archive this RFP? It will move to the Archived section.')) return;
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: 'awarded' });
    showToast('RFP archived.', 'success');
    pages.rfps();
  } catch(e) {
    showToast('Archive failed: ' + (e.message || e), 'error');
  }
}

// ============================================================
// PAGE: RFP DETAIL
// ============================================================
pages.rfp_detail = async function(opts) {
  const rfpId = opts.rfpId;
  let rfp;
  try {
    rfp = await apiCall('GET', '/rfps/' + rfpId);
  } catch(e) {
    setContent('<div style="padding:2rem;text-align:center;color:#9ca3af">Failed to load RFP</div>');
    return;
  }
  appState.currentRfp = rfp;
  appState.currentRfpId = rfpId;

  document.getElementById('pageTitle').textContent = rfp.title || 'RFP Detail';
  document.getElementById('pageSubtitle').textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');

  // Seed initial active stage from DB stage if no flags set yet
  if (!_stageCompleted[rfpId] && !_stageActive[rfpId]) {
    var s = rfp.stage || 'draft';
    if (s === 'draft') {
      markStageActive(rfpId, 'publish');
    } else if (s === 'published') {
      markStageCompleted(rfpId, 'publish');
      markStageActive(rfpId, 'invite');
    } else if (s === 'qa_open') {
      markStageCompleted(rfpId, 'publish');
      markStageCompleted(rfpId, 'invite');
      markStageActive(rfpId, 'qa');
      markStageActive(rfpId, 'proposals');
    } else if (s === 'submissions_closed') {
      markStageCompleted(rfpId, 'publish');
      markStageCompleted(rfpId, 'invite');
      markStageCompleted(rfpId, 'qa');
      markStageActive(rfpId, 'proposals');
    } else if (s === 'awarded') {
      markStageCompleted(rfpId, 'publish');
      markStageCompleted(rfpId, 'invite');
      markStageCompleted(rfpId, 'qa');
      markStageCompleted(rfpId, 'proposals');
      markStageCompleted(rfpId, 'award');
    }
  }
  renderLifecycleBar(rfp);

  // 4.2 Stage action banner — delegate to shared helper (also called after stage transitions)
  refreshStageBanner(rfpId, rfp);

  renderRfpTabs(opts.tab || appState.currentRfpTab, rfpId, appState.unreadQA);

  const tab = opts.tab || appState.currentRfpTab;
  const tabFn = rfpTabs[tab];
  if (tabFn) tabFn(rfpId, rfp);

  // Always start background inbox poller when opening any RFP detail page
  // so new emails (questions/proposals) are detected even without sending invitations first.
  startGlobalInboxPolling(rfpId);
};

// ============================================================
// RFP TABS
// ============================================================
var rfpTabs = {};

// --- TAB: GENERATE ---
// Default scoring matrix template
var DEFAULT_SCORING_MATRIX = [
  { criterion: 'Technical Approach & Methodology', weight: 30, description: 'Quality and clarity of the proposed technical approach, architecture, and methodology' },
  { criterion: 'Functional Fit & Solution Quality', weight: 25, description: 'Degree to which the proposed solution meets functional and reporting requirements' },
  { criterion: 'Team Qualifications & Experience', weight: 20, description: 'Relevant experience and qualifications of the proposed team and track record on comparable projects' },
  { criterion: 'Financial Proposal', weight: 15, description: 'Cost competitiveness, clarity of pricing, and total cost of ownership' },
  { criterion: 'Implementation Plan & Timeline', weight: 10, description: 'Feasibility and completeness of the implementation plan, milestones and risk mitigation' },
];

function getScoringMatrix(rfp) {
  if (rfp && rfp.scoring_matrix) {
    try {
      var m = typeof rfp.scoring_matrix === 'string' ? JSON.parse(rfp.scoring_matrix) : rfp.scoring_matrix;
      if (Array.isArray(m) && m.length > 0) return m;
    } catch(_) {}
  }
  return JSON.parse(JSON.stringify(DEFAULT_SCORING_MATRIX));
}

// Translate a known default criterion name for UI display (EN preserved in data for AI docs)
var MATRIX_CRITERION_KEYS = {
  'Technical Approach & Methodology': 'sm_crit_technical',
  'Functional Fit & Solution Quality': 'sm_crit_functional',
  'Team Qualifications & Experience':  'sm_crit_team',
  'Financial Proposal':                'sm_crit_financial',
  'Implementation Plan & Timeline':    'sm_crit_impl',
};
function tMatrixCriterion(criterion) {
  var key = MATRIX_CRITERION_KEYS[criterion];
  return key ? t(key) : criterion;
}

// Render the compact READ-ONLY summary shown inline on the Generate tab
function renderScoringMatrixSummary(matrix) {
  var total = matrix.reduce(function(s, r){ return s + (Number(r.weight)||0); }, 0);
  var totalOk = total === 100;
  var rows = matrix.map(function(r){
    return '<div style="display:flex;align-items:center;justify-content:space-between;padding:6px 10px;border-bottom:1px solid var(--cpc-line)">'
      + '<span style="font-size:0.82rem;color:var(--cpc-ink);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px">' + escHtml(tMatrixCriterion(r.criterion||'')) + '</span>'
      + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:0.8rem;font-weight:700;color:var(--cpc-gold-deep);background:var(--cpc-gold-tint);border:1px solid var(--cpc-line);border-radius:5px;padding:2px 8px;flex-shrink:0">' + (r.weight||0) + '%</span>'
      + '</div>';
  }).join('');
  return '<div style="border:1px solid var(--cpc-line);border-radius:6px;overflow:hidden">'
    + rows
    + '<div style="padding:6px 10px;display:flex;align-items:center;justify-content:space-between;background:var(--cpc-ivory)">'
    + '<span style="font-family:\'JetBrains Mono\',monospace;font-size:11px;font-weight:700;color:' + (totalOk ? '#065f46' : '#dc2626') + '">'
    + t('sm_total') + ': ' + total + '%' + (totalOk ? ' ' + t('sm_ok') : ' ' + t('sm_must_100').split(' ')[0]) + '</span>'
    + '</div>'
    + '</div>';
}

// Render the FULL editable table used inside the modal
function renderScoringMatrixEditor(matrix) {
  var total = matrix.reduce(function(s, r){ return s + (Number(r.weight)||0); }, 0);
  var totalColor = total === 100 ? '#065f46' : '#dc2626';
  var taStyle = 'width:100%;border:none;background:transparent;font-family:inherit;outline:none;color:var(--cpc-ink);resize:none;overflow:hidden;line-height:1.45;padding:0';
  var rows = matrix.map(function(r, i){
    return '<tr>'
      + '<td style="padding:8px 12px;border:1px solid var(--cpc-line);vertical-align:top;width:28%">'
      + '<textarea id="sm_crit_' + i + '" rows="2" '
      + 'style="' + taStyle + ';font-size:13px;font-weight:500" '
      + 'placeholder="Criterion name" oninput="autoResizeSMTA(this);updateScoringMatrixRow(' + i + ')">'
      + escHtml(r.criterion) + '</textarea>'
      + '</td>'
      + '<td style="padding:6px 10px;border:1px solid var(--cpc-line);width:86px;text-align:center;vertical-align:top">'
      + '<div style="display:flex;align-items:center;justify-content:center;gap:2px;padding-top:2px">'
      + '<input id="sm_wt_' + i + '" type="text" inputmode="numeric" value="' + (r.weight||0) + '" '
      + 'style="width:46px;border:1px solid var(--cpc-line);border-radius:4px;background:var(--cpc-paper);font-size:14px;font-family:\'JetBrains Mono\',monospace;text-align:center;padding:3px 4px;color:var(--cpc-ink);font-weight:700" '
      + 'oninput="validateScoringWeight(' + i + ')" onblur="updateScoringMatrixRow(' + i + ')">'
      + '<span style="font-size:12px;color:#6b7280;font-weight:600">%</span>'
      + '</div>'
      + '</td>'
      + '<td style="padding:8px 12px;border:1px solid var(--cpc-line);vertical-align:top">'
      + '<textarea id="sm_desc_' + i + '" rows="2" '
      + 'style="' + taStyle + ';font-size:12px;color:#4b5563" '
      + 'placeholder="Describe what this criterion evaluates..." oninput="autoResizeSMTA(this);updateScoringMatrixRow(' + i + ')">'
      + escHtml(r.description||'') + '</textarea>'
      + '</td>'
      + '<td style="padding:4px 6px;border:1px solid var(--cpc-line);width:36px;text-align:center;vertical-align:top">'
      + '<button onclick="removeScoringMatrixRow(' + i + ')" class="btn-ghost btn-sm" style="padding:4px 7px;color:#dc2626;margin-top:2px" title="Remove"><i class="fas fa-times"></i></button>'
      + '</td>'
      + '</tr>';
  }).join('');
  return '<table style="width:100%;border-collapse:collapse;font-size:13px;table-layout:fixed">'
    + '<colgroup><col style="width:28%"><col style="width:86px"><col style="width:auto"><col style="width:36px"></colgroup>'
    + '<thead><tr style="background:var(--cpc-gold-tint)">'
    + '<th style="padding:9px 12px;text-align:left;font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--cpc-gold-deep);border-bottom:2px solid var(--cpc-line)">' + t('sm_th_criterion') + '</th>'
    + '<th style="padding:9px 10px;text-align:center;font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--cpc-gold-deep);border-bottom:2px solid var(--cpc-line)">' + t('sm_th_weight') + '</th>'
    + '<th style="padding:9px 12px;text-align:left;font-family:\'JetBrains Mono\',monospace;font-size:10px;letter-spacing:0.08em;text-transform:uppercase;color:var(--cpc-gold-deep);border-bottom:2px solid var(--cpc-line)">' + t('sm_th_description') + '</th>'
    + '<th style="border-bottom:2px solid var(--cpc-line)"></th>'
    + '</tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table>'
    + '<div style="padding:8px 12px;display:flex;align-items:center;justify-content:space-between;background:var(--cpc-ivory);border-top:1px solid var(--cpc-line)">'
    + '<button onclick="addScoringMatrixRow()" class="btn-ghost btn-sm" style="font-size:12px"><i class="fas fa-plus"></i>' + t('sm_add_criterion') + '</button>'
    + '<span id="smTotal" style="font-family:\'JetBrains Mono\',monospace;font-size:12px;font-weight:700;color:' + totalColor + '">' + t('sm_total') + ': ' + total + '%' + (total !== 100 ? ' ' + t('sm_must_100') : ' ' + t('sm_ok')) + '</span>'
    + '</div>';
}

// Open the scoring matrix edit modal
function openScoringMatrixModal(rfpId) {
  // Sync working copy from DOM state
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  window._currentScoringMatrix = JSON.parse(JSON.stringify(matrix));

  showModal(
    '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem">'
    + '<div>'
    + '<h3 style="font-size:1rem;font-weight:700;margin:0"><i class="fas fa-balance-scale cpc-gold" style="margin-right:8px"></i>' + t('gen_scoring_matrix') + '</h3>'
    + '<p style="font-size:0.75rem;color:#9ca3af;margin:4px 0 0 0">' + t('gen_matrix_hint') + '</p>'
    + '</div>'
    + '</div>'
    + '<div class="sm-table-wrap" style="border:1px solid var(--cpc-line);border-radius:6px;overflow:hidden;margin-bottom:1rem" id="scoringMatrixEditor">'
    + renderScoringMatrixEditor(window._currentScoringMatrix)
    + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end">'
    + '<button class="btn-ghost" onclick="closeModal()">' + t('btn_cancel') + '</button>'
    + '<button class="btn-primary" onclick="saveScoringMatrixAndClose(' + rfpId + ')"><i class="fas fa-save"></i>' + t('gen_save_matrix') + '</button>'
    + '</div>'
  );
  // auto-size textareas after modal DOM is painted
  setTimeout(initScoringMatrixTextareas, 0);
}

// Save from modal and close, refreshing the inline summary
async function saveScoringMatrixAndClose(rfpId) {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  var total = matrix.reduce(function(s,r){ return s+(Number(r.weight)||0); }, 0);
  if (total !== 100) { showToast(t('sm_weights_error') + ' ' + total + '%.', 'error'); return; }
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/scoring-matrix', { matrix: matrix });
    if (appState.currentRfp) appState.currentRfp.scoring_matrix = JSON.stringify(matrix);
    // Refresh inline summary
    var summaryDiv = document.getElementById('scoringMatrixSummary');
    if (summaryDiv) summaryDiv.innerHTML = renderScoringMatrixSummary(matrix);
    showToast(t('sm_saved'), 'success');
    closeModal();
  } catch(e) { /* apiCall shows error toast */ }
}

function autoResizeSMTA(el) {
  el.style.height = 'auto';
  el.style.height = el.scrollHeight + 'px';
}

function initScoringMatrixTextareas() {
  // auto-size all textareas in the scoring matrix editor after render
  var tas = document.querySelectorAll('#scoringMatrixEditor textarea');
  tas.forEach(function(ta) { autoResizeSMTA(ta); });
}

function validateScoringWeight(i) {
  // Strip non-numeric chars while user types; allow empty string mid-edit
  var wtEl = document.getElementById('sm_wt_' + i);
  if (!wtEl) return;
  var raw = wtEl.value.replace(/[^0-9]/g, '');
  var num = raw === '' ? 0 : Math.min(100, parseInt(raw, 10));
  // Only clamp if value is clearly out of range (not mid-typing)
  if (raw !== '' && parseInt(raw, 10) > 100) wtEl.value = '100';
  else if (raw !== wtEl.value) wtEl.value = raw;
  updateScoringMatrixRow(i);
}

function updateScoringMatrixRow(i) {
  // read current matrix from DOM — do not touch appState.currentRfp directly
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  if (!matrix[i]) return;
  var critEl = document.getElementById('sm_crit_' + i);
  var wtEl   = document.getElementById('sm_wt_' + i);
  var descEl = document.getElementById('sm_desc_' + i);
  if (critEl) matrix[i].criterion = critEl.value;
  if (wtEl)   matrix[i].weight    = parseInt(wtEl.value, 10) || 0;
  if (descEl) matrix[i].description = descEl.value;
  window._currentScoringMatrix = matrix;
  // Update total indicator
  var total = matrix.reduce(function(s,r){ return s+(Number(r.weight)||0); }, 0);
  var el = document.getElementById('smTotal');
  if (el) {
    el.style.color = total === 100 ? '#065f46' : '#dc2626';
    el.textContent = t('sm_total') + ': ' + total + '%' + (total !== 100 ? ' ' + t('sm_must_100') : ' ' + t('sm_ok'));
  }
}

function addScoringMatrixRow() {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  matrix.push({ criterion: '', weight: 0, description: '' });
  window._currentScoringMatrix = matrix;
  var smDiv = document.getElementById('scoringMatrixEditor');
  if (smDiv) smDiv.innerHTML = renderScoringMatrixEditor(matrix);
  setTimeout(initScoringMatrixTextareas, 0);
  // focus new criterion textarea
  var newInput = document.getElementById('sm_crit_' + (matrix.length - 1));
  if (newInput) { newInput.focus(); newInput.select(); }
}

function removeScoringMatrixRow(i) {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  matrix.splice(i, 1);
  window._currentScoringMatrix = matrix;
  var smDiv = document.getElementById('scoringMatrixEditor');
  if (smDiv) smDiv.innerHTML = renderScoringMatrixEditor(matrix);
  setTimeout(initScoringMatrixTextareas, 0);
}

// Legacy save (kept for compatibility — modal path now uses saveScoringMatrixAndClose)
async function saveScoringMatrix(rfpId) {
  var matrix = window._currentScoringMatrix || getScoringMatrix(appState.currentRfp);
  var total = matrix.reduce(function(s,r){ return s+(Number(r.weight)||0); }, 0);
  if (total !== 100) { showToast(t('sm_weights_error') + ' ' + total + '%.', 'error'); return; }
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/scoring-matrix', { matrix: matrix });
    if (appState.currentRfp) appState.currentRfp.scoring_matrix = JSON.stringify(matrix);
    var summaryDiv = document.getElementById('scoringMatrixSummary');
    if (summaryDiv) summaryDiv.innerHTML = renderScoringMatrixSummary(matrix);
    showToast('Scoring matrix saved.', 'success');
  } catch(e) { /* apiCall shows error */ }
}

// Helper: field-level auto-save with inline saved indicator
// Debounced: waits 800ms after last keystroke then saves silently
var _fieldSaveTimers = {};
function scheduleFieldSave(rfpId, fieldId) {
  clearTimeout(_fieldSaveTimers[fieldId]);
  // Show "saving…" dot immediately
  var ind = document.getElementById('fsi-' + fieldId);
  if (ind) { ind.textContent = ''; ind.style.opacity = '0'; }
  _fieldSaveTimers[fieldId] = setTimeout(function() {
    var el = document.getElementById(fieldId);
    if (!el) return;
    var fieldMap = {
      rfpTitle: 'title', rfpCategory: 'category', rfpBudget: 'budget',
      rfpDeadline: 'deadline', rfpBackground: 'background',
      rfpObjectives: 'objectives', rfpScope: 'scope', rfpTech: 'tech_requirements'
    };
    var apiField = fieldMap[fieldId];
    if (!apiField) return;
    var payload = {}; payload[apiField] = el.value;
    apiCall('PUT', '/rfps/' + rfpId, payload).then(function() {
      var ind2 = document.getElementById('fsi-' + fieldId);
      if (ind2) {
        ind2.innerHTML = '<i class="fas fa-check" style="font-size:0.65rem"></i> saved';
        ind2.style.opacity = '1';
        setTimeout(function() { if (ind2) ind2.style.opacity = '0'; }, 2000);
      }
      // Keep appState in sync
      if (appState.currentRfp) appState.currentRfp[apiField] = el.value;
    }).catch(function() {
      var ind2 = document.getElementById('fsi-' + fieldId);
      if (ind2) { ind2.innerHTML = '<i class="fas fa-exclamation-circle" style="font-size:0.65rem"></i> error'; ind2.style.opacity='1'; ind2.style.color='#ef4444'; }
    });
  }, 800);
}

// Wrap a label + field-save-indicator into a form-group label row
function fgLabel(text, fieldId, required) {
  return '<div style="display:flex;align-items:baseline;justify-content:space-between;margin-bottom:4px">'
    + '<label style="margin:0">' + text + (required ? ' <span style="color:#ef4444">*</span>' : '') + '</label>'
    + '<span id="fsi-' + fieldId + '" style="font-size:0.68rem;color:var(--cpc-gold-deep);opacity:0;transition:opacity 0.3s;display:flex;align-items:center;gap:3px"></span>'
    + '</div>';
}

rfpTabs.generate = function(rfpId, rfp) {
  const titleVal = (rfp && rfp.title) || '';
  const catVal = (rfp && rfp.category) || 'IT & Digital Transformation';
  const budgetVal = (rfp && rfp.budget) || '';
  const deadlineVal = (rfp && rfp.deadline) || '';
  const scopeVal = (rfp && rfp.scope) || '';
  const techVal = (rfp && rfp.tech_requirements) || '';
  const objVal = (rfp && rfp.objectives) || '';
  const bgVal = (rfp && rfp.background) || '';
  const hasContent = rfp && rfp.content;

  // Init scoring matrix from RFP or defaults
  var scoringMatrix = getScoringMatrix(rfp);
  window._currentScoringMatrix = JSON.parse(JSON.stringify(scoringMatrix));
  setTimeout(function(){ restoreAutoSave(rfpId); }, 200);

  const previewHtml = hasContent
    ? rfp.content
    : '<div style="text-align:center;padding:3rem 1.5rem;color:#9ca3af">'
      + '<i class="fas fa-file-alt" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin:0">Fill in the details and click <strong>Generate with AI</strong> to produce a professional RFP document</p>'
      + '</div>';

  // Inline auto-save event attribute (scheduleFieldSave is global)
  var asc = 'scheduleFieldSave(' + rfpId + ',this.id)';

  // Stage-action bar — shown at top when stage requires an action in this tab
  var genStageBar = '';
  if (rfp && rfp.stage === 'draft') {
    genStageBar = '<div style="background:linear-gradient(90deg,#fffbeb,#fef3c7);border:1.5px solid var(--cpc-gold);border-radius:10px;padding:0.65rem 1rem;display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
      + '<i class="fas fa-rocket" style="color:var(--cpc-gold-deep);font-size:1rem;flex-shrink:0"></i>'
      + '<div style="flex:1"><span style="font-weight:700;color:var(--cpc-ink);font-size:0.88rem">Ready to publish?</span>'
      + '<span style="color:#92400e;font-size:0.82rem;margin-left:0.5rem">Generate the RFP document first, then publish to make it visible to vendors.</span></div>'
      + '<button class="btn-primary" style="flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:6px;padding:0.4rem 1rem;font-size:0.82rem' + (hasContent ? '' : ';opacity:0.45;pointer-events:none') + '" onclick="advanceRfpStage(' + rfpId + ',\x27published\x27)" title="' + (hasContent ? 'Publish this RFP' : 'Generate the document first') + '"><i class="fas fa-paper-plane" style="font-size:0.78rem"></i>Publish RFP</button>'
      + '</div>';
  }

  setContent(
    genStageBar
    + '<div class="generate-layout" style="display:grid;grid-template-columns:460px 1fr;gap:1.25rem;height:calc(100vh - 240px)">'
    // ── LEFT: form — fields only, no action buttons ──
    + '<div class="card" style="padding:1.25rem;overflow-y:auto;display:flex;flex-direction:column;gap:0.875rem">'
    + '<h3 style="font-weight:700;color:#1f2937;font-size:0.9rem;margin:0"><i class="fas fa-magic cpc-gold" style="margin-right:6px"></i>' + t('gen_rfp_params') + '</h3>'

    // Title
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_project_title'), 'rfpTitle', true)
    + '<input id="rfpTitle" placeholder="e.g. New Oracle ERP Setup, Data Warehouse and Data Visualization" value="' + escHtml(titleVal) + '" oninput="' + asc + '" onchange="' + asc + '">'
    + '</div>'

    // Category + Budget
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem">'
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_category'), 'rfpCategory', false)
    + '<select id="rfpCategory" onchange="' + asc + '">'
    + (_settingsCategories || DEFAULT_CATEGORIES).map(function(c){ return '<option value="' + c + '"' + (catVal===c?' selected':'') + '>' + c + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_budget_aed'), 'rfpBudget', false)
    + '<input id="rfpBudget" placeholder="e.g. 5,000,000" value="' + escHtml(budgetVal) + '" oninput="' + asc + '" onchange="' + asc + '">'
    + '</div></div>'

    // Deadline
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_deadline'), 'rfpDeadline', false)
    + '<input type="date" id="rfpDeadline" value="' + escHtml(deadlineVal) + '" onchange="' + asc + '">'
    + '</div>'

    // Background
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_background'), 'rfpBackground', true)
    + '<textarea id="rfpBackground" rows="3" placeholder="Describe the current situation, business problem, and strategic drivers..." oninput="' + asc + '">' + escHtml(bgVal) + '</textarea>'
    + '</div>'

    // Objectives
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_objectives'), 'rfpObjectives', true)
    + '<textarea id="rfpObjectives" rows="3" placeholder="List 4-6 measurable objectives for this project..." oninput="' + asc + '">' + escHtml(objVal) + '</textarea>'
    + '</div>'

    // Scope
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_scope'), 'rfpScope', true)
    + '<textarea id="rfpScope" rows="4" placeholder="Detail the work phases, deliverables, and what is in/out of scope..." oninput="' + asc + '">' + escHtml(scopeVal) + '</textarea>'
    + '</div>'

    // Technical requirements
    + '<div class="form-group" style="margin:0">'
    + fgLabel(t('form_tech_req'), 'rfpTech', false)
    + '<textarea id="rfpTech" rows="3" placeholder="Infrastructure, hosting, security, compliance, integration specs..." oninput="' + asc + '">' + escHtml(techVal) + '</textarea>'
    + '</div>'

    // Scoring matrix — read-only summary + edit button (unchanged)
    + '<div style="border-top:1px solid var(--cpc-line);padding-top:0.875rem;margin-top:0.25rem">'
    + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">'
    + '<label style="margin:0;font-weight:600;color:var(--cpc-ink);font-size:0.82rem"><i class="fas fa-balance-scale cpc-gold" style="margin-right:6px"></i>' + t('gen_scoring_matrix') + '</label>'
    + '<button onclick="openScoringMatrixModal(' + rfpId + ')" class="btn-ghost btn-sm" style="font-size:11px;display:flex;align-items:center;gap:4px"><i class="fas fa-edit"></i>' + t('gen_edit_matrix') + '</button>'
    + '</div>'
    + '<div id="scoringMatrixSummary">' + renderScoringMatrixSummary(window._currentScoringMatrix) + '</div>'
    + '</div>'
    + '</div>'
    // ── RIGHT: preview with sticky toolbar ──
    + '<div class="card" style="overflow-y:auto;padding:0;display:flex;flex-direction:column">'
    + '<div style="position:sticky;top:0;z-index:10;padding:0.625rem 1rem;border-bottom:1px solid #e5e7eb;display:flex;align-items:center;gap:0.5rem;background:#f9fafb;flex-wrap:wrap">'
    // Left label
    + '<span style="font-weight:600;color:#374151;font-size:0.88rem;margin-right:4px"><i class="fas fa-eye cpc-gold" style="margin-right:6px"></i>' + t('gen_rfp_preview') + '</span>'
    // Generate with AI — primary action, always visible
    + '<button id="genBtn" class="btn-primary btn-sm" style="display:flex;align-items:center;gap:5px;padding:0.3rem 0.75rem;font-size:0.78rem" onclick="generateRfpDoc(' + rfpId + ')"><i class="fas fa-robot" style="font-size:0.72rem"></i>' + t('gen_generate_ai') + '</button>'
    // Spacer
    + '<div style="flex:1"></div>'
    // Copy + PDF (right side, shown only when content exists)
    + (hasContent ? '<button class="btn-ghost btn-sm" onclick="copyRfpPreview()" title="Copy all text"><i class="fas fa-copy"></i>Copy All</button>' : '')
    + '<button id="genPreviewPdfBtn" class="btn-ghost btn-sm" onclick="downloadRfpPdf(' + rfpId + ')" style="' + (hasContent ? '' : 'display:none') + '"><i class="fas fa-download"></i>PDF</button>'
    + '</div>'
    + '<div id="rfpPreviewArea" style="padding:0;flex:1;overflow-y:auto">' + previewHtml + '</div>'
    + '</div>'
    + '</div>'
  );
};

function copyRfpPreview() {
  var area = document.getElementById('rfpPreviewArea');
  if (!area) return;
  var text = area.innerText || area.textContent || '';
  if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(function(){ showToast('Content copied to clipboard!', 'success'); });
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta);
    showToast('Content copied!', 'success');
  }
}

function advanceStageButton(rfp) {
  const stage = rfp ? rfp.stage : 'draft';
  const id = rfp ? rfp.id : '';
  if (stage === 'draft') return '<button class="btn-primary" style="flex:1" onclick="advanceRfpStage(' + id + ',\x27published\x27)"><i class="fas fa-rocket"></i>Publish RFP</button>';
  return '';
}

// 5.2 — Auto-save generate tab fields to localStorage every 30 s
var _autoSaveTimer = null;
function startAutoSave(rfpId) {
  if (_autoSaveTimer) clearInterval(_autoSaveTimer);
  _autoSaveTimer = setInterval(function() {
    var fields = ['rfpTitle','rfpBackground','rfpObjectives','rfpScope','rfpTech','rfpBudget'];
    var data = {};
    fields.forEach(function(id){ var el=document.getElementById(id); if(el) data[id]=el.value; });
    localStorage.setItem('cpc_autosave_' + rfpId, JSON.stringify({ ts: Date.now(), data: data }));
  }, 30000);
}
function restoreAutoSave(rfpId) {
  // Auto-restore disabled — prompt removed per user request
  try { localStorage.removeItem('cpc_autosave_' + rfpId); } catch(e) {}
}

async function generateRfpDoc(rfpId) {
  // Validate mandatory fields before calling the API
  var background = (document.getElementById('rfpBackground') || {}).value || '';
  var objectives = (document.getElementById('rfpObjectives') || {}).value || '';
  var scope      = (document.getElementById('rfpScope')      || {}).value || '';
  var title      = (document.getElementById('rfpTitle')      || {}).value || '';
  background = background.trim(); objectives = objectives.trim();
  scope = scope.trim(); title = title.trim();
  if (!background || !objectives || !scope) {
    var missing = [];
    if (!background) missing.push('Project Background');
    if (!objectives)  missing.push('Objectives');
    if (!scope)       missing.push('Scope of Work');
    showToast('Please fill in: ' + missing.join(', ') + ' before generating.', 'error');
    return;
  }

  var btn = document.getElementById('genBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving…'; }

  // ── Flush all form fields to DB before generating ──────────────────────────
  // Cancel any pending debounced saves first
  Object.keys(_fieldSaveTimers).forEach(function(k){ clearTimeout(_fieldSaveTimers[k]); delete _fieldSaveTimers[k]; });
  var genPayload = {
    title:             title,
    category:          (document.getElementById('rfpCategory')   || {}).value || '',
    budget:            (document.getElementById('rfpBudget')     || {}).value || '',
    deadline:          (document.getElementById('rfpDeadline')   || {}).value || '',
    background:        background,
    objectives:        objectives,
    scope:             scope,
    tech_requirements: (document.getElementById('rfpTech')       || {}).value || ''
  };
  try {
    var saved = await apiCall('PUT', '/rfps/' + rfpId, genPayload);
    if (saved && appState.currentRfp) Object.assign(appState.currentRfp, saved);
  } catch(saveErr) {
    showToast('Could not save fields: ' + (saveErr.message || saveErr), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot"></i> Generate with AI'; }
    return;
  }

  if (btn) { btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Generating…'; }

  // Show live streaming progress area
  var previewEl = document.getElementById('rfpPreviewArea');
  var streamBuf = '';
  var tokenCount = 0;
  if (previewEl) {
    previewEl.innerHTML = '<div id="rfpStreamProgress" style="color:var(--cpc-gold-deep);font-size:0.85rem;padding:0.5rem 0;display:flex;align-items:center;gap:8px">'
      + '<i class="fas fa-spinner fa-spin"></i><span id="rfpStreamTokens">Connecting to AI…</span></div>'
      + '<div id="rfpStreamContent" style="font-size:0.85rem;color:#666;white-space:pre-wrap;max-height:300px;overflow:auto"></div>';
  }

  var data = {
    title:             title,
    category:          document.getElementById('rfpCategory').value,
    budget:            document.getElementById('rfpBudget').value,
    deadline:          document.getElementById('rfpDeadline').value,
    scope:             scope,
    tech_requirements: document.getElementById('rfpTech').value,
    objectives:        objectives,
    background:        background,
  };

  try {
    var response = await fetch('/api/rfps/' + rfpId + '/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    if (!response.ok || !response.body) {
      var errText = await response.text().catch(() => 'Network error');
      throw new Error('Server error ' + response.status + ': ' + errText);
    }

    // Read SSE stream token by token
    var reader = response.body.getReader();
    var decoder = new TextDecoder();
    var sseBuffer = '';
    var result = null;

    while (true) {
      var chunk = await reader.read();
      if (chunk.done) break;
      sseBuffer += decoder.decode(chunk.value, { stream: true });

      // Parse complete SSE lines
      var lines = sseBuffer.split('\n');
      sseBuffer = lines.pop() || ''; // keep incomplete last line

      for (var i = 0; i < lines.length; i++) {
        var line = lines[i].trim();
        if (!line.startsWith('data:')) continue;
        var jsonStr = line.slice(5).trim();
        if (!jsonStr || jsonStr === '[DONE]') continue;

        var evt;
        try { evt = JSON.parse(jsonStr); } catch(_) { continue; }

        if (evt.error) {
          throw new Error(evt.error);
        }

        if (evt.token) {
          streamBuf += evt.token;
          tokenCount += evt.token.length;
          // Update live counter
          var tokEl = document.getElementById('rfpStreamTokens');
          if (tokEl) tokEl.textContent = 'Generating… ' + tokenCount + ' chars';
          // Show rolling preview of the last ~800 chars
          var contentEl = document.getElementById('rfpStreamContent');
          if (contentEl) {
            var preview = streamBuf.length > 800 ? '…' + streamBuf.slice(-800) : streamBuf;
            contentEl.textContent = preview;
            contentEl.scrollTop = contentEl.scrollHeight;
          }
        }

        if (evt.done && evt.rfp) {
          result = evt.rfp;
        }
      }
    }

    if (!result) {
      // Backend sent done without rfp object — fetch it ourselves
      result = await apiCall('GET', '/rfps/' + rfpId);
    }

    appState.currentRfp = result;
    showToast('RFP document generated!', 'success');

    // 1. Update the preview area immediately (fast path)
    if (previewEl) previewEl.innerHTML = result.content || '';
    // 2. Show PDF button
    var pdfBtn = document.getElementById('genPreviewPdfBtn');
    if (pdfBtn) pdfBtn.style.display = '';
    // Enable Publish RFP button in stage-action bar (if present)
    var pubBtn = document.querySelector('[onclick*="advanceRfpStage"][onclick*="published"]');
    if (pubBtn) { pubBtn.style.opacity = '1'; pubBtn.style.pointerEvents = 'auto'; pubBtn.title = 'Publish this RFP'; }
    // 3. Full re-render as reliable fallback
    renderRfpTabs('generate', rfpId, appState.unreadQA);
    rfpTabs.generate(rfpId, result);

  } catch(e) {
    showToast('Generation failed: ' + (e.message || e), 'error');
    // Re-enable button on error (DOM may still be intact)
    var btnAgain = document.getElementById('genBtn');
    if (btnAgain) { btnAgain.disabled = false; btnAgain.innerHTML = '<i class="fas fa-robot"></i> Generate with AI'; }
    // Clear progress area
    if (previewEl) previewEl.innerHTML = '';
  }
  // Note: do NOT re-enable btn in finally on success path — rfpTabs.generate() recreates the DOM
  // so the original btn reference is stale. The new genBtn is enabled by default.
}

async function saveRfpFields(rfpId) {
  const data = {
    title: document.getElementById('rfpTitle').value,
    category: document.getElementById('rfpCategory').value,
    budget: document.getElementById('rfpBudget').value,
    deadline: document.getElementById('rfpDeadline').value,
    scope: document.getElementById('rfpScope').value,
    tech_requirements: document.getElementById('rfpTech').value,
    objectives: document.getElementById('rfpObjectives').value,
    background: document.getElementById('rfpBackground').value,
  };
  await apiCall('PUT', '/rfps/' + rfpId, data);
  showToast('RFP saved!', 'success');
}

// ── Shared banner renderer — call any time the RFP stage changes ──────────────
function refreshStageBanner(rfpId, rfp) {
  var banner = document.getElementById('stageActionBanner');
  if (!banner) return;
  var msgs = {
    draft: {
      icon: 'fa-pen',
      text: 'This RFP is a <strong>Draft</strong>. Generate the RFP document, then publish to invite vendors.',
      action: 'switchRfpTab(\x27generate\x27,' + rfpId + ')',
      label: 'Go to Generate'
    },
    published: {
      icon: 'fa-paper-plane',
      text: 'RFP is <strong>Published</strong>. Shortlist vendors and send invitations to open the Q&amp;A phase.',
      action: 'switchRfpTab(\x27vendors\x27,' + rfpId + ')',
      label: 'Go to Vendors'
    },
    qa_open: {
      icon: 'fa-comments',
      text: 'Invitations sent — Q&amp;A is <strong>Open</strong>. Vendors can submit proposals at any time before the deadline. Close Q&amp;A when you want to stop accepting clarification questions.',
      action: 'switchRfpTab(\x27qa\x27,' + rfpId + ')',
      label: 'Go to Q&A'
    },
    submissions_closed: {
      icon: 'fa-inbox',
      text: 'Q&amp;A is closed — <strong>waiting for vendor proposals</strong>. Questions are no longer accepted. You can already run AI evaluation on any proposals received so far; award the contract once the submission deadline passes.',
      action: 'switchRfpTab(\x27proposals\x27,' + rfpId + ')',
      label: 'Go to Proposals'
    },
    awarded: {
      icon: 'fa-trophy',
      text: 'Contract <strong>Awarded</strong>. This RFP is complete.',
      action: null,
      label: null
    }
  };
  var m = msgs[rfp.stage];
  if (m) {
    banner.innerHTML = '<i class="fas ' + m.icon + '" style="margin-right:0.5rem;color:var(--cpc-gold)"></i>'
      + '<span>' + m.text + '</span>'
      + (m.action
          ? '<button class="btn-ghost" style="margin-left:auto;padding:0.25rem 0.75rem;font-size:0.8rem;white-space:nowrap" onclick="' + m.action + '">'
            + m.label + ' <i class="fas fa-arrow-right" style="font-size:0.7rem"></i></button>'
          : '');
    banner.classList.add('visible');
  } else {
    banner.classList.remove('visible');
  }
}

async function advanceRfpStage(rfpId, stage) {
  await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: stage });
  // Reload RFP and update all header elements
  const rfp = await apiCall('GET', '/rfps/' + rfpId);
  appState.currentRfp = rfp;
  var subtitleEl = document.getElementById('pageSubtitle');
  if (subtitleEl) subtitleEl.textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');

  // Lifecycle bar
  if (stage === 'published') {
    markStageCompleted(rfpId, 'publish');
    markStageActive(rfpId, 'invite');
  } else if (stage === 'qa_open') {
    markStageCompleted(rfpId, 'publish');
    markStageCompleted(rfpId, 'invite');
    markStageActive(rfpId, 'qa');
    markStageActive(rfpId, 'proposals');
  } else if (stage === 'submissions_closed') {
    markStageCompleted(rfpId, 'publish');
    markStageCompleted(rfpId, 'invite');
    markStageCompleted(rfpId, 'qa');
    markStageActive(rfpId, 'proposals');
  }
  renderLifecycleBar(rfp);

  // Banner — always refresh to new stage message
  refreshStageBanner(rfpId, rfp);

  if (stage === 'published') {
    showToast('\uD83C\uDF89 RFP Published! Now proceed to the Vendors tab to invite vendors.', 'success', 5000);
  }
  renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
  // Re-render the current tab content so stage bars update too
  var tabFn = rfpTabs[appState.currentRfpTab];
  if (tabFn) tabFn(rfpId, rfp);
}

// Fetch the letterhead image and return a base64 data URI so html2canvas
// can render it without CORS issues.
async function fetchLetterheadDataUri() {
  try {
    var res = await fetch('/api/proposals/pdf/letterhead/bg_a4.png');
    if (!res.ok) return null;
    var blob = await res.blob();
    return await new Promise(function(resolve) {
      var reader = new FileReader();
      reader.onloadend = function() { resolve(reader.result); };
      reader.readAsDataURL(blob);
    });
  } catch(e) {
    return null;
  }
}

// Rewrite background-image URL in RFP HTML to embedded data URI so
// html2canvas can render the letterhead without any CORS issue.
function inlineLetterheadInHtml(html, dataUri) {
  if (!dataUri) return html;
  // Replace any URL pointing to the letterhead PNG (absolute or relative)
  return html.replace(/url\(['"]?[^'")\s]*bg_a4\.png['"]?\)/g, "url('" + dataUri + "')");
}

// Build a self-contained HTML document from RFP content, with letterhead inlined.
async function buildRfpHtmlDoc(rfpContent) {
  var dataUri = await fetchLetterheadDataUri();
  var inlined = inlineLetterheadInHtml(rfpContent, dataUri);
  return '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<style>'
    + '* { box-sizing: border-box; margin: 0; padding: 0; }'
    + 'body { background: #e8e8e8; font-family: Arial, "Segoe UI", sans-serif; }'
    + '.rfp-doc > div { display: block; margin: 0 auto; }'
    + '</style>'
    + '</head><body>' + inlined + '</body></html>';
}

// Generate PDF blob from RFP content.
// Strategy (hybrid — best of v24 + v25):
//   • Use an isolated HIDDEN IFRAME so the reset CSS and LLM-generated <style>
//     blocks are confined to their own document and cannot leak into the main page.
//   • After the iframe loads, measure the FULL scrollHeight and render the entire
//     rfp-doc in ONE html2canvas pass (v25 approach — captures off-viewport content).
//   • Slice the resulting tall canvas into A4-height strips for jsPDF.
// Why iframe: the v25 plain-div approach injected <style>* {…}</style> into the main
// document DOM on every PDF render, corrupting global CSS (including page layout).
async function generateRfpPdfBlob(rfpId) {
  var rfp = appState.currentRfp;
  if (!rfp || !rfp.content) throw new Error('No RFP content to export');

  if (typeof window.html2canvas === 'undefined' || typeof window.jspdf === 'undefined') {
    throw new Error('PDF libraries not loaded');
  }
  var jsPDF = window.jspdf.jsPDF;

  var safeRef = (rfp.ref_number || rfp.title || String(rfpId)).replace(/[^a-zA-Z0-9_\-]/g, '_');
  var filename = 'CPC_RFP_' + safeRef + '.pdf';

  // Inline letterhead as base64 data URI — avoids any CORS issue inside the iframe.
  var dataUri = await fetchLetterheadDataUri();
  var inlined = inlineLetterheadInHtml(rfp.content, dataUri);

  // A4 at 96 dpi: 794 × 1123 px
  var PAGE_W_PX = 794;
  var PAGE_H_PX = 1123;

  // ── Isolated hidden iframe ────────────────────────────────────────────────
  // All reset CSS and LLM HTML stays inside the iframe document — zero CSS leak
  // to the main page.  opacity:0 + z-index:-9999 keeps it invisible.
  var iframe = document.createElement('iframe');
  iframe.style.cssText = [
    'position:fixed', 'top:0', 'left:0',
    'width:' + PAGE_W_PX + 'px',
    'height:' + (PAGE_H_PX * 2) + 'px',  // generous initial height; resized after load
    'opacity:0', 'pointer-events:none', 'border:none', 'z-index:-9999',
  ].join(';');
  document.body.appendChild(iframe);

  var iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
  iframeDoc.open();
  iframeDoc.write([
    '<!DOCTYPE html><html><head><meta charset="UTF-8">',
    '<style>',
    // Reset only inside the iframe — does NOT affect main page
    '* { box-sizing:border-box; margin:0; padding:0; }',
    'body { width:' + PAGE_W_PX + 'px; background:#ffffff; overflow:visible; }',
    // Page divs: strip auto-margins so they stack flush, enforce exact A4 width
    '.rfp-doc { margin:0; padding:0; }',
    '.rfp-doc > div { margin:0 !important; display:block !important; width:' + PAGE_W_PX + 'px !important; }',
    '</style>',
    '</head><body>', inlined, '</body></html>',
  ].join(''));
  iframeDoc.close();

  // Wait for full load (fonts, background images) — or 5 s max
  await new Promise(function(resolve) {
    if (iframeDoc.readyState === 'complete') { resolve(); return; }
    iframe.contentWindow.addEventListener('load', resolve);
    setTimeout(resolve, 5000);
  });
  // Extra paint tick
  await new Promise(function(r) { setTimeout(r, 500); });

  // ── Resize iframe to true content height so ALL pages get real layout ─────
  var contentH = iframeDoc.body ? iframeDoc.body.scrollHeight : 0;
  if (contentH < PAGE_H_PX) contentH = PAGE_H_PX;
  iframe.style.height = contentH + 'px';
  // Another tick for browser reflow after height change
  await new Promise(function(r) { setTimeout(r, 400); });

  try {
    var rfpDoc = iframeDoc.querySelector('.rfp-doc') || iframeDoc.body;
    var totalH = rfpDoc.scrollHeight || rfpDoc.offsetHeight || contentH;

    console.log('[PDF] iframe totalH:', contentH, 'px  rfpDoc totalH:', totalH, 'px  expected pages:', Math.ceil(totalH / PAGE_H_PX));

    // ── ONE html2canvas pass over the full document height ────────────────
    // scale:1.5 — good quality without crashing on 10+ page documents
    var SCALE = 1.5;
    var fullCanvas = await window.html2canvas(rfpDoc, {
      scale: SCALE,
      useCORS: true,
      allowTaint: true,
      backgroundColor: '#ffffff',
      logging: false,
      width:  PAGE_W_PX,
      height: totalH,
      windowWidth:  PAGE_W_PX,
      windowHeight: totalH,
      scrollX: 0,
      scrollY: 0,
      x: 0,
      y: 0,
    });

    console.log('[PDF] Full canvas:', fullCanvas.width, '×', fullCanvas.height);

    // ── Slice into A4 strips and assemble PDF ─────────────────────────────
    var pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    var A4_W_MM = 210;
    var A4_H_MM = 297;

    var pageH_scaled = Math.round(PAGE_H_PX * SCALE);
    var totalPages = Math.ceil(fullCanvas.height / pageH_scaled);
    if (totalPages < 1) totalPages = 1;

    console.log('[PDF] Slicing into', totalPages, 'page(s), strip height:', pageH_scaled, 'px');

    for (var i = 0; i < totalPages; i++) {
      var sy = i * pageH_scaled;
      var sh = Math.min(pageH_scaled, fullCanvas.height - sy);

      var pageCanvas = document.createElement('canvas');
      pageCanvas.width  = fullCanvas.width;
      pageCanvas.height = pageH_scaled;
      var ctx = pageCanvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, pageCanvas.width, pageCanvas.height);
      ctx.drawImage(fullCanvas, 0, sy, fullCanvas.width, sh, 0, 0, fullCanvas.width, sh);

      var imgData = pageCanvas.toDataURL('image/jpeg', 0.92);
      if (i > 0) pdf.addPage('a4', 'portrait');
      pdf.addImage(imgData, 'JPEG', 0, 0, A4_W_MM, A4_H_MM, '', 'FAST');
      console.log('[PDF] Added page', i + 1, '— sy:', sy, 'sh:', sh);
    }

    var blob = pdf.output('blob');
    return { blob: blob, filename: filename };
  } finally {
    if (iframe.parentNode) document.body.removeChild(iframe);
  }
}

// Convert Blob to base64 string
function blobToBase64(blob) {
  return new Promise(function(resolve, reject) {
    var reader = new FileReader();
    reader.onloadend = function() {
      // reader.result is "data:application/pdf;base64,AAAA..."
      var b64 = reader.result.split(',')[1];
      resolve(b64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function downloadRfpPdf(rfpId) {
  var rfp = appState.currentRfp;
  if (!rfp || !rfp.content) {
    showToast('Please generate the RFP document first', 'error');
    return;
  }

  // Check html2pdf.js is loaded
  if (typeof html2pdf === 'undefined') {
    showToast('PDF library not loaded — opening print preview instead', 'warning');
    window.open('/api/rfps/' + rfpId + '/pdf', '_blank');
    return;
  }

  showToast('Generating PDF — please wait (this may take 10–20 seconds)…', 'info', 25000);
  generateRfpPdfBlob(rfpId)
    .then(function(result) {
      // Trigger browser download
      var url = URL.createObjectURL(result.blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() {
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }, 1000);
      showToast('PDF downloaded: ' + result.filename, 'success');
    })
    .catch(function(err) {
      console.error('PDF generation error:', err);
      showToast('PDF generation failed — opening print preview instead', 'warning');
      window.open('/api/rfps/' + rfpId + '/pdf', '_blank');
    });
  return;

  // LEGACY html2pdf path (kept for reference — no longer used):
  // Use a hidden iframe approach: inject a full HTML document with embedded
  // styles so html2canvas sees a properly rendered page (not an offscreen div).
  // This reliably captures all CSS-styled content including tables and colours.
  var safeTitle = (rfp.ref_number || rfp.title || 'RFP').replace(/[^a-zA-Z0-9_\-]/g, '_');
  var filename = 'CPC_RFP_' + safeTitle + '.pdf';

  // Build a self-contained HTML document string with all styles inlined
  var rfpCss = [
    'body{margin:0;padding:0;font-family:Arial,Calibri,sans-serif;font-size:11pt;color:#1a1a1a;background:#fff;}',
    '.rfp-doc{max-width:794px;margin:0 auto;}',
    '.rfp-header-band{height:20pt;width:100%;background:#A79C7F;background-image:repeating-linear-gradient(90deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) 2px,transparent 2px,transparent 10px),repeating-linear-gradient(0deg,rgba(255,255,255,0.15) 0,rgba(255,255,255,0.15) 2px,transparent 2px,transparent 10px);}',
    '.rfp-circle-divider{height:8pt;border-top:2px solid #1A1A1A;background:white;}',
    '.rfp-cover{background:white;page-break-after:always;min-height:220mm;}',
    '.rfp-cover-logo{display:flex;align-items:center;justify-content:center;gap:18pt;padding:18pt 36pt 12pt;}',
    '.rfp-logo-emblem{flex-shrink:0;width:56pt;height:56pt;border-radius:50%;border:2pt solid #1A1A1A;display:flex;align-items:center;justify-content:center;background:white;}',
    '.rfp-logo-emblem svg{width:40pt;height:40pt;}',
    '.rfp-logo-text{display:flex;flex-direction:column;gap:4pt;}',
    '.rfp-logo-text .rfp-org-arabic{font-size:16pt;font-weight:700;color:#1a1a1a;direction:rtl;font-family:serif;}',
    '.rfp-logo-text .rfp-org-name{font-size:9pt;font-weight:700;color:#1a1a1a;letter-spacing:2px;text-transform:uppercase;font-family:Arial,sans-serif;}',
    '.rfp-cover-divider{width:calc(100% - 72pt);height:0.5pt;background:#d1d5db;margin:0 36pt;}',
    '.rfp-cover-body{padding:36pt 36pt 24pt;}',
    '.rfp-cover-body .rfp-doc-type{font-size:10pt;font-weight:700;letter-spacing:0.1em;color:#BA9765;text-transform:uppercase;margin-bottom:6pt;}',
    '.rfp-cover-body .rfp-doc-title{font-size:22pt;font-weight:700;line-height:1.25;color:#1a1a1a;margin-bottom:12pt;}',
    '.rfp-cover-body .rfp-doc-date{font-size:9pt;color:#745B35;font-weight:600;}',
    '.rfp-cover-footer-bar{display:none;}',
    '.rfp-page-header{display:flex;align-items:center;justify-content:space-between;padding:4pt 24pt;border-bottom:1.5pt solid #BA9765;background:white;}',
    '.rfp-page-header-logo{font-size:8pt;font-weight:700;color:#745B35;}',
    '.rfp-page-header-ref{font-size:7.5pt;color:#9ca3af;}',
    '.rfp-meta-table{width:100%;border-collapse:collapse;font-size:9pt;margin:8pt 0;}',
    '.rfp-meta-table th{background:#745B35;color:white;padding:6pt 10pt;font-weight:700;border:0.5pt solid #E9DCC4;}',
    '.rfp-meta-table td{background:white;padding:6pt 10pt;border:0.5pt solid #d1d5db;vertical-align:top;}',
    '.rfp-toc{padding:14pt 24pt 10pt;}',
    '.rfp-toc-title{font-size:13pt;font-weight:700;color:#BA9765;margin-bottom:8pt;border-bottom:1pt solid #BA9765;padding-bottom:4pt;}',
    '.rfp-toc-item{display:flex;justify-content:space-between;padding:3pt 0;font-size:9pt;color:#745B35;border-bottom:0.5pt dotted #d1d5db;}',
    '.rfp-toc-item.bold{font-weight:700;}',
    '.rfp-toc-item.indent{padding-left:14pt;color:#374151;font-weight:400;}',
    '.rfp-section{padding:12pt 24pt;border-bottom:0.5pt solid #e5e7eb;}',
    '.rfp-section-title{font-size:12pt;font-weight:700;color:#1a1a1a;margin-bottom:7pt;border-bottom:1.5pt solid #BA9765;padding-bottom:3pt;}',
    '.rfp-section-num{display:inline-block;width:18pt;height:18pt;border-radius:50%;background:#BA9765;color:white;text-align:center;line-height:18pt;font-weight:700;font-size:8pt;margin-right:4pt;vertical-align:middle;}',
    '.rfp-section p{font-size:10pt;line-height:1.5;margin:0 0 6pt;}',
    '.rfp-section ul{margin:3pt 0 6pt 16pt;}',
    '.rfp-section li{font-size:9.5pt;line-height:1.5;margin-bottom:2pt;}',
    '.rfp-subsection{margin:9pt 0 4pt;}',
    '.rfp-subsection-title{font-size:10pt;font-weight:700;color:#745B35;margin-bottom:4pt;}',
    '.rfp-deliverables{background:var(--cpc-gold-tint);border-left:2.5pt solid #BA9765;padding:5pt 9pt;font-size:9pt;color:#374151;margin-top:4pt;line-height:1.5;}',
    '.rfp-spec-table{width:100%;border-collapse:collapse;margin:7pt 0;font-size:9pt;}',
    '.rfp-spec-table th{background:#745B35;color:white;padding:5pt 9pt;font-weight:700;border:0.5pt solid #E9DCC4;}',
    '.rfp-spec-table td{padding:4.5pt 9pt;border:0.5pt solid #d1d5db;line-height:1.5;vertical-align:top;background:white;}',
    '.rfp-spec-table tr:nth-child(even) td{background:var(--cpc-gold-tint);}',
    '.rfp-footer{background:#745B35;color:white;padding:10pt 24pt;text-align:center;font-size:8pt;line-height:1.8;}',
    'table{border-collapse:collapse;}',
    'h1,h2,h3,h4{color:#1a1a1a;}',
  ].join('\n');

  var fullHtml = '<!DOCTYPE html><html><head><meta charset="UTF-8">'
    + '<style>' + rfpCss + '</style>'
    + '</head><body><div class="rfp-doc">'
    + rfp.content
    + '</div></body></html>';

  // Build a wrapper div with content rendered in a hidden but on-screen container.
  // html2canvas requires the element to be in the viewport or visible in DOM.
  var container = document.createElement('div');
  container.style.cssText = [
    'position:fixed',
    'left:-9999px',
    'top:0',
    'width:794px',
    'min-height:1123px',
    'background:#ffffff',
    'z-index:-1',
    'overflow:visible',
  ].join(';');

  container.innerHTML = fullHtml
    .replace('<!DOCTYPE html><html><head><meta charset="UTF-8"><style>', '<style>')
    .replace('</style></head><body><div class="rfp-doc">', '</style><div class="rfp-doc">')
    .replace('</div></body></html>', '</div>');

  // Alternatively, just inject the full HTML as-is inside the div
  container.innerHTML = '<div style="font-family:Arial,Calibri,sans-serif;font-size:11pt;color:#1a1a1a;background:#fff;padding:20px">'
    + '<style>' + rfpCss + '</style>'
    + '<div class="rfp-doc">' + rfp.content + '</div>'
    + '</div>';

  document.body.appendChild(container);

  // Give browser time to lay out the element before capturing
  requestAnimationFrame(function() {
    setTimeout(function() {
      var opt = {
        margin:      [12, 12, 12, 12],
        filename:    filename,
        image:       { type: 'jpeg', quality: 0.97 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          allowTaint: true,
          backgroundColor: '#ffffff',
          logging: false,
          windowWidth: 794,
        },
        jsPDF:       { unit: 'mm', format: 'a4', orientation: 'portrait' },
        pagebreak:   { mode: ['css', 'legacy'] },
      };

      html2pdf().set(opt).from(container.firstChild || container).save()
        .then(function() {
          document.body.removeChild(container);
          showToast('PDF downloaded successfully!', 'success');
        })
        .catch(function(err) {
          document.body.removeChild(container);
          console.error('html2pdf error:', err);
          showToast('PDF generation failed: ' + (err && err.message ? err.message : err), 'error');
        });
    }, 400);
  });
}

// --- TAB: VENDORS ---
rfpTabs.vendors = async function(rfpId, rfp) {
  const [vendors, emailLog] = await Promise.all([
    apiCall('GET', '/rfps/' + rfpId + '/vendors').catch(function(){ return []; }),
    apiCall('GET', '/rfps/' + rfpId + '/emails').catch(function(){ return []; }),
  ]);
  appState.rfpVendors = vendors;

  const shortlistedVendors = vendors.filter(function(v){ return v.shortlisted; });
  const otherVendors = vendors.filter(function(v){ return !v.shortlisted; });
  const shortlistedCount = shortlistedVendors.length;

  // Build invitation status map per vendor
  const invitationMap = {};
  emailLog.forEach(function(e) {
    if (e.email_type === 'invitation' && e.vendor_id) {
      invitationMap[e.vendor_id] = e;
    }
  });
  // Build received email map per vendor
  const receivedMap = {};
  emailLog.forEach(function(e) {
    if (e.status === 'received' && e.vendor_id) {
      if (!receivedMap[e.vendor_id]) receivedMap[e.vendor_id] = 0;
      receivedMap[e.vendor_id]++;
    }
  });

  function buildVendorRow(v, allowRemove) {
    const isDeclined = v.rfp_status === 'declined';
    const score = v.rfp_fit_score || v.fit_score || 0;
    const fitCls = score >= 75 ? 'perf-high' : score >= 50 ? 'perf-mid' : 'perf-low';
    // Show first 3 tags; clicking the cell opens full vendor detail with all specs
    var allSpecs = (v.specializations||'').split(',').filter(Boolean);
    var visibleTags = allSpecs.slice(0,3).map(function(s){ return '<span class="tag">' + escHtml(tSpec(s.trim())) + '</span>'; }).join('');
    var moreCount = allSpecs.length - 3;
    var moreHint = moreCount > 0 ? '<span style="cursor:pointer;font-size:0.75rem;color:var(--cpc-gold-deep);text-decoration:underline;margin-left:3px">+' + moreCount + '</span>' : '';
    const tags = visibleTags + moreHint;

    // Row background: RED tint if declined
    const rowStyle = isDeclined ? ' style="background:#fef2f2;opacity:0.85"' : '';

    const actionBtn = isDeclined
      ? '<span style="font-size:0.72rem;color:#dc2626;font-weight:600;padding:2px 8px">' + t('vstatus_declined') + '</span>'
      : allowRemove
        ? '<button class="btn-danger btn-sm" onclick="toggleVendorShortlist(' + rfpId + ',' + v.id + ',false)"><i class="fas fa-minus"></i>' + t('btn_remove') + '</button>'
        : '<button class="btn-secondary btn-sm" onclick="toggleVendorShortlist(' + rfpId + ',' + v.id + ',true)"><i class="fas fa-plus"></i>' + t('btn_add') + '</button>';

    // Participation status badge — declined overrides invitation badge
    let invBadge = '';
    if (isDeclined) {
      invBadge = '<span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:700;border:1px solid #fca5a5">'
        + '<i class="fas fa-times-circle" style="margin-right:0.25rem"></i>' + t('vstatus_declined') + '</span>';
    } else {
      const inv = invitationMap[v.id];
      if (!inv) {
        invBadge = '<span style="background:#f3f4f6;color:#6b7280;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:500">' + t('vstatus_not_invited') + '</span>';
      } else if (inv.status === 'sent') {
        invBadge = '<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:600"><i class="fas fa-check-circle" style="margin-right:0.25rem"></i>' + t('vstatus_invited') + '</span>';
      } else {
        invBadge = '<span style="background:#ede9fe;color:#5b21b6;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:500"><i class="fas fa-flask" style="margin-right:0.25rem"></i>' + t('vstatus_simulated') + '</span>';
      }
    }

    // Received emails count
    const rxCount = receivedMap[v.id] || 0;
    const rxBadge = rxCount > 0
      ? '<span style="background:#ede9fe;color:var(--cpc-gold-deep);border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:600;margin-left:4px"><i class="fas fa-reply" style="margin-right:0.25rem"></i>' + rxCount + ' ' + t('vstatus_replied') + '</span>'
      : '';

    // Communications button: disabled if declined
    const commBtn = isDeclined
      ? '<button class="btn-ghost btn-sm" disabled title="Communications prohibited — vendor declined" style="opacity:0.4;cursor:not-allowed"><i class="fas fa-ban"></i>' + t('vstatus_no_comms') + '</button>'
      : '<button class="btn-ghost btn-sm" onclick="navigateToVendorComms(' + rfpId + ',' + v.id + ')" title="Open Communications"><i class="fas fa-comments"></i>' + t('btn_comms') + '</button>';

    // Avatar background: red if declined
    const avatarBg = isDeclined ? '#dc2626' : 'var(--cpc-ink)';

    // Participant code (only shown when vendor is shortlisted/invited)
    const participantCode = allowRemove ? 'RFP-' + rfpId + '-V' + v.id : '';

    return '<tr' + rowStyle + '>'
      + '<td><div style="display:flex;align-items:center;gap:0.75rem">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:' + avatarBg + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.9rem;flex-shrink:0">'
      + (isDeclined ? '<i class="fas fa-times" style="font-size:0.8rem"></i>' : escHtml(v.name.charAt(0))) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.95rem' + (isDeclined ? ';color:#991b1b' : '') + '">' + escHtml(v.name) + '</div>'
      + '<div style="font-size:0.78rem;color:#9ca3af">' + escHtml(tVendorCountry(v.country||'UAE')) + ' &bull; ' + escHtml(tVendorSize(v.size||''))
      + (participantCode ? ' &bull; <span style="font-family:monospace;color:var(--cpc-ink);font-weight:600" title="Participant Reference">' + participantCode + '</span>' : '')
      + '</div>'
      + '</div></div></td>'
      + '<td onclick="viewVendorDetail(' + v.id + ')" style="cursor:pointer" title="Click to see all specializations"><div class="tag-group">' + tags + '</div></td>'
      + '<td><span class="perf-badge ' + fitCls + '">' + score + '/100</span></td>'
      + '<td>' + invBadge + rxBadge + '</td>'
      + '<td style="text-align:center">' + actionBtn + '</td>'
      + '<td><div style="display:flex;gap:4px">' + commBtn + '<button class="btn-ghost btn-sm" onclick="viewVendorDetail(' + v.id + ')"><i class="fas fa-eye"></i></button></div></td>'
      + '</tr>';
  }

  // Shortlisted table rows
  let shortlistedRows = '';
  shortlistedVendors.forEach(function(v){ shortlistedRows += buildVendorRow(v, true); });

  // Other vendors collapsed section
  let otherRows = '';
  otherVendors.forEach(function(v){ otherRows += buildVendorRow(v, false); });

  const tableHead = '<thead><tr><th>' + t('th_vendor') + '</th><th>' + t('th_specializations') + '</th><th>' + t('th_fit_score') + '</th><th>' + t('th_participation') + '</th><th style="text-align:center">' + t('th_shortlist') + '</th><th></th></tr></thead>';

  // Stage-action bar for Vendors tab — shown when stage is 'published' (ready to invite)
  var vendorStageBar = '';
  if (rfp && rfp.stage === 'published') {
    vendorStageBar = '<div style="background:linear-gradient(90deg,#eff6ff,#dbeafe);border:1.5px solid #3b82f6;border-radius:10px;padding:0.65rem 1rem;display:flex;align-items:center;gap:0.75rem">'
      + '<i class="fas fa-paper-plane" style="color:#2563eb;font-size:1rem;flex-shrink:0"></i>'
      + '<div style="flex:1"><span style="font-weight:700;color:#1e3a8a;font-size:0.88rem">RFP is Published</span>'
      + '<span style="color:#1d4ed8;font-size:0.82rem;margin-left:0.5rem">Shortlist vendors and send invitations to start the Q&amp;A phase.</span></div>'
      + '<button class="btn-primary" style="flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:6px;padding:0.4rem 1rem;font-size:0.82rem" onclick="sendRfpInvitations(' + rfpId + ')"><i class="fas fa-paper-plane" style="font-size:0.78rem"></i>Send Invitations</button>'
      + '</div>';
  }

  setContent(
    '<div class="space-y-4">'
    + vendorStageBar

    // Header with actions
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div>'
    + '<h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">' + t('vendors_section_title') + '</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + shortlistedCount + ' ' + t('vendors_shortlisted') + ' &bull; ' + t('vendors_inv_status') + '</p>'
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" id="aiShortlistBtn" onclick="aiShortlistVendors(' + rfpId + ')"><i class="fas fa-robot"></i>' + t('vendors_ai_suggest') + '</button>'
    + '<button class="btn-ghost btn-sm" onclick="sendRfpInvitations(' + rfpId + ')"><i class="fas fa-paper-plane"></i>' + t('vendors_send_inv') + '</button>'
    + '</div>'
    + '</div>'

    // Shortlisted vendors table (always visible)
    + (shortlistedCount === 0
      ? '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
        + '<i class="fas fa-clipboard-list" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i>'
        + '<p style="font-weight:600;color:#6b7280;margin-bottom:0.5rem">' + t('vendors_none_title') + '</p>'
        + '<p style="font-size:0.85rem">' + t('vendors_none_sub') + '</p>'
        + '</div>'
      : '<div class="card"><div style="overflow-x:auto"><table>' + tableHead + '<tbody>' + shortlistedRows + '</tbody></table></div></div>')

    // Other vendors — collapsible
    + '<div>'
    + '<button class="btn-ghost btn-sm" style="font-size:0.82rem;color:#9ca3af" onclick="toggleOtherVendors()">'
    + '<i class="fas fa-chevron-right" id="otherVendorsChevron" style="margin-right:4px;font-size:0.72rem"></i>'
    + t('vendors_show_pool') + ' (' + otherVendors.length + ' ' + t('vendors_not_shortlisted') + ')'
    + '</button>'
    + '<div id="otherVendorsPanel" style="display:none;margin-top:0.75rem">'
    + '<div class="card"><div style="overflow-x:auto"><table>' + tableHead + '<tbody>' + otherRows + '</tbody></table></div></div>'
    + '</div>'
    + '</div>'

    + '</div>'
  );
};

function navigateToVendorComms(rfpId, vendorId) {
  navigateTo('vendor_comms', { rfpId: rfpId, vendorId: vendorId });
}

function toggleOtherVendors() {
  var panel = document.getElementById('otherVendorsPanel');
  var chevron = document.getElementById('otherVendorsChevron');
  if (!panel) return;
  var showing = panel.style.display !== 'none';
  panel.style.display = showing ? 'none' : 'block';
  if (chevron) chevron.className = showing ? 'fas fa-chevron-right' : 'fas fa-chevron-down';
}

async function toggleVendorShortlist(rfpId, vendorId, val) {
  await apiCall('PUT', '/rfps/' + rfpId + '/vendors/' + vendorId + '/shortlist', { shortlisted: val });
  showToast(val ? 'Vendor shortlisted!' : 'Removed from shortlist', 'success');
  rfpTabs.vendors(rfpId, appState.currentRfp);
}

async function aiShortlistVendors(rfpId) {
  const btn = document.getElementById('aiShortlistBtn');
  setLoading(btn, true, 'Scoring...');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/vendors/ai-shortlist', {});
    showToast('AI shortlisting complete! Qualified vendors are now highlighted.', 'success');
    rfpTabs.vendors(rfpId, appState.currentRfp);
  } catch(e) {
    setLoading(btn, false);
  }
}

async function sendRfpInvitations(rfpId) {
  const shortlisted = appState.rfpVendors.filter(function(v){ return v.shortlisted; });
  if (shortlisted.length === 0) { showToast('Please shortlist vendors first', 'error'); return; }
  const rfp = appState.currentRfp;
  if (!rfp || !rfp.content) {
    if (!confirm('No RFP document generated. Send invitation without PDF attachment?')) return;
  }
  // Collect real email for Andersen
  const andersen = shortlisted.find(function(v){ return v.contact_email && v.contact_email.includes('andersenlab.com'); });
  showModal(
    '<h3 style="font-size:1rem;font-weight:700;margin-bottom:1rem"><i class="fas fa-paper-plane cpc-gold" style="margin-right:0.5rem"></i>' + t('inv_modal_title') + '</h3>'
    + '<p style="color:#6b7280;font-size:0.875rem;margin-bottom:1rem">' + t('inv_sending_to') + ' <strong>' + shortlisted.length + '</strong> ' + t('inv_shortlisted') + ' '
    + (andersen ? t('inv_real_email') + ' ' + escHtml(andersen.contact_email) + '. ' + t('inv_others_simulated') : t('inv_all_simulated'))
    + '</p>'
    + '<div class="form-group"><label>' + t('invite_q_deadline') + '</label><input type="date" id="invQDeadline" value="' + getDateOffset(14) + '"></div>'
    + '<div class="form-group"><label>' + t('invite_s_deadline') + '</label><input type="date" id="invSDeadline" value="' + (rfp && rfp.deadline ? rfp.deadline : getDateOffset(30)) + '"></div>'
    + '<div class="form-group"><label>' + t('invite_notes') + '</label><textarea id="invNotes" rows="2" placeholder="' + t('invite_notes_ph') + '"></textarea></div>'
    + '<div style="display:flex;gap:0.75rem;margin-top:1rem">'
    + '<button class="btn-primary" id="sendInvBtn" onclick="confirmSendInvitations(' + rfpId + ')"><i class="fas fa-send"></i>' + t('inv_send_pdf_btn') + '</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

function getDateOffset(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

async function confirmSendInvitations(rfpId) {
  var btn = document.getElementById('sendInvBtn');
  setLoading(btn, true, 'Sending...');
  try {
    var qDeadline = document.getElementById('invQDeadline').value;
    var sDeadline = document.getElementById('invSDeadline').value;
    var notes = document.getElementById('invNotes').value;

    // Generate PDF and attach to email if html2pdf is available and RFP has content
    var pdfBase64 = null;
    var pdfFilename = null;
    var rfp = appState.currentRfp;
    if (rfp && rfp.content && typeof window.html2canvas !== 'undefined' && typeof window.jspdf !== 'undefined') {
      try {
        setLoading(btn, true, 'Generating PDF…');
        var pdfResult = await generateRfpPdfBlob(rfpId);
        pdfBase64 = await blobToBase64(pdfResult.blob);
        pdfFilename = pdfResult.filename;
        setLoading(btn, true, 'Sending…');
      } catch(pdfErr) {
        console.warn('PDF generation for email failed, sending without attachment:', pdfErr);
      }
    }

    var payload = {
      questions_deadline: qDeadline,
      submission_deadline: sDeadline,
      notes: notes,
    };
    if (pdfBase64) {
      payload.pdf_base64 = pdfBase64;
      payload.pdf_filename = pdfFilename;
    }

    var result = await apiCall('POST', '/rfps/' + rfpId + '/emails/send-invitations', payload);
    // Advance stage from published → qa_open to mark Vendor Invitation as complete on the lifecycle bar
    var currentStage = appState.currentRfp ? appState.currentRfp.stage : 'published';
    if (currentStage === 'published') {
      await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: 'qa_open' }).catch(function(){});
    }
    // Refresh RFP state and all header elements
    var rfp = await apiCall('GET', '/rfps/' + rfpId);
    appState.currentRfp = rfp;
    var subtitleEl = document.getElementById('pageSubtitle');
    if (subtitleEl) subtitleEl.textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');
    // Publish + Invite are now done; Q&A and Proposals become ACTIVE (we wait for both)
    markStageCompleted(rfpId, 'publish');
    markStageCompleted(rfpId, 'invite');
    markStageActive(rfpId, 'qa');
    markStageActive(rfpId, 'proposals');
    renderLifecycleBar(rfp);
    // Update banner to qa_open guidance
    refreshStageBanner(rfpId, rfp);
    renderRfpTabs('vendors', rfpId, appState.unreadQA);
    // Count shortlisted vendors from local state (avoid undefined reference)
    var sentCount = (result && result.results) ? result.results.length : (appState.rfpVendors ? appState.rfpVendors.filter(function(v){ return v.shortlisted; }).length : 0);
    var pdfNote = pdfBase64 ? ' with PDF attachment' : '';
    showToast('\u2709\uFE0F Invitations sent to ' + sentCount + ' vendor(s)' + pdfNote + '!', 'success', 5000);
    addNotification('email', 'Invitations Sent', 'RFP invitations sent to ' + sentCount + ' vendor(s)' + pdfNote, rfpId, 'vendors', null);
    closeModal();
    // Stay on Vendors tab — no redirect
    switchRfpTab('vendors', rfpId);
    // Start 5s global background poller — runs regardless of active tab for 2h
    startGlobalInboxPolling(rfpId);
  } catch(e) {
    setLoading(btn, false);
  }
}

// --- TAB: EMAILS (kept as dead code — no longer in RFP_TABS) ---
rfpTabs.emails = async function(rfpId) {
  const [allEmails, received] = await Promise.all([
    apiCall('GET', '/rfps/' + rfpId + '/emails').catch(function(){ return []; }),
    apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; }),
  ]);
  appState.emails = allEmails;
  appState.receivedEmails = received;
  appState.unreadEmailCount = 0; // reset unread count when viewing

  // Group all emails by vendor
  const vendorMap = {}; // vendorId -> { vendor_name, emails[] }
  allEmails.forEach(function(e) {
    const vid = e.vendor_id || 'unknown';
    if (!vendorMap[vid]) vendorMap[vid] = { vendor_name: e.vendor_name || e.recipient || 'Unknown Vendor', emails: [] };
    vendorMap[vid].emails.push(e);
  });
  received.forEach(function(e) {
    const vid = e.vendor_id || 'unknown';
    if (!vendorMap[vid]) vendorMap[vid] = { vendor_name: e.vendor_name || e.from_email || 'Unknown Vendor', emails: [] };
    // avoid duplicates (received is already in allEmails via status=received)
    const exists = vendorMap[vid].emails.find(function(x){ return x.id === e.id; });
    if (!exists) vendorMap[vid].emails.push(e);
  });

  // Auto-start inbox polling
  startInboxPolling(rfpId);

  // Header
  const totalVendors = Object.keys(vendorMap).length;
  const inboxCount = received.length;

  let vendorThreadsHtml = '';
  if (totalVendors === 0) {
    vendorThreadsHtml = '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i>'
      + '<p style="font-weight:600;color:#6b7280;margin-bottom:0.25rem">No email correspondence yet</p>'
      + '<p style="font-size:0.82rem">Send invitations from the <strong>Vendors</strong> tab to start vendor communication.<br>'
      + 'Incoming replies will appear here automatically via <strong>procurement@cpc-rfp.website</strong>.</p>'
      + '</div>';
  } else {
    Object.entries(vendorMap).forEach(function(entry) {
      const vid = entry[0];
      const vdata = entry[1];
      const vEmails = vdata.emails.slice().sort(function(a,b){ return (a.id||0)-(b.id||0); });
      const vReceivedCount = vEmails.filter(function(e){ return e.status === 'received'; }).length;
      const threadId = 'thread-vendor-' + vid;
      const isNumericVid = vid !== 'unknown' && !isNaN(Number(vid));

      let threadEmails = '';
      vEmails.forEach(function(e) {
        const isInbound = e.status === 'received';
        const dateStr = e.created_at ? new Date(e.created_at).toLocaleString('en-AE') : '-';
        const attachBadge = e.has_attachment
          ? '<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-paperclip" style="margin-right:0.25rem"></i>Attachment</span>'
          : (e.has_pdf ? '<span style="background:#ede9fe;color:var(--cpc-gold-deep);border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-file-pdf" style="margin-right:0.25rem"></i>PDF</span>' : '');
        const typeBadge = '<span style="background:#f3f4f6;color:#6b7280;border-radius:4px;padding:2px 6px;font-size:0.7rem">' + escHtml(e.email_type||'') + '</span>';

        const bodyCollapseId = 'email-body-' + e.id;
        const bodyContent = e.email_body_html
          ? '<iframe srcdoc="' + escHtml(e.email_body_html) + '" style="width:100%;border:none;min-height:180px;border-radius:6px;background:white" sandbox="allow-same-origin"></iframe>'
          : '<pre style="white-space:pre-wrap;font-size:0.82rem;color:#374151;font-family:inherit;margin:0;background:#f9fafb;padding:0.75rem;border-radius:6px" dir="auto">' + escHtml((e.body||'(no body)').slice(0,2000)) + '</pre>';

        threadEmails += '<div style="display:flex;gap:0.75rem;margin-bottom:0.875rem;flex-direction:' + (isInbound ? 'row' : 'row-reverse') + '">'
          // Avatar
          + '<div style="width:32px;height:32px;border-radius:50%;background:' + (isInbound ? '#BA9765' : 'var(--cpc-gold)') + ';display:flex;align-items:center;justify-content:center;flex-shrink:0">'
          + '<i class="fas ' + (isInbound ? 'fa-user' : 'fa-crown') + '" style="color:white;font-size:0.75rem"></i></div>'
          // Bubble
          + '<div style="flex:1;max-width:85%">'
          + '<div style="background:' + (isInbound ? '#f5f3ff' : '#fff7e6') + ';border:1px solid ' + (isInbound ? '#ede9fe' : '#fde68a') + ';border-radius:' + (isInbound ? '0 12px 12px 12px' : '12px 0 12px 12px') + ';padding:0.75rem 1rem">'
          + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;gap:0.5rem;flex-wrap:wrap">'
          + '<span style="font-weight:600;font-size:0.8rem;color:' + (isInbound ? '#BA9765' : '#b45309') + '">' + escHtml(isInbound ? (e.from_email||vdata.vendor_name) : 'CPC Procurement') + '</span>'
          + '<div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">' + typeBadge + attachBadge + '<span style="font-size:0.7rem;color:#9ca3af">' + dateStr + '</span></div>'
          + '</div>'
          + '<div style="font-size:0.82rem;font-weight:600;color:#374151;margin-bottom:0.4rem">' + escHtml(e.subject||'(no subject)') + '</div>'
          + '<button onclick="toggleInboundBody(\x27' + bodyCollapseId + '\x27)" style="font-size:0.72rem;color:' + (isInbound ? '#BA9765' : '#b45309') + ';background:none;border:none;cursor:pointer;padding:0;margin-bottom:0.4rem">'
          + '<i class="fas fa-chevron-down" id="chevron-' + bodyCollapseId + '"></i> View body</button>'
          + '<div id="' + bodyCollapseId + '" style="display:none;margin-top:0.5rem">' + bodyContent + '</div>'
          + (isInbound && e.has_attachment ? '<div style="margin-top:0.5rem;font-size:0.75rem;color:#92400e;background:#fef3c7;padding:4px 8px;border-radius:4px"><i class="fas fa-file-excel" style="margin-right:0.25rem"></i>Attachment processed — see Q&A tab</div>' : '')
          + '</div>'
          + '</div>'
          + '</div>';
      });

      const replyFormId = 'reply-form-' + vid;
      const replyTextId = 'reply-text-' + vid;
      const replySubjId = 'reply-subj-' + vid;

      const replySection = isNumericVid ? (
        '<div id="' + replyFormId + '" style="display:none;padding:1rem;border-top:1px solid #f3f4f6;background:#fafafa">'
        + '<div style="font-weight:600;font-size:0.8rem;color:#374151;margin-bottom:0.5rem"><i class="fas fa-reply" style="margin-right:0.25rem"></i>Reply to ' + escHtml(vdata.vendor_name) + '</div>'
        + '<input id="' + replySubjId + '" type="text" placeholder="Subject..." style="width:100%;padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;margin-bottom:0.5rem;box-sizing:border-box">'
        + '<textarea id="' + replyTextId + '" rows="4" placeholder="Your reply message..." style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;resize:vertical;box-sizing:border-box"></textarea>'
        + '<div style="display:flex;gap:0.5rem;margin-top:0.5rem">'
        + '<button class="btn-primary btn-sm" onclick="sendVendorReply(' + rfpId + ',' + vid + ')"><i class="fas fa-paper-plane"></i>Send Reply</button>'
        + '<button class="btn-ghost btn-sm" onclick="document.getElementById(\x27' + replyFormId + '\x27).style.display=\x27none\x27">Cancel</button>'
        + '</div>'
        + '</div>'
      ) : '';

      vendorThreadsHtml += '<div class="card" style="padding:0;overflow:hidden;margin-bottom:0.875rem">'
        // Thread header
        + '<div style="padding:0.875rem 1rem;background:linear-gradient(135deg,#1B17120a,#4f46e508);display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #f3f4f6">'
        + '<div style="display:flex;align-items:center;gap:0.75rem">'
        + '<div style="width:36px;height:36px;border-radius:8px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.85rem">' + escHtml((vdata.vendor_name||'?').charAt(0)) + '</div>'
        + '<div>'
        + '<div style="font-weight:700;font-size:0.9rem;color:#1f2937">' + escHtml(vdata.vendor_name) + '</div>'
        + '<div style="font-size:0.75rem;color:#9ca3af">' + vEmails.length + ' message(s)' + (vReceivedCount > 0 ? ' &bull; <span style="color:var(--cpc-gold-deep);font-weight:600">' + vReceivedCount + ' received</span>' : '') + '</div>'
        + '</div>'
        + '</div>'
        + '<div style="display:flex;gap:0.5rem">'
        + (isNumericVid ? '<button class="btn-ghost btn-sm" onclick="toggleVendorReply(\x27' + replyFormId + '\x27)"><i class="fas fa-reply"></i>Reply</button>' : '')
        + '<button class="btn-ghost btn-sm" onclick="toggleThreadBody(\x27' + threadId + '\x27)"><i class="fas fa-chevron-down" id="chevron-' + threadId + '"></i></button>'
        + '</div>'
        + '</div>'
        // Thread body (collapsible)
        + '<div id="' + threadId + '" style="padding:1rem">'
        + (threadEmails || '<div style="padding:1rem;color:#9ca3af;font-size:0.82rem;text-align:center">No emails yet</div>')
        + '</div>'
        // Reply form
        + replySection
        + '</div>';
    });
  }

  setContent(
    '<div class="space-y-4">'

    // Header
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">'
    + '<div>'
    + '<h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0"><i class="fas fa-comments" style="margin-right:0.5rem" style="color:var(--cpc-ink)"></i>Email Correspondence</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">'
    + totalVendors + ' vendor thread(s) &bull; '
    + '<div style="display:inline-flex;align-items:center;gap:4px"><div style="width:8px;height:8px;border-radius:50%;background:#22c55e;animation:pulse 2s infinite"></div>'
    + ' <code style="font-size:0.78rem;background:#f3f4f6;padding:1px 5px;border-radius:4px">procurement@cpc-rfp.website</code></div>'
    + '</p>'
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-secondary" onclick="checkInboxForQA(' + rfpId + ')" id="checkInboxBtn"><i class="fas fa-sync"></i>Refresh</button>'
    + '</div>'
    + '</div>'

    // Vendor threads
    + '<div>' + vendorThreadsHtml + '</div>'

    + '</div>'
  );
};

function toggleInboundBody(id) {
  var el = document.getElementById(id);
  var chevron = document.getElementById('chevron-' + id);
  if (!el) return;
  var hidden = el.style.display === 'none';
  el.style.display = hidden ? 'block' : 'none';
  if (chevron) chevron.className = hidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
}

function toggleVendorReply(formId) {
  var form = document.getElementById(formId);
  if (!form) return;
  form.style.display = form.style.display === 'none' ? 'block' : 'none';
}

function toggleThreadBody(threadId) {
  var el = document.getElementById(threadId);
  var chevron = document.getElementById('chevron-' + threadId);
  if (!el) return;
  var hidden = el.style.display === 'none';
  el.style.display = hidden ? 'block' : 'none';
  if (chevron) chevron.className = hidden ? 'fas fa-chevron-up' : 'fas fa-chevron-down';
}

async function sendVendorReply(rfpId, vendorId) {
  const subjEl = document.getElementById('reply-subj-' + vendorId);
  const textEl = document.getElementById('reply-text-' + vendorId);
  if (!textEl || !textEl.value.trim()) { showToast('Please enter a reply message', 'error'); return; }
  try {
    const result = await apiCall('POST', '/rfps/' + rfpId + '/vendors/' + vendorId + '/reply', {
      subject: subjEl ? subjEl.value : '',
      text: textEl.value,
    });
    if (result.ok) {
      showToast('Reply sent successfully!', 'success');
      addNotification('email', 'Reply Sent', 'Reply sent to vendor', rfpId, 'emails');
    } else {
      showToast('Reply simulated (no real API key): ' + (result.error || ''), 'info');
    }
    rfpTabs.emails(rfpId);
  } catch(e) {
    showToast('Failed to send reply: ' + e.message, 'error');
  }
}

// Polling for new inbound emails — runs every 5s while on emails tab
// Also runs as a global background poller (5s) after invitations are sent,
// so new emails are detected even when the user is on a different tab.
var _inboxPollTimer = null;
var _inboxPollRfpId = null;

// Proposal count tracking — keyed by rfpId; initialised on first poll
var _lastSeenProposalCount = {};

// Start tab-scoped polling (stops when user leaves the emails tab)
function startInboxPolling(rfpId) {
  if (_inboxPollTimer) clearInterval(_inboxPollTimer);
  _inboxPollRfpId = rfpId;
  _inboxPollTimer = setInterval(function() {
    if (appState.currentRfpTab !== 'emails') { clearInterval(_inboxPollTimer); _inboxPollTimer = null; return; }
    silentCheckInbox(rfpId);
  }, 5000);
}

// Global background poller — keeps running regardless of active tab.
// Started once per RFP when invitations are sent; stops after 2 hours.
var _globalPollTimer = null;
var _globalPollRfpId = null;
var _globalPollStart = 0;
function startGlobalInboxPolling(rfpId) {
  if (_globalPollTimer) clearInterval(_globalPollTimer);
  _globalPollRfpId = rfpId;
  _globalPollStart = Date.now();
  _globalPollTimer = setInterval(function() {
    // Auto-stop after 2 hours
    if (Date.now() - _globalPollStart > 2 * 60 * 60 * 1000) {
      clearInterval(_globalPollTimer); _globalPollTimer = null; return;
    }
    // Skip if the tab-scoped poller is already running (avoids double calls)
    if (_inboxPollTimer && appState.currentRfpTab === 'emails') return;
    silentCheckInbox(rfpId);
    silentCheckProposals(rfpId); // always poll proposals independently — portal submissions bypass email
  }, 5000);
}

// Track last seen email ID per RFP — survives tab switches (unlike length comparison)
var _lastSeenEmailId = {};

async function silentCheckInbox(rfpId) {
  try {
    const received = await apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; });

    // Also fetch current RFP state to detect stage changes (e.g. Q&A auto-closed)
    const rfpNow = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    const prevStage = appState.currentRfp ? appState.currentRfp.stage : null;
    const currentStage = rfpNow ? rfpNow.stage : prevStage;

    // ── Stage transition detection: Q&A closed → submissions_closed ──
    if (prevStage === 'qa_open' && currentStage === 'submissions_closed') {
      if (rfpNow) appState.currentRfp = rfpNow;
      // No auto-redirect — just update bar and notify
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderLifecycleBar(rfpNow);
      }
      addNotification('stage',
        '\uD83D\uDD12 Q&A Stage Closed',
        'Q&A is now closed. You can now proceed to reviewing proposals.',
        rfpId, 'qa', null
      );
      return;
    }

    // Update lifecycle bar if stage changed for other reasons
    if (rfpNow && prevStage !== currentStage) {
      appState.currentRfp = rfpNow;
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderLifecycleBar(rfpNow);
      }
    }

    // Always check for portal-submitted proposals even when there are no emails
    await silentCheckProposals(rfpId);

    if (!received || received.length === 0) return;

    // Detect new emails by comparing the newest email's id to the last seen id
    var newestId = received[0] ? received[0].id : null;
    var lastSeen = _lastSeenEmailId[rfpId] || null;

    // On first poll for this rfp: initialise lastSeen to current newest so we don't
    // retroactively trigger on already-visible emails.
    if (lastSeen === null) {
      _lastSeenEmailId[rfpId] = newestId;
      appState.receivedEmails = received;
      return;
    }

    // Find emails that arrived after lastSeen
    var newEmails = received.filter(function(e) { return e.id > lastSeen; });
    if (newEmails.length === 0) return;

    // Update state
    _lastSeenEmailId[rfpId] = newestId;
    appState.receivedEmails = received;
    appState.unreadEmailCount = (appState.unreadEmailCount || 0) + newEmails.length;

    var newest = newEmails[0];
    var attachBadge = newest && newest.has_attachment ? ' with Excel attachment' : '';
    var senderName = (newest && (newest.vendor_name || newest.from_email)) || 'vendor';
    var newestVendorId = newest ? (newest.vendor_id || null) : null;

    // Determine what kind of email arrived (use email_category set by LLM in webhook)
    // Widen detection: also catch 'inbound' emails that have attachments (questions without explicit category)
    var isDeclineEmail   = newest && (newest.email_category === 'decline'   || newest.email_type === 'decline');
    var isQuestionsEmail = newest && (newest.email_category === 'questions' || newest.email_type === 'qa_questions'
                                      || (newest.has_attachment && !newest.email_category && newest.email_type !== 'decline'));
    var isProposalEmail  = newest && !isDeclineEmail && !isQuestionsEmail
                                  && (newest.email_category === 'proposal'  || newest.email_type === 'proposal');

    // ── Always bump vendors badge for ANY incoming email (they're all vendor comms) ──
    if (appState.currentRfpTab !== 'vendors') {
      appState.unreadVendors = (appState.unreadVendors || 0) + newEmails.length;
    }

    if (isDeclineEmail) {
      addNotification('decline',
        '⛔ Vendor Declined — ' + senderName,
        senderName + ' has declined participation in this RFP. They are now shown in red in the Vendors tab.',
        rfpId, 'vendors', newestVendorId
      );
      showToast('⛔ ' + senderName + ' has declined participation in this RFP.', 'warning', 6000);
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
        if (appState.currentRfpTab === 'vendors') rfpTabs.vendors(rfpId, appState.currentRfp);
      }

    } else if (isQuestionsEmail) {
      var questions = await apiCall('GET', '/rfps/' + rfpId + '/questions').catch(function(){ return []; });
      var unanswered = questions.filter(function(q){ return !q.published; }).length;
      var emailQs = questions.filter(function(q){ return q.source === 'email'; }).length;
      var newQCount = emailQs > 0 ? emailQs : newEmails.length;

      // Increment Q&A badge — only cleared when user opens Q&A tab
      if (appState.currentRfpTab !== 'qa') {
        appState.unreadQA = unanswered > 0 ? unanswered : (appState.unreadQA || 0) + newQCount;
      }
      pulseQATab();

      addNotification('email', '📨 New Email from ' + senderName,
        (newest.subject || 'No Subject') + attachBadge, rfpId, 'vendors', newestVendorId);
      addNotification('questions',
        '📋 ' + newQCount + ' vendor question(s) from ' + senderName,
        newQCount + ' question(s) extracted and added to the Q&A tab for review.',
        rfpId, 'qa', null
      );
      showToast('📋 ' + newQCount + ' vendor question(s) from ' + senderName + ' — check Q&A tab', 'info', 7000);

      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
        // If already on Q&A tab, refresh it live
        if (appState.currentRfpTab === 'qa') rfpTabs.qa(rfpId);
      }

    } else if (isProposalEmail) {
      addNotification('email', '📨 New Email from ' + senderName,
        (newest.subject || 'No Subject') + ' (PDF proposal)', rfpId, 'vendors', newestVendorId);
      addNotification('proposal',
        '📄 Proposal Received — ' + senderName,
        senderName + ' submitted a proposal with PDF. Added to Proposals tab.',
        rfpId, 'proposals', newestVendorId
      );
      showToast('📄 Proposal received from ' + senderName + ' — added to Proposals tab.', 'success', 5000);

      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
        if (appState.currentRfpTab === 'proposals') rfpTabs.proposals(rfpId);
      }

    } else {
      // Generic incoming vendor email
      addNotification('email', '📨 New Email from ' + senderName,
        (newest && newest.subject ? newest.subject : 'No Subject') + attachBadge,
        rfpId, 'vendors', newestVendorId);
      showToast('📨 New email from ' + senderName + ' — check Vendors tab.', 'info', 5000);
      if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
        renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
        if (appState.currentRfpTab === 'vendors') rfpTabs.vendors(rfpId, appState.currentRfp);
      }
    }

  } catch(e) {}
}

// Poll the proposals endpoint and fire a notification when a new portal submission arrives.
var _proposalPollLock = {};
async function silentCheckProposals(rfpId) {
  if (_proposalPollLock[rfpId]) return;         // prevent overlapping calls
  _proposalPollLock[rfpId] = true;
  try {
    const proposals = await apiCall('GET', '/rfps/' + rfpId + '/proposals').catch(function(){ return null; });
    if (!proposals || !Array.isArray(proposals)) return;

    // Only count real submissions (exclude AI-generated samples)
    var realProposals = proposals.filter(function(p){ return p.is_real_submission; });
    var count = realProposals.length;
    var lastSeen = _lastSeenProposalCount[rfpId];

    // First call — initialise baseline, no notification
    if (lastSeen === undefined) {
      _lastSeenProposalCount[rfpId] = count;
      return;
    }

    if (count <= lastSeen) return;               // nothing new

    // New proposal(s) arrived via vendor portal
    var newCount = count - lastSeen;
    _lastSeenProposalCount[rfpId] = count;

    // Find the newest vendor name(s)
    var newProposals = realProposals.slice(0, newCount);
    var vendorNames = newProposals.map(function(p){ return p.vendor_name || 'Unknown vendor'; });
    var nameStr = vendorNames.length === 1 ? vendorNames[0]
                : vendorNames.slice(0, 2).join(', ') + (vendorNames.length > 2 ? ' +' + (vendorNames.length - 2) + ' more' : '');

    addNotification('proposal',
      '📄 Proposal Received — ' + nameStr,
      nameStr + ' submitted a proposal via the vendor portal. Check the Proposals tab.',
      rfpId, 'proposals', newProposals[0] ? (newProposals[0].vendor_id || null) : null
    );
    showToast('📄 Proposal received from ' + nameStr + '. Check Proposals tab.', 'success', 5000);

    // If user is already on this RFP, refresh proposals tab or increment badge
    if (appState.currentRfpId && String(appState.currentRfpId) === String(rfpId)) {
      if (appState.currentRfpTab === 'proposals') {
        rfpTabs.proposals(rfpId);
      } else {
        // Increment badge and update tab bar
        appState.unreadProposals = (appState.unreadProposals || 0) + newCount;
        renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
      }
    }
  } catch(e) {
    // silent fail
  } finally {
    _proposalPollLock[rfpId] = false;
  }
}

// Scroll to the next question card that requires manual intervention.
// ids = array of question IDs that need manual answers (in display order).
// Cycles: after the last one it wraps back to the first.
function scrollToNextManual(ids) {
  if (!ids || ids.length === 0) return;
  // Gather elements in DOM order (questions may be reordered by filter)
  var els = ids.map(function(id) { return document.getElementById('q-' + id); })
               .filter(function(el) { return !!el; });
  if (els.length === 0) return;

  // Find the scroll container — #mainContent or the page body
  var container = document.getElementById('mainContent') || document.documentElement;
  var containerTop = container === document.documentElement ? 0 : container.getBoundingClientRect().top;
  var scrollTop = container === document.documentElement ? window.scrollY : container.scrollTop;

  // Current viewport midpoint relative to the document
  var viewportMid = scrollTop + (window.innerHeight || 600) / 2;

  // Find first element whose centre is BELOW the current viewport midpoint
  var next = null;
  for (var i = 0; i < els.length; i++) {
    var rect = els[i].getBoundingClientRect();
    var elCenter = scrollTop + rect.top + rect.height / 2 - containerTop;
    if (elCenter > viewportMid + 10) { next = els[i]; break; }
  }
  // If none found below, wrap to the first one
  if (!next) next = els[0];

  // Scroll it into view with a small top offset so it's not hidden under sticky headers
  next.scrollIntoView({ behavior: 'smooth', block: 'center' });

  // Brief highlight flash so the user can spot it instantly
  var prev = next.style.outline;
  next.style.outline = '3px solid #dc2626';
  next.style.transition = 'outline 0.2s';
  setTimeout(function() { next.style.outline = prev || ''; }, 1800);
}

function pulseQATab() {
  var tabs = document.querySelectorAll('.rfp-tab');
  tabs.forEach(function(t) {
    if (t.textContent && t.textContent.includes('Q&A')) {
      t.style.animation = 'none';
      t.style.background = '#7c3aed22';
      t.style.borderColor = '#BA9765';
      setTimeout(function() { t.style.background = ''; t.style.borderColor = ''; }, 3000);
    }
  });
}

async function checkInboxForQA(rfpId) {
  var btn = document.getElementById('checkInboxBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>Checking...'; }
  try {
    // Fetch received emails from DB (populated by Resend webhook)
    const received = await apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; });
    const prev = (appState.receivedEmails || []).length;
    appState.receivedEmails = received;

    // Count questions loaded from these emails
    const questions = await apiCall('GET', '/rfps/' + rfpId + '/questions').catch(function(){ return []; });
    const emailQs = questions.filter(function(q){ return q.source === 'email'; }).length;

    if (received.length > prev) {
      appState.unreadQA = emailQs > 0 ? emailQs : (received.length - prev);
      renderRfpTabs(appState.currentRfpTab, rfpId, appState.unreadQA);
      pulseQATab();
      const newCount = received.length - prev;
      addNotification('email', 'New Email(s) Received', newCount + ' new vendor email(s). ' + emailQs + ' question(s) extracted.', rfpId, 'emails');
      if (emailQs > 0) {
        addNotification('questions', 'Questions Extracted', emailQs + ' vendor question(s) ready for Q&A tab', rfpId, 'qa');
        showToast('📋 ' + emailQs + ' vendor question(s) extracted — check Q&A tab', 'info', 7000);
      }
    } else if (received.length > 0) {
      showToast('Inbox up to date — ' + received.length + ' email(s), ' + emailQs + ' question(s) extracted.', 'info');
    } else {
      showToast('Inbox empty — no vendor replies yet. Waiting for email at procurement@cpc-rfp.website', 'info');
    }
    rfpTabs.emails(rfpId);
  } catch(e) {
    showToast('Inbox check failed.', 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>Refresh'; }
  }
}

// --- TAB: Q&A ---
rfpTabs.qa = async function(rfpId) {
  appState.unreadQA = 0;   // opening the Q&A tab clears the badge
  renderRfpTabs('qa', rfpId, 0);

  const questions = await apiCall('GET', '/rfps/' + rfpId + '/questions').catch(function(){ return []; });
  appState.questions = questions;

  // pending   = no answer yet
  // answered  = has answer AND approved (published=1) but NOT yet emailed (emailed_at is null)
  // published = actually emailed to vendors (emailed_at is set)
  const pending   = questions.filter(function(q){ return !q.answer; }).length;
  const answered  = questions.filter(function(q){ return q.answer && !q.emailed_at; }).length;
  const published = questions.filter(function(q){ return !!q.emailed_at; }).length;

  const manualNeeded = questions.filter(function(q){ return q.needs_manual && !q.emailed_at; }).length;

  let qCards = '';
  if (questions.length === 0) {
    qCards = '<div class="card" style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="margin-bottom:0.5rem;font-weight:600;color:#374151">' + t('qa_no_questions_title') + '</p>'
      + '<p style="margin-bottom:1rem;font-size:0.85rem">' + t('qa_no_questions_sub') + '<br>' + t('qa_no_questions_hint') + ' <strong>' + t('qa_re_extract_link') + '</strong>.</p>'
      + '<div style="display:flex;gap:0.75rem;justify-content:center;flex-wrap:wrap">'
      + '<button class="btn-secondary" id="reprocessQBtn" onclick="reprocessQuestions(' + rfpId + ')"><i class="fas fa-sync"></i>' + t('qa_re_extract_full') + '</button>'
      // Load Demo Questions button removed (v9)
      + '</div>'
      + '</div>';
  } else {
    questions.forEach(function(q) {
      const needsManual = q.needs_manual && !q.emailed_at;
      const cardBg = needsManual ? 'background:#fff5f5;border:1.5px solid #fca5a5' : '';

      // Badge hierarchy: emailed > approved-awaiting-send > needs-manual > answered-draft > unanswered
      const badgeHtml = q.emailed_at
        ? '<span class="stage-badge stage-published">' + t('badge_published') + '</span>'
        : needsManual
        ? '<span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:700"><i class="fas fa-exclamation-triangle" style="margin-right:0.25rem"></i>' + t('qa_manual_required') + '</span>'
        : q.published
        ? '<span class="stage-badge stage-submissions_closed">' + t('badge_awaiting') + '</span>'
        : q.answer
        ? '<span class="stage-badge stage-submissions_closed">' + t('badge_awaiting') + '</span>'
        : '<span class="stage-badge stage-draft">' + t('badge_unanswered') + '</span>'

      let answerBlock = '';
      if (needsManual && !q.answer) {
        // needs_manual=1 and no answer — AI could not answer, needs manual input
        answerBlock = '<div style="background:#fee2e2;border:1px solid #fca5a5;border-radius:8px;padding:0.75rem;margin-top:0.75rem">'
          + '<div style="font-size:0.72rem;font-weight:700;color:#991b1b;margin-bottom:4px"><i class="fas fa-robot" style="margin-right:0.25rem"></i>' + t('qa_ai_no_answer') + '</div>'
          + '<p style="font-size:0.82rem;color:#7f1d1d;margin:0">' + t('qa_manual_input_msg') + '</p>'
          + '</div>';
      } else if (q.answer) {
        // Determine answer box color/label based on state
        var answerBg, answerBorder, answerLabelColor, answerIcon, answerLabel;
        if (q.emailed_at) {
          // Sent — green box
          answerBg = '#f0fdf4'; answerBorder = '#86efac'; answerLabelColor = '#166534';
          answerIcon = 'fa-paper-plane'; answerLabel = 'Sent to Vendors';
        } else if (q.published) {
          // Approved, awaiting send — amber box
          answerBg = '#fffbeb'; answerBorder = '#fde68a'; answerLabelColor = '#92400e';
          answerIcon = 'fa-check-circle'; answerLabel = 'Approved — Awaiting Send';
        } else {
          // Draft answer
          answerBg = '#f0f9ff'; answerBorder = '#bae6fd'; answerLabelColor = '#0369a1';
          answerIcon = 'fa-robot'; answerLabel = t('qa_ai_draft_label');
        }
        answerBlock = '<div style="background:' + answerBg + ';border:1px solid ' + answerBorder + ';border-radius:8px;padding:0.75rem;margin-top:0.75rem">'
          + '<div style="font-size:0.72rem;font-weight:700;color:' + answerLabelColor + ';margin-bottom:4px"><i class="fas ' + answerIcon + '" style="margin-right:0.25rem"></i>' + answerLabel + '</div>'
          + '<p style="font-size:0.875rem;color:#374151;margin:0;white-space:pre-wrap">' + escHtml(q.answer) + '</p>'
          + '</div>';
      }

      const isFromEmail = q.source === 'email';
      // Button visibility rules (clean, no overlaps):
      //   emailed   → Edit only (re-open for amendment)
      //   approved (published=1) + not emailed → Approve (idempotent re-approve OK) + Edit
      //   has answer + needs_manual cleared (needs_manual=0) + not emailed → Approve + Edit
      //   needs_manual=1 (red card, no answer or AI failed) → AI Draft + Manual Edit
      //   no answer → AI Draft + Manual Edit
      const canApprove = !!q.answer && !q.emailed_at && !q.needs_manual;
      const needsDraftOrEdit = !q.answer || q.needs_manual;

      const btns = (needsDraftOrEdit
        ? '<button class="btn-secondary btn-sm" onclick="draftOneAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-robot"></i>' + t('qa_ai_draft_btn') + '</button>'
          + '<button class="btn-ghost btn-sm" onclick="editQAnswer(' + q.id + ')"><i class="fas fa-edit"></i>' + t('qa_manual_edit_btn') + '</button>'
        : '') + (canApprove
        ? '<button class="btn-primary btn-sm" onclick="approveQAnswer(' + rfpId + ',' + q.id + ')"><i class="fas fa-check"></i>' + t('qa_approve_btn') + '</button>'
          + '<button class="btn-ghost btn-sm" onclick="editQAnswer(' + q.id + ')"><i class="fas fa-edit"></i>' + t('btn_edit') + '</button>'
        : '') + (!needsDraftOrEdit && !canApprove
        ? '<button class="btn-ghost btn-sm" onclick="editQAnswer(' + q.id + ')" title="Edit sent answer"><i class="fas fa-edit"></i> ' + t('btn_edit') + '</button>'
        : '');

      qCards += '<div class="card" style="padding:1rem;' + cardBg + '" id="q-' + q.id + '">'
        + '<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:1rem">'
        + '<div style="flex:1">'
        + '<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.5rem;flex-wrap:wrap">'
        + '<span style="font-size:0.72rem;font-weight:600;color:#9ca3af">Q' + q.id + ' &bull; ' + escHtml(q.vendor_name||'Anonymous') + '</span>'
        + badgeHtml
        + (isFromEmail ? '<span class="tag" style="background:#ede9fe;color:#6d28d9"><i class="fas fa-envelope" style="margin-right:0.25rem"></i>' + t('qa_via_email') + '</span>' : '')
        + '</div>'
        + '<p style="font-weight:500;color:#1f2937;margin:0" dir="auto">' + escHtml(q.question) + '</p>'
        + answerBlock
        + '</div>'
        + '<div style="display:flex;flex-direction:column;gap:0.4rem;flex-shrink:0">' + btns + '</div>'
        + '</div></div>';
    });
  }

  // Build comma-separated list of manual question IDs for the scroll helper
  var manualQIds = questions
    .filter(function(q){ return q.needs_manual && !q.published; })
    .map(function(q){ return q.id; });

  const manualWarning = manualNeeded > 0
    ? '<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:8px;padding:0.75rem 1rem;display:flex;align-items:center;gap:0.75rem;flex-wrap:wrap">'
      + '<i class="fas fa-exclamation-triangle" style="color:#dc2626;font-size:1.1rem;flex-shrink:0"></i>'
      + '<div style="flex:1;min-width:0">'
      + '<div style="font-weight:700;font-size:0.85rem;color:#991b1b">' + manualNeeded + ' ' + t('qa_manual_warning_hd') + '</div>'
      + '<div style="font-size:0.78rem;color:#7f1d1d">' + t('qa_manual_warning_sub') + '</div>'
      + '</div>'
      + '<button onclick="scrollToNextManual([' + manualQIds.join(',') + '])" '
      +   'style="flex-shrink:0;display:inline-flex;align-items:center;gap:5px;background:#dc2626;color:#fff;border:none;border-radius:6px;padding:0.3rem 0.8rem;font-size:0.78rem;font-weight:600;cursor:pointer;white-space:nowrap" '
      +   'title="Jump to next question that needs a manual answer">'
      +   '<i class="fas fa-arrow-down" style="font-size:0.72rem"></i>Next unanswered'
      + '</button>'
      + '</div>'
    : '';

  // 7.1 — filter state
  var _qaFilter = window._qaFilter || 'all';
  var qaStatusBar = '<div style="display:flex;gap:0.4rem;flex-wrap:wrap;padding:0.625rem;background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;align-items:center">'
    + ['all','pending','answered','published'].map(function(f){
        var counts = {all: questions.length, pending: pending, answered: answered, published: published};
        var active = _qaFilter === f;
        return '<button onclick="window._qaFilter=\x27' + f + '\x27;rfpTabs.qa(' + rfpId + ')" style="border:1px solid ' + (active?'var(--cpc-ink)':'#e5e7eb') + ';border-radius:6px;padding:3px 10px;font-size:0.75rem;background:' + (active?'var(--cpc-ink)':'white') + ';color:' + (active?'white':'#6b7280') + ';cursor:pointer;font-weight:' + (active?'700':'400') + '">'
          + f.charAt(0).toUpperCase()+f.slice(1) + ' (' + (counts[f]||0) + ')</button>';
      }).join('')
    + '</div>';

  // Apply filter to qCards
  var filteredQCards = qCards; // already built above; rebuild with filter
  var displayedQs = questions.filter(function(q){
    if (_qaFilter === 'pending') return !q.answer || q.answer.trim() === '';
    if (_qaFilter === 'answered') return q.answer && !q.published;
    if (_qaFilter === 'published') return q.published;
    return true;
  });
  // rebuild filtered cards
  var filteredCardsHtml = '';
  displayedQs.forEach(function(q) {
    var cardEl = document.getElementById('q-' + q.id);
    if (cardEl) filteredCardsHtml += cardEl.outerHTML;
  });

  // Stage-action bar for Q&A tab — shown when stage is 'qa_open'
  var qaRfp = appState.currentRfp;
  var qaStageBar = '';
  if (qaRfp && qaRfp.stage === 'qa_open') {
    qaStageBar = '<div style="background:linear-gradient(90deg,#faf5ff,#ede9fe);border:1.5px solid #7c3aed;border-radius:10px;padding:0.65rem 1rem;display:flex;align-items:center;gap:0.75rem">'
      + '<i class="fas fa-comments" style="color:#7c3aed;font-size:1rem;flex-shrink:0"></i>'
      + '<div style="flex:1"><span style="font-weight:700;color:#4c1d95;font-size:0.88rem">Q&amp;A is Open</span>'
      + '<span style="color:#5b21b6;font-size:0.82rem;margin-left:0.5rem">Vendors can submit proposals at any time before the submission deadline — regardless of Q&amp;A status. Close Q&amp;A only stops vendors from asking clarification questions.</span></div>'
      + '<button style="flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:6px;padding:0.4rem 1rem;font-size:0.82rem;background:#7c3aed;color:#fff;border:none;border-radius:7px;cursor:pointer;font-weight:600" onclick="closeQA(' + rfpId + ')"><i class="fas fa-lock" style="font-size:0.78rem"></i>Close Q&amp;A</button>'
      + '</div>';
  } else if (qaRfp && ['submissions_closed','evaluation','awarded'].includes(qaRfp.stage)) {
    qaStageBar = '<div style="background:#f0fdf4;border:1.5px solid #16a34a;border-radius:10px;padding:0.65rem 1rem;display:flex;align-items:center;gap:0.75rem">'
      + '<i class="fas fa-lock" style="color:#16a34a;font-size:1rem;flex-shrink:0"></i>'
      + '<span style="font-weight:600;color:#14532d;font-size:0.88rem">Q&amp;A is Closed</span>'
      + '<span style="color:#166534;font-size:0.82rem;margin-left:0.5rem">Vendor questions are no longer accepted. Proposal evaluation is in progress.</span>'
      + '</div>';
  }

  setContent(
    '<div class="space-y-4">'
    + qaStageBar
    + qaStatusBar
    + '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:0.5rem">'
    + '<div style="display:flex;gap:1rem;flex-wrap:wrap">'
    + '<span style="font-size:0.82rem;color:#6b7280"><strong>' + pending + '</strong> ' + t('qa_pending') + '</span>'
    + '<span style="font-size:0.82rem;color:#92400e"><strong>' + answered + '</strong> ' + t('qa_awaiting') + '</span>'
    + '<span style="font-size:0.82rem;color:#065f46"><strong>' + published + '</strong> ' + t('qa_published') + '</span>'
    + (manualNeeded > 0 ? '<span style="font-size:0.82rem;color:#dc2626;font-weight:600"><strong>' + manualNeeded + '</strong> ' + t('qa_need_manual') + '</span>' : '')
    + '</div>'
    + '<div style="display:flex;gap:0.5rem;flex-wrap:wrap">'
    + '<button class="btn-ghost btn-sm" id="reprocessQBtn" onclick="reprocessQuestions(' + rfpId + ')" title="Re-extract questions from received emails"><i class="fas fa-sync"></i>' + t('qa_re_extract_btn') + '</button>'
    + '<button class="btn-secondary" id="draftAllBtn" onclick="draftAllQAnswers(' + rfpId + ')"><i class="fas fa-robot"></i>' + t('qa_ai_answer_all') + '</button>'
    + '<button class="btn-ghost btn-sm" id="approveAllBtn" onclick="approveAllQAnswers(' + rfpId + ')" title="Mark all AI-drafted answers as approved"><i class="fas fa-check-double"></i>Approve All</button>'
    + '<button class="btn-primary" onclick="publishAllQAnswers(' + rfpId + ')" ' + (manualNeeded > 0 ? 'title="' + t('qa_blocked_title') + ' ' + manualNeeded + ' ' + t('qa_need_manual_answers') + '" style="opacity:0.6"' : '') + '><i class="fas fa-paper-plane"></i>' + t('qa_publish_approved') + '</button>'
    + '</div>'
    + '</div>'
    + manualWarning
    + '<div style="display:grid;gap:0.75rem">' + qCards + '</div>'
    + '</div>'
  );
};

async function draftOneAnswer(rfpId, qId) {
  showToast('AI drafting answer...', 'info');
  await apiCall('POST', '/rfps/' + rfpId + '/questions/' + qId + '/draft', {});
  showToast('Answer drafted!', 'success');
  rfpTabs.qa(rfpId);
}

async function draftAllQAnswers(rfpId) {
  const btn = document.getElementById('draftAllBtn');
  setLoading(btn, true, 'AI Answering...');
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/draft-all', {});
    showToast('AI answers generated! Questions needing manual input are highlighted in red.', 'success', 5000);
    rfpTabs.qa(rfpId);
  } catch(e) {
    setLoading(btn, false);
  }
}

async function approveQAnswer(rfpId, qId) {
  await apiCall('PUT', '/rfps/' + rfpId + '/questions/' + qId + '/approve', {});
  showToast('Answer approved!', 'success');
  rfpTabs.qa(rfpId);
}

async function approveAllQAnswers(rfpId) {
  var qs = appState.questions || [];
  // Approve all questions that have an answer, are not yet emailed, and don't need manual review.
  // published=1 is idempotent — the approve-all backend UPDATE is safe to re-run.
  var approvable = qs.filter(function(q) {
    return q.answer && q.answer.trim() !== '' && !q.emailed_at && !q.needs_manual;
  });
  if (approvable.length === 0) {
    var unanswered = qs.filter(function(q){ return !q.answer || q.answer.trim() === ''; }).length;
    if (unanswered > 0) {
      showToast('No answers to approve yet. Run \u201cAI Answer All\u201d first.', 'warning', 5000);
    } else {
      showToast('All answered questions have already been sent to vendors.', 'info', 4000);
    }
    return;
  }
  var btn = document.getElementById('approveAllBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Approving…'; }
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/questions/approve-all', {});
    showToast('✅ ' + approvable.length + ' answer(s) approved! Use "Send Answers" to send them to vendors.', 'success', 5000);
    rfpTabs.qa(rfpId);
  } catch(e) {
    showToast('Approve all failed: ' + (e.message || e), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-check-double"></i>Approve All'; }
  }
}

function editQAnswer(qId) {
  const q = appState.questions.find(function(q){ return q.id === qId; });
  if (!q) return;
  showModal(
    '<h3 style="font-size:1rem;font-weight:700;margin-bottom:0.75rem">Edit Answer for Q' + qId + '</h3>'
    + '<p style="color:#6b7280;font-size:0.875rem;margin-bottom:0.75rem;background:#f9fafb;padding:0.75rem;border-radius:6px">' + escHtml(q.question) + '</p>'
    + '<label>Answer</label>'
    + '<textarea id="editAnswerText" rows="5" style="margin-bottom:1rem">' + escHtml(q.answer||'') + '</textarea>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-primary" onclick="saveQAnswer(' + appState.currentRfpId + ',' + qId + ')">Save &amp; Approve</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

async function saveQAnswer(rfpId, qId) {
  const text = document.getElementById('editAnswerText').value;
  await apiCall('PUT', '/rfps/' + rfpId + '/questions/' + qId + '/answer', { answer: text });
  showToast('Answer saved!', 'success');
  closeModal();
  rfpTabs.qa(rfpId);
}

async function publishAllQAnswers(rfpId) {
  try {
    // Guard: check for answered questions not yet emailed to vendors
    var qs = appState.questions || [];
    var readyToPublish = qs.filter(function(q) {
      return q.answer && q.answer.trim() !== '' && !q.emailed_at && !q.needs_manual;
    });
    if (readyToPublish.length === 0) {
      var unanswered = qs.filter(function(q){ return !q.answer || q.answer.trim() === ''; }).length;
      if (unanswered > 0) {
        showToast('⚠️ No approved answers to send yet. Use "AI Answer All" to draft answers, then approve them first.', 'warning', 8000);
      } else if (qs.length === 0) {
        showToast('⚠️ No questions in Q&A yet. Nothing to send.', 'warning', 6000);
      } else {
        showToast('⚠️ All answers have already been sent to vendors. Nothing new to send.', 'info', 6000);
      }
      return; // do NOT call the API — no emails sent
    }

    // Confirm before sending
    await new Promise(function(resolve, reject) {
      showConfirm({
        title: 'Send ' + readyToPublish.length + ' Answer(s) to Vendors?',
        body: 'Approved answers will be emailed as a consolidated Q&A Excel to all invited vendors. Vendor names are anonymized with participant codes in the Excel.',
        type: 'info',
        list: readyToPublish.slice(0,5).map(function(q){ return 'Q' + q.id + ': ' + (q.question||'').slice(0,80); }),
        confirmText: 'Send Answers',
        cancelText: 'Cancel',
      }, resolve, function(){ reject(new Error('cancelled')); });
    }).catch(function(err){ if(err.message==='cancelled') throw err; });
    var result = await apiCall('POST', '/rfps/' + rfpId + '/questions/publish-all', {});
    // NOTE: Send Answers does NOT advance stage — use "Close Q&A" button for that
    var sentCount = result && result.vendorCount ? result.vendorCount : 0;
    showToast('\u2705 ' + readyToPublish.length + ' answer(s) sent to ' + sentCount + ' vendor(s)!', 'success', 5000);
    addNotification('info', '\u2705 Answers Sent', readyToPublish.length + ' Q&A answer(s) emailed to ' + sentCount + ' vendor(s).', rfpId, 'qa', null);
    // Stay on Q&A tab, clear badge
    appState.unreadQA = 0;
    renderRfpTabs('qa', rfpId, 0);
    rfpTabs.qa(rfpId);
  } catch(e) {
    if (e.message !== 'cancelled') showToast('Send failed: ' + e.message, 'error');
  }
}

async function closeQA(rfpId) {
  // 14.4 — use custom confirm dialog
  var confirmed = await new Promise(function(resolve) {
    showConfirm({
      title: 'Close Q&A?',
      body: 'This will mark the Q&A stage as complete. Vendors will still be able to submit proposals.',
      type: 'warning',
      confirmText: 'Close Q&A',
      cancelText: 'Keep Open',
    }, function(){ resolve(true); }, function(){ resolve(false); });
  });
  if (!confirmed) return;
  try {
    await apiCall('POST', '/rfps/' + rfpId + '/stage', { stage: 'submissions_closed' });
    // Mark Q&A stage completed in lifecycle bar
    markStageCompleted(rfpId, 'qa');
    // Refresh RFP to update lifecycle bar
    const rfp = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    if (rfp) {
      appState.currentRfp = rfp;
      markStageCompleted(rfpId, 'qa');
      markStageActive(rfpId, 'proposals');
      renderLifecycleBar(rfp);
      var subtitleEl = document.getElementById('pageSubtitle');
      if (subtitleEl) subtitleEl.textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'draft');
      refreshStageBanner(rfpId, rfp);
    }
    showToast('\uD83D\uDD12 Q&A closed. Vendor questions will be rejected with an auto-reply. Proposals are now being accepted.', 'success', 6000);
    addNotification('info', '\uD83D\uDD12 Q&A Closed', 'Q&A stage complete. Vendors will receive auto-rejection for any new questions.', rfpId, 'qa', null);
    // Refresh Q&A tab to hide the Close Q&A button (stage is now submissions_closed)
    appState.unreadQA = false;
    renderRfpTabs('qa', rfpId, false);
    rfpTabs.qa(rfpId);
  } catch(e) {
    showToast('Close Q&A failed: ' + e.message, 'error');
  }
}

async function loadSampleQs(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/questions/load-samples', {});
  showToast('Sample questions loaded!', 'success');
  rfpTabs.qa(rfpId);
}

async function reprocessQuestions(rfpId) {
  var btn = document.getElementById('reprocessQBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>' + t('qa_re_extracting'); }
  try {
    const result = await apiCall('POST', '/rfps/' + rfpId + '/emails/reprocess-questions', {});
    if (result.totalNew > 0) {
      showToast(result.totalNew + ' new question(s) extracted from received emails!', 'success', 6000);
      addNotification('questions', 'Questions Extracted', result.totalNew + ' question(s) extracted from email attachments', rfpId, 'qa');
    } else {
      showToast('No new questions found in received emails. Check the Communications tab for email content.', 'info', 5000);
    }
    rfpTabs.qa(rfpId);
  } catch(e) {
    showToast('Re-extraction failed: ' + e.message, 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-sync"></i>' + t('qa_re_extract_btn'); }
  }
}

// --- TAB: PROPOSALS ---
// ── Helper: build a proper download/open URL for an R2 attachment ────────────
// Attachment objects from proposal_attachments JSON have a `url` field that is either:
//   • "r2://proposals/...key..."  — stored in R2, need to route via API
//   • "https://..."              — public URL (legacy)
//   • "data:..."                 — base64 (legacy)
function attachmentApiUrl(urlOrKey, forDownload) {
  if (!urlOrKey) return null;
  if (urlOrKey.startsWith('r2://')) {
    var key = urlOrKey.replace('r2://', '');
    return '/api/proposals/pdf/' + encodeURIComponent(key).replace(/%2F/g, '/') + (forDownload ? '?dl=1' : '');
  }
  return urlOrKey;
}

rfpTabs.proposals = async function(rfpId) {
  const proposals = await apiCall('GET', '/rfps/' + rfpId + '/proposals').catch(function(){ return []; });
  appState.proposals = proposals;

  function statusBadge(p) {
    const s = p.status || 'submitted';
    if (s === 'awarded') return '<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:700"><i class="fas fa-trophy" style="margin-right:0.25rem"></i>' + t('prop_awarded_badge') + '</span>';
    if (s === 'recommended') return '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:700"><i class="fas fa-star" style="margin-right:0.25rem"></i>' + t('prop_recommended') + '</span>';
    if (s === 'not_awarded') return '<span style="background:#f3f4f6;color:#6b7280;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:500">' + t('prop_not_awarded') + '</span>';
    return '<span style="background:#e0f2fe;color:#0369a1;border-radius:20px;padding:3px 10px;font-size:0.73rem;font-weight:500">' + t('prop_submitted') + '</span>';
  }

  function aiBadge(p) {
    if (!p.ai_recommendation) return '<span style="color:#9ca3af;font-size:0.75rem">—</span>';
    var score = p.ai_total_score != null ? Math.round(p.ai_total_score) : '?';
    var vs = p.ai_validation_status || '';
    if (vs === 'PENDING_MANUAL_REVIEW') return '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:600" title="Budget not auto-extracted — manual review needed"><i class="fas fa-clock" style="margin-right:0.25rem"></i>' + score + '/100 · ' + t('prop_review_badge') + '</span>';
    var rec = p.ai_recommendation;
    if (rec === 'RECOMMENDED') return '<span style="background:#d1fae5;color:#065f46;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:700"><i class="fas fa-check-circle" style="margin-right:0.25rem"></i>' + score + '/100</span>';
    if (rec === 'CONDITIONAL') return '<span style="background:#fef3c7;color:#92400e;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:700"><i class="fas fa-exclamation-circle" style="margin-right:0.25rem"></i>' + score + '/100</span>';
    return '<span style="background:#fee2e2;color:#991b1b;border-radius:20px;padding:2px 8px;font-size:0.72rem;font-weight:700"><i class="fas fa-times-circle" style="margin-right:0.25rem"></i>' + score + '/100</span>';
  }

  let rows = '';
  proposals.forEach(function(p) {
    // Use budget_amount/currency if available, fallback to financial_proposal
    let fin = '-';
    if (p.budget_amount && p.budget_amount > 0) {
      const cur = p.budget_currency || 'AED';
      fin = cur + ' ' + Number(p.budget_amount).toLocaleString();
    } else if (p.financial_proposal) {
      fin = 'AED ' + Number(p.financial_proposal).toLocaleString();
    }
    // Use timeline_months if available, fallback to proposed_duration
    let dur = '-';
    if (p.timeline_months && p.timeline_months > 0) {
      dur = p.timeline_months + ' mo';
    } else if (p.proposed_duration) {
      dur = p.proposed_duration;
    }
    const dateStr = p.created_at ? new Date(p.created_at).toLocaleDateString('en-AE') : '-';
    const isReal = p.is_real_submission;
    const isAwarded = (p.status === 'awarded');
    const rowBg = isAwarded ? 'background:#f0fdf4' : (isReal ? 'background:#fffbeb' : '');

    // File count badge — clickable to open side panel with download links
    var attachments = [];
    try { if (p.proposal_attachments) attachments = JSON.parse(p.proposal_attachments); } catch(e) {}
    var attachCount = attachments.length || (p.pdf_attachment_url ? 1 : 0);

    var filesCell = attachCount > 0
      ? '<span class="file-count-badge" onclick="viewProposalDetail(' + p.id + ')" title="Click to view &amp; download ' + attachCount + ' file(s)">'
        + '<i class="fas fa-paperclip"></i>' + attachCount + ' ' + (attachCount !== 1 ? t('prop_files_pl') : t('prop_files')) + '</span>'
      : '<span style="color:#9ca3af;font-size:0.8rem">—</span>';

    // Award button — gold, prominent, shown only if not yet awarded; locked if another was awarded
    var rfpAwarded = proposals.some(function(pp){ return pp.status === 'awarded'; });
    var awardBtn = '';
    if (isAwarded) {
      awardBtn = '<span style="background:linear-gradient(135deg,#d4a017,#f5c842);color:#1a1a1a;border-radius:6px;padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:700;display:inline-flex;align-items:center;gap:4px"><i class="fas fa-trophy"></i>' + t('prop_awarded_badge') + '</span>';
    } else if (!rfpAwarded) {
      awardBtn = '<button onclick="awardProposal(' + rfpId + ',' + p.id + ',\x27' + escHtml(p.vendor_name||'this vendor') + '\x27)" '
        + 'style="background:linear-gradient(135deg,#d4a017,#f5c842);color:#1a1a1a;border:none;border-radius:6px;padding:0.3rem 0.7rem;font-size:0.78rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:4px;box-shadow:0 2px 6px rgba(212,160,23,0.45);transition:opacity 0.15s" '
        + 'title="Award contract to ' + escHtml(p.vendor_name||'vendor') + '">'
        + '<i class="fas fa-trophy"></i>' + t('prop_award_btn') + '</button>';
    }

    rows += '<tr style="' + rowBg + '">'
      + '<td><div style="display:flex;align-items:center;gap:8px">'
      + '<div style="width:32px;height:32px;border-radius:8px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.8rem;flex-shrink:0">' + escHtml((p.vendor_name||'?').charAt(0)) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.87rem">' + escHtml(p.vendor_name||'Unknown') + '</div></div>'
      + '</div></td>'
      + '<td style="font-size:0.82rem;color:#6b7280">' + dateStr + '</td>'
      + '<td style="font-weight:600">' + fin + '</td>'
      + '<td style="font-size:0.82rem;color:#6b7280">' + escHtml(dur) + '</td>'
      + '<td>' + filesCell + '</td>'
      + '<td>' + aiBadge(p) + '</td>'
      + '<td>' + statusBadge(p) + '</td>'
      + '<td style="white-space:nowrap">'
      + '<button class="btn-ghost btn-sm" onclick="viewProposalDetail(' + p.id + ')" style="margin-right:4px" title="View details"><i class="fas fa-eye"></i>' + t('prop_view_btn') + '</button>'
      + (p.ai_recommendation ? '<button class="btn-ghost btn-sm" onclick="evaluateSingleProposal(' + rfpId + ',' + p.id + ')" style="margin-right:4px" title="Re-evaluate with AI"><i class="fas fa-sync-alt"></i> ' + t('panel_save_reevaluate').replace('Save & ','') + '</button>' : '')
      + awardBtn
      + '</td>'
      + '</tr>';
  });

  var evaluated = proposals.filter(function(p){ return p.ai_recommendation; }).length;
  var bulkDone = proposals.length > 0 && evaluated === proposals.length;
  // Show bulk "Evaluate with AI" only if no proposals have been evaluated yet.
  // Once bulk eval is done (all have ai_recommendation), replace with nothing here —
  // individual "Re-evaluate" buttons appear in the row actions instead.
  // 8.1 — always show evaluate/re-evaluate all button
  var evalBtn = proposals.length > 0
    ? (evaluated === proposals.length
      ? '<button class="btn-secondary" id="evaluateAllBtn" onclick="evaluateAllProposals(' + rfpId + ')"><i class="fas fa-sync-alt"></i>Re-evaluate All (' + proposals.length + ')</button>'
      : '<button class="btn-primary" id="evaluateAllBtn" onclick="evaluateAllProposals(' + rfpId + ')" style="background:linear-gradient(135deg,var(--cpc-gold-deep),var(--cpc-gold));border:none"><i class="fas fa-robot"></i>' + t('prop_evaluate_ai') + ' (' + (proposals.length - evaluated) + ' remaining)</button>')
    : '';

  // Stage-action bar for Proposals tab
  var propRfp = appState.currentRfp;
  var propStageBar = '';
  var propAwarded = proposals.some(function(pp){ return pp.status === 'awarded'; });
  if (propRfp && propRfp.stage === 'submissions_closed' && !propAwarded) {
    var unevaluated = proposals.filter(function(p){ return !p.ai_recommendation; }).length;
    propStageBar = '<div style="background:linear-gradient(90deg,#fffbeb,#fef9c3);border:1.5px solid var(--cpc-gold);border-radius:10px;padding:0.65rem 1rem;display:flex;align-items:center;gap:0.75rem">'
      + '<i class="fas fa-gavel" style="color:var(--cpc-gold-deep);font-size:1rem;flex-shrink:0"></i>'
      + '<div style="flex:1"><span style="font-weight:700;color:var(--cpc-ink);font-size:0.88rem">Submissions Closed</span>'
      + '<span style="color:#92400e;font-size:0.82rem;margin-left:0.5rem">'
      + (unevaluated > 0
          ? unevaluated + ' proposal(s) not yet evaluated. Run AI evaluation, then award the contract.'
          : 'All proposals evaluated. Select a winner and award the contract.')
      + '</span></div>'
      + (unevaluated > 0
          ? '<button class="btn-primary" style="flex-shrink:0;white-space:nowrap;display:flex;align-items:center;gap:6px;padding:0.4rem 1rem;font-size:0.82rem;background:linear-gradient(135deg,var(--cpc-gold-deep),var(--cpc-gold));border:none" id="stageEvalBtn" onclick="evaluateAllProposals(' + rfpId + ')"><i class="fas fa-robot" style="font-size:0.78rem"></i>Evaluate with AI</button>'
          : '')
      + '</div>';
  } else if (propAwarded) {
    propStageBar = '<div style="background:linear-gradient(90deg,#f0fdf4,#dcfce7);border:1.5px solid #16a34a;border-radius:10px;padding:0.65rem 1rem;display:flex;align-items:center;gap:0.75rem">'
      + '<i class="fas fa-trophy" style="color:#16a34a;font-size:1rem;flex-shrink:0"></i>'
      + '<span style="font-weight:700;color:#14532d;font-size:0.88rem">Contract Awarded</span>'
      + '<span style="color:#166534;font-size:0.82rem;margin-left:0.5rem">This RFP is complete. A winner has been selected.</span>'
      + '</div>';
  }

  setContent(
    '<div class="space-y-4">'
    + propStageBar
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:0.5rem">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">' + t('proposals_submitted') + '</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + proposals.length + ' ' + t('proposals_received')
    + (evaluated > 0 ? ' · <span style="color:var(--cpc-gold-deep);font-weight:600">' + evaluated + ' ' + t('proposals_evaluated') + '</span>' : '') + '</p></div>'
    + '<div style="display:flex;gap:0.5rem;align-items:center">' + evalBtn + '</div>'
    + '</div>'

    + '<div class="card" style="overflow:hidden">'
    + (proposals.length === 0
      ? '<div style="padding:3rem;text-align:center;color:#9ca3af"><i class="fas fa-inbox" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
        + '<p style="margin-bottom:0.5rem">' + t('proposals_none') + '</p>'
        + '<p style="font-size:0.8rem;color:#c4b5fd;margin:0"><i class="fas fa-link" style="margin-right:4px"></i>' + t('prop_vendors_submit') + '</p></div>'
      : '<div style="overflow-x:auto"><table>'
        + '<thead><tr>'
        + '<th>' + t('th_vendor') + '</th><th>' + t('th_date') + '</th><th>' + t('th_budget') + '</th><th>' + t('th_duration') + '</th>'
        + '<th>' + t('th_files') + '</th><th>' + t('th_ai_score') + '</th><th>' + t('th_status') + '</th>'
        + '<th style="text-align:right">' + t('th_actions') + '</th>'
        + '</tr></thead>'
        + '<tbody>' + rows + '</tbody>'
        + '</table></div>')
    + '</div>'
    + '</div>'
  );
};

// ── Evaluate all proposals with AI ────────────────────────────────────────────
async function evaluateAllProposals(rfpId) {
  var btn = document.getElementById('evaluateAllBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>' + t('prop_evaluating'); }
  try {
    showToast('🤖 AI evaluation started — this may take 1–2 minutes for all proposals…', 'info', 10000);
    var result = await apiCall('POST', '/rfps/' + rfpId + '/proposals/evaluate-all', {});
    var count = result.evaluated || 0;
    showToast('✅ AI evaluation complete — ' + count + ' proposal(s) scored!', 'success', 7000);
    addNotification('info', '🤖 AI Evaluation Complete', count + ' proposal(s) scored and ranked by AI.', rfpId, 'proposals', null);
    // Award stage becomes ACTIVE now that bulk evaluation is done
    markStageActive(rfpId, 'award');
    var rfpNow = appState.currentRfp;
    if (rfpNow && String(rfpNow.id) === String(rfpId)) renderLifecycleBar(rfpNow);
    rfpTabs.proposals(rfpId);
  } catch(e) {
    showToast('Evaluation failed: ' + (e.message || e), 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot"></i>' + t('prop_evaluate_ai'); }
  }
}

async function loadSampleProposals(rfpId) {
  await apiCall('POST', '/rfps/' + rfpId + '/proposals/sample', {});
  showToast('Sample proposals added!', 'success');
  rfpTabs.proposals(rfpId);
}

async function awardProposal(rfpId, proposalId, vendorName) {
  // 14.4 — destructive confirm dialog
  var confirmed = await new Promise(function(resolve) {
    showConfirm({
      title: 'Award Contract to ' + vendorName + '?',
      body: 'This will mark the RFP as complete and disable further submissions. This action cannot be undone.',
      type: 'danger',
      list: ['Mark proposal as Awarded', 'Mark RFP as complete', 'Disable further submissions'],
      confirmText: 'Award Contract',
      cancelText: 'Cancel',
    }, function(){ resolve(true); }, function(){ resolve(false); });
  });
  if (!confirmed) return;

  try {
    await apiCall('POST', '/rfps/' + rfpId + '/proposals/' + proposalId + '/award', {});
    // Mark Award and Proposals stages complete on lifecycle bar
    markStageCompleted(rfpId, 'award');
    markStageCompleted(rfpId, 'proposals');
    // Refresh RFP and lifecycle bar
    var rfp = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    if (rfp) {
      appState.currentRfp = rfp;
      renderLifecycleBar(rfp);
      var subtitleEl = document.getElementById('pageSubtitle');
      if (subtitleEl) subtitleEl.textContent = (rfp.ref_number||'') + ' \u2022 ' + stageLabelMap(rfp.stage||'awarded');
      refreshStageBanner(rfpId, rfp);
    }
    showToast('\uD83C\uDFC6 Contract awarded to ' + vendorName + '! RFP is now complete. Submissions and email replies are disabled.', 'success', 7000);
    addNotification('info', '\uD83C\uDFC6 Contract Awarded', 'Contract awarded to ' + vendorName + '. RFP procurement cycle is complete.', rfpId, 'proposals', null);
    // Refresh proposals tab
    rfpTabs.proposals(rfpId);
  } catch(e) {
    showToast('Award failed: ' + (e.message || e), 'error');
  }
}

function downloadProposalPdf(id) {
  var p = appState.proposals.find(function(pp){ return pp.id === id; });
  if (!p || !p.pdf_attachment_url || !p.pdf_filename) { showToast('PDF not available', 'error'); return; }
  try {
    // Convert data: URI to Blob and trigger programmatic download
    var dataUrl = p.pdf_attachment_url;
    if (dataUrl.startsWith('data:')) {
      var parts = dataUrl.split(',');
      var mime = (parts[0].match(/data:([^;]+)/) || [])[1] || 'application/pdf';
      var binary = atob(parts[1]);
      var bytes = new Uint8Array(binary.length);
      for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      var blob = new Blob([bytes], { type: mime });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = p.pdf_filename;
      document.body.appendChild(a);
      a.click();
      setTimeout(function() { document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
    } else {
      // Regular URL — use normal anchor download
      var a2 = document.createElement('a');
      a2.href = dataUrl;
      a2.download = p.pdf_filename;
      a2.target = '_blank';
      document.body.appendChild(a2);
      a2.click();
      document.body.removeChild(a2);
    }
  } catch(e) {
    showToast('Download failed: ' + (e.message || e), 'error');
  }
}

function closeProposalPanel() {
  var overlay = document.getElementById('proposalPanelOverlay');
  var panel = document.getElementById('proposalSidePanel');
  if (overlay) { overlay.style.opacity = '0'; setTimeout(function(){ overlay.remove(); }, 250); }
  if (panel) { panel.style.transform = 'translateX(100%)'; setTimeout(function(){ panel.remove(); }, 300); }
}

// ── Proposal detail side panel with AI evaluation tabs ────────────────────────
function viewProposalDetail(id) {
  const p = appState.proposals.find(function(p){ return p.id === id; });
  if (!p) return;
  // Load evaluation data async and render the panel (with or without AI results)
  _renderProposalPanel(p, null);
  if (p.ai_evaluated_at) {
    apiCall('GET', '/rfps/' + p.rfp_id + '/proposals/' + p.id + '/evaluation').then(function(ev) {
      _renderProposalPanel(p, ev.evaluation_data);
    }).catch(function(){});
  }
}

function _proposalAttachmentRow(a) {
  var openUrl  = attachmentApiUrl(a.url || a.r2_key || '', false);
  var dlUrl    = attachmentApiUrl(a.url || a.r2_key || '', true);
  var sizeStr  = a.size_bytes > 0 ? (Math.round(a.size_bytes / 1024 / 1024 * 10) / 10) + ' MB' : '';
  var openBtn  = openUrl ? '<a href="' + escHtml(openUrl) + '" target="_blank" style="text-decoration:none;font-size:0.73rem;font-weight:600;color:var(--cpc-ink);padding:3px 8px;border:1px solid #bfdbfe;border-radius:5px;background:#eff6ff;display:inline-flex;align-items:center;gap:3px"><i class="fas fa-external-link-alt" style="font-size:0.6rem"></i>Open</a>' : '';
  var dlBtn    = dlUrl  ? '<a href="' + escHtml(dlUrl) + '" download="' + escHtml(a.filename||'document.pdf') + '" style="text-decoration:none;font-size:0.73rem;color:#fff;padding:3px 8px;border-radius:5px;background:var(--cpc-gold-deep);display:inline-flex;align-items:center;gap:3px"><i class="fas fa-download" style="font-size:0.6rem"></i>Download</a>' : '';
  return '<div style="display:flex;align-items:center;gap:0.625rem;padding:0.55rem 0.75rem;border-bottom:1px solid #f3f4f6">'
    + '<i class="fas fa-file-pdf" style="color:#dc2626;font-size:1rem;flex-shrink:0"></i>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-size:0.8rem;font-weight:600;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(a.filename||'document.pdf') + '</div>'
    + '<div style="font-size:0.7rem;color:#9ca3af">' + (sizeStr || '') + (sizeStr && a.label ? ' · ' : '') + (a.label ? escHtml(a.label) : '') + '</div>'
    + '</div>'
    + '<div style="display:flex;gap:0.3rem;flex-shrink:0">' + openBtn + ' ' + dlBtn + '</div>'
    + '</div>';
}

function _renderProposalPanel(p, evalData) {
  // ── Scalar metadata ──────────────────────────────────────────────────────
  var rfpId = p.rfp_id;
  var fin = '-';
  if (p.budget_amount && p.budget_amount > 0) {
    fin = (p.budget_currency || 'AED') + ' ' + Number(p.budget_amount).toLocaleString();
  } else if (p.financial_proposal) {
    fin = 'AED ' + Number(p.financial_proposal).toLocaleString();
  }
  var dur = '-';
  if (p.timeline_months && p.timeline_months > 0) {
    dur = p.timeline_months + ' month' + (p.timeline_months === 1 ? '' : 's');
  } else if (p.proposed_duration) {
    dur = p.proposed_duration;
  }
  var dateStr = p.created_at ? new Date(p.created_at).toLocaleString('en-AE') : '-';

  // ── Attachments list (shared across tabs) ────────────────────────────────
  var attachments = [];
  try { if (p.proposal_attachments) attachments = JSON.parse(p.proposal_attachments); } catch(e) {}
  var attachHtml = '';
  if (attachments.length > 0) {
    attachHtml = attachments.map(_proposalAttachmentRow).join('');
  } else if (p.pdf_attachment_url) {
    var singleUrl = attachmentApiUrl(p.pdf_attachment_url, false);
    var singleDl  = attachmentApiUrl(p.pdf_attachment_url, true);
    attachHtml = _proposalAttachmentRow({ url: p.pdf_attachment_url, filename: p.pdf_filename || 'proposal.pdf', size_bytes: 0, label: 'proposal' });
  }
  var attachSection = attachments.length > 0 || p.pdf_attachment_url
    ? '<div style="border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;background:#fff">' + attachHtml + '</div>'
    : '<div style="padding:1rem;text-align:center;color:#9ca3af;font-size:0.82rem"><i class="fas fa-inbox" style="display:block;font-size:1.5rem;margin-bottom:0.5rem;color:#d1d5db"></i>No documents attached</div>';

  // ── TAB 1: Executive Summary ─────────────────────────────────────────────
  var budgetMissing = (!p.budget_amount || p.budget_amount <= 0) && (!p.financial_proposal);
  var budgetExtracted = evalData && evalData.budget_extracted;
  var evalBudget = budgetExtracted
    ? (evalData.budget_currency || 'AED') + ' ' + Number(evalData.budget_extracted).toLocaleString()
      + (evalData.budget_confidence != null ? ' <span style="font-size:0.7rem;color:#9ca3af">(confidence: ' + Math.round(evalData.budget_confidence * 100) + '%)</span>' : '')
    : null;

  var manualBudgetBanner = '';
  if (evalData && evalData.validation_status === 'PENDING_MANUAL_REVIEW') {
    manualBudgetBanner = '<div style="background:#fffbeb;border:1.5px solid #fcd34d;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;display:flex;flex-direction:column;gap:0.5rem">'
      + '<div style="display:flex;align-items:center;gap:0.5rem;font-weight:700;font-size:0.85rem;color:#92400e"><i class="fas fa-exclamation-triangle"></i>Budget not auto-extracted — manual entry required</div>'
      + '<div style="font-size:0.78rem;color:#78350f">The AI could not find a clear "Total" line in the proposal. Enter the total budget to unlock full commercial scoring.</div>'
      + '<div style="display:flex;gap:0.5rem;align-items:center;margin-top:0.25rem">'
      + '<input id="manualBudgetInput_' + p.id + '" type="number" min="0" placeholder="Enter amount (e.g. 1500000)" style="flex:1;padding:6px 10px;border:1.5px solid #fcd34d;border-radius:6px;font-size:0.82rem">'
      + '<select id="manualBudgetCur_' + p.id + '" style="padding:6px 8px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem"><option>AED</option><option>USD</option><option>EUR</option><option>GBP</option></select>'
      + '<button onclick="saveManualBudget(' + rfpId + ',' + p.id + ')" style="background:var(--cpc-gold-deep);color:white;border:none;border-radius:6px;padding:6px 14px;font-size:0.82rem;font-weight:600;cursor:pointer;white-space:nowrap"><i class="fas fa-save" style="margin-right:4px"></i>Save &amp; Re-evaluate</button>'
      + '</div>'
      + '</div>';
  }

  var techSummaryHtml = '';
  var techText = (evalData && evalData.technical_summary) || p.executive_summary || '';
  if (!techText && p.technical_proposal) {
    var tp = p.technical_proposal;
    var psOps = (tp.match(/\b(dup|pop|exch|sub|add|truncate|ifelse|RG|rg|Tf|Td|Tm|BT|ET|NonStruct|F\d+)\b/g) || []).length;
    var twds = (tp.match(/\S+/g) || []).length;
    if (twds > 10 && (psOps / twds) > 0.15) {
      techText = '[PDF uses complex font encoding — text could not be extracted. Download the file to read it.]';
    } else {
      techText = tp.slice(0, 2000) + (tp.length > 2000 ? '…' : '');
    }
  }
  if (techText) {
    techSummaryHtml = '<div style="margin-bottom:1rem">'
      + '<div class="panel-section-title"><i class="fas fa-file-alt" style="color:var(--cpc-ink)"></i>Technical Summary</div>'
      + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:0.875rem;font-size:0.82rem;max-height:200px;overflow-y:auto;white-space:pre-wrap;line-height:1.6;color:#374151">' + escHtml(techText) + '</div>'
      + '</div>';
  }

  var strengthsHtml = '';
  var strengthLines = [];
  if (evalData && evalData.strengths && evalData.strengths.length) {
    strengthLines = evalData.strengths;
  } else if (p.key_strengths) {
    strengthLines = p.key_strengths.split('\n').map(function(l){ return l.trim().replace(/^[•\-\*]\s*/, ''); }).filter(Boolean);
  }
  if (strengthLines.length > 0) {
    strengthsHtml = '<div style="margin-bottom:1rem">'
      + '<div class="panel-section-title"><i class="fas fa-star" style="color:var(--cpc-gold)"></i>Key Strengths</div>'
      + '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:0.875rem">'
      + '<ul style="margin:0;padding-left:1.25rem;font-size:0.82rem;line-height:1.8;color:#374151">'
      + strengthLines.map(function(l){ return '<li>' + escHtml(l) + '</li>'; }).join('')
      + '</ul></div></div>';
  }

  var tabSummaryHtml = manualBudgetBanner
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem;margin-bottom:1rem">'
    + '<div style="background:#faf9f7;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem">'
    + '<div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9a8c78;margin-bottom:4px">Budget</div>'
    + '<div style="font-size:0.97rem;font-weight:700;color:#745B35">' + (evalBudget || escHtml(fin)) + '</div>'
    + (evalData && evalData.budget_confidence != null && evalData.budget_confidence < 0.8 ? '<div style="font-size:0.7rem;color:#d97706;margin-top:3px"><i class="fas fa-exclamation-circle" style="margin-right:0.25rem"></i>Low confidence — verify manually</div>' : '')
    + '</div>'
    + '<div style="background:#faf9f7;border:1px solid #e5e7eb;border-radius:8px;padding:0.75rem">'
    + '<div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:#9a8c78;margin-bottom:4px">Timeline</div>'
    + '<div style="font-size:0.97rem;font-weight:700;color:#745B35">' + escHtml((evalData && evalData.duration_extracted) || dur) + '</div>'
    + '</div>'
    + '</div>'
    + techSummaryHtml
    + strengthsHtml
    + '<div style="margin-bottom:1rem">'
    + '<div class="panel-section-title"><i class="fas fa-paperclip" style="color:#6b7280"></i>Submitted Documents (' + (attachments.length || (p.pdf_attachment_url ? 1 : 0)) + ')</div>'
    + attachSection
    + '</div>';

  // ── TAB 2: Compliance Matrix ──────────────────────────────────────────────
  var tabComplianceHtml = '';
  var compBreakdown = evalData && evalData.compliance_breakdown;
  if (compBreakdown && compBreakdown.length > 0) {
    var failedMandatory = compBreakdown.filter(function(r){ return r.mandatory && !r.compliance_met; });
    var critBanner = failedMandatory.length > 0
      ? '<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:8px;padding:0.75rem 1rem;margin-bottom:1rem;display:flex;align-items:flex-start;gap:0.625rem">'
        + '<i class="fas fa-ban" style="color:#dc2626;font-size:1rem;margin-top:2px;flex-shrink:0"></i>'
        + '<div><div style="font-weight:700;font-size:0.85rem;color:#991b1b;margin-bottom:2px">🚨 Mandatory Requirement(s) Not Met — Proposal Automatically Disqualified</div>'
        + failedMandatory.map(function(r){ return '<div style="font-size:0.78rem;color:#dc2626"><i class="fas fa-times-circle" style="margin-right:0.25rem"></i>' + escHtml(r.requirement_text || r.id) + '</div>'; }).join('')
        + '</div></div>'
      : '';

    var rows = compBreakdown.map(function(r) {
      var metIcon = r.compliance_met
        ? '<span style="color:#059669;font-size:1rem"><i class="fas fa-check-circle"></i></span>'
        : '<span style="color:' + (r.mandatory ? '#dc2626' : '#f59e0b') + ';font-size:1rem"><i class="fas fa-times-circle"></i></span>';
      var scoreCell = r.compliance_met && r.ai_score != null
        ? '<div style="display:flex;align-items:center;gap:0.4rem"><div style="width:40px;height:5px;border-radius:3px;background:#e5e7eb;overflow:hidden"><div style="height:100%;width:' + r.ai_score + '%;background:' + (r.ai_score >= 75 ? '#059669' : r.ai_score >= 50 ? '#d97706' : '#dc2626') + '"></div></div><span style="font-size:0.75rem;color:#374151">' + r.ai_score + '/100</span></div>'
        : '<span style="color:#9ca3af;font-size:0.75rem">—</span>';
      return '<tr style="border-bottom:1px solid #f3f4f6">'
        + '<td style="padding:0.5rem 0.75rem;font-size:0.78rem;color:#374151;max-width:280px;word-break:break-word">' + escHtml(r.requirement_text || r.id) + '</td>'
        + '<td style="padding:0.5rem 0.75rem;text-align:center">' + (r.mandatory ? '<span style="background:#fee2e2;color:#991b1b;border-radius:4px;padding:2px 6px;font-size:0.68rem;font-weight:700">' + t('panel_comp_must') + '</span>' : '<span style="background:#f3f4f6;color:#6b7280;border-radius:4px;padding:2px 6px;font-size:0.68rem">' + t('panel_comp_should') + '</span>') + '</td>'
        + '<td style="padding:0.5rem 0.75rem;text-align:center">' + metIcon + '</td>'
        + '<td style="padding:0.5rem 0.75rem">' + scoreCell + '</td>'
        + '<td style="padding:0.5rem 0.75rem;font-size:0.72rem;color:#6b7280;max-width:220px">' + escHtml(r.justification || '') + '</td>'
        + '</tr>';
    }).join('');

    tabComplianceHtml = critBanner
      + '<div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">'
      + '<table style="width:100%;border-collapse:collapse;min-width:520px">'
      + '<thead><tr style="background:#f9fafb;border-bottom:1.5px solid #e5e7eb">'
      + '<th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Requirement</th>'
      + '<th style="padding:0.5rem 0.75rem;text-align:center;font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Mandatory</th>'
      + '<th style="padding:0.5rem 0.75rem;text-align:center;font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Met?</th>'
      + '<th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">AI Depth</th>'
      + '<th style="padding:0.5rem 0.75rem;text-align:left;font-size:0.72rem;font-weight:700;color:#6b7280;text-transform:uppercase;letter-spacing:0.05em">Justification</th>'
      + '</tr></thead>'
      + '<tbody>' + rows + '</tbody>'
      + '</table></div>';
  } else {
    tabComplianceHtml = '<div style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-clipboard-list" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i>'
      + '<div style="font-weight:600;margin-bottom:0.4rem">No compliance data yet</div>'
      + '<div style="font-size:0.8rem">Run AI evaluation to generate the compliance matrix.</div>'
      + '</div>';
  }

  // ── TAB 3: Scoring Breakdown ──────────────────────────────────────────────
  var tabScoringHtml = '';
  if (evalData && evalData.compliance_score != null) {
    var totalScore = evalData.total_score || 0;
    var compScore  = evalData.compliance_score || 0;
    var qualScore  = evalData.quality_score || 0;
    var commScore  = evalData.commercial_score;

    function scoreBar(score, color) {
      return '<div style="flex:1;height:8px;background:#e5e7eb;border-radius:4px;overflow:hidden"><div style="height:100%;width:' + Math.min(100, score) + '%;background:' + color + ';border-radius:4px;transition:width 0.5s"></div></div>';
    }

    var scoringRows = [
      { label: t('panel_score_compliance'), weight: '40%', score: compScore, color: '#3b82f6', desc: t('panel_score_comp_desc') },
      { label: t('panel_score_quality'),    weight: '60%', score: qualScore, color: '#8b5cf6', desc: t('panel_score_qual_desc') },
    ];
    if (commScore != null) {
      scoringRows.push({ label: t('panel_score_commercial'), weight: 'bonus', score: commScore, color: '#059669', desc: t('panel_score_comm_desc') });
    }

    tabScoringHtml = '<div style="margin-bottom:1.25rem;background:linear-gradient(135deg,var(--cpc-ink),#2d2519);border-radius:12px;padding:1.25rem;color:white;display:flex;align-items:center;justify-content:space-between">'
      + '<div><div style="font-size:0.75rem;font-weight:600;text-transform:uppercase;letter-spacing:0.08em;color:rgba(255,255,255,0.6);margin-bottom:4px">' + t('panel_score_overall') + '</div>'
      + '<div style="font-size:2.5rem;font-weight:800;line-height:1;color:' + (totalScore >= 80 ? '#4ade80' : totalScore >= 60 ? '#fbbf24' : '#f87171') + '">' + Math.round(totalScore) + '<span style="font-size:1.2rem;font-weight:500;color:rgba(255,255,255,0.4)">/100</span></div>'
      + '</div>'
      + '<div style="width:72px;height:72px;border-radius:50%;border:4px solid ' + (totalScore >= 80 ? '#4ade80' : totalScore >= 60 ? '#fbbf24' : '#f87171') + ';display:flex;align-items:center;justify-content:center">'
      + '<i class="fas ' + (totalScore >= 80 ? 'fa-check-circle' : totalScore >= 60 ? 'fa-exclamation-circle' : 'fa-times-circle') + '" style="font-size:1.75rem;color:' + (totalScore >= 80 ? '#4ade80' : totalScore >= 60 ? '#fbbf24' : '#f87171') + '"></i></div>'
      + '</div>'
      + '<div style="display:flex;flex-direction:column;gap:0.75rem">'
      + scoringRows.map(function(r) {
          return '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:0.875rem">'
            + '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">'
            + '<div><span style="font-size:0.85rem;font-weight:600;color:#1f2937">' + escHtml(r.label) + '</span>'
            + ' <span style="font-size:0.7rem;color:#9ca3af;background:#f3f4f6;border-radius:4px;padding:1px 6px">' + r.weight + '</span></div>'
            + '<span style="font-size:1.1rem;font-weight:800;color:' + r.color + '">' + Math.round(r.score) + '/100</span>'
            + '</div>'
            + '<div style="display:flex;align-items:center;gap:0.5rem">' + scoreBar(r.score, r.color) + '</div>'
            + '<div style="font-size:0.72rem;color:#9ca3af;margin-top:4px">' + escHtml(r.desc) + '</div>'
            + '</div>';
        }).join('')
      + '</div>'
      + (evalData.validation_status === 'PENDING_MANUAL_REVIEW' ? '<div style="margin-top:0.75rem;background:#fffbeb;border:1px solid #fcd34d;border-radius:8px;padding:0.75rem;font-size:0.78rem;color:#92400e"><i class="fas fa-clock" style="margin-right:0.25rem"></i>' + t('panel_score_pending') + '</div>' : '')
      + (evalData.validation_status === 'MANUALLY_VALIDATED' ? '<div style="margin-top:0.75rem;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;padding:0.75rem;font-size:0.78rem;color:#065f46"><i class="fas fa-user-check" style="margin-right:0.25rem"></i>' + t('panel_score_validated') + '</div>' : '');
  } else {
    tabScoringHtml = '<div style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-chart-bar" style="font-size:2rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i>'
      + '<div style="font-weight:600;margin-bottom:0.4rem">' + t('panel_score_no_data') + '</div>'
      + '<div style="font-size:0.8rem">' + t('panel_score_no_data_sub') + '</div>'
      + '</div>';
  }

  // ── TAB 4: AI Verdict ────────────────────────────────────────────────────
  var tabVerdictHtml = '';
  if (evalData && evalData.recommendation) {
    var rec = evalData.recommendation;
    var recColor  = rec === 'RECOMMENDED' ? '#059669' : rec === 'CONDITIONAL' ? '#d97706' : '#dc2626';
    var recBg     = rec === 'RECOMMENDED' ? '#d1fae5' : rec === 'CONDITIONAL' ? '#fef3c7' : '#fee2e2';
    var recIcon   = rec === 'RECOMMENDED' ? 'fa-check-circle' : rec === 'CONDITIONAL' ? 'fa-exclamation-circle' : 'fa-times-circle';

    var weakLines = (evalData.weaknesses || []).filter(Boolean);

    tabVerdictHtml = '<div style="text-align:center;padding:1.25rem;background:' + recBg + ';border-radius:12px;margin-bottom:1.25rem">'
      + '<i class="fas ' + recIcon + '" style="font-size:2.5rem;color:' + recColor + ';display:block;margin-bottom:0.5rem"></i>'
      + '<div style="font-size:1.5rem;font-weight:800;color:' + recColor + '">' + escHtml(rec) + '</div>'
      + (evalData.total_score != null ? '<div style="font-size:0.85rem;color:' + recColor + ';opacity:0.75;margin-top:4px">' + t('panel_score_score_lbl') + ' ' + Math.round(evalData.total_score) + ' / 100</div>' : '')
      + '</div>'
      + (evalData.recommendation_reasoning ? '<div style="margin-bottom:1.25rem"><div class="panel-section-title"><i class="fas fa-gavel" style="color:var(--cpc-ink)"></i>' + t('panel_verdict_reasoning') + '</div>'
        + '<div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:0.875rem;font-size:0.82rem;line-height:1.7;color:#374151">' + escHtml(evalData.recommendation_reasoning) + '</div></div>' : '')
      + (strengthLines.length > 0 ? '<div style="margin-bottom:1.25rem"><div class="panel-section-title"><i class="fas fa-thumbs-up" style="color:#059669"></i>' + t('panel_verdict_strong') + '</div>'
        + '<ul style="margin:0;padding-left:1.25rem;font-size:0.82rem;line-height:1.8;color:#374151">'
        + strengthLines.map(function(l){ return '<li><i class="fas fa-check" style="color:#059669;margin-right:4px"></i>' + escHtml(l) + '</li>'; }).join('')
        + '</ul></div>' : '')
      + (weakLines.length > 0 ? '<div style="margin-bottom:1.25rem"><div class="panel-section-title"><i class="fas fa-exclamation-triangle" style="color:#d97706"></i>' + t('panel_verdict_risks') + '</div>'
        + '<ul style="margin:0;padding-left:1.25rem;font-size:0.82rem;line-height:1.8;color:#374151">'
        + weakLines.map(function(l){ return '<li><i class="fas fa-exclamation-triangle" style="color:#d97706;margin-right:4px"></i>' + escHtml(l) + '</li>'; }).join('')
        + '</ul></div>' : '')
      + '<details style="margin-top:0.75rem;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">'
      + '<summary style="padding:0.75rem 1rem;cursor:pointer;font-size:0.82rem;font-weight:600;background:#f9fafb;list-style:none;display:flex;align-items:center;gap:0.5rem"><i class="fas fa-paperclip" style="color:#6b7280"></i>' + t('panel_verdict_orig_att') + ' (' + (attachments.length || (p.pdf_attachment_url ? 1 : 0)) + ')</summary>'
      + '<div>' + (attachHtml || '<div style="padding:0.75rem;text-align:center;color:#9ca3af;font-size:0.82rem">' + t('panel_verdict_no_docs') + '</div>') + '</div>'
      + '</details>';
  } else {
    var hasEvaluated = p.ai_evaluated_at;
    tabVerdictHtml = '<div style="padding:2.5rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-robot" style="font-size:2.5rem;display:block;margin-bottom:0.75rem;color:#d1d5db"></i>'
      + '<div style="font-weight:600;font-size:0.95rem;margin-bottom:0.5rem">' + t('panel_verdict_no_data') + '</div>'
      + '<div style="font-size:0.8rem;margin-bottom:1.25rem">' + t('panel_verdict_no_data_sub') + '</div>'
      + '<button onclick="evaluateSingleProposal(' + rfpId + ',' + p.id + ')" style="background:linear-gradient(135deg,var(--cpc-gold-deep),var(--cpc-gold));color:white;border:none;border-radius:8px;padding:0.6rem 1.5rem;font-size:0.85rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:0.5rem" id="evalSingleBtn_' + p.id + '"><i class="fas fa-robot"></i>' + t('panel_eval_single_btn') + '</button>'
      + '</div>';
  }

  // ── Build the panel DOM ───────────────────────────────────────────────────
  closeProposalPanel();

  var overlay = document.createElement('div');
  overlay.id = 'proposalPanelOverlay';
  overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.35);z-index:900;opacity:0;transition:opacity 0.25s';
  overlay.addEventListener('click', closeProposalPanel);

  var panel = document.createElement('div');
  panel.id = 'proposalSidePanel';
  panel.style.cssText = 'position:fixed;top:0;right:0;bottom:0;width:min(740px,100vw);background:#fff;z-index:901;overflow:hidden;box-shadow:-4px 0 32px rgba(0,0,0,0.15);transform:translateX(100%);transition:transform 0.3s cubic-bezier(0.16,1,0.3,1);display:flex;flex-direction:column';

  var activeTab = evalData ? 'verdict' : 'summary';

  panel.innerHTML =
    // ── Panel header ──────────────────────────────────────────────────────
    '<div style="position:sticky;top:0;z-index:10;background:#fff;border-bottom:1px solid #e5e7eb;padding:0.875rem 1.25rem;display:flex;align-items:center;gap:0.875rem;flex-shrink:0">'
    + '<div style="width:40px;height:40px;border-radius:10px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1rem;flex-shrink:0">' + escHtml((p.vendor_name||'?').charAt(0)) + '</div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-weight:700;font-size:0.97rem;color:#1f2937;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(p.vendor_name||'Unknown Vendor') + '</div>'
    + '<div style="font-size:0.73rem;color:#9ca3af">' + dateStr + ' &bull; ' + escHtml((p.status||'submitted').replace(/_/g,' '))
    + (p.ai_recommendation ? ' &bull; <span style="color:' + (p.ai_recommendation === 'RECOMMENDED' ? '#059669' : p.ai_recommendation === 'CONDITIONAL' ? '#d97706' : '#dc2626') + ';font-weight:700">' + p.ai_recommendation + '</span>' : '') + '</div>'
    + '</div>'
    + '<button onclick="closeProposalPanel()" style="flex-shrink:0;width:32px;height:32px;border-radius:8px;border:1px solid #e5e7eb;background:#f9fafb;color:#6b7280;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:1rem" title="Close"><i class="fas fa-times"></i></button>'
    + '</div>'

    // ── Tab nav ───────────────────────────────────────────────────────────
    + '<div id="proposalTabNav" style="display:flex;border-bottom:1px solid #e5e7eb;flex-shrink:0;overflow-x:auto">'
    + ['summary','compliance','scoring','verdict'].map(function(tab) {
        var labels = { summary: '<i class="fas fa-file-alt" style="margin-right:0.25rem"></i>Summary', compliance: '<i class="fas fa-clipboard-check" style="margin-right:0.25rem"></i>Compliance', scoring: '<i class="fas fa-chart-bar" style="margin-right:0.25rem"></i>Scoring', verdict: '<i class="fas fa-robot" style="margin-right:0.25rem"></i>AI Verdict' };
        var isActive = tab === activeTab;
        return '<button onclick="switchProposalTab(\x27' + tab + '\x27)" id="ptab_' + tab + '" style="padding:0.75rem 1rem;font-size:0.8rem;font-weight:' + (isActive ? '700' : '500') + ';color:' + (isActive ? 'var(--cpc-gold-deep)' : '#6b7280') + ';background:none;border:none;border-bottom:2px solid ' + (isActive ? 'var(--cpc-gold)' : 'transparent') + ';cursor:pointer;white-space:nowrap;transition:all 0.15s">' + labels[tab] + '</button>';
      }).join('')
    + '</div>'

    // ── Tab bodies ─────────────────────────────────────────────────────────
    + '<div id="pTabBody_summary"    style="flex:1;overflow-y:auto;padding:1.25rem;' + (activeTab !== 'summary'    ? 'display:none' : '') + '">' + tabSummaryHtml    + '</div>'
    + '<div id="pTabBody_compliance" style="flex:1;overflow-y:auto;padding:1.25rem;' + (activeTab !== 'compliance' ? 'display:none' : '') + '">' + tabComplianceHtml + '</div>'
    + '<div id="pTabBody_scoring"    style="flex:1;overflow-y:auto;padding:1.25rem;' + (activeTab !== 'scoring'    ? 'display:none' : '') + '">' + tabScoringHtml    + '</div>'
    + '<div id="pTabBody_verdict"    style="flex:1;overflow-y:auto;padding:1.25rem;' + (activeTab !== 'verdict'    ? 'display:none' : '') + '">' + tabVerdictHtml    + '</div>'

    // ── Footer ─────────────────────────────────────────────────────────────
    + (function() {
        var rfpNow = appState.currentRfp;
        var isAwarded = p.status === 'awarded' || !!p.awarded_at;
        var rfpAlreadyAwarded = (appState.proposals||[]).some(function(pp){ return pp.status==='awarded' && pp.id!==p.id; });
        var canAward = rfpNow && rfpNow.stage === 'submissions_closed' && !isAwarded && !rfpAlreadyAwarded;
        return '<div style="position:sticky;bottom:0;background:#fff;border-top:1px solid #e5e7eb;padding:0.75rem 1.25rem;display:flex;gap:0.5rem;justify-content:flex-end;align-items:center;flex-shrink:0">'
          + (isAwarded ? '<div style="background:#d1fae5;color:#065f46;padding:0.35rem 0.9rem;border-radius:7px;font-weight:700;font-size:0.82rem;display:inline-flex;align-items:center;gap:0.4rem"><i class="fas fa-trophy"></i>Contract Awarded</div>' : '')
          + (canAward ? '<button onclick="closeProposalPanel();awardProposal(' + rfpId + ',' + p.id + ',\x27' + escHtml(p.vendor_name||'this vendor') + '\x27)" style="background:linear-gradient(135deg,#059669,#10b981);color:white;border:none;border-radius:7px;padding:0.45rem 1.1rem;font-size:0.82rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:0.4rem"><i class="fas fa-trophy"></i>Award Contract</button>' : '')
          + (!evalData ? '<button onclick="evaluateSingleProposal(' + rfpId + ',' + p.id + ')" id="evalSingleBtnFooter_' + p.id + '" style="background:linear-gradient(135deg,var(--cpc-gold-deep),var(--cpc-gold));color:white;border:none;border-radius:7px;padding:0.45rem 1.1rem;font-size:0.82rem;font-weight:700;cursor:pointer;display:inline-flex;align-items:center;gap:0.4rem"><i class="fas fa-robot"></i>' + t('panel_eval_footer_btn') + '</button>' : '')
          + '<button class="btn-ghost" onclick="closeProposalPanel()" style="padding:0.45rem 1.1rem">' + t('btn_cancel') + '</button>'
          + '</div>';
      })()

  document.body.appendChild(overlay);
  document.body.appendChild(panel);

  requestAnimationFrame(function() {
    overlay.style.opacity = '1';
    requestAnimationFrame(function() { panel.style.transform = 'translateX(0)'; });
  });
}

// ── Switch between proposal panel tabs ───────────────────────────────────────
function switchProposalTab(tab) {
  ['summary','compliance','scoring','verdict'].forEach(function(t) {
    var body = document.getElementById('pTabBody_' + t);
    var btn  = document.getElementById('ptab_' + t);
    var isActive = t === tab;
    if (body) body.style.display = isActive ? '' : 'none';
    if (btn) {
      btn.style.fontWeight = isActive ? '700' : '500';
      btn.style.color = isActive ? 'var(--cpc-gold-deep)' : '#6b7280';
      btn.style.borderBottom = isActive ? '2px solid var(--cpc-gold)' : '2px solid transparent';
    }
  });
}

// ── Evaluate a single proposal with AI ───────────────────────────────────────
async function evaluateSingleProposal(rfpId, proposalId) {
  // Disable any trigger buttons inside the panel
  ['evalSingleBtn_' + proposalId, 'evalSingleBtnFooter_' + proposalId].forEach(function(id) {
    var btn = document.getElementById(id);
    if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> ' + t('prop_evaluating'); }
  });
  try {
    showToast('🤖 AI evaluation running for this proposal — please wait…', 'info', 12000);
    var result = await apiCall('POST', '/rfps/' + rfpId + '/proposals/' + proposalId + '/evaluate', {});
    if (result && result.evaluation_data) {
      showToast('✅ Evaluation complete!', 'success', 4000);
      // Update local proposal state with scalar fields
      var p = appState.proposals ? appState.proposals.find(function(pp){ return pp.id === proposalId; }) : null;
      if (p) {
        p.ai_recommendation    = result.recommendation;
        p.ai_total_score       = result.total_score;
        p.ai_validation_status = result.validation_status;
        p.ai_evaluated_at      = result.evaluated_at || new Date().toISOString();
      }
      // Re-render panel with fresh eval data
      if (p) _renderProposalPanel(p, result.evaluation_data);
    } else {
      showToast('Evaluation finished — refresh to see results.', 'info');
    }
  } catch(e) {
    showToast('Evaluation failed: ' + (e.message || e), 'error');
    ['evalSingleBtn_' + proposalId, 'evalSingleBtnFooter_' + proposalId].forEach(function(id) {
      var btn = document.getElementById(id);
      if (btn) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-robot"></i> ' + t('panel_eval_footer_btn'); }
    });
  }
}

// ── Manual budget override ─────────────────────────────────────────────────────
async function saveManualBudget(rfpId, proposalId) {
  var amtEl = document.getElementById('manualBudgetInput_' + proposalId);
  var curEl = document.getElementById('manualBudgetCur_' + proposalId);
  if (!amtEl || !amtEl.value) { showToast('Please enter a budget amount', 'error'); return; }
  var amount = parseFloat(amtEl.value);
  if (isNaN(amount) || amount <= 0) { showToast('Please enter a valid positive amount', 'error'); return; }
  var currency = curEl ? curEl.value : 'AED';
  try {
    showToast('Saving budget and re-evaluating…', 'info', 6000);
    var result = await apiCall('POST', '/rfps/' + rfpId + '/proposals/' + proposalId + '/manual-override', {
      manual_budget: amount,
      budget_currency: currency,
    });
    if (result && result.ok !== false) {
      showToast('✅ Budget saved! Scores recalculated.', 'success', 4000);
      var p = appState.proposals ? appState.proposals.find(function(pp){ return pp.id === proposalId; }) : null;
      if (p) {
        p.budget_amount        = amount;
        p.budget_currency      = currency;
        p.ai_recommendation    = result.recommendation    || p.ai_recommendation;
        p.ai_total_score       = result.total_score       != null ? result.total_score : p.ai_total_score;
        p.ai_validation_status = result.validation_status || p.ai_validation_status;
      }
      // Re-fetch evaluation data and re-render panel
      if (p) {
        apiCall('GET', '/rfps/' + rfpId + '/proposals/' + proposalId + '/evaluation').then(function(ev) {
          _renderProposalPanel(p, ev.evaluation_data);
        }).catch(function() { if (p) _renderProposalPanel(p, null); });
      }
    } else {
      showToast('Save failed: ' + ((result && result.error) || 'Unknown error'), 'error');
    }
  } catch(e) {
    showToast('Save failed: ' + (e.message || e), 'error');
  }
}

// rfpTabs.evaluation, rfpTabs.recommendation, and rfpTabs.scoring removed — AI evaluation features removed in v8

// ============================================================
// PAGE: VENDOR COMMUNICATIONS (per-vendor thread)
// ============================================================
pages.vendor_comms = async function(opts) {
  const rfpId = opts.rfpId;
  const vendorId = opts.vendorId;

  // Show back button
  var backBtn = document.getElementById('backBtn');
  if (backBtn) backBtn.style.display = 'inline-flex';

  // Fetch all emails + vendor info + vendor status for this RFP
  let allEmails = [], received = [], rfp = appState.currentRfp, vendorDeclined = false;
  try {
    [allEmails, received] = await Promise.all([
      apiCall('GET', '/rfps/' + rfpId + '/emails').catch(function(){ return []; }),
      apiCall('GET', '/rfps/' + rfpId + '/emails/received').catch(function(){ return []; }),
    ]);
    if (!rfp) rfp = await apiCall('GET', '/rfps/' + rfpId).catch(function(){ return null; });
    // Check if vendor is declined for this RFP
    const rfpVendors = appState.rfpVendors || await apiCall('GET', '/rfps/' + rfpId + '/vendors').catch(function(){ return []; });
    const vendorEntry = rfpVendors.find(function(v){ return String(v.id) === String(vendorId); });
    vendorDeclined = vendorEntry ? vendorEntry.rfp_status === 'declined' : false;
  } catch(e) {}

  // Combine and filter by vendorId
  const combined = {};
  allEmails.forEach(function(e) {
    combined[e.id] = e;
  });
  received.forEach(function(e) {
    if (!combined[e.id]) combined[e.id] = e;
  });

  const vendorEmails = Object.values(combined).filter(function(e) {
    return String(e.vendor_id) === String(vendorId);
  }).sort(function(a, b) { return (a.id||0) - (b.id||0); });

  // Determine vendor name
  const anyEmail = vendorEmails[0] || allEmails.find(function(e){ return String(e.vendor_id)===String(vendorId); });
  const vendorName = anyEmail ? (anyEmail.vendor_name || anyEmail.recipient || anyEmail.from_email || 'Vendor') : 'Vendor #' + vendorId;

  // Update page header
  document.getElementById('pageTitle').textContent = vendorName + ' — Communications';
  document.getElementById('pageSubtitle').textContent = (rfp ? rfp.title || 'RFP' : 'RFP') + ' \u2022 Vendor Communication Thread';

  // Build thread HTML
  let threadHtml = '';
  if (vendorEmails.length === 0) {
    threadHtml = '<div class="card" style="padding:3rem;text-align:center;color:#9ca3af">'
      + '<i class="fas fa-comments" style="font-size:2.5rem;display:block;margin-bottom:1rem;color:#d1d5db"></i>'
      + '<p style="font-weight:600;color:#6b7280;margin-bottom:0.5rem">No email correspondence yet</p>'
      + '<p style="font-size:0.82rem">Emails with this vendor will appear here once communication starts.</p>'
      + '</div>';
  } else {
    vendorEmails.forEach(function(e) {
      const isInbound = e.status === 'received';
      const dateStr = e.created_at ? new Date(e.created_at).toLocaleString('en-AE', {weekday:'short',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
      const bodyCollapseId = 'vc-email-body-' + e.id;

      const hasAttach = e.has_attachment || e.has_pdf;
      let attachBadgeHtml = '';
      if (e.has_pdf) {
        attachBadgeHtml = '<span style="background:#ede9fe;color:var(--cpc-gold-deep);border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-file-pdf" style="margin-right:0.25rem"></i>PDF Proposal</span>';
      } else if (e.has_attachment) {
        attachBadgeHtml = '<span style="background:#fef3c7;color:#92400e;border-radius:4px;padding:2px 6px;font-size:0.7rem;font-weight:600"><i class="fas fa-paperclip" style="margin-right:0.25rem"></i>Attachment</span>';
      }
      const typeBadge = e.email_type
        ? '<span style="background:#f3f4f6;color:#6b7280;border-radius:4px;padding:2px 5px;font-size:0.68rem">' + escHtml(e.email_type) + '</span>'
        : '';
      const catBadge = e.email_category
        ? '<span style="background:#e0f2fe;color:#0369a1;border-radius:4px;padding:2px 5px;font-size:0.68rem"><i class="fas fa-robot" style="margin-right:0.25rem"></i>' + escHtml(e.email_category) + '</span>'
        : '';

      const bodyContent = e.email_body_html
        ? '<iframe srcdoc="' + escHtml(e.email_body_html) + '" style="width:100%;border:none;min-height:160px;border-radius:6px;background:white" sandbox="allow-same-origin"></iframe>'
        : '<pre style="white-space:pre-wrap;font-size:0.82rem;color:#374151;font-family:inherit;margin:0;background:#f9fafb;padding:0.75rem;border-radius:6px" dir="auto">' + escHtml((e.body||'(no body)').slice(0,2000)) + '</pre>';

      const bubbleStyle = isInbound
        ? 'background:#f5f3ff;border:1px solid #ede9fe;border-radius:0 12px 12px 12px;padding:0.875rem 1rem'
        : 'background:#fff7e6;border:1px solid #fde68a;border-radius:12px 0 12px 12px;padding:0.875rem 1rem';
      const nameColor = isInbound ? '#BA9765' : '#b45309';
      const avatarBg = isInbound ? '#BA9765' : 'var(--cpc-gold)';
      const avatarIcon = isInbound ? 'fa-user' : 'fa-crown';
      const alignDir = isInbound ? 'row' : 'row-reverse';
      const displayName = isInbound ? escHtml(e.from_email || vendorName) : 'CPC Procurement';

      threadHtml += '<div style="display:flex;gap:0.75rem;margin-bottom:1rem;flex-direction:' + alignDir + ';align-items:flex-start">'
        // Avatar
        + '<div style="width:36px;height:36px;border-radius:50%;background:' + avatarBg + ';display:flex;align-items:center;justify-content:center;flex-shrink:0;margin-top:4px">'
        + '<i class="fas ' + avatarIcon + '" style="color:white;font-size:0.8rem"></i></div>'
        // Bubble
        + '<div style="flex:1;max-width:85%">'
        + '<div style="' + bubbleStyle + '">'
        // Header row
        + '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:0.4rem;gap:0.5rem;flex-wrap:wrap">'
        + '<span style="font-weight:700;font-size:0.82rem;color:' + nameColor + '">' + displayName + '</span>'
        + '<div style="display:flex;align-items:center;gap:0.4rem;flex-wrap:wrap">'
        + typeBadge + catBadge + attachBadgeHtml
        + '<span style="font-size:0.7rem;color:#9ca3af">' + dateStr + '</span>'
        + '</div></div>'
        // Subject
        + '<div style="font-size:0.85rem;font-weight:600;color:#1f2937;margin-bottom:0.35rem">' + escHtml(e.subject||'(no subject)') + '</div>'
        // Toggle body
        + '<button onclick="toggleInboundBody(\x27' + bodyCollapseId + '\x27)" style="font-size:0.72rem;color:' + nameColor + ';background:none;border:none;cursor:pointer;padding:0;margin-bottom:0.35rem">'
        + '<i class="fas fa-chevron-down" id="chevron-' + bodyCollapseId + '"></i> View message</button>'
        + '<div id="' + bodyCollapseId + '" style="display:none;margin-top:0.5rem">' + bodyContent + '</div>'
        // Attachment note
        + (isInbound && e.has_attachment ? '<div style="margin-top:0.5rem;font-size:0.75rem;color:#92400e;background:#fef3c7;padding:4px 8px;border-radius:4px"><i class="fas fa-file-excel" style="margin-right:0.25rem"></i>Attachment processed \u2014 questions added to Q&A tab</div>' : '')
        + (isInbound && e.has_pdf ? '<div style="margin-top:0.5rem;font-size:0.75rem;color:#5b21b6;background:#ede9fe;padding:4px 8px;border-radius:4px"><i class="fas fa-file-pdf" style="margin-right:0.25rem"></i>PDF proposal received \u2014 added to Proposals tab</div>' : '')
        + '</div>'
        + '</div>'
        + '</div>';
    });
  }

  // Add anchor at end of thread for Jump to Latest
  if (vendorEmails.length > 0) {
    threadHtml += '<div id="vc-latest" style="height:0"></div>';
  }
  // Reply form — blocked if vendor declined
  const replySection = vendorDeclined
    ? '<div class="card" style="padding:1.25rem;margin-top:1rem;background:#fef2f2;border:1.5px solid #fca5a5">'
      + '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:0.5rem">'
      + '<i class="fas fa-ban" style="color:#dc2626;font-size:1.25rem;flex-shrink:0"></i>'
      + '<div><div style="font-weight:700;font-size:0.9rem;color:#991b1b">Correspondence Prohibited</div>'
      + '<div style="font-size:0.8rem;color:#dc2626">' + escHtml(vendorName) + ' has declined participation in this RFP. No further correspondence is permitted.</div>'
      + '</div></div>'
      + '<button class="btn-ghost" onclick="navigateTo(\x27rfp_detail\x27,{rfpId:' + rfpId + ',tab:\x27vendors\x27})"><i class="fas fa-arrow-left"></i>Back to RFP</button>'
      + '</div>'
    : '<div class="card" style="padding:1.25rem;margin-top:1rem">'
      + '<h4 style="font-weight:700;font-size:0.875rem;color:#1f2937;margin:0 0 0.75rem"><i class="fas fa-reply" style="margin-right:0.5rem" style="color:var(--cpc-ink)"></i>Reply to ' + escHtml(vendorName) + '</h4>'
      + '<div class="form-group" style="margin-bottom:0.5rem">'
      + '<input id="vc-reply-subj" type="text" placeholder="Subject..." style="width:100%;padding:7px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;box-sizing:border-box">'
      + '</div>'
      + '<div class="form-group" style="margin-bottom:0.5rem">'
      + '<textarea id="vc-reply-text" rows="4" placeholder="Type your message..." style="width:100%;padding:8px 10px;border:1px solid #e5e7eb;border-radius:6px;font-size:0.82rem;resize:vertical;box-sizing:border-box" oninput="var c=document.getElementById(\x27vc-charcount\x27);if(c)c.textContent=this.value.length+\x27 chars\x27"></textarea>'
      + '<div style="text-align:right;font-size:0.7rem;color:#9ca3af;margin-top:2px" id="vc-charcount">0 chars</div>'
      + '</div>'
      + '<div style="display:flex;gap:0.5rem">'
      + '<button class="btn-primary" onclick="sendVendorCommReply(' + rfpId + ',' + vendorId + ')"><i class="fas fa-paper-plane"></i>Send Reply</button>'
      + '<button class="btn-ghost" onclick="navigateTo(\x27rfp_detail\x27,{rfpId:' + rfpId + ',tab:\x27vendors\x27})"><i class="fas fa-arrow-left"></i>Back to RFP</button>'
      + '</div>'
      + '</div>';

  const declinedBanner = vendorDeclined
    ? '<div style="background:#fee2e2;border:1.5px solid #fca5a5;border-radius:8px;padding:0.75rem 1rem;display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
      + '<i class="fas fa-times-circle" style="color:#dc2626;font-size:1.1rem;flex-shrink:0"></i>'
      + '<div><div style="font-weight:700;font-size:0.85rem;color:#991b1b">Vendor Declined Participation</div>'
      + '<div style="font-size:0.78rem;color:#dc2626">This vendor replied to the RFP invitation indicating they are not interested. All correspondence is now prohibited.</div></div>'
      + '</div>'
    : '';

  setContent(
    '<div style="max-width:860px;margin:0 auto">'
    // Declined banner (if applicable)
    + declinedBanner
    // Header card
    + '<div class="card" style="padding:1rem 1.25rem;margin-bottom:1rem;display:flex;align-items:center;justify-content:space-between' + (vendorDeclined ? ';background:#fef2f2;border:1.5px solid #fca5a5' : '') + '">'
    + '<div style="display:flex;align-items:center;gap:0.875rem">'
    + '<div style="width:44px;height:44px;border-radius:10px;background:' + (vendorDeclined ? '#dc2626' : 'var(--cpc-ink)') + ';display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.1rem">'
    + (vendorDeclined ? '<i class="fas fa-times" style="font-size:1rem"></i>' : escHtml((vendorName||'?').charAt(0))) + '</div>'
    + '<div>'
    + '<div style="font-weight:700;font-size:0.95rem;color:' + (vendorDeclined ? '#991b1b' : '#1f2937') + '">' + escHtml(vendorName) + '</div>'
    + '<div style="font-size:0.78rem;color:#9ca3af">' + vendorEmails.length + ' message(s) in thread'
    + ' &bull; <span style="font-family:monospace;color:var(--cpc-ink);font-weight:600" title="Participant Reference Code">RFP-' + rfpId + '-V' + vendorId + '</span>'
    + (rfp ? ' &bull; <span style="color:#6b7280" title="RFP Reference">' + escHtml(rfp.ref_number||('RFP-'+rfpId)) + '</span>' : '')
    + (vendorDeclined ? ' &bull; <span style="color:#dc2626;font-weight:600">DECLINED</span>' : '') + '</div>'
    + '</div></div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-ghost btn-sm" id="jumpLatestBtn" onclick="(function(){var el=document.getElementById(\x27vc-latest\x27);if(el)el.scrollIntoView({behavior:\x27smooth\x27})})()"><i class="fas fa-arrow-down"></i>Latest</button>'
    + '<button class="btn-secondary btn-sm" onclick="pages.vendor_comms({rfpId:' + rfpId + ',vendorId:' + vendorId + '})"><i class="fas fa-sync"></i>Refresh</button>'
    + '<button class="btn-ghost btn-sm" onclick="navigateTo(\x27rfp_detail\x27,{rfpId:' + rfpId + ',tab:\x27vendors\x27})"><i class="fas fa-arrow-left"></i>Back to RFP</button>'
    + '</div>'
    + '</div>'
    // Messages
    + '<div style="display:flex;flex-direction:column;gap:0;padding:0 0 0.5rem">'
    + (threadHtml || '<div style="padding:2rem;text-align:center;color:#9ca3af">No messages yet</div>')
    + '</div>'
    // Reply
    + replySection
    + '</div>'
  );

  // Start polling for new messages
  startVendorCommsPolling(rfpId, vendorId);
};

var _vcPollTimer = null;
function startVendorCommsPolling(rfpId, vendorId) {
  if (_vcPollTimer) clearInterval(_vcPollTimer);
  _vcPollTimer = setInterval(function() {
    if (appState.currentPage !== 'vendor_comms') { clearInterval(_vcPollTimer); _vcPollTimer = null; return; }
    silentCheckInbox(rfpId);
  }, 8000);
}

async function sendVendorCommReply(rfpId, vendorId) {
  const subjEl = document.getElementById('vc-reply-subj');
  const textEl = document.getElementById('vc-reply-text');
  if (!textEl || !textEl.value.trim()) { showToast('Please enter a message', 'error'); return; }
  try {
    const result = await apiCall('POST', '/rfps/' + rfpId + '/vendors/' + vendorId + '/reply', {
      subject: subjEl ? subjEl.value : '',
      text: textEl.value,
    });
    if (result.ok) {
      showToast('Reply sent!', 'success');
    } else {
      showToast('Reply simulated (no real email sent)', 'info');
    }
    if (textEl) textEl.value = '';
    if (subjEl) subjEl.value = '';
    // Reload page
    pages.vendor_comms({ rfpId: rfpId, vendorId: vendorId });
  } catch(e) {
    showToast('Failed to send: ' + e.message, 'error');
  }
}

// ============================================================
// PAGE: VENDORS (global registry)
// ============================================================
pages.vendors = async function() {
  const vendors = await apiCall('GET', '/vendors').catch(function(){ return []; });
  appState.vendors = vendors;

  let rows = '';
  vendors.forEach(function(v) {
    var allSpecs2 = (v.specializations||'').split(',').filter(Boolean);
    var visTags2 = allSpecs2.slice(0,3).map(function(s){ return '<span class="tag">' + escHtml(tSpec(s.trim())) + '</span>'; }).join('');
    var more2 = allSpecs2.length - 3;
    var moreBadge2 = more2 > 0 ? '<span style="font-size:0.75rem;color:var(--cpc-gold-deep);text-decoration:underline;margin-left:3px">+' + more2 + '</span>' : '';
    const tags = visTags2 + moreBadge2;

    rows += '<tr>'
      + '<td><div style="display:flex;align-items:center;gap:0.75rem">'
      + '<div style="width:36px;height:36px;border-radius:8px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:0.9rem;flex-shrink:0">' + escHtml(v.name.charAt(0)) + '</div>'
      + '<div><div style="font-weight:600;font-size:0.95rem;cursor:pointer" onmouseenter="showVendorHoverCard(event,' + v.id + ')" onmouseleave="hideVendorHoverCard()">' + escHtml(v.name) + '</div>'
      + '<div style="font-size:0.78rem;color:#9ca3af">' + escHtml(tVendorCountry(v.country||'UAE')) + ' &bull; ' + escHtml(tVendorSize(v.size||'')) + '</div>'
      + '</div></div></td>'
      + '<td>' + escHtml(tVendorCat(v.category||'')) + '</td>'
      + '<td onclick="viewVendorDetail(' + v.id + ')" style="cursor:pointer" title="Click to see all specializations"><div class="tag-group">' + tags + '</div></td>'
      + '<td><button class="btn-ghost btn-sm" onclick="viewVendorDetail(' + v.id + ')"><i class="fas fa-eye"></i></button></td>'
      + '</tr>';
  });

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:flex;align-items:center;justify-content:space-between">'
    + '<div><h3 style="font-weight:700;font-size:0.95rem;color:#1f2937;margin:0">' + t('vpage_heading') + '</h3>'
    + '<p style="font-size:0.8rem;color:#9ca3af;margin:0">' + vendors.length + ' ' + t('vpage_registered') + '</p></div>'
    + '<button class="btn-ghost btn-sm" onclick="exportVendorsCsv()"><i class="fas fa-download"></i>Export CSV</button>'
    + '</div>'
    + '<div class="card"><div style="overflow-x:auto"><table>'
    + '<thead><tr><th>' + t('vpage_th_vendor') + '</th><th>' + t('vpage_th_category') + '</th><th>' + t('vpage_th_specs') + '</th><th></th></tr></thead>'
    + '<tbody>' + rows + '</tbody>'
    + '</table></div></div>'
    + '</div>'
  );
};

function exportVendorsCsv() {
  var vendors = appState.vendors || [];
  if (!vendors.length) { showToast('No vendors to export', 'error'); return; }
  var cols = ['id','name','category','country','hq_city','size','contact_name','contact_email','website','founded_year','certifications'];
  var csv = cols.join(',') + '\n';
  vendors.forEach(function(v) {
    csv += cols.map(function(c){ var val = (v[c]||'').toString().replace(/"/g,'""'); return '"'+val+'"'; }).join(',') + '\n';
  });
  var blob = new Blob([csv], {type:'text/csv;charset=utf-8;'});
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = 'vendor_registry_' + new Date().toISOString().slice(0,10) + '.csv';
  document.body.appendChild(a); a.click();
  setTimeout(function(){ document.body.removeChild(a); URL.revokeObjectURL(url); }, 1000);
  showToast('Vendor registry exported!', 'success');
}

function viewVendorDetail(id) {
  const v = appState.vendors.find(function(v){ return v.id === id; });
  const rv = appState.rfpVendors ? appState.rfpVendors.find(function(v){ return v.id === id; }) : null;
  const vendor = v || rv;
  if (!vendor) return;

  // Helper: render a labelled field row (label on same line as value, never pushed to next line)
  function field(label, value, fullWidth) {
    var val = escHtml(value || '–');
    return '<div style="' + (fullWidth ? 'grid-column:1/-1;' : '') + 'min-width:0">'
      + '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:2px">' + label + '</div>'
      + '<div style="font-size:0.84rem;color:var(--cpc-ink);line-height:1.45;word-break:break-word">' + val + '</div>'
      + '</div>';
  }

  // Helper: render a section header divider
  function sectionHead(title) {
    return '<div style="grid-column:1/-1;border-top:1px solid var(--cpc-line);padding-top:0.75rem;margin-top:0.25rem">'
      + '<span style="font-size:0.68rem;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:var(--cpc-gold)">' + title + '</span>'
      + '</div>';
  }

  // Render semi-colon-separated items as tag pills (with optional spec translation)
  function tagList(str, translateTags) {
    if (!str) return '<span style="font-size:0.84rem;color:#9a8c78">–</span>';
    return str.split(';').filter(Boolean).map(function(s){
      var label = translateTags ? tSpec(s.trim()) : s.trim();
      return '<span class="tag" style="white-space:normal;max-width:none;word-break:break-word;margin-bottom:2px">' + escHtml(label) + '</span>';
    }).join('');
  }

  // Website link
  var websiteHtml = vendor.website
    ? '<a href="https://' + escHtml(vendor.website) + '" target="_blank" rel="noopener" style="font-size:0.84rem;color:var(--cpc-gold-deep);text-decoration:none">'
      + escHtml(vendor.website) + ' <i class="fas fa-external-link-alt" style="font-size:0.65rem"></i></a>'
    : '<span style="font-size:0.84rem;color:#9a8c78">–</span>';

  var websiteFieldHtml = '<div style="min-width:0">'
    + '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:2px">' + t('vfld_website') + '</div>'
    + websiteHtml + '</div>';

  // Founded badge
  var foundedStr = vendor.founded_year ? String(vendor.founded_year) : '–';

  var html = ''
    // ── Header ──
    + '<div style="display:flex;align-items:center;gap:0.875rem;margin-bottom:1.25rem">'
    +   '<div style="width:52px;height:52px;border-radius:12px;background:var(--cpc-ink);display:flex;align-items:center;justify-content:center;color:white;font-weight:700;font-size:1.35rem;flex-shrink:0">' + escHtml(vendor.name.charAt(0)) + '</div>'
    +   '<div style="min-width:0">'
    +     '<h3 style="font-size:1.05rem;font-weight:700;margin:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">' + escHtml(vendor.name) + '</h3>'
    +     '<div style="display:flex;align-items:center;gap:8px;margin-top:3px;flex-wrap:wrap">'
    +       '<span style="font-size:0.78rem;color:#6b7280">' + escHtml(tVendorCat(vendor.category||'')) + '</span>'
    +       (vendor.founded_year ? '<span style="font-size:0.72rem;background:var(--cpc-ivory);border:1px solid var(--cpc-line);border-radius:4px;padding:1px 7px;color:#74635a">' + t('vfld_est') + ' ' + foundedStr + '</span>' : '')
    +       (vendor.size ? '<span style="font-size:0.72rem;background:var(--cpc-ivory);border:1px solid var(--cpc-line);border-radius:4px;padding:1px 7px;color:#74635a">' + escHtml(tVendorSize(vendor.size)) + '</span>' : '')
    +     '</div>'
    +   '</div>'
    + '</div>'

    // ── Grid body ──
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:0.75rem 1.25rem;font-size:0.85rem;margin-bottom:0.5rem">'

    // Section: Company
    + sectionHead(t('vsec_company'))
    + field(t('vfld_country'), tVendorCountry(vendor.country))
    + field(t('vfld_hq'), vendor.hq_city)
    + websiteFieldHtml
    + field(t('vfld_revenue'), vendor.annual_revenue_usd)

    // Section: Contact
    + sectionHead(t('vsec_contact'))
    + field(t('vfld_contact_name'), vendor.contact_name)
    + '<div style="min-width:0">'
    +   '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:2px">' + t('vfld_contact_email') + ' <span style="font-size:0.68rem;color:#b8a898;font-weight:400;text-transform:none;letter-spacing:0">' + t('vfld_email_editable') + '</span></div>'
    +   '<div style="display:flex;gap:6px;align-items:center">'
    +     '<input id="vendorEmailInput_' + id + '" type="email" value="' + escHtml(vendor.contact_email||'') + '" '
    +     'style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:5px 8px;font-size:0.82rem;min-width:0" '
    +     'placeholder="email@vendor.com">'
    +     '<button class="btn-primary" style="padding:5px 12px;font-size:0.78rem;white-space:nowrap;flex-shrink:0" onclick="saveVendorEmail(' + id + ')"><i class="fas fa-save"></i>Save</button>'
    +   '</div>'
    +   '<div id="vendorEmailMsg_' + id + '" style="font-size:0.72rem;margin-top:3px"></div>'
    + '</div>'

    // Section: Technical Profile
    + sectionHead(t('vsec_tech_profile'))
    + '<div style="grid-column:1/-1;min-width:0">'
    +   '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:6px">' + t('vfld_platforms') + '</div>'
    +   '<div class="tag-group" style="flex-wrap:wrap;gap:4px">' + tagList(vendor.platforms, true) + '</div>'
    + '</div>'
    + '<div style="grid-column:1/-1;min-width:0">'
    +   '<div style="font-size:0.7rem;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:#9a8c78;margin-bottom:6px">' + t('vfld_specializations') + '</div>'
    +   '<div class="tag-group" style="flex-wrap:wrap;gap:4px">'
    +   (vendor.specializations||'').split(/[,;]/).filter(Boolean).map(function(s){
          return '<span class="tag" style="white-space:normal;max-width:none;word-break:break-word;margin-bottom:2px">' + escHtml(tSpec(s.trim())) + '</span>';
        }).join('')
    +   '</div>'
    + '</div>'
    + field(t('vfld_certifications'), vendor.certifications, true)

    // Section: Industry Experience
    + sectionHead(t('vsec_industry'))
    + field(t('vfld_exp_summary'), vendor.erp_experience, true)
    + field(t('vfld_pub_sector'), vendor.public_sector_refs, true)

    + '</div>' // end grid

    // ── Footer buttons (10.1 view/edit + 10.3 history) ──
    + '<div style="display:flex;gap:0.5rem;margin-top:0.75rem">'
    + '<button class="btn-ghost" style="flex:1" onclick="closeModal()">Close</button>'
    + '<button class="btn-secondary" style="padding:0.45rem 0.875rem;font-size:0.82rem" onclick="showVendorHistory(' + id + ')" title="View procurement history"><i class="fas fa-history"></i> History</button>'
    + '</div>';

  showModal(html);
}

// 10.3 — Vendor procurement history modal
async function showVendorHistory(vendorId) {
  var history = await apiCall('GET', '/vendors/' + vendorId + '/history').catch(function(){ return []; });
  if (!history.length) {
    showToast('No procurement history found for this vendor.', 'info');
    return;
  }
  var rows = history.map(function(h) {
    var badge = h.awarded_at
      ? '<span style="background:#d1fae5;color:#065f46;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700"><i class="fas fa-trophy" style="margin-right:0.25rem"></i>Awarded</span>'
      : (h.submitted_at
          ? '<span style="background:#dbeafe;color:#1e40af;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700">Submitted</span>'
          : '<span style="background:#f3f4f6;color:#6b7280;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700">Invited</span>');
    return '<tr><td style="font-size:0.82rem;font-weight:600;padding:0.5rem 0.25rem">' + escHtml(h.title||'') + '</td>'
      + '<td style="font-size:0.78rem;color:#9ca3af;font-family:JetBrains Mono,monospace;padding:0.5rem 0.25rem">' + escHtml(h.ref_number||'') + '</td>'
      + '<td style="padding:0.5rem 0.25rem">' + badge + '</td></tr>';
  }).join('');
  showModal(
    '<h3 style="margin:0 0 1rem;font-size:1rem;font-weight:700"><i class="fas fa-history cpc-gold" style="margin-right:0.5rem"></i>Procurement History</h3>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;min-width:360px">'
    + '<thead><tr>'
    + '<th style="text-align:left;font-size:0.72rem;text-transform:uppercase;color:#9ca3af;padding-bottom:0.5rem;border-bottom:1px solid #e5e7eb">RFP Title</th>'
    + '<th style="text-align:left;font-size:0.72rem;text-transform:uppercase;color:#9ca3af;padding-bottom:0.5rem;border-bottom:1px solid #e5e7eb">Ref #</th>'
    + '<th style="text-align:left;font-size:0.72rem;text-transform:uppercase;color:#9ca3af;padding-bottom:0.5rem;border-bottom:1px solid #e5e7eb">Status</th>'
    + '</tr></thead><tbody>' + rows + '</tbody></table></div>'
    + '<div style="display:flex;justify-content:flex-end;margin-top:1rem"><button class="btn-ghost" onclick="closeModal()">Close</button></div>'
  );
}

// 6.2 — Vendor hover card
function showVendorHoverCard(event, vendorId) {
  var card = document.getElementById('vendorHoverCard');
  if (!card) return;
  var v = (appState.vendors||[]).find(function(v){ return v.id === vendorId; })
       || (appState.rfpVendors||[]).find(function(v){ return v.id === vendorId; });
  if (!v) return;
  var specs = (v.specializations||'').split(',').filter(Boolean).slice(0,3).map(function(s){ return '<span class="tag" style="font-size:0.7rem">' + escHtml(s.trim()) + '</span>'; }).join('');
  card.innerHTML = '<div style="font-weight:700;font-size:0.9rem;color:var(--cpc-ink);margin-bottom:4px">' + escHtml(v.name) + '</div>'
    + '<div style="font-size:0.75rem;color:#6b7280;margin-bottom:6px">' + escHtml(tVendorCat(v.category||'')) + ' &bull; ' + escHtml(tVendorCountry(v.country||'')) + '</div>'
    + (specs ? '<div class="tag-group" style="gap:3px;flex-wrap:wrap">' + specs + '</div>' : '')
    + (v.contact_email ? '<div style="font-size:0.72rem;color:#9ca3af;margin-top:6px"><i class="fas fa-envelope" style="margin-right:0.25rem"></i>' + escHtml(v.contact_email) + '</div>' : '');
  var rect = event.currentTarget.getBoundingClientRect();
  card.style.top = (rect.bottom + window.scrollY + 4) + 'px';
  card.style.left = Math.min(rect.left + window.scrollX, window.innerWidth - 260) + 'px';
  card.classList.add('visible');
}
function hideVendorHoverCard() {
  var card = document.getElementById('vendorHoverCard');
  if (card) card.classList.remove('visible');
}

async function saveVendorEmail(vendorId) {
  const input = document.getElementById('vendorEmailInput_' + vendorId);
  const msgEl = document.getElementById('vendorEmailMsg_' + vendorId);
  if (!input) return;
  const newEmail = (input.value || '').trim();
  if (!newEmail || !newEmail.includes('@')) {
    if (msgEl) { msgEl.style.color='#dc2626'; msgEl.textContent='Please enter a valid email address.'; }
    return;
  }
  try {
    if (msgEl) { msgEl.style.color='#6b7280'; msgEl.textContent='Saving...'; }
    const result = await apiCall('PUT', '/vendors/' + vendorId, { contact_email: newEmail });
    if (result.ok) {
      // Update local state
      var v = appState.vendors ? appState.vendors.find(function(v){ return v.id === vendorId; }) : null;
      if (v) v.contact_email = newEmail;
      var rv = appState.rfpVendors ? appState.rfpVendors.find(function(v){ return v.id === vendorId; }) : null;
      if (rv) rv.contact_email = newEmail;
      if (msgEl) { msgEl.style.color='#065f46'; msgEl.textContent='✓ Email updated successfully.'; }
      showToast('Vendor email updated successfully.', 'success');
    } else {
      if (msgEl) { msgEl.style.color='#dc2626'; msgEl.textContent = result.error || 'Failed to save.'; }
    }
  } catch(e) {
    if (msgEl) { msgEl.style.color='#dc2626'; msgEl.textContent='Error: ' + e.message; }
  }
}

// ============================================================
// PAGE: REPORTS
// ============================================================
pages.reports = async function() {
  let stats;
  try {
    stats = await apiCall('GET', '/stats');
  } catch(e) {
    stats = {};
  }

  // 12.1 — stage funnel
  var stageBreakdown = stats.stageBreakdown || [];
  var funnelHtml = '';
  if (stageBreakdown.length > 0) {
    var maxCnt = stageBreakdown.reduce(function(m,s){ return Math.max(m,s.cnt); },1);
    funnelHtml = stageBreakdown.map(function(s){
      var pct = Math.round((s.cnt/maxCnt)*100);
      return '<div style="margin-bottom:0.625rem">'
        + '<div style="display:flex;justify-content:space-between;font-size:0.78rem;color:#374151;margin-bottom:3px"><span>' + stageLabelMap(s.stage) + '</span><span style="font-weight:700">' + s.cnt + '</span></div>'
        + '<div style="height:10px;border-radius:5px;background:#e5e7eb;overflow:hidden">'
        + '<div style="height:100%;background:linear-gradient(90deg,var(--cpc-ink),var(--cpc-gold));width:' + pct + '%;border-radius:5px;transition:width 0.5s ease"></div>'
        + '</div></div>';
    }).join('');
  } else {
    funnelHtml = '<div style="color:#9ca3af;font-size:0.82rem;padding:1rem;text-align:center">No data yet</div>';
  }

  // Vendor performance table from proposals data
  var rfps = appState.rfps || [];
  var vendorPerf = {};
  rfps.forEach(function(r){ if(r.awarded_vendor){ if(!vendorPerf[r.awarded_vendor]) vendorPerf[r.awarded_vendor]={name:r.awarded_vendor,wins:0}; vendorPerf[r.awarded_vendor].wins++; } });
  var vendorRows = Object.values(vendorPerf).sort(function(a,b){ return b.wins-a.wins; }).slice(0,10).map(function(v,i){
    return '<tr><td style="padding:6px 10px;font-size:0.82rem">' + (i+1) + '</td><td style="padding:6px 10px;font-size:0.82rem;font-weight:600">' + escHtml(v.name) + '</td><td style="padding:6px 10px;text-align:center"><span style="background:#d1fae5;color:#065f46;border-radius:10px;padding:1px 8px;font-size:0.78rem;font-weight:700">' + v.wins + '</span></td></tr>';
  }).join('') || '<tr><td colspan="3" style="padding:1rem;text-align:center;color:#9ca3af;font-size:0.82rem">No awarded contracts yet</td></tr>';

  setContent(
    '<div class="space-y-4">'
    + '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:0.875rem">'
    + '<div class="stat-card"><div class="stat-label">Total RFPs</div><div class="stat-value" style="color:var(--cpc-ink)">' + (stats.totalRfps||0) + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Win Rate</div><div class="stat-value" style="color:var(--cpc-gold)">' + (stats.winRate||0) + '%</div></div>'
    + '<div class="stat-card"><div class="stat-label">Avg Duration</div><div class="stat-value" style="color:#065f46">' + (stats.avgDuration ? stats.avgDuration + 'd' : 'N/A') + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Vendors</div><div class="stat-value" style="color:var(--cpc-gold-deep)">' + (stats.totalVendors||0) + '</div></div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:1.25rem">'
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;font-size:0.9rem;color:#1f2937;margin:0 0 1rem"><i class="fas fa-filter cpc-gold" style="margin-right:0.5rem"></i>RFP Stage Funnel</h3>'
    + funnelHtml
    + '</div>'
    + '<div class="card" style="padding:1.25rem">'
    + '<h3 style="font-weight:700;font-size:0.9rem;color:#1f2937;margin:0 0 1rem"><i class="fas fa-trophy cpc-gold" style="margin-right:0.5rem"></i>Top Vendors by Awards</h3>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse">'
    + '<thead><tr style="background:#f9fafb"><th style="padding:6px 10px;text-align:left;font-size:0.75rem;color:#9ca3af">#</th><th style="padding:6px 10px;text-align:left;font-size:0.75rem;color:#9ca3af">Vendor</th><th style="padding:6px 10px;text-align:center;font-size:0.75rem;color:#9ca3af">Wins</th></tr></thead>'
    + '<tbody>' + vendorRows + '</tbody></table></div>'
    + '</div>'
    + '</div>'
    + '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:0.875rem">'
    + '<div class="stat-card"><div class="stat-label">Total Proposals</div><div class="stat-value" style="color:var(--cpc-gold-deep)">' + (stats.totalProposals||0) + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Emails Sent</div><div class="stat-value" style="color:var(--cpc-ink)">' + (stats.totalEmails||0) + '</div></div>'
    + '<div class="stat-card"><div class="stat-label">Awarded</div><div class="stat-value" style="color:#065f46">' + (stats.awardedRfps||0) + '</div></div>'
    + '</div>'
    + '</div>'
  );
};

// ============================================================
// PAGE: SETTINGS (11.3 — configurable categories, accessible to all)
// ============================================================
var _settingsCategories = null;
var DEFAULT_CATEGORIES = ['IT & Digital Transformation','Consulting Services','Infrastructure','Professional Services','Data & Analytics'];

async function getSettingsCategories() {
  if (_settingsCategories) return _settingsCategories;
  try {
    var res = await apiCall('GET', '/settings/categories');
    _settingsCategories = res.categories || DEFAULT_CATEGORIES;
  } catch(e) {
    _settingsCategories = DEFAULT_CATEGORIES;
  }
  return _settingsCategories;
}

pages.settings = async function() {
  var cats = await getSettingsCategories();
  var procEmail = '';
  try { var s = await apiCall('GET', '/settings'); procEmail = s.procurement_email || ''; } catch(e) {}

  setContent(
    '<div style="max-width:680px;margin:0 auto;display:flex;flex-direction:column;gap:1.5rem">'
    // Categories section
    + '<div class="card" style="padding:1.5rem">'
    + '<h3 style="font-weight:700;font-size:1rem;color:#1f2937;margin:0 0 0.25rem"><i class="fas fa-tag cpc-gold" style="margin-right:8px"></i>Procurement Categories</h3>'
    + '<p style="font-size:0.82rem;color:#9ca3af;margin:0 0 1rem">These categories appear in the Create RFP and Generate tab dropdowns.</p>'
    + '<div id="settingsCatList" style="display:flex;flex-direction:column;gap:0.5rem;margin-bottom:1rem">'
    + cats.map(function(c, i){
        return '<div style="display:flex;align-items:center;gap:0.5rem;padding:6px 10px;background:#f9fafb;border:1px solid #e5e7eb;border-radius:6px">'
          + '<span style="flex:1;font-size:0.85rem">' + escHtml(c) + '</span>'
          + '<button class="btn-ghost btn-sm" onclick="removeSettingsCategory(' + i + ')" style="color:#dc2626;padding:2px 8px"><i class="fas fa-times"></i></button>'
          + '</div>';
      }).join('')
    + '</div>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<input id="settingsNewCat" type="text" placeholder="Add new category…" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:0.84rem">'
    + '<button class="btn-primary" onclick="addSettingsCategory()"><i class="fas fa-plus"></i>Add</button>'
    + '</div>'
    + '<button class="btn-primary" style="margin-top:1rem;width:100%" onclick="saveSettingsCategories()"><i class="fas fa-save"></i>Save Categories</button>'
    + '</div>'
    // Procurement email section
    + '<div class="card" style="padding:1.5rem">'
    + '<h3 style="font-weight:700;font-size:1rem;color:#1f2937;margin:0 0 0.25rem"><i class="fas fa-envelope cpc-gold" style="margin-right:8px"></i>Procurement Team Email</h3>'
    + '<p style="font-size:0.82rem;color:#9ca3af;margin:0 0 0.75rem">Shown on the vendor portal\x27s declined message as a contact address.</p>'
    + '<div style="display:flex;gap:0.5rem">'
    + '<input id="settingsProcEmail" type="email" value="' + escHtml(procEmail) + '" placeholder="procurement@example.com" style="flex:1;border:1px solid #d1d5db;border-radius:6px;padding:6px 10px;font-size:0.84rem">'
    + '<button class="btn-primary" onclick="saveProcurementEmail()"><i class="fas fa-save"></i>Save</button>'
    + '</div>'
    + '</div>'
    + '</div>'
  );
};

var _settingsCatsEditing = null;
function removeSettingsCategory(i) {
  if (!_settingsCatsEditing) _settingsCatsEditing = (_settingsCategories || DEFAULT_CATEGORIES).slice();
  _settingsCatsEditing.splice(i, 1);
  _settingsCategories = _settingsCatsEditing;
  pages.settings();
}
function addSettingsCategory() {
  var inp = document.getElementById('settingsNewCat');
  if (!inp || !inp.value.trim()) return;
  if (!_settingsCatsEditing) _settingsCatsEditing = (_settingsCategories || DEFAULT_CATEGORIES).slice();
  _settingsCatsEditing.push(inp.value.trim());
  _settingsCategories = _settingsCatsEditing;
  inp.value = '';
  pages.settings();
}
async function saveSettingsCategories() {
  var cats = _settingsCategories || _settingsCatsEditing || DEFAULT_CATEGORIES;
  try {
    await apiCall('PUT', '/settings/categories', { categories: cats });
    _settingsCatsEditing = null;
    showToast('Categories saved!', 'success');
  } catch(e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}
async function saveProcurementEmail() {
  var email = (document.getElementById('settingsProcEmail')||{}).value || '';
  try {
    await apiCall('PUT', '/settings', { procurement_email: email });
    showToast('Procurement email saved!', 'success');
  } catch(e) {
    showToast('Save failed: ' + e.message, 'error');
  }
}

// ============================================================
// CREATE RFP MODAL (two-step: step 1 = title + arch doc, step 2 = details)
// ============================================================
var _createRfpDocFiles = [];   // array of { slotId, file, label }

function showCreateRfpModal() {
  _createRfpDocFiles = [];
  showModal(
    // Header
    '<div style="display:flex;align-items:center;gap:0.75rem;margin-bottom:1rem">'
    + '<div style="width:36px;height:36px;border-radius:50%;background:var(--cpc-gold);display:flex;align-items:center;justify-content:center;color:white;flex-shrink:0">'
    + '<i class="fas fa-file-circle-plus" style="font-size:1rem"></i></div>'
    + '<div><h3 style="font-size:1rem;font-weight:700;margin:0">Create New RFP</h3>'
    + '<div style="font-size:0.72rem;color:#9ca3af">Enter project basics and optionally upload supporting documents. You will fill in detailed requirements on the <strong>Generate tab</strong> after creation.</div>'
    + '</div></div>'

    // Title
    + '<div class="form-group" style="margin-bottom:0.625rem"><label>Project Title *</label>'
    + '<input id="newRfpTitle" placeholder="e.g. CRM Modernisation, Fraud Detection Platform, Data Warehouse..."></div>'

    // Category / Budget / Deadline in one row
    + '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:0.625rem;margin-bottom:0.75rem">'
    + '<div class="form-group" style="margin:0"><label>Category</label><select id="newRfpCat">'
    + (_settingsCategories || DEFAULT_CATEGORIES).map(function(c){ return '<option>' + c + '</option>'; }).join('')
    + '</select></div>'
    + '<div class="form-group" style="margin:0"><label>Budget (AED)</label><input id="newRfpBudget" placeholder="5,000,000"></div>'
    + '<div class="form-group" style="margin:0"><label>Deadline</label><input type="date" id="newRfpDeadline" value="' + getDateOffset(30) + '"></div>'
    + '</div>'

    // Two upload slots
    + '<div style="margin-bottom:1rem">'
    + '<label style="display:flex;align-items:center;gap:6px;font-size:0.82rem;font-weight:600;color:#374151;margin-bottom:0.5rem">'
    + '<i class="fas fa-file-pdf" style="color:#dc2626"></i>Supporting Documents'
    + '<span style="font-weight:400;color:#9ca3af;font-size:0.72rem;margin-left:4px">— Optional. AI will read these during generation.</span></label>'
    + buildDocUploadSlot('doc0', 'Conceptual Solution Architecture', 'fa-sitemap', '#BA9765')
    + buildDocUploadSlot('doc1', 'Business Requirements Document', 'fa-clipboard-list', '#745B35')
    + '</div>'

    // Action buttons
    + '<div style="display:flex;gap:0.5rem">'
    + '<button class="btn-primary" id="createRfpBtn" style="flex:1" onclick="createRfp()"><i class="fas fa-rocket"></i>Create RFP</button>'
    + '<button class="btn-ghost" onclick="closeModal()">Cancel</button>'
    + '</div>'
  );
}

function buildDocUploadSlot(slotId, docLabel, icon, color) {
  return '<div id="slot-wrap-' + slotId + '" onclick="document.getElementById(\x27file-' + slotId + '\x27).click()" '
    + 'style="border:2px dashed #d1d5db;border-radius:8px;padding:0.625rem 0.875rem;display:flex;align-items:center;gap:0.75rem;cursor:pointer;transition:border-color 0.2s;background:#fafafa;margin-bottom:0.5rem" '
    + 'onmouseover="this.style.borderColor=\x27' + color + '\x27" onmouseout="if(!document.getElementById(\x27file-' + slotId + '\x27).files.length){this.style.borderColor=\x27#d1d5db\x27}">'
    + '<div style="width:30px;height:30px;border-radius:7px;background:' + color + '18;display:flex;align-items:center;justify-content:center;flex-shrink:0">'
    + '<i class="fas ' + icon + '" style="color:' + color + ';font-size:0.82rem"></i></div>'
    + '<div style="flex:1;min-width:0">'
    + '<div style="font-size:0.78rem;font-weight:600;color:#374151">' + docLabel + '</div>'
    + '<div id="slot-label-' + slotId + '" style="font-size:0.7rem;color:#9ca3af">Click to upload PDF (optional)</div>'
    + '</div>'
    + '<i class="fas fa-cloud-upload-alt" id="slot-icon-' + slotId + '" style="color:#d1d5db;font-size:1rem"></i>'
    + '</div>'
    + '<input type="file" id="file-' + slotId + '" accept=".pdf" style="display:none" onchange="handleDocSlotSelect(\x27' + slotId + '\x27,\x27' + docLabel + '\x27,event)">';
}

function handleDocSlotSelect(slotId, docLabel, event) {
  const file = event.target.files[0];
  if (!file) return;
  _createRfpDocFiles = _createRfpDocFiles.filter(function(d){ return d.slotId !== slotId; });
  _createRfpDocFiles.push({ slotId: slotId, file: file, label: docLabel });
  var labelEl = document.getElementById('slot-label-' + slotId);
  var iconEl  = document.getElementById('slot-icon-' + slotId);
  var wrapEl  = document.getElementById('slot-wrap-' + slotId);
  if (labelEl) labelEl.innerHTML = '<strong style="color:#065f46">' + escHtml(file.name) + '</strong> &bull; ' + (file.size/1024).toFixed(1) + ' KB';
  if (iconEl)  { iconEl.className = 'fas fa-check-circle'; iconEl.style.color = '#065f46'; }
  if (wrapEl)  wrapEl.style.borderColor = '#065f46';
}

async function createRfp() {
  const title = (document.getElementById('newRfpTitle') ? document.getElementById('newRfpTitle').value : '').trim();
  if (!title) { showToast('Please enter a project title', 'error'); return; }

  const btn = document.getElementById('createRfpBtn');
  setLoading(btn, true, 'Creating...');
  try {
    // 1. Create RFP record (no detail fields yet — user fills them on Generate tab)
    const rfpBody = {
      title: title,
      category: document.getElementById('newRfpCat') ? document.getElementById('newRfpCat').value : 'IT & Digital Transformation',
      budget: document.getElementById('newRfpBudget') ? document.getElementById('newRfpBudget').value : '',
      deadline: document.getElementById('newRfpDeadline') ? document.getElementById('newRfpDeadline').value : '',
      scope: '', background: '', objectives: '', tech_requirements: '',
    };
    const rfp = await apiCall('POST', '/rfps', rfpBody);

    // 2. Upload supporting documents if any
    if (_createRfpDocFiles.length > 0) {
      setLoading(btn, true, 'Uploading ' + _createRfpDocFiles.length + ' doc(s)...');
      for (var di = 0; di < _createRfpDocFiles.length; di++) {
        var docEntry = _createRfpDocFiles[di];
        try {
          const fd = new FormData();
          fd.append('file', docEntry.file);
          fd.append('doc_label', docEntry.label);
          await fetch(API + '/rfps/' + rfp.id + '/upload-arch-doc', { method: 'POST', body: fd });
        } catch(uploadErr) {
          showToast('Could not upload "' + docEntry.label + '"', 'info', 3000);
        }
      }
      if (_createRfpDocFiles.length > 0) {
        showToast(_createRfpDocFiles.length + ' document(s) uploaded — AI will use them during generation.', 'success', 4000);
      }
    }

    // 3. Close modal and go to Generate tab — user fills in details and hits Generate
    closeModal();
    _createRfpDocFiles = [];
    showToast('RFP "' + title + '" created. Fill in details and click Generate with AI.', 'success', 5000);
    navigateTo('rfp_detail', { rfpId: rfp.id, tab: 'generate' });
  } catch(e) {
    setLoading(btn, false);
  }
}

// ============================================================
// START
// ============================================================
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
