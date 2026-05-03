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
                phone: phoneDigits ? Number(phoneDigits) : undefined,
                type: 'route',
                legal_business_name: freelancer.bank_account_holder_name || freelancer.freelancer_full_name,
                business_type: 'individual',
                // Note: For business_type 'individual', PAN is provided in stakeholder, not here
                // legal_info.pan is only for company/partnership/trust business types
                profile: {
                    category: 'services',
                    subcategory: 'professional_services',
                    addresses: {
                        registered: {
                            street1: freelancer.street_address || 'Not Provided',
                            street2: 'Not Provided',
                            city: freelancer.city || 'Mumbai',
                            state: (freelancer.state || 'MAHARASHTRA').toUpperCase(),
                            postal_code: freelancer.postal_code ? Number(freelancer.postal_code) : 400001,
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
                ...(phoneDigits ? { phone: { primary: Number(phoneDigits) } } : {}),
                email: freelancer.freelancer_email || undefined,
                ...(freelancer.street_address ? {
                    addresses: {
                        residential: {
                            street: freelancer.street_address,
                            city: freelancer.city || 'Mumbai',
                            state: (freelancer.state || 'Maharashtra'),
                            postal_code: String(freelancer.postal_code || '400001'),
                            country: 'IN',
                        },
                    },
                } : {}),
                kyc: freelancer.pan_card_number ? {
                    pan: freelancer.pan_card_number,
                } : undefined,
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
     * Saves all IDs to the freelancer table.
     */
    async onboardFreelancer(freelancerId) {
        // Fetch freelancer (no transaction — each step commits independently
        // so progress is preserved if a later step fails)
        const { rows: freelancers } = await db.query(
            `SELECT * FROM freelancer WHERE freelancer_id = $1`,
            [freelancerId]
        );

        if (freelancers.length === 0) {
            throw new Error('Freelancer not found');
        }

        const freelancer = freelancers[0];

        // Guard: must have bank details and address
        if (!freelancer.bank_account_no || !freelancer.bank_ifsc_code) {
            throw new Error('Freelancer must have bank account details before onboarding');
        }
        if (!freelancer.street_address || !freelancer.city || !freelancer.state || !freelancer.postal_code) {
            throw new Error('Freelancer must have complete address (street, city, state, postal_code) before onboarding');
        }

        // Razorpay validation: stakeholder street address must be minimum 10 characters
        if (freelancer.street_address.trim().length < 10) {
            throw new Error('Street address must be at least 10 characters long for Razorpay verification');
        }

        // Razorpay validation: postal code must be exactly 6 digits
        const postalCodeStr = String(freelancer.postal_code).trim();
        if (!/^\d{6}$/.test(postalCodeStr)) {
            throw new Error('Postal code must be exactly 6 digits');
        }

        // Razorpay validation: phone number must be exactly 10 digits after stripping prefix
        let phoneDigits = freelancer.phone_number ? freelancer.phone_number.replace(/\D/g, '') : null;
        if (phoneDigits && phoneDigits.length > 11) {
            phoneDigits = phoneDigits.replace(/^91/, '');
        }
        if (!phoneDigits || phoneDigits.length !== 10) {
            throw new Error('Phone number must be exactly 10 digits');
        }

        // Razorpay validation: bank account number must be 5-35 characters
        if (freelancer.bank_account_no.length < 5 || freelancer.bank_account_no.length > 35) {
            throw new Error('Bank account number must be between 5 and 35 characters');
        }

        // Razorpay validation: IFSC code format
        if (!/^[A-Z]{4}0[A-Z0-9]{6}$/i.test(freelancer.bank_ifsc_code)) {
            throw new Error('Invalid IFSC code format');
        }

        // Razorpay validation: PAN card (if provided) must have 4th character as 'P' for individuals
        if (freelancer.pan_card_number && freelancer.pan_card_number.charAt(3) !== 'P') {
            throw new Error('Invalid PAN format for individual. The 4th character must be "P"');
        }

        // Guard: already onboarded and activated
        if (freelancer.razorpay_linked_account_id && freelancer.razorpay_account_status === 'activated') {
            logger.info(`[onboardFreelancer] Freelancer ${freelancerId} already onboarded and activated`);
            return { status: 'already_activated', accountId: freelancer.razorpay_linked_account_id };
        }

        let accountId = freelancer.razorpay_linked_account_id;
        let stakeholderId = freelancer.razorpay_stakeholder_id;
        let productId = freelancer.razorpay_product_id;

        // Step 1: Create Linked Account (if not already created)
        if (!accountId) {
            const account = await this.createLinkedAccount(freelancer);
            accountId = account.id;

            await db.query(
                `UPDATE freelancer SET razorpay_linked_account_id = $1, razorpay_account_status = 'created' WHERE freelancer_id = $2`,
                [accountId, freelancerId]
            );
            logger.info(`[onboardFreelancer] Step 1 complete: account_id=${accountId}`);
        }

        // Step 2: Create Stakeholder (if not already created)
        if (!stakeholderId) {
            const stakeholder = await this.createStakeholder(accountId, freelancer);
            stakeholderId = stakeholder.id;

            await db.query(
                `UPDATE freelancer SET razorpay_stakeholder_id = $1 WHERE freelancer_id = $2`,
                [stakeholderId, freelancerId]
            );
            logger.info(`[onboardFreelancer] Step 2 complete: stakeholder_id=${stakeholderId}`);
        }

        // Step 3: Request Product Configuration (if not already requested)
        if (!productId) {
            const product = await this.requestProductConfig(accountId);
            productId = product.id;

            await db.query(
                `UPDATE freelancer SET razorpay_product_id = $1 WHERE freelancer_id = $2`,
                [productId, freelancerId]
            );
            logger.info(`[onboardFreelancer] Step 3 complete: product_id=${productId}`);
        }

        // Step 4: Update Product Config with bank details
        const productConfig = await this.updateProductConfig(accountId, productId, freelancer);
        const activationStatus = productConfig.activation_status || 'pending';

        // Map Razorpay activation_status to our status
        let accountStatus = 'pending';
        if (activationStatus === 'activated') {
            accountStatus = 'activated';
        } else if (activationStatus === 'needs_clarification') {
            accountStatus = 'needs_clarification';
        } else if (activationStatus === 'under_review') {
            accountStatus = 'pending';
        }

        await db.query(
            `UPDATE freelancer SET razorpay_account_status = $1 WHERE freelancer_id = $2`,
            [accountStatus, freelancerId]
        );

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
