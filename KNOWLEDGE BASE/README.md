# Documentation Index

Welcome to the MerakiCaptivePortal-firebaseDB documentation!

## 🚀 Quick Start

New to the project? Start here:
1. [Getting Started](development/getting-started.md) - Setup your development environment
2. [Environment Setup](deployment/environment-setup.md) - Configure environment variables
3. [Architecture Overview](architecture/overview.md) - Understand the system

## 📚 Documentation Structure

### Architecture
System design, data models, and technical architecture
- [System Overview](architecture/overview.md)
- [Data Model](architecture/data-model.md)
- [Location Analytics](architecture/Location-Analytics.pdf)
- [Meraki Captive Portal Whitepaper](architecture/meraki_whitepaper_captive_portal.pdf)

### Features
Feature-specific documentation and guides
- [Queue Management](features/queue-management.md)
- [Receipt Processing](features/receipt-processing.md)
- [WhatsApp Integration](features/whatsapp/)
- [Food Cost Module](features/food-cost/)
- [Booking System](features/booking-system.md)
- [Access Control](features/access-control.md)
- [Enterprise Tier](features/enterprise-tier-fix.md)
- [Tier Investigation](features/investigation-tier-missing.md)

### API Documentation
API reference and integration guides
- [Cloud Functions API](api/cloud-functions.md)
- [Client API](api/client-api.md)

### Deployment
Deployment guides and operations
- [Environment Setup](deployment/environment-setup.md)
- [Deployment Guide](deployment/deployment-guide.md)
- [Deployment Success Notes](deployment/deployment-success.md)
- [Troubleshooting](deployment/troubleshooting.md)

### Development
Development workflows and standards
- [Getting Started](development/getting-started.md)
- [Coding Standards](development/coding-standards.md)
- [Git Workflow](development/git-workflow.md)
- [Testing Guide](development/testing-guide.md)
- [Admin Tools Inventory](development/admin-tools-inventory.md)
- [Development Logs](development/logs/)
- [Claude AI Notes](development/claude-notes.md)

## 🎯 Common Tasks

### Setting Up Development Environment
See [Getting Started](development/getting-started.md)

### Deploying to Production
See [Deployment Guide](deployment/deployment-guide.md)

### Adding a New Feature
1. Review [Architecture Overview](architecture/overview.md)
2. Follow [Coding Standards](development/coding-standards.md)
3. Write tests per [Testing Guide](development/testing-guide.md)
4. Submit PR following [Git Workflow](development/git-workflow.md)

### Debugging Issues
1. Check [Troubleshooting Guide](deployment/troubleshooting.md)
2. Review [Development Logs](development/logs/)
3. Use [Admin Tools](development/admin-tools-inventory.md)

## 🔍 Finding Information

### Project Structure
```
docs/
├── architecture/       # System design & architecture
├── features/          # Feature documentation
├── api/               # API reference
├── deployment/        # Deployment & operations
└── development/       # Development guides
```

### Search Tips
- **Feature-specific**: Check `/features` directory
- **Technical architecture**: Check `/architecture` directory  
- **How to deploy**: Check `/deployment` directory
- **How to develop**: Check `/development` directory

## 🛠️ Tools & Resources

### Admin Tools
See [Admin Tools Inventory](development/admin-tools-inventory.md) for:
- Production admin interfaces
- Development/debugging tools
- Migration scripts

### External Resources
- [Firebase Console](https://console.firebase.google.com)
- [Twilio Console](https://console.twilio.com)
- [Meraki Dashboard](https://dashboard.meraki.com)
- [SendGrid Console](https://app.sendgrid.com)

## 📝 Contributing

### Documentation
- Keep documentation up-to-date with code changes
- Use markdown for all documentation
- Include code examples where relevant
- Add diagrams for complex flows

### Style Guide
Follow the [Coding Standards](development/coding-standards.md) for:
- File naming conventions
- Code organization
- Commenting practices
- Git commit messages

## 🆘 Getting Help

1. **Search this documentation** first
2. Check **development logs** for similar issues
3. Review **admin tools** for diagnostics
4. Contact project maintainers

## 📋 Project Status

**Last Updated**: 2025-12-15

**Key Information**:
- Node.js: v22
- Firebase Functions: v7.0.0
- Firebase: v11.2.0
- Vue: v3.3.0
- React: v19.2.1

---

**Need to add new documentation?**
Follow the structure above and place files in the appropriate directory.
