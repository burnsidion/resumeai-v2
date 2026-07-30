import { mockNuxtImport, mountSuspended } from '@nuxt/test-utils/runtime'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import DashboardPage from '~/pages/dashboard.vue'
import {
  emptyDashboardViewModel,
  populatedDashboardViewModel,
} from '../fixtures/dashboard-view-model'

const { useDashboardMock } = vi.hoisted(() => ({
  useDashboardMock: vi.fn(),
}))

mockNuxtImport('useDashboard', () => useDashboardMock)

describe('dashboard', () => {
  beforeEach(() => {
    useDashboardMock.mockReset()
    useDashboardMock.mockReturnValue({
      data: ref(populatedDashboardViewModel),
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
  })

  it('keeps unwired dashboard actions semantically unavailable', async () => {
    const wrapper = await mountSuspended(DashboardPage)
    const disabledButtons = wrapper.findAll('button:disabled')
    const disabledButtonLabels = disabledButtons.map((button) => button.text())

    expect(
      disabledButtonLabels.some((label) =>
        label.includes('Create application'),
      ),
    ).toBe(true)
    expect(disabledButtonLabels).toEqual(
      expect.arrayContaining(['Review working copy', 'Open application']),
    )
    expect(
      wrapper
        .get('[aria-labelledby="quick-actions-heading"]')
        .findAll('[aria-disabled="true"]'),
    ).toHaveLength(3)
  })

  it('renders zero product data as helpful empty guidance', async () => {
    useDashboardMock.mockReturnValue({
      data: ref(emptyDashboardViewModel),
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
})
