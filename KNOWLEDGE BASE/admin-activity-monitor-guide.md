# Admin Activity Monitor - User Guide

## 🎯 Overview

The Admin Activity Monitor is a comprehensive real-time surveillance system built into your Settings section that tracks all admin activities, phone number changes, and system operations. It provides complete visibility into what's happening in your admin environment.

## 📍 Location

**Navigate to**: Admin Dashboard → Settings → Admin Activity Monitor section

## 🔧 Features

### **1. 📱 Phone Number Protection Settings**
- **Enable/Disable Phone Number Monitoring** - Toggle real-time phone number surveillance
- **Enable/Disable Visual Alerts** - Control popup notifications
- **Enable/Disable Sound Alerts** - Control audio notifications
- **Test Alert System** - Test all alert types
- **View Statistics** - Detailed phone number monitoring statistics

### **2. 🔍 Real-time Activity Monitoring**
- **Live Activity Feed** - Real-time stream of all admin activities
- **Admin User Tracking** - List of all admin users and their status
- **Phone Number Status** - Real-time phone number health check
- **Operation Statistics** - Count of operations, phone changes, and alerts

### **3. 📊 Filtering & Analysis**
- **Activity Type Filters**:
  - All Activities
  - Phone Changes
  - User Operations
  - Admin Actions
  - Critical Alerts

- **Time Filters**:
  - Last Hour
  - Last 24 Hours
  - Last Week
  - All Time

### **4. 📤 Export & Reporting**
- **Export Activity Log** - Download complete activity log as CSV
- **Generate Report** - Create comprehensive system report
- **Statistics Dashboard** - Real-time metrics and insights

## 🚀 How to Use

### **Step 1: Access the Monitor**
1. Go to Admin Dashboard
2. Click "Settings" in the sidebar
3. Scroll down to "Admin Activity Monitor" section

### **Step 2: Start Monitoring**
1. Click **"Start Monitoring"** button
2. The system begins tracking all admin activities in real-time
3. Watch the Activity Feed populate with live events

### **Step 3: Configure Alerts**
1. Use checkboxes to enable/disable different alert types
2. Click **"Test Alert System"** to verify alerts work
3. Adjust settings based on your preferences

### **Step 4: Monitor Activity**
- **Activity Feed** shows real-time events
- **Active Admin Users** lists all current admin users
- **Phone Number Status** shows health of admin phone numbers
- **Quick Stats** provides overview metrics

## 📋 What Gets Monitored

### **🔴 Critical Events (Immediate Alerts)**
- **Admin phone numbers deleted** - When admin users lose phone numbers
- **Admin status changes** - When users gain/lose admin privileges
- **Missing phone numbers** - When admin users don't have phone numbers
- **Recent updates removing phone data** - When updates accidentally delete phone numbers

### **🟡 Warning Events**
- **Suspicious patterns** - Unusual activity that might indicate problems
- **Empty phone fields** - Phone number fields set to empty strings
- **Bulk operations** - Large-scale changes that might affect multiple users

### **🔵 Info Events**
- **Phone number changes** - Legitimate phone number updates
- **Admin operations** - Normal admin activities
- **System events** - Monitoring system status changes
- **Settings changes** - Configuration modifications

### **🛠️ System Operations**
- **User creation/modification** - Admin user management activities
- **Database operations** - Operations that affect user data
- **Authentication events** - Admin login/logout activities
- **Monitoring system events** - System health and status changes

## 📊 Understanding the Interface

### **Control Panel**
```
🔧 Monitoring Controls        📊 Quick Stats
┌─────────────────────────┐   ┌─────────────────────────┐
│ [Start Monitoring]      │   │ Operations: 45          │
│ [Pause Monitoring]      │   │ Phone Changes: 3        │
│ [Clear Logs]           │   │ Alerts: 1               │
└─────────────────────────┘   └─────────────────────────┘
```

### **Activity Feed**
```
🔄 Real-time Activity Feed
┌─────────────────────────────────────────────────────────┐
│ 📱 Phone number changed for admin user 2m ago          │
│ 👤 Admin status changed for user 5m ago                │
│ 🔍 Phone number monitoring started 10m ago             │
│ ⚠️ Suspicious pattern detected 15m ago                 │
└─────────────────────────────────────────────────────────┘
```

### **Side Panels**
```
👥 Active Admin Users     📱 Phone Number Status
┌─────────────────────┐   ┌─────────────────────┐
│ John Doe (You) ✅   │   │ With Phone: 4       │
│ Jane Smith     ✅   │   │ Missing: 1          │
│ Bob Wilson     ❌   │   │ Total: 5            │
└─────────────────────┘   └─────────────────────┘
```

## 🚨 Alert Types Explained

