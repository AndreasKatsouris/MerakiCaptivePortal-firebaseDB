# Receipt Settings - Admin User Guide

**Last Updated:** November 15, 2025
**Version:** 1.0.0
**For:** Admin Users (Non-Developers)

---

## Table of Contents

1. [Introduction](#introduction)
2. [Accessing Receipt Settings](#accessing-receipt-settings)
3. [Understanding Templates](#understanding-templates)
4. [Creating Your First Template](#creating-your-first-template)
5. [Managing Existing Templates](#managing-existing-templates)
6. [Monitoring Performance](#monitoring-performance)
7. [Troubleshooting](#troubleshooting)
8. [Best Practices](#best-practices)
9. [Frequently Asked Questions](#frequently-asked-questions)

---

## Introduction

### What is Receipt Settings?

Receipt Settings is a tool that allows you to teach the system how to read receipts from different restaurants and stores **without requiring a developer**. Instead of waiting for code changes every time you add a new brand, you can create "templates" that tell the system where to find information on receipts.

### Why Do We Need Templates?

Different restaurants format their receipts differently. For example:
- Ocean Basket might put the total at the bottom as "Bill Total"
- Another restaurant might write "TOTAL AMOUNT"
- Some receipts have the date on line 1, others on line 10

Templates teach the system these differences so it can extract data accurately.

### Key Benefits

✅ **No Coding Required** - Create templates through a visual interface
✅ **Immediate Updates** - Templates work right away after saving
✅ **Performance Tracking** - See how well each template is working
✅ **Easy Maintenance** - Update patterns when receipts change format

---

## Accessing Receipt Settings

### Step 1: Log In to Admin Dashboard

1. Go to your admin dashboard URL (e.g., `https://yoursite.web.app/admin-dashboard.html`)
2. Enter your admin credentials
3. Wait for the dashboard to load

### Step 2: Navigate to Receipt Settings

**Option A - From Sidebar:**
1. Click on **"Engage"** in the left sidebar
2. Click on **"Receipt Settings"**
3. Click the **"Open Receipt Settings"** button

**Option B - Direct Link:**
- Go directly to `https://yoursite.web.app/receipt-settings.html`

---

## Understanding Templates

### What is a Template?

A template is a set of instructions that tells the system:
- What brand/restaurant this template is for
- Where to find key information on the receipt:
  - Brand name (e.g., "Ocean Basket")
  - Store location (e.g., "The Grove")
  - Invoice number
  - Date and time
  - Total amount
  - Line items (what was ordered)

### Template Priority

Templates have a **priority** number from 1-10:
- **10 = Highest priority** - Checked first
- **1 = Lowest priority** - Checked last

Use higher priority for:
- More specific templates (e.g., "Ocean Basket - Grove Mall")
- Newer, more accurate templates
- Templates with higher success rates

### Template Status

Templates can have three statuses:

| Status | Meaning | When to Use |
|--------|---------|-------------|
| **Testing** | Template is being tested | New templates you're not sure about yet |
| **Active** | Template is fully operational | Templates that work well and are proven |
| **Deprecated** | Template is no longer used | Old templates you want to disable |

---

## Creating Your First Template

### Prerequisites

Before creating a template, you need:
1. ✅ A clear, readable receipt image (JPG or PNG)
2. ✅ The receipt should be from a validated transaction
3. ✅ Admin access to Receipt Settings

### Step-by-Step Wizard

#### Step 1: Basic Information

1. Click **"Create Template"** button
2. Fill in the template information:

   **Template Name:**
   Give it a descriptive name
   Example: `Ocean Basket - Standard Format`

   **Brand Name:**
   The restaurant/store name
   Example: `Ocean Basket`

   **Store/Location Name:** (Optional)
   Specific location if format varies by store
   Example: `The Grove Mall`

   **Priority:**
   Start with `5` (medium priority)
   Adjust later based on performance

   **Description:** (Optional)
   Notes about when to use this template
   Example: `Standard format for Ocean Basket receipts with Bill Total at bottom`

   **Initial Status:**
   Choose `Testing` for new templates

3. Click **"Next"**

#### Step 2: Upload Receipt Image

1. Click **"Drop receipt image here or click to browse"**
2. Select a clear image of your example receipt
3. Wait for the image preview to appear
4. Click **"Next"**

The system will now perform OCR (Optical Character Recognition) to extract all text from the receipt. This takes 10-20 seconds.

#### Step 3: Review OCR Text

1. Review the extracted text on the left side (full text)
2. Check the line-by-line breakdown on the right
3. Make sure the OCR captured all important information
4. If text looks wrong, go back and upload a clearer image
5. Click **"Next"**

#### Step 4: Mark Fields

This is the most important step! You'll tell the system where to find each field.

**Instructions:**
1. Select a field from the list on the left (e.g., "Brand Name")
2. Click on the line in the receipt that contains that field
3. The line will be marked with a badge showing the field name
4. Repeat for all required fields:
   - ✅ **Brand Name** (Required)
   - ✅ **Invoice Number** (Required)
   - ✅ **Total Amount** (Required)
   - Store Name (Optional but recommended)
   - Date (Recommended)
   - Time (Optional)
   - Waiter Name (Optional)
   - Table Number (Optional)

**Tips:**
- Mark the line that contains the actual data, not the label
- For "Total Amount", mark the **final total** (not subtotals)
- Be precise - clicking the wrong line will create incorrect patterns

5. Click **"Next"** when all required fields are marked

#### Step 5: Review Generated Patterns

The system automatically generates extraction patterns based on your selections.

**What You'll See:**
- Regex Pattern - The computer code that finds the field
- Line Range - Which lines to search (optional)
- Confidence - How confident the system should be (0-100%)

**What You Can Do:**
- Review each pattern to ensure it looks reasonable
- Adjust line ranges if needed (advanced)
- Modify confidence scores (usually leave as-is)

**Example Pattern:**
```
Field: totalAmount
Regex: Bill\s+Total\s+(\d+\.\d{2})
Line Range: (not set - searches whole receipt)
Confidence: 95%
```

This pattern says: "Find text that says 'Bill Total' followed by a number with 2 decimal places"

6. Click **"Next"**

#### Step 6: Review & Save

1. Review the complete template configuration
2. Check that all information is correct
3. Click **"Save Template"**

✅ **Success!** Your template is now created and ready to use.

---

## Managing Existing Templates

### Viewing Templates

The main Receipt Settings page shows all your templates as cards.

**Card Information:**
- Template name and brand
- Status badge (Active, Testing, Deprecated)
- Priority number
- Success rate percentage
- Number of times used
- Average confidence score

### Sorting and Filtering

**Filter by Brand:**
Type in the search box to find templates for specific brands

**Filter by Status:**
Select from dropdown: All, Active, Testing, or Deprecated

**Sort By:**
- **Priority** - Shows highest priority first
- **Success Rate** - Shows best-performing templates first
- **Usage Count** - Shows most-used templates first
- **Created Date** - Shows newest templates first

**Minimum Success Rate:**
Enter a number (0-100) to only show templates above that success rate

### Viewing Template Details

1. Click the **"View"** button (eye icon) on any template card
2. A modal will open showing:
   - Complete template information
   - All extraction patterns
   - Example receipt image (if uploaded)
3. Click **"Edit Template"** to modify (requires wizard - future feature)

### Editing Templates

**Current Method (Manual):**
For now, template editing requires accessing Firebase Console:

1. Open [Firebase Console](https://console.firebase.google.com)
2. Select your project
3. Go to **Realtime Database**
4. Navigate to `receiptTemplates`
5. Find your template by ID
6. Click to expand and edit fields
7. Make changes carefully
8. Click **"Save"**

**Future:** A visual editing wizard will be available in a future update.

### Activating a Template

Once you've tested a template and confirmed it works:

1. View the template details
2. Note the template ID or name
3. Go to Firebase Console → Realtime Database
4. Find the template under `receiptTemplates`
5. Change `status` from `"testing"` to `"active"`
6. Save changes

### Deprecating a Template

When a template is no longer needed or performs poorly:

1. Find the template card
2. Click the **trash icon** button
3. Confirm deprecation
4. The template will be marked as deprecated (not deleted)

**Note:** Deprecated templates are kept for historical records but won't be used for new receipts.

---

## Monitoring Performance

### Template Statistics

Each template card shows key metrics:

**Success Rate:**
Percentage of successful extractions using this template
- 🟢 **90%+** = Excellent
- 🟡 **70-89%** = Good
- 🔴 **Below 70%** = Needs improvement

**Usage Count:**
How many times this template has been tried

**Average Confidence:**
Average confidence score when successful
- Higher is better
- Should be above 70%

### Performance Dashboard

Click the **chart icon** on a template to see detailed performance:

**Summary Stats:**
- Total uses
- Successes
- Failures
- Success rate

**Performance Chart:**
- Visual graph showing recent success/failure pattern
- Confidence scores over time

**Recent Activity Log:**
- Last 20 uses of this template
- Timestamp, result, confidence, processing time
- Receipt ID for each attempt

### Interpreting Performance Data

**High Success Rate (90%+):**
✅ Template is working well
✅ Keep as Active
✅ Consider increasing priority

**Medium Success Rate (70-89%):**
⚠️ Template works but may need refinement
⚠️ Review failed logs to identify issues
⚠️ Consider creating a more specific template

**Low Success Rate (Below 70%):**
❌ Template needs improvement or deprecation
❌ Check if receipt format has changed
❌ Create a new template with corrected patterns

---

## Troubleshooting

### Template Not Working

**Symptom:** Template shows low success rate or many failures

**Possible Causes & Solutions:**

1. **Receipt format changed**
   - Check recent receipts against your example
   - Look for differences in wording or layout
   - Create a new template if format significantly different

2. **Patterns too specific**
   - Patterns might be matching exact text that varies slightly
   - Example: "Bill Total: R524.00" won't match "Bill Total R524.00"
   - Solution: Adjust patterns to be more flexible

3. **Wrong line range**
   - Pattern might be searching wrong section of receipt
   - Solution: Remove or adjust line range constraints

4. **Competing templates**
   - Multiple templates for same brand might conflict
   - Solution: Deprecate older templates or adjust priorities

### Template Never Gets Used

**Symptom:** Usage count stays at 0

**Possible Causes & Solutions:**

1. **Brand name mismatch**
   - Template brand name doesn't match receipt
   - Check exact spelling and capitalization
   - Example: "Ocean Basket" vs "OCEAN BASKET"

2. **Status is "Deprecated"**
   - Template won't be used if deprecated
   - Solution: Change status to "Testing" or "Active"

3. **Lower priority than other templates**
   - Another template is being used first and succeeding
   - Solution: Check other templates with same brand
   - Adjust priorities if needed

### OCR Text Looks Wrong

**Symptom:** Text extraction in Step 3 is garbled or missing content

**Solutions:**

1. **Take a better photo**
   - Ensure good lighting
   - Hold camera steady and directly above receipt
   - Avoid shadows and glare
   - Make sure receipt is flat (no wrinkles)

2. **Try a different image**
   - Some receipts have faded ink
   - Try scanning instead of photographing
   - Increase image contrast if possible

3. **Check receipt quality**
   - Thermal receipts fade over time
   - Use recent receipts when creating templates

### "No Templates Available" Error

**Symptom:** System says no templates found

**Possible Causes & Solutions:**

1. **No templates created yet**
   - Create your first template
   - Follow the step-by-step wizard

2. **All templates deprecated**
   - Check template list
   - Activate at least one template

3. **Database connection issue**
   - Check internet connection
   - Refresh the page
   - Contact technical support if persists

---

## Best Practices

### Creating Templates

1. ✅ **Use Clear, Recent Receipts**
   - Fresh receipts with dark, readable text
   - Good lighting when photographing
   - Avoid folded or damaged receipts

2. ✅ **Start with "Testing" Status**
   - Mark new templates as "Testing"
   - Monitor performance for 20-30 uses
   - Change to "Active" once proven

3. ✅ **Be Specific with Template Names**
   - Include brand name
   - Include location if format varies
   - Include version or date if updating
   - Example: "Ocean Basket - Grove - v2 (Nov 2025)"

4. ✅ **Test Before Activating**
   - Upload a test receipt after creating template
   - Verify all fields extract correctly
   - Check confidence scores are above 70%

### Managing Templates

1. ✅ **Regular Performance Reviews**
   - Check template stats weekly
   - Deprecate poorly performing templates
   - Update templates when formats change

2. ✅ **Use Priority Strategically**
   - Higher priority (8-10) for location-specific templates
   - Medium priority (4-7) for brand-wide templates
   - Lower priority (1-3) for fallback/generic templates

3. ✅ **Maintain Template Library**
   - Document why each template was created
   - Keep descriptions up-to-date
   - Remove deprecated templates after 6 months

4. ✅ **Create Backups**
   - Document successful templates
   - Save example receipt images
   - Export template configurations periodically

### Optimization Tips

1. **Multiple Templates for Same Brand**
   - Create separate templates for different locations if formats vary
   - Use higher priority for more common formats
   - Keep generic fallback template at lower priority

2. **Pattern Accuracy**
   - Mark required fields (Brand, Invoice, Total) first
   - Add optional fields only if consistently present
   - Remove fields that vary too much

3. **Response to Format Changes**
   - When a restaurant updates receipt format:
     - Create new template with higher priority
     - Test new template thoroughly
     - Deprecate old template after confirming new one works
     - Keep old template for historical data

---

## Frequently Asked Questions

### General Questions

**Q: Do I need coding experience to use Receipt Settings?**
A: No! The wizard guides you through creating templates without any code.

**Q: How long does it take to create a template?**
A: About 5-10 minutes per template, including testing.

**Q: Will templates work immediately after saving?**
A: Yes! Templates are active right away and will be used for the next receipt upload.

**Q: Can I have multiple templates for the same brand?**
A: Yes! Use priority to control which one is tried first.

### Technical Questions

**Q: What is OCR?**
A: OCR (Optical Character Recognition) is technology that reads text from images. It converts your receipt photo into searchable text.

**Q: What is a regex pattern?**
A: A regex (regular expression) is a search pattern. The wizard creates these automatically based on the lines you select.

**Q: What does confidence score mean?**
A: Confidence is how sure the system is that it found the right data. 70%+ is considered reliable.

**Q: Why do some templates have line ranges?**
A: Line ranges tell the system to only search specific parts of the receipt, which can improve accuracy and speed.

### Troubleshooting Questions

**Q: My template success rate is only 60%. What should I do?**
A: Check the performance logs to see why extractions are failing. You may need to adjust patterns or create a new template.

**Q: The system uses the wrong template. How do I fix this?**
A: Adjust template priorities. The template you want should have a higher priority number.

**Q: Can I delete a template permanently?**
A: Templates are deprecated, not deleted, to preserve historical data. Contact an administrator for permanent deletion if needed.

**Q: What happens if no template matches?**
A: The system falls back to the original extraction method, so receipts will still be processed (though possibly less accurately).

### Performance Questions

**Q: How many templates can I create?**
A: There's no hard limit, but keep your library organized. Aim for 1-3 templates per brand/location.

**Q: Will too many templates slow down processing?**
A: No. The system checks templates in priority order and stops at the first success.

**Q: Should I deprecate old templates?**
A: Yes, if they're no longer accurate or have been replaced by better templates.

---

## Getting Help

### Support Resources

**Documentation:**
- [Technical Implementation Guide](./RECEIPT_SETTINGS_IMPLEMENTATION_STATUS.md)
- [Developer Handoff Guide](./RECEIPT_SETTINGS_HANDOFF_GUIDE.md)
- [Receipt Processing Overview](./RECEIPT_PROCESSING_FIX_SUMMARY.md)

**Contact:**
- Email: support@yourcompany.com
- Slack: #admin-support channel
- Phone: +1-XXX-XXX-XXXX

### Reporting Issues

When reporting issues, please include:
1. Template name and ID
2. Screenshot of the issue
3. Example receipt image (if applicable)
4. Error messages or unexpected behavior
5. Browser and device information

---

## Appendix: Quick Reference

### Template Creation Checklist

- [ ] Have clear receipt image ready
- [ ] Logged in to admin dashboard
- [ ] Opened Receipt Settings
- [ ] Clicked "Create Template"
- [ ] Filled in template name, brand, priority
- [ ] Uploaded receipt image
- [ ] Reviewed OCR text
- [ ] Marked all required fields (Brand, Invoice, Total)
- [ ] Reviewed generated patterns
- [ ] Saved template
- [ ] Tested with a sample receipt
- [ ] Monitored performance for 20+ uses
- [ ] Activated template (changed status to "Active")

### Priority Guidelines

| Priority | Use Case | Example |
|----------|----------|---------|
| 9-10 | Very specific, proven templates | "Ocean Basket - Grove - Till 3" |
| 7-8 | Location-specific templates | "Ocean Basket - Grove" |
| 5-6 | Brand-wide templates | "Ocean Basket - Standard" |
| 3-4 | Generic/fallback templates | "Generic Restaurant Receipt" |
| 1-2 | Legacy or experimental templates | "Old Format - Keep for Reference" |

### Status Meanings

| Status | Icon | Meaning | Action Needed |
|--------|------|---------|---------------|
| Testing | 🟡 | New, being evaluated | Monitor performance |
| Active | 🟢 | Fully operational | Regular monitoring |
| Deprecated | 🔴 | No longer used | Review for deletion |

---

**End of Admin Guide**

*Last Updated: November 15, 2025*
*Version: 1.0.0*
*For questions or updates, contact the platform administrator*
