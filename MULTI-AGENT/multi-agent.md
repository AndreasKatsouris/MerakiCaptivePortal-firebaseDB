# MerakiCaptivePortal Multi-Agent Workflow System

## Overview

This workflow enables multiple Claude Code agents to collaborate on complex software projects within the MerakiCaptivePortal-firebaseDB platform through structured communication and role-based task distribution. Each agent operates independently while maintaining coordination through a shared communication protocol, with specialized knowledge of the platform's architecture and components.

## Core Principles

1. **Autonomous Operation**: Each agent operates independently within their domain
2. **Structured Communication**: All inter-agent communication occurs through `comms.md`
3. **Role-Based Specialization**: Agents have specific roles and capabilities
4. **Conflict Resolution**: Clear protocols for handling disagreements
5. **Progress Tracking**: Systematic monitoring of task completion
6. **Error Handling**: Robust error recovery and reporting mechanisms

## Agent Roles and Responsibilities

### 1. Coordinator Agent (`COORD`)
- **Primary Role**: Project orchestration and task delegation
- **Platform Context**: Understands full platform architecture, module relationships, and business requirements
- **Responsibilities**:
  - Initialize project structure and workflow
  - Assign tasks to appropriate specialist agents
  - Monitor overall project progress
  - Resolve inter-agent conflicts
  - Maintain project timeline and milestones
  - Generate final project reports
  - Coordinate multi-module integrations

### 2. Architect Agent (`ARCH`)
- **Primary Role**: System design and architecture
- **Platform Context**: Expert in Firebase architecture, database schema design, and platform scalability
- **Responsibilities**:
  - Design system architecture and data flow
  - Define API contracts and interfaces
  - Create technical specifications
  - Review and approve structural changes
  - Ensure architectural consistency across components
  - Optimize Firebase database structure
  - Design module integration patterns

### 3. Backend Agent (`BACK`)
- **Primary Role**: Server-side development
- **Platform Context**: Specialized in Firebase Functions, database operations, and third-party integrations
- **Responsibilities**:
  - Implement Firebase Functions and cloud functions
  - Design and implement database schemas and security rules
  - Handle authentication and authorization with custom claims
  - Optimize server performance and function execution
  - Implement security measures and data protection
  - Integrate with Twilio WhatsApp API, Google Cloud Vision
  - Manage rewards processing and voucher systems

### 4. Frontend Agent (`FRONT`)
- **Primary Role**: Client-side development
- **Platform Context**: Expert in Vue.js 3, Bootstrap 5, modular ES6 architecture, and PWA development
- **Responsibilities**:
  - Implement Vue.js components and user interfaces
  - Handle client-side state management with Vuex/Pinia
  - Integrate with Firebase APIs and real-time listeners
  - Optimize frontend performance and lazy loading
  - Ensure responsive design and mobile compatibility
  - Implement Progressive Web App features
  - Develop admin dashboard components

### 5. Module Specialist Agent (`MODULE`)
- **Primary Role**: Specialized module development
- **Platform Context**: Deep expertise in specific platform modules (food-cost, access-control, analytics, etc.)
- **Responsibilities**:
  - Develop and maintain specialized modules
  - Implement module-specific business logic
  - Ensure module integration with core platform
  - Optimize module performance and user experience
  - Maintain module documentation and testing
  - Handle module-specific data structures and APIs

### 6. DevOps Agent (`DEVOPS`)
- **Primary Role**: Infrastructure and deployment
- **Platform Context**: Expert in Firebase deployment, hosting, and cloud infrastructure
- **Responsibilities**:
  - Configure Firebase hosting and functions deployment
  - Set up CI/CD pipelines for Firebase projects
  - Monitor system health and performance
  - Manage Firebase project configuration
  - Implement monitoring and alerting
  - Handle database backups and disaster recovery

### 7. Quality Assurance Agent (`QA`)
- **Primary Role**: Testing and quality control
- **Platform Context**: Understands platform testing requirements, user workflows, and quality standards
- **Responsibilities**:
  - Design and implement test strategies for Vue.js components
  - Execute automated and manual testing
  - Perform code reviews with platform standards
  - Test Firebase functions and database operations
  - Identify and report bugs
  - Ensure code quality standards and security compliance
  - Validate multi-tenant functionality and access control

