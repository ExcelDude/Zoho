# Iris WorkDrive Agreement Reference Linking — No Finance Writes
This module accepts a caller-provided snapshot of Iris `owner_contacts`, `properties`, `property_ownership`, and `workdrive_agreements` and produces a review-only association.
- Property-folder address matching strips an optional leading numeric suite code and normalizes common street suffix spellings. It does not verify exact suite numbers. Consequently, even unique street matches require a human review of the document itself.
- Owner-name matches must be unique. If multiple properties share a normalized street, the owner-property relationship can narrow down candidates, but the result remains review-only.
- Neither `OWNER_AND_PROPERTY_UNIQUE_REFERENCE` nor any other category confirms that an agreement is signed, effective, applicable to a specific tenancy, superseded, or governing a fee.
- Actual PDF bytes are unavailable in Iris's metadata API. WorkDrive needs a separate authorized readable connection or a document export from MJ; Google Drive and Zoho WorkDrive are not equivalent storage providers.
- No owner identity, contact email, or contract data is embedded in repository files; test fixtures are synthetic.
- Never automatically create a Books customer, fee invoice, payout, or owner mapping based on this output.
