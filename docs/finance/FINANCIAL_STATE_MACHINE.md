# Financial State Machine

DRAFT → SUBMITTED → PENDING_APPROVAL → APPROVED. PENDING_APPROVAL → REJECTED. Permitted earlier states may → VOIDED: DRAFT and PENDING_APPROVAL directly with a reason; APPROVED only through a void request approved by an approver (ADR-022). REJECTED and VOIDED are terminal; corrections use "copy to new draft". Transitions are explicit and permission-checked. Invalid transitions are rejected. Approved records are not silently edited/deleted; corrections are auditable.