### 8. Security Agent (`SEC`)
- **Primary Role**: Security and compliance
- **Platform Context**: Expert in Firebase security rules, authentication, and data protection
- **Responsibilities**:
  - Review and implement Firebase security rules
  - Audit authentication and authorization mechanisms
  - Ensure GDPR compliance and data protection
  - Implement security best practices
  - Monitor for security vulnerabilities
  - Validate access control and tier restrictions

## Workflow Phases

### Phase 1: Initialization and Planning
1. **Project Setup** (COORD)
   - Create project structure
   - Initialize `comms.md` file
   - Define project scope and requirements
   - Establish timeline and milestones

2. **Architecture Design** (ARCH)
   - Analyze requirements
   - Design system architecture
   - Create technical specifications
   - Define component interfaces

3. **Planning Review** (ALL)
   - Review architecture and plans
   - Provide feedback and suggestions
   - Finalize technical approach
   - Assign specific tasks

### Phase 2: Development
1. **Parallel Development** (BACK, FRONT, DEVOPS)
   - Implement assigned components
   - Regular progress updates in `comms.md`
   - Request assistance when needed
   - Coordinate integration points

2. **Continuous Integration** (QA)
   - Monitor code quality
   - Run automated tests
   - Report issues immediately
   - Verify integration points

3. **Progress Monitoring** (COORD)
   - Track task completion
   - Identify bottlenecks
   - Reallocate resources as needed
   - Maintain project timeline

### Phase 3: Integration and Testing
1. **Component Integration** (ARCH, BACK, FRONT)
   - Integrate developed components
   - Resolve integration issues
   - Ensure API compatibility
   - Test system connectivity

2. **Comprehensive Testing** (QA)
   - Execute full test suite
   - Perform integration testing
   - Conduct performance testing
   - Verify security measures

3. **Deployment Preparation** (DEVOPS)
   - Prepare deployment environment
   - Configure monitoring systems
   - Set up backup procedures
   - Test deployment process

### Phase 4: Deployment and Monitoring
1. **System Deployment** (DEVOPS)
   - Deploy to production environment
   - Monitor deployment process
   - Verify system functionality
   - Implement monitoring alerts

2. **Post-Deployment Testing** (QA)
   - Validate production deployment
   - Monitor system performance
   - Test user workflows
   - Report any issues

3. **Project Closure** (COORD)
   - Generate final project report
   - Document lessons learned
   - Archive project artifacts
   - Conduct post-mortem analysis

## Communication Protocol

### Message Structure
All messages in `comms.md` must follow this structure:

```
[TIMESTAMP] [AGENT_ID] [MESSAGE_TYPE] [TARGET_AGENT/ALL]
Subject: [Brief description]

[Detailed message content]

Status: [PENDING/IN_PROGRESS/COMPLETED/BLOCKED]
Priority: [LOW/MEDIUM/HIGH/CRITICAL]
Tags: [relevant tags]
---
```

### Message Types
- **TASK**: Task assignment or request
- **UPDATE**: Progress update or status change
- **QUESTION**: Request for information or clarification
- **RESPONSE**: Reply to a question or task
- **ALERT**: Important notification or warning
- **APPROVAL**: Request for approval or sign-off
- **CONFLICT**: Report of disagreement or issue
- **COMPLETE**: Task completion notification

### Communication Rules
1. **Mandatory Updates**: All agents must provide status updates every 30 minutes of active work
2. **Response Time**: Responses to questions should be provided within 15 minutes
3. **Conflict Escalation**: Unresolved conflicts must be escalated to COORD within 1 hour
4. **Clear Subjects**: Message subjects must clearly indicate the topic and urgency
5. **Structured Content**: Use consistent formatting for easy parsing

## Task Management

### Task Assignment Process
1. **Task Creation**: COORD or ARCH creates task with clear requirements
2. **Assignment**: Task assigned to appropriate agent based on expertise
3. **Acknowledgment**: Assigned agent confirms task receipt and estimated completion time
4. **Progress Updates**: Regular updates provided during task execution
5. **Completion**: Task marked complete with deliverables and documentation

