DEFAULT 2025-08-02T13:57:49.100258Z Received payload: { "SmsMessageSid": "SM205ec2fa4a2a231b25d35493aafb20bc", "NumMedia": "0", "ProfileName": "Andreas", "MessageType": "text", "SmsSid": "SM205ec2fa4a2a231b25d35493aafb20bc", "WaId": "27827001116", "SmsStatus": "received", "Body": "YES", "To": "whatsapp:+27600717304", "NumSegments": "1", "ReferralNumMedia": "0", "MessageSid": "SM205ec2fa4a2a231b25d35493aafb20bc", "AccountSid": "ACe16ed0568c81a9febd64f304b0aedbaf", "ChannelMetadata": "{\"type\":\"whatsapp\",\"data\":{\"context\":{\"ProfileName\":\"Andreas\",\"WaId\":\"27827001116\"}}}", "From": "whatsapp:+27827001116", "ApiVersion": "2010-04-01" }
DEFAULT 2025-08-02T13:57:49.100301Z 🔍 Step 1: Validating request...
DEFAULT 2025-08-02T13:57:49.100343Z Request validation passed
DEFAULT 2025-08-02T13:57:49.100405Z ✅ Step 1: Request validation passed
DEFAULT 2025-08-02T13:57:49.100489Z 🔍 Step 2: Extracting request data...
DEFAULT 2025-08-02T13:57:49.100558Z ✅ Step 2: Request data extracted: { Body: 'YES', From: 'whatsapp:+27827001116', To: 'whatsapp:+27600717304', MediaUrl0: undefined }
DEFAULT 2025-08-02T13:57:49.100619Z 🔍 Step 3: Normalizing phone numbers...
DEFAULT 2025-08-02T13:57:49.100682Z ✅ Step 3: Phone numbers normalized: { fromNumber: '+27827001116', toNumber: '+27600717304' }
DEFAULT 2025-08-02T13:57:49.100745Z 📱 Message from +27827001116 to +27600717304
DEFAULT 2025-08-02T13:57:49.100786Z 🔍 Step 4: Checking location mappings in database...
DEFAULT 2025-08-02T13:57:49.100891Z Database path: location-whatsapp-mapping
DEFAULT 2025-08-02T13:57:49.107226Z ✅ Step 4: Database query completed
DEFAULT 2025-08-02T13:57:49.107341Z 📋 Available location mappings:
DEFAULT 2025-08-02T13:57:49.107405Z 📍 Location -OSKIKiRLR-OeWqP7ZI-: +27600717304 (active: true)
DEFAULT 2025-08-02T13:57:49.107457Z 📍 Location -OSKL7AJj6ErxYy3jgpD: undefined (active: false)
DEFAULT 2025-08-02T13:57:49.107494Z 🔍 Step 5: Getting location context...
DEFAULT 2025-08-02T13:57:49.107565Z 🔍 Looking up location for receiving number: +27600717304
DEFAULT 2025-08-02T13:57:49.107620Z 🔍 Original toNumber: +27600717304
DEFAULT 2025-08-02T13:57:49.107669Z 🔍 Normalized receiving number: +27600717304
DEFAULT 2025-08-02T13:57:49.107716Z 🔍 DEBUG: Checking database for location mappings...
DEFAULT 2025-08-02T13:57:49.107770Z Database path: location-whatsapp-mapping
DEFAULT 2025-08-02T13:57:49.112544Z 🔍 DEBUG: Found 2 location mappings in database:
DEFAULT 2025-08-02T13:57:49.112793Z 🔍 DEBUG: Location -OSKIKiRLR-OeWqP7ZI-: +27600717304 (active: true) (locationName: Ocean Basket The Grove)
DEFAULT 2025-08-02T13:57:49.112894Z 🔍 DEBUG: Comparison - Looking for: "+27600717304" vs Found: "+27600717304" (match: true)
DEFAULT 2025-08-02T13:57:49.112904Z 🔍 DEBUG: Location -OSKL7AJj6ErxYy3jgpD: undefined (active: false) (locationName: Ocean Basket Brits)
DEFAULT 2025-08-02T13:57:49.112928Z 🔍 DEBUG: Comparison - Looking for: "+27600717304" vs Found: "undefined" (match: false)
DEFAULT 2025-08-02T13:57:49.113Z 🔍 DEBUG: Calling getLocationByWhatsApp with: +27600717304
DEFAULT 2025-08-02T13:57:49.113076Z 🔍 DEBUG: Looking for location with WhatsApp number: +27600717304
DEFAULT 2025-08-02T13:57:49.113132Z Database path: location-whatsapp-mapping
DEFAULT 2025-08-02T13:57:49.118101Z 🔍 DEBUG: Found mappings: [ '-OSKIKiRLR-OeWqP7ZI-', '-OSKL7AJj6ErxYy3jgpD' ]
DEFAULT 2025-08-02T13:57:49.118174Z 🔍 DEBUG: Checking location -OSKIKiRLR-OeWqP7ZI-: +27600717304 (isActive: true, active: undefined)
DEFAULT 2025-08-02T13:57:49.118230Z 🔍 DEBUG: Phone number match! Active status: true
DEFAULT 2025-08-02T13:57:49.118288Z ✅ DEBUG: Found active mapping for location -OSKIKiRLR-OeWqP7ZI-
DEFAULT 2025-08-02T13:57:49.118740Z 🔍 DEBUG: getLocationByWhatsApp returned: { locationId: '-OSKIKiRLR-OeWqP7ZI-', mapping: { assignedAt: '2025-07-20T18:11:06.555Z', isActive: true, locationId: '-OSKIKiRLR-OeWqP7ZI-', locationName: 'Ocean Basket The Grove', phoneNumber: '+27600717304', repairTimeStamp: 1753036178251, repaired: true, status: 'active', userId: 'OTnjPiIxRNejaJuaxoPrbFBw3L42', whatsappNumberId: '27600717304' } }
DEFAULT 2025-08-02T13:57:49.118786Z ✅ Found location context: { locationId: '-OSKIKiRLR-OeWqP7ZI-', locationName: 'Ocean Basket The Grove', whatsappNumber: '+27600717304' }
DEFAULT 2025-08-02T13:57:49.118884Z ✅ DEBUG: Full location data: { "locationId": "-OSKIKiRLR-OeWqP7ZI-", "mapping": { "assignedAt": "2025-07-20T18:11:06.555Z", "isActive": true, "locationId": "-OSKIKiRLR-OeWqP7ZI-", "locationName": "Ocean Basket The Grove", "phoneNumber": "+27600717304", "repairTimeStamp": 1753036178251, "repaired": true, "status": "active", "userId": "OTnjPiIxRNejaJuaxoPrbFBw3L42", "whatsappNumberId": "27600717304" } }
DEFAULT 2025-08-02T13:57:49.118932Z ✅ Step 5: Location context query completed
DEFAULT 2025-08-02T13:57:49.119095Z Database path: guests/+27827001116
DEFAULT 2025-08-02T13:57:49.126658Z 👤 Guest data with location context: { phoneNumber: '+27827001116', name: 'Andreas Katsouris', currentLocationId: '-OSKIKiRLR-OeWqP7ZI-', locationName: 'Ocean Basket The Grove' }
DEFAULT 2025-08-02T13:57:49.126772Z [checkConsent] Input guest data: { "consent": false, "consentPending": true, "createdAt": 1752154541030, "currentLocationId": "-OSKIKiRLR-OeWqP7ZI-", "lastCascadeUpdate": 1753039902996, "lastConsentPrompt": 1754143051618, "lastInteraction": 1754143051613, "lastLocationUpdate": 1753038291866, "name": "Andreas Katsouris", "nameUpdateHistory": { "1753039902996": { "newName": "Andreas Katsouris", "oldName": "Andreas Katsouris", "updatedRecords": { "other": 0, "receipts": 0, "rewards": 1 } } }, "phoneNumber": "+27827001116", "processing": false, "tier": "Bronze", "updatedAt": "2025-08-02T13:57:24.682Z" }
DEFAULT 2025-08-02T13:57:49.126810Z [checkConsent] Guest has consentPending=true, staying in flow
DEFAULT 2025-08-02T13:57:49.126964Z 📋 Consent status: { hasConsent: false, requiresConsent: true }
DEFAULT 2025-08-02T13:57:49.127045Z ✅ Processing consent message or response
DEFAULT 2025-08-02T13:57:49.127176Z Processing consent acceptance for: +27827001116
DEFAULT 2025-08-02T13:57:49.127313Z Consent data to save: { "status": "accepted", "timestamp": 1754143069128, "version": "1.0", "platform": "whatsapp" }
DEFAULT 2025-08-02T13:57:49.127322Z Database path: guests/+27827001116
DEFAULT 2025-08-02T13:57:49.127384Z Updating consent data...
DEFAULT 2025-08-02T13:57:49.127403Z Database path: guests/+27827001116/consent
DEFAULT 2025-08-02T13:57:49.132840Z ✅ Consent data updated successfully
DEFAULT 2025-08-02T13:57:49.132908Z Clearing consent pending flag...
DEFAULT 2025-08-02T13:57:49.132969Z Database path: guests/+27827001116/consentPending
DEFAULT 2025-08-02T13:57:49.138416Z ✅ Consent pending flag cleared successfully
DEFAULT 2025-08-02T13:57:49.138477Z Verifying consent pending flag was cleared...
DEFAULT 2025-08-02T13:57:49.138547Z Database path: guests/+27827001116/consentPending
DEFAULT 2025-08-02T13:57:49.146989Z Verified consentPending value: null
DEFAULT 2025-08-02T13:57:49.147056Z Saving to consent history...
DEFAULT 2025-08-02T13:57:49.147156Z Database path: consent-history/+27827001116/1754143069148
DEFAULT 2025-08-02T13:57:49.154747Z ✅ Consent history saved successfully
DEFAULT 2025-08-02T13:57:49.154832Z Forcing database sync...
DEFAULT 2025-08-02T13:57:49.256351Z All consent updates completed successfully
