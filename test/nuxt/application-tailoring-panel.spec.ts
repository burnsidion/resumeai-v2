import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ApplicationTailoringPanel from '~/components/applications/ApplicationTailoringPanel.vue'
import type { ApplicationTailoringRequestState } from '~/composables/useApplicationTailoring'
import type { ApplicationDetailViewModel } from '~~/shared/applications/view-model'

const application: ApplicationDetailViewModel = {
  appliedOn: null,
  company: 'Northstar Labs',
  createdAt: '2026-09-08T18:00:00.000Z',
  createdLabel: 'Sep 8, 2026',
  id: '4120cbac-ebf4-4580-8988-3fbc65ca9449',
  jobDescription: 'Build calm, accessible product experiences.',
  notes: null,
  postingUrl: null,
  readiness: {
    isReady: true,
    label: 'Ready for tailoring',
    missingRequirements: [],
  },
  role: 'Senior Frontend Engineer',
  selectedBaseResume: {
    availabilityLabel: 'Active',
    filename: 'Frontend Engineering.pdf',
    id: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
    isAvailable: true,
  },
  tailoring: { state: 'ready' },
  status: 'draft',
  statusLabel: 'Draft',
  statusTone: 'neutral',
  updatedAt: '2026-09-08T18:00:00.000Z',
  updatedLabel: 'Sep 8, 2026',
}
const wrappers: VueWrapper[] = []

const mountPanel = (
  props: Partial<{
    application: ApplicationDetailViewModel
    requestState: ApplicationTailoringRequestState
  }> = {},
) =>
  mountSuspended(ApplicationTailoringPanel, {
    props: {
      application,
      requestState: { status: 'idle' },
      ...props,
    },
  }).then((wrapper) => {
    wrappers.push(wrapper)
    return wrapper
  })

const getButton = (wrapper: VueWrapper, label: string) => {
  const button = wrapper
    .findAll('button')
    .find((candidate) => candidate.text().trim() === label)

  if (!button) {
    throw new Error(`Expected a ${label} button.`)
  }

  return button
}

describe('application tailoring panel', () => {
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('requires an explicit confirmation before requesting a working copy', async () => {
    const wrapper = await mountPanel()

    expect(wrapper.text()).toContain('Create a working copy for this role')
    expect(wrapper.emitted('start-requested')).toBeUndefined()

    await getButton(wrapper, 'Start tailoring').trigger('click')
    await flushPromises()

    expect(wrapper.text()).toContain('Create this working copy?')
    expect(wrapper.emitted('start-requested')).toBeUndefined()

    await getButton(wrapper, 'Create working copy').trigger('click')

    expect(wrapper.emitted('start-requested')).toEqual([[]])
  })

  it('offers a safe, review-details recovery when required context is absent', async () => {
    const wrapper = await mountPanel({
      application: {
        ...application,
        jobDescription: null,
        readiness: {
          isReady: false,
          label: 'Not ready for tailoring',
          missingRequirements: [
            { id: 'job-description', label: 'Add a job description' },
          ],
        },
        selectedBaseResume: null,
        tailoring: { state: 'not-ready' },
      },
    })

    expect(wrapper.text()).toContain(
      'Add a little more context before tailoring',
    )
    expect(wrapper.text()).toContain('Add a job description')
    expect(wrapper.find('button').text()).toBe('Review details')

    await getButton(wrapper, 'Review details').trigger('click')

    expect(wrapper.emitted('recovery-requested')).toEqual([['review-details']])
    expect(wrapper.emitted('start-requested')).toBeUndefined()
  })

  it('renders an accessible in-progress state without offering another start action', async () => {
    const wrapper = await mountPanel({
      requestState: {
        applicationId: application.id,
        status: 'generating',
      },
    })

    expect(wrapper.text()).toContain('Preparing your working copy')
    expect(wrapper.get('[role="status"]').text()).toContain(
      'Your original PDF will not change',
    )
    expect(wrapper.findAll('button')).toHaveLength(0)
  })

  it('renders only the mapped failure message and recovery action', async () => {
    const wrapper = await mountPanel({
      requestState: {
        applicationId: application.id,
        failure: {
          code: 'tailoring-unavailable',
          message: 'AI tailoring is temporarily unavailable. Try again.',
          recovery: 'retry',
          retryable: true,
        },
        status: 'failure',
      },
    })

    expect(wrapper.text()).toContain('AI tailoring is temporarily unavailable.')
    await getButton(wrapper, 'Try again').trigger('click')

    expect(wrapper.emitted('recovery-requested')).toEqual([['retry']])
  })
})
