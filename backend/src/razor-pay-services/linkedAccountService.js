const { pool: db } = require('../../config/dbConfig');
const razorpayRoutes = require('../../config/razorpayRoutes');
const { getLogger } = require('../../utils/logger');
const logger = getLogger('linked-account-service');

class LinkedAccountService {
    /**
     * Step 1: Create a Linked Account on Razorpay
     * POST /v2/accounts
     */
    async createLinkedAccount(freelancer) {
        try {
            // Strip country code prefix (+91 or 91) to get 10-digit number
            let phoneDigits = freelancer.phone_number ? freelancer.phone_number.replace(/\D/g, '') : null;
            if (phoneDigits && phoneDigits.length > 11) {
                phoneDigits = phoneDigits.replace(/^91/, '');
            }

            const accountData = {
                email: freelancer.freelancer_email,
                phone: Number(phoneDigits),
                type: 'route',
                legal_business_name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
                contact_name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
                business_type: 'individual',
                // Note: For business_type 'individual', PAN is provided in stakeholder, not here
                // legal_info.pan is only for company/partnership/trust business types
                profile: {
                    category: 'services',
                    subcategory: 'professional_services',
                    addresses: {
                        registered: {
                            street1: freelancer.street_address,
                            city: freelancer.city,
                            state: freelancer.state.toUpperCase(),
                            postal_code: Number(freelancer.postal_code),
                            country: 'IN',
                        },
                    },
                },
                notes: {
                    freelancer_id: String(freelancer.freelancer_id),
                    platform: 'meetrub',
                },
            };

            logger.info(`[createLinkedAccount] Creating linked account for freelancer_id=${freelancer.freelancer_id}`);

            const response = await razorpayRoutes.post('/v2/accounts', accountData);
            logger.info(`[createLinkedAccount] Linked account created: account_id=${response.data.id}`);
            return response.data;
        } catch (err) {
            const errMsg = err.response?.data?.error?.description || err.message;
            const errCode = err.response?.data?.error?.code || 'UNKNOWN';
            logger.error(`[createLinkedAccount] Failed for freelancer_id=${freelancer?.freelancer_id}: ${errCode} - ${errMsg}`);
            throw new Error(`Linked account creation failed: ${errMsg}`);
        }
    }

    /**
     * Step 2: Create a Stakeholder for the Linked Account
     * POST /v2/accounts/{account_id}/stakeholders
     */
    async createStakeholder(accountId, freelancer) {
        try {
            // Strip country code prefix (+91 or 91) to get 10-digit number
            let phoneDigits = freelancer.phone_number ? freelancer.phone_number.replace(/\D/g, '') : null;
            if (phoneDigits && phoneDigits.length > 11) {
                phoneDigits = phoneDigits.replace(/^91/, '');
            }

            const stakeholderData = {
                name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
                phone: { primary: Number(phoneDigits) },
                email: freelancer.freelancer_email,
                addresses: {
                    residential: {
                        street: freelancer.street_address,
                        city: freelancer.city,
                        state: freelancer.state.toUpperCase(),
                        postal_code: String(freelancer.postal_code),
                        country: 'IN',
                    },
                },
                kyc: {
                    pan: freelancer.pan_card_number,
                },
                notes: {
                    freelancer_id: String(freelancer.freelancer_id),
                },
            };

            logger.info(`[createStakeholder] Creating stakeholder for account_id=${accountId}, freelancer_id=${freelancer.freelancer_id}`);

            const response = await razorpayRoutes.post(`/v2/accounts/${accountId}/stakeholders`, stakeholderData);
            logger.info(`[createStakeholder] Stakeholder created: stakeholder_id=${response.data.id}`);
            return response.data;
        } catch (err) {
            const errMsg = err.response?.data?.error?.description || err.message;
            logger.error(`[createStakeholder] Failed for account_id=${accountId}: ${errMsg}`);
            throw new Error(`Stakeholder creation failed: ${errMsg}`);
        }
    }

