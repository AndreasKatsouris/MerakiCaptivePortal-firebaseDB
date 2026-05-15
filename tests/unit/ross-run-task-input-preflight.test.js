// @vitest-environment happy-dom
import { describe, test, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'

const stubs = {
  HfCheckbox: { template: '<input type="checkbox" />' },
  HfInput:    { template: '<input class="hf-input" />' },
  HfSelect:   { template: '<select></select>' },
  HfButton:   { template: '<button><slot /></button>' },
  HfChip:     { template: '<span><slot /></span>' },
}

const { default: RossRunTaskInput } = await import(
  '../../public/js/modules/ross/v2/components/RossRunTaskInput.vue'
)

function mountIt(task, value) {
  return mount(RossRunTaskInput, {
    props: { task, value },
    global: { stubs },
  })
}

describe('RossRunTaskInput preflight (number/temperature)', () => {
  const TEMP_TASK = {
    id: 't1', title: 'Fridge temp',
    inputType: 'temperature',
    inputConfig: { min: 0, max: 5, unit: '°C', requiredNote: true },
    required: true,
  }

  test('in-range value emits commit, not preflightNote', async () => {
    const w = mountIt(TEMP_TASK, undefined)
    await w.find('input[type="number"]').setValue('3')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().commit?.[0]).toEqual([3])
    expect(w.emitted().preflightNote).toBeUndefined()
  })

  test('out-of-range with requiredNote: emits preflightNote, NOT commit', async () => {
    const w = mountIt(TEMP_TASK, undefined)
    await w.find('input[type="number"]').setValue('12')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().preflightNote?.[0]?.[0]).toMatchObject({ value: 12, reason: 'out-of-range' })
    expect(w.emitted().commit).toBeUndefined()
  })

  test('out-of-range with requiredNote=false: emits commit (server still flags but no note needed)', async () => {
    const task = {
      ...TEMP_TASK,
      inputConfig: { ...TEMP_TASK.inputConfig, requiredNote: false },
    }
    const w = mountIt(task, undefined)
    await w.find('input[type="number"]').setValue('12')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().commit?.[0]).toEqual([12])
  })

  test('plain number input behaves the same as temperature', async () => {
    const task = {
      id: 't2', title: 'Cash count',
      inputType: 'number',
      inputConfig: { min: 100, max: 10000, requiredNote: true },
    }
    const w = mountIt(task, undefined)
    await w.find('input[type="number"]').setValue('50')
    await w.find('input[type="number"]').trigger('blur')
    expect(w.emitted().preflightNote?.[0]?.[0]).toMatchObject({ value: 50 })
  })
})
