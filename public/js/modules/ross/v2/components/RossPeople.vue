<script setup>
// People — staff in the loop. Read + edit-in-place CRUD over
// rossGetStaff / rossManageStaff. Per-creator scope (staff at
// ross/staff/{callerUid}/{locationId}).
//
// Mental-model framing: "who's in the loop?" — staff Ross routes tasks
// to today; once the agent ships, this is also where you'll designate
// human approvers for agent-driven steps.
import { onMounted, computed, ref, watch } from 'vue'
import { usePeopleStore } from '../people-store.js'
import {
  HfIcon, HfChip, HfButton, HfInput, HfLogo,
} from '/js/design-system/hifi/index.js'

const store = usePeopleStore()

onMounted(() => {
  if (!store.locations.length) store.loadLocations()
})

const locations = computed(() => store.locations)
const selectedLocationId = computed(() => store.selectedLocationId)
const staff = computed(() => store.staff)

const editingId = ref(null)         // null = no editor open; 'new' = create form; staffId = edit row
const confirmingDeleteId = ref(null) // staffId currently in 'confirm remove?' state
const rowError = ref({ id: null, msg: '' })  // per-row error surfacing for delete failures
const form = ref(blankForm())

function blankForm() {
  return {
    name: '',
    role: '',
    phone: '',
    email: '',
    notificationChannels: ['in_app'],
  }
}

function openCreate() {
  editingId.value = 'new'
  form.value = blankForm()
}

function openEdit(member) {
  editingId.value = member.staffId
  form.value = {
    name: member.name || '',
    role: member.role || '',
    phone: member.phone || '',
    email: member.email || '',
    notificationChannels: Array.isArray(member.notificationChannels) && member.notificationChannels.length
      ? [...member.notificationChannels]
      : ['in_app'],
  }
}

function cancelEdit() {
  editingId.value = null
  form.value = blankForm()
}

function toggleChannel(channel) {
  const set = new Set(form.value.notificationChannels)
  if (set.has(channel)) set.delete(channel)
  else set.add(channel)
  // Keep at least one channel — server-default is in_app.
  if (set.size === 0) set.add('in_app')
  form.value = { ...form.value, notificationChannels: Array.from(set) }
}

const formValid = computed(() => form.value.name.trim().length > 0)

async function save() {
  if (!formValid.value) return
  const payload = {
    name: form.value.name.trim(),
    role: form.value.role.trim() || '',
    phone: form.value.phone.trim() || null,
    email: form.value.email.trim() || null,
    notificationChannels: form.value.notificationChannels,
  }
  try {
    if (editingId.value === 'new') {
      await store.createStaff(payload)
    } else {
      await store.updateStaff(editingId.value, payload)
    }
    cancelEdit()
  } catch (_) {
    // store.saveError is already populated and rendered inline in the
    // editor banner. No modal — keeps the surface inside the v2 visual
    // language instead of bouncing the user to SweetAlert.
  }
}

// Two-step inline delete: first click sets `confirmingDeleteId`, second
// click on the same row's "Confirm remove" actually deletes. No modal,
// no overlay — matches the inline-editor pattern already on this tab.
function startConfirmDelete(member) {
  confirmingDeleteId.value = member.staffId
  rowError.value = { id: null, msg: '' }
}
function cancelConfirmDelete() {
  confirmingDeleteId.value = null
}
async function commitDelete(member) {
  if (confirmingDeleteId.value !== member.staffId) return
  try {
    await store.deleteStaff(member.staffId)
    confirmingDeleteId.value = null
  } catch (_) {
    rowError.value = {
      id: member.staffId,
      msg: store.saveError || 'Could not remove staff member.',
    }
  }
}

function backToHome() {
  if (typeof window === 'undefined') return
  window.history.pushState({}, '', '/ross.html')
  window.dispatchEvent(new PopStateEvent('popstate'))
}

