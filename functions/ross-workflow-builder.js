/**
 * Pure workflow-builder helpers extracted from rossActivateWorkflow.
 * Zero dependencies on firebase-admin / db — all impure inputs
 * (`generateTaskId`, `now`) are injected, making the helpers fully
 * unit-testable. Mirrors the ross-tier.js pattern.
 *
 * Consumers:
 *   - rossActivateWorkflow (functions/ross.js) — operator-triggered activate
 *   - registerUser (functions/index.js) — day-zero auto-activation
 *
 * The output of buildWorkflowRecord must be byte-identical to the
 * inlined version it replaces in rossActivateWorkflow. Any divergence
 * is a regression.
 */

const MS_PER_DAY = 86400000;
const DEFAULT_DAYS_BEFORE_ALERT = [30, 7];

function buildTaskFromSubtask(subtask, nextDueDate, validInputTypes) {
    const rawType = subtask.inputType;
    const inputType = validInputTypes.includes(rawType) ? rawType : 'checkbox';
    const inputConfig = (subtask.inputConfig && typeof subtask.inputConfig === 'object')
        ? subtask.inputConfig
        : {};
    return {
        title: (subtask.title || '').trim() || 'Untitled Task',
        status: 'pending',
        dueDate: nextDueDate + ((subtask.daysOffset || 0) * MS_PER_DAY),
        completedAt: null,
        assignedTo: null,
        order: subtask.order || 1,
        inputType,
        inputConfig,
    };
}

function buildLocationsFromTemplate({
    template,
    locationIds,
    locationNames,
    locationAssignedTo,
    nextDueDate,
    validInputTypes,
    generateTaskId,
    now,
}) {
    const locations = {};
    locationIds.forEach((locationId, idx) => {
        const tasks = {};
        if (Array.isArray(template.subtasks)) {
            template.subtasks.forEach((subtask) => {
                const taskId = generateTaskId();
                tasks[taskId] = buildTaskFromSubtask(subtask, nextDueDate, validInputTypes);
            });
        }
        locations[locationId] = {
            locationName: (locationNames && locationNames[idx]) || locationId,
            locationAssignedTo: (locationAssignedTo && locationAssignedTo[locationId]) || null,
            status: 'active',
            nextDueDate,
            activatedAt: now,
            tasks,
        };
    });
    return locations;
}

function buildWorkflowRecord({
    template,
    locationIds,
    locationNames,
    locationAssignedTo,
    nextDueDate,
    uid,
    name,
    description,
    customInterval,
    daysBeforeAlert,
    notifyPhone,
    notifyEmail,
    workflowId,
    validInputTypes,
    generateTaskId,
    now,
}) {
    const locations = buildLocationsFromTemplate({
        template,
        locationIds,
        locationNames,
        locationAssignedTo,
        nextDueDate,
        validInputTypes,
        generateTaskId,
        now,
    });
    const resolvedDescription = (description != null ? description : template.description);
    const workflowData = {
        workflowId,
        templateId: template.templateId,
        ownerId: uid,
        name: (name || template.name).trim(),
        description: (resolvedDescription || '').trim() || null,
        category: template.category,
        recurrence: template.recurrence,
        customInterval: (Number.isInteger(customInterval) && customInterval > 0) ? customInterval : null,
        notificationChannels: ['in_app'],
        notifyPhone: notifyPhone || null,
        notifyEmail: notifyEmail || null,
        daysBeforeAlert: Array.isArray(daysBeforeAlert)
            ? daysBeforeAlert.filter((d) => Number.isInteger(d) && d > 0)
            : (Array.isArray(template.daysBeforeAlert) ? template.daysBeforeAlert : DEFAULT_DAYS_BEFORE_ALERT),
        createdAt: now,
        updatedAt: now,
        locations,
    };
    const atomicWrite = {
        [`ross/workflows/${uid}/${workflowId}`]: workflowData,
        [`ross/ownerIndex/${uid}`]: true,
    };
    locationIds.forEach((locId) => {
        atomicWrite[`ross/workflowsByLocation/${locId}/${workflowId}`] = uid;
    });
    return { workflowId, workflowData, atomicWrite };
}

module.exports = {
    buildTaskFromSubtask,
    buildLocationsFromTemplate,
    buildWorkflowRecord,
};