### Task Priority Levels
- **CRITICAL**: Blocking other work or system-critical issues
- **HIGH**: Important for project timeline or quality
- **MEDIUM**: Standard priority tasks
- **LOW**: Nice-to-have or future enhancements

### Task Status Tracking
- **PENDING**: Task created but not yet started
- **IN_PROGRESS**: Task currently being worked on
- **BLOCKED**: Task cannot proceed due to dependencies
- **REVIEW**: Task complete but awaiting review
- **COMPLETED**: Task fully finished and verified

## Error Handling and Recovery

### Error Categories
1. **Technical Errors**: Code bugs, system failures, integration issues
2. **Communication Errors**: Misunderstandings, missing information
3. **Resource Errors**: Insufficient resources, access issues
4. **Timeline Errors**: Missed deadlines, schedule conflicts

### Recovery Procedures
1. **Immediate Response**: Agent encountering error reports immediately
2. **Impact Assessment**: Evaluate effect on project timeline and quality
3. **Solution Development**: Identify and implement fix or workaround
4. **Prevention Measures**: Update procedures to prevent recurrence
5. **Documentation**: Record error and solution for future reference

## Quality Assurance

### Code Quality Standards
- **Code Reviews**: All code must be reviewed by at least one other agent
- **Testing Requirements**: Minimum 80% test coverage for all components
- **Documentation**: All functions and modules must be documented
- **Style Guidelines**: Consistent code formatting and naming conventions

### Review Process
1. **Self-Review**: Agent reviews own work before submission
2. **Peer Review**: Appropriate specialist agent reviews work
3. **Integration Review**: ARCH reviews for architectural consistency
4. **Quality Review**: QA performs final quality check

## Conflict Resolution

### Conflict Types
- **Technical Disagreements**: Different approaches to implementation
- **Resource Conflicts**: Competing priorities or resource needs
- **Timeline Conflicts**: Disagreements about schedules or priorities
- **Quality Conflicts**: Different standards or approaches

### Resolution Process
1. **Direct Discussion**: Agents attempt to resolve directly
2. **Mediation**: COORD mediates if direct resolution fails
3. **Expert Consultation**: Consult relevant specialist for technical issues
4. **Escalation**: Final decision by COORD if no consensus reached
5. **Documentation**: Record resolution and rationale

## Monitoring and Reporting

### Progress Metrics
- **Task Completion Rate**: Percentage of tasks completed on time
- **Code Quality Metrics**: Test coverage, review pass rate, bug density
- **Communication Metrics**: Response time, message volume, conflict frequency
- **System Performance**: Build success rate, deployment frequency

### Reporting Schedule
- **Hourly**: Agent status updates during active work
- **Daily**: Progress summary and next-day planning
- **Weekly**: Comprehensive project status report
- **Milestone**: Detailed analysis at each project milestone

## Best Practices

### Agent Behavior
1. **Proactive Communication**: Share information before it's requested
2. **Clear Documentation**: Document all decisions and implementations
3. **Collaborative Approach**: Seek input from other agents when appropriate
4. **Continuous Learning**: Learn from mistakes and improve processes
5. **Quality Focus**: Prioritize quality over speed

### System Maintenance
1. **Regular Backups**: Maintain regular backups of all project artifacts
2. **Version Control**: Use consistent version control practices
3. **Security Updates**: Apply security patches and updates promptly
4. **Performance Monitoring**: Continuously monitor system performance
5. **Documentation Updates**: Keep all documentation current and accurate

## Agent Initialization Checklist

When starting work on a project, each agent must:

1. **Identity Verification**: Confirm agent ID and role assignment
2. **Communication Setup**: Verify access to `comms.md` and establish communication
3. **Environment Setup**: Configure development environment and tools
4. **Task Assignment**: Receive and acknowledge initial task assignments
5. **Status Reporting**: Provide initial status and availability
6. **Collaboration Ready**: Confirm ability to work with other agents

## Emergency Procedures

