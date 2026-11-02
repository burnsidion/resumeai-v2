import { mountSuspended } from '@nuxt/test-utils/runtime'
import { flushPromises } from '@vue/test-utils'
import type { VueWrapper } from '@vue/test-utils'
import { afterEach, describe, expect, it } from 'vitest'

import ApplicationWorkingCopyReview from '~/components/applications/ApplicationWorkingCopyReview.vue'
import type { ApplicationWorkingCopyActionState } from '~/composables/useApplicationWorkingCopyActions'
import type { ApplicationWorkingCopyReview as ApplicationWorkingCopyReviewModel } from '~~/shared/tailoring/review'

const review: ApplicationWorkingCopyReviewModel = {
  changes: [
    {
      changes: [
        {
          explanation: 'Emphasizes relevant accessibility work.',
          kind: 'rewritten',
        },
      ],
      sectionHeading: 'Experience',
    },
  ],
  proposal: {
    sections: [
      {
        heading: 'Experience',
        items: ['Built accessible Vue interfaces used by 20,000 customers.'],
      },
    ],
  },
  source: {
    baseResumeId: '465e390d-f7cd-4f11-ac19-80a6cf9760fb',
    filename: 'Frontend Engineering.pdf',
    sections: [{ heading: 'Experience', items: ['Built Vue interfaces.'] }],
  },
  workingCopy: {
    id: 'ba6e5132-6c68-4fa3-90ea-a8ce6d348b8e',
    revisionNumber: 1,
    state: 'awaiting_review',
    updatedAt: '2026-11-01T00:00:00.000Z',
  },
}

const wrappers: VueWrapper[] = []
const actionState: ApplicationWorkingCopyActionState = { status: 'idle' }

const mountReview = () =>
  mountSuspended(ApplicationWorkingCopyReview, {
    props: { actionState, review },
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

describe('application working-copy review', () => {
  afterEach(() => {
    wrappers.splice(0).forEach((wrapper) => wrapper.unmount())
  })

  it('clearly distinguishes the interpreted source, proposal, and material changes', async () => {
    const wrapper = await mountReview()

    expect(wrapper.text()).toContain('machine-generated working copy')
    expect(wrapper.text()).toContain('Frontend Engineering.pdf')
    expect(wrapper.text()).toContain('Built Vue interfaces.')
    expect(wrapper.text()).toContain(
      'Built accessible Vue interfaces used by 20,000 customers.',
    )
    expect(wrapper.text()).toContain('Reworded')
    expect(wrapper.text()).toContain('Emphasizes relevant accessibility work.')
    expect(wrapper.text()).not.toContain('source-block-')
  })

  it('uses an accessible mobile section selector without hiding the source-PDF action', async () => {
    const wrapper = await mountReview()

    await getButton(wrapper, 'Working copy').trigger('click')
    await flushPromises()

    expect(getButton(wrapper, 'Working copy').attributes('aria-selected')).toBe(
      'true',
    )
    expect(getButton(wrapper, 'Original PDF')).toBeDefined()

    await getButton(wrapper, 'Original PDF').trigger('click')
    expect(wrapper.emitted('source-preview-requested')).toEqual([[]])
  })

  it('requires an explicit whole-copy decision before emitting a lifecycle action', async () => {
    const wrapper = await mountReview()

    await getButton(wrapper, 'Accept working copy').trigger('click')
    expect(wrapper.text()).toContain('Accept this working copy?')
    expect(wrapper.emitted('accept-requested')).toBeUndefined()

    await getButton(wrapper, 'Accept working copy').trigger('click')
    expect(wrapper.emitted('accept-requested')).toEqual([[]])
  })

  it('keeps revision guidance local to presentation until explicitly requested', async () => {
    const wrapper = await mountReview()

    await getButton(wrapper, 'Request revision').trigger('click')
    await wrapper.get('textarea').setValue('Emphasize product impact.')
    await getButton(wrapper, 'Request revision').trigger('click')

    expect(wrapper.emitted('revision-requested')).toEqual([
      ['Emphasize product impact.'],
    ])
  })
})
