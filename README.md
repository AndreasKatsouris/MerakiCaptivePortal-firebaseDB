# Meraki Captive Portal & Guest Management Platform
*Firebase-Based WiFi Authentication & Customer Engagement System*

## 🌟 Overview

What started as a Meraki captive portal has evolved into a comprehensive guest management and customer engagement platform featuring:

- **WiFi Captive Portal** - Meraki integration for guest WiFi access
- **Guest Management** - Track and engage with guests across locations
- **Queue Management** - Digital queue system with WhatsApp notifications
- **Booking System** - Table reservations and booking management
- **Receipt Processing** - OCR-based receipt scanning with rewards
- **Rewards Program** - Points and voucher management
- **WhatsApp Integration** - Automated messaging and customer service
- **Food Cost Analytics** - Inventory and cost tracking
- **Marketing Campaigns** - SendGrid email campaigns and analytics
- **Admin Dashboard** - Multi-location business management

## 🚀 Quick Start

### Prerequisites
- Node.js v22+
- Firebase CLI
- Firebase project with Realtime Database & Hosting

### Installation

1. **Clone the repository**
```bash
git clone https://github.com/dexterlabora/MerakiCaptivePortal-firebaseDB.git
cd MerakiCaptivePortal-firebaseDB
```

2. **Install dependencies**
```bash
npm install
cd functions && npm install
```

3. **Configure environment**
```bash
# Copy template and fill in your credentials
cp .env.template .env
cp functions/.env.template functions/.env
```
See [Environment Setup Guide](docs/deployment/environment-setup.md) for detailed configuration.

4. **Deploy to Firebase**
```bash
firebase use --add  # Select your Firebase project
firebase deploy
```

## 📚 Documentation

Comprehensive documentation is available in the [`/docs`](docs/) directory:

### Getting Started
- [Environment Setup](docs/deployment/environment-setup.md) - Configure all required services
- [Deployment Guide](docs/deployment/) - Production deployment instructions
- [Coding Standards](docs/development/coding-standards.md) - Development guidelines

### Features
- [Queue Management](docs/features/) - Digital queue system
- [WhatsApp Integration](docs/features/whatsapp/) - Messaging automation
- [Booking System](docs/features/) - Reservation management
- [Food Cost Module](docs/features/food-cost/) - Inventory tracking
- [Access Control](docs/features/) - Subscription tiers and permissions

### Architecture
- [System Overview](docs/architecture/) - High-level design
- [Codebase Structure Analysis](docs/codebase_structure_analysis.md) - Organization guide

### Development
- [Admin Tools Inventory](docs/development/admin-tools-inventory.md) - Available admin utilities
- [Development Logs](docs/development/logs/) - Change history

**👉 [Browse Full Documentation](docs/README.md)**

## 🏗️ Project Structure

```
├── public/                 # Frontend application
│   ├── js/                # JavaScript modules
│   ├── css/               # Stylesheets
│   └── admin_tools/       # Admin utilities
├── functions/             # Firebase Cloud Functions
├── docs/                  # Documentation
├── tests/                 # Test suites
├── scripts/               # Build & utility scripts
└── .env.template          # Environment configuration template
```

## 🔧 Technology Stack

- **Frontend**: Vue 3, React 19, Vanilla JavaScript
- **Backend**: Firebase Cloud Functions (Node.js 22)
- **Database**: Firebase Realtime Database
- **Hosting**: Firebase Hosting
- **Styling**: Tailwind CSS, Bootstrap
- **Build**: Vite
- **Integrations**: Twilio (WhatsApp/SMS), SendGrid (Email), Google Cloud Vision (OCR), Meraki (WiFi)

## 🎯 Key Features

### WiFi Captive Portal
Original functionality - Meraki ExCaP integration for guest WiFi authentication

### Queue Management
- Real-time digital queue
- WhatsApp notifications
- Multi-location support
- Queue analytics

### Guest Management
- Unified guest profiles
- Location tracking
- Engagement history
- Rewards tracking

### Booking System
- Table reservations
- WhatsApp confirmations
- Admin management interface

### Receipt Processing
- OCR text extraction
- Template-based parsing
- Automatic rewards calculation
- Multi-location support

### WhatsApp Integration
- Automated booking notifications
- Queue updates
- Receipt submissions via photo
- Customer service bot

## 🔐 Environment Configuration

Required services and credentials:

- **Firebase** - Database, hosting, functions
- **Twilio** - WhatsApp and SMS messaging
- **SendGrid** - Email marketing
- **Google Cloud Vision** - Receipt OCR (optional)
- **Meraki** - WiFi captive portal (optional)

See [`.env.template`](.env.template) and [Environment Setup Guide](docs/deployment/environment-setup.md) for details.

## 📊 Admin Tools

Access admin tools at `/admin_tools/` for:
- User management
- Queue monitoring
- Analytics dashboards
- System diagnostics
- Data migration tools

See [Admin Tools Inventory](docs/development/admin-tools-inventory.md) for complete list.

## 🧪 Testing

```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Run E2E tests
npm run test:e2e
```

## 📝 Development

### Coding Standards
Follow the [Coding Standards Guide](docs/development/coding-standards.md) for:
- File naming conventions (kebab-case)
- Code style (ESLint/Prettier)
- Module organization
- Git commit messages

### Contributing
1. Create a feature branch
2. Follow coding standards
3. Write tests for new features
4. Update documentation
5. Submit pull request

## 📈 Updates

Track changes and improvements in [`/docs/updates`](docs/updates/):
- [2025-12-15](docs/updates/20251215/update.md) - Documentation organization, coding standards

## 📞 Support

For issues and questions:
1. Check [Documentation](docs/README.md)
2. Review [Admin Tools](docs/development/admin-tools-inventory.md)
3. Check [Development Logs](docs/development/logs/)

## 📄 License

Apache 2.0 - See [LICENSE](./LICENSE) and [NOTICE](./NOTICE)

## 🙏 Credits

**Original Captive Portal**: Cory Guynn (2017) - www.InternetOfLEGO.com

**Extended Platform**: Evolved through continuous development to support comprehensive guest management and business operations.