// Reset editor + any pending row state whenever location switches.
watch(selectedLocationId, () => {
  cancelEdit()
  confirmingDeleteId.value = null
  rowError.value = { id: null, msg: '' }
})

const channelOptions = [
  { id: 'in_app', label: 'In-app' },
  { id: 'phone', label: 'SMS' },
  { id: 'email', label: 'Email' },
]
</script>

<template>
  <div class="people">
    <header class="people__head">
      <button class="people__back" @click="backToHome">
        <HfIcon name="arrow" :size="14" />
        <span>Back to Ross</span>
      </button>
      <div class="people__head-meta">
        <HfLogo :size="18" />
        <span class="hf-mono people__head-mono">people · in the loop</span>
      </div>
    </header>

    <main class="people__main">
      <section class="people__intro">
        <div class="hf-eyebrow">
          <HfIcon name="users" :size="11" color="var(--hf-accent)" />
          People
        </div>
        <h1 class="people__title">
          The team I route to,<br />
          <span class="people__title-italic">and who'll approve what.</span>
        </h1>
        <p class="people__lead">
          Staff here can be assigned tasks within a workflow. Today they walk the
          steps; once the agent is online, this is also where you'll designate the
          humans who approve agent-driven actions.
        </p>
      </section>

      <!-- Location picker -->
      <section class="people__panel">
        <header class="people__panel-head">
          <h2 class="people__panel-title">Location</h2>
          <span v-if="store.locationsLoading" class="hf-mono people__panel-sub">loading…</span>
          <span v-else-if="store.locationsError" class="hf-mono people__panel-sub people__panel-sub--err">
            {{ store.locationsError }}
          </span>
          <span v-else class="hf-mono people__panel-sub">
            staff are scoped per location
          </span>
        </header>

        <div v-if="!store.locationsLoading && locations.length === 0" class="people__empty-loc">
          You don't have any locations linked to your account yet.
        </div>

        <div v-else-if="!store.locationsLoading" class="people__loc-grid">
          <button
            v-for="loc in locations" :key="loc.id"
            class="people__loc-pill"
            :class="{ 'is-active': loc.id === selectedLocationId }"
            @click="store.selectLocation(loc.id)"
          >
            {{ loc.name }}
          </button>
        </div>
      </section>

      <!-- Staff list + editor -->
      <section v-if="selectedLocationId" class="people__panel">
        <header class="people__panel-head">
          <h2 class="people__panel-title">Staff</h2>
          <span class="hf-mono people__panel-sub">
            {{ staff.length }} member{{ staff.length === 1 ? '' : 's' }}
            at {{ store.selectedLocation?.name || selectedLocationId }}
          </span>
        </header>

        <div class="people__actions-row">
          <HfButton
            v-if="editingId !== 'new'"
            variant="solid"
            @click="openCreate"
            :disabled="store.saving"
          >
            <template #leading><HfIcon name="plus" :size="13" /></template>
            Add staff member
          </HfButton>
        </div>

        <!-- Inline editor: open for create or edit -->
        <div v-if="editingId" class="people__editor">
          <div class="people__editor-head">
            <h3 class="people__editor-title">
              {{ editingId === 'new' ? 'Add staff member' : 'Edit staff member' }}
            </h3>
            <button class="people__editor-close" @click="cancelEdit" aria-label="Close editor">
              <HfIcon name="x" :size="14" />
            </button>
          </div>
          <div class="people__editor-grid">
            <label class="people__field">
              <span class="hf-eyebrow">Name *</span>
              <HfInput v-model="form.name" placeholder="e.g. Maya Alvarez" />
            </label>
            <label class="people__field">
              <span class="hf-eyebrow">Role</span>
              <HfInput v-model="form.role" placeholder="e.g. Floor manager" />
            </label>
            <label class="people__field">
              <span class="hf-eyebrow">Phone</span>
              <HfInput v-model="form.phone" placeholder="+27 …" />
            </label>
            <label class="people__field">
              <span class="hf-eyebrow">Email</span>
              <HfInput v-model="form.email" type="email" placeholder="name@venue.co.za" />
            </label>
          </div>
          <div class="people__channels">
            <span class="hf-eyebrow people__channels-label">Notify via</span>
            <div class="people__channels-grid">
              <button
                v-for="c in channelOptions" :key="c.id"
                class="people__channel-chip"
                :class="{ 'is-active': form.notificationChannels.includes(c.id) }"
                @click="toggleChannel(c.id)"
                type="button"
              >
                {{ c.label }}
              </button>
            </div>
          </div>
          <div v-if="store.saveError" class="people__editor-error">
            <HfIcon name="x" :size="12" />
            <span>{{ store.saveError }}</span>
          </div>
          <div class="people__editor-actions">
            <HfButton variant="ghost" @click="cancelEdit" :disabled="store.saving">Cancel</HfButton>
            <HfButton
              variant="solid"
              :disabled="!formValid || store.saving"
              @click="save"
            >
              {{ store.saving ? 'Saving…' : (editingId === 'new' ? 'Add member' : 'Save changes') }}
            </HfButton>
          </div>
        </div>

        <!-- Staff rows -->
        <div v-if="store.staffLoading" class="people__state">
          <span class="hf-eyebrow">Loading staff…</span>
        </div>
        <div v-else-if="store.staffError" class="people__state people__state--err">
          <span class="hf-eyebrow">Could not load</span>
          <p class="people__state-msg">{{ store.staffError }}</p>
          <HfButton variant="ghost" @click="store.loadStaff()">Retry</HfButton>
        </div>
        <div v-else-if="staff.length === 0" class="people__state">
          <span class="hf-eyebrow">No staff yet</span>
          <p class="people__state-msg">Add the first member above.</p>
        </div>
        <ul v-else class="people__rows">
          <li v-for="m in staff" :key="m.staffId" class="people__row">
            <div class="people__row-body">
              <h4 class="people__row-name">{{ m.name }}</h4>
              <div class="hf-mono people__row-meta">
                <span v-if="m.role">{{ m.role }}</span>
                <span v-if="m.phone">· {{ m.phone }}</span>
                <span v-if="m.email">· {{ m.email }}</span>
              </div>
              <div class="people__row-channels" v-if="Array.isArray(m.notificationChannels) && m.notificationChannels.length">
                <HfChip
                  v-for="c in m.notificationChannels" :key="c"
                  tone="default"
                >
                  {{ channelOptions.find(o => o.id === c)?.label || c }}
                </HfChip>
              </div>
            </div>
            <div class="people__row-actions">
              <template v-if="confirmingDeleteId === m.staffId">
                <span class="hf-mono people__row-confirm-label">Remove?</span>
                <HfButton
                  variant="solid" size="sm"
                  @click="commitDelete(m)"
                  :disabled="store.saving"
                >
                  {{ store.saving ? 'Removing…' : 'Confirm' }}
                </HfButton>
                <HfButton variant="ghost" size="sm" @click="cancelConfirmDelete" :disabled="store.saving">
                  Cancel
                </HfButton>
              </template>
              <template v-else>
                <HfButton variant="ghost" size="sm" @click="openEdit(m)" :disabled="store.saving">
                  Edit
                </HfButton>
                <HfButton variant="ghost" size="sm" @click="startConfirmDelete(m)" :disabled="store.saving">
                  Remove
                </HfButton>
              </template>
            </div>
            <div v-if="rowError.id === m.staffId && rowError.msg" class="people__row-error">
              <HfIcon name="x" :size="11" />
              <span>{{ rowError.msg }}</span>
            </div>
          </li>
        </ul>
      </section>

      <section v-else-if="!store.locationsLoading && locations.length > 1" class="people__hint">
        <span class="hf-eyebrow">Pick a location to see its staff</span>
      </section>

      <footer class="people__footer">
        <p class="hf-mono">
          Staff here are scoped to the workflow creator. Sharing a workflow across
          users still routes tasks to the creator's staff list — multi-creator staff
          merging lands with the agent rollout.
        </p>
      </footer>
    </main>
  </div>
