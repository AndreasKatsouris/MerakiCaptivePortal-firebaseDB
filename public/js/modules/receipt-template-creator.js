/**
 * Receipt Template Creator Wizard
 * Interactive wizard for creating receipt extraction templates
 * Version: 1.0.0
 */

import { auth } from '../config/firebase-config.js';

// Firebase Functions endpoint (adjust based on your project)
const FUNCTIONS_URL = 'https://us-central1-merakicaptiveportal-firebasedb.cloudfunctions.net';

/**
 * Template Creator Class
 * Manages the multi-step wizard for template creation
 */
export class TemplateCreator {
    constructor(existingTemplate = null) {
        this.isEditMode = !!existingTemplate;
        this.templateId = existingTemplate?.id || null;
        this.currentStep = 1;
        this.maxSteps = 6;

        // Initialize with existing template data or defaults
        this.templateData = existingTemplate ? {
            templateName: existingTemplate.templateName || '',
            brandName: existingTemplate.brandName || '',
            storeName: existingTemplate.storeName || '',
            description: existingTemplate.description || '',
            status: existingTemplate.status || 'testing',
            priority: existingTemplate.priority || 5,
            patterns: existingTemplate.patterns || {},
            exampleImageUrl: existingTemplate.exampleImageUrl || null,
            exampleOcrText: existingTemplate.exampleOcrText || ''
        } : {
            templateName: '',
            brandName: '',
            storeName: '',
            description: '',
            status: 'testing',
            priority: 5,
            patterns: {},
            exampleImageUrl: null,
            exampleOcrText: ''
        };

        this.ocrResult = null;
        this.selectedLines = {};
        this.idToken = null;
    }

    /**
     * Initialize and show the wizard modal
     */
    async show() {
        await this.ensureAuth();
        this.renderWizard();
        this.showModal();
    }

    /**
     * Ensure user is authenticated
     */
    async ensureAuth() {
        const user = auth.currentUser;
        if (!user) {
            console.error('No current user found');
            throw new Error('User not authenticated');
        }

        console.log('Getting ID token for user:', user.uid);
        this.idToken = await user.getIdToken(true); // Force refresh
        console.log('ID token obtained:', this.idToken ? `${this.idToken.substring(0, 20)}...` : 'null');

        if (!this.idToken) {
            console.error('Failed to get ID token');
            throw new Error('Failed to get authentication token');
        }
    }

    /**
     * Render the wizard HTML structure
     */
    renderWizard() {
        // Check if modal already exists
        let modal = document.getElementById('templateCreatorModal');
        if (!modal) {
            modal = document.createElement('div');
            modal.id = 'templateCreatorModal';
            modal.className = 'modal fade';
            modal.setAttribute('tabindex', '-1');
            modal.setAttribute('data-bs-backdrop', 'static');
            modal.setAttribute('data-bs-keyboard', 'false');
            document.body.appendChild(modal);
        }

        modal.innerHTML = `
            <div class="modal-dialog modal-xl modal-dialog-scrollable">
                <div class="modal-content">
                    <div class="modal-header">
                        <h5 class="modal-title">
                            <i class="fas fa-magic me-2"></i>
                            ${this.isEditMode ? 'Edit' : 'Create'} Receipt Template - Step <span id="currentStepNumber">${this.currentStep}</span> of ${this.isEditMode ? 3 : 6}
                        </h5>
                        <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
                    </div>
                    <div class="modal-body" id="wizardBody" style="min-height: 500px;">
                        <!-- Step content will be rendered here -->
                    </div>
                    <div class="modal-footer">
                        <button
                            type="button"
                            class="btn btn-secondary"
                            id="prevBtn"
                            onclick="templateCreator.previousStep()"
                        >
                            <i class="fas fa-arrow-left me-2"></i>
                            Previous
                        </button>
                        <button
                            type="button"
                            class="btn btn-primary"
                            id="nextBtn"
                            onclick="templateCreator.nextStep()"
                        >
                            Next
                            <i class="fas fa-arrow-right ms-2"></i>
                        </button>
                        <button
                            type="button"
                            class="btn btn-success d-none"
                            id="saveBtn"
                            onclick="templateCreator.saveTemplate()"
                        >
                            <i class="fas fa-save me-2"></i>
                            ${this.isEditMode ? 'Update Template' : 'Save Template'}
                        </button>
                    </div>
                </div>
            </div>
        `;

        this.renderStep();
    }

