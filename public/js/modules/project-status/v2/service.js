// Project Status service. Reads the source-of-truth JSON at
// /data/project-status.json. The JSON is updated by Claude at session-end,
// alongside KNOWLEDGE BASE/PROJECT_BACKLOG.md. No RTDB; superAdmin-gated
// page so caching doesn't matter.

const SOURCE_URL = '/data/project-status.json'

export async function getProjectStatus() {
  const res = await fetch(SOURCE_URL, { cache: 'no-store' })
  if (!res.ok) {
    throw new Error(`Failed to load project status (${res.status})`)
  }
  const data = await res.json()
  return normalize(data)
}

function normalize(data) {
  const phases = Array.isArray(data.phases) ? data.phases : []
  const tasks = Array.isArray(data.tasks) ? data.tasks : []
  const done = tasks.filter(t => t.done).length
  return {
    ...data,
    phases,
    tasks,
    progress: {
      done,
      total: tasks.length,
      pct: tasks.length === 0 ? 0 : Math.round((done / tasks.length) * 100),
    },
  }
}
