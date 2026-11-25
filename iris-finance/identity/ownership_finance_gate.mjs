/** Read-only finance gate for Propra -> Iris property/unit/owner crosswalks.
 * Candidates never become approvals through matching alone.
 * No network calls, database writes or Books posting.
 */
const approved = x => x === 'APPROVED';
const nonblank = x => typeof x === 'string' && x.trim().length > 0;
export function assessOwnershipForFinance({property, unitCrosswalks = [], ownership = [], ownerCrosswalks = []}) {
  if (!property || !nonblank(property.id)) throw new TypeError('IRIS_PROPERTY_ID_REQUIRED');
  const issues = [];
  const activeManaged = property.management_status === 'active';
  if (!activeManaged) issues.push('NOT_ACTIVE_MANAGEMENT');
  const unit = unitCrosswalks.filter(x => x.iris_property_id === property.id);
  if (unit.length !== 1) issues.push(unit.length ? 'AMBIGUOUS_UNIT_MAPPING' : 'MISSING_UNIT_MAPPING');
  const candidate = unit.length === 1 ? unit[0] : null;
  if (candidate && !approved(candidate.approval)) issues.push('UNIT_MAPPING_UNAPPROVED');
  if (candidate && (!nonblank(candidate.propra_unit_id) || !nonblank(candidate.propra_property_id)))
    issues.push('INCOMPLETE_PROPRA_UNIT_IDENTITY');
  if (candidate && !nonblank(candidate.unit_number)) issues.push('UNIT_NUMBER_NOT_VERIFIED');
  if (candidate && !nonblank(candidate.evidence_ref)) issues.push('UNIT_EVIDENCE_MISSING');
  const shares = ownership.filter(x => x.property_id === property.id);
  if (!shares.length) issues.push('MISSING_OWNERSHIP');
  let total = 0;
  const ids = new Set();
  for (const share of shares) {
    if (!nonblank(share.owner_id) || ids.has(share.owner_id)) issues.push('INVALID_OR_DUPLICATE_OWNER');
    ids.add(share.owner_id);
    if (!Number.isInteger(share.basis_points) || share.basis_points <= 0 || share.basis_points > 10000)
      issues.push('INVALID_OWNER_SHARE');
    else total += share.basis_points;
    if (!approved(share.approval) || !nonblank(share.evidence_ref))
      issues.push('OWNERSHIP_NOT_APPROVED');
    const owners = ownerCrosswalks.filter(o => o.iris_owner_id === share.owner_id);
    if (owners.length !== 1 || !approved(owners[0].approval) ||
      !nonblank(owners[0].propra_owner_id) || !nonblank(owners[0].evidence_ref))
      issues.push('OWNER_IDENTITY_NOT_APPROVED');
    if (candidate && owners.length === 1 && nonblank(candidate.propra_owner_id) &&
      candidate.propra_owner_id !== owners[0].propra_owner_id)
      issues.push('UNIT_OWNER_IDENTITY_CONFLICT');
  }
  if (shares.length && total !== 10000) issues.push('OWNERSHIP_NOT_100_PERCENT');
  const uniqueIssues = [...new Set(issues)];
  return {
    irisPropertyId: property.id,
    status: uniqueIssues.length ? 'HOLD' : 'IDENTITY_REVIEW_PASSED',
    issues: uniqueIssues,
    ownerShareBasisPoints: total,
    postingAllowed: false,
    payoutAllowed: false,
    financialWrites: 0
  };
}