    /**
     * Step 3: Request Product Configuration (Route product)
     * POST /v2/accounts/{account_id}/products
     */
    async requestProductConfig(accountId) {
        try {
            const productData = {
                product_name: 'route',
                tnc_accepted: true,
            };

            logger.info(`[requestProductConfig] Requesting route product config for account_id=${accountId}`);

            const response = await razorpayRoutes.post(`/v2/accounts/${accountId}/products`, productData);
            logger.info(`[requestProductConfig] Product config requested: product_id=${response.data.id}, status=${response.data.active_configuration?.payment_capture}`);
            return response.data;
        } catch (err) {
            const errMsg = err.response?.data?.error?.description || err.message;
            logger.error(`[requestProductConfig] Failed for account_id=${accountId}: ${errMsg}`);
            throw new Error(`Product config request failed: ${errMsg}`);
        }
    }

    /**
     * Step 4: Update Product Configuration with bank details
     * PATCH /v2/accounts/{account_id}/products/{product_id}
     */
    async updateProductConfig(accountId, productId, freelancer) {
        try {
            const updateData = {
                settlements: {
                    account_number: freelancer.bank_account_no,
                    ifsc_code: freelancer.bank_ifsc_code,
                    beneficiary_name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
                },
                tnc_accepted: true,
            };

            logger.info(`[updateProductConfig] Updating product config for account_id=${accountId}, product_id=${productId}`);

            const response = await razorpayRoutes.patch(`/v2/accounts/${accountId}/products/${productId}`, updateData);
            logger.info(`[updateProductConfig] Product config updated: activation_status=${response.data.activation_status}`);
            return response.data;
        } catch (err) {
            const errMsg = err.response?.data?.error?.description || err.message;
            logger.error(`[updateProductConfig] Failed for account_id=${accountId}: ${errMsg}`);
            throw new Error(`Product config update failed: ${errMsg}`);
        }
    }

    /**
     * Fetch Linked Account status from Razorpay
     * GET /v2/accounts/{account_id}
     */
    async getLinkedAccountStatus(accountId) {
        try {
            const response = await razorpayRoutes.get(`/v2/accounts/${accountId}`);
            return response.data;
        } catch (err) {
            const errMsg = err.response?.data?.error?.description || err.message;
            logger.error(`[getLinkedAccountStatus] Failed for account_id=${accountId}: ${errMsg}`);
            throw new Error(`Failed to fetch linked account status: ${errMsg}`);
        }
    }

    /**
     * Fetch Product Configuration status
     * GET /v2/accounts/{account_id}/products/{product_id}
     */
    async getProductConfigStatus(accountId, productId) {
        try {
            const response = await razorpayRoutes.get(`/v2/accounts/${accountId}/products/${productId}`);
            return response.data;
        } catch (err) {
            const errMsg = err.response?.data?.error?.description || err.message;
            logger.error(`[getProductConfigStatus] Failed for account_id=${accountId}: ${errMsg}`);
            throw new Error(`Failed to fetch product config status: ${errMsg}`);
        }
    }