</template>

<style scoped>
.people {
  width: 100%; min-height: 100vh;
  background: var(--hf-bg);
  display: flex; flex-direction: column;
}

.people__head {
  padding: 14px 28px;
  border-bottom: 1px solid var(--hf-line);
  display: flex; align-items: center; justify-content: space-between;
}
.people__back {
  display: inline-flex; align-items: center; gap: 6px;
  background: transparent; border: none; cursor: pointer;
  color: var(--hf-ink-2);
  font-family: var(--hf-font-body); font-size: 12px;
  padding: 4px 8px; border-radius: 4px;
}
.people__back :deep(svg) { transform: rotate(180deg); }
.people__back:hover { color: var(--hf-ink); background: var(--hf-paper); }
.people__head-meta { display: flex; align-items: center; gap: 10px; }
.people__head-mono {
  font-size: 11px; letter-spacing: 0.14em;
  color: var(--hf-muted); text-transform: uppercase;
}

.people__main {
  padding: 32px 36px 64px;
  max-width: 980px; width: 100%;
  margin: 0 auto; box-sizing: border-box;
}

.people__intro { max-width: 720px; }
.people__title {
  font-family: var(--hf-font-display);
  font-size: 44px; line-height: 1.05;
  letter-spacing: -0.02em;
  margin: 8px 0 16px; font-weight: 400;
}
.people__title-italic { font-style: italic; color: var(--hf-ink-2); }
.people__lead {
  font-size: 15px; line-height: 1.6;
  color: var(--hf-ink-2); margin: 0;
}

