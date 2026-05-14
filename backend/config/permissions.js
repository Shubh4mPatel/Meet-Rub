/**
 * Master permission schema.
 * Keys = modules, values = allowed actions within that module.
 *
 * Used by:
 *  - requirePermission middleware (enforcement)
 *  - createAdmin controller (input validation)
 *  - Frontend (checkbox rendering)
 *
 * Route → permission mapping:
 *
 * user_management:
 *   view   → GET /get-all-freelancers, /get-freelancerby-id, /get-freelancers-for-suggestion
 *             GET /get-all-creators, /get-creatorby-id
 *             GET /freelancers-for-KYC-approval
 *   update → POST /suspend-freelancer, /revoke-freelancer-suspension
 *             POST /suspend-creator, /revoke-creator-suspension
 *             POST /featured-freelancers, DELETE /featured-freelancers
 *   approve→ POST /approve-kyc, /reject-kyc
 *
 * payments:
 *   view   → GET /payouts, /payouts/:id, /transactions/escrow, /stats
 *             GET /freelancer/:id/linked-account-status
 *   update → PUT /commission
 *             POST /freelancer/:id/create-linked-account
 *             DELETE /freelancer/:id/reset-linked-account
 *   approve→ POST /payouts/:id/approve, /payouts/:id/reject
 *             POST /transactions/:id/release
 *
 * disputes:
 *   view   → GET /disputes, GET /disputes/:id
 *   update → PATCH /disputes/resolve/:id
 *
 * projects:
 *   view   → GET /niches, GET /services-list
 *   create → POST /add-niches, POST /assignfreelancer-to-request
 *   update → PATCH /services/:id, DELETE /services/:id
 *
 * chat:
 *   view   → socket: admin-join-support-chat
 *   create → socket: admin-initiate-chat
 *
 * admin_management:
 *   create → POST /create-admin
 */
const PERMISSIONS = {
    user_management: ['view', 'update', 'approve'],
    payments:        ['view', 'update', 'approve'],
    disputes:        ['view', 'update'],
    projects:        ['view', 'create', 'update'],
    chat:            ['view', 'create'],
    admin_management:['create'],
};

/**
 * Returns a permissions object with all modules and all actions — use this for a full-access admin.
 */
const FULL_PERMISSIONS = Object.fromEntries(
    Object.entries(PERMISSIONS).map(([module, actions]) => [module, [...actions]])
);

module.exports = { PERMISSIONS, FULL_PERMISSIONS };