    /**
     * Full onboarding orchestrator — creates Linked Account, Stakeholder,
     * requests product config, updates with bank details.
     * All Razorpay API calls run first; DB is updated atomically in a single
     * transaction at the end so partial state is never written.
     */
    async onboardFreelancer(freelancerId) {
        const { rows: freelancers } = await db.query(
            `SELECT * FROM freelancer WHERE freelancer_id = $1`,
            [freelancerId]
        );

        if (freelancers.length === 0) {
            throw new Error('Freelancer not found');
        }

        const freelancer = freelancers[0];

        // --- Comprehensive upfront validation ---
        const missingFields = [];

        if (!freelancer.freelancer_email) missingFields.push('freelancer_email');
        if (!freelancer.phone_number) missingFields.push('phone_number');
        if (!freelancer.bank_account_no) missingFields.push('bank_account_no');
        if (!freelancer.bank_ifsc_code) missingFields.push('bank_ifsc_code');
        if (!freelancer.bank_account_holder_name && !freelancer.freelancer_full_name)
            missingFields.push('bank_account_holder_name');
        if (!freelancer.pan_card_number) missingFields.push('pan_card_number');
        if (!freelancer.street_address) missingFields.push('street_address');
        if (!freelancer.city) missingFields.push('city');
        if (!freelancer.state) missingFields.push('state');
        if (!freelancer.postal_code) missingFields.push('postal_code');

        if (missingFields.length > 0) {
            throw new Error(`Onboarding failed — missing required fields: ${missingFields.join(', ')}`);
        }

        // --- Format validations ---
        const formatErrors = [];

        if (freelancer.street_address.trim().length < 10)
            formatErrors.push('street_address must be at least 10 characters');

        if (!/^\d{6}$/.test(String(freelancer.postal_code).trim()))
            formatErrors.push('postal_code must be exactly 6 digits');

        let phoneDigits = freelancer.phone_number.replace(/\D/g, '');
        if (phoneDigits.length > 11) phoneDigits = phoneDigits.replace(/^91/, '');
        if (phoneDigits.length !== 10)
            formatErrors.push('phone_number must be exactly 10 digits after stripping country code');

        if (freelancer.bank_account_no.length < 5 || freelancer.bank_account_no.length > 35)
            formatErrors.push('bank_account_no must be between 5 and 35 characters');

        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(freelancer.bank_ifsc_code))
            formatErrors.push('bank_ifsc_code format is invalid');

        if (!/^[A-Z]{3}P[A-Z]\d{4}[A-Z]$/i.test(freelancer.pan_card_number))
            formatErrors.push('pan_card_number format is invalid (expected format: AAAPANNNN A)');

        if (formatErrors.length > 0) {
            throw new Error(`Onboarding failed — validation errors: ${formatErrors.join('; ')}`);
        }

        // Guard: already onboarded and activated
        if (freelancer.razorpay_linked_account_id && freelancer.razorpay_account_status === 'activated') {
            logger.info(`[onboardFreelancer] Freelancer ${freelancerId} already onboarded and activated`);
            return { status: 'already_activated', accountId: freelancer.razorpay_linked_account_id };
        }

        // --- Run all Razorpay API calls BEFORE touching the DB ---
        // Track which IDs already exist (idempotency) vs which are newly created
        let accountId = freelancer.razorpay_linked_account_id;
        let stakeholderId = freelancer.razorpay_stakeholder_id;
        let productId = freelancer.razorpay_product_id;

        const newIds = {}; // only fields that changed this run

        // Step 1: Create Linked Account (if not already created)
        if (!accountId) {
            const account = await this.createLinkedAccount(freelancer);
            accountId = account.id;
            newIds.razorpay_linked_account_id = accountId;
            newIds.razorpay_account_status_created = true;
            logger.info(`[onboardFreelancer] Step 1 complete: account_id=${accountId}`);
        }

        // Step 2: Create Stakeholder (if not already created)
        if (!stakeholderId) {
            const stakeholder = await this.createStakeholder(accountId, freelancer);
            stakeholderId = stakeholder.id;
            newIds.razorpay_stakeholder_id = stakeholderId;
            logger.info(`[onboardFreelancer] Step 2 complete: stakeholder_id=${stakeholderId}`);
        }

        // Step 3: Request Product Configuration (if not already requested)
        if (!productId) {
            const product = await this.requestProductConfig(accountId);
            productId = product.id;
            newIds.razorpay_product_id = productId;
            logger.info(`[onboardFreelancer] Step 3 complete: product_id=${productId}`);
        }

        // Step 4: Update Product Config with bank details (always run to get latest status)
        const productConfig = await this.updateProductConfig(accountId, productId, freelancer);
        const activationStatus = productConfig.activation_status || 'pending';

