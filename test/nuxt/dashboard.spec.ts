import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import BaseResumeUploadDialog from '~/components/base-resumes/BaseResumeUploadDialog.vue'
import DashboardPage from '~/pages/dashboard.vue'
import {
  dashboardViewModelSchema,
  type DashboardViewModel,
} from '../../shared/dashboard/view-model'
import {
  emptyDashboardViewModel,
  populatedDashboardViewModel,
} from '../fixtures/dashboard-view-model'

const { refreshMock, useDashboardMock } = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  useDashboardMock: vi.fn(),
}))

mockNuxtImport('useDashboard', () => useDashboardMock)

describe('dashboard', () => {
  beforeEach(() => {
    refreshMock.mockReset()
    refreshMock.mockResolvedValue(undefined)
    useDashboardMock.mockReset()
    useDashboardMock.mockReturnValue({
      data: ref(populatedDashboardViewModel),
      refresh: refreshMock,
      status: ref('success'),
    })
  })

  it('renders the approved sections from the endpoint view model', async () => {
    const wrapper = await mountSuspended(DashboardPage)

    expect(useDashboardMock).toHaveBeenCalledOnce()
    expect(wrapper.get('h1').text()).toBe('Welcome back.')
    expect(wrapper.text()).toContain('You have one resume ready to review.')
    expect(wrapper.text()).toContain('4 active applications')
    expect(wrapper.text()).toContain('1 interview')

    expect(wrapper.text()).toContain('Ready for review')
    expect(wrapper.text()).toContain('Working copy ready')
    expect(wrapper.text()).toContain('Senior Frontend Engineer')
    expect(wrapper.text()).toContain('Northstar Labs')

    expect(wrapper.text()).toContain('Quick actions')
    expect(wrapper.text()).toContain('Create application')
    expect(wrapper.text()).toContain('Upload base resume')
    expect(wrapper.text()).toContain('View applications')

    expect(wrapper.text()).toContain('Recent applications')
    expect(wrapper.text()).toContain('Lantern Health')
    expect(wrapper.text()).toContain('Aether Systems')
    expect(wrapper.text()).toContain('Meridian Studio')
    expect(wrapper.text()).not.toContain('Follow-up due today')

    expect(wrapper.text()).toContain('Base resumes')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Accessibility Specialist.pdf')
    expect(wrapper.text()).toContain('2 of 3 resumes')
    expect(wrapper.text()).toContain('1 resume slot available')
    expect(wrapper.text()).not.toContain('Primary')
    expect(wrapper.text()).toContain('Added Jul 20')
    expect(wrapper.text()).toContain('Slot 1')
    expect(wrapper.text()).toContain('Slot 2')
  })

  it('enables only the upload quick action while capacity remains', async () => {
    const wrapper = await mountSuspended(DashboardPage)
    const quickActions = wrapper.get(
      '[aria-labelledby="quick-actions-heading"]',
    )
    const quickActionButtons = quickActions.findAll('button')
    const findQuickAction = (label: string) =>
      quickActionButtons.find((button) => button.text().includes(label))

    expect(findQuickAction('Create application')?.attributes()).toHaveProperty(
      'disabled',
    )
    expect(
      findQuickAction('Upload base resume')?.attributes(),
    ).not.toHaveProperty('disabled')
    expect(findQuickAction('View applications')?.attributes()).toHaveProperty(
      'disabled',
    )
    expect(
      wrapper.findAll('button:disabled').map((button) => button.text()),
    ).toEqual(
      expect.arrayContaining(['Review working copy', 'Open application']),
    )
  })

  it('renders zero product data as helpful empty guidance', async () => {
    useDashboardMock.mockReturnValue({
      data: ref(emptyDashboardViewModel),
      refresh: refreshMock,
      status: ref('success'),
    })

    const wrapper = await mountSuspended(DashboardPage)

    expect(wrapper.text()).toContain("Upload a base resume when you're ready.")
    expect(wrapper.text()).toContain('Add a base resume')
    expect(wrapper.text()).toContain('No applications have been created yet.')
    expect(wrapper.text()).toContain('No base resumes have been added yet.')
    expect(wrapper.text()).toContain('3 resume slots available')
    expect(wrapper.find('[role="alert"]').exists()).toBe(false)
  })

  it('opens the same upload dialog from the quick action and resume capacity entry points', async () => {
    const wrapper = await mountSuspended(DashboardPage)
    const quickActions = wrapper.get(
      '[aria-labelledby="quick-actions-heading"]',
    )
    const quickUpload = quickActions
      .findAll('button')
      .find((button) => button.text().includes('Upload base resume'))

    await quickUpload?.trigger('click')

    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1)

    await wrapper
      .get('button[aria-label="Close upload dialog"]')
      .trigger('click')

    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)

    const baseResumes = wrapper.get('[aria-labelledby="base-resumes-heading"]')
    const capacityUpload = baseResumes
      .findAll('button')
      .find((button) => button.text().includes('Upload base resume'))

    await capacityUpload?.trigger('click')

    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1)
  })

  it('opens upload guidance from the truthful zero-resume state', async () => {
    useDashboardMock.mockReturnValue({
      data: ref(emptyDashboardViewModel),
      refresh: refreshMock,
      status: ref('success'),
    })

    const wrapper = await mountSuspended(DashboardPage)
    const guidance = wrapper.get(
      '[aria-labelledby="dashboard-attention-heading"]',
    )

    await guidance.get('button').trigger('click')

    expect(wrapper.findAll('[role="dialog"]')).toHaveLength(1)
  })

  it('refreshes dashboard product data after a confirmed upload', async () => {
    const wrapper = await mountSuspended(DashboardPage)
    const quickActions = wrapper.get(
      '[aria-labelledby="quick-actions-heading"]',
    )
    const quickUpload = quickActions
      .findAll('button')
      .find((button) => button.text().includes('Upload base resume'))

    await quickUpload?.trigger('click')
    wrapper.getComponent(BaseResumeUploadDialog).vm.$emit('uploaded', {
      activeSlot: 3,
      createdAt: '2026-07-27T18:00:00+00:00',
      id: '41572ccb-e62b-403f-a431-7c6d01a04f5b',
      originalFilename: 'Product Engineering.pdf',
    })
    await flushPromises()

    expect(refreshMock).toHaveBeenCalledOnce()
    expect(wrapper.find('[role="dialog"]').exists()).toBe(true)
  })

  it('does not expose an upload entry point at full active capacity', async () => {
    const fullDashboard: DashboardViewModel = dashboardViewModelSchema.parse({
      ...populatedDashboardViewModel,
      baseResumes: {
        ...populatedDashboardViewModel.baseResumes,
        activeCount: 3,
        countLabel: '3 of 3 resumes',
        items: [
          ...populatedDashboardViewModel.baseResumes.items,
          {
            activeSlot: 3,
            addedLabel: 'Added Jul 12',
            createdAt: '2026-07-12T18:00:00+00:00',
            filename: 'Product Engineering.pdf',
            id: '41572ccb-e62b-403f-a431-7c6d01a04f5b',
            statusLabel: 'Active',
          },
        ],
        remainingSlots: 0,
        remainingSlotsLabel: null,
      },
      quickActions: populatedDashboardViewModel.quickActions.map((action) =>
        action.id === 'upload-base-resume'
          ? {
              ...action,
              availability: 'unavailable',
              description: 'All three resume slots are in use',
            }
          : action,
      ),
    })
    useDashboardMock.mockReturnValue({
      data: ref(fullDashboard),
      refresh: refreshMock,
      status: ref('success'),
    })

    const wrapper = await mountSuspended(DashboardPage)
    const quickActions = wrapper.get(
      '[aria-labelledby="quick-actions-heading"]',
    )
    const quickUpload = quickActions
      .findAll('button')
      .find((button) => button.text().includes('Upload base resume'))
    const baseResumes = wrapper.get('[aria-labelledby="base-resumes-heading"]')

    expect(quickUpload?.attributes()).toHaveProperty('disabled')
    expect(quickUpload?.text()).toContain('All three resume slots are in use')
    expect(baseResumes.findAll('button')).toHaveLength(0)
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false)
  })
})
