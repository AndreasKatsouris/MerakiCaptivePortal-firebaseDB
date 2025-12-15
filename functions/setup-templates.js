/**
 * WhatsApp Template Setup Script
 * Use this script to register templates with WhatsApp Business API
 */

require('dotenv').config();
const { 
    registerTemplate, 
    getTemplateStatus, 
    listTemplates,
    generateTemplateSubmissionGuide 
} = require('./utils/templateManager');
const { TEMPLATE_TYPES } = require('./utils/whatsappTemplates');

// Configuration
const ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const BUSINESS_ACCOUNT_ID = process.env.WHATSAPP_BUSINESS_ACCOUNT_ID;
const PHONE_NUMBER_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function setupTemplates() {
    console.log('🚀 WhatsApp Template Setup Starting...');
    
    // Check configuration
    if (!ACCESS_TOKEN || !BUSINESS_ACCOUNT_ID || !PHONE_NUMBER_ID) {
        console.error('❌ Missing required environment variables:');
        console.error('   - WHATSAPP_ACCESS_TOKEN');
        console.error('   - WHATSAPP_BUSINESS_ACCOUNT_ID');
        console.error('   - WHATSAPP_PHONE_NUMBER_ID');
        console.error('\nPlease set these in your .env file or environment variables.');
        process.exit(1);
    }

    try {
        // List existing templates
        console.log('\n📋 Checking existing templates...');
        const existingTemplates = await listTemplates(BUSINESS_ACCOUNT_ID, ACCESS_TOKEN);
        console.log(`Found ${existingTemplates.data?.length || 0} existing templates`);
        
        if (existingTemplates.data?.length > 0) {
            console.log('Existing templates:');
            existingTemplates.data.forEach(template => {
                console.log(`  - ${template.name} (${template.status})`);
            });
        }

        // Register new templates
        console.log('\n🔄 Registering new templates...');
        
        const templatesToRegister = [
            TEMPLATE_TYPES.BOOKING_CONFIRMATION,
            TEMPLATE_TYPES.BOOKING_STATUS_UPDATE,
            TEMPLATE_TYPES.BOOKING_REMINDER,
            TEMPLATE_TYPES.RECEIPT_CONFIRMATION,
            TEMPLATE_TYPES.WELCOME_MESSAGE
        ];

        for (const templateType of templatesToRegister) {
            try {
                console.log(`\n📝 Registering ${templateType}...`);
                const result = await registerTemplate(templateType, ACCESS_TOKEN, BUSINESS_ACCOUNT_ID);
                console.log(`✅ ${templateType} registered successfully!`);
                console.log(`   Template ID: ${result.id}`);
                console.log(`   Status: ${result.status}`);
                
                // Save template ID for later use
                console.log(`\n📋 Update your configuration with:`);
                console.log(`   ${templateType.toUpperCase()}: '${result.id}'`);
                
            } catch (error) {
                if (error.response?.data?.error?.message?.includes('already exists')) {
                    console.log(`⚠️  ${templateType} already exists, skipping...`);
                } else {
                    console.error(`❌ Failed to register ${templateType}:`, error.response?.data || error.message);
                }
            }
        }

        // Check template statuses
        console.log('\n📊 Checking template statuses...');
        const updatedTemplates = await listTemplates(BUSINESS_ACCOUNT_ID, ACCESS_TOKEN);
        
        if (updatedTemplates.data?.length > 0) {
            console.log('\nTemplate Status Summary:');
            updatedTemplates.data.forEach(template => {
                const statusIcon = template.status === 'APPROVED' ? '✅' : 
                                 template.status === 'PENDING' ? '⏳' : 
                                 template.status === 'REJECTED' ? '❌' : '⚠️';
                console.log(`  ${statusIcon} ${template.name}: ${template.status}`);
            });
        }

        console.log('\n🎉 Template setup complete!');
        console.log('\n📋 Next Steps:');
        console.log('1. Wait for template approval (24-48 hours)');
        console.log('2. Update template IDs in whatsappTemplates.js');
        console.log('3. Set USE_WHATSAPP_BUSINESS_API=true in environment');
        console.log('4. Test template sending');
        
    } catch (error) {
        console.error('❌ Setup failed:', error.message);
        process.exit(1);
    }
}

// Command line interface
const command = process.argv[2];

switch (command) {
    case 'setup':
        setupTemplates();
        break;
    
    case 'list':
        if (!ACCESS_TOKEN || !BUSINESS_ACCOUNT_ID) {
            console.error('❌ Missing ACCESS_TOKEN or BUSINESS_ACCOUNT_ID');
            process.exit(1);
        }
        listTemplates(BUSINESS_ACCOUNT_ID, ACCESS_TOKEN)
            .then(templates => {
                console.log('📋 Templates:');
                templates.data?.forEach(template => {
                    console.log(`  - ${template.name} (${template.status}) - ID: ${template.id}`);
                });
            })
            .catch(error => {
                console.error('❌ Error listing templates:', error.message);
            });
        break;
    
    case 'status':
        const templateId = process.argv[3];
        if (!templateId || !ACCESS_TOKEN) {
            console.error('❌ Usage: node setup-templates.js status <template_id>');
            process.exit(1);
        }
        getTemplateStatus(templateId, ACCESS_TOKEN)
            .then(status => {
                console.log('📊 Template Status:', status);
            })
            .catch(error => {
                console.error('❌ Error getting template status:', error.message);
            });
        break;
    
    case 'guide':
        console.log(generateTemplateSubmissionGuide());
        break;
    
    default:
        console.log(`
🔧 WhatsApp Template Setup Utility

Usage:
  node setup-templates.js setup    - Register all templates
  node setup-templates.js list     - List existing templates
  node setup-templates.js status <id> - Check template status
  node setup-templates.js guide    - Show setup guide

Environment Variables Required:
  WHATSAPP_ACCESS_TOKEN
  WHATSAPP_BUSINESS_ACCOUNT_ID
  WHATSAPP_PHONE_NUMBER_ID

Examples:
  node setup-templates.js setup
  node setup-templates.js list
  node setup-templates.js status 1234567890
  node setup-templates.js guide
`);
        break;
}