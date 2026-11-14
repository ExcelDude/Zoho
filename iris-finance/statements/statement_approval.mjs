import {createHash} from "node:crypto";
const stable=v=>Array.isArray(v)?"["+v.map(stable).join(",")+"]":v&&typeof v==="object"?"{"+Object.keys(v).sort().map(k=>JSON.stringify(k)+":"+stable(v[k])).join(",")+"}":JSON.stringify(v);
const hash=v=>createHash("sha256").update(stable(v)).digest("hex");
const safe={sendAllowed:false,publishAllowed:false,financialPostingAllowed:false};
export function prepareStatement({statement,preparedBy,time,previousVersions=[]}){
 if(!statement?.ownerId||!/^\d{4}-(0[1-9]|1[0-2])$/.test(statement.period||""))throw Error("INVALID_IDENTITY");
 if(!preparedBy?.id||preparedBy.role!=="BOOKKEEPER"||!time)throw Error("PREPARER_REQUIRED");
 const versions=previousVersions.filter(v=>v.ownerId===statement.ownerId&&v.period===statement.period).map(v=>v.version);
 if(new Set(versions).size!==versions.length||versions.some(v=>!Number.isSafeInteger(v)||v<1))throw Error("VERSION_HISTORY_AMBIGUOUS");
 const snapshot=JSON.parse(JSON.stringify(statement)),statementHash=hash(snapshot),version=Math.max(0,...versions)+1,issues=[];
 if(snapshot.status!=="PREVIEW_READY_FOR_INTERNAL_REVIEW"||snapshot.issues?.length)issues.push("SOURCE_STATEMENT_NOT_CLEARED");
 if(snapshot.sendAllowed!==false||snapshot.postingAllowed!==false||snapshot.availableForOwner!==false)issues.push("UNSAFE_SOURCE_FLAGS");
 if(!Array.isArray(snapshot.properties)||!snapshot.properties.length||!snapshot.totals)issues.push("INCOMPLETE_LEDGER_DETAILS");
 return{ownerId:snapshot.ownerId,period:snapshot.period,version,snapshot,statementHash,state:issues.length?"HOLD":"PREPARED",issues,preparedBy:preparedBy.id,preparedAt:time,reviewedBy:null,brokerApprovedBy:null,audit:[{action:"PREPARE",actor:preparedBy.id,time,statementHash}],...safe};
}
export function reviewStatement({record,reviewer,time,expectedHash,approved,note=""}){
 if(record.state!=="PREPARED")throw Error("PREPARED_REQUIRED");
 if(!reviewer?.id||reviewer.role!=="FINANCE_REVIEWER"||reviewer.id===record.preparedBy||!time)throw Error("INDEPENDENT_REVIEWER_REQUIRED");
 if(expectedHash!==record.statementHash||hash(record.snapshot)!==record.statementHash)throw Error("IMMUTABLE_HASH_MISMATCH");
 const out=structuredClone(record);out.state=approved===true?"FINANCE_REVIEWED":"HOLD";out.reviewedBy=reviewer.id;out.reviewedAt=time;
 if(!approved)out.issues.push("FINANCE_REJECTED");
 out.audit.push({action:approved?"FINANCE_APPROVE":"FINANCE_REJECT",actor:reviewer.id,time,statementHash:out.statementHash,note});return out;
}
export function brokerApproveStatement({record,broker,time,expectedHash,approved,note=""}){
 if(record.state!=="FINANCE_REVIEWED")throw Error("FINANCE_REVIEW_REQUIRED");
 if(!broker?.id||broker.role!=="MANAGING_BROKER"||[record.preparedBy,record.reviewedBy].includes(broker.id)||!time)throw Error("INDEPENDENT_BROKER_REQUIRED");
 if(expectedHash!==record.statementHash||hash(record.snapshot)!==record.statementHash)throw Error("IMMUTABLE_HASH_MISMATCH");
 const out=structuredClone(record);out.state=approved===true?"BROKER_APPROVED_INTERNAL":"HOLD";out.brokerApprovedBy=broker.id;out.brokerApprovedAt=time;
 if(!approved)out.issues.push("BROKER_REJECTED");out.audit.push({action:approved?"BROKER_APPROVE":"BROKER_REJECT",actor:broker.id,time,statementHash:out.statementHash,note});return out;
}
export function supersedeStatement({record,actor,time,reason}){
 if(!actor?.id||!time||!reason||!["PREPARED","FINANCE_REVIEWED","BROKER_APPROVED_INTERNAL","HOLD"].includes(record.state))throw Error("INVALID_SUPERSESSION");
 const out=structuredClone(record);out.state="SUPERSEDED";out.issues.push("REQUIRES_NEW_VERSION");out.audit.push({action:"SUPERSEDE",actor:actor.id,time,reason});return out;
}
export function buildPortalHandoffPreview({record,portalOwnerMappingApproved=false,connectorAvailable=false}){
 const blocks=[];if(record.state!=="BROKER_APPROVED_INTERNAL")blocks.push("BROKER_APPROVAL_REQUIRED");
 if(hash(record.snapshot)!==record.statementHash)blocks.push("SNAPSHOT_CHANGED");
 if(!portalOwnerMappingApproved)blocks.push("OWNER_PORTAL_MAPPING_REQUIRED");
 if(!connectorAvailable)blocks.push("PORTAL_ADAPTER_MISSING");
 return{status:blocks.length?"HOLD":"READY_FOR_SEPARATE_PORTAL_IMPLEMENTATION",blocks,
 reference:record.ownerId+"|"+record.period+"|v"+record.version+"|"+record.statementHash,...safe};
}
