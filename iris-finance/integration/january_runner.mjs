import {buildJanuaryRentCandidates,loadIrisSnapshot} from './iris_readonly_adapter.mjs';
import {IntegrationEngine} from './engine.mjs';
import {assessOwnershipForFinance} from '../identity/ownership_finance_gate.mjs';
/** Orchestrate one read-only source inspection and event dry run; store is injected. */
export async function runJanuaryDryRun({listRecords,store,period='2027-01',snapshotAt,controlsForCandidate,ownershipEvidenceForCandidate}){
 if(typeof controlsForCandidate!=='function')throw Error('APPROVAL_GATE_RESOLVER_REQUIRED');
 const data=await loadIrisSnapshot({listRecords});
 const analysis=buildJanuaryRentCandidates({...data,period,snapshotAt});
 const engine=new IntegrationEngine({store,clock:()=>snapshotAt});
 const results=[];
 for(const c of analysis.candidates){
  const incoming=await engine.ingest(c.event);
  // Fail closed without independently reviewed unit and owner evidence.
  const property=data.properties.find(p=>p.id===c.propertyId);
  const shares=data.property_ownership.filter(x=>x.property_id===c.propertyId).map(x=>({
    property_id:x.property_id,owner_id:x.owner_id,
    basis_points:Number.isFinite(Number(x.ownership_percentage)) ? Math.round(Number(x.ownership_percentage)*100) : NaN,
    approval:'NOT APPROVED',evidence_ref:null
  }));
  const evidence=typeof ownershipEvidenceForCandidate==='function' ? ownershipEvidenceForCandidate(c) : null;
  const review=assessOwnershipForFinance({
    property,
    ownership:Array.isArray(evidence?.approvedOwnership) ? evidence.approvedOwnership : shares,
    unitCrosswalks:Array.isArray(evidence?.unitCrosswalks) ? evidence.unitCrosswalks : [],
    ownerCrosswalks:Array.isArray(evidence?.ownerCrosswalks) ? evidence.ownerCrosswalks : []
  });
  let controls=controlsForCandidate(c);
  if(!controls||typeof controls!=='object')throw Error('CONTROL_RESOLUTION_FAILED');
  // Source-level exceptions are mandatory holds, even if caller claims all other approvals.
  if(c.issues.length)controls={...controls,sourceDataVerified:false};
  if(review.status!=='IDENTITY_REVIEW_PASSED')controls={...controls,ownerOrTenantIdentityVerified:false};
  // A 'verified' identity can't be inferred from an owner UUID; enforce external proof.
  if(controls.independentIdentityEvidence!==true)controls={...controls,ownerOrTenantIdentityVerified:false};
  if(controls.rentChargePolicyApproved!==true)controls={...controls,reviewedApproval:false};
  const processed=await engine.process(incoming.eventKey,{controls});
  results.push({leaseId:c.leaseId,eventKey:incoming.eventKey,status:processed.status,sourceIssues:c.issues,ownershipReview:review,blocking:processed.projection?.blocking||[],duplicated:incoming.duplicate,financialWrite:false});
 }
 return {period,snapshotAt,sourceCounts:analysis.sourceCounts,scheduledRentCents:analysis.summary.scheduledRentCents,rentCandidates:analysis.summary.rentCandidates,
  blocked:results.filter(r=>r.status==='HOLD').length,previews:results.filter(r=>r.status==='PREVIEW_READY').length,
  exceptions:[...analysis.exceptions,...results.filter(r=>r.ownershipReview.issues.length).flatMap(r=>r.ownershipReview.issues.map(reason=>({leaseId:r.leaseId,reason,source:'OWNERSHIP_REVIEW'})))],results,financialWrites:0,sendAllowed:false,paymentAllowed:false};
}
