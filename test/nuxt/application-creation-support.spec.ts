import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import ApplicationBaseResumeSelector from '~/components/applications/ApplicationBaseResumeSelector.vue'
import ApplicationReadinessPanel from '~/components/applications/ApplicationReadinessPanel.vue'
import type { BaseResumeManagementItemViewModel } from '~~/shared/base-resumes/view-model'

const resume: BaseResumeManagementItemViewModel = {
  activeSlot: 1,
  createdAt: '2026-09-01T18:00:00+00:00',
  fileSizeLabel: '482 KiB',
  filename: 'Frontend Engineering.pdf',
  id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
  sizeBytes: 493_568,
  slotLabel: 'Slot 1',
  statusLabel: 'Active',
  uploadedLabel: 'Uploaded September 1, 2026',
}

describe('application base resume selector', () => {
  it('renders active choices and emits an explicit selection', async () => {
    const wrapper = await mountSuspended(ApplicationBaseResumeSelector, {
      props: {
        disabled: false,
        items: [resume],
        modelValue: null,
        status: 'success',
      },
    })

    expect(wrapper.get('legend').text()).toContain('Base resume')
    expect(wrapper.text()).toContain('Your original PDF will never be changed')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Only active base resumes are shown')
    expect(wrapper.findAll('input[type="radio"]')).toHaveLength(2)

    await wrapper
      .get<HTMLInputElement>(`input[value="${resume.id}"]`)
      .setValue()

    expect(wrapper.emitted('update:modelValue')).toEqual([[resume.id]])
  })

  it('communicates loading, zero, and recoverable error states', async () => {
    const wrapper = await mountSuspended(ApplicationBaseResumeSelector, {
      props: {
        disabled: false,
        items: [],
        modelValue: null,
        status: 'pending',
      },
    })

    expect(wrapper.get('fieldset').attributes('aria-busy')).toBe('true')
    expect(wrapper.text()).toContain('Loading active base resumes')

    await wrapper.setProps({ status: 'success' })
    expect(wrapper.text()).toContain('No active base resumes are available')

    await wrapper.setProps({ status: 'error' })
    expect(wrapper.get('[role="alert"]').text()).toContain(
      'Base resumes are unavailable',
    )
    await wrapper.get('button').trigger('click')
    expect(wrapper.emitted('retry')).toHaveLength(1)
  })
})

describe('application readiness panel', () => {
  it('renders incomplete requirements without blocking draft creation', async () => {
    const wrapper = await mountSuspended(ApplicationReadinessPanel, {
      props: {
        readiness: {
          isReady: false,
          missingRequirements: ['job-description', 'base-resume'],
        },
      },
    })

    expect(wrapper.text()).toContain('Save now, prepare later')
    expect(wrapper.text()).toContain('Add a job description')
    expect(wrapper.text()).toContain('Choose a base resume')
    expect(wrapper.text()).toContain('optional for creation')
  })

  it('renders the ready state without implying automatic tailoring', async () => {
    const wrapper = await mountSuspended(ApplicationReadinessPanel, {
      props: {
        readiness: { isReady: true, missingRequirements: [] },
      },
    })

    expect(wrapper.text()).toContain('Ready after saving')
    expect(wrapper.text()).toContain('Job description added')
    expect(wrapper.text()).toContain('Base resume selected')
    expect(wrapper.text()).toContain('only when you explicitly request it')
  })
})