### System Failures
1. **Immediate Notification**: Alert all agents of system failure
2. **Damage Assessment**: Evaluate extent of failure and data loss
3. **Recovery Planning**: Develop recovery strategy and timeline
4. **Implementation**: Execute recovery plan with all agents
5. **Post-Incident Analysis**: Analyze cause and improve procedures

### Critical Bugs
1. **Bug Isolation**: Identify and isolate critical bug
2. **Impact Assessment**: Evaluate bug impact on system and users
3. **Emergency Fix**: Develop and test emergency fix
4. **Deployment**: Deploy fix with minimal disruption
5. **Monitoring**: Monitor system for fix effectiveness

This workflow provides a comprehensive framework for multiple Claude Code agents to collaborate effectively on complex software projects while maintaining clear communication, quality standards, and efficient problem-solving processes.

---

# MerakiCaptivePortal Platform-Specific Multi-Agent Framework

## Platform Architecture Overview

The MerakiCaptivePortal-firebaseDB platform is a sophisticated multi-tenant restaurant/hospitality management system built on Firebase with the following key components:

### Core Technology Stack
- **Backend**: Firebase Functions (Node.js 22), Firebase Realtime Database, Firebase Authentication
- **Frontend**: Vue.js 3, Bootstrap 5, ES6 Modules, Progressive Web App
- **Integrations**: Twilio WhatsApp API, Google Cloud Vision, Firebase Hosting
- **Security**: Custom claims-based authentication, Firebase security rules, GDPR compliance

### Platform Modules
1. **WiFi Captive Portal**: Guest onboarding and authentication
2. **Access Control System**: Tiered subscription management with feature gating
3. **Food Cost Management**: Advanced inventory and purchase order system
4. **WhatsApp Integration**: Conversational AI with receipt processing
5. **Rewards System**: Campaign management and voucher generation
6. **Analytics Dashboard**: Business intelligence and reporting
7. **Admin Tools**: User management and platform administration

### Database Structure
- **Multi-tenant architecture** with location-based data isolation
- **Real-time synchronization** across all platform components
- **Comprehensive security rules** with role-based access control
- **Optimized indexing** for performance at scale

## Platform-Specific Agent Specializations

### Module-Specific Agents
Agents can be specialized for specific platform modules:

#### Food Cost Module Agent (`FOODCOST`)
- **Expertise**: Advanced purchase order calculations, inventory management, cost analytics
- **Key Files**: `public/js/modules/food-cost/`, order calculators, analytics dashboards
- **Responsibilities**: Purchase order optimization, cost driver analysis, inventory forecasting

#### Access Control Agent (`ACCESS`)
- **Expertise**: Subscription tiers, feature gating, user permissions
- **Key Files**: `public/js/modules/access-control/`, tier management, subscription services
- **Responsibilities**: Tier system implementation, permission validation, upgrade workflows

#### WhatsApp Integration Agent (`WHATSAPP`)
- **Expertise**: Conversational AI, receipt processing, messaging workflows
- **Key Files**: `functions/receiveWhatsappMessage.js`, `functions/menuLogic.js`, bot personality
- **Responsibilities**: Chat bot development, receipt OCR integration, message routing

#### Analytics Agent (`ANALYTICS`)
- **Expertise**: Data visualization, reporting, business intelligence
- **Key Files**: Analytics components, chart libraries, data aggregation
- **Responsibilities**: Dashboard development, report generation, performance metrics

## Platform Development Workflows

### Feature Development Workflow
1. **Requirements Analysis** (COORD + relevant specialists)
2. **Architecture Design** (ARCH + module specialists)
3. **Database Schema Updates** (BACK + SEC)
4. **Frontend Implementation** (FRONT + MODULE)
5. **Backend Logic** (BACK + MODULE)
6. **Integration Testing** (QA + MODULE)
7. **Security Validation** (SEC + QA)
8. **Deployment** (DEVOPS + QA)

### Module Enhancement Workflow
1. **Module Analysis** (MODULE + ARCH)
2. **Impact Assessment** (COORD + affected agents)
3. **Parallel Development** (MODULE + FRONT/BACK as needed)
4. **Integration Validation** (QA + MODULE)
5. **Performance Testing** (QA + DEVOPS)
6. **Rollout Planning** (DEVOPS + COORD)

