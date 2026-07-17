import { mountSuspended } from '@nuxt/test-utils/runtime'
import { describe, expect, it } from 'vitest'

import AppShell from '~/components/AppShell.vue'

describe('application shell', () => {
  it('renders the product identity and foundation message', async () => {
    const wrapper = await mountSuspended(AppShell)

    expect(wrapper.get('header').text()).toContain('ResumAI')
    expect(wrapper.get('main h1').text()).toBe(
      'Build every application with purpose.',
    )
  })
})