    /**
     * Render current step content
     */
    renderStep() {
        const wizardBody = document.getElementById('wizardBody');
        const currentStepNumber = document.getElementById('currentStepNumber');
        const prevBtn = document.getElementById('prevBtn');
        const nextBtn = document.getElementById('nextBtn');
        const saveBtn = document.getElementById('saveBtn');

        currentStepNumber.textContent = this.currentStep;

        // Edit mode has only 3 steps: Basic Info, Edit Patterns, Review
        const maxStepsForMode = this.isEditMode ? 3 : 6;

        // Show/hide navigation buttons
        prevBtn.classList.toggle('d-none', this.currentStep === 1);
        nextBtn.classList.toggle('d-none', this.currentStep === maxStepsForMode);
        saveBtn.classList.toggle('d-none', this.currentStep !== maxStepsForMode);

        if (this.isEditMode) {
            // Edit mode: simplified flow
            switch (this.currentStep) {
                case 1:
                    wizardBody.innerHTML = this.renderStep1(); // Basic Info
                    break;
                case 2:
                    wizardBody.innerHTML = this.renderEditPatterns(); // Direct pattern editing
                    this.attachEditPatternsListeners();
                    break;
                case 3:
                    wizardBody.innerHTML = this.renderStep6(); // Review
                    break;
            }
        } else {
            // Create mode: full 6-step flow
            switch (this.currentStep) {
                case 1:
                    wizardBody.innerHTML = this.renderStep1();
                    break;
                case 2:
                    wizardBody.innerHTML = this.renderStep2();
                    this.attachStep2Listeners();
                    break;
                case 3:
                    wizardBody.innerHTML = this.renderStep3();
                    this.attachStep3Listeners();
                    break;
                case 4:
                    wizardBody.innerHTML = this.renderStep4();
                    this.attachStep4Listeners();
                    break;
                case 5:
                    wizardBody.innerHTML = this.renderStep5();
                    this.attachStep5Listeners();
                    break;
                case 6:
                    wizardBody.innerHTML = this.renderStep6();
                    break;
            }
        }
    }

