"""The approved placeholder list. Uploaded templates may use these as plain {{ field }} tags only."""

FIRM = ["firm_name", "firm_address", "firm_phone", "firm_email"]
JOB = ["client_name", "client_address", "site_address", "work_area", "quote_reference", "item_no", "design_no",
       "compliance_standard", "date", "date_of_erection", "start_date", "duration",
       "supervisor_name", "supervisor_phone", "emergency_contact_name", "emergency_contact_phone",
       "working_days_a", "working_hours_a", "working_days_b", "working_hours_b", "manpower",
       "prepared_by_name", "prepared_by_signature"]
HANDOVER = ["scaffold_type", "permitted_use", "loading_class", "max_loaded_platforms", "restrictions",
            "max_leg_load_kn", "add_ons_permitted", "inspecting_party", "inspection_responsible_name",
            "inspection_responsible_phone", "next_inspection_due", "certificate_ref", "handover_date",
            "issued_by_name", "issued_by_position", "issued_by_signature", "issued_at",
            "confirmed_by_name", "confirmed_by_role", "confirmed_by_company", "confirmed_by_signature",
            "confirmed_at", "acceptance_method_text", "signed_ip"]
INSPECTION = ["report_ref", "inspection_type", "inspected_at", "previous_inspection_at", "weather",
              "scaffold_ref", "outcome", "tag_updated", "copies_sent_to", "signed_at",
              "inspector_name", "inspector_position", "inspector_qualification", "inspector_signature"]
QUOTE = ["quote_number", "quote_date", "valid_until", "valid_days", "job_reference", "subtotal",
         "vat_number", "vat_rate", "vat_amount", "total", "hire_included_weeks"]

APPROVED = set(FIRM + JOB + HANDOVER + INSPECTION + QUOTE)
CORE = ["client_name", "site_address", "date", "work_area", "prepared_by_name"]

REQUIRED = {
    "method_statement": FIRM[:1] + ["client_name", "site_address", "work_area", "date", "quote_reference",
                         "compliance_standard", "design_no", "supervisor_name", "supervisor_phone",
                         "emergency_contact_name", "emergency_contact_phone", "start_date", "manpower",
                         "prepared_by_name"],
    "risk_assessment": FIRM[:1] + ["client_name", "site_address", "work_area", "date", "date_of_erection",
                        "quote_reference", "item_no", "compliance_standard", "prepared_by_name"],
    "handover": ["certificate_ref", "client_name", "site_address", "work_area", "scaffold_type",
                 "permitted_use", "loading_class", "max_loaded_platforms", "inspecting_party",
                 "inspection_responsible_name", "next_inspection_due", "handover_date", "issued_by_name"],
    "inspection": ["client_name", "client_address", "site_address", "scaffold_ref", "inspection_type",
                   "inspected_at", "outcome", "inspector_name", "inspector_position"],
    "quote": ["firm_name", "client_name", "site_address", "quote_number", "total"],
}

INSPECTION_CHECKLIST = [
    "Foundations and base plates", "Standards", "Ledgers and transoms", "Bracing", "Ties",
    "Working platforms and boards", "Edge protection (guardrails and toeboards)", "Access and egress",
    "Loading within the permitted class", "Fittings and couplers", "Protection (netting, sheeting, fans)",
    "Public and site protection", "Alterations since the last inspection", "Services (overhead lines, etc.)",
    "Scaffold tag",
]