        let accountStatus = 'pending';
        if (activationStatus === 'activated') {
            accountStatus = 'activated';
        } else if (activationStatus === 'needs_clarification') {
            accountStatus = 'needs_clarification';
        } else if (activationStatus === 'under_review') {
            accountStatus = 'pending';
        }
        newIds.razorpay_account_status = accountStatus;
        logger.info(`[onboardFreelancer] Step 4 complete: activation_status=${activationStatus}`);

        // --- All Razorpay calls succeeded — commit all new IDs atomically ---
        const client = await db.connect();
        try {
            await client.query('BEGIN');

            if (newIds.razorpay_linked_account_id) {
                await client.query(
                    `UPDATE freelancer SET razorpay_linked_account_id = $1, razorpay_account_status = 'created' WHERE freelancer_id = $2`,
                    [newIds.razorpay_linked_account_id, freelancerId]
                );
            }
            if (newIds.razorpay_stakeholder_id) {
                await client.query(
                    `UPDATE freelancer SET razorpay_stakeholder_id = $1 WHERE freelancer_id = $2`,
                    [newIds.razorpay_stakeholder_id, freelancerId]
                );
            }
            if (newIds.razorpay_product_id) {
                await client.query(
                    `UPDATE freelancer SET razorpay_product_id = $1 WHERE freelancer_id = $2`,
                    [newIds.razorpay_product_id, freelancerId]
                );
            }
            await client.query(
                `UPDATE freelancer SET razorpay_account_status = $1 WHERE freelancer_id = $2`,
                [accountStatus, freelancerId]
            );

            await client.query('COMMIT');
            logger.info(`[onboardFreelancer] DB transaction committed for freelancer ${freelancerId}, status=${accountStatus}`);
        } catch (dbErr) {
            await client.query('ROLLBACK');
            logger.error(`[onboardFreelancer] DB transaction rolled back for freelancer ${freelancerId}: ${dbErr.message}`);
            throw new Error(`Onboarding Razorpay steps succeeded but DB update failed: ${dbErr.message}`);
        } finally {
            client.release();
        }

        logger.info(`[onboardFreelancer] Freelancer ${freelancerId} onboarding complete: status=${accountStatus}`);

        return {
            status: accountStatus,
            accountId,
            stakeholderId,
            productId,
            activationStatus,
            requirements: productConfig.requirements || [],
        };
    }

    /**
     * Sync linked account status from Razorpay to DB
     */
    async syncAccountStatus(freelancerId) {
        const { rows: freelancers } = await db.query(
            `SELECT razorpay_linked_account_id, razorpay_product_id FROM freelancer WHERE freelancer_id = $1`,
            [freelancerId]
        );

        if (freelancers.length === 0) {
            throw new Error('Freelancer not found');
        }

        const { razorpay_linked_account_id: accountId, razorpay_product_id: productId } = freelancers[0];

        if (!accountId) {
            throw new Error('Freelancer has no linked account');
        }

        const accountData = await this.getLinkedAccountStatus(accountId);

        let productData = null;
        if (productId) {
            productData = await this.getProductConfigStatus(accountId, productId);
        }

        const activationStatus = productData?.activation_status || accountData.status || 'pending';

        let accountStatus = 'pending';
        if (activationStatus === 'activated') {
            accountStatus = 'activated';
        } else if (activationStatus === 'needs_clarification') {
            accountStatus = 'needs_clarification';
        } else if (activationStatus === 'suspended') {
            accountStatus = 'suspended';
        }

        await db.query(
            `UPDATE freelancer SET razorpay_account_status = $1 WHERE freelancer_id = $2`,
            [accountStatus, freelancerId]
        );

        return {
            accountId,
            accountStatus,
            activationStatus,
            requirements: productData?.requirements || [],
            account: accountData,
        };
    }
}

module.exports = new LinkedAccountService();
