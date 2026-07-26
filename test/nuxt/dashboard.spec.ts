import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import DashboardPage from '~/pages/dashboard.vue'

describe('dashboard', () => {
  it('renders the approved sections from the typed mock view model', async () => {
    const wrapper = await mountSuspended(DashboardPage)

    expect(wrapper.get('h1').text()).toBe('Welcome back, Ian.')
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
    expect(wrapper.text()).toContain('Follow-up due today')

    expect(wrapper.text()).toContain('Base resumes')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Accessibility Specialist.pdf')
    expect(wrapper.text()).toContain('2 of 3 resumes')
    expect(wrapper.text()).toContain('1 resume slot available')
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
})
