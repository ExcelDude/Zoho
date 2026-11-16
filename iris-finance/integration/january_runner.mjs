import {buildJanuaryRentCandidates,loadIrisSnapshot} from './iris_readonly_adapter.mjs';
import {IntegrationEngine} from './engine.mjs';
/** Orchestrate one read-only source inspection and event dry run; store is injected. */
export async function runJanuaryDryRun({listRecords,store,period='2027-01',snapshotAt,controlsForCandidate}){
 if(typeof controlsForCandidate!=='function')throw Error('APPROVAL_GATE_RESOLVER_REQUIRED');
 const data=await loadIrisSnapshot({listRecords});
 const analysis=buildJanuaryRentCandidates({...data,period,snapshotAt});
 const engine=new IntegrationEngine({store,clock:()=>snapshotAt});
 const results=[];
 for(const c of analysis.candidates){
  const incoming=await engine.ingest(c.event);
  let controls=controlsForCandidate(c);
  if(!controls||typeof controls!=='object')throw Error('CONTROL_RESOLUTION_FAILED');
  // Source-level exceptions are mandatory holds, even if caller claims all other approvals.
  if(c.issues.length)controls={...controls,sourceDataVerified:false};
  // A 'verified' identity can't be inferred from an owner UUID; enforce external proof.
  if(controls.independentIdentityEvidence!==true)controls={...controls,ownerOrTenantIdentityVerified:false};
  if(controls.rentChargePolicyApproved!==true)controls={...controls,reviewedApproval:false};
  const processed=await engine.process(incoming.eventKey,{controls});
  results.push({leaseId:c.leaseId,eventKey:incoming.eventKey,status:processed.status,sourceIssues:c.issues,blocking:processed.projection?.blocking||[],duplicated:incoming.duplicate,financialWrite:false});
 }
 return {period,snapshotAt,sourceCounts:analysis.sourceCounts,scheduledRentCents:analysis.summary.scheduledRentCents,rentCandidates:analysis.summary.rentCandidates,
  blocked:results.filter(r=>r.status==='HOLD').length,previews:results.filter(r=>r.status==='PREVIEW_READY').length,
  exceptions:analysis.exceptions,results,financialWrites:0,sendAllowed:false,paymentAllowed:false};
}