### Bug Fix Workflow
1. **Issue Triage** (QA + relevant specialists)
2. **Root Cause Analysis** (appropriate agent based on component)
3. **Fix Implementation** (specialist agent)
4. **Testing** (QA + affected agents)
5. **Deployment** (DEVOPS + QA)

## Platform-Specific Communication Protocols

### Module Integration Messages
```
[TIMESTAMP] [MODULE_AGENT] INTEGRATION [TARGET_MODULE]
Subject: Module Integration Request - [Feature Name]

Integration Details:
- Source Module: [module name]
- Target Module: [module name]
- Data Flow: [description]
- API Changes: [required changes]
- Dependencies: [list dependencies]

Testing Requirements:
- Unit Tests: [required tests]
- Integration Tests: [required tests]
- Performance Impact: [assessment]

Status: PENDING
Priority: [level]
Tags: integration, module, [module-names]
---
```

### Firebase-Specific Messages
```
[TIMESTAMP] [BACK/DEVOPS] FIREBASE [ALL]
Subject: Firebase Configuration Update - [Component]

Changes:
- Database Rules: [changes]
- Function Updates: [changes]
- Security Claims: [changes]
- Performance Impact: [assessment]

Migration Required: [yes/no]
Rollback Plan: [description]

Status: PENDING
Priority: [level]
Tags: firebase, database, security
---
```

## Platform Quality Standards

### Code Quality Requirements
- **Vue.js Components**: Composition API, TypeScript definitions, proper lifecycle management
- **Firebase Functions**: Error handling, timeout management, proper logging
- **Database Operations**: Optimized queries, proper indexing, security rule compliance
- **Module Integration**: Consistent APIs, proper error propagation, performance optimization

### Testing Standards
- **Unit Tests**: Minimum 80% coverage for all modules
- **Integration Tests**: Cross-module functionality validation
- **Performance Tests**: Load testing for Firebase functions and database operations
- **Security Tests**: Authentication, authorization, and data protection validation

### Security Requirements
- **Firebase Security Rules**: Comprehensive rule validation for all data paths
- **Authentication**: Proper custom claims implementation and validation
- **Data Protection**: GDPR compliance, phone number protection, consent management
- **Access Control**: Tier-based feature restrictions and subscription validation

## Platform-Specific Error Handling

### Firebase-Specific Errors
- **Authentication Errors**: Invalid tokens, expired sessions, insufficient permissions
- **Database Errors**: Connection failures, security rule violations, quota exceeded
- **Function Errors**: Timeout, memory exceeded, cold start issues
- **Integration Errors**: API rate limits, third-party service failures

### Module-Specific Errors
- **Food Cost Module**: Calculation errors, data inconsistencies, performance issues
- **Access Control**: Permission validation failures, subscription mismatches
- **WhatsApp Integration**: Message delivery failures, webhook processing errors
- **Analytics**: Data aggregation errors, chart rendering issues

## Performance Optimization Guidelines

### Frontend Optimization
- **Lazy Loading**: Module-based code splitting and dynamic imports
- **Caching**: Strategic use of browser caching and service worker
- **Bundle Optimization**: Tree shaking and dependency optimization
- **Real-time Updates**: Efficient Firebase listener management

### Backend Optimization
- **Function Performance**: Cold start optimization, memory management
- **Database Optimization**: Query optimization, proper indexing, connection pooling
- **API Efficiency**: Response caching, batch operations, request optimization

## Platform Deployment Considerations

### Firebase Deployment
- **Functions Deployment**: Staged rollout with monitoring
- **Database Rules**: Validation and testing before deployment
- **Hosting**: CDN optimization and cache configuration
- **Security**: Configuration validation and access review

### Multi-Tenant Considerations
- **Data Isolation**: Proper tenant separation and access control
- **Performance**: Scaling considerations for multiple tenants
- **Customization**: Tenant-specific configuration management
- **Billing**: Usage tracking and cost allocation

---

# Generic Multi-Agent Initialization Prompt

## MerakiCaptivePortal Multi-Agent Workflow Initialization


---

**Ready to begin multi-agent collaboration on the MerakiCaptivePortal-firebaseDB platform.**