.people__panel {
  margin-top: 28px;
  padding: 20px;
  border: 1px solid var(--hf-line-2);
  border-radius: var(--hf-radius-md);
  background: var(--hf-paper);
}
.people__panel-head {
  display: flex; align-items: baseline; justify-content: space-between;
  margin-bottom: 12px;
  border-bottom: 1px solid var(--hf-line);
  padding-bottom: 8px;
  gap: 12px;
}
.people__panel-title {
  font-family: var(--hf-font-display);
  font-size: 22px; letter-spacing: -0.01em;
  font-weight: 400; margin: 0;
}
.people__panel-sub { font-size: 11px; color: var(--hf-muted); }
.people__panel-sub--err { color: var(--hf-warn); font-family: var(--hf-font-mono); }

/* Location picker */
.people__loc-grid {
  display: flex; flex-wrap: wrap; gap: 8px;
}
.people__loc-pill {
  background: var(--hf-bg);
  border: 1px solid var(--hf-line-2);
  color: var(--hf-ink); cursor: pointer;
  padding: 6px 14px;
  border-radius: 999px;
  font-family: var(--hf-font-body);
  font-size: 13px;
  transition: background var(--hf-transition), color var(--hf-transition), border-color var(--hf-transition);
}
.people__loc-pill:hover { border-color: var(--hf-ink-2); }
.people__loc-pill.is-active {
  background: var(--hf-ink); color: var(--hf-bg);
  border-color: var(--hf-ink);
}
.people__empty-loc { font-size: 13px; color: var(--hf-ink-2); }

/* Actions row */
.people__actions-row {
  display: flex; gap: 8px;
  margin-bottom: 16px;
}

