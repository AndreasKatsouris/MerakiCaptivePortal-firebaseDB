/**
 * WhatsApp Template Management Utility
 * Helps with template registration, approval, and management
 */

const axios = require('axios');
const { TEMPLATE_CONFIG, WHATSAPP_TEMPLATES } = require('./whatsappTemplates');

/**
 * Register a template with WhatsApp Business API
 * @param {string} templateType - Template type from TEMPLATE_TYPES
 * @param {string} accessToken - WhatsApp Business API access token
 * @param {string} businessAccountId - WhatsApp Business Account ID
 */
async function registerTemplate(templateType, accessToken, businessAccountId) {
    const template = WHATSAPP_TEMPLATES[templateType];
    
    if (!template) {
        throw new Error(`Template not found: ${templateType}`);
    }

    const payload = {
        name: template.name,
        category: template.category,
        components: template.template.components,
        language: template.language
    };

    try {
        const response = await axios.post(
            `https://graph.facebook.com/${TEMPLATE_CONFIG.API_VERSION}/${businessAccountId}/message_templates`,
            payload,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json'
                }
            }
        );

        console.log(`✅ Template registered successfully: ${templateType}`, response.data);
        return response.data;
    } catch (error) {
        console.error(`❌ Error registering template ${templateType}:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * Get template status from WhatsApp Business API
 * @param {string} templateId - Template ID
 * @param {string} accessToken - WhatsApp Business API access token
 */
async function getTemplateStatus(templateId, accessToken) {
    try {
        const response = await axios.get(
            `https://graph.facebook.com/${TEMPLATE_CONFIG.API_VERSION}/${templateId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error(`❌ Error getting template status:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * List all templates for a business account
 * @param {string} businessAccountId - WhatsApp Business Account ID
 * @param {string} accessToken - WhatsApp Business API access token
 */
async function listTemplates(businessAccountId, accessToken) {
    try {
        const response = await axios.get(
            `https://graph.facebook.com/${TEMPLATE_CONFIG.API_VERSION}/${businessAccountId}/message_templates`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        return response.data;
    } catch (error) {
        console.error(`❌ Error listing templates:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * Delete a template
 * @param {string} templateId - Template ID
 * @param {string} accessToken - WhatsApp Business API access token
 */
async function deleteTemplate(templateId, accessToken) {
    try {
        const response = await axios.delete(
            `https://graph.facebook.com/${TEMPLATE_CONFIG.API_VERSION}/${templateId}`,
            {
                headers: {
                    'Authorization': `Bearer ${accessToken}`
                }
            }
        );

        console.log(`✅ Template deleted successfully: ${templateId}`);
        return response.data;
    } catch (error) {
        console.error(`❌ Error deleting template:`, error.response?.data || error.message);
        throw error;
    }
}

/**
 * Generate template submission guide
 */
function generateTemplateSubmissionGuide() {
    const guide = `
# WhatsApp Template Submission Guide

## Steps to Submit Templates for Approval

### 1. Set Up Environment Variables
\`\`\`bash
# Add to your .env file
WHATSAPP_ACCESS_TOKEN=your_access_token_here
WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id_here
WHATSAPP_BUSINESS_ACCOUNT_ID=your_business_account_id_here
USE_WHATSAPP_BUSINESS_API=true
\`\`\`

### 2. Update Template Configuration
In \`functions/utils/whatsappTemplates.js\`, update:
- TEMPLATE_CONFIG.NAMESPACE with your actual namespace
- TEMPLATE_CONFIG.TEMPLATE_IDS with your actual template IDs after approval
- TEMPLATE_CONFIG.PHONE_NUMBER_ID with your phone number ID

### 3. Register Templates
Use the template manager to register templates:

\`\`\`javascript
const { registerTemplate } = require('./utils/templateManager');
const { TEMPLATE_TYPES } = require('./utils/whatsappTemplates');

// Register booking confirmation template
await registerTemplate(
    TEMPLATE_TYPES.BOOKING_CONFIRMATION,
    'your_access_token',
    'your_business_account_id'
);
\`\`\`

### 4. Template Approval Process
1. **Submit for Review**: Templates are automatically submitted for Meta review
2. **Review Time**: Usually 24-48 hours
3. **Approval Status**: Check status using \`getTemplateStatus()\`
4. **Updates**: Update template IDs in config after approval

### 5. Template Content Guidelines

#### Booking Confirmation Template
- **Category**: Utility (automatically approved)
- **Purpose**: Confirm table reservations
- **Variables**: Guest name, booking details, status
- **Sample**: "🎉 Booking Confirmed! Hi {{1}}, your table reservation has been confirmed for {{3}} at {{4}}..."

#### Booking Status Update Template
- **Category**: Utility (automatically approved)
- **Purpose**: Notify about booking changes
- **Variables**: Status emoji, guest name, status message, booking details
- **Sample**: "{{1}} Booking Status Update. Hi {{2}}, {{3}}. Booking details: {{4}}..."

#### Booking Reminder Template
- **Category**: Utility (automatically approved)
- **Purpose**: Remind about upcoming reservations
- **Variables**: Guest name, date, time, location
- **Sample**: "⏰ Booking Reminder. Hi {{1}}, reminder about your reservation on {{2}} at {{3}}..."

### 6. Testing Templates
\`\`\`javascript
// Test template sending
const { sendBookingConfirmationTemplate } = require('./utils/whatsappClient');

const testBooking = {
    guestName: 'John Doe',
    id: 'TEST001',
    date: '2025-01-15',
    time: '19:00',
    location: 'Main Restaurant',
    section: 'Terrace',
    numberOfGuests: 4,
    specialRequests: 'Window table',
    status: 'confirmed'
};

await sendBookingConfirmationTemplate('+1234567890', testBooking);
\`\`\`

### 7. Monitoring and Maintenance
- Monitor template performance in Meta Business Manager
- Check delivery rates and user engagement
- Update templates as needed (requires re-approval)
- Maintain fallback messages for template failures

## Current Template Status
${Object.values(WHATSAPP_TEMPLATES).map(template => `
- **${template.name}**: ${template.templateId}
  - Category: ${template.category}
  - Language: ${template.language}
  - Status: ${template.status}
`).join('')}

## Next Steps
1. Create WhatsApp Business Account if not already done
2. Get access token from Meta Business Manager
3. Register templates using this utility
4. Wait for approval (24-48 hours)
5. Update template IDs in configuration
6. Enable USE_WHATSAPP_BUSINESS_API=true
7. Test template sending
`;

    return guide;
}

module.exports = {
    registerTemplate,
    getTemplateStatus,
    listTemplates,
    deleteTemplate,
    generateTemplateSubmissionGuide
};