    /**
     * Step 1: Basic Information
     */
    renderStep1() {
        return `
            <div class="container">
                <h4 class="mb-4">
                    <i class="fas fa-info-circle text-primary me-2"></i>
                    Template Information
                </h4>
                <p class="text-muted">Provide basic details about this receipt template.</p>

                <div class="row">
                    <div class="col-md-6 mb-3">
                        <label class="form-label">Template Name <span class="text-danger">*</span></label>
                        <input
                            type="text"
                            class="form-control"
                            id="templateName"
                            placeholder="e.g., Ocean Basket - Standard Format"
                            value="${this.templateData.templateName}"
                            required
                        >
                        <small class="text-muted">A descriptive name for this template</small>
                    </div>

                    <div class="col-md-6 mb-3">
                        <label class="form-label">Brand Name <span class="text-danger">*</span></label>
                        <input
                            type="text"
                            class="form-control"
                            id="brandName"
                            placeholder="e.g., Ocean Basket"
                            value="${this.templateData.brandName}"
                            required
                        >
                        <small class="text-muted">The restaurant/store brand name</small>
                    </div>

                    <div class="col-md-6 mb-3">
                        <label class="form-label">Store/Location Name</label>
                        <input
                            type="text"
                            class="form-control"
                            id="storeName"
                            placeholder="e.g., The Grove Mall (optional)"
                            value="${this.templateData.storeName}"
                        >
                        <small class="text-muted">Specific location (leave empty for brand-wide)</small>
                    </div>

                    <div class="col-md-6 mb-3">
                        <label class="form-label">Priority <span class="text-danger">*</span></label>
                        <input
                            type="number"
                            class="form-control"
                            id="priority"
                            min="1"
                            max="10"
                            value="${this.templateData.priority}"
                            required
                        >
                        <small class="text-muted">1-10, higher = checked first (default: 5)</small>
                    </div>

                    <div class="col-12 mb-3">
                        <label class="form-label">Description</label>
                        <textarea
                            class="form-control"
                            id="description"
                            rows="3"
                            placeholder="Optional description of when to use this template..."
                        >${this.templateData.description}</textarea>
                    </div>

                    <div class="col-md-6 mb-3">
                        <label class="form-label">Initial Status <span class="text-danger">*</span></label>
                        <select class="form-select" id="status">
                            <option value="testing" ${this.templateData.status === 'testing' ? 'selected' : ''}>Testing</option>
                            <option value="active" ${this.templateData.status === 'active' ? 'selected' : ''}>Active</option>
                        </select>
                        <small class="text-muted">Start with "Testing" for new templates</small>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Render Edit Patterns step (Edit Mode Only)
     */
    renderEditPatterns() {
        return `
            <div class="container-fluid">
                <h4 class="mb-4">
                    <i class="fas fa-edit text-primary me-2"></i>
                    Edit Extraction Patterns
                </h4>
                <p class="text-muted">
                    Edit the regex patterns used to extract fields from receipts. Be careful with regex syntax!
                </p>

                <div class="row">
                    ${Object.entries(this.templateData.patterns).map(([fieldName, pattern]) => `
                        <div class="col-md-6 mb-3">
                            <div class="card">
                                <div class="card-header">
                                    <strong>${fieldName}</strong>
                                </div>
                                <div class="card-body">
                                    <label class="form-label">Regex Pattern:</label>
                                    <input
                                        type="text"
                                        class="form-control font-monospace pattern-input"
                                        data-field="${fieldName}"
                                        value="${this.escapeHtml(pattern.regex || '')}"
                                    >

                                    <div class="mt-2">
                                        <label class="form-label">Confidence (0-1):</label>
                                        <input
                                            type="number"
                                            class="form-control form-control-sm"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            data-field="${fieldName}"
                                            data-conf="true"
                                            value="${pattern.confidence || 0.8}"
                                        >
                                    </div>

                                    ${pattern.lineRange ? `
                                        <div class="mt-2">
                                            <label class="form-label">Line Range:</label>
                                            <div class="row g-2">
                                                <div class="col-6">
                                                    <input
                                                        type="number"
                                                        class="form-control form-control-sm"
                                                        placeholder="Start"
                                                        data-field="${fieldName}"
                                                        data-range="start"
                                                        value="${pattern.lineRange[0] || ''}"
                                                    >
                                                </div>
                                                <div class="col-6">
                                                    <input
                                                        type="number"
                                                        class="form-control form-control-sm"
                                                        placeholder="End"
                                                        data-field="${fieldName}"
                                                        data-range="end"
                                                        value="${pattern.lineRange[1] || ''}"
                                                    >
                                                </div>
                                            </div>
                                        </div>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="alert alert-info">
                    <i class="fas fa-info-circle me-2"></i>
                    <strong>Tip:</strong> Test your pattern changes with actual receipts after saving.
                </div>
            </div>
        `;
    }

    /**
     * Attach listeners for Edit Patterns step
     */
    attachEditPatternsListeners() {
        // Patterns will be read when moving to review step
    }

    /**
     * Step 2: Upload Receipt Image
     */
    renderStep2() {
        return `
            <div class="container">
                <h4 class="mb-4">
                    <i class="fas fa-upload text-primary me-2"></i>
                    Upload Example Receipt
                </h4>
                <p class="text-muted">Upload a clear image of a receipt to extract patterns from.</p>

                <div class="row">
                    <div class="col-12 mb-3">
                        <div class="card">
                            <div class="card-body text-center p-5">
                                <i class="fas fa-cloud-upload-alt fa-4x text-secondary mb-3"></i>
                                <h5>Drop receipt image here or click to browse</h5>
                                <input
                                    type="file"
                                    id="receiptImage"
                                    class="form-control mt-3"
                                    accept="image/*"
                                    style="max-width: 400px; margin: 0 auto;"
                                >
                            </div>
                        </div>
                    </div>

                    <div class="col-12 mt-3" id="imagePreviewContainer" style="display: none;">
                        <h6>Image Preview:</h6>
                        <div class="text-center">
                            <img id="imagePreview" class="img-fluid rounded shadow" style="max-height: 400px;" alt="Receipt preview">
                        </div>
                    </div>

                    <div class="col-12 mt-3" id="ocrProgressContainer" style="display: none;">
                        <div class="alert alert-info">
                            <div class="d-flex align-items-center">
                                <div class="spinner-border spinner-border-sm me-3" role="status"></div>
                                <div>
                                    <strong>Processing receipt...</strong>
                                    <p class="mb-0">Extracting text with OCR, this may take 10-20 seconds.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach listeners for Step 2
     */
    attachStep2Listeners() {
        const fileInput = document.getElementById('receiptImage');
        const imagePreview = document.getElementById('imagePreview');
        const imagePreviewContainer = document.getElementById('imagePreviewContainer');

        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    imagePreview.src = event.target.result;
                    imagePreviewContainer.style.display = 'block';
                };
                reader.readAsDataURL(file);
            }
        });
    }

    /**
     * Step 3: Review OCR Text
     */
    renderStep3() {
        if (!this.ocrResult) {
            return `
                <div class="text-center py-5">
                    <i class="fas fa-exclamation-triangle fa-3x text-warning mb-3"></i>
                    <h4>No OCR data available</h4>
                    <p class="text-muted">Please upload a receipt image in the previous step.</p>
                </div>
            `;
        }

        const lines = this.ocrResult.lines || [];

        return `
            <div class="container-fluid">
                <h4 class="mb-4">
                    <i class="fas fa-file-alt text-primary me-2"></i>
                    OCR Text Review
                </h4>
                <p class="text-muted">
                    Review the extracted text. Click on lines in the next step to mark fields.
                </p>

                <div class="row">
                    <div class="col-md-6">
                        <h6>Full Text:</h6>
                        <div class="border rounded p-3 bg-light" style="max-height: 500px; overflow-y: auto; font-family: monospace; white-space: pre-wrap;">
${this.ocrResult.fullText}
                        </div>
                    </div>
                    <div class="col-md-6">
                        <h6>Line-by-Line (${lines.length} lines):</h6>
                        <div class="border rounded p-3 bg-light" style="max-height: 500px; overflow-y: auto;">
                            <table class="table table-sm table-hover mb-0" style="font-family: monospace; font-size: 0.85em;">
                                <thead>
                                    <tr>
                                        <th style="width: 60px;">#</th>
                                        <th>Text</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${lines.map((line, index) => `
                                        <tr>
                                            <td class="text-muted">${index}</td>
                                            <td>${this.escapeHtml(line.text)}</td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach listeners for Step 3
     */
    attachStep3Listeners() {
        // No interactive elements in step 3
    }

    /**
     * Step 4: Mark Fields
     */
    renderStep4() {
        if (!this.ocrResult) {
            return `<div class="text-center py-5"><p class="text-muted">No OCR data</p></div>`;
        }

        const lines = this.ocrResult.lines || [];
        const fields = [
            { name: 'brandName', label: 'Brand Name', required: true },
            { name: 'storeName', label: 'Store Name', required: false },
            { name: 'invoiceNumber', label: 'Invoice Number', required: true },
            { name: 'date', label: 'Date', required: true },
            { name: 'time', label: 'Time', required: false },
            { name: 'totalAmount', label: 'Total Amount', required: true },
            { name: 'waiterName', label: 'Waiter Name', required: false },
            { name: 'tableNumber', label: 'Table Number', required: false }
        ];

        return `
            <div class="container-fluid">
                <h4 class="mb-4">
                    <i class="fas fa-hand-pointer text-primary me-2"></i>
                    Mark Fields
                </h4>
                <p class="text-muted">
                    Click on lines below to mark where each field appears. The system will generate regex patterns automatically.
                </p>

                <div class="row">
                    <div class="col-md-4">
                        <div class="card">
                            <div class="card-header">
                                <h6 class="mb-0">Fields to Mark</h6>
                            </div>
                            <div class="card-body">
                                ${fields.map(field => `
                                    <div class="form-check mb-2">
                                        <input
                                            class="form-check-input field-selector"
                                            type="radio"
                                            name="selectedField"
                                            id="field_${field.name}"
                                            value="${field.name}"
                                        >
                                        <label class="form-check-label" for="field_${field.name}">
                                            ${field.label}
                                            ${field.required ? '<span class="text-danger">*</span>' : ''}
                                        </label>
                                        <div id="selected_${field.name}" class="text-success small" style="display: none;">
                                            <i class="fas fa-check-circle"></i>
                                            Line <span class="line-num"></span>
                                        </div>
                                    </div>
                                `).join('')}

                                <hr>
                                <div class="alert alert-info mb-0">
                                    <small>
                                        <strong>Instructions:</strong><br>
                                        1. Select a field above<br>
                                        2. Click the line containing that field<br>
                                        3. Repeat for all required fields
                                    </small>
                                </div>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-8">
                        <h6>Receipt Lines (Click to mark):</h6>
                        <div class="border rounded p-3 bg-light" style="max-height: 500px; overflow-y: auto;">
                            <table class="table table-sm table-hover mb-0" id="lineTable" style="font-family: monospace; font-size: 0.85em;">
                                <tbody>
                                    ${lines.map((line, index) => `
                                        <tr
                                            class="line-row"
                                            data-line-index="${index}"
                                            style="cursor: pointer;"
                                        >
                                            <td style="width: 60px;" class="text-muted">${index}</td>
                                            <td>${this.escapeHtml(line.text)}</td>
                                            <td style="width: 100px;" class="field-marker"></td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    /**
     * Attach listeners for Step 4
     */
    attachStep4Listeners() {
        const lineRows = document.querySelectorAll('.line-row');

        lineRows.forEach(row => {
            row.addEventListener('click', () => {
                const selectedField = document.querySelector('.field-selector:checked');
                if (!selectedField) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Select a Field',
                        text: 'Please select a field from the list first',
                        toast: true,
                        position: 'top-end',
                        showConfirmButton: false,
                        timer: 2000
                    });
                    return;
                }

                const fieldName = selectedField.value;
                const lineIndex = parseInt(row.dataset.lineIndex);
                const lineText = this.ocrResult.lines[lineIndex].text;

                // Store selection
                this.selectedLines[fieldName] = {
                    lineIndex,
                    lineText
                };

                // Update UI
                const marker = row.querySelector('.field-marker');
                marker.innerHTML = `<span class="badge bg-primary">${fieldName}</span>`;

                const selectedIndicator = document.getElementById(`selected_${fieldName}`);
                selectedIndicator.style.display = 'block';
                selectedIndicator.querySelector('.line-num').textContent = lineIndex;

                // Uncheck the radio to allow selecting next field
                selectedField.checked = false;
            });
        });
    }

    /**
     * Step 5: Generate Patterns
     */
    renderStep5() {
        // Generate patterns based on selected lines
        const generatedPatterns = this.generatePatterns();

        return `
            <div class="container-fluid">
                <h4 class="mb-4">
                    <i class="fas fa-cog text-primary me-2"></i>
                    Generated Patterns
                </h4>
                <p class="text-muted">
                    Review and adjust the automatically generated regex patterns. You can edit patterns if needed.
                </p>

                <div class="row">
                    ${Object.entries(generatedPatterns).map(([fieldName, pattern]) => `
                        <div class="col-md-6 mb-3">
                            <div class="card">
                                <div class="card-header">
                                    <strong>${fieldName}</strong>
                                </div>
                                <div class="card-body">
                                    <label class="form-label">Regex Pattern:</label>
                                    <input
                                        type="text"
                                        class="form-control font-monospace pattern-input"
                                        data-field="${fieldName}"
                                        value="${this.escapeHtml(pattern.regex)}"
                                    >

                                    <div class="mt-2">
                                        <label class="form-label">Line Range (optional):</label>
                                        <div class="row g-2">
                                            <div class="col-6">
                                                <input
                                                    type="number"
                                                    class="form-control form-control-sm"
                                                    placeholder="Start"
                                                    data-field="${fieldName}"
                                                    data-range="start"
                                                    value="${pattern.lineRange ? pattern.lineRange[0] : ''}"
                                                >
                                            </div>
                                            <div class="col-6">
                                                <input
                                                    type="number"
                                                    class="form-control form-control-sm"
                                                    placeholder="End"
                                                    data-field="${fieldName}"
                                                    data-range="end"
                                                    value="${pattern.lineRange ? pattern.lineRange[1] : ''}"
                                                >
                                            </div>
                                        </div>
                                    </div>

                                    <div class="mt-2">
                                        <label class="form-label">Confidence:</label>
                                        <input
                                            type="number"
                                            class="form-control form-control-sm"
                                            min="0"
                                            max="1"
                                            step="0.05"
                                            data-field="${fieldName}"
                                            data-conf="true"
                                            value="${pattern.confidence}"
                                        >
                                    </div>

                                    <div class="mt-2">
                                        <small class="text-muted">
                                            Based on line ${this.selectedLines[fieldName]?.lineIndex}:
                                            "${this.escapeHtml(this.selectedLines[fieldName]?.lineText || '')}"
                                        </small>
                                    </div>
                                </div>
                            </div>
                        </div>
                    `).join('')}
                </div>

                <div class="alert alert-warning">
                    <i class="fas fa-exclamation-triangle me-2"></i>
                    <strong>Note:</strong> These patterns are automatically generated and may need adjustment.
                    Test them in the next step to ensure accuracy.
                </div>
            </div>
        `;
    }

    /**
     * Attach listeners for Step 5
     */
    attachStep5Listeners() {
        // Listeners will be attached when reading pattern inputs
    }

    /**
     * Step 6: Review & Save
     */
    renderStep6() {
        // Read all pattern inputs from step 5
        this.readPatternInputs();

        return `
            <div class="container">
                <h4 class="mb-4">
                    <i class="fas fa-check-circle text-success me-2"></i>
                    Review Template
                </h4>
                <p class="text-muted">
                    Review your template configuration before saving. You can go back to make changes if needed.
                </p>

                <div class="row">
                    <div class="col-md-6">
                        <div class="card mb-3">
                            <div class="card-header">
                                <h6 class="mb-0">Template Information</h6>
                            </div>
                            <div class="card-body">
                                <table class="table table-sm mb-0">
                                    <tr>
                                        <th style="width: 40%;">Template Name:</th>
                                        <td>${this.templateData.templateName}</td>
                                    </tr>
                                    <tr>
                                        <th>Brand Name:</th>
                                        <td>${this.templateData.brandName}</td>
                                    </tr>
                                    <tr>
                                        <th>Store Name:</th>
                                        <td>${this.templateData.storeName || 'N/A'}</td>
                                    </tr>
                                    <tr>
                                        <th>Priority:</th>
                                        <td>${this.templateData.priority}</td>
                                    </tr>
                                    <tr>
                                        <th>Status:</th>
                                        <td><span class="badge bg-warning">${this.templateData.status}</span></td>
                                    </tr>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div class="col-md-6">
                        <div class="card mb-3">
                            <div class="card-header">
                                <h6 class="mb-0">Extraction Patterns</h6>
                            </div>
                            <div class="card-body">
                                <div style="max-height: 300px; overflow-y: auto;">
                                    ${Object.entries(this.templateData.patterns).map(([field, pattern]) => `
                                        <div class="mb-2">
                                            <strong>${field}:</strong>
                                            <div class="font-monospace small text-muted">${this.escapeHtml(pattern.regex)}</div>
                                        </div>
                                    `).join('')}
                                </div>
                            </div>
                        </div>
                    </div>
                </div>

                <div class="alert alert-success">
                    <i class="fas fa-info-circle me-2"></i>
                    <strong>Ready to save!</strong> Click "Save Template" to create this template.
                </div>
            </div>
        `;
    }

    /**
     * Read pattern inputs from Step 5
     */
    readPatternInputs() {
        const patternInputs = document.querySelectorAll('.pattern-input');
        patternInputs.forEach(input => {
            const fieldName = input.dataset.field;
            const regex = input.value;

            // Get line range
            const startInput = document.querySelector(`input[data-field="${fieldName}"][data-range="start"]`);
            const endInput = document.querySelector(`input[data-field="${fieldName}"][data-range="end"]`);
            const confInput = document.querySelector(`input[data-field="${fieldName}"][data-conf="true"]`);

            const pattern = {
                regex: regex,
                confidence: parseFloat(confInput?.value) || 0.8,
                flags: 'i'
            };

            if (startInput?.value && endInput?.value) {
                pattern.lineRange = [parseInt(startInput.value), parseInt(endInput.value)];
            }

            this.templateData.patterns[fieldName] = pattern;
        });
    }

    /**
     * Generate patterns from selected lines
     */
    generatePatterns() {
        const patterns = {};

        Object.entries(this.selectedLines).forEach(([fieldName, selection]) => {
            const lineText = selection.lineText;
            let regex = '';
            let confidence = 0.8;
            let lineRange = null;

            // Simple pattern generation based on field type
            switch (fieldName) {
                case 'brandName':
                    regex = this.escapeRegex(lineText);
                    confidence = 0.95;
                    lineRange = [0, 5];
                    break;

                case 'storeName':
                    regex = this.escapeRegex(lineText);
                    confidence = 0.9;
                    lineRange = [0, 10];
                    break;

                case 'invoiceNumber':
                    // Try to extract number pattern
                    const invoiceMatch = lineText.match(/\d+/);
                    if (invoiceMatch) {
                        regex = lineText.replace(/\d+/, '(\\d+)');
                    } else {
                        regex = this.escapeRegex(lineText);
                    }
                    confidence = 0.9;
                    break;

                case 'date':
                    // Extract date pattern
                    regex = lineText.replace(/\d{2}\/\d{2}\/\d{4}/, '(\\d{2}\\/\\d{2}\\/\\d{4})');
                    confidence = 0.95;
                    break;

                case 'time':
                    // Extract time pattern
                    regex = lineText.replace(/\d{2}:\d{2}/, '(\\d{2}:\\d{2})');
                    confidence = 0.8;
                    break;

                case 'totalAmount':
                    // Extract amount pattern
                    regex = lineText.replace(/\d+\.\d{2}/, '(\\d+\\.\\d{2})');
                    confidence = 0.95;
                    break;

                case 'waiterName':
                case 'tableNumber':
                    regex = this.escapeRegex(lineText);
                    confidence = 0.7;
                    break;

                default:
                    regex = this.escapeRegex(lineText);
            }

            patterns[fieldName] = {
                regex,
                confidence,
                lineRange,
                flags: 'i'
            };
        });

        return patterns;
    }

    /**
     * Navigate to next step
     */
    async nextStep() {
        // Validate current step
        if (!await this.validateStep()) {
            return;
        }

        // Save step data
        await this.saveStepData();

        // Move to next step
        if (this.currentStep < this.maxSteps) {
            this.currentStep++;
            this.renderStep();
        }
    }

    /**
     * Navigate to previous step
     */
    previousStep() {
        if (this.currentStep > 1) {
            this.currentStep--;
            this.renderStep();
        }
    }

    /**
     * Validate current step
     */
    async validateStep() {
        switch (this.currentStep) {
            case 1:
                const templateName = document.getElementById('templateName')?.value;
                const brandName = document.getElementById('brandName')?.value;
                const priority = document.getElementById('priority')?.value;

                if (!templateName || !brandName || !priority) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Missing Information',
                        text: 'Please fill in all required fields'
                    });
                    return false;
                }
                return true;

            case 2:
                const fileInput = document.getElementById('receiptImage');
                if (!fileInput?.files?.[0]) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'No Image',
                        text: 'Please upload a receipt image'
                    });
                    return false;
                }
                return true;

            case 3:
                // Just review, no validation
                return true;

            case 4:
                // Check required fields are marked
                const requiredFields = ['brandName', 'invoiceNumber', 'totalAmount'];
                const missing = requiredFields.filter(f => !this.selectedLines[f]);

                if (missing.length > 0) {
                    Swal.fire({
                        icon: 'warning',
                        title: 'Missing Fields',
                        html: `Please mark the following required fields:<br><strong>${missing.join(', ')}</strong>`
                    });
                    return false;
                }
                return true;

            case 5:
                // Patterns are generated, just proceed
                return true;

            default:
                return true;
        }
    }

    /**
     * Save step data
     */
    async saveStepData() {
        switch (this.currentStep) {
            case 1:
                this.templateData.templateName = document.getElementById('templateName').value;
                this.templateData.brandName = document.getElementById('brandName').value;
                this.templateData.storeName = document.getElementById('storeName').value;
                this.templateData.description = document.getElementById('description').value;
                this.templateData.priority = parseInt(document.getElementById('priority').value);
                this.templateData.status = document.getElementById('status').value;
                break;

            case 2:
                // Perform OCR
                const fileInput = document.getElementById('receiptImage');
                const file = fileInput.files[0];
                if (file) {
                    await this.performOCR(file);
                }
                break;

            case 4:
                // Patterns are stored in this.selectedLines
                break;

            case 5:
                // Read pattern inputs
                this.readPatternInputs();
                break;
        }
    }

    /**
     * Perform OCR on uploaded image
     */
    async performOCR(file) {
        const progressContainer = document.getElementById('ocrProgressContainer');
        progressContainer.style.display = 'block';

        try {
            // Ensure we have a fresh ID token
            await this.ensureAuth();

            // Convert file to base64
            const base64Image = await this.fileToBase64(file);

            // Call OCR API
            const response = await fetch(`${FUNCTIONS_URL}/ocrReceiptForTemplate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ imageData: base64Image })
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                console.error('OCR API error:', errorData);
                throw new Error(errorData.error || 'OCR processing failed');
            }

            const result = await response.json();
            this.ocrResult = result;
            this.templateData.exampleOcrText = result.fullText;

            Swal.fire({
                icon: 'success',
                title: 'OCR Complete',
                text: `Extracted ${result.lines?.length || 0} lines of text`,
                toast: true,
                position: 'top-end',
                showConfirmButton: false,
                timer: 3000
            });

        } catch (error) {
            console.error('OCR error:', error);
            Swal.fire({
                icon: 'error',
                title: 'OCR Failed',
                text: error.message
            });
            throw error;
        } finally {
            progressContainer.style.display = 'none';
        }
    }

    /**
     * Save template to backend
     */
    async saveTemplate() {
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.disabled = true;
        saveBtn.innerHTML = '<i class="fas fa-spinner fa-spin me-2"></i> Saving...';

        try {
            // Log what we're sending for debugging
            console.log('Saving template data:', JSON.stringify(this.templateData, null, 2));
            console.log('Template data keys:', Object.keys(this.templateData));
            console.log('Patterns:', this.templateData.patterns);
            console.log('Patterns keys:', Object.keys(this.templateData.patterns || {}));

            const response = await fetch(`${FUNCTIONS_URL}/createReceiptTemplate`, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.idToken}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(this.templateData)
            });

            console.log('Response status:', response.status);
            console.log('Response ok:', response.ok);

            if (!response.ok) {
                const errorText = await response.text();
                console.error('Server error response:', errorText);

                let error;
                try {
                    error = JSON.parse(errorText);
                } catch (e) {
                    error = { message: errorText || 'Failed to save template' };
                }

                throw new Error(error.error || error.message || 'Failed to save template');
            }

            const result = await response.json();

            await Swal.fire({
                icon: 'success',
                title: 'Template Saved!',
                text: `Template "${this.templateData.templateName}" has been created successfully.`,
                confirmButtonText: 'OK'
            });

            // Close modal
            this.hideModal();

            // Call callback if provided (for integration with receipt-settings)
            if (this.onTemplateCreated && typeof this.onTemplateCreated === 'function') {
                this.onTemplateCreated(result);
            } else if (window.location.href.includes('receipt-settings')) {
                // Fallback: reload page if no callback provided
                window.location.reload();
            }

        } catch (error) {
            console.error('Save error:', error);
            Swal.fire({
                icon: 'error',
                title: 'Save Failed',
                text: error.message
            });
        } finally {
            saveBtn.disabled = false;
            saveBtn.innerHTML = '<i class="fas fa-save me-2"></i> Save Template';
        }
    }

    /**
     * Show modal
     */
    showModal() {
        const modal = new bootstrap.Modal(document.getElementById('templateCreatorModal'));
        modal.show();
    }

    /**
     * Hide modal
     */
    hideModal() {
        const modalElement = document.getElementById('templateCreatorModal');
        const modal = bootstrap.Modal.getInstance(modalElement);
        if (modal) {
            modal.hide();
        }
    }

    /**
     * Convert file to base64
     */
    fileToBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    /**
     * Escape HTML
     */
    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    /**
     * Escape regex special characters
     */
    escapeRegex(text) {
        return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
}

// Export global instance
window.templateCreator = new TemplateCreator();

console.log('Receipt Template Creator loaded successfully');