/* Editor */
.people__editor {
  border: 1px solid var(--hf-line);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  padding: 16px;
  margin-bottom: 20px;
}
.people__editor-head {
  display: flex; justify-content: space-between; align-items: baseline;
  margin-bottom: 10px;
}
.people__editor-title {
  font-family: var(--hf-font-display);
  font-size: 17px; font-weight: 400;
  margin: 0;
}
.people__editor-close {
  background: transparent; border: none; cursor: pointer;
  color: var(--hf-muted);
  padding: 4px;
}
.people__editor-close:hover { color: var(--hf-ink); }
.people__editor-grid {
  display: grid; grid-template-columns: repeat(2, 1fr);
  gap: 12px 16px;
}
@media (max-width: 600px) { .people__editor-grid { grid-template-columns: 1fr; } }
.people__field {
  display: flex; flex-direction: column; gap: 4px;
}
.people__channels {
  margin-top: 14px;
  display: flex; flex-direction: column; gap: 6px;
}
.people__channels-label { color: var(--hf-muted); }
.people__channels-grid { display: flex; flex-wrap: wrap; gap: 6px; }
.people__channel-chip {
  background: var(--hf-paper);
  border: 1px solid var(--hf-line-2);
  color: var(--hf-ink); cursor: pointer;
  padding: 4px 12px;
  border-radius: 999px;
  font-family: var(--hf-font-body);
  font-size: 12px;
}
.people__channel-chip:hover { border-color: var(--hf-ink-2); }
.people__channel-chip.is-active {
  background: var(--hf-ink); color: var(--hf-bg);
  border-color: var(--hf-ink);
}
.people__editor-actions {
  display: flex; justify-content: flex-end; gap: 8px;
  margin-top: 16px;
  padding-top: 12px;
  border-top: 1px dashed var(--hf-line);
}
.people__editor-error {
  margin-top: 14px;
  padding: 8px 12px;
  background: rgba(212, 87, 47, 0.06);
  border: 1px solid rgba(212, 87, 47, 0.25);
  border-radius: var(--hf-radius);
  color: var(--hf-warn);
  font-family: var(--hf-font-mono);
  font-size: 12px;
  display: flex; align-items: center; gap: 8px;
}

/* Staff rows */
.people__rows { list-style: none; margin: 0; padding: 0; }
.people__row {
  display: flex; align-items: center; justify-content: space-between;
  flex-wrap: wrap;
  gap: 16px;
  padding: 14px 0;
  border-bottom: 1px solid var(--hf-line);
}
.people__row:last-child { border-bottom: none; }
.people__row-body { flex: 1; min-width: 0; }
.people__row-name {
  font-family: var(--hf-font-body);
  font-size: 15px; font-weight: 500;
  margin: 0;
}
.people__row-meta {
  margin-top: 3px;
  font-size: 11px; color: var(--hf-muted);
  letter-spacing: 0.04em;
}
.people__row-meta span { margin-right: 4px; }
.people__row-channels {
  display: flex; gap: 6px; flex-wrap: wrap;
  margin-top: 6px;
}
.people__row-actions {
  display: flex; align-items: center; gap: 8px; flex-shrink: 0;
}
.people__row-confirm-label {
  font-size: 11px;
  color: var(--hf-warn);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  margin-right: 2px;
}
.people__row-error {
  flex-basis: 100%;
  margin-top: 6px;
  font-family: var(--hf-font-mono);
  font-size: 11px;
  color: var(--hf-warn);
  display: flex; align-items: center; gap: 6px;
}

/* States */
.people__state {
  padding: 20px;
  border: 1px dashed var(--hf-line-2);
  border-radius: var(--hf-radius);
  background: var(--hf-bg);
  text-align: center;
}
.people__state--err .people__state-msg { color: var(--hf-warn); font-family: var(--hf-font-mono); }
.people__state-msg { margin: 8px 0 12px; font-size: 13px; color: var(--hf-ink-2); }

.people__hint {
  margin-top: 28px;
  padding: 16px;
  border: 1px dashed var(--hf-line);
  border-radius: var(--hf-radius);
  text-align: center;
  color: var(--hf-muted);
}

.people__footer {
  margin-top: 48px;
  padding-top: 16px;
  border-top: 1px solid var(--hf-line);
  color: var(--hf-muted); font-size: 11px;
}
</style>