### **🚨 Critical Alerts**
**What triggers them:**
- Admin user phone number is deleted
- Admin user has no phone number
- Recent update removed phone number

**What you see:**
- Red popup in top-right corner
- High-pitched beep sound
- SweetAlert modal with action buttons
- Red entry in activity feed

**Actions available:**
- Go to Phone Mapping tool
- View detailed information
- Export incident report

### **⚠️ Warning Alerts**
**What triggers them:**
- Suspicious activity patterns
- Empty phone number fields
- Multiple concerning changes

**What you see:**
- Yellow popup notification
- Medium-pitched beep
- Yellow entry in activity feed

### **ℹ️ Info Alerts**
**What triggers them:**
- Legitimate phone number changes
- Normal admin operations
- System status updates

**What you see:**
- Blue popup notification
- Low-pitched beep
- Blue entry in activity feed

## 📈 Using Filters

### **Activity Type Filters**
- **All Activities** - Shows everything
- **Phone Changes** - Only phone number related events
- **User Operations** - User creation, modification, deletion
- **Admin Actions** - Admin privilege changes, admin operations
- **Critical Alerts** - Only critical/dangerous events

### **Time Filters**
- **Last Hour** - Events from past 60 minutes
- **Last 24 Hours** - Events from past day
- **Last Week** - Events from past 7 days
- **All Time** - Complete history

## 📤 Exporting Data

### **Export Activity Log**
1. Apply desired filters
2. Click **"Export Activity Log"**
3. Downloads CSV file with filtered activities
4. File format: `admin-activity-log-YYYY-MM-DD.csv`

**CSV Columns:**
- Timestamp
- Type
- Description
- User ID
- Details (JSON)

### **Generate Report**
1. Click **"Generate Report"**
2. View summary in popup
3. Click **"Export Full Report"** for complete JSON
4. File format: `admin-activity-report-YYYY-MM-DD.json`

**Report Includes:**
- Statistics summary
- Admin user count and status
- Phone number health overview
- Recent activities
- Monitoring status

## 🛠️ Troubleshooting

### **If Monitoring Doesn't Start**
1. Check browser console for errors
2. Verify you're logged in as admin
3. Refresh the page and try again
4. Check Firebase connection

### **If No Activities Show**
1. Make sure monitoring is started (green button)
2. Perform some admin operations to generate events
3. Check time filter settings
4. Clear logs and restart monitoring

### **If Alerts Don't Work**
1. Check phone number protection settings are enabled
2. Test using **"Test Alert System"** button
3. Check browser console for errors
4. Verify sound permissions in browser

### **If Phone Numbers Show as Missing**
1. Check if users actually have phone numbers in database
2. Use **"View Statistics"** for detailed information
3. Go to Admin Phone Mapping tool to add missing numbers
4. Check recent activity feed for deletion events

## 🎯 Best Practices

### **Daily Monitoring**
1. **Start monitoring** when you begin admin work
2. **Check statistics** regularly for unusual patterns
3. **Review activity feed** for unexpected events
4. **Export logs** weekly for audit trail

### **Alert Management**
1. **Keep alerts enabled** for immediate notification
2. **Test alert system** monthly to ensure it works
3. **Review critical alerts** immediately
4. **Document** any unusual patterns

### **Data Management**
1. **Export logs** before clearing them
2. **Generate reports** monthly for review
3. **Filter activities** to focus on specific issues
4. **Keep monitoring active** during admin sessions

## 📞 Quick Actions

### **Emergency Response**
If you see critical phone number alerts:
1. **Don't panic** - the system caught it
2. **Click alert action buttons** for quick access to tools
3. **Use Phone Mapping tool** to restore missing numbers
4. **Check activity feed** to understand what happened
5. **Export incident report** for documentation

### **Routine Maintenance**
- **Weekly**: Export activity logs
- **Monthly**: Generate comprehensive reports
- **As needed**: Clear old logs to free space
- **Always**: Keep monitoring active during admin work

## 💡 Pro Tips

1. **Use filters effectively** - Don't get overwhelmed by all activities
2. **Watch for patterns** - Multiple similar events might indicate systemic issues
3. **Export before clearing** - Always backup logs before deletion
4. **Test regularly** - Monthly alert tests ensure system reliability
5. **Monitor phone status** - Keep eye on admin users without phone numbers

---

## 🎯 Summary

The Admin Activity Monitor provides complete visibility into your admin environment with:

- **Real-time tracking** of all admin activities
- **Immediate alerts** for critical phone number issues
- **Comprehensive filtering** and analysis tools
- **Export capabilities** for audit trails
- **Historical reporting** for trend analysis

**Keep it running whenever you're doing admin work to ensure complete oversight of your system!** 📊🔍